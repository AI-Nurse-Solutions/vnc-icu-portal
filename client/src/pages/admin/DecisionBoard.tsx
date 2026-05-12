import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, RotateCcw, Sun, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type Shift = "AM" | "PM" | "NOC";
type Decision = "approved" | "denied" | null;

interface DateSummary {
  date: string; // YYYY-MM-DD
  shift: string;
  approvedCount: number;
  pendingCount: number;
  deniedCount: number;
  overCap: boolean;
}

interface RequestRow {
  requestId: number;
  employeeId: number;
  firstName: string;
  lastName: string;
  shift: string;
  seniorityDate: string;
  seniorityRank: number;
  workingPriority: number | null;
  summerShutout: boolean;
  overCap: boolean;
  dateDecision: string | null;
  employeeNumber: string;
}

// ─── Month / Year helpers ─────────────────────────────────────────────────────
const MONTHS = [
  { label: "July 2026", year: 2026, month: 7 },
  { label: "August 2026", year: 2026, month: 8 },
  { label: "September 2026", year: 2026, month: 9 },
  { label: "October 2026", year: 2026, month: 10 },
  { label: "November 2026", year: 2026, month: 11 },
  { label: "December 2026", year: 2026, month: 12 },
  { label: "January 2027", year: 2027, month: 1 },
];

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

// ─── Decision Badge ───────────────────────────────────────────────────────────
function DecisionBadge({ decision }: { decision: string | null }) {
  if (decision === "approved") return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400">
      <CheckCircle2 className="w-3.5 h-3.5" /> Approved
    </span>
  );
  if (decision === "denied") return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-400">
      <XCircle className="w-3.5 h-3.5" /> Denied
    </span>
  );
  return null;
}

