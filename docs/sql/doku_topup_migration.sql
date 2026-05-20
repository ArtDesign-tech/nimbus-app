-- ──────────────────────────────────────────────────────────────────────
-- Nimbus AI — Migrasi topup_transactions untuk DOKU
-- Run di Supabase SQL Editor
-- ──────────────────────────────────────────────────────────────────────

-- Pastikan tabel topup_transactions ada dengan kolom yang dibutuhkan.
CREATE TABLE IF NOT EXISTS public.topup_transactions (
  trx_id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  provider text NOT NULL DEFAULT 'doku',
  session_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Tambah kolom session_id kalau tabel sudah ada dari schema lama (FR3).
ALTER TABLE public.topup_transactions
  ADD COLUMN IF NOT EXISTS session_id text;

-- Provider default ke 'doku' (kalau sebelumnya 'fr3newera').
ALTER TABLE public.topup_transactions
  ALTER COLUMN provider SET DEFAULT 'doku';

-- Index untuk lookup cepat per user.
CREATE INDEX IF NOT EXISTS topup_transactions_user_id_idx
  ON public.topup_transactions(user_id, created_at DESC);

-- RLS: user hanya boleh baca transaksi miliknya sendiri.
ALTER TABLE public.topup_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user reads own topups" ON public.topup_transactions;
CREATE POLICY "user reads own topups"
  ON public.topup_transactions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Backend service-role (lewat SUPABASE_SERVICE_ROLE_KEY) tetap bisa write
-- karena bypass RLS. Tidak perlu policy INSERT/UPDATE untuk anon/authenticated.

-- Verify
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'topup_transactions'
ORDER BY ordinal_position;
