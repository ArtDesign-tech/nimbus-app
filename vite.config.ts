/* eslint-disable @typescript-eslint/no-explicit-any */
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { createHash, createHmac, randomUUID } from 'node:crypto'
import { MODELS, VISION_PREPROCESSOR } from './src/lib/models'
import { RATE_LIMITS, type PlanId } from './src/lib/rateLimit'

function chatProxyPlugin(env: Record<string, string>): Plugin {
  // ── Payment config ─────────────────────────────────────────────────────
  const DOKU_ENV = (env.DOKU_ENV || 'sandbox').toLowerCase()
  const DOKU_BASE_URL = DOKU_ENV === 'production'
    ? 'https://api.doku.com'
    : 'https://api-sandbox.doku.com'
  const PRO_PRICE_IDR = 30_000
  const PAYMENTS_ENABLED = env.PAYMENTS_ENABLED === 'true'

  // ── In-memory RPM tracker ──────────────────────────────────────────────
  const rpmStore: Map<string, number[]> = new Map() // userId -> timestamps[]

  function checkRpm(userId: string, limit: number): boolean {
    const now = Date.now()
    const windowMs = 60_000 // 1 minute
    const timestamps = rpmStore.get(userId) || []
    const recent = timestamps.filter(t => now - t < windowMs)
    if (recent.length >= limit) return false
    recent.push(now)
    rpmStore.set(userId, recent)
    return true
  }

  // ── Daily quota check via Supabase ─────────────────────────────────────
  async function getDailyMessageCount(userId: string): Promise<number> {
    const supabaseUrl = env.VITE_SUPABASE_URL
    const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseKey) return 0

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayIso = today.toISOString()

    // Count messages via RPC. `todayIso` is computed before the call so the
    // function's day boundary stays explicit even if the RPC evolves later.
    void todayIso
    const res = await fetch(
      `${supabaseUrl}/rest/v1/rpc/count_user_messages_today`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ p_user_id: userId }),
      }
    )
    if (!res.ok) return 0
    const data: any = await res.json()
    return typeof data === 'number' ? data : (data?.[0]?.count ?? 0)
  }

  async function getUserPlan(userId: string): Promise<PlanId> {
    const supabaseUrl = env.VITE_SUPABASE_URL
    const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseKey) return 'free'

    const res = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions?select=plan_id&user_id=eq.${userId}`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    )
    if (!res.ok) return 'free'
    const data: any = await res.json()
    const planId = data?.[0]?.plan_id
    return (planId === 'pro' ? 'pro' : 'free') as PlanId
  }

  // ── DOKU helpers ───────────────────────────────────────────────────────
  // Timestamp ISO-8601 dengan zona UTC, tanpa milidetik (format spec DOKU).
  function dokuTimestamp(): string {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  }

  // Digest = base64(SHA256(minified body)). Body kosong → string kosong.
  function dokuDigest(body: string): string {
    if (!body) return ''
    return createHash('sha256').update(body, 'utf8').digest('base64')
  }

  /**
   * Build DOKU signature header value.
   * String-to-sign:
   *   Client-Id:<clientId>
   *   Request-Id:<requestId>
   *   Request-Timestamp:<timestamp>
   *   Request-Target:<targetPath>
   *   Digest:<digest>            ← only when body present
   */
  function dokuSignature(opts: {
    clientId: string
    requestId: string
    timestamp: string
    targetPath: string
    digest: string
    secretKey: string
  }): string {
    const lines = [
      `Client-Id:${opts.clientId}`,
      `Request-Id:${opts.requestId}`,
      `Request-Timestamp:${opts.timestamp}`,
      `Request-Target:${opts.targetPath}`,
    ]
    if (opts.digest) lines.push(`Digest:${opts.digest}`)
    const stringToSign = lines.join('\n')
    const hmac = createHmac('sha256', opts.secretKey).update(stringToSign, 'utf8').digest('base64')
    return `HMACSHA256=${hmac}`
  }

  function shortInvoiceId(): string {
    // Invoice DOKU max 64 char alfanum. Format: NIMBUS-<yyyymmdd>-<uuid8>
    const d = new Date()
    const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`
    const uid = randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()
    return `NIMBUS-${ymd}-${uid}`
  }

  /** Create DOKU Checkout payment session. Returns { url, invoiceNumber, sessionId, expiry }. */
  async function dokuCreatePayment(opts: { userId: string; amount: number }): Promise<{
    url: string
    invoiceNumber: string
    sessionId: string
    expiredDate: string
  }> {
    const clientId = env.DOKU_CLIENT_ID
    const secretKey = env.DOKU_SECRET_KEY
    if (!clientId || !secretKey) throw new Error('DOKU_CLIENT_ID atau DOKU_SECRET_KEY belum diset')

    const invoiceNumber = shortInvoiceId()
    const targetPath = '/checkout/v1/payment'
    const requestId = randomUUID()
    const timestamp = dokuTimestamp()

    // Tempel invoice ke return URL supaya halaman /billing/return tahu trxId
    // walau sessionStorage hilang (mis. user buka di tab baru).
    const baseReturn = env.DOKU_RETURN_URL || 'http://localhost:5173/billing/return'
    const callbackUrl = baseReturn + (baseReturn.includes('?') ? '&' : '?') + `invoice_number=${encodeURIComponent(invoiceNumber)}`

    const bodyObj: any = {
      order: {
        amount: opts.amount,
        invoice_number: invoiceNumber,
        currency: 'IDR',
        callback_url: callbackUrl,
      },
      payment: {
        payment_due_date: 60, // minutes
      },
      customer: {
        id: opts.userId,
      },
    }
    const body = JSON.stringify(bodyObj)
    const digest = dokuDigest(body)
    const signature = dokuSignature({ clientId, requestId, timestamp, targetPath, digest, secretKey })

    const res = await fetch(`${DOKU_BASE_URL}${targetPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Client-Id': clientId,
        'Request-Id': requestId,
        'Request-Timestamp': timestamp,
        'Signature': signature,
      },
      body,
    })

    const data: any = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = data?.error?.message || JSON.stringify(data)
      throw new Error(`DOKU error ${res.status}: ${msg}`)
    }

    const url = data?.response?.payment?.url
    const sessionId = data?.response?.order?.session_id
    const expiredDate = data?.response?.payment?.expired_date || ''
    if (!url || !sessionId) throw new Error(`DOKU response invalid: ${JSON.stringify(data)}`)

    return { url, invoiceNumber, sessionId, expiredDate }
  }

  /** Verify webhook signature from DOKU notification. Returns true if valid. */
  function dokuVerifyNotification(opts: {
    clientId: string
    requestId: string
    timestamp: string
    signature: string
    rawBody: string
  }): boolean {
    const secretKey = env.DOKU_SECRET_KEY
    if (!secretKey) return false
    if (opts.clientId !== env.DOKU_CLIENT_ID) return false

    // Notification target path is the configured webhook path; DOKU includes it as Request-Target.
    // We accept any reasonable target — verification must match what DOKU signed.
    const targetPath = new URL(env.DOKU_NOTIFICATION_URL || 'http://localhost/api/payment/notify').pathname
    const digest = dokuDigest(opts.rawBody)
    const expected = dokuSignature({
      clientId: opts.clientId,
      requestId: opts.requestId,
      timestamp: opts.timestamp,
      targetPath,
      digest,
      secretKey,
    })
    return expected === opts.signature
  }

  /**
   * Check transaction status via DOKU API. Used as fallback for dev environments
   * where the notification webhook can't reach localhost. Returns null on error.
   */
  async function dokuCheckStatus(invoiceNumber: string): Promise<string | null> {
    const clientId = env.DOKU_CLIENT_ID
    const secretKey = env.DOKU_SECRET_KEY
    if (!clientId || !secretKey) return null

    const targetPath = `/orders/v1/status/${encodeURIComponent(invoiceNumber)}`
    const requestId = randomUUID()
    const timestamp = dokuTimestamp()
    const signature = dokuSignature({
      clientId, requestId, timestamp, targetPath, digest: '', secretKey,
    })

    try {
      const res = await fetch(`${DOKU_BASE_URL}${targetPath}`, {
        method: 'GET',
        headers: {
          'Client-Id': clientId,
          'Request-Id': requestId,
          'Request-Timestamp': timestamp,
          'Signature': signature,
        },
      })
      if (!res.ok) return null
      const data: any = await res.json().catch(() => null)
      // DOKU response format may vary; try common locations.
      const status = data?.transaction?.status
        || data?.response?.transaction?.status
        || data?.order?.status
        || data?.response?.order?.status
      return status ? String(status).toUpperCase() : null
    } catch {
      return null
    }
  }

  // ── Supabase: upgrade user plan to Pro ─────────────────────────────────
  async function upgradeUserToPro(userId: string): Promise<boolean> {
    const supabaseUrl = env.VITE_SUPABASE_URL
    const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseKey) return false

    const now = new Date()
    const periodEnd = new Date(now)
    periodEnd.setMonth(periodEnd.getMonth() + 1) // +1 month

    // Upsert subscription record
    const res = await fetch(`${supabaseUrl}/rest/v1/subscriptions?on_conflict=user_id`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        user_id: userId,
        plan_id: 'pro',
        status: 'active',
        current_period_end: periodEnd.toISOString(),
      }),
    })
    return res.ok
  }

  // ── Supabase: track topup transaction ──────────────────────────────────
  async function recordTopup(opts: {
    userId: string
    trxId: string
    amount: number
    status: string
    sessionId?: string
  }): Promise<void> {
    const supabaseUrl = env.VITE_SUPABASE_URL
    const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseKey) return

    await fetch(`${supabaseUrl}/rest/v1/topup_transactions?on_conflict=trx_id`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        user_id: opts.userId,
        trx_id: opts.trxId,
        amount: opts.amount,
        status: opts.status,
        provider: 'doku',
        session_id: opts.sessionId || null,
        updated_at: new Date().toISOString(),
      }),
    })
  }

  /** Lookup topup row by trxId (invoice number). Returns userId, amount, status. */
  async function lookupTopup(trxId: string): Promise<{ userId: string; amount: number; status: string } | null> {
    const supabaseUrl = env.VITE_SUPABASE_URL
    const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseKey) return null

    const res = await fetch(
      `${supabaseUrl}/rest/v1/topup_transactions?select=user_id,amount,status&trx_id=eq.${encodeURIComponent(trxId)}`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    )
    if (!res.ok) return null
    const rows: any = await res.json()
    if (!rows?.[0]) return null
    return { userId: rows[0].user_id, amount: rows[0].amount, status: rows[0].status }
  }
  /**
   * Estimate token count for a message.
   * Uses ~4 chars per token heuristic (good enough for truncation decisions).
   * Images are estimated at 765 tokens each (OpenAI high-detail tile).
   */
  function estimateTokens(content: any): number {
    if (typeof content === 'string') {
      return Math.ceil(content.length / 4)
    }
    if (Array.isArray(content)) {
      let tokens = 0
      for (const part of content) {
        if (part.type === 'text') tokens += Math.ceil((part.text || '').length / 4)
        else if (part.type === 'image_url') tokens += 765
      }
      return tokens
    }
    return 0
  }

  /**
   * Truncate messages to fit within maxTokens.
   * Strategy: always keep the last (most recent) message, then fill from newest to oldest.
   */
  function truncateMessages(messages: any[], maxTokens: number): any[] {
    const budget = Math.floor(maxTokens * 0.85)
    const sized = messages.map((msg, i) => ({
      msg,
      index: i,
      tokens: estimateTokens(msg.content) + 4,
    }))
    const totalTokens = sized.reduce((sum, s) => sum + s.tokens, 0)
    if (totalTokens <= budget) return messages

    const result: any[] = []
    let used = sized[sized.length - 1].tokens
    result.push(sized[sized.length - 1])

    for (let i = sized.length - 2; i >= 0; i--) {
      if (used + sized[i].tokens > budget) break
      used += sized[i].tokens
      result.push(sized[i])
    }

    result.sort((a, b) => a.index - b.index)
    return result.map(r => r.msg)
  }

  /** Check if a message contains image content */
  function hasImages(msg: any): boolean {
    if (!Array.isArray(msg.content)) return false
    return msg.content.some((p: any) => p.type === 'image_url')
  }

  /** Call Nemotron vision model to describe an image */
  async function describeImage(imageUrl: string): Promise<string> {
    const baseUrl = (env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '')
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
    }
    if (env.OPENROUTER_REFERER) headers['HTTP-Referer'] = env.OPENROUTER_REFERER
    if (env.OPENROUTER_TITLE) headers['X-Title'] = env.OPENROUTER_TITLE

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: VISION_PREPROCESSOR.upstreamId,
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imageUrl } },
            { type: 'text', text: 'Deskripsikan gambar ini secara detail dan lengkap. Jika ada teks, sertakan teksnya. Jika ada diagram/tabel, jelaskan strukturnya.' },
          ],
        }],
        temperature: 0.3,
        stream: false,
      }),
    })

    const data: any = await res.json()
    if (!res.ok) return '[Gagal menganalisis gambar]'
    return data?.choices?.[0]?.message?.content || '[Tidak ada deskripsi]'
  }

  /**
   * Convert image content to text descriptions for non-vision models.
   * Processes all messages that contain images.
   */
  async function preprocessImages(messages: any[]): Promise<any[]> {
    const processed = []
    for (const msg of messages) {
      if (!hasImages(msg)) {
        processed.push(msg)
        continue
      }

      // Process multimodal content: replace images with descriptions
      const newParts: any[] = []
      for (const part of msg.content) {
        if (part.type === 'image_url') {
          const url = part.image_url?.url || ''
          const description = await describeImage(url)
          newParts.push({ type: 'text', text: `[Gambar: ${description}]` })
        } else {
          newParts.push(part)
        }
      }

      // Flatten to single text string
      const combinedText = newParts.map((p: any) => p.text || '').join('\n')
      processed.push({ role: msg.role, content: combinedText })
    }
    return processed
  }

  return {
    name: 'nimbus-chat-proxy',
    configureServer(server) {
      // ── POST /api/payment/create-checkout ──────────────────────────────
      // Buat sesi DOKU Checkout, balas { url, invoiceNumber } untuk redirect.
      server.middlewares.use('/api/payment/create-checkout', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }
        if (!PAYMENTS_ENABLED) {
          res.statusCode = 503
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({
            error: 'payments_disabled',
            message: 'Pembayaran sedang tidak aktif. Set PAYMENTS_ENABLED=true di .env.',
          }))
          return
        }
        try {
          let raw = ''
          for await (const chunk of req) raw += chunk
          const body = raw ? JSON.parse(raw) : {}
          const userId = body.userId
          if (!userId) {
            res.statusCode = 400
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: 'userId wajib' }))
            return
          }

          const result = await dokuCreatePayment({ userId, amount: PRO_PRICE_IDR })
          await recordTopup({
            userId,
            trxId: result.invoiceNumber,
            amount: PRO_PRICE_IDR,
            status: 'PENDING',
            sessionId: result.sessionId,
          })

          res.statusCode = 200
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({
            url: result.url,
            invoiceNumber: result.invoiceNumber,
            sessionId: result.sessionId,
            expiredDate: result.expiredDate,
          }))
        } catch (err: any) {
          res.statusCode = 500
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: String(err?.message || err) }))
        }
      })

      // ── GET /api/payment/check-status?trxId=...&userId=... ─────────────
      // Polling status. Cek Supabase dulu (di-update via webhook). Kalau masih
      // PENDING, query DOKU langsung — fallback untuk dev tanpa webhook publik.
      server.middlewares.use('/api/payment/check-status', async (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }
        try {
          const url = new URL(req.url || '', 'http://localhost')
          const trxId = url.searchParams.get('trxId')
          const userId = url.searchParams.get('userId')
          if (!trxId || !userId) {
            res.statusCode = 400
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: 'trxId dan userId wajib' }))
            return
          }

          const row = await lookupTopup(trxId)
          if (!row || row.userId !== userId) {
            res.statusCode = 404
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: 'Transaksi tidak ditemukan' }))
            return
          }

          let status = row.status
          // Jika belum final, query DOKU. Bermanfaat saat webhook tidak terkonfigurasi.
          if (status === 'PENDING') {
            const remote = await dokuCheckStatus(trxId)
            if (remote && remote !== 'PENDING') {
              status = remote
              await recordTopup({ userId, trxId, amount: row.amount, status })
              if (status === 'SUCCESS') {
                await upgradeUserToPro(userId)
              }
            }
          }

          res.statusCode = 200
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ status, trxId }))
        } catch (err: any) {
          res.statusCode = 500
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: String(err?.message || err) }))
        }
      })

      // ── POST /api/payment/notify (DOKU webhook) ────────────────────────
      // Verifikasi signature, update status di Supabase, upgrade plan kalau SUCCESS.
      server.middlewares.use('/api/payment/notify', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }
        try {
          let raw = ''
          for await (const chunk of req) raw += chunk

          const clientId = String(req.headers['client-id'] || '')
          const requestId = String(req.headers['request-id'] || '')
          const timestamp = String(req.headers['request-timestamp'] || '')
          const signature = String(req.headers['signature'] || '')

          const valid = dokuVerifyNotification({ clientId, requestId, timestamp, signature, rawBody: raw })
          if (!valid) {
            res.statusCode = 401
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: 'Invalid signature' }))
            return
          }

          const body: any = raw ? JSON.parse(raw) : {}
          const invoiceNumber = body?.order?.invoice_number
          const amount = Number(body?.order?.amount || 0)
          const transactionStatus = String(body?.transaction?.status || '').toUpperCase()
          if (!invoiceNumber) {
            res.statusCode = 400
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: 'invoice_number missing' }))
            return
          }

          const row = await lookupTopup(invoiceNumber)
          if (!row) {
            res.statusCode = 404
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: 'Transaction not found' }))
            return
          }

          await recordTopup({
            userId: row.userId,
            trxId: invoiceNumber,
            amount: amount || row.amount,
            status: transactionStatus,
          })

          if (transactionStatus === 'SUCCESS') {
            await upgradeUserToPro(row.userId)
          }

          res.statusCode = 200
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ message: 'OK' }))
        } catch (err: any) {
          res.statusCode = 500
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: String(err?.message || err) }))
        }
      })

      server.middlewares.use('/api/chat', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        let raw = ''
        for await (const chunk of req) raw += chunk

        let body: any
        try {
          body = raw ? JSON.parse(raw) : {}
        } catch {
          res.statusCode = 400
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: 'JSON tidak valid' }))
          return
        }

        const requestedId = String(body.model || '')
        const model = MODELS.find((m) => m.id === requestedId)
        if (!model) {
          res.statusCode = 400
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: `Model tidak dikenal: ${requestedId}` }))
          return
        }

        const messages = Array.isArray(body.messages) ? body.messages : []
        if (!messages.length) {
          res.statusCode = 400
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: 'messages tidak boleh kosong' }))
          return
        }

        // ── Rate limit check ───────────────────────────────────────────────
        const userId = body.userId
        if (userId) {
          const plan = await getUserPlan(userId)
          const limits = RATE_LIMITS[plan]

          // Check RPM
          if (!checkRpm(userId, limits.rpm)) {
            res.statusCode = 429
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({
              error: `Terlalu cepat. Maksimal ${limits.rpm} pesan per menit untuk plan ${plan}.`,
              code: 'RPM_EXCEEDED',
            }))
            return
          }

          // Check daily quota
          const dailyCount = await getDailyMessageCount(userId)
          if (dailyCount >= limits.dailyQuota) {
            res.statusCode = 429
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({
              error: `Kuota harian habis (${limits.dailyQuota} pesan/hari). Upgrade ke Pro untuk lebih banyak.`,
              code: 'DAILY_QUOTA_EXCEEDED',
            }))
            return
          }
        }

        // Truncate messages to fit model's context window
        // If model doesn't support vision, preprocess images first
        let processedMessages = messages
        if (!model.supportsVision && messages.some((m: any) => hasImages(m))) {
          processedMessages = await preprocessImages(messages)
        }
        const truncatedMessages = truncateMessages(processedMessages, model.maxContextTokens)

        let upstreamUrl = ''
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }

        if (model.gateway === 'tunnel') {
          const baseUrl = (env.TUNNEL_BASE_URL || '').replace(/\/$/, '')
          if (!baseUrl) {
            res.statusCode = 400
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: 'TUNNEL_BASE_URL belum diset' }))
            return
          }
          upstreamUrl = `${baseUrl}/chat/completions`
          if (env.TUNNEL_API_KEY) {
            headers.Authorization = `Bearer ${env.TUNNEL_API_KEY}`
            headers['x-api-key'] = env.TUNNEL_API_KEY
          }
        } else if (model.gateway === 'openrouter') {
          const baseUrl = (env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '')
          if (!env.OPENROUTER_API_KEY) {
            res.statusCode = 400
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: 'OPENROUTER_API_KEY belum diset' }))
            return
          }
          upstreamUrl = `${baseUrl}/chat/completions`
          headers.Authorization = `Bearer ${env.OPENROUTER_API_KEY}`
          if (env.OPENROUTER_REFERER) headers['HTTP-Referer'] = env.OPENROUTER_REFERER
          if (env.OPENROUTER_TITLE) headers['X-Title'] = env.OPENROUTER_TITLE
        }

        // Coba upstream id utama; kalau gagal sebelum streaming dimulai dan
        // model punya fallback, retry dengan id cadangan (gateway sama).
        const candidates = model.fallbackUpstreamId
          ? [model.upstreamId, model.fallbackUpstreamId]
          : [model.upstreamId]

        let upstream: Response | null = null
        let lastErrorDetail: any = null
        let lastStatus = 502
        let usedUpstreamId = candidates[0]

        for (let i = 0; i < candidates.length; i++) {
          const candidate = candidates[i]
          try {
            const r = await fetch(upstreamUrl, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                model: candidate,
                messages: truncatedMessages,
                temperature: typeof body.temperature === 'number' ? body.temperature : 0.7,
                stream: true,
              }),
            })

            if (r.ok) {
              upstream = r
              usedUpstreamId = candidate
              if (i > 0) console.log(`[chat] fallback used: ${model.id} → ${candidate}`)
              break
            }

            // Non-OK: simpan error detail, lanjut ke kandidat berikutnya kalau ada.
            const text = await r.text()
            try { lastErrorDetail = JSON.parse(text) } catch { lastErrorDetail = { raw: text } }
            lastStatus = r.status
            console.warn(`[chat] upstream ${candidate} returned ${r.status}; trying next candidate if any`)
          } catch (err: any) {
            lastErrorDetail = { message: String(err?.message || err) }
            lastStatus = 502
            console.warn(`[chat] upstream ${candidate} threw: ${lastErrorDetail.message}`)
          }
        }

        if (!upstream) {
          res.statusCode = lastStatus
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: 'Gateway error', gateway: model.gateway, detail: lastErrorDetail }))
          return
        }

        try {
          // Stream SSE to client
          res.statusCode = 200
          res.setHeader('content-type', 'text/event-stream')
          res.setHeader('cache-control', 'no-cache')
          res.setHeader('connection', 'keep-alive')

          const reader = upstream.body?.getReader()
          if (!reader) {
            res.end('data: [DONE]\n\n')
            return
          }

          const decoder = new TextDecoder()
          let fullReply = ''

          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            const chunk = decoder.decode(value, { stream: true })
            // Parse SSE lines to accumulate full reply
            const lines = chunk.split('\n')
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const payload = line.slice(6).trim()
                if (payload === '[DONE]') continue
                try {
                  const parsed = JSON.parse(payload)
                  const delta = parsed?.choices?.[0]?.delta?.content || ''
                  if (delta) fullReply += delta
                } catch { /* skip malformed */ }
              }
            }
            // Forward raw SSE chunk to client
            res.write(chunk)
          }

          // Send final metadata event
          res.write(`data: ${JSON.stringify({ nimbus_done: true, model: model.id, gateway: model.gateway, upstreamId: usedUpstreamId, fullReply })}\n\n`)
          res.end('data: [DONE]\n\n')
        } catch (err: any) {
          res.statusCode = 502
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: 'Upstream fetch failed', detail: String(err?.message || err) }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      react(),
      babel({ presets: [reactCompilerPreset()] }),
      chatProxyPlugin(env),
    ],
  }
})
