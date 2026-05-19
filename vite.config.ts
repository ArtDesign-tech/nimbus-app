/* eslint-disable @typescript-eslint/no-explicit-any */
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { MODELS, VISION_PREPROCESSOR } from './src/lib/models'
import { RATE_LIMITS, type PlanId } from './src/lib/rateLimit'

function chatProxyPlugin(env: Record<string, string>): Plugin {
  // ── Payment config ─────────────────────────────────────────────────────
  const FR3_BASE_URL = 'https://fr3newera.com/api/v1'
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

  // ── FR3 NEWERA: create topup (QRIS) ────────────────────────────────────
  async function fr3CreateTopup(nominal: number): Promise<any> {
    const apikey = env.FR3_API_KEY
    if (!apikey) throw new Error('FR3_API_KEY belum diset di .env')
    const res = await fetch(`${FR3_BASE_URL}/topup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apikey, nominal }),
    })
    return res.json()
  }

  async function fr3CheckStatus(trxId: string): Promise<any> {
    const apikey = env.FR3_API_KEY
    if (!apikey) throw new Error('FR3_API_KEY belum diset di .env')
    const url = `${FR3_BASE_URL}/check-status?apikey=${encodeURIComponent(apikey)}&idTransaksi=${encodeURIComponent(trxId)}`
    const res = await fetch(url)
    return res.json()
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
  async function recordTopup(userId: string, trxId: string, amount: number, status: string): Promise<void> {
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
        user_id: userId,
        trx_id: trxId,
        amount,
        status,
        provider: 'fr3newera',
        updated_at: new Date().toISOString(),
      }),
    })
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
      // ── POST /api/payment/create-topup ─────────────────────────────────
      server.middlewares.use('/api/payment/create-topup', async (req, res) => {
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
            message: 'Pembayaran otomatis sedang dalam tahap development. Untuk upgrade Pro sementara, hubungi admin.',
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

          const result = await fr3CreateTopup(PRO_PRICE_IDR)
          if (result?.status !== 200 || !result?.data?.trxId) {
            res.statusCode = 502
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: 'Gagal membuat topup', detail: result }))
            return
          }

          // Record initial PENDING transaction
          await recordTopup(userId, result.data.trxId, PRO_PRICE_IDR, 'PENDING')

          res.statusCode = 200
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({
            trxId: result.data.trxId,
            qrString: result.data.qr_string,
            totalTransfer: result.data.totalTransfer,
            uniqueCode: result.data.uniqueCode,
            expiry: result.data.expiry,
          }))
        } catch (err: any) {
          res.statusCode = 500
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: String(err?.message || err) }))
        }
      })

      // ── GET /api/payment/check-status?trxId=...&userId=... ─────────────
      server.middlewares.use('/api/payment/check-status', async (req, res) => {
        if (req.method !== 'GET') {
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
            message: 'Payment status checking is disabled while payments are in development.',
          }))
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

          const result = await fr3CheckStatus(trxId)
          const status = result?.data?.status || 'UNKNOWN'

          // Update transaction record
          await recordTopup(userId, trxId, result?.data?.amount || PRO_PRICE_IDR, status)

          // If success, upgrade plan
          let upgraded = false
          if (status === 'SUCCESS') {
            upgraded = await upgradeUserToPro(userId)
          }

          res.statusCode = 200
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ status, upgraded, trxId }))
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

        try {
          const upstream = await fetch(upstreamUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              model: model.upstreamId,
              messages: truncatedMessages,
              temperature: typeof body.temperature === 'number' ? body.temperature : 0.7,
              stream: true,
            }),
          })

          if (!upstream.ok) {
            const text = await upstream.text()
            let data: any
            try { data = JSON.parse(text) } catch { data = { raw: text } }
            res.statusCode = upstream.status
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: 'Gateway error', gateway: model.gateway, detail: data }))
            return
          }

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
          res.write(`data: ${JSON.stringify({ nimbus_done: true, model: model.id, gateway: model.gateway, fullReply })}\n\n`)
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
