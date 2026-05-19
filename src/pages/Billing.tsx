import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Zap, CheckCircle, Star, X, Loader2 } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
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
  const [payData, setPayData] = useState<{ trxId: string; qrString: string; totalTransfer: number; uniqueCode: number; expiry: number } | null>(null);
  const [payStatus, setPayStatus] = useState<'PENDING' | 'SUCCESS' | 'EXPIRED' | 'CANCELED'>('PENDING');
  const [countdown] = useState<number>(600); // 10 minutes
  const pollIntervalRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);

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

  // ── Open upgrade modal (no API call yet) ─────────────────────────────
  const handleUpgradeClick = () => {
    if (!userId) return;
    // Reset all payment state — show confirmation step
    setPayData(null);
    setPayError(null);
    setPayLoading(false);
    setPayStatus('PENDING');
    setShowPayModal(true);
  };

  // ── Development mode: payment gateway temporarily disabled ─────────────
  const handleConfirmPayment = () => {
    setPayError('Pembayaran otomatis sedang dalam tahap development. Untuk upgrade Pro sementara, hubungi admin.');
  };

  const closePayModal = () => {
    if (payLoading) return; // prevent close during request
    setShowPayModal(false);
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    setPayData(null);
    setPayError(null);
    setPayStatus('PENDING');
  };

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, []);

  const fmtCountdown = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
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

            {/* Invoice History */}
            {/* {!isFree && (
              <div className="billing-card">
                <div className="card-header">
                  <h2 className="card-title">
                    <Receipt size={18} />
                    Riwayat Invoice
                  </h2>
                  <button className="btn-icon-text">
                    <ExternalLink size={13} />
                    Portal Stripe
                  </button>
                </div>

                <div className="history-table-wrapper">
                  <table className="history-table">
                    <thead>
                      <tr>
                        <th>Tanggal</th>
                        <th>Deskripsi</th>
                        <th>Total</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {INVOICES.map((inv, i) => (
                        <tr key={i}>
                          <td>{inv.date}</td>
                          <td>{inv.desc}</td>
                          <td className="invoice-amount">{inv.amount}</td>
                          <td>
                            <span className={`status-badge status-badge--${inv.status}`}>
                              {inv.status === 'paid' ? 'Berhasil' : 'Gagal'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )} */}
          </div>

          {/* ── Right column ─────────────────────────────────────────────── */}
          <div className="billing-col-right">

            {/* Payment Method */}
            {/* <div className="billing-card">
              <div className="card-header">
                <h2 className="card-title">
                  <CreditCard size={18} />
                  Metode Pembayaran
                </h2>
              </div>

              {isFree ? (
                <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginTop: '1rem', lineHeight: '1.5' }}>
                  Belum ada metode pembayaran karena Anda sedang menggunakan paket <strong>Free</strong>. Silakan tingkatkan paket Anda untuk menambahkan metode pembayaran.
                </div>
              ) : (
                <>
                  <div className="payment-method">
                    <div className="pm-icon">
                      <svg width="32" height="20" viewBox="0 0 32 20" fill="none">
                        <rect width="32" height="20" rx="4" fill="#1A1F36" />
                        <path d="M12.667 14L15.333 6H18L15.333 14H12.667ZM10.22 14L8.273 8.353 7.333 12.4C7.133 13.253 6.533 14 5.6 14H2V12.933C2.533 12.933 3.4 12.667 4 12.4L6.667 6H9.333L12.533 14H10.22ZM21.933 14C23.6 14 24.8 13.2 25.333 12.4V14H27.333V6H25.333V10.667C25.333 11.867 24.267 12.667 22.933 12.667C21.733 12.667 20.8 11.867 20.8 10.667V6H18.8V10.667C18.8 12.533 20.133 14 21.933 14Z" fill="white" />
                      </svg>
                    </div>
                    <div className="pm-details">
                      <div className="pm-name">Visa berakhiran 4242</div>
                      <div className="pm-expiry">Kedaluwarsa 12/28</div>
                    </div>
                    <span className="pm-default-badge">Default</span>
                  </div>

                  <button className="btn-outline" style={{ marginTop: '16px' }}>
                    Perbarui Metode Pembayaran
                  </button>
                </>
              )}
            </div> */}

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

      {/* ── Payment Modal (QRIS) ──────────────────────────────────────── */}
      {showPayModal && (
        <div className="pay-modal-overlay" onClick={closePayModal}>
          <div className="pay-modal" onClick={(e) => e.stopPropagation()}>
            <button className="pay-modal-close" onClick={closePayModal} disabled={payLoading}>
              <X size={18} />
            </button>

            {/* Step 1 — Confirm upgrade (no payment created yet) */}
            {!payData && payStatus === 'PENDING' && (
              <div className="pay-confirm">
                <h2 className="pay-modal-title">Upgrade ke Pro</h2>
                <div className="pay-confirm-price">
                  Rp 30.000 <span className="pay-confirm-period">/ bulan</span>
                </div>
                <p className="pay-confirm-note">Manual monthly, tidak auto-renewal</p>

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
                  <div>Pembayaran otomatis sedang dalam tahap development</div>
                  <div>Untuk upgrade Pro sementara, hubungi admin. Akses Pro akan diaktifkan manual setelah pembayaran dikonfirmasi.</div>
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
                    <Zap size={15} /> Hubungi Admin untuk Upgrade
                  </button>
                </div>
              </div>
            )}

            {/* Step 2 — QRIS pending */}
            {payData && payStatus === 'PENDING' && (
              <>
                <h2 className="pay-modal-title">Pembayaran Pro Plan</h2>
                <p className="pay-modal-subtitle">Scan QRIS dengan aplikasi e-wallet/mobile banking</p>

                <div className="pay-qr-container">
                  <QRCodeCanvas value={payData.qrString} size={240} level="M" includeMargin />
                </div>

                <div className="pay-amount-row">
                  <span className="pay-label">Total bayar</span>
                  <span className="pay-amount">Rp {payData.totalTransfer.toLocaleString('id-ID')}</span>
                </div>
                <div className="pay-info-row">
                  <span className="pay-label">Kode unik</span>
                  <span>+{payData.uniqueCode}</span>
                </div>
                <div className="pay-info-row">
                  <span className="pay-label">Berlaku</span>
                  <span className={countdown < 60 ? 'pay-expire-soon' : ''}>
                    {fmtCountdown(countdown)}
                  </span>
                </div>

                <div className="pay-status-line">
                  <Loader2 className="spin" size={14} />
                  <span>Menunggu pembayaran...</span>
                </div>
              </>
            )}

            {/* Step 3 — Success */}
            {payStatus === 'SUCCESS' && (
              <div className="pay-modal-success">
                <CheckCircle size={48} className="pay-success-icon" />
                <h3>Pembayaran Berhasil!</h3>
                <p>Akun Anda telah di-upgrade ke Pro plan.</p>
                <button className="btn-upgrade" onClick={closePayModal}>Selesai</button>
              </div>
            )}

            {/* Step 4 — Expired / canceled */}
            {(payStatus === 'EXPIRED' || payStatus === 'CANCELED') && (
              <div className="pay-modal-error">
                <h3>{payStatus === 'EXPIRED' ? 'QRIS Kedaluwarsa' : 'Pembayaran Dibatalkan'}</h3>
                <p>Silakan coba lagi.</p>
                <button className="btn-outline" onClick={closePayModal}>Tutup</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
