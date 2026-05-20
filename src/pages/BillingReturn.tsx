import { useEffect, useState, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { CheckCircle, Loader2, XCircle, ArrowLeft } from 'lucide-react';
import '../styles/billing.css';

type Status = 'CHECKING' | 'SUCCESS' | 'PENDING' | 'FAILED' | 'EXPIRED' | 'NOT_FOUND';

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_DURATION_MS = 5 * 60 * 1000; // 5 menit

export default function BillingReturn() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<Status>('CHECKING');
  const [trxId, setTrxId] = useState<string | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    // DOKU bisa redirect dengan ?invoice_number atau ?order_id; fallback sessionStorage.
    const fromQuery = searchParams.get('invoice_number') || searchParams.get('order_id');
    let fromStorage: string | null = null;
    try { fromStorage = sessionStorage.getItem('nimbus_pending_trx'); } catch { /* ignore */ }
    const initialTrx = fromQuery || fromStorage;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (cancelled) return;
      if (!session) {
        navigate('/login');
        return;
      }
      const userId = session.user.id;

      // Kalau gak ada trxId di URL/storage, fallback: cari last pending topup user di Supabase.
      let trx = initialTrx;
      if (!trx) {
        try {
          const { data } = await supabase
            .from('topup_transactions')
            .select('trx_id')
            .eq('user_id', userId)
            .eq('status', 'PENDING')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (data?.trx_id) trx = data.trx_id as string;
        } catch { /* ignore */ }
      }

      if (cancelled) return;
      if (!trx) {
        setStatus('NOT_FOUND');
        return;
      }
      setTrxId(trx);

      const tick = async () => {
        if (cancelled) return;
        try {
          const res = await fetch(`/api/payment/check-status?trxId=${encodeURIComponent(trx as string)}&userId=${encodeURIComponent(userId)}`);
          const data = await res.json();
          if (res.status === 404) {
            setStatus('NOT_FOUND');
            return;
          }
          const s = String(data?.status || '').toUpperCase();
          if (s === 'SUCCESS') {
            setStatus('SUCCESS');
            try { sessionStorage.removeItem('nimbus_pending_trx'); } catch { /* ignore */ }
            return;
          }
          if (s === 'FAILED' || s === 'EXPIRED' || s === 'CANCELED' || s === 'CANCELLED') {
            setStatus(s === 'FAILED' ? 'FAILED' : 'EXPIRED');
            try { sessionStorage.removeItem('nimbus_pending_trx'); } catch { /* ignore */ }
            return;
          }
          // Masih PENDING — lanjut poll sampai timeout
          if (Date.now() - startedAtRef.current > MAX_POLL_DURATION_MS) {
            setStatus('PENDING');
            return;
          }
          setStatus('CHECKING');
          pollRef.current = window.setTimeout(tick, POLL_INTERVAL_MS);
        } catch {
          // Network glitch — coba lagi
          if (Date.now() - startedAtRef.current > MAX_POLL_DURATION_MS) {
            setStatus('PENDING');
            return;
          }
          pollRef.current = window.setTimeout(tick, POLL_INTERVAL_MS);
        }
      };
      tick();
    });

    return () => {
      cancelled = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [navigate, searchParams]);

  return (
    <div className="billing-layout">
      <div className="billing-container">
        <div className="billing-header">
          <div className="billing-back-row">
            <Link to="/billing" className="glass-back-btn">
              <ArrowLeft size={20} />
            </Link>
            <span className="billing-back-label">Kembali ke Billing</span>
          </div>
          <h1 className="billing-title">Status Pembayaran</h1>
        </div>

        <div className="billing-card" style={{ maxWidth: 480, margin: '0 auto', textAlign: 'center', padding: '2.5rem 2rem' }}>
          {status === 'CHECKING' && (
            <>
              <Loader2 size={48} className="spin" style={{ color: 'var(--accent)', margin: '0 auto 1rem' }} />
              <h3 style={{ marginBottom: '0.5rem' }}>Mengecek status pembayaran...</h3>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>
                Ini biasanya butuh beberapa detik. Jangan tutup tab.
              </p>
              {trxId && (
                <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                  Invoice: <code>{trxId}</code>
                </div>
              )}
            </>
          )}

          {status === 'SUCCESS' && (
            <>
              <CheckCircle size={48} style={{ color: '#10b981', margin: '0 auto 1rem' }} />
              <h3 style={{ marginBottom: '0.5rem' }}>Pembayaran Berhasil!</h3>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                Akun Anda telah di-upgrade ke Pro. Selamat menikmati Claude Opus 4.7 & quota 500/hari.
              </p>
              <Link to="/chat" className="btn-upgrade" style={{ display: 'inline-flex' }}>
                Mulai Chat →
              </Link>
            </>
          )}

          {status === 'PENDING' && (
            <>
              <Loader2 size={48} style={{ color: 'var(--text-dim)', margin: '0 auto 1rem' }} />
              <h3 style={{ marginBottom: '0.5rem' }}>Menunggu konfirmasi pembayaran</h3>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                Pembayaran Anda sedang diproses. Halaman billing akan otomatis ter-update saat lunas.
                Untuk beberapa metode (VA), konfirmasi bisa butuh hingga 10 menit.
              </p>
              <Link to="/billing" className="btn-outline" style={{ display: 'inline-flex' }}>
                Ke Halaman Billing
              </Link>
            </>
          )}

          {(status === 'FAILED' || status === 'EXPIRED') && (
            <>
              <XCircle size={48} style={{ color: '#ef4444', margin: '0 auto 1rem' }} />
              <h3 style={{ marginBottom: '0.5rem' }}>
                {status === 'EXPIRED' ? 'Pembayaran Kedaluwarsa' : 'Pembayaran Gagal'}
              </h3>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                Silakan coba lagi dari halaman billing.
              </p>
              <Link to="/billing" className="btn-upgrade" style={{ display: 'inline-flex' }}>
                Coba Lagi
              </Link>
            </>
          )}

          {status === 'NOT_FOUND' && (
            <>
              <XCircle size={48} style={{ color: 'var(--text-dim)', margin: '0 auto 1rem' }} />
              <h3 style={{ marginBottom: '0.5rem' }}>Transaksi Tidak Ditemukan</h3>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                Kami tidak menemukan info pembayaran. Silakan mulai ulang dari halaman billing.
              </p>
              <Link to="/billing" className="btn-outline" style={{ display: 'inline-flex' }}>
                Ke Billing
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
