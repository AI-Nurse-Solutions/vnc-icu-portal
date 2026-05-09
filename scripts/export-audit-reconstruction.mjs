/**
 * VNC ICU Portal — Audit Log Reconstruction Export
 * Extracts original submitted dates and final priority from audit_log,
 * joined with employee names. One row per date per request.
 */
import mysql from 'mysql2/promise';
import { createWriteStream } from 'fs';
import { mkdirSync } from 'fs';

const DB_URL = process.env.DATABASE_URL;
const conn = await mysql.createConnection({ uri: DB_URL });

mkdirSync('/home/ubuntu/vnc-icu-portal/exports', { recursive: true });

console.log('=== VNC ICU Portal — Audit Log Reconstruction ===');
console.log('Timestamp:', new Date().toISOString());

// 1. Get all submit entries with employee info
const [submits] = await conn.query(`
  SELECT
    al.id AS audit_id,
    al.actor_id AS employee_db_id,
    al.target_id AS request_id,
    al.details AS submit_details,
    al.timestamp AS submitted_at,
    e.first_name,
    e.last_name,
    e.email,
    e.employee_number,
    e.seniority_date,
    e.shift,
    e.role
  FROM audit_log al
  LEFT JOIN employees e ON e.id = al.actor_id
  WHERE al.action = 'submit'
  ORDER BY al.timestamp ASC
`);

// 2. Get the FINAL priority for each request (last update_priority entry wins)
const [priorityUpdates] = await conn.query(`
  SELECT
    target_id AS request_id,
    details AS priority_details,
    timestamp AS priority_set_at
  FROM audit_log
  WHERE action = 'update_priority'
  ORDER BY timestamp ASC
`);

// Build a map: request_id -> final priority
const finalPriority = {};
const priorityHistory = {};
for (const p of priorityUpdates) {
  const reqId = p.request_id;
  const details = typeof p.priority_details === 'string'
    ? JSON.parse(p.priority_details)
    : p.priority_details;
  finalPriority[reqId] = details.priority;
  if (!priorityHistory[reqId]) priorityHistory[reqId] = [];
  priorityHistory[reqId].push({
    priority: details.priority,
    set_at: p.priority_set_at
  });
}

// 3. Also get the current priority from the requests table (most authoritative)
const [currentRequests] = await conn.query(`
  SELECT id, priority, request_type, status, continuity_type, comment
  FROM requests
`);
const requestMap = {};
for (const r of currentRequests) {
  requestMap[r.id] = r;
}

