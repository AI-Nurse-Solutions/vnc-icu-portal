require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../src/config/db');

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if data already exists
    const { rows } = await client.query('SELECT COUNT(*) FROM employees');
    if (parseInt(rows[0].count) > 0) {
      console.log('Seed data already exists. Skipping.');
      await client.query('COMMIT');
      return;
    }

    const hash = await bcrypt.hash('password123', 10);

    // Admin
    await client.query(`
      INSERT INTO employees (employee_number, first_name, last_name, seniority_date, shift, email, role, password_hash)
      VALUES ('ADM001', 'Sarah', 'Chen', '2010-03-15', 'AM', 'admin@vncicu.dev', 'admin', $1)
    `, [hash]);

    // Managers (4)
    const managers = [
      ['MGR001', 'David', 'Rodriguez', '2012-06-01', 'AM', 'david.r@vncicu.dev'],
      ['MGR002', 'Lisa', 'Thompson', '2011-09-20', 'PM', 'lisa.t@vncicu.dev'],
      ['MGR003', 'Marcus', 'Washington', '2013-01-10', 'NOC', 'marcus.w@vncicu.dev'],
      ['MGR004', 'Jennifer', 'Park', '2014-04-05', 'AM', 'jennifer.p@vncicu.dev'],
    ];
    for (const m of managers) {
      await client.query(`
        INSERT INTO employees (employee_number, first_name, last_name, seniority_date, shift, email, role, password_hash)
        VALUES ($1, $2, $3, $4, $5, $6, 'manager', $7)
      `, [...m, hash]);
    }

    // Employees (25)
    const employees = [
      ['EMP001', 'Laura', 'Martinez', '2015-02-14', 'AM', 'laura.m@vncicu.dev'],
      ['EMP002', 'James', 'Kim', '2016-08-22', 'AM', 'james.k@vncicu.dev'],
      ['EMP003', 'Rachel', 'O\'Brien', '2017-03-10', 'AM', 'rachel.o@vncicu.dev'],
      ['EMP004', 'Michael', 'Nguyen', '2015-11-05', 'AM', 'michael.n@vncicu.dev'],
      ['EMP005', 'Emily', 'Johnson', '2018-01-15', 'AM', 'emily.j@vncicu.dev'],
      ['EMP006', 'Daniel', 'Lee', '2016-05-30', 'AM', 'daniel.l@vncicu.dev'],
      ['EMP007', 'Amanda', 'Garcia', '2019-07-01', 'AM', 'amanda.g@vncicu.dev'],
      ['EMP008', 'Kevin', 'Brown', '2014-12-01', 'AM', 'kevin.b@vncicu.dev'],
      ['EMP009', 'Sophia', 'Davis', '2017-09-18', 'PM', 'sophia.d@vncicu.dev'],
      ['EMP010', 'Ryan', 'Wilson', '2016-04-12', 'PM', 'ryan.w@vncicu.dev'],
      ['EMP011', 'Olivia', 'Taylor', '2018-06-25', 'PM', 'olivia.t@vncicu.dev'],
      ['EMP012', 'Brandon', 'Anderson', '2015-08-03', 'PM', 'brandon.a@vncicu.dev'],
      ['EMP013', 'Jessica', 'Thomas', '2019-02-20', 'PM', 'jessica.t@vncicu.dev'],
      ['EMP014', 'Tyler', 'Jackson', '2017-11-08', 'PM', 'tyler.j@vncicu.dev'],
      ['EMP015', 'Megan', 'White', '2016-10-15', 'PM', 'megan.w@vncicu.dev'],
      ['EMP016', 'Andrew', 'Harris', '2020-01-06', 'PM', 'andrew.h@vncicu.dev'],
      ['EMP017', 'Nicole', 'Clark', '2015-05-22', 'NOC', 'nicole.c@vncicu.dev'],
      ['EMP018', 'Christopher', 'Lewis', '2018-03-30', 'NOC', 'chris.l@vncicu.dev'],
      ['EMP019', 'Ashley', 'Robinson', '2016-12-11', 'NOC', 'ashley.r@vncicu.dev'],
      ['EMP020', 'Justin', 'Walker', '2019-08-14', 'NOC', 'justin.w@vncicu.dev'],
      ['EMP021', 'Samantha', 'Hall', '2017-06-07', 'NOC', 'samantha.h@vncicu.dev'],
      ['EMP022', 'Matthew', 'Allen', '2015-10-25', 'NOC', 'matthew.a@vncicu.dev'],
      ['EMP023', 'Brittany', 'Young', '2020-04-17', 'NOC', 'brittany.y@vncicu.dev'],
      ['EMP024', 'Nathan', 'King', '2018-11-02', 'NOC', 'nathan.k@vncicu.dev'],
      ['EMP025', 'Kayla', 'Wright', '2016-07-19', 'AM', 'kayla.w@vncicu.dev'],
    ];
    for (const e of employees) {
      await client.query(`
        INSERT INTO employees (employee_number, first_name, last_name, seniority_date, shift, email, role, password_hash)
        VALUES ($1, $2, $3, $4, $5, $6, 'employee', $7)
      `, [...e, hash]);
    }

    // Sample requests (50)
    const today = new Date();
    const year = today.getFullYear();
    const statuses = ['pending', 'approved', 'denied', 'approved', 'approved', 'pending'];

    for (let i = 0; i < 50; i++) {
      const empId = (i % 25) + 6; // employee IDs 6-30
      const type = i % 7 === 0 ? 'education' : 'vacation';
      const status = statuses[i % statuses.length];
      const monthOffset = Math.floor(i / 10) - 1;
      const startDay = (i % 20) + 1;
      const month = ((today.getMonth() + monthOffset + 12) % 12);
      const startDate = new Date(year, month, startDay);

      const numDays = type === 'education' ? (i % 3) + 1 : (i % 5) + 1;
      const decidedBy = status !== 'pending' ? ((i % 4) + 2) : null; // manager IDs 2-5

      const result = await client.query(`
        INSERT INTO requests (employee_id, request_type, continuity_type, status, decided_by, decided_at, comment)
        VALUES ($1, $2, 'continuous', $3, $4, $5, $6)
        RETURNING id
      `, [
        empId,
        type,
        status,
        decidedBy,
        decidedBy ? new Date(startDate.getTime() - 7 * 86400000) : null,
        i % 5 === 0 ? 'Family event' : null,
      ]);

      // Insert request dates
      for (let d = 0; d < numDays; d++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + d);
        // Skip weekends
        const dow = date.getDay();
        if (dow === 0 || dow === 6) continue;
        const dateStr = date.toISOString().split('T')[0];
        await client.query(
          'INSERT INTO request_dates (request_id, date) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [result.rows[0].id, dateStr]
        );
      }
    }

    // Blackout dates (3)
    await client.query(`
      INSERT INTO blackout_dates (date, created_by, reason) VALUES
        ('${year}-12-24', 1, 'Christmas Eve - limited staffing'),
        ('${year}-12-25', 1, 'Christmas Day - limited staffing'),
        ('${year}-12-31', 1, 'New Year''s Eve - limited staffing')
    `);

    // Submission deadlines (3)
    await client.query(`
      INSERT INTO submission_deadlines (deadline_date, coverage_start, coverage_end, year, created_by) VALUES
        ('${year}-01-15', '${year}-02-01', '${year}-05-31', ${year}, 1),
        ('${year}-05-15', '${year}-06-01', '${year}-09-30', ${year}, 1),
        ('${year}-09-15', '${year}-10-01', '${year + 1}-01-31', ${year}, 1)
    `);

    await client.query('COMMIT');
    console.log('Seed data inserted successfully.');
    console.log('  1 admin (admin@vncicu.dev / password123)');
    console.log('  4 managers');
    console.log('  25 employees');
    console.log('  50 sample requests');
    console.log('  3 blackout dates');
    console.log('  3 submission deadlines');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seeding failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
