import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Users, BellRing } from 'lucide-react';
import axios from 'axios';
import { useThemeStore } from '../../store/themeStore';
import { toAssetUrl } from '../../utils/helpers';
import { useAuthStore } from '../../store/authStore';
import toast from 'react-hot-toast';

const LoginPage: React.FC = () => {
  const { logo, companyName } = useThemeStore((s) => ({
    logo: s.logo,
    companyName: s.companyName,
  }));
  const logoUrl = toAssetUrl(logo);
  const [logoFailed, setLogoFailed] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loginError, setLoginError] = useState('');

  const { login, isLoading, isAuthenticated } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    setLogoFailed(false);
  }, [logoUrl]);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    try {
      await login(email.trim().toLowerCase(), password, rememberMe);
      toast.success('Welcome back!');
      navigate('/dashboard');
    } catch (error: any) {
      const fallbackMessage = 'Unable to sign in right now. Please try again.';
      let message = fallbackMessage;

      if (axios.isAxiosError(error)) {
        message = error.response?.data?.message || 
                 (error.request ? 'Cannot reach server. Please check backend status.' : fallbackMessage);
      } else if (error instanceof Error) {
        message = error.message;
      }

      setLoginError(message);
      toast.error(message);
    }
  };

  const handleContactAdmin = (e: React.MouseEvent) => {
    e.preventDefault();
    toast.success('Please contact your administrator or support@welcometech.qa to recover your account.');
  };

  const handleForgotPassword = (e: React.MouseEvent) => {
    e.preventDefault();
    toast.success('Please contact your administrator to reset your password.');
  };

  const displayName = companyName || 'WelcomeTech CRM';
  const hasLogo = Boolean(logoUrl) && !logoFailed;

  // Sample figures for the decorative preview cards only.
  const pipeline = [
    { label: 'New', count: 24, width: 100 },
    { label: 'Contacted', count: 18, width: 76 },
    { label: 'Proposal', count: 11, width: 50 },
    { label: 'Won', count: 6, width: 28 },
  ];
  const tickets = [
    { label: 'Licence renewal', status: 'Open', dot: '#f59e0b', bg: '#fef3c7', fg: '#92400e' },
    { label: 'Remote access', status: 'In progress', dot: '#3b82f6', bg: '#dbeafe', fg: '#1e40af' },
    { label: 'Data backup', status: 'Done', dot: '#22c55e', bg: '#dcfce7', fg: '#166534' },
  ];

  return (
    <div className="auth-shell">
      <div className="auth-stage">
        {/* Decorative product preview */}
        <section className="auth-showcase" aria-hidden="true">
          <div className="auth-orbit" />
          <span className="auth-badge auth-badge-a"><Users size={22} /></span>
          <span className="auth-badge auth-badge-b"><BellRing size={22} /></span>

          <div className="auth-fcard auth-fcard-proposals">
            <div className="auth-fcard-title">Send Proposals</div>
            <div className="auth-fcard-sub">Quotes and payments</div>
            <div className="auth-doc">
              <div className="auth-doc-head">
                <span>Proposal</span>
                <span className="auth-chip">Sent</span>
              </div>
              <div className="auth-doc-line" style={{ width: '92%' }} />
              <div className="auth-doc-line" style={{ width: '74%' }} />
              <div className="auth-doc-line" style={{ width: '58%' }} />
              <div className="auth-doc-total">
                <span>Total</span>
                <strong>12,500.00</strong>
              </div>
            </div>
          </div>

          <div className="auth-fcard auth-fcard-leads">
            <div className="auth-fcard-title">Track Leads</div>
            <div className="auth-fcard-sub">Sales pipeline</div>
            <div className="auth-funnel">
              {pipeline.map((stage) => (
                <div key={stage.label} className="auth-funnel-row">
                  <span><span>{stage.label}</span><span>{stage.count}</span></span>
                  <div className="auth-funnel-track">
                    <i style={{ width: `${stage.width}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="auth-fcard auth-fcard-tickets">
            <div className="auth-fcard-title">Resolve Tickets</div>
            <div className="auth-fcard-sub">Support desk</div>
            <ul className="auth-tix">
              {tickets.map((ticket) => (
                <li key={ticket.label}>
                  <span className="auth-tix-dot" style={{ background: ticket.dot }} />
                  <span>{ticket.label}</span>
                  <span className="auth-tix-pill" style={{ background: ticket.bg, color: ticket.fg }}>{ticket.status}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="auth-side">
          <main className="auth-card">
            <div className="auth-logo-row">
              <div className={`auth-logo ${hasLogo ? 'has-logo' : ''}`}>
                {hasLogo ? (
                  <img src={logoUrl} alt="" onError={() => setLogoFailed(true)} />
                ) : (
                  <span>{displayName[0].toUpperCase()}</span>
                )}
              </div>
              <span className="auth-logo-name">{displayName}</span>
            </div>

            <h1 className="auth-title">Login to your account</h1>
            <p className="auth-subtitle">One place for your leads, customers and renewals</p>

            <form onSubmit={handleSubmit} className="auth-form">
              <div className="auth-input-wrap">
                <label className="auth-sr-only" htmlFor="auth-email">Email</label>
                <input
                  id="auth-email"
                  className="auth-input"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  required
                  autoFocus
                />
              </div>

              <div className="auth-input-wrap">
                <label className="auth-sr-only" htmlFor="auth-password">Password</label>
                <input
                  id="auth-password"
                  className="auth-input has-toggle"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="auth-toggle"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <Eye size={19} /> : <EyeOff size={19} />}
                </button>
              </div>

              <div className="auth-row">
                <label className="auth-remember">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  Remember me
                </label>
                <a href="#forgot" onClick={handleForgotPassword} className="auth-link is-muted">Forgot Password?</a>
              </div>

              {loginError && <div className="auth-error" role="alert">{loginError}</div>}

              <button type="submit" className="auth-submit" disabled={isLoading}>
                {isLoading ? 'Logging in…' : 'Log In'}
              </button>
            </form>

            <div className="auth-foot">
              Don't have an account? <a href="#contact" onClick={handleContactAdmin} className="auth-link">Contact admin</a>
            </div>
          </main>

          <p className="auth-quote">“Every lead, customer and renewal in one place”</p>
        </section>
      </div>
    </div>
  );
};

export default LoginPage;
