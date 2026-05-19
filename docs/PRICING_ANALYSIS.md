# Nimbus AI — Analisis Pricing & Plan Benefits

**Tanggal:** 19 Mei 2026
**Status:** MVP — Free & Pro plan aktif, Team plan deferred (contact-only)

---

## 1. Ringkasan Eksekutif

Nimbus saat ini menjalankan model bisnis freemium dua-tier dengan harga Pro Rp 30.000/bulan. Pricing ini ditentukan untuk menyeimbangkan akuisisi cepat di pasar Indonesia dengan margin yang sustainable terhadap cost upstream (FR3 NEWERA fee + token cost).

### Snapshot Plan

| Plan | Harga | Daily Quota | RPM | Model Access |
|------|-------|-------------|-----|--------------|
| **Free** | Rp 0 | 50 pesan/hari | 5/menit | 3 model (GPT 5.5, DeepSeek v4 Pro, MiniMax M2.5) |
| **Pro** | Rp 30.000/bulan | 500 pesan/hari | 30/menit | 4 model (semua, termasuk Claude Opus 4.7) |
| **Team** | TBD (Hubungi Admin) | TBD | TBD | TBD |

---

## 2. Detail Plan & Benefits

### 🆓 Free Plan — Rp 0/bulan

**Target user:** Pengguna kasual, mahasiswa, exploration users yang ingin coba AI chat.

**Kuota:**
- 50 pesan per hari (reset tengah malam UTC)
- 5 request per menit (RPM)
- Total kapasitas teoretis: ~1.500 pesan/bulan

**Model yang tersedia:**

| Model | Vision | Context Window | Use Case |
|-------|--------|---------------|----------|
| GPT 5.5 | ✅ Ya | 128k tokens | General chat, vision tasks |
| DeepSeek v4 Pro | ❌ Tidak | 1M tokens | Long documents, reasoning |
| MiniMax M2.5 | ❌ Tidak | 128k tokens | Alternative reasoning |

**Fitur yang didapat:**
- Chat real-time streaming (SSE)
- Vision input untuk gambar (di-handle automatis via NVIDIA Nemotron preprocessor untuk model non-vision)
- Conversation history tersimpan di Supabase
- Multi-model switching dalam satu conversation
- Light/dark mode
- Auto-truncation history ketika melebihi context window

**Limitasi:**
- Tidak ada akses ke Claude Opus 4.7 (model premium)
- Quota harian terbatas
- RPM rendah (cocok untuk casual use, kurang untuk power users)

---

### ⚡ Pro Plan — Rp 30.000/bulan

**Target user:** Power users, professional, content creator, developer yang butuh akses model terbaik dan kuota tinggi.

**Kuota:**
- 500 pesan per hari (10x lipat Free)
- 30 request per menit (6x lipat Free)
- Total kapasitas teoretis: ~15.000 pesan/bulan

**Model yang tersedia:** Semua model Free **+** Claude Opus 4.7

| Model | Vision | Context Window | Highlight |
|-------|--------|---------------|-----------|
| GPT 5.5 | ✅ | 128k | Versatile general-purpose |
| **Claude Opus 4.7** | ✅ | **200k** | **Premium reasoning, coding, writing** |
| DeepSeek v4 Pro | ❌ | 1M | Massive context, document analysis |
| MiniMax M2.5 | ❌ | 128k | Alternative perspective |

**Benefit eksklusif:**
- ✅ Akses Claude Opus 4.7 (model premium dengan context 200k & vision native)
- ✅ Quota harian 10x lipat
- ✅ RPM 6x lipat untuk usage burst-friendly
- ✅ Semua fitur Free
- 💰 Harga sangat kompetitif (Rp 30k = ~$1.95 USD, jauh di bawah ChatGPT/Claude $20)

**Pembayaran:**
- One-time topup via QRIS (FR3 NEWERA gateway)
- Berlaku 1 bulan dari tanggal pembayaran
- Manual renewal (tidak otomatis recurring)

