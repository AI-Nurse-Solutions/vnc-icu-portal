const { Router } = require('express');
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const router = Router();

// Get daily demand counts for a month (per shift)
router.get('/demand', requireAuth, async (req, res) => {
  try {
    let year, month;

    // Support both ?month=2026-03 and ?year=2026&month=3
    if (req.query.month && req.query.month.includes('-')) {
      const parts = req.query.month.split('-');
      year = parseInt(parts[0]);
      month = parseInt(parts[1]);
    } else {
      year = parseInt(req.query.year);
      month = parseInt(req.query.month);
    }

    if (!year || !month) return res.status(400).json({ error: 'month parameter required (e.g. ?month=2026-03)' });

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    // Get approved + pending counts per date per shift
    const { rows } = await db.query(`
      SELECT rd.date::text as date, e.shift, COUNT(*) as count
      FROM request_dates rd
      JOIN requests r ON r.id = rd.request_id
      JOIN employees e ON e.id = r.employee_id
      WHERE rd.date >= $1 AND rd.date <= $2
        AND r.status IN ('approved', 'pending')
      GROUP BY rd.date, e.shift
      ORDER BY rd.date
    `, [startDate, endDate]);

    // Aggregate into per-date objects with am_count, pm_count, noc_count
    const dayMap = {};
    rows.forEach(r => {
      if (!dayMap[r.date]) {
        dayMap[r.date] = { date: r.date, am_count: 0, pm_count: 0, noc_count: 0 };
      }
      const key = `${r.shift.toLowerCase()}_count`;
      dayMap[r.date][key] = parseInt(r.count);
    });

    // Get config thresholds
    const { rows: configRows } = await db.query(
      "SELECT key, value FROM config WHERE key IN ('cap_am','cap_pm','cap_noc','color_yellow_threshold','color_red_threshold')"
    );
    const config = {};
    configRows.forEach(r => config[r.key] = parseInt(r.value));

    // Get blackout dates for this month (cast to text for string comparison on client)
    const { rows: blackouts } = await db.query(
      'SELECT date::text as date, reason FROM blackout_dates WHERE date >= $1 AND date <= $2',
      [startDate, endDate]
    );

    res.json({ days: Object.values(dayMap), config, blackouts });
  } catch (err) {
    console.error('Calendar demand error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get requests for a specific date (drill-down)
router.get('/date/:date', requireAuth, async (req, res) => {
  try {
    const { date } = req.params;
    const { shift } = req.query;

    let shiftFilter = '';
    const params = [date];
    if (shift) {
      shiftFilter = 'AND e.shift = $2';
      params.push(shift);
    }

    const isManager = ['manager', 'admin'].includes(req.session.role);

    const { rows } = await db.query(`
      SELECT r.id, r.request_type, r.status, r.submitted_at,
             e.first_name, e.last_name, e.shift, e.seniority_date, e.employee_number
      FROM request_dates rd
      JOIN requests r ON r.id = rd.request_id
      JOIN employees e ON e.id = r.employee_id
      WHERE rd.date = $1 AND r.status IN ('approved', 'pending') ${shiftFilter}
      ORDER BY e.seniority_date ASC, r.submitted_at ASC
    `, params);

    // Apply name display rule: First Name + Last Initial for employees, full name for managers
    const formatted = rows.map(r => ({
      ...r,
      display_name: isManager
        ? `${r.first_name} ${r.last_name}`
        : `${r.first_name} ${r.last_name.charAt(0)}.`,
    }));

    res.json({ requests: formatted });
  } catch (err) {
    console.error('Calendar drilldown error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get blackout dates
router.get('/blackouts', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT id, date::text as date, reason, created_at FROM blackout_dates ORDER BY date');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get submission deadlines
router.get('/deadlines', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM submission_deadlines ORDER BY deadline_date');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
