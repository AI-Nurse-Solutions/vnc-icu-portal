"""
VNC ICU Portal — Fairness Index Computation
Computes 6 dimensions, scores each 0-100, produces composite score and radar chart.
"""

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np

# ─── Raw Data (from live DB queries) ──────────────────────────────────────────

# Dimension 1: Participation Equity
# Are all eligible employees able to participate? (verification rate, active rate)
VERIFICATION_RATE = 96.9        # % of participants with verified seniority
ACTIVE_RATE = 97.5              # % of participants still active
PARTICIPATION_RATE = 100.0      # All 162 employees who submitted were accepted

# Dimension 2: Priority Access Equity
# Can all seniority bands access the cap at P1?
# Junior=100%, Mid=100%, Senior=100%, Veteran=100%
P1_CAP_ACCESS_JUNIOR  = 100.0
P1_CAP_ACCESS_MID     = 100.0
P1_CAP_ACCESS_SENIOR  = 100.0
P1_CAP_ACCESS_VETERAN = 100.0
# Overall P1 within-cap rate
P1_WITHIN_CAP_RATE = 98.7       # 156/158

# Dimension 3: Shift Parity
# Are shifts treated equitably relative to their size?
# AM: 33.8% days oversubscribed, NOC: 8.6%, PM: 0%
# Penalty: AM bears disproportionate burden
AM_OVERSUBSCRIBED_PCT  = 33.8
NOC_OVERSUBSCRIBED_PCT = 8.6
PM_OVERSUBSCRIBED_PCT  = 0.0
# Cap utilization: AM=72%, NOC=53.1%, PM=17.1%
# PM is severely underutilized (only 9 employees vs 8-cap = cap is too large for PM)
AM_CAP_UTIL  = 72.0
NOC_CAP_UTIL = 53.1
PM_CAP_UTIL  = 17.1
# Shift parity score: penalize for imbalance between shifts
# Ideal: all shifts near same utilization. Variance penalty.
shift_utils = [AM_CAP_UTIL, NOC_CAP_UTIL, PM_CAP_UTIL]
shift_util_mean = np.mean(shift_utils)
shift_util_std  = np.std(shift_utils)
# Score: 100 - (std/mean * 100), capped at 0-100
SHIFT_PARITY_SCORE = max(0, min(100, 100 - (shift_util_std / shift_util_mean * 100)))

# Dimension 4: Process Transparency
# Verification completeness, comment usage, priority history usage
VERIFICATION_COMPLETENESS = 96.9   # % verified
COMMENT_USAGE_PCT = 33.3           # % who added a comment (voluntary signal)
# Priority history: 372 requests had history = ~229 employees engaged with re-ranking
# (from CSV: 372 requests with history / 2721 active = 13.7%)
PRIORITY_HISTORY_PCT = 13.7
# Transparency score: weighted average
# Verification is most important (weight 0.6), comment usage (0.2), history (0.2)
TRANSPARENCY_SCORE = (
    VERIFICATION_COMPLETENESS * 0.6 +
    min(COMMENT_USAGE_PCT * 2, 100) * 0.2 +   # scale up: 33% comment rate is actually good
    min(PRIORITY_HISTORY_PCT * 3, 100) * 0.2   # scale up: 13.7% re-ranking is meaningful
)

# Dimension 5: Demand Concentration (Gini-like)
# Are requests spread across many dates or concentrated on a few?
# Distribution: 1req=41emp, 2=41, 3=37, 4=24, 5=7, 6=2, 7=2, 8=2, 10=1
req_dist = {1:41, 2:41, 3:37, 4:24, 5:7, 6:2, 7:2, 8:2, 10:1}
total_employees = sum(req_dist.values())  # 157
total_requests = sum(k*v for k,v in req_dist.items())  # 417
# Compute Gini coefficient for request distribution
counts = []
for req_count, emp_count in sorted(req_dist.items()):
    counts.extend([req_count] * emp_count)
counts = sorted(counts)
n = len(counts)
cumsum = np.cumsum(counts)
gini = (2 * np.sum((i+1) * counts[i] for i in range(n)) / (n * sum(counts))) - (n+1)/n
# Gini 0 = perfect equality, 1 = perfect inequality
# Convert to fairness score: 100 * (1 - gini)
CONCENTRATION_SCORE = 100 * (1 - gini)

# Dimension 6: Ceiling Equity (cap adequacy)
# Is the 8-person cap appropriate for each shift's size?
# AM: 80 employees, cap=8 → 10% of shift can be off per day
# NOC: 71 employees, cap=8 → 11.3% of shift can be off per day
# PM: 9 employees, cap=8 → 88.9% of shift can be off per day (cap is too generous)
# Ideal: cap should be ~8-12% of shift size for all shifts
AM_CAP_PCT  = 8/80 * 100   # 10.0%
NOC_CAP_PCT = 8/71 * 100   # 11.3%
PM_CAP_PCT  = 8/9  * 100   # 88.9%
# Score: penalize PM for having an effectively unconstrained cap
# Ideal range: 8-15% of shift. Score each shift: 100 if in range, else penalize
def cap_adequacy_score(pct):
    if 8 <= pct <= 15:
        return 100.0
    elif pct < 8:
        return max(0, 100 - (8 - pct) * 5)
    else:
        return max(0, 100 - (pct - 15) * 0.8)

CAP_EQUITY_SCORE = np.mean([
    cap_adequacy_score(AM_CAP_PCT),
    cap_adequacy_score(NOC_CAP_PCT),
    cap_adequacy_score(PM_CAP_PCT),
])

