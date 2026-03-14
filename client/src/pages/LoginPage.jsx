import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { Lock, Mail, KeyRound } from 'lucide-react';

export default function LoginPage() {
  const { login, devLogin, verifyOtp } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState('credentials'); // credentials | otp
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCredentials = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await login(email, password);
      if (data.requireOTP) {
        setStep('otp');
        toast.info('OTP sent to your email');
      }
    } catch (err) {
      if (err.response?.data?.needsSetup) {
        toast.info('Please check your email for the invite link to set your password.');
      } else {
        toast.error(err.response?.data?.error || 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await verifyOtp(email, otpCode);
      toast.success('Welcome!');
      navigate('/calendar');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDevLogin = async () => {
    setLoading(true);
    try {
      await devLogin(email || 'admin@vncicu.dev', password || 'password123');
      navigate('/calendar');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Dev login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: 'var(--bg-primary)',
    }}>
      <div className="card" style={{ width: 400, maxWidth: '90vw' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent)' }}>VNC ICU</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Vacation Request Portal</div>
        </div>

        {step === 'credentials' ? (
          <form onSubmit={handleCredentials} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label><Mail size={14} style={{ display: 'inline', verticalAlign: -2, marginRight: 6 }} />Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@vncicu.dev" required autoFocus />
            </div>
            <div className="form-group">
              <label><Lock size={14} style={{ display: 'inline', verticalAlign: -2, marginRight: 6 }} />Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" required />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}
              style={{ width: '100%', justifyContent: 'center' }}>
              {loading ? 'Sending OTP…' : 'Login'}
            </button>
            <div style={{ textAlign: 'center', marginTop: '0.25rem' }}>
              <Link to="/forgot-password" style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', textDecoration: 'underline' }}>
                Forgot Password?
              </Link>
            </div>
          </form>
        ) : (
          <form onSubmit={handleOtp} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', textAlign: 'center' }}>
              Enter the 6-digit code sent to <strong>{email}</strong>
            </p>
            <div className="form-group">
              <label><KeyRound size={14} style={{ display: 'inline', verticalAlign: -2, marginRight: 6 }} />OTP Code</label>
              <input type="text" value={otpCode} onChange={(e) => setOtpCode(e.target.value)}
                placeholder="123456" maxLength={6} required autoFocus
                style={{ textAlign: 'center', fontSize: '1.5rem', letterSpacing: '0.5em' }} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}
              style={{ width: '100%', justifyContent: 'center' }}>
              {loading ? 'Verifying…' : 'Verify OTP'}
            </button>
            <button type="button" onClick={() => { setStep('credentials'); setOtpCode(''); }}
              className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }}>
              Back
            </button>
          </form>
        )}

        {/* Dev login — only in development */}
        {import.meta.env.DEV && (
          <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
            <button onClick={handleDevLogin} disabled={loading}
              style={{ background: 'none', color: 'var(--text-muted)', fontSize: '0.75rem', textDecoration: 'underline' }}>
              Dev Login (skip OTP)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
