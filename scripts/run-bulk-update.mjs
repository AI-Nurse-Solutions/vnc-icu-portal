/**
 * Wrapper: reads DATABASE_URL from the running server process env,
 * then runs the bulk employee update.
 */
import { execSync, spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Extract DATABASE_URL from the running tsx server process
const pid = execSync("pgrep -f 'tsx.*server' | head -1").toString().trim();
if (!pid) throw new Error("Server process not found — is the dev server running?");

const envEntries = execSync(`cat /proc/${pid}/environ`).toString().split("\0");
const dbEntry = envEntries.find(e => e.startsWith("DATABASE_URL="));
if (!dbEntry) throw new Error("DATABASE_URL not found in server process environment");

const DATABASE_URL = dbEntry.slice("DATABASE_URL=".length);
process.env.DATABASE_URL = DATABASE_URL;

// Now run the actual update script inline
const csvPath = process.argv[2] ?? resolve(__dirname, "../../upload/vnc-icu-employees-active-2026-05-04-updated.csv");

import { createPool } from "mysql2/promise";
import { readFileSync } from "fs";

function parseCSV(text) {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map(h => h.trim());
  return lines.slice(1).map(line => {
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

const pool = createPool({ uri: DATABASE_URL, waitForConnections: true, connectionLimit: 5 });

const [dbRows] = await pool.query("SELECT id, email, first_name, last_name FROM employees");

const byEmail = new Map();
const byName  = new Map();
for (const row of dbRows) {
  byEmail.set(row.email.toLowerCase().trim(), row.id);
  const nameKey = `${row.first_name.toLowerCase().trim()}|${row.last_name.toLowerCase().trim()}`;
  byName.set(nameKey, row.id);
}

let updated = 0, skipped = 0, notFound = 0, dupConflict = 0;
const notFoundList = [];
const skippedList  = [];
const dupList = [];

for (const row of rows) {
  const csvEmail   = (row.email ?? "").toLowerCase().trim();
  const csvFirst   = (row.first_name ?? "").toLowerCase().trim();
  const csvLast    = (row.last_name ?? "").toLowerCase().trim();
  const csvEmpNum  = (row.employee_number ?? "").trim();
  const csvSenDate = (row.seniority_date ?? "").trim();

  if (!csvSenDate) {
    skippedList.push(`${row.first_name} ${row.last_name} — no seniority_date`);
    skipped++;
    continue;
  }

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

  try {
    await pool.query(
      "UPDATE employees SET seniority_date = ?, employee_number = ? WHERE id = ?",
      [csvSenDate, csvEmpNum || null, dbId]
    );
    updated++;
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      // Try updating seniority_date only, leaving employee_number unchanged
      try {
        await pool.query(
          "UPDATE employees SET seniority_date = ? WHERE id = ?",
          [csvSenDate, dbId]
        );
        dupList.push(`${row.first_name} ${row.last_name} <${row.email}> — emp# '${csvEmpNum}' conflicts; seniority_date updated only`);
        updated++;
      } catch (err2) {
        dupList.push(`${row.first_name} ${row.last_name} <${row.email}> — FAILED: ${err2.message}`);
        dupConflict++;
      }
    } else {
      throw err;
    }
  }
}

await pool.end();

console.log("\n=== BULK UPDATE COMPLETE ===");
console.log(`  Updated         : ${updated}`);
console.log(`  Skipped         : ${skipped}`);
console.log(`  Not found in DB : ${notFound}`);
console.log(`  Emp# conflicts  : ${dupList.length}`);

if (skippedList.length) {
  console.log("\nSkipped (no seniority_date):");
  skippedList.forEach(s => console.log("  -", s));
}
if (notFoundList.length) {
  console.log("\nNot found in DB (no email or name match):");
  notFoundList.forEach(s => console.log("  -", s));
}
if (dupList.length) {
  console.log("\nEmployee number conflicts (seniority_date updated only):");
  dupList.forEach(s => console.log("  -", s));
}