// ─── Request Row ──────────────────────────────────────────────────────────────
function RequestRowItem({
  row, date, onDecision, isPending,
}: {
  row: RequestRow;
  date: string;
  onDecision: (requestId: number, date: string, decision: "approved" | "denied" | "clear") => void;
  isPending: boolean;
}) {
  const decision = row.dateDecision as Decision;
  const isApproved = decision === "approved";
  const isDenied = decision === "denied";

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors ${
      isApproved ? "bg-emerald-950/40 border-emerald-800/50" :
      isDenied ? "bg-red-950/30 border-red-900/40" :
      row.overCap ? "bg-amber-950/20 border-amber-800/30" :
      "bg-card border-border hover:bg-secondary/30"
    }`}>
      {/* WP Rank bubble */}
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
        row.overCap && !isApproved ? "bg-amber-900/60 text-amber-300" : "bg-primary/20 text-primary"
      }`}>
        {row.workingPriority ?? "–"}
      </div>

      {/* Name + SR rank */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm text-foreground">
            {row.firstName} {row.lastName}
          </span>
          <span className="text-xs text-muted-foreground">SR#{row.seniorityRank}</span>
          {row.summerShutout && (
            <span className="inline-flex items-center gap-0.5 text-xs text-amber-400 font-medium">
              <Sun className="w-3 h-3" /> Summer Cap
            </span>
          )}
          {row.overCap && !row.summerShutout && (
            <span className="text-xs text-amber-500 font-medium flex items-center gap-0.5">
              <AlertTriangle className="w-3 h-3" /> Over Ceiling
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          #{row.employeeNumber} · Seniority: {new Date(row.seniorityDate).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
        </div>
      </div>

      {/* Decision status or action buttons */}
      <div className="flex items-center gap-2 shrink-0">
        {decision ? (
          <>
            <DecisionBadge decision={decision} />
            <button
              onClick={() => onDecision(row.requestId, date, "clear")}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
              title="Undo decision"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2.5 text-xs border-emerald-700 text-emerald-400 hover:bg-emerald-900/40 hover:text-emerald-300"
              onClick={() => onDecision(row.requestId, date, "approved")}
              disabled={isPending}
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2.5 text-xs border-red-800 text-red-400 hover:bg-red-950/40 hover:text-red-300"
              onClick={() => onDecision(row.requestId, date, "denied")}
              disabled={isPending}
            >
              <XCircle className="w-3.5 h-3.5 mr-1" /> Deny
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Day Panel ────────────────────────────────────────────────────────────────
function DayPanel({
  date, shift, onClose,
}: {
  date: string;
  shift: Shift;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [pendingMutation, setPendingMutation] = useState(false);

  const { data, isLoading, error } = trpc.tools.getDecisionCalendarDay.useQuery(
    { date, shift },
    { retry: false }
  );

  const approveMutation = trpc.tools.approveDateDecision.useMutation({
    onMutate: () => setPendingMutation(true),
    onSettled: () => {
      setPendingMutation(false);
      utils.tools.getDecisionCalendarDay.invalidate({ date, shift });
      utils.tools.getDecisionCalendarMonth.invalidate();
    },
    onSuccess: () => toast.success("Approved"),
    onError: (e) => toast.error(e.message),
  });

  const denyMutation = trpc.tools.denyDateDecision.useMutation({
    onMutate: () => setPendingMutation(true),
    onSettled: () => {
      setPendingMutation(false);
      utils.tools.getDecisionCalendarDay.invalidate({ date, shift });
      utils.tools.getDecisionCalendarMonth.invalidate();
    },
    onSuccess: () => toast.success("Denied"),
    onError: (e) => toast.error(e.message),
  });

  const clearMutation = trpc.tools.clearDateDecision.useMutation({
    onMutate: () => setPendingMutation(true),
    onSettled: () => {
      setPendingMutation(false);
      utils.tools.getDecisionCalendarDay.invalidate({ date, shift });
      utils.tools.getDecisionCalendarMonth.invalidate();
    },
    onSuccess: () => toast.success("Decision cleared"),
    onError: (e) => toast.error(e.message),
  });

  function handleDecision(requestId: number, d: string, action: "approved" | "denied" | "clear") {
    if (action === "approved") approveMutation.mutate({ requestId, date: d });
    else if (action === "denied") denyMutation.mutate({ requestId, date: d });
    else clearMutation.mutate({ requestId, date: d });
  }

  const rows = useMemo(() => {
    if (!data) return [];
    const shiftRows = data.byShift?.[shift] ?? data.requests ?? [];
    return [...shiftRows].sort((a: RequestRow, b: RequestRow) => {
      const wpA = a.workingPriority ?? 9999;
      const wpB = b.workingPriority ?? 9999;
      if (wpA !== wpB) return wpA - wpB;
      return a.seniorityDate.localeCompare(b.seniorityDate);
    });
  }, [data, shift]);

  const approved = rows.filter((r: RequestRow) => r.dateDecision === "approved").length;
  const denied = rows.filter((r: RequestRow) => r.dateDecision === "denied").length;
  const pending = rows.filter((r: RequestRow) => !r.dateDecision).length;
  const cap = data?.cap ?? 8;

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h3 className="font-bold text-foreground text-base">{formatDate(date)}</h3>
          <div className="flex items-center gap-3 mt-1 text-xs">
            <span className="text-emerald-400 font-medium">{approved} Approved</span>
            <span className="text-muted-foreground">{pending} Pending</span>
            <span className="text-red-400">{denied} Denied</span>
            <span className="text-muted-foreground">Cap: {cap}</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors text-lg font-bold px-2"
        >
          ×
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {isLoading && (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            Loading requests…
          </div>
        )}
        {error && (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-center px-4">
            <AlertTriangle className="w-6 h-6 text-amber-400" />
            <p className="text-sm text-foreground font-medium">Failed to load requests</p>
            <p className="text-xs text-muted-foreground">{error.message?.includes('UNAUTHORIZED') ? 'Please log out and log back in.' : 'Connection error — click Retry.'}</p>
            <button onClick={() => utils.tools.getDecisionCalendarDay.invalidate()} className="text-xs text-primary underline">Retry</button>
          </div>
        )}
        {!isLoading && !error && rows.length === 0 && (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            No requests for this date
          </div>
        )}
        {/* Cap divider */}
        {!isLoading && rows.length > 0 && (() => {
          const items: React.ReactNode[] = [];
          let capShown = false;
          rows.forEach((row: RequestRow, idx: number) => {
            if (!capShown && row.overCap) {
              capShown = true;
              items.push(
                <div key="cap-divider" className="flex items-center gap-2 py-1">
                  <div className="flex-1 h-px bg-amber-700/50" />
                  <span className="text-xs text-amber-500 font-semibold px-2">— Ceiling ({cap}) —</span>
                  <div className="flex-1 h-px bg-amber-700/50" />
                </div>
              );
            }
            items.push(
              <RequestRowItem
                key={`${row.requestId}-${idx}`}
                row={row}
                date={date}
                onDecision={handleDecision}
                isPending={pendingMutation}
              />
            );
          });
          return items;
        })()}
      </div>
    </div>
  );
}

// ─── Main DecisionBoard ───────────────────────────────────────────────────────
export default function DecisionBoard() {
  const [selectedShift, setSelectedShift] = useState<Shift>("AM");
  const [monthIdx, setMonthIdx] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const currentMonth = MONTHS[monthIdx];

  const { data: monthData, isLoading: monthLoading, error: monthError } =
    trpc.tools.getDecisionCalendarMonth.useQuery(
      { year: currentMonth.year, month: currentMonth.month },
      { retry: false }
    );

  // Build sorted date list for the selected shift
  const dateSummaries = useMemo<DateSummary[]>(() => {
    if (!monthData?.dates) return [];
    const result: DateSummary[] = [];
    for (const dateEntry of monthData.dates) {
      const shiftEntry = dateEntry.shifts.find((s: { shift: string }) => s.shift === selectedShift);
      if (shiftEntry) {
        result.push({ ...shiftEntry, date: dateEntry.date });
      }
    }
    return result.sort((a, b) => a.date.localeCompare(b.date));
  }, [monthData, selectedShift]);

  const SHIFTS: Shift[] = ["AM", "PM", "NOC"];
  const SHIFT_COLORS: Record<Shift, string> = {
    AM: "text-amber-400 border-amber-600 bg-amber-950/40",
    PM: "text-sky-400 border-sky-600 bg-sky-950/40",
    NOC: "text-violet-400 border-violet-600 bg-violet-950/40",
  };

  return (
    <div className="flex h-full bg-background text-foreground overflow-hidden">
      {/* ── Left panel: shift + date list ── */}
      <div className="w-80 shrink-0 flex flex-col border-r border-border bg-card/50">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-border">
          <h1 className="text-lg font-bold text-foreground">Decision Board</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Approve or deny requests by shift and date</p>
        </div>

        {/* Shift tabs */}
        <div className="flex gap-1.5 px-4 py-3 border-b border-border">
          {SHIFTS.map(s => (
            <button
              key={s}
              onClick={() => { setSelectedShift(s); setSelectedDate(null); }}
              className={`flex-1 py-1.5 rounded-md text-xs font-bold border transition-all ${
                selectedShift === s
                  ? SHIFT_COLORS[s]
                  : "text-muted-foreground border-border hover:border-muted-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Month navigation */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
          <button
            onClick={() => { setMonthIdx(i => Math.max(0, i - 1)); setSelectedDate(null); }}
            disabled={monthIdx === 0}
            className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-foreground">{currentMonth.label}</span>
          <button
            onClick={() => { setMonthIdx(i => Math.min(MONTHS.length - 1, i + 1)); setSelectedDate(null); }}
            disabled={monthIdx === MONTHS.length - 1}
            className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Date list */}
        <div className="flex-1 overflow-y-auto py-2">
          {monthLoading && (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              Loading…
            </div>
          )}
          {monthError && (
            <div className="flex flex-col items-center justify-center h-32 gap-2 px-4 text-center">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              <p className="text-xs text-foreground font-medium">{monthError.message?.includes('UNAUTHORIZED') ? 'Session expired — please log in again' : 'Connection error'}</p>
              <button onClick={() => utils.tools.getDecisionCalendarMonth.invalidate()} className="text-xs text-primary underline">Retry</button>
            </div>
          )}
          {!monthLoading && !monthError && dateSummaries.length === 0 && (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-xs px-4 text-center">
              No {selectedShift} requests in {currentMonth.label}
            </div>
          )}
          {dateSummaries.map(ds => {
            const isSelected = selectedDate === ds.date;
            const allDone = ds.pendingCount === 0;
            return (
              <button
                key={ds.date}
                onClick={() => setSelectedDate(ds.date)}
                className={`w-full text-left px-4 py-3 transition-colors border-b border-border/50 ${
                  isSelected ? "bg-primary/15 border-l-2 border-l-primary" : "hover:bg-secondary/40"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{formatDate(ds.date)}</span>
                  {allDone ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : (
                    <span className="text-xs text-amber-400 font-semibold shrink-0">{ds.pendingCount} pending</span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span className="text-emerald-500">{ds.approvedCount} ✓</span>
                  <span className="text-red-400">{ds.deniedCount} ✗</span>
                  {ds.overCap && (
                    <Badge variant="outline" className="text-amber-400 border-amber-700 text-[10px] px-1 py-0 h-4">
                      Over Cap
                    </Badge>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Right panel: day drill-down ── */}
      <div className="flex-1 overflow-hidden">
        {selectedDate ? (
          <DayPanel
            date={selectedDate}
            shift={selectedShift}
            onClose={() => setSelectedDate(null)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7 text-primary/60" />
            </div>
            <p className="text-foreground font-semibold">Select a date</p>
            <p className="text-muted-foreground text-sm max-w-xs">
              Pick a shift tab and a date from the left panel to see all requests ranked by WP and make decisions.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
