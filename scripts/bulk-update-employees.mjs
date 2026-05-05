/**
 * Bulk update script: updates seniority_date and employee_number
 * for each row in the CSV, matching by email (primary) then first+last name (fallback).
 *
 * Usage: node scripts/bulk-update-employees.mjs /path/to/file.csv
 */
import { createPool } from "mysql2/promise";
import { readFileSync } from "fs";
import { resolve } from "path";

const csvPath = process.argv[2] ?? resolve(import.meta.dirname, "../../upload/vnc-icu-employees-active-2026-05-04-updated.csv");

// ── Parse CSV ────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map(h => h.trim());
  return lines.slice(1).map(line => {
    // Handle quoted fields
    const fields = [];
    let cur = "", inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === "," && !inQ) { fields.push(cur.trim()); cur = ""; }
      else { cur += ch; }
    }
    fields.push(cur.trim());
    return Object.fromEntries(headers.map((h, i) => [h, fields[i] ?? ""]));
  });
}

const raw = readFileSync(csvPath, "utf8");
const rows = parseCSV(raw);
console.log(`Parsed ${rows.length} rows from CSV.`);

// ── Connect to DB ────────────────────────────────────────────────────────────
const pool = createPool({ uri: process.env.DATABASE_URL, waitForConnections: true, connectionLimit: 5 });

// ── Load all DB employees ────────────────────────────────────────────────────
const [dbRows] = await pool.query("SELECT id, email, first_name, last_name FROM employees");

// Build lookup maps
const byEmail = new Map();
const byName  = new Map();
for (const row of dbRows) {
  byEmail.set(row.email.toLowerCase().trim(), row.id);
  const nameKey = `${row.first_name.toLowerCase().trim()}|${row.last_name.toLowerCase().trim()}`;
  byName.set(nameKey, row.id);
}

// ── Process updates ──────────────────────────────────────────────────────────
let updated = 0, skipped = 0, notFound = 0;
const notFoundList = [];
const skippedList  = [];

for (const row of rows) {
  const csvEmail    = (row.email ?? "").toLowerCase().trim();
  const csvFirst    = (row.first_name ?? "").toLowerCase().trim();
  const csvLast     = (row.last_name ?? "").toLowerCase().trim();
  const csvEmpNum   = (row.employee_number ?? "").trim();
  const csvSenDate  = (row.seniority_date ?? "").trim();

  if (!csvSenDate) { skippedList.push(`${row.first_name} ${row.last_name} — no seniority_date`); skipped++; continue; }

  // Match by email first, then by name
  let dbId = byEmail.get(csvEmail);
  if (!dbId) {
    const nameKey = `${csvFirst}|${csvLast}`;
    dbId = byName.get(nameKey);
  }

  if (!dbId) {
    notFoundList.push(`${row.first_name} ${row.last_name} <${row.email}>`);
    notFound++;
    continue;
  }

  // Run the update
  await pool.query(
    "UPDATE employees SET seniority_date = ?, employee_number = ? WHERE id = ?",
    [csvSenDate, csvEmpNum || null, dbId]
  );
  updated++;
}

await pool.end();

// ── Report ───────────────────────────────────────────────────────────────────
console.log("\n=== BULK UPDATE COMPLETE ===");
console.log(`  Updated : ${updated}`);
console.log(`  Skipped : ${skipped}`);
console.log(`  Not found in DB: ${notFound}`);

if (skippedList.length) {
  console.log("\nSkipped rows (no seniority_date):");
  skippedList.forEach(s => console.log("  -", s));
}
if (notFoundList.length) {
  console.log("\nNot found in DB (no email or name match):");
  notFoundList.forEach(s => console.log("  -", s));
}
