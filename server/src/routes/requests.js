const { Router } = require('express');
const db = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { logAction } = require('../services/audit');
const { sendRequestNotification } = require('../services/email');

const router = Router();

// Get current user's requests
router.get('/my', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT r.*, array_agg(rd.date ORDER BY rd.date) as dates
      FROM requests r
      JOIN request_dates rd ON rd.request_id = r.id
      WHERE r.employee_id = $1
      GROUP BY r.id
      ORDER BY r.submitted_at DESC
    `, [req.session.userId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Submit a new request
router.post('/', requireAuth, async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { requestType, continuityType, dates, comment, priority } = req.body;
    if (!requestType || !dates || !Array.isArray(dates) || dates.length === 0) {
      return res.status(400).json({ error: 'Request type and dates are required' });
    }

    // Validate priority: required for vacation (1-9), not allowed for education
    const priorityValue = requestType === 'vacation' ? (parseInt(priority) || null) : null;
    if (requestType === 'vacation' && (!priorityValue || priorityValue < 1 || priorityValue > 9)) {
      return res.status(400).json({ error: 'Priority (1-9) is required for vacation requests' });
    }

    await client.query('BEGIN');

    // Check blackout dates
    const blackoutCheck = await client.query(
      'SELECT date FROM blackout_dates WHERE date = ANY($1::date[])',
      [dates]
    );
    if (blackoutCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Request includes blackout dates',
        blackoutDates: blackoutCheck.rows.map(r => r.date),
      });
    }

    // Check 21-day rolling limit for vacation requests
    if (requestType === 'vacation') {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const { rows: usedRows } = await client.query(`
        SELECT COUNT(DISTINCT rd.date) as used_days
        FROM request_dates rd
        JOIN requests r ON r.id = rd.request_id
        WHERE r.employee_id = $1 AND r.request_type = 'vacation'
          AND r.status IN ('approved', 'pending')
          AND rd.date >= $2
      `, [req.session.userId, sixMonthsAgo.toISOString().split('T')[0]]);

      const usedDays = parseInt(usedRows[0].used_days);
      if (usedDays + dates.length > 21) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Would exceed 21-day rolling limit. ${21 - usedDays} days remaining.`,
          usedDays, remaining: 21 - usedDays,
        });
      }
    }

    const result = await client.query(`
      INSERT INTO requests (employee_id, request_type, continuity_type, comment, priority)
      VALUES ($1, $2, $3, $4, $5) RETURNING id
    `, [req.session.userId, requestType, continuityType || 'continuous', comment || null, priorityValue]);

    const requestId = result.rows[0].id;

    for (const date of dates) {
      await client.query(
        'INSERT INTO request_dates (request_id, date) VALUES ($1, $2)',
        [requestId, date]
      );
    }

    await logAction({
      actorId: req.session.userId, action: 'submit_request',
      targetType: 'request', targetId: requestId,
      details: { requestType, dates, continuityType, priority: priorityValue },
    });

    await client.query('COMMIT');

    res.status(201).json({ id: requestId, message: 'Request submitted' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Submit request error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// Withdraw a request
router.put('/:id/withdraw', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM requests WHERE id = $1 AND employee_id = $2',
      [req.params.id, req.session.userId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Request not found' });
    if (!['pending', 'approved'].includes(rows[0].status)) {
      return res.status(400).json({ error: 'Cannot withdraw this request' });
    }

    await db.query(
      'UPDATE requests SET status = $1, prior_status = $2, withdrawn_at = NOW(), updated_at = NOW() WHERE id = $3',
      ['withdrawn', rows[0].status, req.params.id]
    );

    await logAction({
      actorId: req.session.userId, action: 'withdraw_request',
      targetType: 'request', targetId: parseInt(req.params.id),
      details: { priorStatus: rows[0].status },
    });

    res.json({ message: 'Request withdrawn' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Manager: get pending requests for their review
router.get('/pending', requireRole('manager', 'admin'), async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT r.*, e.first_name, e.last_name, e.shift, e.seniority_date, e.employee_number,
             array_agg(rd.date ORDER BY rd.date) as dates
      FROM requests r
      JOIN employees e ON e.id = r.employee_id
      JOIN request_dates rd ON rd.request_id = r.id
      WHERE r.status = 'pending'
      GROUP BY r.id, e.first_name, e.last_name, e.shift, e.seniority_date, e.employee_number
      ORDER BY e.seniority_date ASC, r.submitted_at ASC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Manager: get all requests (with filters)
router.get('/all', requireRole('manager', 'admin'), async (req, res) => {
  try {
    const { status, shift, month, year } = req.query;
    let where = [];
    let params = [];
    let idx = 1;

    if (status) { where.push(`r.status = $${idx++}`); params.push(status); }
    if (shift) { where.push(`e.shift = $${idx++}`); params.push(shift); }
    if (month && year) {
      where.push(`EXISTS (SELECT 1 FROM request_dates rd2 WHERE rd2.request_id = r.id AND EXTRACT(MONTH FROM rd2.date) = $${idx++} AND EXTRACT(YEAR FROM rd2.date) = $${idx++})`);
      params.push(parseInt(month), parseInt(year));
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    const { rows } = await db.query(`
      SELECT r.*, e.first_name, e.last_name, e.shift, e.seniority_date, e.employee_number,
             array_agg(rd.date ORDER BY rd.date) as dates
      FROM requests r
      JOIN employees e ON e.id = r.employee_id
      JOIN request_dates rd ON rd.request_id = r.id
      ${whereClause}
      GROUP BY r.id, e.first_name, e.last_name, e.shift, e.seniority_date, e.employee_number
      ORDER BY r.submitted_at DESC
    `, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Manager: approve/deny
router.put('/:id/decide', requireRole('manager', 'admin'), async (req, res) => {
  try {
    const { status, decisionNote } = req.body;
    if (!['approved', 'denied'].includes(status)) {
      return res.status(400).json({ error: 'Status must be approved or denied' });
    }

    const { rows } = await db.query('SELECT * FROM requests WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Request not found' });
    if (rows[0].status !== 'pending') {
      return res.status(400).json({ error: 'Request is not pending' });
    }

    await db.query(
      `UPDATE requests SET status = $1, decided_by = $2, decided_at = NOW(), decision_note = $3, updated_at = NOW()
       WHERE id = $4`,
      [status, req.session.userId, decisionNote || null, req.params.id]
    );

    // Send notification email
    const { rows: empRows } = await db.query(
      'SELECT e.email, e.first_name, e.last_name FROM employees e WHERE e.id = $1',
      [rows[0].employee_id]
    );
    const { rows: dateRows } = await db.query(
      'SELECT date FROM request_dates WHERE request_id = $1 ORDER BY date', [req.params.id]
    );
    if (empRows.length > 0) {
      const emp = empRows[0];
      const dateStr = dateRows.map(r => r.date.toISOString().split('T')[0]).join(', ');
      sendRequestNotification({
        to: emp.email, employeeName: `${emp.first_name} ${emp.last_name}`,
        requestType: rows[0].request_type, dates: dateStr, status,
      }).catch(err => console.error('Email error:', err));
    }

    await logAction({
      actorId: req.session.userId, action: `${status}_request`,
      targetType: 'request', targetId: parseInt(req.params.id),
      details: { decisionNote },
    });

    res.json({ message: `Request ${status}` });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
