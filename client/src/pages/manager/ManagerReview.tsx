import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  BarChart3, CheckCircle2, XCircle, Loader2, MessageSquare,
  Filter, ChevronDown, ChevronUp, TrendingUp, AlertTriangle
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type Request = {
  requestId: number;
  employeeId: number;
  requestType: string;
  continuityType: string;
  comment?: string | null;
  status: string;
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

const WARNING = 15;

function PeriodPills({ employeeId }: { employeeId: number }) {
  const { data } = trpc.manager.getEmployeePeriodCounts.useQuery({ employeeId });
  if (!data) return null;

  const pill = (label: string, days: number) => {
    const isWarn = days >= WARNING;
    return (
      <span
        key={label}
        className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
          isWarn
            ? "bg-[oklch(0.75_0.18_70/15%)] text-[oklch(0.75_0.18_70)] border-[oklch(0.75_0.18_70/35%)]"
            : "bg-secondary/60 text-muted-foreground border-border/40"
        }`}
        title={`${label}: ${days} vacation days used (approved + pending)`}
      >
        {isWarn && <AlertTriangle className="w-2.5 h-2.5 shrink-0" />}
        <TrendingUp className="w-2.5 h-2.5 shrink-0" />
        {label}: {days}d
      </span>
    );
  };

  return (
    <span className="flex items-center gap-1 flex-wrap">
      {pill("A", data.periodA)}
      {pill("B", data.periodB)}
    </span>
  );
}

function RequestCard({ req, onApprove, onDeny }: {
  req: Request;
  onApprove: (id: number) => void;
  onDeny: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-card border border-border/40 rounded-xl p-4 hover:border-border/70 transition-all duration-150">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {/* Name + badges row */}
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-foreground text-sm">{req.firstName} {req.lastName}</span>
            <span className="text-xs text-muted-foreground">#{req.employeeNumber}</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
              req.shift === "AM" ? "bg-[oklch(0.68_0.15_200/15%)] text-[oklch(0.68_0.15_200)] border-[oklch(0.68_0.15_200/30%)]" :
              req.shift === "PM" ? "bg-[oklch(0.70_0.15_290/15%)] text-[oklch(0.70_0.15_290)] border-[oklch(0.70_0.15_290/30%)]" :
              "bg-[oklch(0.65_0.17_160/15%)] text-[oklch(0.65_0.17_160)] border-[oklch(0.65_0.17_160/30%)]"
            }`}>{req.shift}</span>
            <span className={req.requestType === "vacation" ? "badge-vacation" : "badge-education"}>
              {req.requestType.charAt(0).toUpperCase() + req.requestType.slice(1)}
            </span>
            <span className={`badge-${req.status}`}>
              {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
            </span>
          </div>

          {/* Date chips */}
          <div className="flex flex-wrap gap-1 mb-2">
            {req.dates.sort().map(d => (
              <span key={d} className="text-xs bg-secondary/60 text-foreground px-2 py-0.5 rounded-md font-mono">
                {format(new Date(d + "T12:00:00"), "MMM d")}
              </span>
            ))}
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground mb-2">
            <span>Seniority: {format(new Date(req.seniorityDate), "MMM yyyy")}</span>
            <span>·</span>
            <span>Submitted: {format(new Date(req.submittedAt), "MMM d, yyyy")}</span>
            {req.comment && (
              <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 text-primary hover:underline">
                <MessageSquare className="w-3 h-3" />
                Comment
                {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            )}
          </div>

          {/* Period counts — only for vacation requests */}
          {req.requestType === "vacation" && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-muted-foreground">{new Date().getFullYear()} days used:</span>
              <PeriodPills employeeId={req.employeeId} />
            </div>
          )}

          {expanded && req.comment && (
            <div className="mt-2 p-2 bg-secondary/30 rounded-lg border border-border/30 text-xs text-muted-foreground italic">
              Has comment — hidden for privacy.
            </div>
          )}
        </div>

        {req.status === "pending" && (
          <div className="flex gap-2 shrink-0">
            <Button
              size="sm"
              className="bg-[oklch(0.65_0.17_160/20%)] text-[oklch(0.65_0.17_160)] border border-[oklch(0.65_0.17_160/40%)] hover:bg-[oklch(0.65_0.17_160/30%)] h-8 px-3"
              onClick={() => onApprove(req.requestId)}
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 border border-destructive/30 h-8 px-3"
              onClick={() => onDeny(req.requestId)}
            >
              <XCircle className="w-3.5 h-3.5 mr-1" /> Deny
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ManagerReview() {
  const utils = trpc.useUtils();
  const [shiftFilter, setShiftFilter] = useState<"AM" | "PM" | "NOC" | undefined>();
  const [typeFilter, setTypeFilter] = useState<"vacation" | "education" | undefined>();
  const [statusFilter, setStatusFilter] = useState<string[]>(["pending"]);
  const [actionId, setActionId] = useState<{ id: number; type: "approve" | "deny" } | null>(null);
  const [note, setNote] = useState("");

  const { data: requests, isLoading } = trpc.manager.getAllRequests.useQuery({
    status: statusFilter.length > 0 ? statusFilter as any : undefined,
    shift: shiftFilter,
    requestType: typeFilter,
  });

  const approveMutation = trpc.manager.approve.useMutation({
    onSuccess: () => {
      toast.success("Request approved. Employee notified.");
      utils.manager.getAllRequests.invalidate();
      setActionId(null); setNote("");
    },
    onError: (e) => toast.error(e.message),
  });

  const denyMutation = trpc.manager.deny.useMutation({
    onSuccess: () => {
      toast.success("Request denied. Employee notified.");
      utils.manager.getAllRequests.invalidate();
      setActionId(null); setNote("");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleAction = () => {
    if (!actionId) return;
    if (actionId.type === "approve") {
      approveMutation.mutate({ requestId: actionId.id, note: note.trim() || undefined });
    } else {
      denyMutation.mutate({ requestId: actionId.id, note: note.trim() || undefined });
    }
  };

  const pending = requests?.filter(r => r.status === "pending") ?? [];
  const others = requests?.filter(r => r.status !== "pending") ?? [];

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          Review Requests
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Approve or deny time-off requests. Seniority-ranked within each shift.
          Vacation day counts (Period A = Jan–Jun, Period B = Jul–Dec) are shown on each card.
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
      <div className="flex items-center gap-2 mb-4 text-[10px] text-muted-foreground bg-card/50 border border-border/30 rounded-lg px-3 py-2">
        <TrendingUp className="w-3 h-3 text-primary shrink-0" />
        <span>
          <strong className="text-foreground">A</strong> = Jan–Jun days used &nbsp;·&nbsp;
          <strong className="text-foreground">B</strong> = Jul–Dec days used &nbsp;·&nbsp;
          <span className="text-[oklch(0.75_0.18_70)] font-semibold">Amber</span> = 15+ days (soft threshold)
        </span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          {pending.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[oklch(0.75_0.18_70)] uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[oklch(0.75_0.18_70)] animate-pulse" />
                Pending Review ({pending.length})
              </p>
              <div className="space-y-3 animate-stagger">
                {pending.map(req => (
                  <RequestCard
                    key={req.requestId}
                    req={req as any}
                    onApprove={(id) => { setActionId({ id, type: "approve" }); setNote(""); }}
                    onDeny={(id) => { setActionId({ id, type: "deny" }); setNote(""); }}
                  />
                ))}
              </div>
            </div>
          )}

          {others.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Decided ({others.length})
              </p>
              <div className="space-y-2 opacity-80">
                {others.map(req => (
                  <RequestCard
                    key={req.requestId}
                    req={req as any}
                    onApprove={() => {}}
                    onDeny={() => {}}
                  />
                ))}
              </div>
            </div>
          )}

          {!isLoading && (pending.length + others.length) === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No requests match the current filters.</p>
            </div>
          )}
        </div>
      )}

      {/* Decision dialog */}
      <Dialog open={!!actionId} onOpenChange={() => { setActionId(null); setNote(""); }}>
        <DialogContent className="bg-card border-border/60">
          <DialogHeader>
            <DialogTitle>
              {actionId?.type === "approve" ? "Approve Request" : "Deny Request"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label className="text-sm">Manager Note (optional)</Label>
            <Textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Add a note for the employee..."
              className="bg-input border-border/60 resize-none h-24"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => { setActionId(null); setNote(""); }}>Cancel</Button>
            <Button
              onClick={handleAction}
              disabled={approveMutation.isPending || denyMutation.isPending}
              className={actionId?.type === "approve"
                ? "bg-[oklch(0.65_0.17_160/20%)] text-[oklch(0.65_0.17_160)] border border-[oklch(0.65_0.17_160/40%)] hover:bg-[oklch(0.65_0.17_160/30%)]"
                : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              }
            >
              {(approveMutation.isPending || denyMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {actionId?.type === "approve" ? "Confirm Approve" : "Confirm Deny"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
