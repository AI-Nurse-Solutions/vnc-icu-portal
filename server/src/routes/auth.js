const { Router } = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { sendOTP, sendPasswordResetOTP } = require('../services/email');
const { logAction } = require('../services/audit');
const { requireAuth } = require('../middleware/auth');

const router = Router();

// Step 1: Login with email/password -> sends OTP
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const { rows } = await db.query(
      'SELECT id, email, password_hash, role, first_name, last_name, shift, is_active, otp_locked_until, has_set_password FROM employees WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = rows[0];
    if (!user.is_active) {
      return res.status(401).json({ error: 'Account is deactivated' });
    }

    // Check OTP lockout
    if (user.otp_locked_until && new Date(user.otp_locked_until) > new Date()) {
      const mins = Math.ceil((new Date(user.otp_locked_until) - new Date()) / 60000);
      return res.status(429).json({ error: `Account locked. Try again in ${mins} minutes.` });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Block login if employee hasn't completed signup
    if (!user.has_set_password) {
      return res.status(403).json({
        error: 'Please complete your account setup first. Check your email for the invite link.',
        needsSetup: true,
      });
    }

    // Generate 6-digit OTP
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await db.query(
      'UPDATE employees SET otp_code = $1, otp_expires_at = $2, otp_attempts = 0, otp_locked_until = NULL WHERE id = $3',
      [code, expiresAt, user.id]
    );

    await sendOTP(user.email, code);

    res.json({ message: 'OTP sent to your email', requireOTP: true });
  } catch (err) {
    console.error('Login error:', err.message, err.stack);
    res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

// Step 2: Verify OTP -> creates session
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ error: 'Email and code are required' });
    }

    const { rows } = await db.query(
      'SELECT id, email, role, first_name, last_name, shift, otp_code, otp_expires_at, otp_attempts, otp_locked_until FROM employees WHERE email = $1 AND is_active = true',
      [email.toLowerCase().trim()]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid request' });
    }

    const user = rows[0];

    // Check lockout
    if (user.otp_locked_until && new Date(user.otp_locked_until) > new Date()) {
      return res.status(429).json({ error: 'Account locked due to too many attempts' });
    }

    // Check expiry
    if (!user.otp_code || new Date(user.otp_expires_at) < new Date()) {
      return res.status(401).json({ error: 'OTP expired. Please login again.' });
    }

    // Check code
    if (user.otp_code !== code.trim()) {
      const attempts = (user.otp_attempts || 0) + 1;
      if (attempts >= 3) {
        await db.query(
          'UPDATE employees SET otp_attempts = $1, otp_locked_until = $2, otp_code = NULL WHERE id = $3',
          [attempts, new Date(Date.now() + 15 * 60 * 1000), user.id]
        );
        return res.status(429).json({ error: 'Too many attempts. Account locked for 15 minutes.' });
      }
      await db.query('UPDATE employees SET otp_attempts = $1 WHERE id = $2', [attempts, user.id]);
      return res.status(401).json({ error: 'Invalid code', attemptsRemaining: 3 - attempts });
    }

    // Success - clear OTP and create session
    await db.query(
      'UPDATE employees SET otp_code = NULL, otp_expires_at = NULL, otp_attempts = 0, otp_locked_until = NULL WHERE id = $1',
      [user.id]
    );

    req.session.userId = user.id;
    req.session.email = user.email;
    req.session.role = user.role;
    req.session.firstName = user.first_name;
    req.session.lastName = user.last_name;
    req.session.shift = user.shift;

    await logAction({ actorId: user.id, action: 'login', targetType: 'employee', targetId: user.id });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.first_name,
        lastName: user.last_name,
        shift: user.shift,
      },
    });
  } catch (err) {
    console.error('OTP verify error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Dev-only: skip OTP for development
if (process.env.NODE_ENV === 'development') {
  router.post('/dev-login', async (req, res) => {
    try {
      const { email, password } = req.body;
      const { rows } = await db.query(
        'SELECT id, email, role, first_name, last_name, shift, password_hash FROM employees WHERE email = $1 AND is_active = true',
        [email.toLowerCase().trim()]
      );
      if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
      const user = rows[0];
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

      req.session.userId = user.id;
      req.session.email = user.email;
      req.session.role = user.role;
      req.session.firstName = user.first_name;
      req.session.lastName = user.last_name;
      req.session.shift = user.shift;

      res.json({
        user: { id: user.id, email: user.email, role: user.role, firstName: user.first_name, lastName: user.last_name, shift: user.shift },
      });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}

router.post('/logout', requireAuth, async (req, res) => {
  await logAction({ actorId: req.session.userId, action: 'logout', targetType: 'employee', targetId: req.session.userId });
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out' });
  });
});

router.get('/me', requireAuth, async (req, res) => {
  const { rows } = await db.query(
    'SELECT id, employee_number, first_name, last_name, seniority_date, shift, email, role FROM employees WHERE id = $1',
    [req.session.userId]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
  const u = rows[0];
  res.json({
    id: u.id, employeeNumber: u.employee_number, firstName: u.first_name, lastName: u.last_name,
    seniorityDate: u.seniority_date, shift: u.shift, email: u.email, role: u.role,
  });
});

router.put('/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    const { rows } = await db.query('SELECT password_hash FROM employees WHERE id = $1', [req.session.userId]);
    const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE employees SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, req.session.userId]);
    await logAction({ actorId: req.session.userId, action: 'change_password', targetType: 'employee', targetId: req.session.userId });
    res.json({ message: 'Password updated' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Validate invite token (for signup page)
router.post('/validate-invite', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token is required' });

    const { rows } = await db.query(
      'SELECT id, first_name, last_name, email FROM employees WHERE invite_token = $1 AND invite_expires_at > NOW() AND has_set_password = FALSE AND is_active = TRUE',
      [token]
    );

    if (rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired invite link. Please contact your administrator for a new invite.' });
    }

    res.json({ firstName: rows[0].first_name, lastName: rows[0].last_name, email: rows[0].email });
  } catch (err) {
    console.error('Validate invite error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Complete signup — set password from invite token
router.post('/set-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password || password.length < 8) {
      return res.status(400).json({ error: 'Token and password (min 8 characters) are required' });
    }

    const { rows } = await db.query(
      'SELECT id, email FROM employees WHERE invite_token = $1 AND invite_expires_at > NOW() AND has_set_password = FALSE AND is_active = TRUE',
      [token]
    );

    if (rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired invite link. Please contact your administrator for a new invite.' });
    }

    const hash = await bcrypt.hash(password, 10);
    await db.query(
      'UPDATE employees SET password_hash = $1, invite_token = NULL, invite_expires_at = NULL, has_set_password = TRUE, updated_at = NOW() WHERE id = $2',
      [hash, rows[0].id]
    );

    await logAction({ actorId: rows[0].id, action: 'signup_complete', targetType: 'employee', targetId: rows[0].id });

    res.json({ message: 'Password set successfully. You can now log in.' });
  } catch (err) {
    console.error('Set password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Forgot password — send reset OTP
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const { rows } = await db.query(
      'SELECT id, email, first_name, has_set_password, otp_locked_until FROM employees WHERE email = $1 AND is_active = TRUE',
      [email.toLowerCase().trim()]
    );

    // Always return same message to prevent email enumeration
    const successMsg = 'If that email exists, a reset code has been sent.';

    if (rows.length === 0 || !rows[0].has_set_password) {
      return res.json({ message: successMsg });
    }

    const user = rows[0];

    // Check OTP lockout
    if (user.otp_locked_until && new Date(user.otp_locked_until) > new Date()) {
      return res.json({ message: successMsg });
    }

    // Generate 6-digit OTP (same pattern as login)
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.query(
      'UPDATE employees SET otp_code = $1, otp_expires_at = $2, otp_attempts = 0, otp_locked_until = NULL WHERE id = $3',
      [code, expiresAt, user.id]
    );

    await sendPasswordResetOTP(user.email, code);

    res.json({ message: successMsg });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reset password — verify OTP + set new password
router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'All fields required. Password must be at least 8 characters.' });
    }

    const { rows } = await db.query(
      'SELECT id, otp_code, otp_expires_at, otp_attempts, otp_locked_until FROM employees WHERE email = $1 AND is_active = TRUE AND has_set_password = TRUE',
      [email.toLowerCase().trim()]
    );

    if (rows.length === 0) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    const user = rows[0];

    // Check lockout
    if (user.otp_locked_until && new Date(user.otp_locked_until) > new Date()) {
      return res.status(429).json({ error: 'Account locked due to too many attempts. Try again in 15 minutes.' });
    }

    // Check expiry
    if (!user.otp_code || new Date(user.otp_expires_at) < new Date()) {
      return res.status(401).json({ error: 'Code expired. Please request a new one.' });
    }

    // Check code
    if (user.otp_code !== code.trim()) {
      const attempts = (user.otp_attempts || 0) + 1;
      if (attempts >= 3) {
        await db.query(
          'UPDATE employees SET otp_attempts = $1, otp_locked_until = $2, otp_code = NULL WHERE id = $3',
          [attempts, new Date(Date.now() + 15 * 60 * 1000), user.id]
        );
        return res.status(429).json({ error: 'Too many attempts. Account locked for 15 minutes.' });
      }
      await db.query('UPDATE employees SET otp_attempts = $1 WHERE id = $2', [attempts, user.id]);
      return res.status(401).json({ error: 'Invalid code', attemptsRemaining: 3 - attempts });
    }

    // Success — update password and clear OTP
    const hash = await bcrypt.hash(newPassword, 10);
    await db.query(
      'UPDATE employees SET password_hash = $1, otp_code = NULL, otp_expires_at = NULL, otp_attempts = 0, otp_locked_until = NULL, updated_at = NOW() WHERE id = $2',
      [hash, user.id]
    );

    await logAction({ actorId: user.id, action: 'password_reset', targetType: 'employee', targetId: user.id });

    res.json({ message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
