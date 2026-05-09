import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronRight, CalendarDays, Users, ShieldCheck,
  AlertTriangle, CheckCircle2, Clock, Loader2, X as XIcon,
  ArrowLeft, Shield
} from "lucide-react";
import { format, parseISO, getDaysInMonth, startOfMonth, getDay } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────
type ShiftData = {
  shift: string;
  count: number;
  approvedCount: number;
  pendingCount: number;
  deniedCount: number;
  overCap: boolean;
};

type CalendarDateEntry = {
  date: string;
  shifts: ShiftData[];
  totalCount: number;
  isOverCap: boolean;
  allApproved: boolean;
};

type DayRequest = {
  requestId: number;
  employeeId: number;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  shift: string;
  seniorityDate: string;
  isVerified: boolean | null;
  requestType: string;
  continuityType: string;
  priority: number;
  status: string;
  submittedAt: string;
  comment: string | null;
  workingPriority: number | null;
  seniorityRank: number;
  overCap: boolean;
};

// ─── Constants ────────────────────────────────────────────────────────────────
const SHIFTS = ["AM", "PM", "NOC"] as const;
const SHIFT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  AM:  { bg: "bg-sky-500/15",    text: "text-sky-300",    border: "border-sky-500/30" },
  PM:  { bg: "bg-violet-500/15", text: "text-violet-300", border: "border-violet-500/30" },
  NOC: { bg: "bg-emerald-500/15",text: "text-emerald-300",border: "border-emerald-500/30" },
};

const STATUS_STYLES: Record<string, string> = {
  pending:  "bg-amber-500/15 text-amber-300 border-amber-500/30",
  approved: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  denied:   "bg-red-500/15 text-red-400 border-red-500/30",
};

const PRIORITY_STYLES: Record<number, string> = {
  1: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  2: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  3: "bg-orange-500/20 text-orange-300 border-orange-500/40",
};

function getPriorityStyle(p: number) {
  return PRIORITY_STYLES[p] ?? "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
}

function seniorityYears(dateStr: string) {
  const d = new Date(dateStr);
  return Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
}

// ─── Priority Badge ───────────────────────────────────────────────────────────
function PriorityBadge({ priority }: { priority: number }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold border ${getPriorityStyle(priority)}`}>
      P{priority}
    </span>
  );
}

// ─── Working Priority Badge ───────────────────────────────────────────────────
function WorkingPriorityBadge({ wp }: { wp: number | null }) {
  if (wp === null) return null;
  const style = wp === 1
    ? "bg-teal-500/20 text-teal-200 border-teal-500/50"
    : wp === 2
    ? "bg-sky-500/20 text-sky-200 border-sky-500/50"
    : wp <= 4
    ? "bg-indigo-500/20 text-indigo-200 border-indigo-500/40"
    : "bg-zinc-600/30 text-zinc-300 border-zinc-500/40";
  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-bold border ${style}`}
      title="Working Priority — employee's ranked preference order across all their requests"
    >
      <span className="text-[9px] opacity-70">WP</span>{wp}
    </span>
  );
}

