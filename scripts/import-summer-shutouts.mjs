/**
 * Reads summer_cap_shutouts.json and sets summer_shutout=true on the
 * matching request_dates rows (matched by request_id + date).
 */

import { readFileSync } from "fs";
import mysql from "mysql2/promise";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JSON_PATH = path.join(__dirname, "../exports/summer_cap_shutouts.json");

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error("DATABASE_URL not set"); process.exit(1); }

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

const affected = JSON.parse(readFileSync(JSON_PATH, "utf8"));

let total = 0;
for (const entry of affected) {
  const requestId = parseInt(entry.request_id);
  for (const dateStr of entry.shutout_dates) {
    const [result] = await conn.execute(
      "UPDATE request_dates SET summer_shutout = true WHERE request_id = ? AND date = ?",
      [requestId, dateStr]
    );
    total += result.affectedRows;
  }
}

console.log(`Flagged ${total} request_dates rows as summer_shutout=true`);

// Verify
const [rows] = await conn.execute(
  "SELECT summer_shutout, COUNT(*) as cnt FROM request_dates GROUP BY summer_shutout"
);
console.log("Distribution:");
for (const r of rows) {
  console.log(`  summer_shutout=${r.summer_shutout}: ${r.cnt} rows`);
}

await conn.end();
console.log("Done.");
