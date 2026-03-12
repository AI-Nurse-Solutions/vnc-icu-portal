import { trpc } from "@/lib/trpc";
import { Shield, Loader2 } from "lucide-react";
import { format } from "date-fns";

export default function AdminAuditLog() {
  const { data: logs, isLoading } = trpc.admin.getAuditLog.useQuery({ limit: 100 });

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          Audit Log
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Full trail of all system actions with timestamps and actor identity</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>
      ) : (
        <div className="bg-card border border-border/40 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/40 bg-secondary/30">
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wider">Timestamp</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wider">Action</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wider">Actor</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wider">Target</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wider">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs?.map(log => (
                  <tr key={log.id} className="border-b border-border/20 hover:bg-secondary/20">
                    <td className="px-4 py-2.5 text-muted-foreground font-mono whitespace-nowrap">
                      {format(new Date(log.timestamp), "MMM d, HH:mm:ss")}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`font-semibold px-2 py-0.5 rounded-full text-[10px] ${
                        log.action.includes("approve") ? "badge-approved" :
                        log.action.includes("deny") ? "badge-denied" :
                        log.action.includes("withdraw") ? "badge-withdrawn" :
                        log.action.includes("submit") ? "badge-pending" :
                        "bg-secondary text-muted-foreground border border-border/40"
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-foreground">{`#${log.actorId ?? "system"}`}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{log.targetType} #{log.targetId}</td>
                    <td className="px-4 py-2.5 text-muted-foreground max-w-xs truncate">{log.details ? JSON.stringify(log.details).slice(0, 80) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {logs?.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Shield className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>No audit log entries yet.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
