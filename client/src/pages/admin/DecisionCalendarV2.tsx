/**
 * DecisionCalendarV2 — rebuilt Decision Calendar frontend
 *
 * Layout:
 *  ┌─────────────────────────────────────────────────────────┐
 *  │  Header: title · month selector (prev/next + jump)      │
 *  │  Stats bar: total · pending · approved · denied         │
 *  ├─────────────────────────────────────────────────────────┤
 *  │  Date list (one row per calendar date that has requests) │
 *  │    Each row: date label · shift pills · counts · action  │
 *  ├─────────────────────────────────────────────────────────┤
 *  │  Drill-down panel (slide-in from right)                  │
 *  │    Shift tabs · sorted request rows · approve/deny/clear │
 *  └─────────────────────────────────────────────────────────┘
 */

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import {
  ChevronLeft, ChevronRight, CalendarDays, Filter,
  CheckCircle2, XCircle, Clock, AlertTriangle, Loader2,
  X as XIcon, ArrowLeft, Shield, RotateCcw, CheckCheck,
  Users, TrendingUp
} from "lucide-react";
import { useLocation } from "wouter";

// ─── Constants ────────────────────────────────────────────────────────────────

const SHIFTS = ["AM", "PM", "NOC"] as const;
type Shift = typeof SHIFTS[number];

const SHIFT_STYLE: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  AM:  { bg: "bg-amber-500/15",  text: "text-amber-300",  border: "border-amber-500/30",  dot: "bg-amber-400"  },
  PM:  { bg: "bg-sky-500/15",    text: "text-sky-300",    border: "border-sky-500/30",    dot: "bg-sky-400"    },
  NOC: { bg: "bg-violet-500/15", text: "text-violet-300", border: "border-violet-500/30", dot: "bg-violet-400" },
};

const MONTHS = [
  { year: 2026, month: 5,  label: "May 2026" },
  { year: 2026, month: 6,  label: "Jun 2026" },
  { year: 2026, month: 7,  label: "Jul 2026" },
  { year: 2026, month: 8,  label: "Aug 2026" },
  { year: 2026, month: 9,  label: "Sep 2026" },
  { year: 2026, month: 10, label: "Oct 2026" },
  { year: 2026, month: 11, label: "Nov 2026" },
  { year: 2026, month: 12, label: "Dec 2026" },
  { year: 2027, month: 1,  label: "Jan 2027" },
  { year: 2027, month: 2,  label: "Feb 2027" },
  { year: 2027, month: 3,  label: "Mar 2027" },
  { year: 2027, month: 4,  label: "Apr 2027" },
  { year: 2027, month: 5,  label: "May 2027" },
  { year: 2027, month: 6,  label: "Jun 2027" },
  { year: 2027, month: 9,  label: "Sep 2027" },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShiftData {
  shift: string;
  count: number;
  approvedCount: number;
  pendingCount: number;
  deniedCount: number;
  decidedCount: number;
  overCap: boolean;
}

interface CalendarDateEntry {
  date: string;
  shifts: ShiftData[];
  totalCount: number;
  decidedCount: number;
  isOverCap: boolean;
  allApproved: boolean;
}

interface DayRequest {
  requestId: number;
  employeeId: number;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  shift: string;
  seniorityDate: string;
  isVerified: boolean;
  requestType: string;
  priority: number;
  status: string;
  workingPriority: number | null;
  summerShutout: boolean;
  unitSeniorityRank: number | null;
  dateDecision: string | null;
  dateDecisionNote: string | null;
  overCap: boolean;
  seniorityRank: number;
  comment: string | null;
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function seniorityYears(iso: string) {
  try {
    const d = new Date(iso);
    return Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
  } catch { return 0; }
}

function ShiftPill({ shift, count, approved, pending, denied }: {
  shift: string; count: number; approved: number; pending: number; denied: number;
}) {
  const s = SHIFT_STYLE[shift] ?? SHIFT_STYLE.AM;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${s.bg} ${s.text} ${s.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {shift}
      <span className="opacity-60">·</span>
      <span className="text-emerald-300">{approved}✓</span>
      {pending > 0 && <span className="text-amber-300">{pending}?</span>}
      {denied > 0 && <span className="text-red-400">{denied}✗</span>}
      <span className="opacity-40">/{count}</span>
    </span>
  );
}

function DecisionBadge({ decision }: { decision: string | null }) {
  if (decision === "approved") return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
      <CheckCircle2 className="w-2.5 h-2.5" /> Approved
    </span>
  );
  if (decision === "denied") return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border border-red-500/40 bg-red-500/10 text-red-300">
      <XCircle className="w-2.5 h-2.5" /> Denied
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border border-amber-500/30 bg-amber-500/8 text-amber-400">
      <Clock className="w-2.5 h-2.5" /> Pending
    </span>
  );
}

