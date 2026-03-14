import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../lib/api';
import { Lock, CheckCircle, AlertCircle } from 'lucide-react';

export default function SetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState('loading'); // loading | form | success | error
  const [employee, setEmployee] = useState(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setError('No invite token provided. Please use the link from your email.');
      return;
    }

    api.post('/auth/validate-invite', { token })
      .then((res) => {
        setEmployee(res.data);
        setStatus('form');
      })
      .catch((err) => {
        setStatus('error');
        setError(err.response?.data?.error || 'Invalid or expired invite link.');
      });
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/set-password', { token, password });
      setStatus('success');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to set password.');
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
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Set Your Password</div>
        </div>

        {status === 'loading' && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem 0' }}>
            Validating invite link...
          </div>
        )}

        {status === 'error' && (
          <div style={{ textAlign: 'center' }}>
            <AlertCircle size={48} style={{ color: 'var(--danger)', marginBottom: '1rem' }} />
            <p style={{ color: 'var(--danger)', marginBottom: '1.5rem' }}>{error}</p>
            <Link to="/login" className="btn btn-secondary" style={{ display: 'inline-flex', justifyContent: 'center' }}>
              Go to Login
            </Link>
          </div>
        )}

        {status === 'form' && (
          <>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', textAlign: 'center', marginBottom: '1.5rem' }}>
              Welcome, <strong>{employee?.firstName} {employee?.lastName}</strong>! Create a password for your account.
            </p>
            {error && (
              <div style={{ color: 'var(--danger)', fontSize: '0.8125rem', marginBottom: '1rem', textAlign: 'center' }}>
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label><Lock size={14} style={{ display: 'inline', verticalAlign: -2, marginRight: 6 }} />Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 8 characters" required autoFocus />
              </div>
              <div className="form-group">
                <label><Lock size={14} style={{ display: 'inline', verticalAlign: -2, marginRight: 6 }} />Confirm Password</label>
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password" required />
              </div>
              <button type="submit" className="btn btn-primary" disabled={loading}
                style={{ width: '100%', justifyContent: 'center' }}>
                {loading ? 'Setting Password...' : 'Set Password'}
              </button>
            </form>
          </>
        )}

        {status === 'success' && (
          <div style={{ textAlign: 'center' }}>
            <CheckCircle size={48} style={{ color: 'var(--success)', marginBottom: '1rem' }} />
            <p style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: '0.5rem' }}>Password Set Successfully!</p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
              You can now log in with your email and password.
            </p>
            <Link to="/login" className="btn btn-primary" style={{ display: 'inline-flex', justifyContent: 'center', width: '100%' }}>
              Go to Login
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
