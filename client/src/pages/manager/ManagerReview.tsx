import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  BarChart3, CheckCircle2, XCircle, Loader2, MessageSquare,
  Filter, TrendingUp, AlertTriangle, ChevronDown, ChevronUp,
  User, Calendar, Clock, Send, RotateCcw, ShieldCheck
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

// ─── Types ────────────────────────────────────────────────────────────────────
type DateDecision = "approved" | "denied" | "pending";

type RequestDate = {
  dateId: number;
  date: string; // ISO "YYYY-MM-DD"
  decision: DateDecision;
};

type Request = {
  requestId: number;
  employeeId: number;
  requestType: string;
  continuityType: string;
  comment?: string | null;
  status: string;
  priority: number;
  submittedAt: Date;
  decidedAt?: Date | null;
  decidedBy?: number | null;
  decisionNote?: string | null;
  firstName: string;
  lastName: string;
  shift: string;
  seniorityDate: Date;
  employeeNumber: string;
  dates: string[];
};

const WARNING_DAYS = 15;
const SHIFT_COLORS: Record<string, string> = {
  AM: "oklch(0.68 0.15 200)",
  PM: "oklch(0.70 0.15 290)",
  NOC: "oklch(0.65 0.17 160)",
};

// ─── Period Pills ─────────────────────────────────────────────────────────────
function PeriodBalance({ employeeId, requestDates }: { employeeId: number; requestDates: string[] }) {
  const { data } = trpc.manager.getEmployeePeriodCounts.useQuery({ employeeId });
  if (!data) return <div className="h-4 w-24 bg-secondary/40 rounded animate-pulse" />;

  const year = new Date().getFullYear();
  const thisRequestA = requestDates.filter(d => {
    const m = new Date(d + "T12:00:00").getMonth();
    return m <= 5;
  }).length;
  const thisRequestB = requestDates.filter(d => {
    const m = new Date(d + "T12:00:00").getMonth();
    return m >= 6;
  }).length;

  const renderPeriod = (label: string, existing: number, adding: number) => {
    const total = existing + adding;
    const isWarn = total >= WARNING_DAYS;
    return (
      <div className="flex flex-col gap-0.5 min-w-[80px]">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground font-medium">
            {label === "A" ? `Jan–Jun ${year}` : `Jul–Dec ${year}`}
          </span>
          {isWarn && <AlertTriangle className="w-2.5 h-2.5 text-amber-400 shrink-0" />}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex-1 h-1.5 bg-secondary/60 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${isWarn ? "bg-amber-400" : "bg-primary"}`}
              style={{ width: `${Math.min((total / 21) * 100, 100)}%` }}
            />
          </div>
          <span className={`text-[10px] font-bold tabular-nums ${isWarn ? "text-amber-400" : "text-foreground"}`}>
            {existing}
            {adding > 0 && <span className="text-primary/80">+{adding}</span>}
            d
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="flex gap-3 flex-wrap">
      {renderPeriod("A", data.periodA, thisRequestA)}
      {renderPeriod("B", data.periodB, thisRequestB)}
    </div>
  );
}

// ─── Date Decision Grid ───────────────────────────────────────────────────────
function DateDecisionGrid({
  dates,
  decisions,
  onToggle,
  disabled,
}: {
  dates: RequestDate[];
  decisions: Record<number, DateDecision>;
  onToggle: (dateId: number, current: DateDecision) => void;
  disabled: boolean;
}) {
  const sorted = [...dates].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="flex flex-wrap gap-2">
      {sorted.map((d) => {
        const dec = decisions[d.dateId] ?? "pending";
        const label = format(new Date(d.date + "T12:00:00"), "EEE MMM d");

        const stateStyles: Record<DateDecision, string> = {
          pending: "bg-secondary/50 border-border/50 text-muted-foreground hover:border-primary/50",
          approved: "bg-[oklch(0.65_0.17_160/20%)] border-[oklch(0.65_0.17_160/60%)] text-[oklch(0.65_0.17_160)]",
          denied: "bg-destructive/15 border-destructive/50 text-destructive",
        };

        const Icon = dec === "approved" ? CheckCircle2 : dec === "denied" ? XCircle : Clock;

        return (
          <button
            key={d.dateId}
            disabled={disabled}
            onClick={() => onToggle(d.dateId, dec)}
            className={`
              flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium
              transition-all duration-150 select-none
              ${stateStyles[dec]}
              ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
            `}
            title={`Click to cycle: pending → approved → denied → pending`}
          >
            <Icon className="w-3 h-3 shrink-0" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Request Card ─────────────────────────────────────────────────────────────
function RequestCard({ req, onDecisionSubmitted }: {
  req: Request;
  onDecisionSubmitted: () => void;
}) {
  const utils = trpc.useUtils();

  // Build initial decisions map: all pending
  const initialDecisions = useMemo(() => {
    const map: Record<number, DateDecision> = {};
    // dates are strings; we need dateIds from the server — we'll fetch them
    return map;
  }, [req.requestId]);

  const [decisions, setDecisions] = useState<Record<number, DateDecision>>({});
  const [datesWithIds, setDatesWithIds] = useState<RequestDate[]>([]);
  const [datesLoaded, setDatesLoaded] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [commentExpanded, setCommentExpanded] = useState(false);

  // Load dates with IDs from the server
  const { isLoading: datesLoading } = trpc.manager.getAllRequests.useQuery(
    { status: ["pending", "approved", "denied", "withdrawn"] },
    {
      enabled: false, // we already have the data from parent
    }
  );

  // We need a dedicated query to get dates with IDs
  // Use the existing getAllRequests data — but we need dateIds
  // Fetch dates with IDs via a dedicated query
  const { data: requestDetail } = trpc.manager.getRequestDetail.useQuery(
    { requestId: req.requestId },
    { enabled: req.status === "pending" }
  );

  // Initialize decisions when detail loads
  useMemo(() => {
    if (requestDetail && !datesLoaded) {
      const map: Record<number, DateDecision> = {};
      const rdates: RequestDate[] = [];
      for (const d of requestDetail.dates) {
        map[d.id] = "pending";
        rdates.push({ dateId: d.id, date: d.date, decision: "pending" });
      }
      setDecisions(map);
      setDatesWithIds(rdates);
      setDatesLoaded(true);
    }
  }, [requestDetail, datesLoaded]);

  const submitDecision = trpc.manager.submitDecision.useMutation({
    onSuccess: (result) => {
      if (result.pendingCount > 0) {
        toast.info(`Partial decision saved. ${result.pendingCount} date(s) still pending.`);
      } else if (result.newStatus === "approved") {
        toast.success(`Request approved${result.deniedCount > 0 ? ` (${result.deniedCount} date(s) denied)` : ""}. Employee notified.`);
      } else if (result.newStatus === "denied") {
        toast.success("Request denied. Employee notified.");
      }
      utils.manager.getAllRequests.invalidate();
      utils.manager.getRequestDetail.invalidate({ requestId: req.requestId });
      onDecisionSubmitted();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleToggle = (dateId: number, current: DateDecision) => {
    const next: DateDecision = current === "pending" ? "approved" : current === "approved" ? "denied" : "pending";
    setDecisions(prev => ({ ...prev, [dateId]: next }));
  };

  const handleBulkApprove = () => {
    const map: Record<number, DateDecision> = {};
    datesWithIds.forEach(d => { map[d.dateId] = "approved"; });
    setDecisions(map);
  };

  const handleBulkDeny = () => {
    const map: Record<number, DateDecision> = {};
    datesWithIds.forEach(d => { map[d.dateId] = "denied"; });
    setDecisions(map);
  };

  const handleReset = () => {
    const map: Record<number, DateDecision> = {};
    datesWithIds.forEach(d => { map[d.dateId] = "pending"; });
    setDecisions(map);
  };

  const handleSubmit = () => {
    const dateDecisions = datesWithIds.map(d => ({
      dateId: d.dateId,
      date: d.date,
      decision: decisions[d.dateId] ?? "pending",
    }));
    submitDecision.mutate({
      requestId: req.requestId,
      dateDecisions,
      note: note.trim() || undefined,
    });
  };

  const approvedCount = Object.values(decisions).filter(d => d === "approved").length;
  const deniedCount = Object.values(decisions).filter(d => d === "denied").length;
  const pendingCount = Object.values(decisions).filter(d => d === "pending").length;
  const hasDecisions = approvedCount > 0 || deniedCount > 0;

  const shiftColor = SHIFT_COLORS[req.shift] || "oklch(0.65 0.17 160)";

  const priorityColor = req.priority <= 3
    ? "text-red-400 border-red-400/40 bg-red-400/10"
    : req.priority <= 6
    ? "text-amber-400 border-amber-400/40 bg-amber-400/10"
    : "text-muted-foreground border-border/40 bg-secondary/40";

  return (
    <div className="bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm hover:shadow-md hover:border-border/80 transition-all duration-200">

      {/* ── Zone 1: Employee Info ─────────────────────────────────────────── */}
      <div className="px-5 pt-5 pb-4 border-b border-border/30">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          {/* Left: Identity */}
          <div className="flex items-start gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 border"
              style={{
                background: `${shiftColor.replace("oklch(", "oklch(").replace(")", "/15%)")}`,
                borderColor: `${shiftColor.replace("oklch(", "oklch(").replace(")", "/40%)")}`,
                color: shiftColor,
              }}
            >
              {req.firstName[0]}{req.lastName[0]}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-foreground text-base leading-tight">
                  {req.firstName} {req.lastName}
                </span>
                <span className="text-xs text-muted-foreground font-mono">#{req.employeeNumber}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap mt-1">
                {/* Shift badge */}
                <span
                  className="text-[11px] font-semibold px-2 py-0.5 rounded-full border"
                  style={{
                    background: `${shiftColor.replace(")", "/15%)")}`,
                    borderColor: `${shiftColor.replace(")", "/35%)")}`,
                    color: shiftColor,
                  }}
                >
                  {req.shift} Shift
                </span>
                {/* Type badge */}
                <span className={req.requestType === "vacation" ? "badge-vacation text-[11px]" : "badge-education text-[11px]"}>
                  {req.requestType.charAt(0).toUpperCase() + req.requestType.slice(1)}
                </span>
                {/* Continuity */}
                <span className="text-[11px] text-muted-foreground border border-border/40 px-2 py-0.5 rounded-full">
                  {req.continuityType.charAt(0).toUpperCase() + req.continuityType.slice(1)}
                </span>
              </div>
            </div>
          </div>

          {/* Right: Priority + meta */}
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <div className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full border ${priorityColor}`}>
              <span className="text-[10px] font-medium opacity-70">Priority</span>
              <span className="text-sm">{req.priority}</span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock className="w-3 h-3" />
              Submitted {format(new Date(req.submittedAt), "MMM d, yyyy")}
            </div>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <ShieldCheck className="w-3 h-3" />
              Seniority: {format(new Date(req.seniorityDate), "MMM yyyy")}
            </div>
          </div>
        </div>

        {/* Period balances — vacation only */}
        {req.requestType === "vacation" && (
          <div className="mt-3 pt-3 border-t border-border/20">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-3 h-3 text-primary" />
              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                Vacation Days Used (existing + this request)
              </span>
            </div>
            <PeriodBalance employeeId={req.employeeId} requestDates={req.dates} />
          </div>
        )}

        {/* Employee note */}
        {req.comment && (
          <div className="mt-3 pt-3 border-t border-border/20">
            <button
              onClick={() => setCommentExpanded(!commentExpanded)}
              className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span className="font-medium">Employee Note Attached</span>
              {commentExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {commentExpanded && (
              <div className="mt-2 px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg text-xs text-muted-foreground italic">
                Has comment — hidden for privacy.
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Zone 2: Date Decision Grid ────────────────────────────────────── */}
      {req.status === "pending" && (
        <div className="px-5 py-4 border-b border-border/30">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-foreground">
                Requested Dates
                <span className="text-muted-foreground font-normal ml-1">
                  ({req.dates.length} day{req.dates.length !== 1 ? "s" : ""})
                </span>
              </span>
            </div>
            {/* Decision summary pills */}
            {datesLoaded && (
              <div className="flex items-center gap-1.5 text-[10px]">
                {approvedCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-[oklch(0.65_0.17_160/20%)] text-[oklch(0.65_0.17_160)] border border-[oklch(0.65_0.17_160/40%)] font-semibold">
                    ✓ {approvedCount} approved
                  </span>
                )}
                {deniedCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-destructive/15 text-destructive border border-destructive/40 font-semibold">
                    ✗ {deniedCount} denied
                  </span>
                )}
                {pendingCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-secondary/60 text-muted-foreground border border-border/40 font-semibold">
                    ◷ {pendingCount} pending
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Instruction hint */}
          <p className="text-[10px] text-muted-foreground mb-3">
            Click a date to cycle: <span className="text-muted-foreground">◷ Pending</span> → <span className="text-[oklch(0.65_0.17_160)]">✓ Approved</span> → <span className="text-destructive">✗ Denied</span>
          </p>

          {!datesLoaded ? (
            <div className="flex gap-2 flex-wrap">
              {req.dates.map(d => (
                <div key={d} className="h-8 w-24 bg-secondary/40 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : (
            <DateDecisionGrid
              dates={datesWithIds}
              decisions={decisions}
              onToggle={handleToggle}
              disabled={submitDecision.isPending}
            />
          )}
        </div>
      )}

      {/* ── Zone 3: Decision Controls ─────────────────────────────────────── */}
      {req.status === "pending" && datesLoaded && (
        <div className="px-5 py-4">
          {/* Bulk actions */}
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mr-1">Bulk:</span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-3 text-xs bg-[oklch(0.65_0.17_160/10%)] text-[oklch(0.65_0.17_160)] border-[oklch(0.65_0.17_160/40%)] hover:bg-[oklch(0.65_0.17_160/20%)]"
              onClick={handleBulkApprove}
              disabled={submitDecision.isPending}
            >
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Approve All Dates
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-3 text-xs bg-destructive/10 text-destructive border-destructive/40 hover:bg-destructive/20"
              onClick={handleBulkDeny}
              disabled={submitDecision.isPending}
            >
              <XCircle className="w-3 h-3 mr-1" />
              Deny All Dates
            </Button>
            {hasDecisions && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-3 text-xs text-muted-foreground hover:text-foreground"
                onClick={handleReset}
                disabled={submitDecision.isPending}
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Reset
              </Button>
            )}
          </div>

          {/* Admin note */}
          <div className="mb-4">
            <button
              onClick={() => setNoteOpen(!noteOpen)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>{noteOpen ? "Hide" : "Add"} note to employee</span>
              {noteOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {noteOpen && (
              <Textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Optional message to include in the email notification..."
                className="bg-input border-border/60 resize-none h-20 text-sm"
                disabled={submitDecision.isPending}
              />
            )}
          </div>

          {/* Submit button */}
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              onClick={handleSubmit}
              disabled={!hasDecisions || submitDecision.isPending || pendingCount === req.dates.length}
              className={`h-9 px-5 text-sm font-semibold gap-2 ${
                approvedCount > 0 && deniedCount === 0
                  ? "bg-[oklch(0.65_0.17_160/20%)] text-[oklch(0.65_0.17_160)] border border-[oklch(0.65_0.17_160/50%)] hover:bg-[oklch(0.65_0.17_160/30%)]"
                  : deniedCount > 0 && approvedCount === 0
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : "bg-primary/20 text-primary border border-primary/40 hover:bg-primary/30"
              }`}
            >
              {submitDecision.isPending
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Submitting...</>
                : <><Send className="w-3.5 h-3.5" /> Submit Decision & Send Email</>
              }
            </Button>

            {/* Status preview text */}
            {hasDecisions && pendingCount < req.dates.length && (
              <span className="text-[10px] text-muted-foreground">
                {pendingCount > 0
                  ? `⚠ ${pendingCount} date(s) still pending — submit will be partial`
                  : approvedCount > 0 && deniedCount > 0
                  ? `Partial: ${approvedCount} approved, ${deniedCount} denied`
                  : approvedCount > 0
                  ? `All ${approvedCount} date(s) approved`
                  : `All ${deniedCount} date(s) denied`
                }
              </span>
            )}
          </div>
        </div>
      )}

      {/* Decided state — show outcome */}
      {req.status !== "pending" && (
        <div className="px-5 py-3 flex items-center gap-3 flex-wrap">
          <span className={`badge-${req.status} text-xs`}>
            {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
          </span>
          {req.decidedAt && (
            <span className="text-xs text-muted-foreground">
              {format(new Date(req.decidedAt), "MMM d, yyyy")}
            </span>
          )}
          {req.decisionNote && (
            <span className="text-xs text-muted-foreground italic">"{req.decisionNote}"</span>
          )}
          {/* Show dates as read-only chips */}
          <div className="w-full flex flex-wrap gap-1 mt-1">
            {req.dates.sort().map(d => (
              <span key={d} className="text-xs bg-secondary/40 text-muted-foreground px-2 py-0.5 rounded-md font-mono">
                {format(new Date(d + "T12:00:00"), "MMM d")}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ManagerReview() {
  const utils = trpc.useUtils();
  const [shiftFilter, setShiftFilter] = useState<"AM" | "PM" | "NOC" | undefined>();
  const [typeFilter, setTypeFilter] = useState<"vacation" | "education" | undefined>();
  const [statusFilter, setStatusFilter] = useState<string[]>(["pending"]);

  const { data: requests, isLoading } = trpc.manager.getAllRequests.useQuery({
    status: statusFilter.length > 0 ? statusFilter as any : undefined,
    shift: shiftFilter,
    requestType: typeFilter,
  });

  // Sort by priority (1 = highest), then by submission date
  const sorted = useMemo(() => {
    if (!requests) return { pending: [], decided: [] };
    const all = [...requests].sort((a, b) => {
      const pa = (a as any).priority ?? 5;
      const pb = (b as any).priority ?? 5;
      if (pa !== pb) return pa - pb;
      return new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
    });
    return {
      pending: all.filter(r => r.status === "pending"),
      decided: all.filter(r => r.status !== "pending"),
    };
  }, [requests]);

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          Review Requests
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Requests sorted by employee priority (1 = highest). Click dates to approve or deny individually, or use bulk actions.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6 bg-card border border-border/40 rounded-xl p-3">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Filter className="w-3.5 h-3.5" /> Filters:
        </div>
        {(["pending", "approved", "denied", "withdrawn"] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])}
            className={`text-xs px-3 py-1 rounded-full border transition-all ${
              statusFilter.includes(s) ? `badge-${s}` : "border-border/40 text-muted-foreground hover:border-border/70"
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
        <div className="w-px bg-border/40 mx-1" />
        {(["AM", "PM", "NOC"] as const).map(s => (
          <button
            key={s}
            onClick={() => setShiftFilter(shiftFilter === s ? undefined : s)}
            className={`text-xs px-3 py-1 rounded-full border transition-all ${
              shiftFilter === s ? "bg-primary/15 text-primary border-primary/40" : "border-border/40 text-muted-foreground hover:border-border/70"
            }`}
          >
            {s}
          </button>
        ))}
        <div className="w-px bg-border/40 mx-1" />
        {(["vacation", "education"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTypeFilter(typeFilter === t ? undefined : t)}
            className={`text-xs px-3 py-1 rounded-full border transition-all ${
              typeFilter === t ? (t === "vacation" ? "badge-vacation" : "badge-education") : "border-border/40 text-muted-foreground hover:border-border/70"
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mb-5 text-[10px] text-muted-foreground bg-card/50 border border-border/30 rounded-lg px-3 py-2 flex-wrap">
        <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3 text-primary" /> <strong className="text-foreground">A</strong> = Jan–Jun</span>
        <span>·</span>
        <span><strong className="text-foreground">B</strong> = Jul–Dec</span>
        <span>·</span>
        <span className="text-amber-400 font-semibold flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Amber = 15+ days</span>
        <span>·</span>
        <span>Priority <strong className="text-red-400">1–3</strong> = urgent · <strong className="text-amber-400">4–6</strong> = normal · <strong className="text-muted-foreground">7–9</strong> = flexible</span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      ) : (
        <div className="space-y-8">
          {sorted.pending.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                  Awaiting Decision ({sorted.pending.length})
                </p>
              </div>
              <div className="space-y-4">
                {sorted.pending.map(req => (
                  <RequestCard
                    key={req.requestId}
                    req={req as any}
                    onDecisionSubmitted={() => utils.manager.getAllRequests.invalidate()}
                  />
                ))}
              </div>
            </div>
          )}

          {sorted.decided.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                Decided ({sorted.decided.length})
              </p>
              <div className="space-y-3 opacity-75">
                {sorted.decided.map(req => (
                  <RequestCard
                    key={req.requestId}
                    req={req as any}
                    onDecisionSubmitted={() => utils.manager.getAllRequests.invalidate()}
                  />
                ))}
              </div>
            </div>
          )}

          {!isLoading && (sorted.pending.length + sorted.decided.length) === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No requests match the current filters.</p>
              <p className="text-sm mt-1">Try adjusting the status or shift filters above.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
