-- ──────────────────────────────────────────────────────────────────────
-- Nimbus AI — Update Pro Plan Pricing to Rp 30.000
-- Run in Supabase SQL Editor
-- Note: features column is JSONB, gunakan jsonb_build_array atau '[...]'::jsonb
-- ──────────────────────────────────────────────────────────────────────

-- Update Pro plan price + features
UPDATE plans
SET
  price_cents = 30000,
  name = 'Pro',
  features = '[
    "500 pesan per hari",
    "30 request per menit",
    "Akses semua model termasuk Claude Opus 4.7",
    "Vision support untuk semua model",
    "Context window hingga 1M tokens",
    "Real-time streaming response",
    "History tersimpan permanen",
    "Priority support"
  ]'::jsonb
WHERE id = 'pro';

-- Update Free plan features (sync dengan rate limit baru)
UPDATE plans
SET
  price_cents = 0,
  name = 'Free',
  features = '[
    "50 pesan per hari",
    "5 request per menit",
    "3 model AI (GPT 5.5, DeepSeek v4 Pro, MiniMax M2.5)",
    "Vision support via auto-preprocessor",
    "History tersimpan",
    "Real-time streaming response"
  ]'::jsonb
WHERE id = 'free';

-- Verify
SELECT id, name, price_cents, features FROM plans ORDER BY price_cents;