// ─── Drill-Down Panel ─────────────────────────────────────────────────────────

function DrillDown({
  date,
  initialShift,
  onClose,
  pendingOnly,
}: {
  date: string;
  initialShift?: Shift;
  onClose: () => void;
  pendingOnly: boolean;
}) {
  const [activeShift, setActiveShift] = useState<"ALL" | Shift>(initialShift ?? "ALL");
  const utils = trpc.useUtils();

  const { data, isLoading, error } = trpc.tools.getDecisionCalendarDay.useQuery(
    { date, shift: activeShift === "ALL" ? undefined : activeShift },
    { enabled: !!date, retry: false }
  );

  const isAuthError = error && (
    error.message?.includes("UNAUTHORIZED") ||
    error.message?.includes("FORBIDDEN") ||
    (error as { data?: { code?: string } }).data?.code === "UNAUTHORIZED" ||
    (error as { data?: { code?: string } }).data?.code === "FORBIDDEN"
  );

  const approveMutation = trpc.tools.approveDateDecision.useMutation({
    onSuccess: () => { utils.tools.getDecisionCalendarDay.invalidate(); utils.tools.getDecisionCalendarMonth.invalidate(); toast.success("Date approved"); },
    onError: (e) => toast.error(e.message),
  });
  const denyMutation = trpc.tools.denyDateDecision.useMutation({
    onSuccess: () => { utils.tools.getDecisionCalendarDay.invalidate(); utils.tools.getDecisionCalendarMonth.invalidate(); toast.success("Date denied"); },
    onError: (e) => toast.error(e.message),
  });
  const clearMutation = trpc.tools.clearDateDecision.useMutation({
    onSuccess: () => { utils.tools.getDecisionCalendarDay.invalidate(); utils.tools.getDecisionCalendarMonth.invalidate(); toast.success("Decision cleared"); },
    onError: (e) => toast.error(e.message),
  });
  const bulkMutation = trpc.tools.bulkApproveDates.useMutation({
    onSuccess: () => { utils.tools.getDecisionCalendarDay.invalidate(); utils.tools.getDecisionCalendarMonth.invalidate(); toast.success("All dates approved"); },
    onError: (e) => toast.error(e.message),
  });

  const formatted = useMemo(() => {
    try { return format(parseISO(date), "EEEE, MMMM d, yyyy"); } catch { return date; }
  }, [date]);

  // Group by shift, optionally filtering to pending-only rows
  const byShift = useMemo(() => {
    if (!data) return {} as Record<string, DayRequest[]>;
    const map: Record<string, DayRequest[]> = {};
    const rows: DayRequest[] = pendingOnly
      ? (data.requests as DayRequest[]).filter(r => r.dateDecision === null)
      : (data.requests as DayRequest[]);
    for (const r of rows) {
      if (!map[r.shift]) map[r.shift] = [];
      map[r.shift].push(r);
    }
    return map;
  }, [data, pendingOnly]);

  const pendingCount = useMemo(() =>
    data ? (data.requests as DayRequest[]).filter(r => r.dateDecision === null).length : 0,
  [data]);

  const shiftsToShow = activeShift === "ALL"
    ? SHIFTS.filter(s => byShift[s]?.length)
    : ([activeShift] as Shift[]);

  const shiftCounts = useMemo(() => {
    if (!data) return {} as Record<string, number>;
    const m: Record<string, number> = {};
    for (const r of data.requests as DayRequest[]) {
      const key = pendingOnly ? (r.dateDecision === null ? r.shift : null) : r.shift;
      if (key) m[key] = (m[key] ?? 0) + 1;
    }
    return m;
  }, [data, pendingOnly]);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-3xl h-full bg-zinc-950 border-l border-zinc-800 flex flex-col shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-800 bg-zinc-950 shrink-0">
          <button onClick={onClose} className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-teal-400 shrink-0" />
              <h2 className="text-sm font-bold text-white truncate">{formatted}</h2>
            </div>
            {data && (
              <p className="text-xs text-zinc-500 mt-0.5">
                {data.totalCount} request{data.totalCount !== 1 ? "s" : ""} · Cap: {data.cap}/shift
                {pendingOnly && ` · ${pendingCount} pending`}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Pending-only banner */}
        {pendingOnly && (
          <div className="flex items-center gap-2 px-5 py-2 bg-amber-500/10 border-b border-amber-500/20 shrink-0">
            <Filter className="w-3 h-3 text-amber-400 shrink-0" />
            <span className="text-xs text-amber-300 font-medium">
              Pending Only — {pendingCount} undecided of {data?.totalCount ?? "…"} total
            </span>
          </div>
        )}

        {/* Shift tabs */}
        <div className="flex gap-1 px-5 py-3 border-b border-zinc-800 shrink-0 flex-wrap">
          {(["ALL", ...SHIFTS] as const).map(s => {
            const cnt = s === "ALL"
              ? Object.values(shiftCounts).reduce((a, b) => a + b, 0)
              : (shiftCounts[s] ?? 0);
            const sc = s !== "ALL" ? SHIFT_STYLE[s] : null;
            return (
              <button
                key={s}
                onClick={() => setActiveShift(s)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                  activeShift === s
                    ? sc
                      ? `${sc.bg} ${sc.text} ${sc.border}`
                      : "bg-teal-600/20 text-teal-300 border-teal-500/40"
                    : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-600 hover:text-zinc-200"
                }`}
              >
                {s !== "ALL" && sc && <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />}
                {s}
                {cnt > 0 && (
                  <span className={`text-[10px] px-1 rounded-full ${activeShift === s ? "bg-white/10" : "bg-zinc-700"}`}>
                    {cnt}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {isAuthError ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-red-400">
              <Shield className="w-10 h-10 opacity-50" />
              <p className="text-sm font-semibold">Session expired or access denied</p>
              <p className="text-xs text-red-400/70">Please log in again to view this data.</p>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
            </div>
          ) : !data || data.requests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-500 gap-2">
              <CalendarDays className="w-8 h-8 opacity-30" />
              <p className="text-sm">No requests for this date{activeShift !== "ALL" ? ` (${activeShift})` : ""}</p>
            </div>
          ) : pendingOnly && shiftsToShow.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-500/50" />
              <p className="text-sm font-semibold text-emerald-400">All decisions made</p>
              <p className="text-xs text-zinc-500">Every row has been approved or denied.</p>
            </div>
          ) : (
            shiftsToShow.map(shift => {
              const shiftReqs = (byShift[shift] ?? []).slice().sort((a, b) => {
                if (a.summerShutout !== b.summerShutout) return a.summerShutout ? 1 : -1;
                const wpA = a.workingPriority ?? 9999;
                const wpB = b.workingPriority ?? 9999;
                if (wpA !== wpB) return wpA - wpB;
                return a.seniorityDate.localeCompare(b.seniorityDate);
              });
              if (!shiftReqs.length) return null;
              const sc = SHIFT_STYLE[shift];
              const cap = data.cap;
              const shutoutCount = shiftReqs.filter(r => r.summerShutout).length;

              return (
                <div key={shift}>
                  {/* Shift section header */}
                  <div className={`flex items-center gap-3 mb-3 pb-2 border-b ${sc.border}`}>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${sc.bg} ${sc.text} ${sc.border}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                      {shift}
                    </span>
                    <span className="text-xs text-zinc-400">{shiftReqs.length} request{shiftReqs.length !== 1 ? "s" : ""}</span>
                    {shiftReqs.length > cap && (
                      <span className="flex items-center gap-1 text-xs text-red-400">
                        <AlertTriangle className="w-3 h-3" />
                        {shiftReqs.length - cap} over cap
                      </span>
                    )}
                    {/* Bulk approve all pending in this shift */}
                    <button
                      className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-600/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-600/30 transition-colors disabled:opacity-40"
                      disabled={bulkMutation.isPending}
                      title={`Approve all ${shiftReqs.length} requests in ${shift} for this date`}
                      onClick={() => {
                        const ids = Array.from(new Set(shiftReqs.map(r => r.requestId)));
                        ids.forEach(id => bulkMutation.mutate({ requestId: id }));
                      }}
                    >
                      {bulkMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCheck className="w-3 h-3" />}
                      Approve All
                    </button>
                  </div>

                  {/* Summer cap banner */}
                  {shutoutCount > 0 && (
                    <div className="mb-3 flex items-start gap-2 rounded-lg border border-orange-500/30 bg-orange-500/8 px-3 py-2">
                      <span className="text-orange-400 mt-0.5">☀</span>
                      <div>
                        <p className="text-xs font-semibold text-orange-300">Summer 14-Day Cap Applied</p>
                        <p className="text-[11px] text-orange-400/70 mt-0.5">
                          {shutoutCount} request{shutoutCount !== 1 ? "s" : ""} exceed the 14-consecutive-day limit for Jul/Aug. Listed at bottom — admin can still approve.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Request rows */}
                  <div className="space-y-2">
                    {shiftReqs.map((req, idx) => {
                      const isOverCap = req.overCap;
                      const isSummerShutout = req.summerShutout;
                      const isPending = req.dateDecision === null;
                      const isApproved = req.dateDecision === "approved";
                      const isDenied = req.dateDecision === "denied";

                      return (
                        <div key={req.requestId}>
                          {/* Cap divider */}
                          {!isSummerShutout && isOverCap && (() => {
                            const prev = shiftReqs[idx - 1];
                            return prev && !prev.overCap ? (
                              <div className="flex items-center gap-2 my-2">
                                <div className="flex-1 h-px bg-red-500/40" />
                                <span className="text-[10px] text-red-400 font-semibold px-2 py-0.5 rounded bg-red-500/10 border border-red-500/30">
                                  ── 8-PERSON CAP ──
                                </span>
                                <div className="flex-1 h-px bg-red-500/40" />
                              </div>
                            ) : null;
                          })()}
                          {/* Summer cap divider */}
                          {isSummerShutout && (() => {
                            const prev = shiftReqs[idx - 1];
                            return prev && !prev.summerShutout ? (
                              <div className="flex items-center gap-2 my-2">
                                <div className="flex-1 h-px bg-orange-500/40" />
                                <span className="text-[10px] text-orange-400 font-semibold px-2 py-0.5 rounded bg-orange-500/10 border border-orange-500/30">
                                  ☀ SUMMER 14-DAY CAP — ADMIN DECISION REQUIRED
                                </span>
                                <div className="flex-1 h-px bg-orange-500/40" />
                              </div>
                            ) : null;
                          })()}

                          <div className={`rounded-xl border px-4 py-3 transition-all ${
                            isSummerShutout
                              ? "border-orange-500/25 bg-orange-500/5 opacity-80"
                              : isApproved
                              ? "border-emerald-500/25 bg-emerald-500/5"
                              : isDenied
                              ? "border-red-500/20 bg-red-500/5 opacity-60"
                              : isOverCap
                              ? "border-red-500/15 bg-zinc-900"
                              : "border-zinc-800 bg-zinc-900"
                          }`}>
                            <div className="flex items-start gap-3 flex-wrap">
                              {/* Rank bubble */}
                              <span className={`mt-0.5 text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                                isSummerShutout ? "bg-orange-500/20 text-orange-400"
                                : isOverCap ? "bg-red-500/20 text-red-400"
                                : "bg-teal-500/20 text-teal-300"
                              }`}>
                                {isSummerShutout ? "☀" : idx + 1}
                              </span>

                              {/* Name + meta */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {req.unitSeniorityRank !== null && (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold border border-zinc-600/40 bg-zinc-800 text-zinc-300"
                                      title={`Unit seniority rank #${req.unitSeniorityRank}`}>
                                      <span className="opacity-50 text-[9px]">SR</span>{req.unitSeniorityRank}
                                    </span>
                                  )}
                                  <span className={`text-sm font-semibold ${isOverCap && !isSummerShutout ? "text-zinc-400" : "text-white"}`}>
                                    {req.lastName}, {req.firstName}
                                  </span>
                                  {req.isVerified && <Shield className="w-3 h-3 text-teal-400 shrink-0" />}
                                  {/* Priority badges */}
                                  {req.priority != null && (
                                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                      req.priority === 1
                                        ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                                        : "bg-zinc-700/60 text-zinc-400 border-zinc-600/30"
                                    }`}>P{req.priority}</span>
                                  )}
                                  {req.workingPriority != null && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border bg-teal-500/10 text-teal-300 border-teal-500/25">
                                      WP{req.workingPriority}
                                    </span>
                                  )}
                                  {isSummerShutout && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border border-orange-500/40 bg-orange-500/10 text-orange-300">
                                      ☀ Summer Cap
                                    </span>
                                  )}
                                  <DecisionBadge decision={req.dateDecision} />
                                </div>
                                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-zinc-500 flex-wrap">
                                  <span>#{req.employeeNumber}</span>
                                  <span>·</span>
                                  <span>{seniorityYears(req.seniorityDate)}y seniority</span>
                                  {req.dateDecisionNote && (
                                    <><span>·</span><span className="text-zinc-400 italic">{req.dateDecisionNote}</span></>
                                  )}
                                  {req.comment && (
                                    <><span>·</span><span className="text-amber-500/70 italic">Has comment</span></>
                                  )}
                                </div>
                              </div>

                              {/* Action buttons */}
                              <div className="flex gap-1.5 shrink-0 mt-0.5">
                                {req.dateDecision !== "approved" && (
                                  <Button size="sm" variant="outline"
                                    className="h-7 px-2.5 text-xs border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/15 hover:text-emerald-300"
                                    disabled={approveMutation.isPending}
                                    onClick={() => approveMutation.mutate({ requestId: req.requestId, date })}
                                  >
                                    {approveMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                                    <span className="ml-1">{req.dateDecision === "denied" ? "Re-approve" : "Approve"}</span>
                                  </Button>
                                )}
                                {req.dateDecision !== "denied" && (
                                  <Button size="sm" variant="outline"
                                    className="h-7 px-2.5 text-xs border-red-500/40 text-red-400 hover:bg-red-500/15 hover:text-red-300"
                                    disabled={denyMutation.isPending}
                                    onClick={() => denyMutation.mutate({ requestId: req.requestId, date })}
                                  >
                                    {denyMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                                    <span className="ml-1">{req.dateDecision === "approved" ? "Re-deny" : "Deny"}</span>
                                  </Button>
                                )}
                                {req.dateDecision !== null && (
                                  <Button size="sm" variant="outline"
                                    className="h-7 w-7 p-0 border-zinc-700/50 text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-200"
                                    title="Clear decision (reset to undecided)"
                                    disabled={clearMutation.isPending}
                                    onClick={() => clearMutation.mutate({ requestId: req.requestId, date })}
                                  >
                                    {clearMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                                  </Button>
                                )}
                              </div>
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
        <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-950 shrink-0">
          <div className="flex items-center gap-4 text-[11px] text-zinc-500 flex-wrap">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" /> P1 = first choice</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-zinc-500" /> P2+ = secondary</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-teal-400" /> WP = working priority</span>
            <span className="flex items-center gap-1"><Shield className="w-3 h-3 text-teal-400" /> seniority verified</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" /> below cap = displaceable</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DecisionCalendarV2() {
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(7);
  const [pendingOnly, setPendingOnly] = useState(false);
  const [drillDate, setDrillDate] = useState<string | null>(null);
  const [drillShift, setDrillShift] = useState<Shift | undefined>(undefined);
  const [, navigate] = useLocation();

  const { data, isLoading, error } = trpc.tools.getDecisionCalendarMonth.useQuery(
    { year, month },
    { retry: false }
  );

  const isAuthError = error && (
    error.message?.includes("UNAUTHORIZED") ||
    error.message?.includes("FORBIDDEN") ||
    (error as { data?: { code?: string } }).data?.code === "UNAUTHORIZED" ||
    (error as { data?: { code?: string } }).data?.code === "FORBIDDEN"
  );

  // Month navigation helpers
  const currentIdx = MONTHS.findIndex(m => m.year === year && m.month === month);
  const canPrev = currentIdx > 0;
  const canNext = currentIdx < MONTHS.length - 1;

  function goMonth(y: number, m: number) { setYear(y); setMonth(m); }
  function prevMonth() { if (canPrev) { const p = MONTHS[currentIdx - 1]; goMonth(p.year, p.month); } }
  function nextMonth() { if (canNext) { const n = MONTHS[currentIdx + 1]; goMonth(n.year, n.month); } }

  const monthLabel = MONTHS.find(m => m.year === year && m.month === month)?.label
    ?? `${year}-${String(month).padStart(2, "0")}`;

  // Month-level aggregate stats
  const stats = useMemo(() => {
    if (!data) return null;
    let totalReqs = 0, totalApproved = 0, totalPending = 0, totalDenied = 0;
    for (const d of data.dates) {
      for (const s of d.shifts) {
        totalReqs     += s.count;
        totalApproved += s.approvedCount;
        totalPending  += s.pendingCount;
        totalDenied   += s.deniedCount;
      }
    }
    const pendingDates = data.dates.filter(d => d.shifts.some(s => s.pendingCount > 0)).length;
    return { totalReqs, totalApproved, totalPending, totalDenied, pendingDates };
  }, [data]);

  // Filter dates list when pendingOnly is on
  const visibleDates: CalendarDateEntry[] = useMemo(() => {
    if (!data) return [];
    return pendingOnly
      ? data.dates.filter(d => d.shifts.some(s => s.pendingCount > 0))
      : data.dates;
  }, [data, pendingOnly]);

  function openDrill(date: string, shift?: Shift) {
    setDrillDate(date);
    setDrillShift(shift);
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">

      {/* Auth error banner */}
      {isAuthError && (
        <div className="rounded-xl border border-red-500/40 bg-red-950/50 px-4 py-4 flex items-start gap-3">
          <Shield className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-300">Session expired or access denied</p>
            <p className="text-xs text-red-400/70 mt-0.5">
              Your session has expired. Please log in again to access the Decision Calendar.
            </p>
          </div>
          <button
            onClick={() => navigate("/login")}
            className="shrink-0 text-xs font-semibold text-red-300 border border-red-500/40 rounded-lg px-3 py-1.5 hover:bg-red-900/40 transition-colors"
          >
            Go to Login
          </button>
        </div>
      )}

      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <CalendarDays className="w-5 h-5 text-teal-400" />
            <h1 className="text-xl font-bold text-white">Decision Calendar</h1>
          </div>
          <p className="text-sm text-zinc-400">
            Day-by-day, shift-by-shift final approval decisions.
          </p>
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Pending Only toggle */}
          <button
            onClick={() => setPendingOnly(p => !p)}
            title={pendingOnly ? "Showing pending only — click to show all" : "Filter to pending decisions only"}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
              pendingOnly
                ? "bg-amber-500/20 border-amber-400/50 text-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.15)]"
                : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            Pending Only
            {stats && stats.pendingDates > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                pendingOnly ? "bg-amber-400/25 text-amber-200" : "bg-zinc-700 text-zinc-300"
              }`}>
                {stats.pendingDates}
              </span>
            )}
          </button>

          {/* Month jump dropdown */}
          <select
            value={`${year}-${month}`}
            onChange={e => {
              const [y, m] = e.target.value.split("-").map(Number);
              goMonth(y, m);
            }}
            className="text-xs font-medium bg-zinc-900 border border-zinc-700 text-zinc-200 rounded-lg px-2.5 py-1.5 cursor-pointer hover:border-zinc-500 transition-colors"
          >
            {MONTHS.map(qm => (
              <option key={`${qm.year}-${qm.month}`} value={`${qm.year}-${qm.month}`}>
                {qm.label}
              </option>
            ))}
          </select>

          {/* Prev / label / Next */}
          <button
            onClick={prevMonth}
            disabled={!canPrev}
            className="p-2 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-bold text-white min-w-[110px] text-center">{monthLabel}</span>
          <button
            onClick={nextMonth}
            disabled={!canNext}
            className="p-2 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Total request-dates", value: stats.totalReqs,    icon: Users,       color: "text-zinc-300" },
            { label: "Approved",            value: stats.totalApproved, icon: CheckCircle2, color: stats.totalApproved > 0 ? "text-emerald-400" : "text-zinc-500" },
            { label: "Pending",             value: stats.totalPending,  icon: Clock,        color: stats.totalPending > 0 ? "text-amber-400" : "text-zinc-500" },
            { label: "Denied",              value: stats.totalDenied,   icon: XCircle,      color: stats.totalDenied > 0 ? "text-red-400" : "text-zinc-500" },
            { label: "Dates with pending",  value: stats.pendingDates,  icon: TrendingUp,   color: stats.pendingDates > 0 ? "text-amber-400" : "text-zinc-500" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 flex items-center gap-3">
              <Icon className={`w-4 h-4 shrink-0 ${color}`} />
              <div>
                <p className={`text-lg font-bold leading-tight ${color}`}>{value}</p>
                <p className="text-[11px] text-zinc-500 leading-tight mt-0.5">{label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Date list */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[90px_1fr_auto] gap-4 px-5 py-2.5 border-b border-zinc-800 bg-zinc-900/60">
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">Date</span>
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">Shifts</span>
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">Status</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
          </div>
        ) : isAuthError ? null : visibleDates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-500 gap-2">
            {pendingOnly ? (
              <>
                <CheckCircle2 className="w-10 h-10 text-emerald-500/40" />
                <p className="text-sm font-medium text-emerald-400">No pending decisions this month</p>
                <p className="text-xs text-zinc-500">All request-dates have been approved or denied.</p>
              </>
            ) : (
              <>
                <CalendarDays className="w-10 h-10 opacity-30" />
                <p className="text-sm">No vacation requests for {monthLabel}</p>
              </>
            )}
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/60">
            {visibleDates.map(entry => {
              const totalPending  = entry.shifts.reduce((s, x) => s + x.pendingCount, 0);
              const totalApproved = entry.shifts.reduce((s, x) => s + x.approvedCount, 0);
              const totalDenied   = entry.shifts.reduce((s, x) => s + x.deniedCount, 0);
              const allDone       = totalPending === 0;

              let rowAccent = "";
              if (entry.isOverCap)    rowAccent = "border-l-2 border-l-red-500/60";
              else if (!allDone)      rowAccent = "border-l-2 border-l-amber-400/50";
              else if (entry.allApproved) rowAccent = "border-l-2 border-l-emerald-500/50";

              let dateLabel = entry.date;
              try { dateLabel = format(parseISO(entry.date), "EEE, MMM d"); } catch { /* noop */ }

              return (
                <div
                  key={entry.date}
                  className={`grid grid-cols-[90px_1fr_auto] gap-4 px-5 py-3 hover:bg-zinc-900/60 transition-colors ${rowAccent}`}
                >
                  {/* Date */}
                  <button
                    onClick={() => openDrill(entry.date)}
                    className="text-left"
                  >
                    <p className="text-sm font-semibold text-white hover:text-teal-300 transition-colors">{dateLabel}</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">{entry.totalCount} total</p>
                  </button>

                  {/* Shift pills — clicking a pill opens drill-down pre-filtered to that shift */}
                  <div className="flex flex-wrap gap-1.5 items-center">
                    {entry.shifts.map(s => (
                      <button
                        key={s.shift}
                        onClick={() => openDrill(entry.date, s.shift as Shift)}
                        title={`Open ${s.shift} drill-down`}
                      >
                        <ShiftPill
                          shift={s.shift}
                          count={s.count}
                          approved={s.approvedCount}
                          pending={s.pendingCount}
                          denied={s.deniedCount}
                        />
                      </button>
                    ))}
                  </div>

                  {/* Status summary */}
                  <div className="flex items-center gap-2 shrink-0">
                    {allDone ? (
                      <span className="flex items-center gap-1 text-xs font-semibold text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Done
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-semibold text-amber-400">
                        <Clock className="w-3.5 h-3.5" /> {totalPending} pending
                      </span>
                    )}
                    {entry.isOverCap && (
                      <span className="flex items-center gap-1 text-xs text-red-400">
                        <AlertTriangle className="w-3 h-3" /> Over cap
                      </span>
                    )}
                    <button
                      onClick={() => openDrill(entry.date)}
                      className="ml-1 text-xs text-zinc-500 hover:text-teal-300 transition-colors underline underline-offset-2"
                    >
                      Review
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* How-to tip */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
        <p className="text-xs text-zinc-500 leading-relaxed">
          <strong className="text-zinc-400">How to use:</strong> Click any date or shift pill to open the drill-down panel.
          <strong className="text-zinc-300"> P#</strong> = declared priority (1 = top choice);
          <strong className="text-teal-300"> WP#</strong> = working priority (system-computed rank across all of the employee's requests).
          Rows are sorted by WP then seniority. The <strong className="text-red-400">8-person cap line</strong> marks who can be displaced.
        </p>
      </div>

      {/* Drill-down panel */}
      {drillDate && (
        <DrillDown
          date={drillDate}
          initialShift={drillShift}
          onClose={() => { setDrillDate(null); setDrillShift(undefined); }}
          pendingOnly={pendingOnly}
        />
      )}
    </div>
  );
}
