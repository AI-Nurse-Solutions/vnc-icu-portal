import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ClipboardList, Loader2, Trash2, AlertCircle, CheckCircle2, Clock, XCircle } from "lucide-react";
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

export default function MyRequests() {
  const utils = trpc.useUtils();
  const [withdrawId, setWithdrawId] = useState<number | null>(null);

  const { data: requests, isLoading } = trpc.requests.myRequests.useQuery();

  const withdrawMutation = trpc.requests.withdraw.useMutation({
    onSuccess: () => {
      toast.success("Request withdrawn successfully.");
      utils.requests.myRequests.invalidate();
      setWithdrawId(null);
    },
    onError: (e) => toast.error(e.message),
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

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-primary" />
          My Requests
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Track all your time-off requests</p>
      </div>

      {active.length === 0 && withdrawn.length === 0 ? (
        <div className="bg-card border border-border/40 rounded-xl p-12 text-center">
          <ClipboardList className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">No requests yet. Submit your first request from the New Request page.</p>
        </div>
      ) : (
        <div className="space-y-4 animate-stagger">
          {/* Active requests */}
          {active.map(req => (
            <div key={req.id} className="bg-card border border-border/40 rounded-xl p-4 hover:border-border/70 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <StatusIcon status={req.status} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={req.requestType === "vacation" ? "badge-vacation" : "badge-education"}>
                        {req.requestType.charAt(0).toUpperCase() + req.requestType.slice(1)}
                      </span>
                      <span className={`badge-${req.status}`}>
                        {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                      </span>
                      <span className="text-xs text-muted-foreground capitalize">{req.continuityType}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {req.dates.sort().map(d => (
                        <span key={d} className="text-xs bg-secondary/60 text-foreground px-2 py-0.5 rounded-md font-mono">
                          {format(new Date(d + "T12:00:00"), "MMM d")}
                        </span>
                      ))}
                    </div>
                    {req.comment && (
                      <p className="text-xs text-muted-foreground mt-2 italic">"{req.comment}"</p>
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

                {req.status !== "denied" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setWithdrawId(req.id)}
                    title="Withdraw request"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}

          {/* Withdrawn */}
          {withdrawn.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">Withdrawn</p>
              {withdrawn.map(req => (
                <div key={req.id} className="bg-card/50 border border-border/20 rounded-xl p-4 opacity-60">
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
