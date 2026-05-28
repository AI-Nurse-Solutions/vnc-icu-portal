import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  XCircle,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  User,
  Send,
  AlertTriangle,
  Clock,
  BookOpen,
  GraduationCap,
  Info,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type Shift = "AM" | "PM" | "NOC";
type Decision = "approved" | "denied" | null;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
}
function fmtShort(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short", day: "numeric",
  });
}
function fmtSubmitted(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    approved: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    denied: "bg-red-500/20 text-red-300 border-red-500/30",
    withdrawn: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${map[status] ?? map.pending}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ─── WP / Priority Badge ──────────────────────────────────────────────────────
function PriorityBadge({ wp, p }: { wp: number | null; p: number }) {
  if (wp != null) {
    const colors = ["", "bg-teal-500/20 text-teal-300", "bg-sky-500/20 text-sky-300", "bg-indigo-500/20 text-indigo-300"];
    const cls = colors[wp] ?? "bg-zinc-500/20 text-zinc-400";
    return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold ${cls}`}>WP{wp}</span>;
  }
  const colors = ["", "bg-teal-500/20 text-teal-300", "bg-sky-500/20 text-sky-300", "bg-indigo-500/20 text-indigo-300"];
  const cls = colors[p] ?? "bg-zinc-500/20 text-zinc-400";
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold ${cls}`}>P{p}</span>;
}

// ─── Shift Tab ────────────────────────────────────────────────────────────────
function ShiftTab({ shift, active, onClick }: { shift: Shift; active: boolean; onClick: () => void }) {
  const colors: Record<Shift, string> = {
    AM: "border-amber-400 text-amber-300",
    PM: "border-sky-400 text-sky-300",
    NOC: "border-violet-400 text-violet-300",
  };
  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 text-sm font-semibold rounded-t border-b-2 transition-colors ${
        active ? colors[shift] + " bg-slate-800" : "border-transparent text-slate-500 hover:text-slate-300"
      }`}
    >
      {shift}
    </button>
  );
}

// ─── Date Detail Modal ────────────────────────────────────────────────────────
function DateDetailModal({
  date,
  initialShift,
  onClose,
  onDecisionMade,
  onOpenHistory,
}: {
  date: string;
  initialShift: Shift;
  onClose: () => void;
  onDecisionMade: () => void;
  onOpenHistory: (employeeId: number) => void;
}) {
  const [activeShift, setActiveShift] = useState<Shift>(initialShift);
  const [denyTarget, setDenyTarget] = useState<{ requestId: number; note: string } | null>(null);
  const [pendingMutations, setPendingMutations] = useState<Set<number>>(new Set());

  const { data, isLoading, refetch } = trpc.tools.getDecisionCalendarDay.useQuery(
    { date, shift: activeShift },
    { retry: 1 }
  );

  const approveMut = trpc.tools.approveDateDecision.useMutation({
    onSuccess: () => { refetch(); onDecisionMade(); },
    onError: (e) => toast.error(e.message),
    onSettled: (_, __, vars) => setPendingMutations(p => { const n = new Set(p); n.delete(vars.requestId); return n; }),
  });
  const denyMut = trpc.tools.denyDateDecision.useMutation({
    onSuccess: () => { setDenyTarget(null); refetch(); onDecisionMade(); },
    onError: (e) => toast.error(e.message),
    onSettled: (_, __, vars) => setPendingMutations(p => { const n = new Set(p); n.delete(vars.requestId); return n; }),
  });
  const clearMut = trpc.tools.clearDateDecision.useMutation({
    onSuccess: () => { refetch(); onDecisionMade(); },
    onError: (e) => toast.error(e.message),
    onSettled: (_, __, vars) => setPendingMutations(p => { const n = new Set(p); n.delete(vars.requestId); return n; }),
  });

  function handleApprove(requestId: number) {
    setPendingMutations(p => new Set(p).add(requestId));
    approveMut.mutate({ requestId, date });
  }
  function handleDeny(requestId: number) {
    denyMut.mutate({ requestId, date, note: denyTarget?.note });
  }
  function handleClear(requestId: number) {
    setPendingMutations(p => new Set(p).add(requestId));
    clearMut.mutate({ requestId, date });
  }

  const cap = data?.cap ?? 8;
  const shiftRows = data?.byShift?.[activeShift] ?? [];
  const vacationRows = shiftRows.filter(r => r.requestType === "vacation");
  const educationRows = shiftRows.filter(r => r.requestType === "education");
  const approvedCount = vacationRows.filter(r => r.dateDecision === "approved").length;
  const pendingCount = vacationRows.filter(r => !r.dateDecision).length;
  const slotTotal = approvedCount + pendingCount;
  const overCap = slotTotal > cap;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-white text-lg">{fmtDate(date)}</DialogTitle>
        </DialogHeader>

        {/* Shift Tabs */}
        <div className="flex gap-1 border-b border-slate-700 mb-4">
          {(["AM", "PM", "NOC"] as Shift[]).map(s => (
            <ShiftTab key={s} shift={s} active={activeShift === s} onClick={() => setActiveShift(s)} />
          ))}
        </div>

        {isLoading ? (
          <div className="text-slate-400 text-sm py-8 text-center">Loading…</div>
        ) : (
          <>
            {/* Slot Usage Indicator */}
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-4 text-sm font-medium ${
              overCap ? "bg-red-500/15 text-red-300 border border-red-500/30" : "bg-slate-800 text-slate-300"
            }`}>
              {overCap ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />}
              <span>
                {slotTotal} of {cap} vacation slots used
                {overCap ? " — Over Cap" : slotTotal === cap ? " — Full" : " — Available"}
              </span>
            </div>

            {/* Education Requests */}
            {educationRows.length > 0 && (
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-2">
                  <GraduationCap className="w-4 h-4 text-sky-400" />
                  <span className="text-sm font-semibold text-sky-300">Education Requests (not counted in cap)</span>
                </div>
                <div className="space-y-1.5">
                  {educationRows.map(r => (
                    <div key={r.requestId} className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm ${
                      r.dateDecision ? "opacity-60 bg-slate-800/50 border-slate-700/50" : "bg-slate-800 border-slate-700"
                    }`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <button
                          onClick={() => onOpenHistory(r.employeeId)}
                          className="font-medium text-cyan-400 hover:text-cyan-200 hover:underline truncate"
                        >
                          {r.lastName}, {r.firstName}
                        </button>
                        <StatusBadge status={r.dateDecision ?? "pending"} />
                        {r.comment && <span className="text-xs text-amber-400 italic">Has comments. Hidden for privacy.</span>}
                      </div>
                      {!r.dateDecision && (
                        <div className="flex gap-1.5 shrink-0 ml-2">
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/10" onClick={() => handleApprove(r.requestId)} disabled={pendingMutations.has(r.requestId)}>
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-red-400 border-red-500/40 hover:bg-red-500/10" onClick={() => setDenyTarget({ requestId: r.requestId, note: "" })} disabled={pendingMutations.has(r.requestId)}>
                            <XCircle className="w-3.5 h-3.5 mr-1" /> Deny
                          </Button>
                        </div>
                      )}
                      {r.dateDecision && (
                        <button onClick={() => handleClear(r.requestId)} className="text-xs text-slate-500 hover:text-slate-300 ml-2 shrink-0">
                          <RotateCcw className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Vacation Requests — Seniority Ranked */}
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <BookOpen className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-semibold text-amber-300">Vacation Requests — Seniority Ranked</span>
              </div>
              {vacationRows.length === 0 ? (
                <p className="text-slate-500 text-sm py-4 text-center">No vacation requests for this date and shift.</p>
              ) : (
                <div className="space-y-1.5">
                  {vacationRows.map((r, idx) => {
                    const atCap = idx === cap;
                    const decided = !!r.dateDecision;
                    return (
                      <div key={r.requestId}>
                        {atCap && (
                          <div className="flex items-center gap-2 my-2">
                            <div className="flex-1 border-t border-dashed border-red-500/50" />
                            <span className="text-xs text-red-400 font-semibold px-2">── Approval Cap ({cap}) ──</span>
                            <div className="flex-1 border-t border-dashed border-red-500/50" />
                          </div>
                        )}
                        <div className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-opacity ${
                          decided ? "opacity-60 bg-slate-800/50 border-slate-700/50" : "bg-slate-800 border-slate-700"
                        } ${r.overCap && !decided ? "border-red-500/20 bg-red-950/10" : ""}`}>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-bold text-slate-500 w-5 shrink-0">#{r.seniorityRank}</span>
                            <button
                              onClick={() => onOpenHistory(r.employeeId)}
                              className="font-medium text-cyan-400 hover:text-cyan-200 hover:underline truncate"
                            >
                              {r.lastName}, {r.firstName}
                            </button>
                            {r.unitSeniorityRank != null && (
                              <span
                                className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-900/50 text-violet-300 border border-violet-700/40 shrink-0"
                                title={`Unit-wide seniority rank: #${r.unitSeniorityRank} across all active ICU staff`}
                              >
                                SR#{r.unitSeniorityRank}
                              </span>
                            )}
                            <PriorityBadge wp={r.workingPriority} p={r.priority} />
                            <StatusBadge status={r.dateDecision ?? "pending"} />
                            {r.summerShutout && (
                              <span className="text-xs text-orange-400 font-semibold">Summer Cap</span>
                            )}
                            {r.comment && <span className="text-xs text-amber-400 italic">Has comments. Hidden for privacy.</span>}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            {!decided && (
                              <>
                                <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/10" onClick={() => handleApprove(r.requestId)} disabled={pendingMutations.has(r.requestId)}>
                                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-red-400 border-red-500/40 hover:bg-red-500/10" onClick={() => setDenyTarget({ requestId: r.requestId, note: "" })} disabled={pendingMutations.has(r.requestId)}>
                                  <XCircle className="w-3.5 h-3.5 mr-1" /> Deny
                                </Button>
                              </>
                            )}
                            {decided && (
                              <button onClick={() => handleClear(r.requestId)} className="text-xs text-slate-500 hover:text-slate-300">
                                <RotateCcw className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Denial Note Box */}
            {denyTarget && (
              <div className="bg-red-950/20 border border-red-500/30 rounded-lg p-4 mb-4">
                <p className="text-sm font-semibold text-red-300 mb-2">Denial Note (optional)</p>
                <Textarea
                  value={denyTarget.note}
                  onChange={e => setDenyTarget(t => t ? { ...t, note: e.target.value } : null)}
                  placeholder="Reason for denial (visible to requestor)…"
                  className="bg-slate-900 border-slate-600 text-slate-200 text-sm mb-3 resize-none h-20"
                  maxLength={500}
                />
                <div className="flex gap-2">
                  <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={() => handleDeny(denyTarget.requestId)} disabled={denyMut.isPending}>
                    Confirm Deny
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setDenyTarget(null)}>Cancel</Button>
                </div>
              </div>
            )}

            {/* Instruction Text */}
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-4 mt-2">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" />
                <div className="text-xs text-slate-400 space-y-1 leading-relaxed">
                  <p>The approval cap line appears when requests exceed the ceiling of <strong className="text-slate-300">8 vacation slots</strong>.</p>
                  <p>Requests are arranged by <strong className="text-slate-300">seniority date</strong>.</p>
                  <p>We suggest approving all <strong className="text-slate-300">Rank 1 (WP1)</strong> requests first.</p>
                  <p>If requests exceed the ceiling, deny the <strong className="text-slate-300">lowest-ranked requests first</strong> (higher number).</p>
                  <p>Click a requestor's name to view their full request history.</p>
                  <p className="text-amber-400 font-semibold">IMPORTANT: Paper-submitted requests are not reflected in this view and count.</p>
                </div>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Requestor History Modal ──────────────────────────────────────────────────
function RequestorHistoryModal({ employeeId, onClose }: { employeeId: number; onClose: () => void }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const { data, isLoading } = trpc.adminLanding.getRequestorHistory.useQuery({ employeeId }, { retry: 1 });

  const emp = data?.employee;
  const reqs = data?.requests ?? [];
  const stats = useMemo(() => ({
    total: reqs.length,
    pending: reqs.filter(r => r.status === "pending").length,
    approved: reqs.filter(r => r.status === "approved").length,
    denied: reqs.filter(r => r.status === "denied").length,
    withdrawn: reqs.filter(r => r.status === "withdrawn").length,
  }), [reqs]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <User className="w-5 h-5 text-cyan-400" />
            {isLoading ? "Loading…" : emp ? `${emp.lastName}, ${emp.firstName}` : "Employee Not Found"}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="text-slate-400 text-sm py-8 text-center">Loading history…</div>
        ) : emp ? (
          <>
            {/* Employee Info */}
            <div className="bg-slate-800 rounded-lg p-3 mb-4 text-sm space-y-1">
              <div className="flex gap-4 flex-wrap">
                <span className="text-slate-400">Email: <span className="text-slate-200">{emp.email}</span></span>
                <span className="text-slate-400">ID: <span className="text-slate-200">{emp.employeeNumber}</span></span>
                <span className="text-slate-400">Shift: <span className="text-slate-200">{emp.shift}</span></span>
                <span className="text-slate-400">Seniority: <span className="text-slate-200">{emp.seniorityDate}</span></span>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-5 gap-2 mb-4">
              {[
                { label: "Total", val: stats.total, cls: "text-slate-300" },
                { label: "Pending", val: stats.pending, cls: "text-amber-300" },
                { label: "Approved", val: stats.approved, cls: "text-emerald-300" },
                { label: "Denied", val: stats.denied, cls: "text-red-300" },
                { label: "Withdrawn", val: stats.withdrawn, cls: "text-slate-500" },
              ].map(s => (
                <div key={s.label} className="bg-slate-800 rounded-lg p-2 text-center">
                  <div className={`text-lg font-bold ${s.cls}`}>{s.val}</div>
                  <div className="text-xs text-slate-500">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Request History */}
            <div className="space-y-2">
              {reqs.map(r => {
                const isExpanded = expanded.has(r.requestId);
                return (
                  <div key={r.requestId} className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
                    <button
                      onClick={() => setExpanded(e => { const n = new Set(e); isExpanded ? n.delete(r.requestId) : n.add(r.requestId); return n; })}
                      className="w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-slate-700/50 transition-colors"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusBadge status={r.status} />
                        <span className="text-slate-300 font-medium capitalize">{r.requestType}</span>
                        <span className="text-slate-500">·</span>
                        <span className="text-slate-400 capitalize">{r.continuityType}</span>
                        <span className="text-slate-500">·</span>
                        <PriorityBadge wp={r.workingPriority} p={r.priority} />
                        <span className="text-slate-500">·</span>
                        <span className="text-slate-400">{r.dates.length} day{r.dates.length !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="text-xs text-slate-500">{fmtSubmitted(r.submittedAt)}</span>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="px-3 pb-3 pt-1 border-t border-slate-700/50 text-xs text-slate-400 space-y-1.5">
                        <div className="flex flex-wrap gap-1">
                          {r.dates.map(d => (
                            <span key={d} className="bg-slate-700 rounded px-1.5 py-0.5 text-slate-300">{fmtShort(d)}</span>
                          ))}
                        </div>
                        {r.comment && (
                          <p className="text-amber-400 italic">Has comments. Hidden for privacy.</p>
                        )}
                        {r.decisionNote && (
                          <p className="text-slate-300">Decision note: <span className="text-slate-200">{r.decisionNote}</span></p>
                        )}
                        {r.decidedAt && (
                          <p className="text-slate-500">Decided: {fmtSubmitted(r.decidedAt)}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-slate-500 mt-4 italic">
              This view should help admins verify request priority when priority is unclear or disputed.
            </p>
          </>
        ) : (
          <p className="text-slate-400 text-sm">Employee not found.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Admin Landing Page ──────────────────────────────────────────────────
export default function AdminLanding() {
  const [selectedDate, setSelectedDate] = useState<{ date: string; shift: Shift } | null>(null);
  const [historyEmployeeId, setHistoryEmployeeId] = useState<number | null>(null);
  const [msgSubject, setMsgSubject] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [msgSent, setMsgSent] = useState(false);

  const { data: recentRequests, isLoading: loadingRecent } = trpc.adminLanding.getRecentRequests.useQuery(undefined, { retry: 1 });
  const { data: pendingDates, isLoading: loadingPending, refetch: refetchPending } = trpc.adminLanding.getPendingDates.useQuery(undefined, { retry: 1 });
  const sendMsg = trpc.adminLanding.sendMessageToSuperadmin.useMutation({
    onSuccess: () => { setMsgSent(true); setMsgSubject(""); setMsgBody(""); toast.success("Message sent to superadmin."); },
    onError: (e) => toast.error(e.message),
  });

  function openDate(date: string, shift: Shift) {
    setSelectedDate({ date, shift });
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Admin Landing</h1>
        <p className="text-slate-400 text-sm mt-1">Request management overview — recent submissions and pending decisions</p>
      </div>

      {/* ── Decision Cheat Sheet ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-700 bg-slate-900/80 overflow-hidden">
        {/* Header bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700 bg-slate-800/60">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-bold text-slate-100">Decision Cheat Sheet</span>
            <span className="text-xs text-slate-500 ml-1">— This rubric makes more than 90% of first-choice approvals possible</span>
          </div>
          <a
            href="/manager-guide.html"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 underline underline-offset-2 transition-colors"
          >
            Learn more →
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-slate-700/60">
          {/* Left: Three-Rule Framework */}
          <div className="p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">§3 — Three-Rule Decision Framework</p>
            <div className="space-y-2.5">
              {/* Rule 1 */}
              <div className="flex gap-3 items-start rounded-lg bg-cyan-950/40 border border-cyan-800/30 px-3 py-2.5">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-900/60 flex items-center justify-center text-xs font-black text-cyan-300">1</div>
                <div>
                  <div className="text-xs font-bold text-cyan-300 mb-0.5">Working Priority (WP)</div>
                  <div className="text-xs text-slate-400">Lowest WP wins. WP1 beats WP2, WP2 beats WP3. Resolves most decisions. <span className="text-slate-500 italic">WP is recalculated every 6 months by pre-processing staff.</span></div>
                </div>
              </div>
              {/* Rule 2 */}
              <div className="flex gap-3 items-start rounded-lg bg-violet-950/40 border border-violet-800/30 px-3 py-2.5">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-violet-900/60 flex items-center justify-center text-xs font-black text-violet-300">2</div>
                <div>
                  <div className="text-xs font-bold text-violet-300 mb-0.5">Seniority Date (SR)</div>
                  <div className="text-xs text-slate-400">Same WP on same date? Earlier seniority date wins. SR rank shown next to each name.</div>
                </div>
              </div>
              {/* Rule 3 */}
              <div className="flex gap-3 items-start rounded-lg bg-amber-950/40 border border-amber-800/30 px-3 py-2.5">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-900/60 flex items-center justify-center text-xs font-black text-amber-300">3</div>
                <div>
                  <div className="text-xs font-bold text-amber-300 mb-0.5">21-Day Ceiling Yield <span className="font-normal text-amber-600">(soft)</span></div>
                  <div className="text-xs text-slate-400">Employee at 21+ days in a period yields P2+ requests to employees under 21 days. Manager makes the final call.</div>
                </div>
              </div>
              {/* Tie */}
              <div className="flex gap-3 items-start rounded-lg bg-slate-800/50 border border-slate-700/40 px-3 py-2.5">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-xs font-black text-slate-400">~</div>
                <div>
                  <div className="text-xs font-bold text-slate-300 mb-0.5">Ties &amp; Gray Areas</div>
                  <div className="text-xs text-slate-400">Resolved manually by the admin. The portal never auto-approves. Every action leaves an audit trail.</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Approve / Deny Navigation */}
          <div className="p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">§4 — Approve / Deny Navigation</p>
            <div className="space-y-2.5">
              {/* Path 1 */}
              <div className="rounded-lg bg-emerald-950/40 border border-emerald-800/30 px-3 py-2.5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-emerald-300">Path 1 — Daily Triage</span>
                  <span className="text-xs text-slate-500">Admin Landing → Section B</span>
                </div>
                <div className="text-xs text-slate-400">Scan Pending Dates for over-cap flags → click date → select shift tab → read WP + SR + slot usage → Approve or Deny each row.</div>
              </div>
              {/* Path 2 */}
              <div className="rounded-lg bg-sky-950/40 border border-sky-800/30 px-3 py-2.5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-sky-300">Path 2 — Monthly Run</span>
                  <span className="text-xs text-slate-500">Administration → Decision Board</span>
                </div>
                <div className="text-xs text-slate-400">Select month + shift → work left panel date-by-date → top-to-bottom rows → cap divider at 8 → amber Summer Cap rows need explicit decision. Target: 1 month per day.</div>
              </div>
              {/* Path 3 */}
              <div className="rounded-lg bg-indigo-950/40 border border-indigo-800/30 px-3 py-2.5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-indigo-300">Path 3 — Spot Decision</span>
                  <span className="text-xs text-slate-500">Section A → click date link</span>
                </div>
                <div className="text-xs text-slate-400">Opens the Date/Shift Detail modal pre-filtered to that date and shift. Use for immediate action on a specific request.</div>
              </div>
              {/* Clear */}
              <div className="rounded-lg bg-slate-800/50 border border-slate-700/40 px-3 py-2.5">
                <div className="flex items-center gap-2 mb-1">
                  <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-xs font-bold text-slate-300">Clear / Undo</span>
                </div>
                <div className="text-xs text-slate-400">Every row has a Clear button. Use it when a decision was made in error or a competing request was withdrawn. Returns row to pending and recalculates slot count.</div>
              </div>
            </div>
          </div>
        </div>

        {/* P5 note */}
        <div className="px-5 py-2.5 border-t border-slate-700/60 bg-slate-800/30 flex items-start gap-2">
          <Info className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-slate-400">
            <span className="text-amber-300 font-semibold">P5 is the form default</span> — a P5 submission may mean the employee never set a preference, not that they ranked the request fifth. Pre-processing staff treat a lone P5 as WP1. Do not penalize a P5 request solely because of the number.
          </p>
        </div>
      </div>

      {/* ── Section A: Recent Requests ──────────────────────────────────────── */}
      <section>
        <h2 className="text-base font-semibold text-slate-200 mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-cyan-400" /> Recent Requests
        </h2>
        {loadingRecent ? (
          <div className="text-slate-400 text-sm py-6 text-center">Loading…</div>
        ) : !recentRequests?.length ? (
          <div className="text-slate-500 text-sm py-6 text-center">No requests found.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-800/60">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Shift</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Dates</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Type</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Submitted</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentRequests.map(r => (
                  <tr key={r.requestId} className="border-b border-slate-700/50 hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => setHistoryEmployeeId(r.employeeId)}
                        className="font-medium text-cyan-400 hover:text-cyan-200 hover:underline"
                      >
                        {r.lastName}, {r.firstName}
                      </button>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-bold ${r.shift === "AM" ? "text-amber-300" : r.shift === "PM" ? "text-sky-300" : "text-violet-300"}`}>
                        {r.shift}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {r.dates.slice(0, 5).map(d => (
                          <button
                            key={d.date}
                            onClick={() => openDate(d.date, r.shift as Shift)}
                            className="text-xs bg-slate-700 hover:bg-cyan-700/40 text-slate-300 hover:text-cyan-200 rounded px-1.5 py-0.5 transition-colors"
                          >
                            {fmtShort(d.date)}
                          </button>
                        ))}
                        {r.dates.length > 5 && (
                          <span className="text-xs text-slate-500">+{r.dates.length - 5} more</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-medium ${r.requestType === "education" ? "text-sky-300" : "text-amber-300"}`}>
                        {r.requestType.charAt(0).toUpperCase() + r.requestType.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-400">{fmtSubmitted(r.submittedAt)}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Section B: Pending Decision Dates ──────────────────────────────── */}
      <section>
        <h2 className="text-base font-semibold text-slate-200 mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" /> Pending Decision Dates
          <span className="text-xs text-slate-500 font-normal">(sorted by date)</span>
        </h2>
        {loadingPending ? (
          <div className="text-slate-400 text-sm py-6 text-center">Loading…</div>
        ) : !pendingDates?.length ? (
          <div className="text-slate-500 text-sm py-6 text-center">No pending decision dates.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-800/60">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Shift</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Pending</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Approved</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Types</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Slot Usage</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody>
                {pendingDates.map(pd => {
                  const allDecided = pd.pendingCount === 0;
                  return (
                    <tr
                      key={`${pd.date}|${pd.shift}`}
                      className={`border-b border-slate-700/50 transition-colors ${
                        allDecided ? "opacity-50 bg-slate-800/20" : "hover:bg-slate-800/40 cursor-pointer"
                      }`}
                      onClick={() => !allDecided && openDate(pd.date, pd.shift as Shift)}
                    >
                      <td className="px-4 py-2.5">
                        <span className={`font-medium ${allDecided ? "text-slate-500" : "text-cyan-400 hover:text-cyan-200"}`}>
                          {fmtDate(pd.date)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-bold ${pd.shift === "AM" ? "text-amber-300" : pd.shift === "PM" ? "text-sky-300" : "text-violet-300"}`}>
                          {pd.shift}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {pd.pendingCount > 0 ? (
                          <span className="text-amber-300 font-semibold">{pd.pendingCount}</span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-emerald-300">{pd.approvedCount || "—"}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-400">
                        {[pd.vacationCount > 0 && `${pd.vacationCount} Vac`, pd.educationCount > 0 && `${pd.educationCount} Edu`].filter(Boolean).join(", ")}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-medium ${pd.overCap ? "text-red-400" : "text-slate-400"}`}>
                          {pd.slotUsage} {pd.overCap && "⚠ Over Cap"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {allDecided ? (
                          <span className="text-xs text-slate-500 italic">All decided</span>
                        ) : (
                          <span className="text-xs text-amber-400 font-semibold">Needs review</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Section 9: Admin → Superadmin Message ──────────────────────────── */}
      <section>
        <h2 className="text-base font-semibold text-slate-200 mb-3 flex items-center gap-2">
          <Send className="w-4 h-4 text-violet-400" /> Message to Superadmin
        </h2>
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5 max-w-2xl">
          {msgSent ? (
            <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium py-4">
              <CheckCircle2 className="w-5 h-5" />
              Message sent successfully.
              <button onClick={() => setMsgSent(false)} className="ml-2 text-slate-400 hover:text-slate-200 underline text-xs">Send another</button>
            </div>
          ) : (
            <>
              <Input
                value={msgSubject}
                onChange={e => setMsgSubject(e.target.value)}
                placeholder="Subject / Category (optional)"
                className="bg-slate-900 border-slate-600 text-slate-200 mb-3 text-sm"
                maxLength={200}
              />
              <Textarea
                value={msgBody}
                onChange={e => setMsgBody(e.target.value)}
                placeholder="Send a message to the superadmin…"
                className="bg-slate-900 border-slate-600 text-slate-200 text-sm resize-none h-28 mb-3"
                maxLength={5000}
              />
              <Button
                onClick={() => sendMsg.mutate({ subject: msgSubject || undefined, message: msgBody })}
                disabled={!msgBody.trim() || sendMsg.isPending}
                className="bg-violet-600 hover:bg-violet-700 text-white"
              >
                <Send className="w-4 h-4 mr-2" />
                {sendMsg.isPending ? "Sending…" : "Send Message"}
              </Button>
            </>
          )}
        </div>
      </section>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {selectedDate && (
        <DateDetailModal
          date={selectedDate.date}
          initialShift={selectedDate.shift}
          onClose={() => setSelectedDate(null)}
          onDecisionMade={() => refetchPending()}
          onOpenHistory={id => { setHistoryEmployeeId(id); }}
        />
      )}
      {historyEmployeeId != null && (
        <RequestorHistoryModal
          employeeId={historyEmployeeId}
          onClose={() => setHistoryEmployeeId(null)}
        />
      )}

      {/* ── Footer Values ─────────────────────────────────────────────── */}
      <div className="border-t border-slate-700/50 pt-6 mt-2 text-center">
        <p className="text-xs text-slate-500 tracking-wide">
          <span className="text-slate-400 font-medium">Transparency</span>
          <span className="mx-2 text-cyan-700">·</span>
          <span className="text-slate-400 font-medium">Fairness</span>
          <span className="mx-2 text-cyan-700">·</span>
          <span className="text-slate-400 font-medium">Staff Satisfaction built in.</span>
        </p>
      </div>
    </div>
  );
}
