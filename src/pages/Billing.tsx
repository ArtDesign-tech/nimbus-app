import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Zap, CheckCircle, Star, X, Loader2 } from 'lucide-react';
import '../styles/billing.css';

// ── Types ───────────────────────────────────────────────────────────────────
interface Plan {
  id: string;
  name: string;
  price_cents: number;
  features: string[];
}

interface Subscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: string;
  current_period_end: string;
}

export default function BillingPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // ── Payment modal state ────────────────────────────────────────────────
  const [showPayModal, setShowPayModal] = useState(false);
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const fetchBillingData = useCallback(async (userId: string) => {
    try {
      const { data: subData } = await supabase
        .from('subscriptions')
        .select('*, plans(*)')
        .eq('user_id', userId)
        .maybeSingle();

      if (subData && subData.plans) {
        setSubscription(subData as Subscription);
        setPlan(subData.plans as Plan);
      } else {
        const { data: freePlan } = await supabase
          .from('plans')
          .select('*')
          .eq('id', 'free')
          .single();
        setPlan(freePlan as Plan);
      }
    } catch (error) {
      console.error('Error fetching billing data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let subChannel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (!session) {
        navigate('/login');
        return;
      }
      const uid = session.user.id;
      setUserId(uid);
      fetchBillingData(uid);

      const channelName = `billing_realtime_${uid}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      subChannel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'subscriptions', filter: `user_id=eq.${uid}` },
          () => fetchBillingData(uid)
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (subChannel) supabase.removeChannel(subChannel);
    };
  }, [navigate, fetchBillingData]);

  // ── Open upgrade modal ─────────────────────────────────────────────────
  const handleUpgradeClick = () => {
    if (!userId) return;
    setPayError(null);
    setPayLoading(false);
    setShowPayModal(true);
  };

  // ── Confirm: call backend to create DOKU checkout & redirect ───────────
  const handleConfirmPayment = async () => {
    if (!userId) return;
    setPayLoading(true);
    setPayError(null);
    try {
      const res = await fetch('/api/payment/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok || !data?.url) {
        throw new Error(data?.message || data?.error || 'Gagal membuat sesi pembayaran');
      }
      // Simpan invoice number sebelum redirect supaya halaman /billing/return bisa polling status.
      try {
        sessionStorage.setItem('nimbus_pending_trx', data.invoiceNumber);
      } catch { /* ignore */ }
      window.location.href = data.url;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setPayError(msg);
      setPayLoading(false);
    }
  };

  const closePayModal = () => {
    if (payLoading) return;
    setShowPayModal(false);
    setPayError(null);
  };

  if (loading) {
    return (
      <div className="billing-layout">
        <div className="billing-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'var(--text-dim)' }}>
          Memuat data billing...
        </div>
      </div>
    );
  }

  if (!plan) {
    return null;
  }

  const isFree = plan.id === 'free';

  return (
    <div className="billing-layout">
      <div className="billing-container">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="billing-header">
          <div className="billing-back-row">
            <Link to="/chat" className="glass-back-btn">
              <ArrowLeft size={20} />
            </Link>
            <span className="billing-back-label">Kembali ke Chat</span>
          </div>
          <h1 className="billing-title">Billing</h1>
          <p className="billing-subtitle">
            Kelola langganan, metode pembayaran, dan invoice Anda.
          </p>
        </div>

        <div className="billing-grid">

          {/* ── Left column ─────────────────────────────────────────────── */}
          <div className="billing-col-left">

            {/* Current Plan card */}
            <div className="billing-card plan-card">
              <div className="plan-card-glow" />
              <div className="card-header">
                <h2 className="card-title">
                  <Star size={18} />
                  Paket Saat Ini
                </h2>
                <span className={`plan-badge plan-badge--${plan.id.toLowerCase()}`}>
                  {plan.name.toUpperCase()}
                </span>
              </div>

              <div className="plan-price">
                {plan.price_cents === 0 ? 'Gratis' : `Rp ${(plan.price_cents).toLocaleString('id-ID')}`}
                {plan.price_cents > 0 && <span className="plan-price-period">/bulan</span>}
              </div>

              <ul className="plan-features">
                {plan.features?.map((f: string) => (
                  <li key={f}>
                    <CheckCircle size={14} />
                    {f}
                  </li>
                ))}
              </ul>

              {!isFree && subscription && (
                <div className="plan-renewal">
                  Pro aktif sampai <strong>{new Date(subscription.current_period_end).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</strong>. Perpanjangan dilakukan manual.
                </div>
              )}

              <div className="plan-actions">
                {isFree ? (
                  <button className="btn-upgrade" onClick={handleUpgradeClick}>
                    <Zap size={15} />
                    Tingkatkan ke Pro
                  </button>
                ) : (
                  <>
                    <button className="btn-upgrade" disabled>
                      <Zap size={15} />
                      Paket Pro Aktif
                    </button>
                    <button className="btn-cancel">Kelola Manual via Admin</button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ── Right column ─────────────────────────────────────────────── */}
          <div className="billing-col-right">

            {/* Link to Usage */}
            <div className="billing-card usage-link-card">
              <div className="ul-icon">
                <Zap size={20} />
              </div>
              <div className="ul-body">
                <div className="ul-title">Lihat konsumsi credit</div>
                <div className="ul-sub">Context 5-jam & mingguan, chart 7 hari</div>
              </div>
              <Link to="/usage" className="btn-usage-link">Buka Usage →</Link>
            </div>

          </div>
        </div>
      </div>

      {/* ── Payment Modal (DOKU Checkout redirect) ────────────────────── */}
      {showPayModal && (
        <div className="pay-modal-overlay" onClick={closePayModal}>
          <div className="pay-modal" onClick={(e) => e.stopPropagation()}>
            <button className="pay-modal-close" onClick={closePayModal} disabled={payLoading}>
              <X size={18} />
            </button>

            <div className="pay-confirm">
              <h2 className="pay-modal-title">Upgrade ke Pro</h2>
              <div className="pay-confirm-price">
                Rp 30.000 <span className="pay-confirm-period">/ bulan</span>
              </div>
              <p className="pay-confirm-note">Sekali bayar untuk 1 bulan, tidak auto-renewal</p>

              <div className="pay-confirm-section">
                <div className="pay-confirm-section-title">Benefit Pro</div>
                <ul className="pay-confirm-list">
                  <li><CheckCircle size={14} /> 500 pesan per hari</li>
                  <li><CheckCircle size={14} /> 30 request per menit</li>
                  <li><CheckCircle size={14} /> Akses Claude Opus 4.7</li>
                  <li><CheckCircle size={14} /> Semua model Free tetap tersedia</li>
                  <li><CheckCircle size={14} /> Vision support via auto-preprocessor</li>
                  <li><CheckCircle size={14} /> Real-time streaming response</li>
                  <li><CheckCircle size={14} /> History tersimpan</li>
                </ul>
              </div>

              <div className="pay-confirm-info">
                <div>Pembayaran via DOKU Checkout (QRIS, VA, e-wallet, kartu kredit).</div>
                <div>Anda akan diarahkan ke halaman pembayaran DOKU. Akses Pro otomatis aktif setelah pembayaran sukses.</div>
              </div>

              {payError && (
                <div className="pay-confirm-error">{payError}</div>
              )}

              <div className="pay-confirm-actions">
                <button
                  type="button"
                  className="btn-outline"
                  onClick={closePayModal}
                  disabled={payLoading}
                >
                  Batal
                </button>
                <button
                  type="button"
                  className="btn-upgrade"
                  onClick={handleConfirmPayment}
                  disabled={payLoading}
                >
                  {payLoading ? (
                    <>
                      <Loader2 size={15} className="spin" /> Memproses...
                    </>
                  ) : (
                    <>
                      <Zap size={15} /> Lanjut ke Pembayaran
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
