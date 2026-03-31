import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useEmployee } from "@/hooks/useEmployee";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ClipboardList, Loader2, Trash2, AlertCircle,
  CheckCircle2, Clock, XCircle, Award, CalendarDays,
  Mail, ChevronUp, ChevronDown
} from "lucide-react";
import { format } from "date-fns";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";

function StatusIcon({ status }: { status: string }) {
  if (status === "approved") return <CheckCircle2 className="w-4 h-4 text-[oklch(0.65_0.17_160)]" />;
  if (status === "denied") return <XCircle className="w-4 h-4 text-destructive" />;
  if (status === "pending") return <Clock className="w-4 h-4 text-[oklch(0.75_0.18_70)]" />;
  return <AlertCircle className="w-4 h-4 text-muted-foreground" />;
}

function PriorityBadge({ rank, total }: { rank: number; total: number }) {
  const color =
    rank === 1 ? "text-[oklch(0.78_0.18_80)] bg-[oklch(0.78_0.18_80/12%)] border-[oklch(0.78_0.18_80/30%)]" :
    rank <= 3 ? "text-primary bg-primary/10 border-primary/30" :
    "text-muted-foreground bg-secondary/60 border-border/40";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${color}`}>
      <Award className="w-3 h-3" />
      #{rank} of {total}
    </span>
  );
}

function PeriodBar({ label, days, sublabel }: { label: string; days: number; sublabel: string }) {
  const pct = Math.min((days / 21) * 100, 100);
  const color = days >= 21 ? "bg-destructive" : days >= 15 ? "bg-[oklch(0.75_0.18_70)]" : "bg-primary";
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-foreground">{label}</span>
        <span className="text-xs font-bold text-foreground tabular-nums">{days} day{days !== 1 ? "s" : ""}</span>
      </div>
      <div className="h-2 rounded-full bg-secondary/60 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-muted-foreground mt-0.5">{sublabel}</p>
    </div>
  );
}

export default function MyRequests() {
  const utils = trpc.useUtils();
  const { employee } = useEmployee();
  const [withdrawId, setWithdrawId] = useState<number | null>(null);
  const [resendingId, setResendingId] = useState<number | null>(null);
  const [editingPriorityId, setEditingPriorityId] = useState<number | null>(null);
  const [priorityDraft, setPriorityDraft] = useState<number>(5);

  const { data: requests, isLoading } = trpc.requests.myRequests.useQuery();
  const { data: periods } = trpc.requests.periodDayCounts.useQuery();

  const withdrawMutation = trpc.requests.withdraw.useMutation({
    onSuccess: () => {
      toast.success("Request withdrawn successfully.");
      utils.requests.myRequests.invalidate();
      utils.requests.periodDayCounts.invalidate();
      setWithdrawId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const resendMutation = trpc.requests.resendConfirmation.useMutation({
    onMutate: (vars) => setResendingId(vars.requestId),
    onSuccess: () => {
      toast.success("Confirmation email resent to your inbox.");
      setResendingId(null);
    },
    onError: (e) => {
      toast.error(e.message);
      setResendingId(null);
    },
  });

  const updatePriorityMutation = trpc.requests.updatePriority.useMutation({
    onSuccess: () => {
      toast.success("Request priority updated.");
      utils.requests.myRequests.invalidate();
      setEditingPriorityId(null);
    },
    onError: (e) => {
      toast.error(e.message);
      setEditingPriorityId(null);
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  const active = requests?.filter(r => r.status !== "withdrawn") ?? [];
  const withdrawn = requests?.filter(r => r.status === "withdrawn") ?? [];

  const seniorityDate = requests?.[0]?.seniorityDate;
  const shiftPriority = requests?.[0]?.shiftPriority ?? 0;
  const totalInShift = requests?.[0]?.totalInShift ?? 0;

  const formatSeniority = (d: Date | string | null | undefined) => {
    if (!d) return "—";
    const date = d instanceof Date ? d : new Date(d);
    return format(date, "MMM d, yyyy");
  };

  const year = periods?.year ?? new Date().getFullYear();

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-primary" />
          My Requests
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Track all your time-off requests</p>
      </div>

      {/* Employee info card */}
      {employee && (
        <div className="bg-card border border-border/40 rounded-xl p-4 mb-4 flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
              <span className="text-sm font-bold text-primary">{employee.firstName.charAt(0)}</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{employee.firstName} {employee.lastName}</p>
              <p className="text-xs text-muted-foreground capitalize">{employee.shift} Shift</p>
            </div>
          </div>

          <div className="h-8 w-px bg-border/40 hidden sm:block" />

          <div className="flex items-center gap-2 text-sm">
            <CalendarDays className="w-4 h-4 text-primary shrink-0" />
            <div>
              <span className="text-muted-foreground text-xs">Seniority Date</span>
              <p className="text-foreground font-medium text-sm leading-tight">
                {formatSeniority(seniorityDate ?? (employee as any).seniorityDate)}
              </p>
            </div>
          </div>

          {shiftPriority > 0 && (
            <>
              <div className="h-8 w-px bg-border/40 hidden sm:block" />
              <div className="flex items-center gap-2 text-sm">
                <Award className="w-4 h-4 text-primary shrink-0" />
                <div>
                  <span className="text-muted-foreground text-xs">Shift Priority</span>
                  <p className="text-foreground font-medium text-sm leading-tight">
                    #{shiftPriority} of {totalInShift} in {employee.shift}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Period day-count panel */}
      {periods && (
        <div className="bg-card border border-border/40 rounded-xl p-4 mb-6">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            {year} Vacation Days Used (Approved + Pending)
          </p>
          <div className="flex gap-6 flex-wrap">
            <PeriodBar
              label="Period A — Jan to Jun"
              days={periods.periodA}
              sublabel="Jan 1 – Jun 30"
            />
            <div className="w-px bg-border/40 hidden sm:block self-stretch" />
            <PeriodBar
              label="Period B — Jul to Dec"
              days={periods.periodB}
              sublabel="Jul 1 – Dec 31"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
            Counts include all <strong>pending</strong> and <strong>approved</strong> vacation requests with dates falling in each period.
            Education requests are not counted.
          </p>
        </div>
      )}

      {active.length === 0 && withdrawn.length === 0 ? (
        <div className="bg-card border border-border/40 rounded-xl p-12 text-center">
          <ClipboardList className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">No requests yet. Submit your first request from the New Request page.</p>
        </div>
      ) : (
        <div className="space-y-3 animate-stagger">
          {/* Active requests */}
          {active.map((req) => (
            <div key={req.id} className="bg-card border border-border/40 rounded-xl p-4 hover:border-border/70 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <StatusIcon status={req.status} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={req.requestType === "vacation" ? "badge-vacation" : "badge-education"}>
                        {req.requestType.charAt(0).toUpperCase() + req.requestType.slice(1)}
                      </span>
                      <span className={`badge-${req.status}`}>
                        {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                      </span>
                      <span className="text-xs text-muted-foreground capitalize">{req.continuityType}</span>
                      {req.shiftPriority > 0 && (
                        <PriorityBadge rank={req.shiftPriority} total={req.totalInShift} />
                      )}
                    </div>

                    {/* Date chips */}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {req.dates.sort().map(d => (
                        <span key={d} className="text-xs bg-secondary/60 text-foreground px-2 py-0.5 rounded-md font-mono">
                          {format(new Date(d + "T12:00:00"), "MMM d")}
                        </span>
                      ))}
                    </div>

                    {/* Priority row */}
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Request priority:</span>
                      {req.status === "pending" ? (
                        editingPriorityId === req.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              className="w-6 h-6 rounded border border-border/60 bg-secondary/60 flex items-center justify-center hover:bg-secondary text-foreground disabled:opacity-40"
                              onClick={() => setPriorityDraft(p => Math.max(1, p - 1))}
                              disabled={priorityDraft <= 1}
                            >
                              <ChevronUp className="w-3 h-3" />
                            </button>
                            <span className="text-sm font-bold text-foreground w-5 text-center tabular-nums">{priorityDraft}</span>
                            <button
                              className="w-6 h-6 rounded border border-border/60 bg-secondary/60 flex items-center justify-center hover:bg-secondary text-foreground disabled:opacity-40"
                              onClick={() => setPriorityDraft(p => Math.min(9, p + 1))}
                              disabled={priorityDraft >= 9}
                            >
                              <ChevronDown className="w-3 h-3" />
                            </button>
                            <Button
                              size="sm"
                              variant="default"
                              className="h-6 px-2 text-xs"
                              disabled={updatePriorityMutation.isPending}
                              onClick={() => updatePriorityMutation.mutate({ requestId: req.id, priority: priorityDraft })}
                            >
                              {updatePriorityMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs text-muted-foreground"
                              onClick={() => setEditingPriorityId(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <button
                            className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
                            onClick={() => {
                              setPriorityDraft(req.priority ?? 5);
                              setEditingPriorityId(req.id);
                            }}
                          >
                            {req.priority ?? 5} <span className="text-muted-foreground font-normal">(tap to edit)</span>
                          </button>
                        )
                      ) : (
                        <span className="text-xs font-semibold text-foreground">{req.priority ?? 5}</span>
                      )}
                    </div>

                    {req.comment && (
                      <p className="text-xs text-muted-foreground mt-2 italic">Has comment. Hidden for privacy.</p>
                    )}
                    {req.decisionNote && (
                      <p className="text-xs mt-1">
                        <span className="text-muted-foreground">Manager note: </span>
                        <span className="text-foreground">{req.decisionNote}</span>
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                      Submitted {format(new Date(req.submittedAt), "MMM d, yyyy 'at' h:mm a")}
                      {req.decidedAt && ` · Decided ${format(new Date(req.decidedAt), "MMM d, yyyy")}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-primary hover:bg-primary/10"
                    onClick={() => resendMutation.mutate({ requestId: req.id })}
                    disabled={resendingId === req.id}
                    title="Resend confirmation email"
                  >
                    {resendingId === req.id
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Mail className="w-4 h-4" />}
                  </Button>
                  {req.status !== "denied" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setWithdrawId(req.id)}
                      title="Withdraw request"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Withdrawn */}
          {withdrawn.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1 mt-4">Withdrawn</p>
              {withdrawn.map(req => (
                <div key={req.id} className="bg-card/50 border border-border/20 rounded-xl p-4 opacity-60 mb-2">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5" />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={req.requestType === "vacation" ? "badge-vacation" : "badge-education"}>
                          {req.requestType.charAt(0).toUpperCase() + req.requestType.slice(1)}
                        </span>
                        <span className="badge-withdrawn">Withdrawn</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {req.dates.sort().map(d => (
                          <span key={d} className="text-xs bg-secondary/30 text-muted-foreground px-2 py-0.5 rounded-md font-mono">
                            {format(new Date(d + "T12:00:00"), "MMM d")}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Withdraw confirmation dialog */}
      <AlertDialog open={!!withdrawId} onOpenChange={() => setWithdrawId(null)}>
        <AlertDialogContent className="bg-card border-border/60">
          <AlertDialogHeader>
            <AlertDialogTitle>Withdraw Request?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This will withdraw your request. If it was already approved, your manager will be notified immediately.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-secondary border-border/60">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => withdrawId && withdrawMutation.mutate({ requestId: withdrawId })}
              disabled={withdrawMutation.isPending}
            >
              {withdrawMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Withdraw Request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