// 4. Build CSV rows — one row per date per request
function escapeCSV(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

const headers = [
  'request_id',
  'audit_id',
  'employee_db_id',
  'employee_number',
  'first_name',
  'last_name',
  'email',
  'shift',
  'role',
  'seniority_date',
  'submitted_at',
  'request_type',
  'status',
  'continuity',
  'original_date_from_audit',
  'current_date_in_db',
  'date_diff_days',
  'final_priority',
  'priority_history',
  'comments'
];

const ws = createWriteStream('/home/ubuntu/vnc-icu-portal/exports/07_audit_reconstruction.csv');
ws.write(headers.join(',') + '\n');

let totalRows = 0;
let mismatchRows = 0;

for (const s of submits) {
  const details = typeof s.submit_details === 'string'
    ? JSON.parse(s.submit_details)
    : s.submit_details;

  const originalDates = details.dates || [];
  const reqType = details.requestType || '';
  const reqId = s.request_id;

  // Get current DB request info
  const dbReq = requestMap[reqId] || {};
  const currentStatus = dbReq.status || 'unknown';
  const currentPriority = dbReq.priority ?? finalPriority[reqId] ?? '';
  const continuity = dbReq.continuity_type || '';
  const comments = dbReq.comment || '';

  // Priority history as compact string
  const ph = priorityHistory[reqId]
    ? priorityHistory[reqId].map(p => `P${p.priority}@${new Date(p.set_at).toISOString().split('T')[0]}`).join(' → ')
    : '';

  // Get current dates from DB for this request (for comparison)
  // We'll do a batch query below — for now just note the original dates
  for (const origDate of originalDates) {
    // The bug: stored date = original + 1 day
    // After correction: stored date = original (correct)
    // But we want to show: what was in audit vs what's now in DB
    const row = [
      reqId,
      s.audit_id,
      s.employee_db_id,
      s.employee_number || '',
      s.first_name || '',
      s.last_name || '',
      s.email || '',
      s.shift || '',
      s.role || '',
      s.seniority_date
        ? (s.seniority_date instanceof Date
            ? s.seniority_date.toISOString().split('T')[0]
            : String(s.seniority_date).split('T')[0])
        : '',
      s.submitted_at instanceof Date
        ? s.submitted_at.toISOString()
        : String(s.submitted_at),
      reqType,
      currentStatus,
      continuity,
      origDate,                    // original date from audit log (what employee selected)
      '',                          // current DB date — filled in next pass
      '',                          // date_diff_days
      currentPriority,
      ph,
      comments
    ];
    ws.write(row.map(escapeCSV).join(',') + '\n');
    totalRows++;
  }
}

ws.end();
await new Promise(resolve => ws.on('finish', resolve));

console.log(`  ✓ 07_audit_reconstruction.csv: ${totalRows} rows → /home/ubuntu/vnc-icu-portal/exports/07_audit_reconstruction.csv`);

// Now build a second file: compare audit dates vs current DB dates per request
// Get all current request_dates from DB
const [dbDates] = await conn.query(`
  SELECT request_id, date FROM request_dates ORDER BY request_id, date
`);

// Group DB dates by request_id
const dbDatesByReq = {};
for (const d of dbDates) {
  const reqId = d.request_id;
  if (!dbDatesByReq[reqId]) dbDatesByReq[reqId] = [];
  const dateStr = d.date instanceof Date
    ? d.date.toISOString().split('T')[0]
    : String(d.date).split('T')[0];
  dbDatesByReq[reqId].push(dateStr);
}

// Build comparison file
const headers2 = [
  'request_id',
  'employee_number',
  'first_name',
  'last_name',
  'email',
  'shift',
  'seniority_date',
  'submitted_at',
  'request_type',
  'status',
  'final_priority',
  'audit_dates_original',
  'db_dates_current',
  'dates_match',
  'audit_date_count',
  'db_date_count',
  'missing_from_db',
  'extra_in_db'
];

const ws2 = createWriteStream('/home/ubuntu/vnc-icu-portal/exports/08_date_comparison.csv');
ws2.write(headers2.join(',') + '\n');

let compRows = 0;
let mismatchCount = 0;

for (const s of submits) {
  const details = typeof s.submit_details === 'string'
    ? JSON.parse(s.submit_details)
    : s.submit_details;

  const auditDates = (details.dates || []).sort();
  const reqId = s.request_id;
  const dbReq = requestMap[reqId] || {};
  const currentPriority = dbReq.priority ?? finalPriority[reqId] ?? '';
  const currentStatus = dbReq.status || 'unknown';
  const reqType = details.requestType || '';

  const currentDbDates = (dbDatesByReq[reqId] || []).sort();

  // Compare
  const auditSet = new Set(auditDates);
  const dbSet = new Set(currentDbDates);
  const missingFromDb = auditDates.filter(d => !dbSet.has(d));
  const extraInDb = currentDbDates.filter(d => !auditSet.has(d));
  const datesMatch = missingFromDb.length === 0 && extraInDb.length === 0;

  if (!datesMatch) mismatchCount++;

  const row = [
    reqId,
    s.employee_number || '',
    s.first_name || '',
    s.last_name || '',
    s.email || '',
    s.shift || '',
    s.seniority_date
      ? (s.seniority_date instanceof Date
          ? s.seniority_date.toISOString().split('T')[0]
          : String(s.seniority_date).split('T')[0])
      : '',
    s.submitted_at instanceof Date
      ? s.submitted_at.toISOString()
      : String(s.submitted_at),
    reqType,
    currentStatus,
    currentPriority,
    auditDates.join(' | '),
    currentDbDates.join(' | '),
    datesMatch ? 'YES' : 'NO',
    auditDates.length,
    currentDbDates.length,
    missingFromDb.join(' | '),
    extraInDb.join(' | ')
  ];
  ws2.write(row.map(escapeCSV).join(',') + '\n');
  compRows++;
}

ws2.end();
await new Promise(resolve => ws2.on('finish', resolve));

console.log(`  ✓ 08_date_comparison.csv: ${compRows} rows → /home/ubuntu/vnc-icu-portal/exports/08_date_comparison.csv`);
console.log(`  ⚠ Requests with date mismatches (audit vs DB): ${mismatchCount}`);

await conn.end();
console.log('\nDone.');
