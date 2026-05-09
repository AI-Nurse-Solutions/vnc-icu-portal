import csv
from collections import defaultdict

rows = []
with open('/home/ubuntu/vnc-icu-portal/exports/11_working_priority_requests.csv') as f:
    reader = csv.DictReader(f)
    rows = list(reader)

print(f'Total rows in WP CSV: {len(rows)}')

withdrawn = [r for r in rows if r['current_status'] == 'withdrawn']
print(f'Withdrawn: {len(withdrawn)}')

active = [r for r in rows if r['current_status'] != 'withdrawn']
print(f'Active (non-withdrawn): {len(active)}')

wp1 = [r for r in active if r.get('working_priority') == '1']
print(f'Working Priority 1 (active): {len(wp1)}')

emp_wp = defaultdict(list)
for r in active:
    emp_wp[r['employee_number']].append(r.get('working_priority', ''))
print(f'Distinct employees with active requests: {len(emp_wp)}')

single = sum(1 for e, reqs in emp_wp.items() if len(reqs) == 1)
print(f'Employees with only 1 active request: {single}')

multi = sum(1 for e, reqs in emp_wp.items() if len(reqs) >= 3)
print(f'Employees with 3+ active requests: {multi}')

shifts = defaultdict(int)
for r in active:
    shifts[r['shift']] += 1
print('Active requests by shift:', dict(shifts))

with_history = [r for r in active if r.get('priority_history', '').strip()]
print(f'Requests with priority history: {len(with_history)}')

# Vacation vs education
vac = [r for r in active if r['request_type'] == 'vacation']
edu = [r for r in active if r['request_type'] == 'education']
print(f'Active vacation requests: {len(vac)}')
print(f'Active education requests: {len(edu)}')

# WP distribution
wp_dist = defaultdict(int)
for r in active:
    wp = r.get('working_priority', '')
    if wp:
        wp_dist[int(wp)] += 1
    else:
        wp_dist['blank'] += 1
print('WP distribution:', dict(sorted(wp_dist.items(), key=lambda x: (str(x[0]).isdigit() == False, x[0]))))

# Employees with only P1 (final_priority == 1 on all active requests)
emp_priorities = defaultdict(set)
for r in active:
    if r['request_type'] == 'vacation':
        try:
            emp_priorities[r['employee_number']].add(int(r['final_priority']))
        except:
            pass
only_p1 = sum(1 for e, ps in emp_priorities.items() if ps == {1})
print(f'Employees with ONLY P1 vacation requests: {only_p1}')
