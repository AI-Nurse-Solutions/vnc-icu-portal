"""
Analyze all July/August vacation requests to find those exceeding 14 consecutive days.
Outputs:
  - List of affected employees + request IDs + shut-out dates
  - Summary stats
"""

import csv
from collections import defaultdict
from datetime import date, timedelta

CSV_PATH = "/home/ubuntu/vnc-icu-portal/exports/11_working_priority_requests.csv"

# Load all rows
rows = []
with open(CSV_PATH, newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for row in reader:
        rows.append(row)

# Group by request_id → collect all dates for that request
request_dates = defaultdict(list)
request_meta = {}

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
    request_dates[req_id].append(d)
    if req_id not in request_meta:
        request_meta[req_id] = {
            "employee_number": row["employee_number"].strip(),
            "last_name": row["last_name"].strip(),
            "first_name": row["first_name"].strip(),
            "shift": row["shift"].strip(),
            "request_type": row["request_type"].strip() if "request_type" in row else "vacation",
            "working_priority": row["working_priority"].strip(),
        }

# For each request, sort dates and find consecutive runs
# Only the first consecutive run of 14 days is allowed.
# Any date beyond day 14 of the first consecutive run is shut out.

affected = []  # list of dicts

for req_id, dates in request_dates.items():
    dates_sorted = sorted(set(dates))
    meta = request_meta[req_id]

    # Find consecutive runs
    runs = []
    current_run = [dates_sorted[0]]
    for d in dates_sorted[1:]:
        if d == current_run[-1] + timedelta(days=1):
            current_run.append(d)
        else:
            runs.append(current_run)
            current_run = [d]
    runs.append(current_run)

    # The rule: first consecutive run only, max 14 days
    # All dates in runs after the first run, and all dates in the first run beyond day 14, are shut out
    shutout_dates = []
    allowed_dates = []

    first_run = runs[0]
    if len(first_run) > 14:
        allowed_dates.extend(first_run[:14])
        shutout_dates.extend(first_run[14:])
    else:
        allowed_dates.extend(first_run)

    # All subsequent runs are shut out (non-consecutive = separate block, not allowed in summer)
    for run in runs[1:]:
        shutout_dates.extend(run)

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
        })

# Sort by last_name
affected.sort(key=lambda x: (x["last_name"], x["first_name"]))

print(f"\n{'='*70}")
print(f"SUMMER 14-DAY CAP ANALYSIS — July & August Vacation Requests")
print(f"{'='*70}")
print(f"Total July/August requests analyzed: {len(request_dates)}")
print(f"Requests exceeding 14 consecutive days: {len(affected)}")
print()

if affected:
    print(f"{'#':<4} {'Name':<22} {'Shift':<5} {'WP':<4} {'Req ID':<8} {'Total':<6} {'Allowed':<8} {'Shut Out':<9} {'First Shut-Out Date'}")
    print("-"*90)
    for i, a in enumerate(affected, 1):
        name = f"{a['last_name']}, {a['first_name']}"
        print(f"{i:<4} {name:<22} {a['shift']:<5} {a['working_priority']:<4} {a['request_id']:<8} {a['total_summer_dates']:<6} {a['allowed_dates']:<8} {a['shutout_count']:<9} {a['first_shutout_date']}")

    print()
    print("SHUT-OUT DATE DETAILS:")
    print("-"*70)
    for a in affected:
        name = f"{a['last_name']}, {a['first_name']}"
        print(f"\n  {name} (Req #{a['request_id']}, WP={a['working_priority']}, {a['shift']})")
        print(f"    Allowed:   {a['allowed_date_range']} ({a['allowed_dates']} days)")
        print(f"    Shut out:  {', '.join(a['shutout_dates'])}")

# Write output JSON for use by the import script
import json
out_path = "/home/ubuntu/vnc-icu-portal/exports/summer_cap_shutouts.json"
with open(out_path, "w") as f:
    json.dump(affected, f, indent=2)
print(f"\n\nFull data written to: {out_path}")