---

### 👥 Team Plan — Coming Soon

**Status:** Deferred sesuai MVP convention. Ditampilkan di UI sebagai "Hubungi Admin".

**Estimasi fitur (untuk roadmap):**
- Workspace bersama untuk tim
- Shared conversations
- Member management (invite, role)
- Centralized billing
- Quota pooled atau per-member
- Priority support

**Catatan:** Tidak diimplementasikan di MVP saat ini. Penambahan Team plan butuh re-enable workspace/team/members feature yang saat ini disabled.

---

## 3. Analisis Pricing — Posisi Kompetitif

### Perbandingan dengan Kompetitor (Pro/Plus tier)

| Layanan | Harga/bulan | Daily Quota | Model Premium |
|---------|-------------|-------------|---------------|
| **Nimbus Pro** | **Rp 30.000** (~$1.95) | 500 pesan | Claude Opus 4.7, GPT 5.5 |
| ChatGPT Plus | $20 (~Rp 320.000) | 80 GPT-5/3jam | GPT-5, image gen |
| Claude Pro | $20 (~Rp 320.000) | 5x free | Claude Opus, Sonnet |
| Perplexity Pro | $20 (~Rp 320.000) | 300/hari | GPT-4o, Claude, Sonar |
| You.com Pro | $20 (~Rp 320.000) | Unlimited | Multi-model |
| Poe (Quora) | $20 (~Rp 320.000) | Compute points | Multi-model |

**Posisi Nimbus:** Disrupt market dengan harga **~10x lebih murah** dari kompetitor global. Cocok untuk pasar Indonesia di mana willingness-to-pay untuk SaaS AI masih dalam range Rp 30-65k/bulan (sebanding dengan Spotify, YouTube Premium, Netflix Mobile).

### Analisis Margin (Estimasi)

**Asumsi:**
- Rata-rata user Pro pakai 200 pesan/bulan (40% dari quota)
- Rata-rata 1 pesan = 1.500 tokens (input + output)
- Total tokens/user/bulan = 300.000 tokens

**Estimasi cost upstream per user/bulan:**

| Model Mix | Cost per 1M token | Total |
|-----------|-------------------|-------|
| GPT 5.5 (40%) — via tunnel | ~Rp 30.000-50.000 | Rp 4.000-6.000 |
| Claude Opus (30%) — via tunnel | ~Rp 80.000-150.000 | Rp 7.000-13.000 |
| DeepSeek v4 Pro (20%) — via tunnel | ~Rp 5.000-15.000 | Rp 300-900 |
| MiniMax (10%) — OpenRouter | ~Rp 10.000-30.000 | Rp 300-900 |
| **Total estimasi** | | **Rp 11.000-21.000** |

**Plus:**
- FR3 NEWERA fee: ~Rp 3-5 per transaksi (negligible)
- Supabase: gratis di free tier hingga 500MB
- Hosting Vercel/Netlify: gratis untuk small scale

**Conclusion margin:**
- Worst case (heavy Claude Opus user): **margin ~Rp 9.000-19.000/user** (sehat)
- Best case (low usage user, mostly DeepSeek/MiniMax): **margin Rp 24.000-29.000/user** (sangat sehat)

✅ **Sustainability:** Dengan harga Rp 30k, margin tetap positif bahkan untuk user heavy. Ini ruang fiskal untuk ekspansi (marketing, infra, model premium baru).

⚠️ **Tetap perlu monitoring:** Jika user heavy abuse Claude Opus secara ekstrim (misal 500 pesan/hari full Claude), cost bisa lebih tinggi dari estimasi. Implementasi per-model quota tetap recommended.

---

## 4. Rekomendasi & Optimasi

### A. Pricing Adjustment Options