// ─── Shift Badge ──────────────────────────────────────────────────────────────
function ShiftBadge({ shift }: { shift: string }) {
  const c = SHIFT_COLORS[shift] ?? { bg: "bg-zinc-500/15", text: "text-zinc-400", border: "border-zinc-500/30" };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold border ${c.bg} ${c.text} ${c.border}`}>
      {shift}
    </span>
  );
}

// ─── Day Drill-Down Panel ─────────────────────────────────────────────────────
function DayDrillDown({
  date,
  onClose,
}: {
  date: string;
  onClose: () => void;
}) {
  const [activeShift, setActiveShift] = useState<"ALL" | "AM" | "PM" | "NOC">("ALL");
  const utils = trpc.useUtils();

  const { data, isLoading, refetch } = trpc.tools.getDecisionCalendarDay.useQuery(
    { date, shift: activeShift === "ALL" ? undefined : activeShift },
    { enabled: !!date }
  );

  const approveMutation = trpc.manager.approve.useMutation({
    onSuccess: () => {
      toast.success("Request approved");
      refetch();
      utils.tools.getDecisionCalendarMonth.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const denyMutation = trpc.manager.deny.useMutation({
    onSuccess: () => {
      toast.success("Request denied");
      refetch();
      utils.tools.getDecisionCalendarMonth.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const formatted = useMemo(() => {
    if (!date) return "";
    try { return format(parseISO(date), "EEEE, MMMM d, yyyy"); }
    catch { return date; }
  }, [date]);

  // Group requests by shift for display
  const byShift = useMemo(() => {
    if (!data) return {};
    const map: Record<string, DayRequest[]> = {};
    for (const r of data.requests) {
      if (!map[r.shift]) map[r.shift] = [];
      map[r.shift].push(r);
    }
    return map;
  }, [data]);

  const shiftsToShow = activeShift === "ALL" ? SHIFTS.filter(s => byShift[s]?.length) : [activeShift];

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative ml-auto w-full max-w-3xl h-full bg-zinc-900 border-l border-zinc-700 flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-700 bg-zinc-900/80 backdrop-blur-sm shrink-0">
          <button onClick={onClose} className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-teal-400 shrink-0" />
              <h2 className="text-sm font-semibold text-white truncate">{formatted}</h2>
            </div>
            {data && (
              <p className="text-xs text-zinc-400 mt-0.5">
                {data.totalCount} request{data.totalCount !== 1 ? "s" : ""} · Cap: {data.cap}/shift
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Shift filter tabs */}
        <div className="flex gap-1 px-5 py-3 border-b border-zinc-800 shrink-0">
          {(["ALL", "AM", "PM", "NOC"] as const).map(s => (
            <button
              key={s}
              onClick={() => setActiveShift(s)}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                activeShift === s
                  ? "bg-teal-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white"
              }`}
            >
              {s}
              {s !== "ALL" && byShift[s] && (
                <span className="ml-1.5 text-[10px] opacity-70">({byShift[s].length})</span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
            </div>
          ) : !data || data.requests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
              <CalendarDays className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm">No vacation requests for this date{activeShift !== "ALL" ? ` (${activeShift})` : ""}</p>
            </div>
          ) : (
            shiftsToShow.map(shift => {
              const shiftReqs = (byShift[shift] ?? []).sort((a, b) => {
                if (a.priority !== b.priority) return a.priority - b.priority;
                return a.seniorityDate.localeCompare(b.seniorityDate);
              });
              if (shiftReqs.length === 0) return null;
              const sc = SHIFT_COLORS[shift];
              const cap = data.cap;

              return (
                <div key={shift}>
                  {/* Shift header */}
                  <div className={`flex items-center gap-2 mb-3 pb-2 border-b ${sc.border}`}>
                    <ShiftBadge shift={shift} />
                    <span className="text-xs text-zinc-400">
                      {shiftReqs.length} request{shiftReqs.length !== 1 ? "s" : ""}
                    </span>
                    {shiftReqs.length > cap && (
                      <span className="ml-auto flex items-center gap-1 text-xs text-red-400">
                        <AlertTriangle className="w-3 h-3" />
                        {shiftReqs.length - cap} over cap
                      </span>
                    )}
                  </div>

                  {/* Request rows */}
                  <div className="space-y-2">
                    {shiftReqs.map((req, idx) => {
                      const isOverCap = idx >= cap;
                      const isPending = req.status === "pending";
                      const isApproved = req.status === "approved";
                      const isDenied = req.status === "denied";

                      return (
                        <div key={req.requestId}>
                          {/* Cap line indicator */}
                          {idx === cap && (
                            <div className="flex items-center gap-2 my-2">
                              <div className="flex-1 h-px bg-red-500/50" />
                              <span className="text-[10px] text-red-400 font-semibold px-2 py-0.5 rounded bg-red-500/10 border border-red-500/30">
                                ── 8-PERSON CAP ──
                              </span>
                              <div className="flex-1 h-px bg-red-500/50" />
                            </div>
                          )}

                          <div className={`rounded-lg border px-4 py-3 transition-all ${
                            isOverCap
                              ? "border-red-500/20 bg-red-500/5 opacity-75"
                              : isApproved
                              ? "border-emerald-500/30 bg-emerald-500/5"
                              : isDenied
                              ? "border-red-500/20 bg-red-500/5 opacity-60"
                              : "border-zinc-700 bg-zinc-800/50"
                          }`}>
                            <div className="flex items-center gap-3 flex-wrap">
                              {/* Rank */}
                              <span className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                                isOverCap
                                  ? "bg-red-500/20 text-red-400"
                                  : "bg-teal-500/20 text-teal-300"
                              }`}>
                                {idx + 1}
                              </span>

                              {/* Name */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`text-sm font-semibold ${isOverCap ? "text-zinc-400" : "text-white"}`}>
                                    {req.lastName}, {req.firstName}
                                  </span>
                                  {req.isVerified && (
                                    <Shield className="w-3 h-3 text-teal-400 shrink-0" />
                                  )}
                                  <PriorityBadge priority={req.priority} />
                                  <WorkingPriorityBadge wp={req.workingPriority} />
                                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs border ${STATUS_STYLES[req.status] ?? "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"}`}>
                                    {req.status}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 mt-0.5 text-[11px] text-zinc-500 flex-wrap">
                                  <span>#{req.employeeNumber}</span>
                                  <span>·</span>
                                  <span>{seniorityYears(req.seniorityDate)}y seniority</span>
                                  <span>·</span>
                                  <span>{req.requestType}</span>
                                  {req.comment && (
                                    <>
                                      <span>·</span>
                                      <span className="text-amber-500/70 italic">Has comments</span>
                                    </>
                                  )}
                                </div>
                              </div>

                              {/* Action buttons */}
                              {isPending && (
                                <div className="flex gap-1.5 shrink-0">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2.5 text-xs border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/15 hover:text-emerald-300"
                                    disabled={approveMutation.isPending}
                                    onClick={() => approveMutation.mutate({ requestId: req.requestId })}
                                  >
                                    {approveMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                                    <span className="ml-1">Approve</span>
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2.5 text-xs border-red-500/40 text-red-400 hover:bg-red-500/15 hover:text-red-300"
                                    disabled={denyMutation.isPending}
                                    onClick={() => denyMutation.mutate({ requestId: req.requestId })}
                                  >
                                    {denyMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <XIcon className="w-3 h-3" />}
                                    <span className="ml-1">Deny</span>
                                  </Button>
                                </div>
                              )}
                              {isApproved && (
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                              )}
                              {isDenied && (
                                <XIcon className="w-4 h-4 text-red-400 shrink-0" />
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer legend */}
        <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-900/80 shrink-0">
          <div className="flex items-center gap-4 text-[11px] text-zinc-500 flex-wrap">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> P1 = first choice</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> P2+ = secondary</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> Below cap line = displaceable</span>
            <span className="flex items-center gap-1"><Shield className="w-3 h-3 text-teal-400" /> = seniority verified</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Month Calendar Grid ──────────────────────────────────────────────────────
function CalendarGrid({
  year,
  month,
  dates,
  cap,
  onSelectDate,
}: {
  year: number;
  month: number;
  dates: CalendarDateEntry[];
  cap: number;
  onSelectDate: (date: string) => void;
}) {
  const daysInMonth = getDaysInMonth(new Date(year, month - 1));
  const firstDayOfWeek = getDay(startOfMonth(new Date(year, month - 1))); // 0=Sun

  // Build date lookup
  const dateMap = useMemo(() => {
    const m: Record<string, CalendarDateEntry> = {};
    for (const d of dates) m[d.date] = d;
    return m;
  }, [dates]);

  const cells: (string | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const day = String(i + 1).padStart(2, "0");
      const mo = String(month).padStart(2, "0");
      return `${year}-${mo}-${day}`;
    }),
  ];

  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const today = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="w-full">
      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
          <div key={d} className="text-center text-[11px] font-semibold text-zinc-500 py-1">{d}</div>
        ))}
      </div>

      {/* Weeks */}
      <div className="space-y-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1">
            {week.map((date, di) => {
              if (!date) return <div key={di} className="aspect-square" />;
              const entry = dateMap[date];
              const dayNum = parseInt(date.split("-")[2]);
              const isToday = date === today;
              const hasRequests = !!entry;
              const isOverCap = entry?.isOverCap;
              const allApproved = entry?.allApproved;

              // Color coding
              let cellClass = "border-zinc-800 bg-zinc-900 hover:bg-zinc-800";
              if (isOverCap) cellClass = "border-red-500/40 bg-red-500/10 hover:bg-red-500/15";
              else if (allApproved) cellClass = "border-emerald-500/30 bg-emerald-500/8 hover:bg-emerald-500/12";
              else if (hasRequests) cellClass = "border-amber-500/30 bg-amber-500/8 hover:bg-amber-500/12";

              return (
                <button
                  key={date}
                  onClick={() => onSelectDate(date)}
                  className={`relative aspect-square rounded-lg border text-left p-1.5 transition-all cursor-pointer group ${cellClass} ${
                    isToday ? "ring-1 ring-teal-500/60" : ""
                  }`}
                >
                  {/* Day number */}
                  <span className={`text-xs font-semibold ${
                    isToday ? "text-teal-400" : hasRequests ? "text-white" : "text-zinc-600"
                  }`}>
                    {dayNum}
                  </span>

                  {/* Shift dots */}
                  {entry && (
                    <div className="absolute bottom-1 left-1 right-1 flex gap-0.5 flex-wrap">
                      {entry.shifts.map(s => (
                        <span
                          key={s.shift}
                          className={`text-[9px] font-bold px-0.5 rounded leading-tight ${
                            s.overCap ? "text-red-400" : SHIFT_COLORS[s.shift]?.text ?? "text-zinc-400"
                          }`}
                          title={`${s.shift}: ${s.count} requests`}
                        >
                          {s.shift[0]}{s.count}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Over-cap warning dot */}
                  {isOverCap && (
                    <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-red-400" />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 text-[11px] text-zinc-500 flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded border border-amber-500/30 bg-amber-500/8 inline-block" />
          Has requests
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded border border-red-500/40 bg-red-500/10 inline-block" />
          Over cap (8+)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded border border-emerald-500/30 bg-emerald-500/8 inline-block" />
          All approved
        </span>
        <span className="flex items-center gap-1.5 ml-auto">
          <span className="text-[10px] font-bold text-sky-300">A3</span> AM shift · <span className="text-[10px] font-bold text-violet-300">P2</span> PM · <span className="text-[10px] font-bold text-emerald-300">N1</span> NOC
        </span>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DecisionCalendar() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const { data, isLoading } = trpc.tools.getDecisionCalendarMonth.useQuery(
    { year, month },
    { staleTime: 30_000 }
  );

  const monthLabel = format(new Date(year, month - 1), "MMMM yyyy");

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }

  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  // Summary stats for the month
  const stats = useMemo(() => {
    if (!data) return null;
        const total = data.dates.reduce((s: number, d: CalendarDateEntry) => s + d.totalCount, 0);
        const overCap = data.dates.filter((d: CalendarDateEntry) => d.isOverCap).length;
        const allApproved = data.dates.filter((d: CalendarDateEntry) => d.allApproved).length;
        const pending = data.dates.filter((d: CalendarDateEntry) => d.shifts.some((s: ShiftData) => s.pendingCount > 0)).length;
    return { total, overCap, allApproved, pending };
  }, [data]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <CalendarDays className="w-5 h-5 text-teal-400" />
            <h1 className="text-xl font-bold text-white">Decision Calendar</h1>
          </div>
          <p className="text-sm text-zinc-400">
            Day-by-day, shift-by-shift final approval decisions. Click any date to review requests.
          </p>
        </div>

        {/* Month nav */}
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="p-2 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-white min-w-[130px] text-center">{monthLabel}</span>
          <button
            onClick={nextMonth}
            className="p-2 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total requests", value: stats.total, icon: Users, color: "text-zinc-300" },
            { label: "Days over cap", value: stats.overCap, icon: AlertTriangle, color: stats.overCap > 0 ? "text-red-400" : "text-zinc-500" },
            { label: "Days pending", value: stats.pending, icon: Clock, color: stats.pending > 0 ? "text-amber-400" : "text-zinc-500" },
            { label: "Days approved", value: stats.allApproved, icon: CheckCircle2, color: stats.allApproved > 0 ? "text-emerald-400" : "text-zinc-500" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 flex items-center gap-3">
              <Icon className={`w-4 h-4 shrink-0 ${color}`} />
              <div>
                <p className={`text-lg font-bold ${color}`}>{value}</p>
                <p className="text-[11px] text-zinc-500">{label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Calendar */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
          </div>
        ) : (
          <CalendarGrid
            year={year}
            month={month}
            dates={data?.dates ?? []}
            cap={data?.cap ?? 8}
            onSelectDate={setSelectedDate}
          />
        )}
      </div>

      {/* How to use */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
        <p className="text-xs text-zinc-500 leading-relaxed">
          <strong className="text-zinc-400">How to use:</strong> Click any date to open the shift-by-shift drill-down.
          Each row shows two badges: <strong className="text-zinc-300">P#</strong> = the employee's declared priority for that request (1 = top choice);
          <strong className="text-teal-300">WP#</strong> = working priority, the system-computed rank across all of the employee's requests for the cycle (WP1 = their most important request overall).
          Rows are sorted by <strong className="text-zinc-400">WP</strong> ascending, then seniority date.
          The <strong className="text-red-400">8-person cap line</strong> marks who can be displaced.
          Admins make all final decisions.
        </p>
      </div>

      {/* Day drill-down panel */}
      {selectedDate && (
        <DayDrillDown
          date={selectedDate}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  );
}
