import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { FileDown, Loader2, Download } from "lucide-react";
import { format } from "date-fns";

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

export default function ExportData() {
  const today = new Date();
  const [startDate, setStartDate] = useState(format(new Date(today.getFullYear(), today.getMonth(), 1), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(today.getFullYear(), today.getMonth() + 3, 0), "yyyy-MM-dd"));
  const [shift, setShift] = useState<"AM" | "PM" | "NOC" | undefined>();
  const [requestType, setRequestType] = useState<"vacation" | "education" | undefined>();
  const [preview, setPreview] = useState<any[] | null>(null);

  const { refetch, isFetching } = trpc.manager.exportApproved.useQuery(
    { startDate, endDate, shift, requestType },
    { enabled: false }
  );

  const handleFetch = async () => {
    const result = await refetch();
    if (result.data) {
      setPreview(result.data);
    }
  };

  const handleExport = () => {
    if (!preview || preview.length === 0) {
      toast.error("No data to export. Fetch data first.");
      return;
    }
    const csv = toCSV(preview);
    const filename = `vnc-icu-approved-${startDate}-to-${endDate}${shift ? `-${shift}` : ""}${requestType ? `-${requestType}` : ""}.csv`;
    downloadCSV(csv, filename);
    toast.success(`Exported ${preview.length} rows to ${filename}`);
  };

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <FileDown className="w-5 h-5 text-primary" />
          Export Approved Requests
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Download approved time-off requests as CSV</p>
      </div>

      <div className="bg-card border border-border/40 rounded-xl p-5 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <Label className="text-xs font-semibold mb-1.5 block">Start Date</Label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-input border-border/60" />
          </div>
          <div>
            <Label className="text-xs font-semibold mb-1.5 block">End Date</Label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-input border-border/60" />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Shift:</span>
            {(["AM", "PM", "NOC"] as const).map(s => (
              <button
                key={s}
                onClick={() => setShift(shift === s ? undefined : s)}
                className={`text-xs px-3 py-1 rounded-full border transition-all ${
                  shift === s ? "bg-primary/15 text-primary border-primary/40" : "border-border/40 text-muted-foreground hover:border-border/70"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Type:</span>
            {(["vacation", "education"] as const).map(t => (
              <button
                key={t}
                onClick={() => setRequestType(requestType === t ? undefined : t)}
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

        <div className="flex gap-3">
          <Button
            onClick={handleFetch}
            disabled={isFetching}
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

      {preview !== null && (
        <div className="bg-card border border-border/40 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">{preview.length} rows</span>
            {preview.length === 0 && <span className="text-xs text-muted-foreground">No approved requests match the filters</span>}
          </div>
          {preview.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/40 bg-secondary/30">
                    {Object.keys(preview[0]).map(h => (
                      <th key={h} className="text-left px-3 py-2 font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h.replace(/_/g, " ")}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 50).map((row, i) => (
                    <tr key={i} className="border-b border-border/20 hover:bg-secondary/20">
                      {Object.values(row).map((v: any, j) => (
                        <td key={j} className="px-3 py-2 text-foreground whitespace-nowrap">{String(v ?? "")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.length > 50 && (
                <p className="text-xs text-muted-foreground text-center py-2">Showing first 50 of {preview.length} rows. Download CSV for full data.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
