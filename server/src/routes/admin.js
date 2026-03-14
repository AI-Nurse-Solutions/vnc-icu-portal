const { Router } = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const db = require('../config/db');
const { requireRole } = require('../middleware/auth');
const { logAction } = require('../services/audit');
const { sendInvite } = require('../services/email');

const router = Router();

// Get all employees
router.get('/employees', requireRole('manager', 'admin'), async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT id, employee_number, first_name, last_name, seniority_date, shift, email, role, is_active, has_set_password, created_at
      FROM employees ORDER BY last_name, first_name
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// CSV import employees
router.post('/employees/import', requireRole('admin'), async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { csvData } = req.body;
    if (!csvData) return res.status(400).json({ error: 'csvData is required' });

    const records = parse(csvData, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    await client.query('BEGIN');
    let imported = 0;
    let skipped = 0;
    const errors = [];
    const newEmployees = []; // Track newly created employees for invite emails

    for (const rec of records) {
      try {
        const empNum = rec.employee_number || rec.employeeNumber;
        const firstName = rec.first_name || rec.firstName;
        const lastName = rec.last_name || rec.lastName;
        const seniorityDate = rec.seniority_date || rec.seniorityDate;
        const shift = (rec.shift || 'AM').toUpperCase();
        const email = (rec.email || '').toLowerCase().trim();
        const role = rec.role || 'employee';

        if (!empNum || !firstName || !lastName || !seniorityDate || !email) {
          errors.push(`Row missing required fields: ${JSON.stringify(rec)}`);
          skipped++;
          continue;
        }

        // Generate invite token and random placeholder password for new employees
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours
        const placeholderHash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);

        const result = await client.query(`
          INSERT INTO employees (employee_number, first_name, last_name, seniority_date, shift, email, role, password_hash, invite_token, invite_expires_at, has_set_password)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, FALSE)
          ON CONFLICT (employee_number) DO UPDATE SET
            first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
            seniority_date = EXCLUDED.seniority_date, shift = EXCLUDED.shift,
            email = EXCLUDED.email, updated_at = NOW()
          RETURNING id, (xmax = 0) as is_new
        `, [empNum, firstName, lastName, seniorityDate, shift, email, role, placeholderHash, token, expiresAt]);

        imported++;

        // Track new employees (not updated) for sending invite emails
        if (result.rows[0]?.is_new) {
          newEmployees.push({ id: result.rows[0].id, email, firstName, token });
        }
      } catch (e) {
        errors.push(`Error importing ${rec.employee_number}: ${e.message}`);
        skipped++;
      }
    }

    await client.query('COMMIT');
    await logAction({
      actorId: req.session.userId, action: 'csv_import',
      targetType: 'employee', targetId: null,
      details: { imported, skipped, newEmployees: newEmployees.length, errors: errors.slice(0, 5) },
    });

    // Send invite emails to newly created employees (outside transaction)
    let invitesSent = 0;
    for (const emp of newEmployees) {
      try {
        await sendInvite(emp.email, emp.firstName, emp.token);
        invitesSent++;
      } catch (emailErr) {
        console.error(`Failed to send invite to ${emp.email}:`, emailErr.message);
      }
    }

    res.json({ imported, skipped, invitesSent, errors: errors.slice(0, 10) });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Import failed: ' + err.message });
  } finally {
    client.release();
  }
});

