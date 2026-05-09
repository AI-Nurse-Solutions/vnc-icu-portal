/**
 * export-working-priority.mjs
 *
 * Reads 09_original_requests_by_employee.csv and produces
 * 11_working_priority_requests.csv with a new `working_priority` column.
 *
 * Rules (applied per employee, grouped by employee_number):
 *
 * 1. Employee has at least one request with final_priority != 5
 *    AND no priority_history on any row
 *    → They ranked intentionally. Keep final_priority as working_priority.
 *    → BUT any P5 requests in their set need re-ranking (Rule 2-style):
 *      assign them the next available rank after the highest intentional rank,
 *      ordered by earliest requested vacation date in the batch.
 *
 * 2. Employee has exactly one non-withdrawn request, final_priority = 5,
 *    no priority_history
 *    → working_priority = 1 (only submission = first choice by definition)
 *
 * 3. Employee has multiple non-withdrawn requests, ALL final_priority = 5,
 *    no priority_history on any
 *    → Rank by earliest requested vacation date in each batch (ASC).
 *    → Tie-break: earlier submission timestamp = lower working priority number.
 *
 * 4. Employee has priority_history on any row
 *    → Respect final_priority as working_priority for ALL their requests.
 *    → (They clearly engaged with the priority system.)
 *
 * 5. Withdrawn requests → working_priority = '' (blank, excluded)
 *
 * Output: exports/11_working_priority_requests.csv
 * Same columns as 09, plus `working_priority` appended.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXPORTS_DIR = path.join(__dirname, '..', 'exports');
const INPUT_FILE = path.join(EXPORTS_DIR, '09_original_requests_by_employee.csv');
const OUTPUT_FILE = path.join(EXPORTS_DIR, '11_working_priority_requests.csv');

// ── Load CSV ──────────────────────────────────────────────────────────────────
const raw = fs.readFileSync(INPUT_FILE, 'utf8');
const rows = parse(raw, { columns: true, skip_empty_lines: true });

console.log(`Loaded ${rows.length} rows from 09_original_requests_by_employee.csv`);

// ── Group rows by employee_number ─────────────────────────────────────────────
const empMap = new Map(); // employee_number → rows[]
for (const row of rows) {
  const key = row.employee_number;
  if (!empMap.has(key)) empMap.set(key, []);
  empMap.get(key).push(row);
}

console.log(`Unique employees: ${empMap.size}`);

// ── Helper: group rows by request_id ─────────────────────────────────────────
function groupByRequest(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.request_id)) map.set(r.request_id, []);
    map.get(r.request_id).push(r);
  }
  return map;
}

// ── Helper: earliest vacation date in a request group ────────────────────────
function earliestDate(reqRows) {
  return reqRows.map(r => r.original_date_selected).sort()[0];
}

// ── Helper: submission timestamp of a request group ──────────────────────────
function submittedAt(reqRows) {
  return reqRows[0].submitted_at; // same for all rows in a request
}

// ── Process each employee ─────────────────────────────────────────────────────
const stats = {
  rule1_kept: 0,
  rule1_p5_reranked: 0,
  rule2_single_p5: 0,
  rule3_all_p5_multi: 0,
  rule4_has_history: 0,
  withdrawn_skipped: 0,
};

// We'll build a map: request_id → working_priority (number or '')
const reqWorkingPriority = new Map(); // request_id → working_priority string

for (const [empNum, empRows] of empMap) {
  const nonWithdrawn = empRows.filter(r => r.current_status !== 'withdrawn');
  const withdrawn = empRows.filter(r => r.current_status === 'withdrawn');

  // Withdrawn rows always get blank
  for (const r of withdrawn) {
    reqWorkingPriority.set(r.request_id + '|' + r.original_date_selected, '');
    stats.withdrawn_skipped++;
  }

  if (nonWithdrawn.length === 0) continue;

  // Group non-withdrawn by request_id
  const reqGroups = groupByRequest(nonWithdrawn);

  // Check if any row has priority_history
  const hasAnyHistory = nonWithdrawn.some(r => r.priority_history && r.priority_history.trim() !== '');

  // Check priorities across all non-withdrawn requests
  const allPriorities = new Set(nonWithdrawn.map(r => parseInt(r.final_priority)));
  const allAreP5 = allPriorities.size === 1 && allPriorities.has(5);
  const hasNonP5 = [...allPriorities].some(p => p !== 5);

  // ── Rule 4: has priority history → respect final_priority ─────────────────
  if (hasAnyHistory) {
    for (const [reqId, reqRows] of reqGroups) {
      const priority = reqRows[0].final_priority;
      for (const r of reqRows) {
        reqWorkingPriority.set(r.request_id + '|' + r.original_date_selected, priority);
      }
    }
    stats.rule4_has_history += reqGroups.size;
    continue;
  }

  // ── Rule 2: single request, all P5, no history ────────────────────────────
  if (reqGroups.size === 1 && allAreP5) {
    for (const [reqId, reqRows] of reqGroups) {
      for (const r of reqRows) {
        reqWorkingPriority.set(r.request_id + '|' + r.original_date_selected, '1');
      }
    }
    stats.rule2_single_p5++;
    continue;
  }

  // ── Rule 3: multiple requests, ALL P5, no history ─────────────────────────
  if (allAreP5 && reqGroups.size > 1) {
    // Sort requests by earliest vacation date ASC, tie-break by submitted_at ASC
    const sortedReqs = [...reqGroups.entries()].sort((a, b) => {
      const dateA = earliestDate(a[1]);
      const dateB = earliestDate(b[1]);
      if (dateA !== dateB) return dateA < dateB ? -1 : 1;
      const tsA = submittedAt(a[1]);
      const tsB = submittedAt(b[1]);
      return tsA < tsB ? -1 : 1;
    });

    let rank = 1;
    for (const [reqId, reqRows] of sortedReqs) {
      for (const r of reqRows) {
        reqWorkingPriority.set(r.request_id + '|' + r.original_date_selected, String(rank));
      }
      rank++;
    }
    stats.rule3_all_p5_multi += reqGroups.size;
    continue;
  }

  // ── Rule 1 + mixed P5 re-ranking ──────────────────────────────────────────
  // Employee has intentional non-P5 priorities (no history needed — they set them).
  // Keep non-P5 requests as-is.
  // For P5 requests: assign next available rank after the max intentional rank,
  // ordered by earliest vacation date ASC, tie-break by submitted_at ASC.

  // Separate intentional (non-P5) and unranked (P5) requests
  const intentionalReqs = [...reqGroups.entries()].filter(([, rows]) => parseInt(rows[0].final_priority) !== 5);
  const unrankedReqs = [...reqGroups.entries()].filter(([, rows]) => parseInt(rows[0].final_priority) === 5);

  // Assign intentional priorities as-is
  for (const [reqId, reqRows] of intentionalReqs) {
    const priority = reqRows[0].final_priority;
    for (const r of reqRows) {
      reqWorkingPriority.set(r.request_id + '|' + r.original_date_selected, priority);
    }
    stats.rule1_kept++;
  }

  // Find the highest rank number used by intentional requests
  const usedRanks = new Set(intentionalReqs.map(([, rows]) => parseInt(rows[0].final_priority)));
  // Find next available rank (first integer not in usedRanks, starting from 1)
  let nextRank = 1;
  while (usedRanks.has(nextRank)) nextRank++;

  // Sort unranked P5 requests by earliest vacation date, tie-break by submitted_at
  const sortedUnranked = unrankedReqs.sort((a, b) => {
    const dateA = earliestDate(a[1]);
    const dateB = earliestDate(b[1]);
    if (dateA !== dateB) return dateA < dateB ? -1 : 1;
    const tsA = submittedAt(a[1]);
    const tsB = submittedAt(b[1]);
    return tsA < tsB ? -1 : 1;
  });

  for (const [reqId, reqRows] of sortedUnranked) {
    // Skip rank numbers already used by intentional requests
    while (usedRanks.has(nextRank)) nextRank++;
    for (const r of reqRows) {
      reqWorkingPriority.set(r.request_id + '|' + r.original_date_selected, String(nextRank));
    }
    nextRank++;
    stats.rule1_p5_reranked++;
  }
}

// ── Build output rows ─────────────────────────────────────────────────────────
const outputRows = rows.map(row => {
  const key = row.request_id + '|' + row.original_date_selected;
  const wp = reqWorkingPriority.has(key) ? reqWorkingPriority.get(key) : '';
  return { ...row, working_priority: wp };
});

// ── Write CSV ─────────────────────────────────────────────────────────────────
const csvOut = stringify(outputRows, { header: true });
fs.writeFileSync(OUTPUT_FILE, csvOut);

console.log(`\nOutput written to: ${OUTPUT_FILE}`);
console.log(`Total output rows: ${outputRows.length}`);
console.log('\nStats:');
console.log(`  Rule 1 (intentional, kept):          ${stats.rule1_kept} requests`);
console.log(`  Rule 1 (mixed P5, re-ranked):         ${stats.rule1_p5_reranked} requests`);
console.log(`  Rule 2 (single P5 → WP=1):           ${stats.rule2_single_p5} requests`);
console.log(`  Rule 3 (all P5 multi, chronological): ${stats.rule3_all_p5_multi} requests`);
console.log(`  Rule 4 (has history, respected):      ${stats.rule4_has_history} requests`);
console.log(`  Withdrawn (blank):                    ${stats.withdrawn_skipped} rows`);

// ── Spot-check output ─────────────────────────────────────────────────────────
console.log('\n=== Spot checks ===');

// Blanchard: mixed P5 + non-P5, no history
const blanchardRows = outputRows.filter(r => r.last_name === 'Blanchard' && r.current_status !== 'withdrawn');
const blanchardReqs = new Map();
for (const r of blanchardRows) {
  if (!blanchardReqs.has(r.request_id)) blanchardReqs.set(r.request_id, r);
}
console.log('Blanchard (mixed P5+non-P5, no history):');
for (const [reqId, r] of blanchardReqs) {
  console.log(`  req#${reqId} final_P${r.final_priority} → working_P${r.working_priority} (${r.original_date_selected})`);
}

// Taft: all P5, no history, 3 requests
const taftRows = outputRows.filter(r => r.last_name === 'Taft' && r.current_status !== 'withdrawn');
const taftReqs = new Map();
for (const r of taftRows) {
  if (!taftReqs.has(r.request_id)) taftReqs.set(r.request_id, r);
}
console.log('\nTaft (all P5, no history, 3 requests):');
for (const [reqId, r] of taftReqs) {
  console.log(`  req#${reqId} final_P${r.final_priority} → working_P${r.working_priority} (earliest: ${r.original_date_selected})`);
}

// Working priority distribution
const wpDist = {};
for (const r of outputRows) {
  const wp = r.working_priority || '(blank/withdrawn)';
  wpDist[wp] = (wpDist[wp] || 0) + 1;
}
console.log('\nWorking priority distribution:');
for (const [k, v] of Object.entries(wpDist).sort((a, b) => {
  const na = parseInt(a[0]), nb = parseInt(b[0]);
  if (!isNaN(na) && !isNaN(nb)) return na - nb;
  return a[0].localeCompare(b[0]);
})) {
  console.log(`  P${k}: ${v} rows`);
}
