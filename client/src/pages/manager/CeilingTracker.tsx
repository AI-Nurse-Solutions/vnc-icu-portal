import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import {
  TrendingUp, AlertTriangle, CheckCircle2, Loader2,
  ChevronDown, ChevronUp, Users, Filter, Info
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type PeriodData = {
  approved: number;
  pending: number;
  total: number;
  p1Only: number;
  overCeiling: boolean;
  atWarning: boolean;
};

type EmployeeRow = {
  id: number;
  firstName: string;
  lastName: string;
  shift: string;
  seniorityDate: string;
  employeeNumber: string;
  isVerified: boolean | null;
  periodA: PeriodData;
  periodB: PeriodData;
  flagged: boolean;
};

const SHIFT_COLORS: Record<string, string> = {
  AM: "oklch(0.68 0.15 200)",
  PM: "oklch(0.70 0.15 290)",
  NOC: "oklch(0.65 0.17 160)",
};

const CEILING = 21;
const WARNING = 15;

// ─── Period Bar ───────────────────────────────────────────────────────────────
function PeriodBar({
  label,
  data,
  year,
  showImpact,
}: {
  label: string;
  data: PeriodData;
  year: number;
  showImpact: boolean;
}) {
  const pct = Math.min((data.total / CEILING) * 100, 100);
  const p1Pct = Math.min((data.p1Only / CEILING) * 100, 100);
  const impactDays = data.total - data.p1Only;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground font-medium">
          Period {label} ({label === "A" ? `Jan–Jun ${year}` : `Jul–Dec ${year}`})
        </span>
        <div className="flex items-center gap-1.5">
          {data.overCeiling && (
            <span className="flex items-center gap-0.5 text-red-400 font-bold">
              <AlertTriangle className="w-2.5 h-2.5" /> Over ceiling
            </span>
          )}
          {!data.overCeiling && data.atWarning && (
            <span className="flex items-center gap-0.5 text-amber-400 font-bold">
              <AlertTriangle className="w-2.5 h-2.5" /> Warning
            </span>
          )}
          <span className={`font-bold tabular-nums ${
            data.overCeiling ? "text-red-400" : data.atWarning ? "text-amber-400" : "text-foreground"
          }`}>
            {data.total}d
          </span>
          <span className="text-muted-foreground">/ {CEILING}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="relative h-2.5 bg-secondary/60 rounded-full overflow-hidden">
        {/* P1-only portion */}
        {showImpact && data.p1Only > 0 && (
          <div
            className="absolute left-0 top-0 h-full bg-primary/60 rounded-full transition-all"
            style={{ width: `${p1Pct}%` }}
          />
        )}
        {/* Full total */}
        <div
          className={`absolute left-0 top-0 h-full rounded-full transition-all ${
            data.overCeiling
              ? "bg-red-500"
              : data.atWarning
              ? "bg-amber-400"
              : "bg-primary"
          } ${showImpact && data.p1Only > 0 ? "opacity-40" : ""}`}
          style={{ width: `${pct}%` }}
        />
        {/* Ceiling line */}
        <div className="absolute right-0 top-0 h-full w-px bg-border/60" />
      </div>

      {/* Breakdown */}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
        <span><span className="text-foreground font-medium">{data.approved}</span> approved</span>
        <span><span className="text-foreground font-medium">{data.pending}</span> pending</span>
        {showImpact && impactDays > 0 && (
          <span className="text-amber-400">
            <span className="font-bold">{impactDays}</span> P2+ days (yield candidate)
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Employee Row ─────────────────────────────────────────────────────────────
function EmployeeTableRow({
  emp,
  year,
  showImpact,
  rank,
}: {
  emp: EmployeeRow;
  year: number;
  showImpact: boolean;
  rank: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const seniorityYears = Math.floor(
    (Date.now() - new Date(emp.seniorityDate).getTime()) / (365.25 * 24 * 3600 * 1000)
  );

  return (
    <>
      <tr
        className={`border-b border-border/20 hover:bg-secondary/20 cursor-pointer transition-colors ${
          emp.flagged ? "bg-red-500/5" : ""
        }`}
        onClick={() => setExpanded(!expanded)}
      >
        {/* Rank */}
        <td className="px-3 py-3 text-xs text-muted-foreground font-mono">{rank}</td>

        {/* Name */}
        <td className="px-3 py-3">
          <div className="flex items-center gap-2">
            <div>
              <div className="text-sm font-medium text-foreground">
                {emp.firstName} {emp.lastName}
              </div>
              <div className="text-[10px] text-muted-foreground">
                #{emp.employeeNumber} · {seniorityYears}y seniority
              </div>
            </div>
          </div>
        </td>

        {/* Shift */}
        <td className="px-3 py-3">
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{
              background: `${SHIFT_COLORS[emp.shift]}22`,
              color: SHIFT_COLORS[emp.shift],
              border: `1px solid ${SHIFT_COLORS[emp.shift]}44`,
            }}
          >
            {emp.shift}
          </span>
        </td>

        {/* Period A */}
        <td className="px-3 py-3">
          <div className="flex items-center gap-1.5">
            <span className={`text-sm font-bold tabular-nums ${
              emp.periodA.overCeiling ? "text-red-400" : emp.periodA.atWarning ? "text-amber-400" : "text-foreground"
            }`}>
              {emp.periodA.total}
            </span>
            <span className="text-xs text-muted-foreground">/ {CEILING}</span>
            {emp.periodA.overCeiling && <AlertTriangle className="w-3 h-3 text-red-400" />}
            {!emp.periodA.overCeiling && emp.periodA.atWarning && <AlertTriangle className="w-3 h-3 text-amber-400" />}
          </div>
          <div className="w-20 h-1.5 bg-secondary/60 rounded-full mt-1 overflow-hidden">
            <div
              className={`h-full rounded-full ${emp.periodA.overCeiling ? "bg-red-500" : emp.periodA.atWarning ? "bg-amber-400" : "bg-primary"}`}
              style={{ width: `${Math.min((emp.periodA.total / CEILING) * 100, 100)}%` }}
            />
          </div>
        </td>

        {/* Period B */}
        <td className="px-3 py-3">
          <div className="flex items-center gap-1.5">
            <span className={`text-sm font-bold tabular-nums ${
              emp.periodB.overCeiling ? "text-red-400" : emp.periodB.atWarning ? "text-amber-400" : "text-foreground"
            }`}>
              {emp.periodB.total}
            </span>
            <span className="text-xs text-muted-foreground">/ {CEILING}</span>
            {emp.periodB.overCeiling && <AlertTriangle className="w-3 h-3 text-red-400" />}
            {!emp.periodB.overCeiling && emp.periodB.atWarning && <AlertTriangle className="w-3 h-3 text-amber-400" />}
          </div>
          <div className="w-20 h-1.5 bg-secondary/60 rounded-full mt-1 overflow-hidden">
            <div
              className={`h-full rounded-full ${emp.periodB.overCeiling ? "bg-red-500" : emp.periodB.atWarning ? "bg-amber-400" : "bg-primary"}`}
              style={{ width: `${Math.min((emp.periodB.total / CEILING) * 100, 100)}%` }}
            />
          </div>
        </td>

        {/* Status */}
        <td className="px-3 py-3">
          {emp.flagged ? (
            <span className="text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/30 px-2 py-0.5 rounded-full">
              Over Ceiling
            </span>
          ) : emp.periodA.atWarning || emp.periodB.atWarning ? (
            <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full">
              Warning
            </span>
          ) : (
            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">
              OK
            </span>
          )}
        </td>

        <td className="px-3 py-3">
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </td>
      </tr>

      {expanded && (
        <tr className="border-b border-border/20 bg-secondary/10">
          <td colSpan={7} className="px-4 py-4">
            <div className="grid grid-cols-2 gap-6 max-w-2xl">
              <PeriodBar label="A" data={emp.periodA} year={year} showImpact={showImpact} />
              <PeriodBar label="B" data={emp.periodB} year={year} showImpact={showImpact} />
            </div>
            {showImpact && (emp.periodA.total - emp.periodA.p1Only > 0 || emp.periodB.total - emp.periodB.p1Only > 0) && (
              <div className="mt-3 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                <Info className="w-3.5 h-3.5 inline mr-1.5 mb-0.5" />
                <strong>Yield impact:</strong> If P2+ requests are removed, this employee drops to{" "}
                <strong>{emp.periodA.p1Only}d</strong> (Period A) and{" "}
                <strong>{emp.periodB.p1Only}d</strong> (Period B).
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CeilingTracker() {
  const currentYear = new Date().getFullYear();
  const [year] = useState(currentYear);
  const [shiftFilter, setShiftFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<"all" | "flagged" | "warning" | "ok">("all");
  const [showImpact, setShowImpact] = useState(false);
  const [sortBy, setSortBy] = useState<"name" | "periodA" | "periodB" | "shift">("periodA");

  const { data, isLoading } = trpc.tools.getCeilingTrackerData.useQuery({ year });

  const filtered = useMemo(() => {
    if (!data?.employees) return [];
    let list = data.employees;
    if (shiftFilter !== "ALL") list = list.filter(e => e.shift === shiftFilter);
    if (statusFilter === "flagged") list = list.filter(e => e.flagged);
    if (statusFilter === "warning") list = list.filter(e => !e.flagged && (e.periodA.atWarning || e.periodB.atWarning));
    if (statusFilter === "ok") list = list.filter(e => !e.flagged && !e.periodA.atWarning && !e.periodB.atWarning);

    // Sort
    return [...list].sort((a, b) => {
      if (sortBy === "periodA") return b.periodA.total - a.periodA.total;
      if (sortBy === "periodB") return b.periodB.total - a.periodB.total;
      if (sortBy === "shift") return a.shift.localeCompare(b.shift) || a.lastName.localeCompare(b.lastName);
      return a.lastName.localeCompare(b.lastName);
    });
  }, [data, shiftFilter, statusFilter, sortBy]);

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          21-Day Ceiling Tracker
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Per-employee vacation day totals (approved + pending) for Period A and B — soft ceiling {CEILING} days, amber warning at {WARNING}
        </p>
      </div>

      {/* Summary stats */}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <div className="bg-card border border-border/40 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-foreground">{data.summary.total}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Active Employees</div>
          </div>
          <div className="bg-card border border-red-500/30 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-red-400">
              {Math.max(data.summary.overCeilingA, data.summary.overCeilingB)}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">Over Ceiling (any period)</div>
          </div>
          <div className="bg-card border border-amber-500/30 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-amber-400">
              {Math.max(data.summary.atWarningA, data.summary.atWarningB)}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">At Warning (any period)</div>
          </div>
          <div className="bg-card border border-emerald-500/30 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-emerald-400">
              {data.summary.total - Math.max(data.summary.overCeilingA, data.summary.overCeilingB) - Math.max(data.summary.atWarningA, data.summary.atWarningB)}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">Within Normal Range</div>
          </div>
        </div>
      )}

      {/* Ceiling rule explanation */}
      <div className="bg-card border border-border/40 rounded-xl p-4 mb-5 text-xs text-muted-foreground">
        <div className="flex items-start gap-2">
          <Info className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
          <div>
            <strong className="text-foreground">Rule 3 — 21-Day Yield:</strong> Employees over {CEILING} days yield on oversubscribed days
            if their request is not Priority 1. The "P2+ Impact" toggle shows how many days would be removed if P2+ requests
            were withdrawn — helping managers identify who must yield when capacity is tight.
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        {/* Shift */}
        <div className="flex items-center gap-1 bg-secondary/30 rounded-lg p-1">
          {["ALL", "AM", "PM", "NOC"].map(s => (
            <button
              key={s}
              onClick={() => setShiftFilter(s)}
              className={`text-xs px-3 py-1.5 rounded-md transition-all font-medium ${shiftFilter === s ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Status */}
        <div className="flex items-center gap-1 bg-secondary/30 rounded-lg p-1">
          {[
            { v: "all", label: "All" },
            { v: "flagged", label: "Over Ceiling" },
            { v: "warning", label: "Warning" },
            { v: "ok", label: "OK" },
          ].map(({ v, label }) => (
            <button
              key={v}
              onClick={() => setStatusFilter(v as any)}
              className={`text-xs px-3 py-1.5 rounded-md transition-all font-medium ${statusFilter === v ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Sort */}
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as any)}
          className="text-xs bg-secondary/30 border border-border/40 rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="periodA">Sort: Period A (highest)</option>
          <option value="periodB">Sort: Period B (highest)</option>
          <option value="shift">Sort: Shift</option>
          <option value="name">Sort: Name</option>
        </select>

        {/* P2+ Impact toggle */}
        <button
          onClick={() => setShowImpact(!showImpact)}
          className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition-all font-medium ${
            showImpact
              ? "bg-amber-500/15 text-amber-400 border-amber-500/40"
              : "bg-secondary/30 text-muted-foreground border-border/40 hover:text-foreground"
          }`}
        >
          <TrendingUp className="w-3 h-3" />
          Show P2+ Impact
        </button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="font-medium">No employees match current filters</p>
        </div>
      ) : (
        <div className="bg-card border border-border/40 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/40 bg-secondary/30">
                  <th className="text-left px-3 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-8">#</th>
                  <th className="text-left px-3 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Employee</th>
                  <th className="text-left px-3 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Shift</th>
                  <th className="text-left px-3 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground" onClick={() => setSortBy("periodA")}>
                    Period A {sortBy === "periodA" && "↓"}
                  </th>
                  <th className="text-left px-3 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground" onClick={() => setSortBy("periodB")}>
                    Period B {sortBy === "periodB" && "↓"}
                  </th>
                  <th className="text-left px-3 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((emp, idx) => (
                  <EmployeeTableRow
                    key={emp.id}
                    emp={emp}
                    year={year}
                    showImpact={showImpact}
                    rank={idx + 1}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-border/30 text-xs text-muted-foreground">
            Showing {filtered.length} of {data?.employees.length ?? 0} employees · Click any row to expand period details
          </div>
        </div>
      )}
    </div>
  );
}
