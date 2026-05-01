import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import {
  LayoutDashboard, AlertTriangle, CheckCircle2, Loader2,
  ChevronDown, ChevronUp, Flame, Filter, Zap, Calendar, Check
} from "lucide-react";
import { X as XIcon } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type ApprovalRequest = {
  requestId: number;
  employeeId: number;
  requestType: string;
  continuityType: string;
  priority: number;
  comment: string | null;
  status: string;
  submittedAt: string;
  firstName: string;
  lastName: string;
  shift: string;
  seniorityDate: string;
  employeeNumber: string;
  isVerified: boolean | null;
  dates: string[];
  hotDates: string[];
  hasHotDates: boolean;
  isAllClear: boolean;
  dateRanks: Record<string, number>;
};

const SHIFT_COLORS: Record<string, string> = {
  AM: "oklch(0.68 0.15 200)",
  PM: "oklch(0.70 0.15 290)",
  NOC: "oklch(0.65 0.17 160)",
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const PRIORITY_COLORS: Record<number, string> = {
  1: "text-red-400 bg-red-500/10 border-red-500/30",
  2: "text-orange-400 bg-orange-500/10 border-orange-500/30",
  3: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
};

function getPriorityColor(p: number) {
  return PRIORITY_COLORS[p] ?? "text-muted-foreground bg-secondary/40 border-border/40";
}

function seniorityLabel(dateStr: string) {
  const d = new Date(dateStr);
  const years = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
  return `${years}y seniority`;
}

// ─── Request Card ─────────────────────────────────────────────────────────────
function RequestCard({ req, cap }: { req: ApprovalRequest; cap: number }) {
  const [expanded, setExpanded] = useState(false);
  const [dateDecisions, setDateDecisions] = useState<Record<string, "approved" | "denied" | null>>(
    () => Object.fromEntries(req.dates.map(d => [d, null]))
  );
  const [note, setNote] = useState("");
  const utils = trpc.useUtils();

  const submitDecision = trpc.manager.submitDecision.useMutation({
    onSuccess: (data) => {
      toast.success(`Decision submitted — ${data.approvedCount} approved, ${data.deniedCount} denied`);
      utils.tools.getApprovalRunData.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const requestDetail = trpc.manager.getRequestDetail.useQuery(
    { requestId: req.requestId },
    { enabled: false }
  );

  const isLoading = submitDecision.isPending || requestDetail.isFetching;

  const setAllDecisions = (decision: "approved" | "denied") => {
    setDateDecisions(Object.fromEntries(req.dates.map(d => [d, decision])));
  };

  const handleSubmitDecisions = async () => {
    const undecided = req.dates.filter(d => dateDecisions[d] === null);
    if (undecided.length > 0) {
      toast.error(`${undecided.length} date${undecided.length > 1 ? "s" : ""} still undecided.`);
      return;
    }
    const detail = await requestDetail.refetch();
    if (!detail.data) return toast.error("Could not load request details");
    const decisions = detail.data.dates.map(d => ({
      dateId: d.id,
      date: d.date,
      decision: dateDecisions[d.date] as "approved" | "denied",
    }));
    submitDecision.mutate({ requestId: req.requestId, dateDecisions: decisions, note });
  };

  const handleQuickApprove = async () => {
    const detail = await requestDetail.refetch();
    if (!detail.data) return toast.error("Could not load request details");
    const decisions = detail.data.dates.map(d => ({
      dateId: d.id,
      date: d.date,
      decision: "approved" as const,
    }));
    submitDecision.mutate({ requestId: req.requestId, dateDecisions: decisions, note: "" });
  };

  const isEducation = req.requestType === "education";
  const decidedCount = req.dates.filter(d => dateDecisions[d] !== null).length;
  const allDecided = decidedCount === req.dates.length;
  const approvedCount = req.dates.filter(d => dateDecisions[d] === "approved").length;
  const deniedCount = req.dates.filter(d => dateDecisions[d] === "denied").length;

  return (
    <div className={`bg-card border rounded-xl overflow-hidden transition-all ${
      req.hasHotDates && !isEducation
        ? "border-orange-500/40 shadow-orange-500/10 shadow-md"
        : req.isAllClear
        ? "border-emerald-500/30"
        : "border-border/40"
    }`}>
      {/* Card Header */}
      <div className="flex items-start gap-3 p-4">
        <div className={`flex-shrink-0 w-9 h-9 rounded-lg border flex items-center justify-center font-bold text-sm ${getPriorityColor(req.priority)}`}>
          P{req.priority}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground">{req.firstName} {req.lastName}</span>
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: `${SHIFT_COLORS[req.shift]}22`, color: SHIFT_COLORS[req.shift], border: `1px solid ${SHIFT_COLORS[req.shift]}44` }}
            >
              {req.shift}
            </span>
            <span className="text-xs text-muted-foreground">{seniorityLabel(req.seniorityDate)}</span>
            {isEducation && (
              <Badge variant="outline" className="text-purple-400 border-purple-500/30 bg-purple-500/10 text-[10px]">EDU</Badge>
            )}
            {req.hasHotDates && !isEducation && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-orange-400 bg-orange-500/10 border border-orange-500/30 px-2 py-0.5 rounded-full">
                <Flame className="w-2.5 h-2.5" /> {req.hotDates.length} hot date{req.hotDates.length > 1 ? "s" : ""}
              </span>
            )}
            {req.isAllClear && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                <CheckCircle2 className="w-2.5 h-2.5" /> All clear
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span>#{req.employeeNumber}</span>
            <span>{req.dates.length} day{req.dates.length !== 1 ? "s" : ""}</span>
            <span>{req.continuityType}</span>
            <span>Submitted {format(parseISO(req.submittedAt), "MMM d")}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {req.isAllClear && !isLoading && (
            <Button size="sm" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white gap-1" onClick={handleQuickApprove}>
              <Zap className="w-3 h-3" /> Quick Approve
            </Button>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-secondary/60 transition-colors text-muted-foreground"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* ─── Per-date decision grid ─────────────────────────────────────────── */}
      <div className="px-4 pb-4">
        {/* Bulk controls */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[11px] text-muted-foreground font-medium">Decide all:</span>
          <button
            onClick={() => setAllDecisions("approved")}
            className="text-[11px] px-2 py-0.5 rounded border border-emerald-500/40 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors"
          >
            ✓ All Approve
          </button>
          <button
            onClick={() => setAllDecisions("denied")}
            className="text-[11px] px-2 py-0.5 rounded border border-red-500/40 text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors"
          >
            ✗ All Deny
          </button>
          {decidedCount > 0 && (
            <span className="text-[11px] text-muted-foreground ml-auto">
              {approvedCount > 0 && <span className="text-emerald-400">{approvedCount}✓</span>}
              {approvedCount > 0 && deniedCount > 0 && <span className="mx-1 text-muted-foreground/40">·</span>}
              {deniedCount > 0 && <span className="text-red-400">{deniedCount}✗</span>}
              {!allDecided && <span className="ml-1 text-amber-400">{req.dates.length - decidedCount} left</span>}
            </span>
          )}
        </div>

        {/* Date rows */}
        <div className="space-y-1">
          {req.dates.map(d => {
            const isHot = req.hotDates.includes(d);
            const rank = req.dateRanks?.[d] ?? 1;
            const isNonFirst = rank > 1;
            const decision = dateDecisions[d];

            return (
              <div
                key={d}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border transition-all ${
                  decision === "approved"
                    ? "bg-emerald-500/10 border-emerald-500/30"
                    : decision === "denied"
                    ? "bg-red-500/10 border-red-500/30"
                    : "bg-secondary/20 border-border/20 hover:border-border/40"
                }`}
              >
                {/* Date text — amber if non-first rank */}
                <span className={`text-[11px] font-mono w-16 flex-shrink-0 ${isNonFirst ? "text-amber-400" : "text-foreground"}`}>
                  {format(parseISO(d), "MMM d")}
                </span>

                {/* Hot indicator */}
                {isHot && <Flame className="w-3 h-3 text-orange-400 flex-shrink-0" />}

                {/* Seniority rank badge */}
                {req.requestType === "vacation" && (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border flex-shrink-0 ${
                      isNonFirst
                        ? "text-amber-400 bg-amber-500/15 border-amber-500/30"
                        : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                    }`}
                    title={isNonFirst ? `Ranked #${rank} on this date — verify P1 was approved before approving` : "Ranked #1 on this date"}
                  >
                    {rank === 1 ? "#1" : `#${rank} ⚠`}
                  </span>
                )}

                {/* Non-first rank hint */}
                {isNonFirst && (
                  <span className="text-[10px] text-amber-400/80 italic flex-shrink-0 hidden sm:block">
                    Verify P1 approved first
                  </span>
                )}

                <span className="flex-1" />

                {/* Approve button */}
                <button
                  onClick={() => setDateDecisions(prev => ({ ...prev, [d]: decision === "approved" ? null : "approved" }))}
                  className={`w-7 h-7 rounded-md border flex items-center justify-center transition-all ${
                    decision === "approved"
                      ? "bg-emerald-500 border-emerald-500 text-white"
                      : "border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/20"
                  }`}
                  title="Approve this date"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>

                {/* Deny button */}
                <button
                  onClick={() => setDateDecisions(prev => ({ ...prev, [d]: decision === "denied" ? null : "denied" }))}
                  className={`w-7 h-7 rounded-md border flex items-center justify-center transition-all ${
                    decision === "denied"
                      ? "bg-red-500 border-red-500 text-white"
                      : "border-red-500/40 text-red-400 hover:bg-red-500/20"
                  }`}
                  title="Deny this date"
                >
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Submit button */}
        <div className="mt-3 flex items-center gap-2">
          <Button
            size="sm"
            className={`h-8 text-xs gap-1 ${
              allDecided
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-secondary/50 text-muted-foreground cursor-not-allowed"
            }`}
            onClick={handleSubmitDecisions}
            disabled={!allDecided || isLoading}
          >
            {isLoading ? (
              <><Loader2 className="w-3 h-3 animate-spin" /> Processing…</>
            ) : (
              <><Calendar className="w-3 h-3" /> Submit Decisions</>
            )}
          </Button>
          {!allDecided && (
            <span className="text-[11px] text-muted-foreground">
              {req.dates.length - decidedCount} date{req.dates.length - decidedCount > 1 ? "s" : ""} undecided
            </span>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border/30 p-4 space-y-3 bg-secondary/10">
          {req.comment && (
            <div className="text-xs bg-secondary/40 rounded-lg p-3 border border-border/30">
              <span className="text-muted-foreground font-medium">Employee note: </span>
              <span className="text-foreground">{req.comment}</span>
            </div>
          )}
          {req.hasHotDates && !isEducation && (
            <div className="text-xs text-orange-300 bg-orange-500/10 border border-orange-500/20 rounded-lg p-3">
              <AlertTriangle className="w-3.5 h-3.5 inline mr-1.5 mb-0.5" />
              <strong>Oversubscribed dates</strong> — dates marked <span className="text-amber-400 font-bold">amber</span> are not ranked #1 for this employee. Check Hot Dates View for full shift seniority ranking on {req.hotDates.map(d => format(parseISO(d), "MMM d")).join(", ")}.
            </div>
          )}
          <div>
            <label className="text-[11px] text-muted-foreground font-medium block mb-1">Decision note (optional)</label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. Approved per seniority, denied due to cap…"
              className="w-full h-8 rounded-md border border-border/40 bg-secondary/30 text-xs text-foreground px-2 focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ReviewDashboard() {
  const [selectedMonth, setSelectedMonth] = useState<number | undefined>(undefined);
  const [shiftFilter, setShiftFilter] = useState("ALL");
  const [showClearOnly, setShowClearOnly] = useState(false);

  const { data, isLoading, refetch } = trpc.tools.getApprovalRunData.useQuery(
    { month: selectedMonth, year: new Date().getFullYear() },
    { refetchOnWindowFocus: false }
  );

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.requests.filter(r => {
      if (shiftFilter !== "ALL" && r.shift !== shiftFilter) return false;
      if (showClearOnly && !r.isAllClear) return false;
      return true;
    });
  }, [data, shiftFilter, showClearOnly]);

  const clearCount = data?.requests.filter(r => r.isAllClear).length ?? 0;
  const hotCount = data?.requests.filter(r => r.hasHotDates && r.requestType !== "education").length ?? 0;
  const eduCount = data?.requests.filter(r => r.requestType === "education").length ?? 0;

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-start gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
          <LayoutDashboard className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Review Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Approval run — decide each date inline, then submit</p>
        </div>
      </div>

      {/* 3-rule legend */}
      <div className="mb-5 p-3 rounded-lg bg-secondary/20 border border-border/30 text-xs text-muted-foreground space-y-1">
        <p className="font-semibold text-foreground text-[11px] uppercase tracking-wider mb-1.5">Approval Hierarchy</p>
        <p><span className="text-red-400 font-bold">1. Priority</span> — P1 requests take precedence over P2+</p>
        <p><span className="text-teal-400 font-bold">2. Seniority</span> — Earlier hire date wins on same-priority ties</p>
        <p><span className="text-amber-400 font-bold">3. 21-Day Yield</span> — Employees over ceiling yield if request is not their P1</p>
        <p className="mt-1.5 text-[11px] border-t border-border/20 pt-1.5">
          <span className="text-amber-400 font-bold">⚠ Amber rank badge</span> = this employee is not ranked #1 on that date — verify their P1 request was approved before approving this date.
        </p>
      </div>

      {/* Stats bar */}
      {data && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          <div className="bg-card border border-border/40 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-foreground">{data.totalPending}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Total Pending</div>
          </div>
          <div className="bg-card border border-emerald-500/30 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-emerald-400">{clearCount}</div>
            <div className="text-xs text-muted-foreground mt-0.5">All-Clear (bulk ok)</div>
          </div>
          <div className="bg-card border border-orange-500/30 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-orange-400">{hotCount}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Have Hot Dates</div>
          </div>
          <div className="bg-card border border-purple-500/30 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-purple-400">{eduCount}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Education</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-1 bg-secondary/30 rounded-lg p-1">
          <button
            onClick={() => setSelectedMonth(undefined)}
            className={`text-xs px-3 py-1.5 rounded-md transition-all font-medium ${!selectedMonth ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            All Months
          </button>
          {data?.availableMonths.map(ym => {
            const [, m] = ym.split("-");
            const mNum = parseInt(m);
            return (
              <button
                key={ym}
                onClick={() => setSelectedMonth(mNum)}
                className={`text-xs px-3 py-1.5 rounded-md transition-all font-medium ${selectedMonth === mNum ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {MONTHS[mNum - 1]}
              </button>
            );
          })}
        </div>
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
        <button
          onClick={() => setShowClearOnly(!showClearOnly)}
          className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition-all font-medium ${
            showClearOnly
              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
              : "bg-secondary/30 text-muted-foreground border-border/40 hover:text-foreground"
          }`}
        >
          <Zap className="w-3 h-3" />
          All-Clear Only
        </button>
        <button
          onClick={() => refetch()}
          className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <Filter className="w-3 h-3" /> Refresh
        </button>
      </div>

      {/* Request list */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <LayoutDashboard className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="font-medium">No pending requests</p>
          <p className="text-sm mt-1">
            {showClearOnly ? "No all-clear requests match current filters." : "All requests have been processed."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-muted-foreground">
              Showing <strong className="text-foreground">{filtered.length}</strong> request{filtered.length !== 1 ? "s" : ""}
              {selectedMonth ? ` in ${MONTHS[selectedMonth - 1]}` : ""} — sorted by Priority → Seniority
            </p>
          </div>
          {filtered.map(req => (
            <RequestCard key={req.requestId} req={req as ApprovalRequest} cap={data?.cap ?? 8} />
          ))}
        </div>
      )}
    </div>
  );
}
