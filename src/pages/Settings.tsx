/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, User, Mail, Settings, Trash2, Smartphone, Shield } from 'lucide-react';
import '../styles/settings.css';

export default function SettingsPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate('/login');
      } else {
        setUser(session.user);
      }
    });
  }, [navigate]);

  return (
    <div className="settings-layout">
      <div className="settings-container">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="settings-header">
          <div className="settings-back-row">
            <Link to="/chat" className="glass-back-btn">
              <ArrowLeft size={20} />
            </Link>
            <span className="settings-back-label">Kembali ke Chat</span>
          </div>
          <h1 className="settings-title">Settings</h1>
          <p className="settings-subtitle">
            Kelola profil, preferensi aplikasi, dan keamanan akun Anda.
          </p>
        </div>

        <div className="settings-grid">
          {/* ── Left column ─────────────────────────────────────────────── */}
          <div className="settings-col-left">

            {/* Profil */}
            <div className="settings-card">
              <div className="card-header">
                <h2 className="card-title">
                  <User size={18} />
                  Profil Pengguna
                </h2>
              </div>

              <div className="profile-info">
                <div className="profile-avatar">
                  <User size={32} color="var(--accent)" />
                </div>
                <div className="profile-details">
                  <div className="profile-name">{user?.user_metadata?.full_name || 'User'}</div>
                  <div className="profile-email">{user?.email}</div>
                </div>
                {/* <button className="btn-outline btn-sm">Edit Profil</button> */}
              </div>
            </div>

            {/* Preferensi */}
            <div className="settings-card">
              <div className="card-header">
                <h2 className="card-title">
                  <Settings size={18} />
                  Preferensi
                </h2>
              </div>

              <div className="settings-list">
                {/* <div className="settings-item">
                  <div className="item-info">
                    <Moon size={16} />
                    <div className="item-text">
                      <div className="item-title">Tema Gelap</div>
                      <div className="item-desc">Tampilan gelap yang nyaman di mata</div>
                    </div>
                  </div>
                  <label className="toggle-switch">
                    <input type="checkbox" defaultChecked />
                    <span className="slider"></span>
                  </label>
                </div> */}

                {/* <div className="settings-item">
                  <div className="item-info">
                    <Globe size={16} />
                    <div className="item-text">
                      <div className="item-title">Bahasa</div>
                      <div className="item-desc">Bahasa pengantar antarmuka</div>
                    </div>
                  </div>
                  <select className="settings-select" defaultValue="id">
                    <option value="id">Bahasa Indonesia</option>
                    <option value="en">English</option>
                  </select>
                </div> */}

                <div className="settings-item">
                  <div className="item-info">
                    <Smartphone size={16} />
                    <div className="item-text">
                      <div className="item-title">Kirim dengan Enter</div>
                      <div className="item-desc">Tekan Enter untuk mengirim pesan</div>
                    </div>
                  </div>
                  <label className="toggle-switch">
                    <input type="checkbox" defaultChecked />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>
            </div>

          </div>

          {/* ── Right column ─────────────────────────────────────────────── */}
          <div className="settings-col-right">

            {/* Keamanan & API */}
            <div className="settings-card">
              <div className="card-header">
                <h2 className="card-title">
                  <Shield size={18} />
                  Keamanan & API
                </h2>
              </div>

              <div className="settings-list">
                <div className="settings-item">
                  <div className="item-info">
                    <Mail size={16} />
                    <div className="item-text">
                      <div className="item-title">Email Verifikasi</div>
                      <div className="item-desc">Status verifikasi email akun</div>
                    </div>
                  </div>
                  <span className="status-badge status-badge--verified">Terverifikasi</span>
                </div>
              </div>
            </div>

            {/* Zona Berbahaya */}
            <div className="settings-card danger-card">
              <div className="card-header">
                <h2 className="card-title text-danger">
                  <Trash2 size={18} />
                  Remove Account
                </h2>
              </div>
              <p className="danger-desc">
                Tindakan ini tidak dapat dibatalkan. Semua data riwayat chat, pengaturan, dan langganan akan dihapus secara permanen.
              </p>
              <button className="btn-cancel" style={{ marginTop: '16px' }}>Hapus Akun</button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
