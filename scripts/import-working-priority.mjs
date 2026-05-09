/**
 * Imports working_priority values from 11_working_priority_requests.csv
 * into the requests.working_priority column.
 *
 * Matches on request_id (the CSV has a request_id column).
 * Withdrawn rows have blank working_priority → set to NULL.
 */

import { createReadStream } from "fs";
import { createInterface } from "readline";
import mysql from "mysql2/promise";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH = path.join(__dirname, "../exports/11_working_priority_requests.csv");

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

// Parse mysql://user:pass@host:port/db
const url = new URL(DB_URL);
const conn = await mysql.createConnection({
  host: url.hostname,
  port: parseInt(url.port || "3306"),
  user: url.username,
  password: url.password,
  database: url.pathname.replace(/^\//, ""),
  ssl: { rejectUnauthorized: false },
});

console.log("Connected to DB");

// Read CSV
const rl = createInterface({ input: createReadStream(CSV_PATH) });
let headers = null;
const updates = []; // { requestId, workingPriority }

for await (const line of rl) {
  if (!headers) {
    headers = line.split(",");
    continue;
  }
  const cols = line.split(",");
  const row = Object.fromEntries(headers.map((h, i) => [h.trim(), cols[i]?.trim() ?? ""]));

  const requestId = parseInt(row["request_id"]);
  const wp = row["working_priority"];

  if (isNaN(requestId)) continue;

  updates.push({
    requestId,
    workingPriority: wp === "" || wp === undefined ? null : parseInt(wp),
  });
}

console.log(`Parsed ${updates.length} rows from CSV`);

// Batch update
let updated = 0;
let nulled = 0;
for (const { requestId, workingPriority } of updates) {
  await conn.execute(
    "UPDATE requests SET working_priority = ? WHERE id = ?",
    [workingPriority, requestId]
  );
  if (workingPriority === null) nulled++;
  else updated++;
}

console.log(`Updated: ${updated} rows with working_priority value`);
console.log(`Nulled:  ${nulled} rows (withdrawn — working_priority set to NULL)`);

// Verify
const [rows] = await conn.execute(
  "SELECT working_priority, COUNT(*) as cnt FROM requests GROUP BY working_priority ORDER BY working_priority"
);
console.log("\nDistribution of working_priority in DB:");
for (const r of rows) {
  console.log(`  WP=${r.working_priority ?? "NULL"}: ${r.cnt} rows`);
}

await conn.end();
console.log("\nDone.");