# ─── Final Scores ──────────────────────────────────────────────────────────────
# Dimension 1: Participation Equity
D1_SCORE = (VERIFICATION_RATE * 0.5 + ACTIVE_RATE * 0.3 + PARTICIPATION_RATE * 0.2)

# Dimension 2: Priority Access Equity
D2_SCORE = (P1_CAP_ACCESS_JUNIOR + P1_CAP_ACCESS_MID + P1_CAP_ACCESS_SENIOR + P1_CAP_ACCESS_VETERAN) / 4
# Slight penalty for the 2 P1 requests entirely outside cap
D2_SCORE = D2_SCORE * (P1_WITHIN_CAP_RATE / 100)

# Dimension 3: Shift Parity
D3_SCORE = SHIFT_PARITY_SCORE

# Dimension 4: Process Transparency
D4_SCORE = min(100, TRANSPARENCY_SCORE)

# Dimension 5: Demand Concentration
D5_SCORE = CONCENTRATION_SCORE

# Dimension 6: Ceiling Equity
D6_SCORE = CAP_EQUITY_SCORE

dimensions = [
    ("Participation\nEquity",   D1_SCORE),
    ("Priority Access\nEquity", D2_SCORE),
    ("Shift\nParity",           D3_SCORE),
    ("Process\nTransparency",   D4_SCORE),
    ("Demand\nConcentration",   D5_SCORE),
    ("Ceiling\nEquity",         D6_SCORE),
]

# Composite score (equal weights)
weights = [0.20, 0.25, 0.15, 0.15, 0.15, 0.10]
composite = sum(s * w for (_, s), w in zip(dimensions, weights))

print("=== VNC ICU Portal Fairness Index ===")
for name, score in dimensions:
    print(f"  {name.replace(chr(10),' ')}: {score:.1f}/100")
print(f"\nComposite Fairness Score: {composite:.1f}/100")

# ─── Radar Chart ──────────────────────────────────────────────────────────────
labels = [d[0] for d in dimensions]
scores = [d[1] for d in dimensions]
N = len(labels)

angles = np.linspace(0, 2 * np.pi, N, endpoint=False).tolist()
angles += angles[:1]
scores_plot = scores + scores[:1]

fig, ax = plt.subplots(figsize=(7, 7), subplot_kw=dict(polar=True))
fig.patch.set_facecolor('#0F1E26')
ax.set_facecolor('#0F1E26')

# Draw grid rings
for r in [20, 40, 60, 80, 100]:
    ax.plot(angles, [r]*len(angles), color='#2D4A5A', linewidth=0.6, linestyle='--', alpha=0.5)
    ax.text(angles[0], r + 2, str(r), color='#4A7A8A', fontsize=7, ha='center', va='bottom')

# Fill area
ax.fill(angles, scores_plot, color='#00BCD4', alpha=0.25)
ax.plot(angles, scores_plot, color='#00BCD4', linewidth=2.5, linestyle='-')

# Plot points
for angle, score in zip(angles[:-1], scores[:-1]):
    color = '#10B981' if score >= 80 else '#F59E0B' if score >= 60 else '#EF4444'
    ax.plot(angle, score, 'o', color=color, markersize=9, zorder=5)

# Labels
ax.set_xticks(angles[:-1])
ax.set_xticklabels(labels, color='#CBD5E1', fontsize=9, fontweight='bold')
ax.set_ylim(0, 100)
ax.set_yticks([])
ax.spines['polar'].set_color('#2D4A5A')
ax.grid(False)

# Composite score in center
ax.text(0, 0, f"{composite:.0f}", transform=ax.transData,
        ha='center', va='center', fontsize=28, fontweight='bold',
        color='#00BCD4', zorder=10)
ax.text(0, -18, "Composite\nFairness Score", transform=ax.transData,
        ha='center', va='center', fontsize=8, color='#94A3B8', zorder=10)

# Legend
legend_elements = [
    mpatches.Patch(color='#10B981', label='Strong (80–100)'),
    mpatches.Patch(color='#F59E0B', label='Moderate (60–79)'),
    mpatches.Patch(color='#EF4444', label='Needs Attention (<60)'),
]
ax.legend(handles=legend_elements, loc='lower center', bbox_to_anchor=(0.5, -0.15),
          ncol=3, frameon=False, fontsize=8,
          labelcolor='#CBD5E1')

plt.title("VNC ICU Portal — Fairness Index\nCycle 1 · May 2026",
          color='#E2E8F0', fontsize=12, fontweight='bold', pad=20)

plt.tight_layout()
out_path = '/home/ubuntu/vnc-icu-portal/exports/fairness_radar.png'
plt.savefig(out_path, dpi=150, bbox_inches='tight', facecolor='#0F1E26')
plt.close()
print(f"\nRadar chart saved: {out_path}")

# ─── Score summary for report ──────────────────────────────────────────────────
print("\n=== Score Summary for Report ===")
for (name, score), weight in zip(dimensions, weights):
    label = "Strong" if score >= 80 else "Moderate" if score >= 60 else "Needs Attention"
    print(f"  {name.replace(chr(10),' '):<30} {score:5.1f}  weight={weight:.0%}  [{label}]")
print(f"\n  COMPOSITE (weighted)           {composite:5.1f}  [{'Strong' if composite>=80 else 'Moderate' if composite>=60 else 'Needs Attention'}]")
