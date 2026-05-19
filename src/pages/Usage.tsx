import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Zap, Clock, BarChart2, AlertTriangle, MessageSquare } from 'lucide-react';
import { RATE_LIMITS, type PlanId } from '../lib/rateLimit';
import '../styles/usage.css';

// ── Types ───────────────────────────────────────────────────────────────────
interface PlanInfo {
  id: PlanId;
  name: string;
}

interface UsageStats {
  used_today: number;
  daily_usage: { day: string; messages: number }[];
  eta_reset_min: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function pct(used: number, cap: number) {
  if (cap === 0) return 0;
  return Math.min(100, Math.round((used / cap) * 100));
}

function fmtEta(minutes: number): string {
  if (minutes < 60) return `${minutes} menit`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h < 24) return m > 0 ? `${h} jam ${m} mnt` : `${h} jam`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${d} hari ${rh} jam` : `${d} hari`;
}

function progressColor(p: number): string {
  if (p >= 90) return 'danger';
  if (p >= 70) return 'warning';
  return '';
}

// ── Component ────────────────────────────────────────────────────────────────
export default function UsagePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [usage, setUsage] = useState<UsageStats>({
    used_today: 0,
    daily_usage: [],
    eta_reset_min: 0,
  });

  const fetchUsageData = useCallback(async (userId: string) => {
    try {
      // ── Fetch user plan ──────────────────────────────────────────────────
      const { data: subData } = await supabase
        .from('subscriptions')
        .select('plan_id, plans(id, name)')
        .eq('user_id', userId)
        .maybeSingle();

      let planInfo: PlanInfo;
      if (subData && (subData as any).plans) {
        const p = (subData as any).plans;
        planInfo = { id: (p.id === 'pro' ? 'pro' : 'free') as PlanId, name: p.name };
      } else {
        planInfo = { id: 'free', name: 'Free' };
      }
      setPlan(planInfo);

      // ── Fetch user's conversations ───────────────────────────────────────
      const { data: convData } = await supabase
        .from('conversations')
        .select('id')
        .eq('user_id', userId);

      const convIds = (convData ?? []).map((c: any) => c.id);
      if (convIds.length === 0) {
        setUsage({ used_today: 0, daily_usage: buildEmptyDaily(), eta_reset_min: minutesUntilMidnight() });
        return;
      }

      // ── Fetch user messages last 7 days ──────────────────────────────────
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const { data: msgs } = await supabase
        .from('messages')
        .select('created_at')
        .in('conversation_id', convIds)
        .eq('role', 'user')
        .gte('created_at', sevenDaysAgo.toISOString())
        .order('created_at', { ascending: true });

      // ── Compute daily counts ─────────────────────────────────────────────
      const dailyMap: Record<string, number> = {};
      const dayKeys: string[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const key = d.toISOString().slice(0, 10);
        dailyMap[key] = 0;
        dayKeys.push(key);
      }

      const todayKey = now.toISOString().slice(0, 10);
      let used_today = 0;

      (msgs ?? []).forEach((m: any) => {
        const key = new Date(m.created_at).toISOString().slice(0, 10);
        if (dailyMap[key] !== undefined) dailyMap[key] += 1;
        if (key === todayKey) used_today += 1;
      });

      const daily_usage = dayKeys.map(key => ({
        day: new Date(key).toLocaleDateString('id-ID', { weekday: 'short' }),
        messages: dailyMap[key] ?? 0,
      }));

      setUsage({
        used_today,
        daily_usage,
        eta_reset_min: minutesUntilMidnight(),
      });
    } catch (error) {
      console.error('Error fetching usage data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled || !session) {
        if (!session) navigate('/login');
        return;
      }
      const userId = session.user.id;
      fetchUsageData(userId);

      // Realtime updates when new messages are added (unique channel name to avoid StrictMode collisions)
      const channelName = `usage_realtime_${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages' },
          () => fetchUsageData(userId)
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [navigate, fetchUsageData]);

  if (loading) {
    return (
      <div className="usage-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'var(--text-dim)' }}>
        Memuat data usage...
      </div>
    );
  }

  if (!plan) return null;

  const limits = RATE_LIMITS[plan.id];
  const pctToday = pct(usage.used_today, limits.dailyQuota);
  const remainingToday = Math.max(0, limits.dailyQuota - usage.used_today);

  const messagesValues = usage.daily_usage.map(d => d.messages);
  const maxBar = messagesValues.length > 0 ? Math.max(...messagesValues, 1) : 1;
  const total7d = usage.daily_usage.reduce((s, d) => s + d.messages, 0);