**Opsi 1: Status Quo (Rp 30k)** ⭐ — Sweet spot pricing **(saat ini)**
- ✅ Margin sehat (Rp 9-29k per user)
- ✅ Masih ~10x lebih murah dari ChatGPT/Claude
- ✅ Sebanding dengan Spotify/YouTube Premium di mata user Indonesia
- ✅ Anchor pricing yang fleksibel untuk diskon promo

**Opsi 2: Promo perdana Rp 19.000/bulan untuk early adopter**
- ✅ Akuisisi awal lebih cepat
- ✅ Bisa lock-in untuk 100-500 user pertama
- ⚠️ Setelah promo habis, naikkan ke Rp 30k normal

**Opsi 3: Annual plan dengan diskon**
- Rp 300.000/tahun (save Rp 60k = 17% diskon)
- ✅ Cash flow lebih predictable
- ✅ Reduce churn

**Opsi 4: Tier-based Pro (Pro Lite & Pro)**
- Pro Lite Rp 19k: tanpa Claude Opus, quota 200/hari
- Pro Rp 30k: full akses, quota 500/hari
- ✅ Capture casual + power user
- ⚠️ Kompleksitas tambahan

### B. Cost Control Measures (Recommended)

1. **Per-model quota dalam Pro plan**
   - Misal: Claude Opus max 100 pesan/hari, model lain unlimited dalam total quota
   - Prevent abuse model termahal

2. **Token-based quota (alternatif daily message)**
   - Hitung pakai estimated tokens, bukan jumlah pesan
   - Lebih fair untuk usage panjang vs pendek

3. **Rate limiting agresif untuk model premium**
   - Claude Opus: 10 RPM saja meskipun Pro
   - GPT 5.5: 30 RPM full

4. **Usage analytics dashboard untuk admin**
   - Monitor cost per user
   - Identify high-usage users untuk potential upsell

### C. Marketing & Conversion

**Free → Pro conversion drivers:**
- Hit daily quota → show upgrade modal
- Mau pakai Claude Opus → blocked, show upgrade CTA
- 70% quota terpakai → warning + upgrade hint (sudah ada di Usage page)

**Pricing page yang perlu dibuat:**
- Compare Free vs Pro side-by-side
- Highlight Claude Opus sebagai pembeda utama
- Social proof / testimonial (jika ada)
- FAQ pembayaran

---

## 5. Roadmap Pricing & Plan

### Q2 2026 (Sekarang)
- ✅ Free + Pro launch
- ✅ FR3 NEWERA QRIS payment
- ⏳ Pricing landing page (next task)

### Q3 2026
- 🔜 Per-model quota in Pro
- 🔜 Usage analytics dashboard
- 🔜 Auto-renewal recurring (jika upgrade ke Midtrans/Xendit)
- 🔜 Annual plan dengan diskon (Rp 300k/tahun = save 17%)

### Q4 2026
- 🔜 Team plan launch
- 🔜 API access (developer tier)
- 🔜 Volume discount untuk heavy users

---

## 6. Lampiran — Konfigurasi Saat Ini

**File terkait:**
- `src/lib/rateLimit.ts` — RATE_LIMITS config
- `src/lib/models.ts` — Model registry & plan access
- `src/pages/Billing.tsx` — Billing UI + payment modal
- `src/pages/Usage.tsx` — Usage dashboard
- `vite.config.ts` — Backend proxy + payment endpoints

**Environment variables:**
- `FR3_API_KEY` — Payment gateway
- `TUNNEL_API_KEY`, `TUNNEL_BASE_URL` — Tunnel gateway (GPT, Claude, DeepSeek)
- `OPENROUTER_API_KEY` — OpenRouter (MiniMax, Nemotron preprocessor)
- `SUPABASE_SERVICE_ROLE_KEY` — Backend Supabase access

**Database tables (Supabase):**
- `plans` — Plan definitions
- `subscriptions` — User subscription state
- `messages` — Chat messages (untuk daily quota count)
- `topup_transactions` — Payment tracking

---

*Dokumen ini akan diupdate seiring perubahan pricing/plan/model.*
