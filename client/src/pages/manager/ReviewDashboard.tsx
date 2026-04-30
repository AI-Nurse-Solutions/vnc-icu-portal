import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import {
  LayoutDashboard, AlertTriangle, CheckCircle2, XCircle, Loader2,
  ChevronDown, ChevronUp, Flame, Shield, User, Calendar,
  TrendingUp, Filter, ArrowRight, Zap
} from "lucide-react";

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
};

const SHIFT_COLORS: Record<string, string> = {
  AM: "oklch(0.68 0.15 200)",
  PM: "oklch(0.70 0.15 290)",
  NOC: "oklch(0.65 0.17 160)",
};

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
  const utils = trpc.useUtils();

  const submitDecision = trpc.manager.submitDecision.useMutation({
    onSuccess: (data) => {
      toast.success(`Decision submitted — ${data.approvedCount} approved, ${data.deniedCount} denied`);
      utils.tools.getApprovalRunData.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // For bulk decisions from the dashboard we don't have dateIds, so we use getRequestDetail first
  const requestDetail = trpc.manager.getRequestDetail.useQuery(
    { requestId: req.requestId },
    { enabled: false }
  );

  const handleBulkApprove = async () => {
    const detail = await requestDetail.refetch();
    if (!detail.data) return toast.error("Could not load request details");
    const dateDecisions = detail.data.dates.map(d => ({ dateId: d.id, date: d.date, decision: "approved" as const }));
    submitDecision.mutate({ requestId: req.requestId, dateDecisions, note: "" });
  };

  const handleBulkDeny = async () => {
    const detail = await requestDetail.refetch();
    if (!detail.data) return toast.error("Could not load request details");
    const dateDecisions = detail.data.dates.map(d => ({ dateId: d.id, date: d.date, decision: "denied" as const }));
    submitDecision.mutate({ requestId: req.requestId, dateDecisions, note: "" });
  };

  const isEducation = req.requestType === "education";
  const isLoading = submitDecision.isPending;

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
        {/* Priority badge */}
        <div className={`flex-shrink-0 w-9 h-9 rounded-lg border flex items-center justify-center font-bold text-sm ${getPriorityColor(req.priority)}`}>
          P{req.priority}
        </div>

        {/* Employee info */}
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
              <Badge variant="outline" className="text-purple-400 border-purple-500/30 bg-purple-500/10 text-[10px]">
                EDU
              </Badge>
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

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {req.isAllClear && !isLoading && (
            <Button
              size="sm"
              className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white gap-1"
              onClick={handleBulkApprove}
            >
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

      {/* Dates row */}
      <div className="px-4 pb-3 flex flex-wrap gap-1.5">
        {req.dates.map(d => {
          const isHot = req.hotDates.includes(d);
          return (
            <span
              key={d}
              className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
                isHot
                  ? "bg-orange-500/15 text-orange-300 border-orange-500/30"
                  : "bg-secondary/40 text-muted-foreground border-border/30"
              }`}
            >
              {isHot && <Flame className="w-2.5 h-2.5 inline mr-0.5 mb-0.5" />}
              {format(parseISO(d), "MMM d")}
            </span>
          );
        })}
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
              <strong>Oversubscribed dates</strong> — manual tiebreaker required. Check Hot Dates View for full seniority ranking on {req.hotDates.map(d => format(parseISO(d), "MMM d")).join(", ")}.
            </div>
          )}

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 gap-1"
              onClick={handleBulkApprove}
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
              Approve All
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs border-red-500/40 text-red-400 hover:bg-red-500/10 gap-1"
              onClick={handleBulkDeny}
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
              Deny All
            </Button>
            <span className="text-xs text-muted-foreground self-center ml-1">
              For per-date decisions, use Review Requests.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ReviewDashboard() {
  const currentYear = new Date().getFullYear();
  const [selectedMonth, setSelectedMonth] = useState<number | undefined>(undefined);
  const [shiftFilter, setShiftFilter] = useState<string>("ALL");
  const [showClearOnly, setShowClearOnly] = useState(false);

  const { data, isLoading, refetch } = trpc.tools.getApprovalRunData.useQuery({
    month: selectedMonth,
    year: currentYear,
  });

  const filtered = useMemo(() => {
    if (!data?.requests) return [];
    let list = data.requests;
    if (shiftFilter !== "ALL") list = list.filter(r => r.shift === shiftFilter);
    if (showClearOnly) list = list.filter(r => r.isAllClear);
    return list;
  }, [data, shiftFilter, showClearOnly]);

  const clearCount = useMemo(() => data?.requests.filter(r => r.isAllClear).length ?? 0, [data]);
  const hotCount = useMemo(() => data?.requests.filter(r => r.hasHotDates).length ?? 0, [data]);
  const eduCount = useMemo(() => data?.requests.filter(r => r.requestType === "education").length ?? 0, [data]);

  const MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <LayoutDashboard className="w-5 h-5 text-primary" />
          Review Dashboard
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Approval run interface — sorted by 3-rule hierarchy: Priority → Seniority → 21-day yield
        </p>
      </div>

      {/* Rule legend */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-card border border-border/40 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-5 h-5 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center text-[10px] font-bold text-red-400">1</span>
            <span className="text-xs font-semibold text-foreground">Priority Rule</span>
          </div>
          <p className="text-[11px] text-muted-foreground">P1 beats P2+ on oversubscribed days. Approve P1 first.</p>
        </div>
        <div className="bg-card border border-border/40 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-5 h-5 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-[10px] font-bold text-blue-400">2</span>
            <span className="text-xs font-semibold text-foreground">Seniority Rule</span>
          </div>
          <p className="text-[11px] text-muted-foreground">Within same priority tier, earlier seniority date wins.</p>
        </div>
        <div className="bg-card border border-border/40 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-5 h-5 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-[10px] font-bold text-amber-400">3</span>
            <span className="text-xs font-semibold text-foreground">21-Day Yield</span>
          </div>
          <p className="text-[11px] text-muted-foreground">Employees over 21 days yield if request is not their P1.</p>
        </div>
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
        {/* Month filter */}
        <div className="flex items-center gap-1 bg-secondary/30 rounded-lg p-1">
          <button
            onClick={() => setSelectedMonth(undefined)}
            className={`text-xs px-3 py-1.5 rounded-md transition-all font-medium ${!selectedMonth ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            All Months
          </button>
          {data?.availableMonths.map(ym => {
            const [y, m] = ym.split("-");
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

        {/* Shift filter */}
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

        {/* Clear only toggle */}
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
            <RequestCard key={req.requestId} req={req} cap={data?.cap ?? 8} />
          ))}
        </div>
      )}
    </div>
  );
}
