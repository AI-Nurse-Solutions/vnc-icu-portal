import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { format, parseISO, startOfYear, endOfYear } from "date-fns";
import {
  Flame, Loader2, ChevronDown, ChevronUp, AlertTriangle,
  Calendar, Users, Shield, TrendingUp
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type HotDateShift = {
  shift: string;
  count: number;
  overCap: boolean;
  severity: number;
};

type HotDateEntry = {
  date: string;
  shifts: HotDateShift[];
  isHot: boolean;
  maxSeverity: number;
  totalRequests: number;
};

type DrillDownRow = {
  requestId: number;
  employeeId: number;
  priority: number;
  comment: string | null;
  submittedAt: string;
  firstName: string;
  lastName: string;
  shift: string;
  seniorityDate: string;
  employeeNumber: string;
};

const SHIFT_COLORS: Record<string, string> = {
  AM: "oklch(0.68 0.15 200)",
  PM: "oklch(0.70 0.15 290)",
  NOC: "oklch(0.65 0.17 160)",
};

const SEVERITY_COLORS = [
  "", // 0 = no severity
  "bg-yellow-500/15 border-yellow-500/30 text-yellow-300",  // 1
  "bg-orange-500/15 border-orange-500/30 text-orange-300",  // 2
  "bg-orange-600/15 border-orange-600/30 text-orange-200",  // 3
  "bg-red-500/15 border-red-500/30 text-red-300",           // 4
  "bg-red-600/20 border-red-600/40 text-red-200",           // 5
];

const SEVERITY_LABELS = ["", "Mild", "Moderate", "High", "Critical", "Extreme"];

function severityBg(s: number) {
  return SEVERITY_COLORS[Math.min(s, 5)] || "bg-secondary/20 border-border/30 text-muted-foreground";
}

function seniorityYears(dateStr: string) {
  const d = new Date(dateStr);
  return Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
}

// ─── Drill-Down Panel ─────────────────────────────────────────────────────────
function DrillDownPanel({ date, cap }: { date: string; cap: number }) {
  const { data, isLoading } = trpc.tools.getHotDateDrillDown.useQuery({ date });

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="w-4 h-4 text-primary animate-spin" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return <p className="text-xs text-muted-foreground py-4 text-center">No pending vacation requests for this date.</p>;
  }

  // Group by shift
  const byShift: Record<string, DrillDownRow[]> = {};
  for (const row of data) {
    if (!byShift[row.shift]) byShift[row.shift] = [];
    byShift[row.shift].push(row);
  }

  return (
    <div className="space-y-4">
      {Object.entries(byShift).map(([shift, rows]) => {
        const overCap = rows.length > cap;
        return (
          <div key={shift}>
            <div className="flex items-center gap-2 mb-2">
              <span
                className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: `${SHIFT_COLORS[shift]}22`, color: SHIFT_COLORS[shift], border: `1px solid ${SHIFT_COLORS[shift]}44` }}
              >
                {shift} Shift
              </span>
              <span className="text-xs text-muted-foreground">{rows.length} request{rows.length !== 1 ? "s" : ""}</span>
              {overCap && (
                <span className="text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/30 px-2 py-0.5 rounded-full">
                  {rows.length - cap} over cap
                </span>
              )}
            </div>
            <div className="space-y-1.5">
              {rows.map((row, idx) => {
                const isInCap = idx < cap;
                const isCapLine = idx === cap;
                return (
                  <div key={row.requestId}>
                    {isCapLine && (
                      <div className="flex items-center gap-2 my-2">
                        <div className="flex-1 border-t border-dashed border-red-500/40" />
                        <span className="text-[10px] font-bold text-red-400 whitespace-nowrap">Cap ({cap}) — below this line: DENIED</span>
                        <div className="flex-1 border-t border-dashed border-red-500/40" />
                      </div>
                    )}
                    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs ${
                      isInCap
                        ? "bg-emerald-500/8 border border-emerald-500/20"
                        : "bg-red-500/8 border border-red-500/20 opacity-75"
                    }`}>
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                        isInCap ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                      }`}>
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-foreground">{row.firstName} {row.lastName}</span>
                        <span className="text-muted-foreground ml-2">#{row.employeeNumber}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${
                          row.priority <= 2
                            ? "text-red-400 bg-red-500/10 border-red-500/30"
                            : row.priority <= 4
                            ? "text-orange-400 bg-orange-500/10 border-orange-500/30"
                            : "text-muted-foreground bg-secondary/40 border-border/30"
                        }`}>
                          P{row.priority}
                        </span>
                        <span className="text-muted-foreground text-[10px]">{seniorityYears(row.seniorityDate)}y</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <p className="text-[10px] text-muted-foreground border-t border-border/30 pt-2 mt-2">
        Ranked by Priority (1=highest), then seniority date (earliest=senior). Cap = {cap} per shift.
      </p>
    </div>
  );
}

// ─── Hot Date Card ────────────────────────────────────────────────────────────
function HotDateCard({ entry, cap }: { entry: HotDateEntry; cap: number }) {
  const [expanded, setExpanded] = useState(false);
  const parsed = parseISO(entry.date);

  return (
    <div className={`bg-card border rounded-xl overflow-hidden transition-all ${
      entry.isHot ? `border-${entry.maxSeverity >= 4 ? "red" : "orange"}-500/40` : "border-border/30"
    }`}>
      <button
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-secondary/20 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Date */}
        <div className="flex flex-col items-center w-12 shrink-0">
          <span className="text-lg font-bold text-foreground leading-none">{format(parsed, "d")}</span>
          <span className="text-[10px] text-muted-foreground font-medium">{format(parsed, "MMM")}</span>
          <span className="text-[10px] text-muted-foreground">{format(parsed, "EEE")}</span>
        </div>

        {/* Shift pills */}
        <div className="flex-1 flex flex-wrap gap-2">
          {entry.shifts.map(s => (
            <div
              key={s.shift}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs ${severityBg(s.severity)}`}
            >
              <span className="font-bold">{s.shift}</span>
              <span>{s.count}/{cap}</span>
              {s.overCap && (
                <span className="font-bold text-[10px]">+{s.count - cap}</span>
              )}
            </div>
          ))}
        </div>

        {/* Severity badge */}
        <div className="flex items-center gap-2 shrink-0">
          {entry.isHot && (
            <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full border ${severityBg(entry.maxSeverity)}`}>
              <Flame className="w-2.5 h-2.5" />
              {SEVERITY_LABELS[Math.min(entry.maxSeverity, 5)]}
            </span>
          )}
          <span className="text-xs text-muted-foreground">{entry.totalRequests} total</span>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/30 p-4 bg-secondary/10">
          <DrillDownPanel date={entry.date} cap={cap} />
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function HotDatesView() {
  const currentYear = new Date().getFullYear();
  const [startDate] = useState(`${currentYear}-01-01`);
  const [endDate] = useState(`${currentYear}-12-31`);
  const [cap] = useState(8);
  const [showAllDates, setShowAllDates] = useState(false);
  const [monthFilter, setMonthFilter] = useState<number | null>(null);

  const { data, isLoading } = trpc.tools.getHotDates.useQuery({
    startDate,
    endDate,
    cap,
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    let list = showAllDates ? data : data.filter(d => d.isHot);
    if (monthFilter !== null) {
      const monthStr = String(monthFilter + 1).padStart(2, "0");
      list = list.filter(d => d.date.substring(5, 7) === monthStr);
    }
    return list;
  }, [data, showAllDates, monthFilter]);

  const hotCount = useMemo(() => data?.filter(d => d.isHot).length ?? 0, [data]);
  const criticalCount = useMemo(() => data?.filter(d => d.maxSeverity >= 4).length ?? 0, [data]);

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // Mini calendar heatmap data
  const heatmapByMonth = useMemo(() => {
    if (!data) return {};
    const map: Record<string, HotDateEntry[]> = {};
    for (const entry of data) {
      const month = entry.date.substring(0, 7);
      if (!map[month]) map[month] = [];
      map[month].push(entry);
    }
    return map;
  }, [data]);

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Flame className="w-5 h-5 text-orange-400" />
          Hot Dates View
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Days where pending vacation requests exceed the {cap}-per-shift cap — ranked by severity
        </p>
      </div>

      {/* Stats */}
      {data && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-card border border-border/40 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-foreground">{data.length}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Days with requests</div>
          </div>
          <div className="bg-card border border-orange-500/30 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-orange-400">{hotCount}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Oversubscribed days</div>
          </div>
          <div className="bg-card border border-red-500/30 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-red-400">{criticalCount}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Critical / Extreme</div>
          </div>
        </div>
      )}

      {/* Severity legend */}
      <div className="flex flex-wrap gap-2 mb-5">
        <span className="text-xs text-muted-foreground self-center">Severity:</span>
        {[1, 2, 3, 4, 5].map(s => (
          <span key={s} className={`text-[10px] font-bold px-2 py-1 rounded-full border ${severityBg(s)}`}>
            {SEVERITY_LABELS[s]} (+{s * 2 - 1}–{s * 2})
          </span>
        ))}
      </div>

      {/* Month tabs */}
      <div className="flex items-center gap-1 bg-secondary/30 rounded-lg p-1 mb-5 flex-wrap">
        <button
          onClick={() => setMonthFilter(null)}
          className={`text-xs px-3 py-1.5 rounded-md transition-all font-medium ${monthFilter === null ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          All
        </button>
        {MONTHS.map((m, i) => {
          const monthKey = `${currentYear}-${String(i + 1).padStart(2, "0")}`;
          const hasHot = heatmapByMonth[monthKey]?.some(d => d.isHot);
          return (
            <button
              key={m}
              onClick={() => setMonthFilter(i)}
              className={`text-xs px-3 py-1.5 rounded-md transition-all font-medium relative ${monthFilter === i ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {m}
              {hasHot && monthFilter !== i && (
                <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-orange-400" />
              )}
            </button>
          );
        })}
      </div>

      {/* Toggle all dates */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => setShowAllDates(!showAllDates)}
          className={`text-xs px-3 py-2 rounded-lg border transition-all font-medium ${
            showAllDates
              ? "bg-secondary/60 text-foreground border-border/60"
              : "bg-secondary/30 text-muted-foreground border-border/40 hover:text-foreground"
          }`}
        >
          {showAllDates ? "Showing all dates" : "Hot dates only"}
        </button>
        {filtered.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {filtered.length} date{filtered.length !== 1 ? "s" : ""} shown
          </span>
        )}
      </div>

      {/* Date list */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Flame className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="font-medium">No oversubscribed dates</p>
          <p className="text-sm mt-1">
            {showAllDates ? "No vacation requests found for this period." : "All days are within the 8-per-shift cap."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(entry => (
            <HotDateCard key={entry.date} entry={entry} cap={cap} />
          ))}
        </div>
      )}
    </div>
  );
}
