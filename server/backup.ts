/**
 * Daily Backup Service
 *
 * Runs at 2:00 AM Pacific every day.
 * Backs up:
 *   1. Full MySQL database dump → backups/database/YYYY-MM-DD.sql.gz
 *   2. Audit log rows from last 24h → backups/audit-logs/YYYY-MM-DD-audit.json
 *   3. Git diff summary of code changes → backups/code-snapshots/YYYY-MM-DD-diff.txt
 *
 * Commits and pushes all three to the private GitHub backup repo.
 */

import { execSync, spawnSync } from "child_process";
import { createWriteStream, mkdirSync, writeFileSync, existsSync } from "fs";
import { createGzip } from "zlib";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import path from "path";
import os from "os";
import { getDb } from "./db";
import { auditLog } from "../drizzle/schema";
import { gte } from "drizzle-orm";

const GITHUB_TOKEN = process.env.GITHUB_BACKUP_TOKEN || "";
const BACKUP_REPO = "AI-Nurse-Solutions/vnc-icu-portal-backup";
const BACKUP_REPO_URL = `https://AI-Nurse-Solutions:${GITHUB_TOKEN}@github.com/${BACKUP_REPO}.git`;
const PROJECT_DIR = process.cwd();

function getDateStr(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function parseDatabaseUrl(): { host: string; port: string; user: string; pass: string; db: string } | null {
  const url = process.env.DATABASE_URL || "";
  const m = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:/]+)(?::(\d+))?\/([^?]+)/);
  if (!m) return null;
  return {
    user: m[1],
    pass: m[2],
    host: m[3],
    port: m[4] || "3306",
    db: m[5].split("?")[0],
  };
}

async function dumpDatabase(outDir: string, dateStr: string): Promise<string> {
  const conn = parseDatabaseUrl();
  if (!conn) throw new Error("Cannot parse DATABASE_URL");

  const outFile = path.join(outDir, `${dateStr}.sql.gz`);

  // Run mysqldump and pipe through gzip
  const dumpResult = spawnSync(
    "mysqldump",
    [
      "--ssl-mode=REQUIRED",
      `-h${conn.host}`,
      `-P${conn.port}`,
      `-u${conn.user}`,
      `-p${conn.pass}`,
      "--no-tablespaces",
      "--routines",
      "--triggers",
      conn.db,
    ],
    { maxBuffer: 100 * 1024 * 1024 } // 100MB
  );

  if (dumpResult.status !== 0) {
    const errMsg = dumpResult.stderr?.toString() || "unknown error";
    // Filter out the password warning line
    const filtered = errMsg.split("\n").filter((l) => !l.includes("Using a password")).join("\n");
    if (filtered.trim()) throw new Error(`mysqldump failed: ${filtered.slice(0, 500)}`);
  }

  const sqlData = dumpResult.stdout;
  const readable = Readable.from(sqlData);
  const gzip = createGzip({ level: 9 });
  const dest = createWriteStream(outFile);
  await pipeline(readable, gzip, dest);

  const sizeMb = (sqlData.length / 1024 / 1024).toFixed(2);
  console.log(`[Backup] DB dump: ${outFile} (${sizeMb} MB raw → gzipped)`);
  return outFile;
}

async function exportAuditLog(outDir: string, dateStr: string): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database connection unavailable");
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const rows = await db
    .select()
    .from(auditLog)
    .where(gte(auditLog.timestamp, since))
    .orderBy(auditLog.timestamp);

  const outFile = path.join(outDir, `${dateStr}-audit.json`);
  writeFileSync(outFile, JSON.stringify({ exportedAt: new Date().toISOString(), count: rows.length, rows }, null, 2));
  console.log(`[Backup] Audit log: ${rows.length} rows → ${outFile}`);
  return outFile;
}

