import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "../exports");
fs.mkdirSync(OUT_DIR, { recursive: true });

// DATABASE_URL extracted from running server process
const dbUrl = process.env.DATABASE_URL;

const conn = await mysql.createConnection({ uri: dbUrl, dateStrings: ["DATE"] });

function toCSV(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map(h => escape(row[h])).join(","));
  }
  return lines.join("\n");
}

async function dump(filename, sql) {
  const [rows] = await conn.query(sql);
  const csv = toCSV(rows);
  const fp = path.join(OUT_DIR, filename);
  fs.writeFileSync(fp, csv, "utf8");
  console.log(`  ✓ ${filename}: ${rows.length} rows → ${fp}`);
  return rows.length;
}

console.log("\n=== VNC ICU Portal — Full Database Dump ===");
console.log(`Timestamp: ${new Date().toISOString()}\n`);

// 1. Employees (all, including inactive)
await dump("01_employees.csv", `
  SELECT
    id, employee_number, first_name, last_name, email,
    role, category, shift,
    seniority_date, is_active, is_verified,
    created_at, updated_at
  FROM employees
  ORDER BY seniority_date ASC, last_name ASC
`);

// 2. Vacation requests (all statuses)
await dump("02_vacation_requests.csv", `
  SELECT
    r.id AS request_id,
    e.employee_number,
    e.first_name,
    e.last_name,
    e.email,
    e.shift,
    e.role,
    e.seniority_date,
    r.request_type,
    r.priority,
    r.continuity_type,
    r.status,
    r.comment,
    r.decision_note,
    r.submitted_at,
    r.decided_at,
    r.decided_by,
    r.prior_status,
    r.withdrawn_at,
    r.created_at,
    r.updated_at
  FROM requests r
  JOIN employees e ON r.employee_id = e.id
  ORDER BY r.created_at ASC
`);

// 3. Request dates — the core record (one row per date per request)
await dump("03_request_dates.csv", `
  SELECT
    rd.id AS date_record_id,
    r.id AS request_id,
    e.employee_number,
    e.first_name,
    e.last_name,
    e.email,
    e.shift,
    e.seniority_date,
    rd.date AS requested_date,
    r.request_type,
    r.priority,
    r.continuity_type,
    r.status,
    r.submitted_at AS request_submitted_at,
    r.decided_at,
    r.decision_note
  FROM request_dates rd
  JOIN requests r ON rd.request_id = r.id
  JOIN employees e ON r.employee_id = e.id
  ORDER BY e.seniority_date ASC, rd.date ASC
`);

// 4. Request dates — grouped by employee, sorted by date (for reconstruction)
await dump("04_dates_by_employee.csv", `
  SELECT
    e.employee_number,
    e.first_name,
    e.last_name,
    e.email,
    e.shift,
    e.seniority_date,
    r.id AS request_id,
    r.priority,
    r.request_type,
    r.continuity_type,
    r.status,
    rd.date AS requested_date,
    r.submitted_at AS request_submitted_at,
    r.decided_at,
    r.decision_note
  FROM request_dates rd
  JOIN requests r ON rd.request_id = r.id
  JOIN employees e ON r.employee_id = e.id
  ORDER BY e.last_name ASC, e.first_name ASC, rd.date ASC
`);

// 5. Audit log (full history of all actions)
await dump("05_audit_log.csv", `
  SELECT
    al.id AS audit_id,
    al.actor_id,
    al.action,
    al.target_type,
    al.target_id,
    al.details,
    al.timestamp AS action_timestamp
  FROM audit_log al
  ORDER BY al.timestamp ASC
`);

// 6. Approved requests only (for cross-check)
await dump("06_approved_requests.csv", `
  SELECT
    rd.id AS date_record_id,
    r.id AS request_id,
    e.employee_number,
    e.first_name,
    e.last_name,
    e.email,
    e.shift,
    e.seniority_date,
    rd.date AS approved_date,
    r.request_type,
    r.priority,
    r.continuity_type,
    r.decision_note,
    r.decided_at AS decision_date,
    r.decided_by
  FROM request_dates rd
  JOIN requests r ON rd.request_id = r.id
  JOIN employees e ON r.employee_id = e.id
  WHERE r.status = 'approved'
  ORDER BY rd.date ASC, e.seniority_date ASC
`);

await conn.end();
console.log("\nDump complete. Files written to:", OUT_DIR);
