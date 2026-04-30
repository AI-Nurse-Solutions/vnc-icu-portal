import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";
import {
  Shield, Loader2, ChevronLeft, ChevronRight, Download,
  Search, Filter, X, Info, RefreshCw
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type LogRow = {
  id: number;
  actorId: number | null;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string | null;
  details: unknown;
  timestamp: string;
};

// ─── Action badge styling ─────────────────────────────────────────────────────
function actionBadgeClass(action: string) {
  if (action.includes("approve") || action.includes("verify")) return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  if (action.includes("deny") || action.includes("deactivate") || action.includes("delete")) return "bg-red-500/15 text-red-400 border-red-500/30";
  if (action.includes("withdraw")) return "bg-orange-500/15 text-orange-400 border-orange-500/30";
  if (action.includes("submit") || action.includes("create") || action.includes("signup") || action.includes("import")) return "bg-blue-500/15 text-blue-400 border-blue-500/30";
  if (action.includes("login") || action.includes("logout") || action.includes("password")) return "bg-purple-500/15 text-purple-400 border-purple-500/30";
  if (action.includes("update") || action.includes("edit") || action.includes("set")) return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
  return "bg-secondary/40 text-muted-foreground border-border/40";
}

function actionLabel(action: string) {
  return action.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Detail expander ──────────────────────────────────────────────────────────
function DetailCell({ details }: { details: unknown }) {
  const [expanded, setExpanded] = useState(false);
  if (!details) return <span className="text-muted-foreground">—</span>;

  const str = JSON.stringify(details);
  const short = str.length > 60 ? str.slice(0, 60) + "…" : str;

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-left text-xs text-muted-foreground hover:text-foreground transition-colors font-mono"
      >
        {expanded ? str : short}
      </button>
    </div>
  );
}

// ─── Known action types for filter ───────────────────────────────────────────
const ACTION_GROUPS = [
  { label: "All Actions", value: "" },
  { label: "Approvals", value: "approve" },
  { label: "Denials", value: "deny" },
  { label: "Submissions", value: "submit" },
  { label: "Withdrawals", value: "withdraw" },
  { label: "Verifications", value: "verify" },
  { label: "Logins", value: "login" },
  { label: "Updates", value: "update" },
  { label: "Imports", value: "import" },
  { label: "Password", value: "password" },
];

const TARGET_TYPES = [
  { label: "All Targets", value: "" },
  { label: "Request", value: "request" },
  { label: "Employee", value: "employee" },
  { label: "Config", value: "config" },
  { label: "Auth", value: "auth" },
];

const PAGE_SIZE = 50;

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AuditLog() {
  const [page, setPage] = useState(0);
  const [actionFilter, setActionFilter] = useState("");
  const [targetTypeFilter, setTargetTypeFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [searchText, setSearchText] = useState("");

  const { data, isLoading, refetch } = trpc.tools.getAuditLogEnhanced.useQuery({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    action: actionFilter || undefined,
    targetType: targetTypeFilter || undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
  });

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);

  // Client-side text search on visible rows
  const rows = useMemo(() => {
    if (!data?.rows) return [];
    if (!searchText.trim()) return data.rows;
    const q = searchText.toLowerCase();
    return data.rows.filter(r =>
      r.actorName.toLowerCase().includes(q) ||
      r.action.toLowerCase().includes(q) ||
      r.targetType.toLowerCase().includes(q) ||
      (r.targetId ?? "").toLowerCase().includes(q) ||
      JSON.stringify(r.details ?? "").toLowerCase().includes(q)
    );
  }, [data, searchText]);

  const clearFilters = () => {
    setActionFilter("");
    setTargetTypeFilter("");
    setFromDate("");
    setToDate("");
    setSearchText("");
    setPage(0);
  };

  const hasFilters = actionFilter || targetTypeFilter || fromDate || toDate || searchText;

  // CSV export
  const handleExport = () => {
    if (!data?.rows) return;
    const header = ["ID", "Timestamp", "Actor", "Action", "Target Type", "Target ID", "Details"];
    const csvRows = data.rows.map(r => [
      r.id,
      r.timestamp,
      r.actorName,
      r.action,
      r.targetType,
      r.targetId ?? "",
      JSON.stringify(r.details ?? ""),
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const csv = [header.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Audit Log
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Full trail of all system actions — searchable, filterable, exportable
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => refetch()}
          >
            <RefreshCw className="w-3 h-3" /> Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={handleExport}
            disabled={!data?.rows?.length}
          >
            <Download className="w-3 h-3" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border/40 rounded-xl p-4 mb-5 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search actor, action, target, or details…"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-secondary/30 border border-border/40 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {searchText && (
            <button onClick={() => setSearchText("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          {/* Action filter */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Action Type</label>
            <select
              value={actionFilter}
              onChange={e => { setActionFilter(e.target.value); setPage(0); }}
              className="text-xs bg-secondary/30 border border-border/40 rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {ACTION_GROUPS.map(g => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
          </div>

          {/* Target type filter */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Target Type</label>
            <select
              value={targetTypeFilter}
              onChange={e => { setTargetTypeFilter(e.target.value); setPage(0); }}
              className="text-xs bg-secondary/30 border border-border/40 rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {TARGET_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Date range */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={e => { setFromDate(e.target.value); setPage(0); }}
              className="text-xs bg-secondary/30 border border-border/40 rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={e => { setToDate(e.target.value); setPage(0); }}
              className="text-xs bg-secondary/30 border border-border/40 rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {hasFilters && (
            <div className="flex flex-col justify-end">
              <button
                onClick={clearFilters}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg border border-border/40 hover:bg-secondary/40 transition-colors"
              >
                <X className="w-3 h-3" /> Clear Filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Results info */}
      {data && (
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-muted-foreground">
            {searchText
              ? `${rows.length} of ${data.total} entries (client search)`
              : `${data.total} total entries · Page ${page + 1} of ${Math.max(totalPages, 1)}`}
          </p>
          {data.total > PAGE_SIZE && !searchText && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-secondary/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-muted-foreground px-2">{page + 1} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-secondary/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground bg-card border border-border/40 rounded-xl">
          <Shield className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="font-medium">No audit log entries found</p>
          {hasFilters && (
            <button onClick={clearFilters} className="text-sm text-primary mt-2 hover:underline">
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="bg-card border border-border/40 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/40 bg-secondary/30">
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Timestamp</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wider">Actor</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wider">Action</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wider">Target</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wider">Details</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr
                    key={row.id}
                    className={`border-b border-border/20 hover:bg-secondary/20 transition-colors ${idx % 2 === 0 ? "" : "bg-secondary/5"}`}
                  >
                    {/* Timestamp */}
                    <td className="px-4 py-2.5 font-mono text-muted-foreground whitespace-nowrap">
                      <div>{format(parseISO(row.timestamp), "MMM d, yyyy")}</div>
                      <div className="text-[10px]">{format(parseISO(row.timestamp), "HH:mm:ss")}</div>
                    </td>

                    {/* Actor */}
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-foreground">{row.actorName}</span>
                      {row.actorId && (
                        <div className="text-[10px] text-muted-foreground">ID #{row.actorId}</div>
                      )}
                    </td>

                    {/* Action */}
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${actionBadgeClass(row.action)}`}>
                        {actionLabel(row.action)}
                      </span>
                    </td>

                    {/* Target */}
                    <td className="px-4 py-2.5 text-muted-foreground">
                      <span className="capitalize">{row.targetType}</span>
                      {row.targetId && (
                        <span className="ml-1 font-mono text-[10px]">#{row.targetId}</span>
                      )}
                    </td>

                    {/* Details */}
                    <td className="px-4 py-2.5 max-w-xs">
                      <DetailCell details={row.details} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination footer */}
          {data && data.total > PAGE_SIZE && !searchText && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border/30">
              <span className="text-xs text-muted-foreground">
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, data.total)} of {data.total}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="h-7 px-3 text-xs flex items-center gap-1 rounded-lg hover:bg-secondary/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Prev
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="h-7 px-3 text-xs flex items-center gap-1 rounded-lg hover:bg-secondary/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
