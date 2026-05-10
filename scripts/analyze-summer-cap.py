"""
Summer 14-Day Cap Analysis — CORRECTED LOGIC
=============================================
Rule: For July and August ONLY, if an employee's request contains a block of
CONSECUTIVE CALENDAR DAYS (no gaps) that exceeds 14 days, only the first 14
days of that block are allowed. Days 15+ of that same unbroken run are shut out.

Key clarifications:
- "Consecutive" means calendar days with no gap (e.g., Jul 1, 2, 3, ... 15 → day 15 is shut out)
- Scattered dates (e.g., Jul 4, 5, 9, 10, 13, 14) are NOT consecutive runs — they are separate
  2-day blocks and NONE of them are shut out
- A request that has multiple short runs (each ≤ 14 days) is NOT affected at all
- Only a single unbroken run of 15+ calendar days triggers shut-outs
- Dates outside July/August are completely ignored for this rule
"""

import csv
import json
from collections import defaultdict
from datetime import date, timedelta

CSV_PATH = "/home/ubuntu/vnc-icu-portal/exports/11_working_priority_requests.csv"

rows = list(csv.DictReader(open(CSV_PATH, encoding="utf-8")))

# Group July/August dates by request_id (exclude withdrawn)
request_summer_dates: dict[str, list[date]] = defaultdict(list)
request_meta: dict[str, dict] = {}

for row in rows:
    req_id = row["request_id"].strip()
    date_str = row["original_date_selected"].strip()
    status = row["current_status"].strip().lower()
    if status == "withdrawn":
        continue
    if not req_id or not date_str:
        continue
    try:
        d = date.fromisoformat(date_str)
    except ValueError:
        continue
    # Only July and August
    if d.month not in (7, 8):
        continue
    request_summer_dates[req_id].append(d)
    if req_id not in request_meta:
        request_meta[req_id] = {
            "employee_number": row["employee_number"].strip(),
            "last_name": row["last_name"].strip(),
            "first_name": row["first_name"].strip(),
            "shift": row["shift"].strip(),
            "working_priority": row["working_priority"].strip(),
        }

def find_consecutive_runs(dates: list[date]) -> list[list[date]]:
    """Split a sorted list of dates into groups of consecutive calendar days."""
    if not dates:
        return []
    runs = []
    current = [dates[0]]
    for d in dates[1:]:
        if d == current[-1] + timedelta(days=1):
            current.append(d)
        else:
            runs.append(current)
            current = [d]
    runs.append(current)
    return runs

affected = []

for req_id, dates in request_summer_dates.items():
    dates_sorted = sorted(set(dates))
    meta = request_meta[req_id]

    # Find all consecutive runs within the July/August dates
    runs = find_consecutive_runs(dates_sorted)

    shutout_dates = []
    allowed_dates = []

    for run in runs:
        if len(run) > 14:
            # First 14 days allowed, rest shut out
            allowed_dates.extend(run[:14])
            shutout_dates.extend(run[14:])
        else:
            # Run is 14 days or fewer — entirely allowed
            allowed_dates.extend(run)

    if shutout_dates:
        affected.append({
            "request_id": req_id,
            "employee_number": meta["employee_number"],
            "last_name": meta["last_name"],
            "first_name": meta["first_name"],
            "shift": meta["shift"],
            "working_priority": meta["working_priority"],
            "total_summer_dates": len(dates_sorted),
            "allowed_dates": len(allowed_dates),
            "shutout_count": len(shutout_dates),
            "first_shutout_date": min(shutout_dates).isoformat(),
            "last_shutout_date": max(shutout_dates).isoformat(),
            "shutout_dates": [d.isoformat() for d in sorted(shutout_dates)],
            "allowed_date_range": f"{min(allowed_dates).isoformat()} → {max(allowed_dates).isoformat()}",
            "consecutive_run_length": max(len(r) for r in runs),
        })

# Sort by last_name
affected.sort(key=lambda x: (x["last_name"], x["first_name"]))

print(f"\n{'='*75}")
print(f"SUMMER 14-DAY CAP ANALYSIS (CORRECTED) — Consecutive Calendar Days Only")
print(f"{'='*75}")
print(f"Total July/August requests analyzed: {len(request_summer_dates)}")
print(f"Requests with a consecutive run > 14 days: {len(affected)}")
print()

if affected:
    print(f"{'#':<4} {'Name':<24} {'Shift':<5} {'WP':<4} {'Req ID':<10} {'Run':<5} {'Total':<6} {'Allowed':<8} {'Shut Out':<9} {'First Shut-Out'}")
    print("-"*95)
    for i, a in enumerate(affected, 1):
        name = f"{a['last_name']}, {a['first_name']}"
        print(f"{i:<4} {name:<24} {a['shift']:<5} {a['working_priority']:<4} {a['request_id']:<10} {a['consecutive_run_length']:<5} {a['total_summer_dates']:<6} {a['allowed_dates']:<8} {a['shutout_count']:<9} {a['first_shutout_date']}")

    print()
    print("SHUT-OUT DATE DETAILS:")
    print("-"*70)
    for a in affected:
        name = f"{a['last_name']}, {a['first_name']}"
        print(f"\n  {name} (Req #{a['request_id']}, WP={a['working_priority']}, {a['shift']})")
        print(f"    Consecutive run: {a['consecutive_run_length']} days")
        print(f"    Allowed:   {a['allowed_date_range']} ({a['allowed_dates']} days)")
        print(f"    Shut out:  {', '.join(a['shutout_dates'])}")
else:
    print("No requests qualify for shut-out under the corrected rule.")

# Write output JSON
out_path = "/home/ubuntu/vnc-icu-portal/exports/summer_cap_shutouts.json"
with open(out_path, "w") as f:
    json.dump(affected, f, indent=2)
print(f"\n\nFull data written to: {out_path}")