function exportCodeSnapshot(outDir: string, dateStr: string): string {
  const outFile = path.join(outDir, `${dateStr}-diff.txt`);

  let content = `VNC ICU Portal — Code Snapshot\nDate: ${dateStr}\nGenerated: ${new Date().toISOString()}\n\n`;

  try {
    // Get the last 24h of git commits
    const log = execSync(
      `git -C "${PROJECT_DIR}" log --oneline --since="24 hours ago" 2>/dev/null || echo "(no commits in last 24h)"`,
      { encoding: "utf8" }
    );
    content += `=== COMMITS (last 24h) ===\n${log.trim() || "(none)"}\n\n`;

    // Get a compact diff stat
    const diffStat = execSync(
      `git -C "${PROJECT_DIR}" diff --stat HEAD~1 HEAD 2>/dev/null || echo "(no diff available)"`,
      { encoding: "utf8" }
    );
    content += `=== DIFF STAT ===\n${diffStat.trim()}\n`;
  } catch {
    content += "(git not available in this environment)\n";
  }

  writeFileSync(outFile, content);
  console.log(`[Backup] Code snapshot → ${outFile}`);
  return outFile;
}

function cloneOrPullBackupRepo(repoDir: string): void {
  if (!GITHUB_TOKEN) {
    throw new Error("GITHUB_BACKUP_TOKEN is not set — cannot push to backup repo");
  }

  if (existsSync(path.join(repoDir, ".git"))) {
    execSync(`git -C "${repoDir}" pull --ff-only 2>&1`, { encoding: "utf8" });
  } else {
    mkdirSync(repoDir, { recursive: true });
    execSync(`git clone "${BACKUP_REPO_URL}" "${repoDir}" 2>&1`, { encoding: "utf8" });
  }
}

function commitAndPush(repoDir: string, dateStr: string): void {
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: "VNC ICU Backup Bot",
    GIT_AUTHOR_EMAIL: "backup@vnc-icu-portal.local",
    GIT_COMMITTER_NAME: "VNC ICU Backup Bot",
    GIT_COMMITTER_EMAIL: "backup@vnc-icu-portal.local",
  };

  execSync(`git -C "${repoDir}" add -A`, { env });
  const status = execSync(`git -C "${repoDir}" status --porcelain`, { encoding: "utf8", env });
  if (!status.trim()) {
    console.log("[Backup] Nothing changed — skipping commit");
    return;
  }

  execSync(`git -C "${repoDir}" commit -m "backup: daily snapshot ${dateStr}"`, { env });
  execSync(`git -C "${repoDir}" push origin main 2>&1`, { env });
  console.log(`[Backup] Pushed to ${BACKUP_REPO}`);
}

export async function runDailyBackup(): Promise<{ success: boolean; message: string }> {
  const dateStr = getDateStr();
  const repoDir = path.join(os.tmpdir(), "vnc-icu-backup-repo");

  console.log(`[Backup] Starting daily backup for ${dateStr}`);

  try {
    cloneOrPullBackupRepo(repoDir);

    const dbDir = path.join(repoDir, "backups", "database");
    const auditDir = path.join(repoDir, "backups", "audit-logs");
    const codeDir = path.join(repoDir, "backups", "code-snapshots");
    mkdirSync(dbDir, { recursive: true });
    mkdirSync(auditDir, { recursive: true });
    mkdirSync(codeDir, { recursive: true });

    await dumpDatabase(dbDir, dateStr);
    await exportAuditLog(auditDir, dateStr);
    exportCodeSnapshot(codeDir, dateStr);

    commitAndPush(repoDir, dateStr);

    const msg = `Daily backup completed successfully for ${dateStr}`;
    console.log(`[Backup] ✓ ${msg}`);
    return { success: true, message: msg };
  } catch (err) {
    const msg = `Daily backup FAILED for ${dateStr}: ${(err as Error).message}`;
    console.error(`[Backup] ✗ ${msg}`);
    return { success: false, message: msg };
  }
}
