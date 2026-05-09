/**
 * VNC ICU Portal — Final Reconstruction Export
 * Source of truth: audit_log (what employees actually selected)
 * Produces two files:
 *   09_original_requests_by_employee.csv  — one row per date, sorted by employee seniority then date
 *   10_original_requests_summary.csv      — one row per request batch with all dates on one line
 */
import mysql from 'mysql2/promise';
import { createWriteStream, mkdirSync } from 'fs';

const conn = await mysql.createConnection({ uri: process.env.DATABASE_URL, dateStrings: ['DATE'] });
mkdirSync('/home/ubuntu/vnc-icu-portal/exports', { recursive: true });

console.log('=== VNC ICU Portal — Final Reconstruction from Audit Log ===');
console.log('Timestamp:', new Date().toISOString());

// ── 1. All submit entries joined with employee data ──────────────────────────
const [submits] = await conn.query(`
  SELECT
    al.id          AS audit_id,
    al.actor_id    AS employee_db_id,
    al.target_id   AS request_id,
    al.details     AS submit_details,
    al.timestamp   AS submitted_at,
    e.employee_number,
    e.first_name,
    e.last_name,
    e.email,
    e.shift,
    e.role,
    e.seniority_date
  FROM audit_log al
  LEFT JOIN employees e ON e.id = al.actor_id
  WHERE al.action = 'submit'
  ORDER BY e.seniority_date ASC, al.timestamp ASC
`);

// ── 2. Final priority per request (last update_priority wins; fallback to requests table) ──
const [priorityUpdates] = await conn.query(`
  SELECT target_id AS request_id, details, timestamp
  FROM audit_log
  WHERE action = 'update_priority'
  ORDER BY timestamp ASC
`);
const finalPriority = {};
const priorityHistory = {};
for (const p of priorityUpdates) {
  const reqId = p.request_id;
  const d = typeof p.details === 'string' ? JSON.parse(p.details) : p.details;
  finalPriority[reqId] = d.priority;
  if (!priorityHistory[reqId]) priorityHistory[reqId] = [];
  priorityHistory[reqId].push({
    priority: d.priority,
    set_at: p.timestamp instanceof Date ? p.timestamp.toISOString() : String(p.timestamp)
  });
}

// Also pull current priority from requests table as authoritative fallback
const [reqRows] = await conn.query(`SELECT id, priority, status, request_type FROM requests`);
const reqMap = {};
for (const r of reqRows) reqMap[r.id] = r;

// ── 3. Helper ────────────────────────────────────────────────────────────────
function esc(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// ── 4. FILE A: one row per date ──────────────────────────────────────────────
const headersA = [
  'seniority_rank_order',
  'employee_number',
  'last_name',
  'first_name',
  'email',
  'shift',
  'role',
  'seniority_date',
  'request_id',
  'submitted_at',
  'request_type',
  'current_status',
  'final_priority',
  'priority_history',
  'original_date_selected'
];

const wsA = createWriteStream('/home/ubuntu/vnc-icu-portal/exports/09_original_requests_by_employee.csv');
wsA.write(headersA.join(',') + '\n');

let rowsA = 0;
let rank = 0;
let lastEmpId = null;

for (const s of submits) {
  const d = typeof s.submit_details === 'string' ? JSON.parse(s.submit_details) : s.submit_details;
  const dates = (d.dates || []).sort();
  const reqType = d.requestType || '';
  const reqId = s.request_id;

  const dbReq = reqMap[reqId] || {};
  const currentStatus = dbReq.status || 'unknown';
  // Use requests table priority as most authoritative; fall back to last audit update
  const priority = dbReq.priority ?? finalPriority[reqId] ?? '';

  const ph = priorityHistory[reqId]
    ? priorityHistory[reqId].map(p => `P${p.priority}@${p.set_at.split('T')[0]}`).join(' → ')
    : '';

  const senDate = s.seniority_date
    ? (s.seniority_date instanceof Date ? s.seniority_date.toISOString().split('T')[0] : String(s.seniority_date).split('T')[0])
    : '';

  const submittedAt = s.submitted_at instanceof Date
    ? s.submitted_at.toISOString()
    : String(s.submitted_at);

  if (s.employee_db_id !== lastEmpId) {
    rank++;
    lastEmpId = s.employee_db_id;
  }

  for (const date of dates) {
    const row = [
      rank,
      s.employee_number || '',
      s.last_name || '',
      s.first_name || '',
      s.email || '',
      s.shift || '',
      s.role || '',
      senDate,
      reqId,
      submittedAt,
      reqType,
      currentStatus,
      priority,
      ph,
      date   // ← original date exactly as employee selected it
    ];
    wsA.write(row.map(esc).join(',') + '\n');
    rowsA++;
  }
}

wsA.end();
await new Promise(r => wsA.on('finish', r));
console.log(`  ✓ 09_original_requests_by_employee.csv: ${rowsA} rows`);

// ── 5. FILE B: one row per request batch (all dates on one line) ─────────────
const headersB = [
  'seniority_rank_order',
  'employee_number',
  'last_name',
  'first_name',
  'email',
  'shift',
  'role',
  'seniority_date',
  'request_id',
  'submitted_at',
  'request_type',
  'current_status',
  'final_priority',
  'priority_history',
  'date_count',
  'original_dates_selected'
];

const wsB = createWriteStream('/home/ubuntu/vnc-icu-portal/exports/10_original_requests_summary.csv');
wsB.write(headersB.join(',') + '\n');

let rowsB = 0;
rank = 0;
lastEmpId = null;

for (const s of submits) {
  const d = typeof s.submit_details === 'string' ? JSON.parse(s.submit_details) : s.submit_details;
  const dates = (d.dates || []).sort();
  const reqType = d.requestType || '';
  const reqId = s.request_id;

  const dbReq = reqMap[reqId] || {};
  const currentStatus = dbReq.status || 'unknown';
  const priority = dbReq.priority ?? finalPriority[reqId] ?? '';

  const ph = priorityHistory[reqId]
    ? priorityHistory[reqId].map(p => `P${p.priority}@${p.set_at.split('T')[0]}`).join(' → ')
    : '';

  const senDate = s.seniority_date
    ? (s.seniority_date instanceof Date ? s.seniority_date.toISOString().split('T')[0] : String(s.seniority_date).split('T')[0])
    : '';

  const submittedAt = s.submitted_at instanceof Date
    ? s.submitted_at.toISOString()
    : String(s.submitted_at);

  if (s.employee_db_id !== lastEmpId) {
    rank++;
    lastEmpId = s.employee_db_id;
  }

  const row = [
    rank,
    s.employee_number || '',
    s.last_name || '',
    s.first_name || '',
    s.email || '',
    s.shift || '',
    s.role || '',
    senDate,
    reqId,
    submittedAt,
    reqType,
    currentStatus,
    priority,
    ph,
    dates.length,
    dates.join(' | ')   // ← all original dates on one line, pipe-separated
  ];
  wsB.write(row.map(esc).join(',') + '\n');
  rowsB++;
}

wsB.end();
await new Promise(r => wsB.on('finish', r));
console.log(`  ✓ 10_original_requests_summary.csv: ${rowsB} rows`);

await conn.end();
console.log('\nDone. Audit log is the source of truth — no DB date conversion applied.');
