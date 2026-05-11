import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Bell, Lightbulb, CalendarDays, Plus, CheckCircle2, XCircle, Clock, LogOut, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";

// ─── Donut ring ───────────────────────────────────────────────────────────────
function DonutRing({ rank, total }: { rank: number; total: number }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const pct = total > 0 ? (rank - 1) / total : 0; // 0 = top, 1 = bottom
  const filled = circ * (1 - pct);
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" className="shrink-0">
      <circle cx="44" cy="44" r={r} fill="none" stroke="#d1d5db" strokeWidth="8" />
      <circle
        cx="44"
        cy="44"
        r={r}
        fill="none"
        stroke="#6b8f71"
        strokeWidth="8"
        strokeDasharray={`${filled} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 44 44)"
      />
    </svg>
  );
}

// ─── Dot progress bar ─────────────────────────────────────────────────────────
function DotProgress({ used, max = 21 }: { used: number; max?: number }) {
  const dots = Array.from({ length: max }, (_, i) => i < used);
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {dots.map((filled, i) => (
        <span
          key={i}
          className={`w-2 h-2 rounded-full ${filled ? "bg-[#6b8f71]" : "bg-gray-300"}`}
        />
      ))}
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  if (status === "approved")
    return (
      <span className="flex items-center gap-1 text-emerald-700 font-medium text-sm">
        <CheckCircle2 className="w-4 h-4" /> Approved
      </span>
    );
  if (status === "denied")
    return (
      <span className="flex items-center gap-1 text-red-600 font-medium text-sm">
        <XCircle className="w-4 h-4" /> Denied
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-amber-600 font-medium text-sm">
      <Clock className="w-4 h-4" /> Pending
    </span>
  );
}

// ─── Date range label ─────────────────────────────────────────────────────────
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Collapsed date list ─────────────────────────────────────────────────────
function DateList({ dates, color }: { dates: string[]; color: string }) {
  const [expanded, setExpanded] = useState(false);
  const show = expanded ? dates : dates.slice(0, 4);
  if (dates.length === 0) return null;
  return (
    <div className="mt-1">
      <div className="flex flex-wrap gap-1">
        {show.map(d => (
          <span key={d} className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${color}`}>
            {fmtDate(d)}
          </span>
        ))}
        {dates.length > 4 && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-gray-100 text-gray-500 hover:bg-gray-200 flex items-center gap-0.5"
          >
            {expanded ? <><ChevronUp className="w-2.5 h-2.5" /> less</> : <><ChevronDown className="w-2.5 h-2.5" /> +{dates.length - 4} more</>}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function MyPortal() {
  const [, navigate] = useLocation();
  const { data, isLoading, error } = trpc.portal.getPortalData.useQuery(undefined, {
    retry: false,
  });
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => navigate("/login"),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f0ede8] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#6b8f71] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#f0ede8] flex items-center justify-center px-6">
        <div className="bg-white rounded-2xl shadow p-8 max-w-sm w-full text-center space-y-4">
          <XCircle className="w-10 h-10 text-red-500 mx-auto" />
          <p className="font-semibold text-gray-800">Session expired or not authorized.</p>
          <button
            onClick={() => navigate("/login")}
            className="w-full py-2 rounded-lg bg-[#6b8f71] text-white font-medium hover:bg-[#5a7a60] transition-colors"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  const { employee, shiftRank, totalInShift, approvedDays, requests, announcements } = data;

  // Separate pending from others, sort pending first
  const sortedRequests = [...requests].sort((a, b) => {
    const order: Record<string, number> = { pending: 0, approved: 1, denied: 2, withdrawn: 3 };
    return (order[a.status] ?? 9) - (order[b.status] ?? 9);
  });

  return (
    <div className="min-h-screen bg-[#f0ede8] py-6 px-4">
      <div className="max-w-4xl mx-auto space-y-4">

        {/* ── Top bar ── */}
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold tracking-widest text-gray-500 uppercase">VNC ICU · My Portal</p>
          <button
            onClick={() => logoutMutation.mutate()}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>

        {/* ── Hero card ── */}
        <div className="bg-[#e4e8e0] rounded-2xl shadow-sm p-6 flex flex-col sm:flex-row sm:items-center gap-4">
          {/* Name + shift */}
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-bold text-[#1a2e1c] leading-tight">
              {employee.firstName}<br />{employee.lastName}
            </h1>
            <span className="mt-2 inline-block px-3 py-1 rounded-full bg-white/70 text-xs font-semibold text-gray-600 border border-gray-200">
              {employee.shift} Shift
            </span>
            {employee.isVerified === false && (
              <span className="ml-2 inline-block px-3 py-1 rounded-full bg-amber-100 text-xs font-semibold text-amber-700 border border-amber-200">
                Unverified
              </span>
            )}
          </div>

          {/* Ranking call donut */}
          <div className="flex items-center gap-4 shrink-0">
            <div className="text-center">
              <p className="text-xs text-gray-500 font-medium mb-1">Seniority Rank</p>
              <p className="text-5xl font-bold text-[#1a2e1c] leading-none">{shiftRank}</p>
              <div className="h-px w-10 bg-gray-400 mx-auto my-1" />
              <p className="text-xs text-gray-500">of {totalInShift} in Shift</p>
            </div>
            <DonutRing rank={shiftRank} total={totalInShift} />
          </div>
        </div>

        {/* ── Stats bar ── */}
        <div className="bg-white rounded-2xl shadow-sm px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 font-medium">Seniority Date</p>
            <p className="text-base font-bold text-gray-800">
              {new Date(employee.seniorityDate + "T00:00:00").toLocaleDateString("en-US", {
                month: "short", day: "numeric", year: "numeric",
              })}
            </p>
          </div>
          <div className="w-px h-10 bg-gray-200 hidden sm:block" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 font-medium">Approved Vacation Days (Jul–Dec)</p>
            <p className="text-base font-bold text-gray-800">{approvedDays} days used</p>
            <DotProgress used={Math.min(approvedDays, 21)} max={21} />
          </div>
          <div className="flex gap-2 shrink-0 mt-2 sm:mt-0">
            <button
              onClick={() => navigate("/dashboard/new-request")}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#6b8f71] text-white text-sm font-semibold hover:bg-[#5a7a60] transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" /> New Request
            </button>
            <button
              onClick={() => navigate("/dashboard/shift-demand-calendar")}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-gray-300 text-gray-700 text-sm font-semibold hover:bg-gray-50 transition-colors"
            >
              <CalendarDays className="w-4 h-4" /> Shift Demand Calendar
            </button>
          </div>
        </div>

        {/* ── Two-panel row ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* LEFT — Requests */}
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-1">My Requests</p>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Requests</h2>

            {sortedRequests.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <CalendarDays className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No requests submitted yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedRequests.map((req) => {
                  const hasDecisions = (req.approvedDates?.length ?? 0) > 0 || (req.deniedDates?.length ?? 0) > 0;
                  const isPending = (req.pendingDates?.length ?? 0) > 0;
                  return (
                    <div
                      key={req.id}
                      className="rounded-xl border px-4 py-3 bg-white border-gray-200"
                    >
                      {/* Row header */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-bold text-gray-700 text-sm">
                          #{String(req.id).padStart(6, "0")}
                        </span>
                        <span className="text-xs text-gray-400">
                          {req.dateStart === req.dateEnd
                            ? fmtDate(req.dateStart)
                            : `${fmtDate(req.dateStart)} – ${fmtDate(req.dateEnd)}`}
                          <span className="ml-1">({req.totalDates}d)</span>
                        </span>
                        <StatusBadge status={req.status} />
                      </div>

                      {/* Per-date breakdown */}
                      {hasDecisions && (
                        <div className="mt-2 space-y-1 border-t border-gray-100 pt-2">
                          {(req.approvedDates?.length ?? 0) > 0 && (
                            <div>
                              <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">
                                ✓ Approved ({req.approvedDates!.length})
                              </span>
                              <DateList dates={req.approvedDates!} color="bg-emerald-100 text-emerald-700" />
                            </div>
                          )}
                          {(req.deniedDates?.length ?? 0) > 0 && (
                            <div>
                              <span className="text-[10px] font-bold text-red-600 uppercase tracking-wide">
                                ✗ Denied ({req.deniedDates!.length})
                              </span>
                              <DateList dates={req.deniedDates!} color="bg-red-100 text-red-700" />
                            </div>
                          )}
                          {(req.pendingDates?.length ?? 0) > 0 && (
                            <div>
                              <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wide">
                                ⏳ Pending ({req.pendingDates!.length})
                              </span>
                              <DateList dates={req.pendingDates!} color="bg-amber-100 text-amber-700" />
                            </div>
                          )}
                        </div>
                      )}

                      {/* View My Results link */}
                      {hasDecisions && (
                        <button
                          onClick={() => navigate("/dashboard/shift-demand-calendar")}
                          className="mt-2 flex items-center gap-1 text-[11px] text-[#6b8f71] font-semibold hover:underline"
                        >
                          <ExternalLink className="w-3 h-3" /> View My Results in Calendar
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <button
              onClick={() => navigate("/dashboard/my-requests")}
              className="mt-4 w-full text-center text-xs text-[#6b8f71] font-semibold hover:underline"
            >
              View full request history →
            </button>
          </div>

          {/* RIGHT — Announcements & Tips */}
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-1">Updates</p>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Announcements &amp; Tips</h2>

            {announcements.length === 0 ? (
              <p className="text-sm text-gray-400 py-4">No announcements at this time.</p>
            ) : (
              <div className="space-y-2">
                {announcements.map((item, idx) => (
                  <div
                    key={item.id}
                    className={`flex gap-3 rounded-xl px-4 py-3 ${
                      idx % 2 === 0 ? "bg-gray-100" : "bg-white border border-gray-100"
                    }`}
                  >
                    <div className="shrink-0 mt-0.5">
                      {item.type === "announcement" ? (
                        <Bell className="w-4 h-4 text-gray-500" />
                      ) : (
                        <Lightbulb className="w-4 h-4 text-gray-500" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-800 capitalize">{item.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{item.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
