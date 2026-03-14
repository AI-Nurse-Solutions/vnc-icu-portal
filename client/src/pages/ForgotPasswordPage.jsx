import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { Mail, KeyRound, Lock, CheckCircle, ArrowLeft } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [step, setStep] = useState('email'); // email | otp | newPassword | success
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const handleSendCode = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/forgot-password', { email: email.trim() });
      setInfo(res.data.message);
      setStep('otp');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send reset code.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndReset = async (e) => {
    e.preventDefault();
    setError('');

    if (step === 'otp') {
      if (!otpCode || otpCode.length !== 6) {
        setError('Please enter the 6-digit code.');
        return;
      }
      setStep('newPassword');
      return;
    }

    // Step: newPassword — validate and submit
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
      await api.post('/auth/reset-password', {
        email: email.trim(),
        code: otpCode.trim(),
        newPassword: password,
      });
      setStep('success');
    } catch (err) {
      const errData = err.response?.data;
      if (errData?.error?.includes('Invalid code') || errData?.error?.includes('expired')) {
        // Go back to OTP step so they can re-enter
        setStep('otp');
        setOtpCode('');
      }
      setError(errData?.error || 'Failed to reset password.');
      if (errData?.attemptsRemaining !== undefined) {
        setError(`Invalid code. ${errData.attemptsRemaining} attempts remaining.`);
      }
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
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Reset Your Password</div>
        </div>

        {error && (
          <div style={{ color: 'var(--danger)', fontSize: '0.8125rem', marginBottom: '1rem', textAlign: 'center' }}>
            {error}
          </div>
        )}

        {step === 'email' && (
          <form onSubmit={handleSendCode} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', textAlign: 'center' }}>
              Enter your email address and we'll send you a reset code.
            </p>
            <div className="form-group">
              <label><Mail size={14} style={{ display: 'inline', verticalAlign: -2, marginRight: 6 }} />Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@vncicu.dev" required autoFocus />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}
              style={{ width: '100%', justifyContent: 'center' }}>
              {loading ? 'Sending...' : 'Send Reset Code'}
            </button>
            <Link to="/login" className="btn btn-secondary"
              style={{ width: '100%', justifyContent: 'center', textDecoration: 'none' }}>
              <ArrowLeft size={14} /> Back to Login
            </Link>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={handleVerifyAndReset} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {info && (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', textAlign: 'center' }}>
                {info}
              </p>
            )}
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', textAlign: 'center' }}>
              Enter the 6-digit code sent to <strong>{email}</strong>
            </p>
            <div className="form-group">
              <label><KeyRound size={14} style={{ display: 'inline', verticalAlign: -2, marginRight: 6 }} />Reset Code</label>
              <input type="text" value={otpCode} onChange={(e) => setOtpCode(e.target.value)}
                placeholder="123456" maxLength={6} required autoFocus
                style={{ textAlign: 'center', fontSize: '1.5rem', letterSpacing: '0.5em' }} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={!otpCode}
              style={{ width: '100%', justifyContent: 'center' }}>
              Continue
            </button>
            <button type="button" onClick={() => { setStep('email'); setOtpCode(''); setError(''); }}
              className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }}>
              <ArrowLeft size={14} /> Back
            </button>
          </form>
        )}

        {step === 'newPassword' && (
          <form onSubmit={handleVerifyAndReset} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', textAlign: 'center' }}>
              Create your new password.
            </p>
            <div className="form-group">
              <label><Lock size={14} style={{ display: 'inline', verticalAlign: -2, marginRight: 6 }} />New Password</label>
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
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>
            <button type="button" onClick={() => { setStep('otp'); setError(''); }}
              className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }}>
              <ArrowLeft size={14} /> Back
            </button>
          </form>
        )}

        {step === 'success' && (
          <div style={{ textAlign: 'center' }}>
            <CheckCircle size={48} style={{ color: 'var(--success)', marginBottom: '1rem' }} />
            <p style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: '0.5rem' }}>Password Reset Successfully!</p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
              You can now log in with your new password.
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