  return (
    <div className="usage-container">
      {/* Header */}
      <div className="usage-header">
        <Link to="/chat" className="glass-back-btn">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="usage-title">Usage</h1>
          <p className="usage-subtitle">
            Penggunaan pesan — plan <strong style={{ textTransform: 'capitalize' }}>{plan.name}</strong>
          </p>
        </div>
      </div>

      <div className="usage-content">

        {/* ── Daily Quota ─────────────────────────────────────────────────── */}
        <div className="glass-card">
          <div className="card-title">
            <MessageSquare size={18} />
            Pesan Hari Ini
          </div>

          <div className="stat-row">
            <span className="stat-label">Pesan terkirim</span>
            <span className="stat-value">{usage.used_today} / {limits.dailyQuota}</span>
          </div>
          <div className="progress-track">
            <div
              className={`progress-fill ${progressColor(pctToday)}`}
              style={{ width: `${pctToday}%` }}
            />
          </div>

          <div className="window-meta">
            <div className="window-remaining">
              <span className="remaining-num">{remainingToday}</span>
              <span className="remaining-label">pesan tersisa</span>
            </div>
            <div className="eta-badge">
              <Clock size={12} />
              Reset dalam {fmtEta(usage.eta_reset_min)}
            </div>
          </div>
        </div>

        {/* ── Rate per Minute ─────────────────────────────────────────────── */}
        <div className="glass-card">
          <div className="card-title">
            <Zap size={18} />
            Rate Limit per Menit
          </div>
          <div className="stat-row">
            <span className="stat-label">Maksimal pesan / menit</span>
            <span className="stat-value">{limits.rpm} RPM</span>
          </div>
          <div className="chart-note">
            Mencegah spam. Pesan ke-{limits.rpm + 1} dalam 1 menit akan ditolak.
          </div>
        </div>

        {/* ── Warning kalau hampir habis ──────────────────────────────────── */}
        {pctToday >= 70 && (
          <div className="alert-card">
            <AlertTriangle size={16} />
            <span>
              Kuota harian hampir habis. {plan.id === 'free'
                ? <>Upgrade ke <strong>Pro</strong> untuk 500 pesan/hari.</>
                : <>Quota akan reset tengah malam.</>}
            </span>
          </div>
        )}

        {/* ── Bar Chart 7 Hari Terakhir ───────────────────────────────────── */}
        <div className="glass-card">
          <div className="card-title">
            <BarChart2 size={18} />
            Pesan Terkirim — 7 Hari Terakhir
          </div>
          <div className="bar-chart">
            {usage.daily_usage.map((d, idx) => {
              const h = Math.round((d.messages / maxBar) * 100);
              return (
                <div key={`${d.day}-${idx}`} className="bar-col">
                  <span className="bar-val">{d.messages}</span>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ height: `${h}%` }} />
                  </div>
                  <span className="bar-day">{d.day}</span>
                </div>
              );
            })}
          </div>
          <div className="chart-note">Hanya menghitung pesan dari user (bukan respons AI)</div>
        </div>

        {/* ── Quick Stats ──────────────────────────────────────────────────── */}
        <div className="quick-stats">
          <div className="quick-stat-card">
            <span className="qs-value">{total7d}</span>
            <span className="qs-label">Total 7 hari</span>
          </div>
          <div className="quick-stat-card">
            <span className="qs-value">{Math.round(total7d / 7)}</span>
            <span className="qs-label">Rata-rata/hari</span>
          </div>
          <div className="quick-stat-card">
            <span className="qs-value">{maxBar === 1 ? 0 : maxBar}</span>
            <span className="qs-label">Tertinggi/hari</span>
          </div>
        </div>

        {/* ── Link ke Billing ──────────────────────────────────────────────── */}
        <div className="billing-link-card">
          <div>
            <div className="bl-title">Butuh kuota lebih besar?</div>
            <div className="bl-sub">
              {plan.id === 'free'
                ? 'Upgrade ke Pro: 500 pesan/hari + 30 RPM'
                : 'Kelola langganan & invoice di halaman Billing'}
            </div>
          </div>
          <Link to="/billing" className="btn-billing">
            <Zap size={15} />
            Lihat Billing
          </Link>
        </div>

      </div>
    </div>
  );
}

// ── Local helpers ─────────────────────────────────────────────────────────────
function minutesUntilMidnight(): number {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return Math.round((tomorrow.getTime() - now.getTime()) / 60000);
}

function buildEmptyDaily(): { day: string; messages: number }[] {
  const now = new Date();
  const out: { day: string; messages: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    out.push({ day: d.toLocaleDateString('id-ID', { weekday: 'short' }), messages: 0 });
  }
  return out;
}
