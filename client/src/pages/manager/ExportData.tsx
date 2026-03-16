import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { FileDown, Loader2, Download, CheckSquare, Square } from "lucide-react";
import { format } from "date-fns";

type RequestStatus = "pending" | "approved" | "denied" | "withdrawn";

function toCSV(rows: any[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map(h => {
      const v = String(row[h] ?? "");
      return v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(","));
  }
  return lines.join("\n");
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const STATUS_OPTIONS: { value: RequestStatus; label: string; color: string }[] = [
  { value: "pending",   label: "Pending",   color: "text-amber-400 border-amber-400/40 bg-amber-400/10" },
  { value: "approved",  label: "Approved",  color: "text-emerald-400 border-emerald-400/40 bg-emerald-400/10" },
  { value: "denied",    label: "Denied",    color: "text-red-400 border-red-400/40 bg-red-400/10" },
  { value: "withdrawn", label: "Withdrawn", color: "text-muted-foreground border-border/40 bg-secondary/30" },
];

export default function ExportData() {
  const today = new Date();
  const [startDate, setStartDate] = useState(format(new Date(today.getFullYear(), today.getMonth(), 1), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(today.getFullYear(), today.getMonth() + 3, 0), "yyyy-MM-dd"));
  const [shift, setShift] = useState<"AM" | "PM" | "NOC" | undefined>();
  const [requestType, setRequestType] = useState<"vacation" | "education" | undefined>();
  const [statuses, setStatuses] = useState<RequestStatus[]>(["pending", "approved"]);
  const [preview, setPreview] = useState<any[] | null>(null);

  const toggleStatus = (s: RequestStatus) => {
    setStatuses(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
    );
    setPreview(null); // reset preview when filters change
  };

  const { refetch, isFetching } = trpc.manager.exportApproved.useQuery(
    { startDate, endDate, shift, requestType, statuses: statuses.length > 0 ? statuses : undefined },
    { enabled: false }
  );

  const handleFetch = async () => {
    if (statuses.length === 0) {
      toast.error("Select at least one status to export.");
      return;
    }
    const result = await refetch();
    if (result.data) {
      setPreview(result.data);
      if (result.data.length === 0) {
        toast.info("No requests match the selected filters.");
      } else {
        toast.success(`Found ${result.data.length} rows.`);
      }
    }
  };

  const handleExport = () => {
    if (!preview || preview.length === 0) {
      toast.error("No data to export. Click Preview Data first.");
      return;
    }
    const statusTag = statuses.length === 4 ? "all" : statuses.join("-");
    const csv = toCSV(preview);
    const filename = `vnc-icu-${statusTag}-${startDate}-to-${endDate}${shift ? `-${shift}` : ""}${requestType ? `-${requestType}` : ""}.csv`;
    downloadCSV(csv, filename);
    toast.success(`Exported ${preview.length} rows to ${filename}`);
  };

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <FileDown className="w-5 h-5 text-primary" />
          Export Requests
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Download time-off requests as CSV — filter by status, shift, type, and date range</p>
      </div>

      <div className="bg-card border border-border/40 rounded-xl p-5 mb-6 space-y-5">
        {/* Date range */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs font-semibold mb-1.5 block">Start Date</Label>
            <Input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setPreview(null); }} className="bg-input border-border/60" />
          </div>
          <div>
            <Label className="text-xs font-semibold mb-1.5 block">End Date</Label>
            <Input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setPreview(null); }} className="bg-input border-border/60" />
          </div>
        </div>

        {/* Status checkboxes */}
        <div>
          <Label className="text-xs font-semibold mb-2 block text-muted-foreground uppercase tracking-wider">Status</Label>
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map(opt => {
              const checked = statuses.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  onClick={() => toggleStatus(opt.value)}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-all font-medium ${
                    checked ? opt.color : "border-border/40 text-muted-foreground hover:border-border/70"
                  }`}
                >
                  {checked
                    ? <CheckSquare className="w-3.5 h-3.5" />
                    : <Square className="w-3.5 h-3.5" />
                  }
                  {opt.label}
                </button>
              );
            })}
          </div>
          {statuses.length === 0 && (
            <p className="text-xs text-destructive mt-1.5">Select at least one status</p>
          )}
        </div>

        {/* Shift + Type filters */}
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-semibold">Shift:</span>
            {(["AM", "PM", "NOC"] as const).map(s => (
              <button
                key={s}
                onClick={() => { setShift(shift === s ? undefined : s); setPreview(null); }}
                className={`text-xs px-3 py-1 rounded-full border transition-all ${
                  shift === s ? "bg-primary/15 text-primary border-primary/40" : "border-border/40 text-muted-foreground hover:border-border/70"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-semibold">Type:</span>
            {(["vacation", "education"] as const).map(t => (
              <button
                key={t}
                onClick={() => { setRequestType(requestType === t ? undefined : t); setPreview(null); }}
                className={`text-xs px-3 py-1 rounded-full border transition-all ${
                  requestType === t
                    ? t === "vacation" ? "badge-vacation" : "badge-education"
                    : "border-border/40 text-muted-foreground hover:border-border/70"
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <Button
            onClick={handleFetch}
            disabled={isFetching || statuses.length === 0}
            className="bg-secondary border border-border/60 text-foreground hover:bg-secondary/80"
          >
            {isFetching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Preview Data
          </Button>
          <Button
            onClick={handleExport}
            disabled={!preview || preview.length === 0}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Download className="w-4 h-4 mr-2" />
            Download CSV
          </Button>
        </div>
      </div>

      {/* Preview table */}
      {preview !== null && (
        <div className="bg-card border border-border/40 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">
              {preview.length} row{preview.length !== 1 ? "s" : ""}
            </span>
            {preview.length === 0 && (
              <span className="text-xs text-muted-foreground">No requests match the selected filters</span>
            )}
          </div>
          {preview.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/40 bg-secondary/30">
                    {Object.keys(preview[0]).map(h => (
                      <th key={h} className="text-left px-3 py-2 font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                        {h.replace(/_/g, " ")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 50).map((row, i) => (
                    <tr key={i} className="border-b border-border/20 hover:bg-secondary/20">
                      {Object.entries(row).map(([key, v]: any, j) => (
                        <td key={j} className={`px-3 py-2 whitespace-nowrap ${
                          key === "status"
                            ? v === "approved" ? "text-emerald-400 font-semibold"
                            : v === "pending" ? "text-amber-400 font-semibold"
                            : v === "denied" ? "text-red-400 font-semibold"
                            : "text-muted-foreground"
                            : "text-foreground"
                        }`}>
                          {String(v ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.length > 50 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Showing first 50 of {preview.length} rows. Download CSV for full data.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