// CSV export approved requests
router.get('/requests/export', requireRole('manager', 'admin'), async (req, res) => {
  try {
    const { startDate, endDate, shift } = req.query;
    let where = ["r.status = 'approved'"];
    const params = [];
    let idx = 1;

    if (startDate) { where.push(`rd.date >= $${idx++}`); params.push(startDate); }
    if (endDate) { where.push(`rd.date <= $${idx++}`); params.push(endDate); }
    if (shift) { where.push(`e.shift = $${idx++}`); params.push(shift); }

    const { rows } = await db.query(`
      SELECT e.employee_number, e.first_name, e.last_name, e.shift, rd.date,
             r.request_type, r.continuity_type
      FROM request_dates rd
      JOIN requests r ON r.id = rd.request_id
      JOIN employees e ON e.id = r.employee_id
      WHERE ${where.join(' AND ')}
      ORDER BY rd.date, e.shift, e.last_name
    `, params);

    const csv = stringify(rows, {
      header: true,
      columns: ['employee_number', 'first_name', 'last_name', 'shift', 'date', 'request_type', 'continuity_type'],
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="approved_requests.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Config management
router.get('/config', requireRole('manager', 'admin'), async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM config ORDER BY key');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/config', requireRole('admin'), async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key || value === undefined) return res.status(400).json({ error: 'key and value required' });

    await db.query(
      'UPDATE config SET value = $1, updated_by = $2, updated_at = NOW() WHERE key = $3',
      [String(value), req.session.userId, key]
    );
    await logAction({
      actorId: req.session.userId, action: 'update_config',
      targetType: 'config', targetId: null, details: { key, value },
    });
    res.json({ message: 'Config updated' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Blackout dates management
router.post('/blackouts', requireRole('manager', 'admin'), async (req, res) => {
  try {
    const { date, reason } = req.body;
    if (!date) return res.status(400).json({ error: 'date is required' });

    await db.query(
      'INSERT INTO blackout_dates (date, created_by, reason) VALUES ($1, $2, $3) ON CONFLICT (date) DO UPDATE SET reason = EXCLUDED.reason',
      [date, req.session.userId, reason || null]
    );
    await logAction({
      actorId: req.session.userId, action: 'add_blackout',
      targetType: 'blackout', targetId: null, details: { date, reason },
    });
    res.json({ message: 'Blackout date added' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/blackouts/:id', requireRole('manager', 'admin'), async (req, res) => {
  try {
    await db.query('DELETE FROM blackout_dates WHERE id = $1', [req.params.id]);
    await logAction({
      actorId: req.session.userId, action: 'remove_blackout',
      targetType: 'blackout', targetId: parseInt(req.params.id),
    });
    res.json({ message: 'Blackout date removed' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Submission deadlines management
router.post('/deadlines', requireRole('manager', 'admin'), async (req, res) => {
  try {
    const { deadlineDate, coverageStart, coverageEnd, year } = req.body;
    if (!deadlineDate || !coverageStart || !coverageEnd || !year) {
      return res.status(400).json({ error: 'All fields required' });
    }
    const result = await db.query(
      'INSERT INTO submission_deadlines (deadline_date, coverage_start, coverage_end, year, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [deadlineDate, coverageStart, coverageEnd, year, req.session.userId]
    );
    await logAction({
      actorId: req.session.userId, action: 'add_deadline',
      targetType: 'deadline', targetId: result.rows[0].id,
    });
    res.json({ id: result.rows[0].id, message: 'Deadline added' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/deadlines/:id', requireRole('manager', 'admin'), async (req, res) => {
  try {
    await db.query('DELETE FROM submission_deadlines WHERE id = $1', [req.params.id]);
    res.json({ message: 'Deadline removed' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Audit log
router.get('/audit-log', requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT al.*, e.first_name, e.last_name, e.email
      FROM audit_log al
      LEFT JOIN employees e ON e.id = al.actor_id
      ORDER BY al.timestamp DESC
      LIMIT 200
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Employee management
router.put('/employees/:id', requireRole('admin'), async (req, res) => {
  try {
    const { role, shift, isActive } = req.body;
    const updates = [];
    const params = [];
    let idx = 1;

    if (role) { updates.push(`role = $${idx++}`); params.push(role); }
    if (shift) { updates.push(`shift = $${idx++}`); params.push(shift); }
    if (isActive !== undefined) { updates.push(`is_active = $${idx++}`); params.push(isActive); }
    updates.push(`updated_at = NOW()`);
    params.push(req.params.id);

    await db.query(`UPDATE employees SET ${updates.join(', ')} WHERE id = $${idx}`, params);
    await logAction({
      actorId: req.session.userId, action: 'update_employee',
      targetType: 'employee', targetId: parseInt(req.params.id),
      details: req.body,
    });
    res.json({ message: 'Employee updated' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Resend invite email to an employee who hasn't set their password yet
router.post('/employees/:id/resend-invite', requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, email, first_name, has_set_password FROM employees WHERE id = $1',
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const emp = rows[0];

    if (emp.has_set_password) {
      return res.status(400).json({ error: 'Employee has already set their password' });
    }

    // Generate new token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    await db.query(
      'UPDATE employees SET invite_token = $1, invite_expires_at = $2, updated_at = NOW() WHERE id = $3',
      [token, expiresAt, emp.id]
    );

    await sendInvite(emp.email, emp.first_name, token);

    await logAction({
      actorId: req.session.userId, action: 'resend_invite',
      targetType: 'employee', targetId: emp.id,
    });

    res.json({ message: `Invite resent to ${emp.email}` });
  } catch (err) {
    console.error('Resend invite error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
