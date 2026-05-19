/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [loadingProvider, setLoadingProvider] = useState<'google' | 'github' | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate('/chat');
      }
    });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg('');
    const form = e.target as HTMLFormElement;
    const email = (form.elements.namedItem('email') as HTMLInputElement).value;
    const password = (form.elements.namedItem('password') as HTMLInputElement).value;

    try {
      if (tab === 'register') {
        const name = (form.elements.namedItem('name') as HTMLInputElement).value;
        const confirm = (form.elements.namedItem('confirm') as HTMLInputElement).value;
        if (password !== confirm) {
          throw new Error('Password tidak cocok');
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name }
          }
        });
        if (error) throw error;
        navigate('/chat');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (error) throw error;
        navigate('/chat');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOAuthLogin = async (provider: 'google' | 'github') => {
    setErrorMsg('');
    setLoadingProvider(provider);

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    });

    if (error) {
      console.error(error);
      setErrorMsg(error.message || 'Login gagal. Coba lagi.');
      setLoadingProvider(null);
    }
  };

  return (
    <div className="login-layout">
      {/* LEFT PANEL */}
      <div className="left-panel">
        <div className="panel-glow"></div>
        <div className="panel-glow2"></div>

        <Link to="/" className="panel-logo">
          <img src="/image/logo/N-v1.png" alt="Nimbus Logo" width={32} height={32} className="rounded-lg object-contain" />
          <span className="logo-text">Nimbus</span>
        </Link>

        <div className="panel-body">
          <h2 className="panel-headline">Satu tempat untuk<br/>semua <span>model AI</span></h2>
          <p className="panel-sub">GPT-5.5, Claude Opus 4.7, Gemini, DeepSeek — akses semua<br/>dari antarmuka yang bersih dan cepat.</p>

          <div className="mini-chat">
            <div className="mini-model-row">
              <div className="mini-dot"></div>
              <span className="mini-model-name">Claude Opus 4.7 · aktif</span>
            </div>
            <div className="mini-msg">
              <div className="mini-avatar user">IQ</div>
              <div className="mini-text">Jelaskan perbedaan <span className="mini-code">async/await</span> vs <span className="mini-code">Promise.then()</span></div>
            </div>
            <div className="mini-msg">
              <div className="mini-avatar" style={{ background: 'transparent' }}>
                <img src="/image/logo/N-v1.png" alt="Nimbus" width={20} height={20} className="rounded" />
              </div>
              <div className="mini-text">Keduanya menangani async, tapi <span className="mini-code">async/await</span> membuat kode terlihat synchronous — lebih mudah dibaca dan di-debug. <span className="mini-code">Promise.then()</span> lebih eksplisit tapi bisa jadi callback hell...</div>
            </div>
          </div>
        </div>

        <div className="panel-stats">
          <div className="stat">
            <div className="stat-number">5+</div>
            <div className="stat-label">Model AI</div>
          </div>
          <div className="stat">
            <div className="stat-number">&lt;800ms</div>
            <div className="stat-label">TTFB stream</div>
          </div>
          <div className="stat">
            <div className="stat-number">99.5%</div>
            <div className="stat-label">Uptime</div>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL — AUTH */}
      <div className="right-panel">
        <Link to="/" className="mobile-logo">
          <img src="/image/logo/N-v1.png" alt="Nimbus Logo" width={32} height={32} className="rounded-lg object-contain" />
          <span className="logo-text">Nimbus</span>
        </Link>

        <div className="auth-box">
          <div className="auth-tabs">
            <div className={`auth-tab ${tab === 'login' ? 'active' : ''}`} onClick={() => setTab('login')}>Masuk</div>
            <div className={`auth-tab ${tab === 'register' ? 'active' : ''}`} onClick={() => setTab('register')}>Daftar</div>
          </div>

          <h1 className="auth-title">
            {tab === 'register' ? 'Buat akun gratis' : 'Selamat datang kembali'}
          </h1>
          <p className="auth-sub">
            {tab === 'register' ? (
              <>Sudah punya akun? <a href="#" onClick={(e) => { e.preventDefault(); setTab('login'); }}>Masuk di sini</a></>
            ) : (
              <>Belum punya akun? <a href="#" onClick={(e) => { e.preventDefault(); setTab('register'); }}>Daftar gratis</a></>
            )}
          </p>

          <div className="oauth-group">
            <button className="oauth-btn" onClick={() => handleOAuthLogin('google')} disabled={loadingProvider !== null}>
              <svg className="oauth-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              {loadingProvider === 'google' ? 'Redirecting...' : 'Lanjutkan dengan Google'}
            </button>
            <button className="oauth-btn" onClick={() => handleOAuthLogin('github')} disabled={loadingProvider !== null}>
              <svg className="oauth-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
              </svg>
              {loadingProvider === 'github' ? 'Redirecting...' : 'Lanjutkan dengan GitHub'}
            </button>
          </div>

          <div className="divider">
            <div className="divider-line"></div>
            <span className="divider-text">atau email</span>
            <div className="divider-line"></div>
          </div>

          <form onSubmit={handleSubmit}>
            {errorMsg && (
              <div style={{ color: '#FF5B7D', marginBottom: '16px', fontSize: '14px', backgroundColor: 'rgba(255,91,125,0.1)', padding: '10px', borderRadius: '8px' }}>
                {errorMsg}
              </div>
            )}
            
            {tab === 'register' && (
              <div className="form-group register-only visible">
                <label htmlFor="name">Nama lengkap</label>
                <input type="text" id="name" name="name" placeholder="Nama kamu" autoComplete="name" />
              </div>
            )}

            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input type="email" id="email" name="email" placeholder="kamu@email.com" autoComplete="email" required />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <div className="password-wrapper">
                <input 
                  type={showPassword ? "text" : "password"} 
                  id="password" 
                  name="password"
                  placeholder={tab === 'register' ? 'Minimal 8 karakter' : '••••••••'} 
                  autoComplete={tab === 'register' ? 'new-password' : 'current-password'} 
                  required
                />
                <button type="button" className="toggle-pw" onClick={() => setShowPassword(!showPassword)} aria-label="Tampilkan password">
                  {showPassword ? (
                    <svg viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  ) : (
                    <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>
              {tab === 'login' && (
                <div className="forgot-row">
                  <a href="#" className="forgot-link">Lupa password?</a>
                </div>
              )}
            </div>

            {tab === 'register' && (
              <div className="form-group register-only visible">
                <label htmlFor="confirm">Konfirmasi password</label>
                <div className="password-wrapper">
                  <input type="password" id="confirm" name="confirm" placeholder="••••••••" required={tab === 'register'} />
                </div>
              </div>
            )}

            <button type="submit" className="btn-submit" disabled={isLoading} style={{ opacity: isLoading ? 0.7 : 1 }}>
              <span>
                {isLoading ? (tab === 'login' ? 'Memproses...' : 'Membuat akun...') : (tab === 'register' ? 'Buat akun' : 'Masuk')}
              </span>
              {!isLoading && (
                <svg className="arrow" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z"/></svg>
              )}
            </button>
          </form>

          <p className="terms-note">
            Dengan masuk, kamu setuju dengan <a href="#">Ketentuan Layanan</a> dan <a href="#">Kebijakan Privasi</a> kami.
          </p>
        </div>
      </div>
    </div>
  );
}
