import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { FileDown, Loader2, Upload, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map(line => {
    const values = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
  });
}

const TEMPLATE_CSV = `employee_number,first_name,last_name,email,shift,role,seniority_date,password
EMP001,Jane,Smith,jane.smith@vnc.local,AM,employee,2018-03-15,TempPass123!
EMP002,John,Doe,john.doe@vnc.local,PM,employee,2020-06-01,TempPass123!`;

export default function AdminImport() {
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [filename, setFilename] = useState("");
  const [results, setResults] = useState<{ created: number; updated: number; errors: string[] } | null>(null);

  const importMutation = trpc.admin.importEmployees.useMutation({
    onSuccess: (data) => {
      setResults(data);
      utils.admin.listEmployees.invalidate();
      if (data.errors.length === 0) {
        toast.success(`Imported ${data.created} created, ${data.updated} updated.`);
      } else {
        toast.warning(`Done with ${data.errors.length} errors.`);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCSV(text);
      setRows(parsed);
      setResults(null);
    };
    reader.readAsText(file);
  };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vnc-icu-employee-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Upload className="w-5 h-5 text-primary" />
          CSV Employee Import
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Bulk import or update employee records from a CSV file</p>
      </div>

      {/* Template download */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Download Template</p>
          <p className="text-xs text-muted-foreground mt-0.5">Required columns: employee_number, first_name, last_name, email, shift, role, seniority_date, password</p>
        </div>
        <Button onClick={downloadTemplate} className="bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 shrink-0">
          <FileDown className="w-4 h-4 mr-2" /> Template
        </Button>
      </div>

      {/* Upload area */}
      <div
        className="border-2 border-dashed border-border/50 rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all mb-6"
        onClick={() => fileRef.current?.click()}
      >
        <Upload className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
        <p className="text-sm font-medium text-foreground">{filename || "Click to upload CSV file"}</p>
        <p className="text-xs text-muted-foreground mt-1">{rows.length > 0 ? `${rows.length} rows parsed` : "CSV files only"}</p>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
      </div>

      {/* Preview */}
      {rows.length > 0 && (
        <div className="bg-card border border-border/40 rounded-xl overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">{rows.length} rows ready to import</span>
            <Button
              onClick={() => importMutation.mutate({ rows: rows as any, origin: window.location.origin })}
              disabled={importMutation.isPending}
              className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 text-xs"
            >
              {importMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1.5" />}
              Import All
            </Button>
          </div>
          <div className="overflow-x-auto max-h-64">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/40 bg-secondary/30">
                  {Object.keys(rows[0]).map(h => (
                    <th key={h} className="text-left px-3 py-2 font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h.replace(/_/g, " ")}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 20).map((row, i) => (
                  <tr key={i} className="border-b border-border/20">
                    {Object.values(row).map((v, j) => (
                      <td key={j} className="px-3 py-2 text-foreground whitespace-nowrap">{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="bg-card border border-border/40 rounded-xl p-4 animate-slide-up">
          <h3 className="font-semibold text-foreground mb-3">Import Results</h3>
          <div className="flex items-center gap-4 mb-3">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 text-[oklch(0.65_0.17_160)]" />
              <span className="text-[oklch(0.65_0.17_160)] font-semibold">{results.created} created, {results.updated} updated</span>
            </div>
            {results.errors.length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <XCircle className="w-4 h-4 text-destructive" />
                <span className="text-destructive font-semibold">{results.errors.length} errors</span>
              </div>
            )}
          </div>
          {results.errors.length > 0 && (
            <div className="space-y-1">
              {results.errors.map((err, i) => (
                <div key={i} className="flex items-start gap-2 text-xs bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                  <span className="text-destructive">{err}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
