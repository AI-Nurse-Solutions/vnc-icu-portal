import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Search, UserCheck, Calendar, Plus, X, Loader2,
  ShieldCheck, Mail, ChevronDown, ChevronUp, AlertCircle,
  CheckCircle2
} from "lucide-react";
import { format, parseISO } from "date-fns";

const SHIFT_COLORS: Record<string, string> = {
  AM: "oklch(0.68 0.15 200)",
  PM: "oklch(0.70 0.15 290)",
  NOC: "oklch(0.65 0.17 160)",
};

const PRIORITY_LABELS: Record<number, string> = {
  1: "P1 — First Choice",
  2: "P2 — Second Choice",
  3: "P3 — Third Choice",
  4: "P4 — Fourth Choice",
  5: "P5 — Fifth Choice",
};

export default function SuperAdminDates() {
  const { data: employees, isLoading: empLoading } = trpc.superAdmin.listAllEmployees.useQuery();
  const utils = trpc.useUtils();

  const [search, setSearch] = useState("");
  const [selectedEmpId, setSelectedEmpId] = useState<number | null>(null);
  const [dates, setDates] = useState<string[]>([]);
  const [dateInput, setDateInput] = useState("");
  const [priority, setPriority] = useState(1);
  const [continuityType, setContinuityType] = useState<"continuous" | "intermittent">("intermittent");
  const [note, setNote] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  const addDatesMutation = trpc.superAdmin.addDatesOnBehalf.useMutation({
    onSuccess: (data) => {
      toast.success(
        `${data.datesAdded} date${data.datesAdded !== 1 ? "s" : ""} added for ${data.employeeName}. Email sent to ${data.employeeEmail}.`,
        { duration: 6000 }
      );
      setDates([]);
      setNote("");
      setShowConfirm(false);
      utils.superAdmin.listAllEmployees.invalidate();
    },
    onError: (e) => {
      toast.error(e.message);
      setShowConfirm(false);
    },
  });

  const filteredEmployees = useMemo(() => {
    if (!employees) return [];
    const q = search.toLowerCase();
    return employees.filter(e =>
      e.isActive &&
      (e.firstName.toLowerCase().includes(q) ||
        e.lastName.toLowerCase().includes(q) ||
        e.employeeNumber.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q))
    );
  }, [employees, search]);

  const selectedEmployee = useMemo(
    () => employees?.find(e => e.id === selectedEmpId) ?? null,
    [employees, selectedEmpId]
  );

  function addDate() {
    if (!dateInput) return;
    if (dates.includes(dateInput)) {
      toast.error("Date already added");
      return;
    }
    setDates(prev => [...prev, dateInput].sort());
    setDateInput("");
  }

  function removeDate(d: string) {
    setDates(prev => prev.filter(x => x !== d));
  }

  function handleSubmit() {
    if (!selectedEmpId) return toast.error("Select an employee first");
    if (dates.length === 0) return toast.error("Add at least one date");
    setShowConfirm(true);
  }

  function confirmSubmit() {
    if (!selectedEmpId) return;
    addDatesMutation.mutate({
      employeeId: selectedEmpId,
      dates,
      priority,
      continuityType,
      note: note.trim() || undefined,
    });
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Add Dates on Behalf</h1>
          <p className="text-sm text-muted-foreground">Super Admin — create vacation requests for any employee</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Employee Picker */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">1. Select Employee</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, ID, or email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-secondary/30 border-border/40"
            />
          </div>
          <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
            {empLoading && (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
              </div>
            )}
            {!empLoading && filteredEmployees.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">No employees found</div>
            )}
            {filteredEmployees.map(emp => {
              const selected = emp.id === selectedEmpId;
              return (
                <button
                  key={emp.id}
                  onClick={() => setSelectedEmpId(emp.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all ${
                    selected
                      ? "border-purple-500/60 bg-purple-500/10"
                      : "border-border/30 bg-card hover:border-border/60 hover:bg-secondary/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {selected && <CheckCircle2 className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />}
                      <span className="font-medium text-sm text-foreground truncate">
                        {emp.firstName} {emp.lastName}
                      </span>
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                        style={{
                          background: `${SHIFT_COLORS[emp.shift]}22`,
                          color: SHIFT_COLORS[emp.shift],
                          border: `1px solid ${SHIFT_COLORS[emp.shift]}44`,
                        }}
                      >
                        {emp.shift}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {emp.category === "ancillary" && (
                        <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-500/30 bg-amber-500/10">
                          Ancillary
                        </Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground font-mono">{emp.employeeNumber}</span>
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{emp.email}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Date Builder */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">2. Build Request</h2>

          {/* Selected employee summary */}
          {selectedEmployee ? (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-purple-500/10 border border-purple-500/30">
              <UserCheck className="w-4 h-4 text-purple-400 flex-shrink-0" />
              <div className="min-w-0">
                <div className="font-semibold text-sm text-foreground">
                  {selectedEmployee.firstName} {selectedEmployee.lastName}
                </div>
                <div className="text-[11px] text-muted-foreground">{selectedEmployee.email}</div>
              </div>
              <Badge
                variant="outline"
                className="ml-auto text-[10px] border-purple-500/30 text-purple-300 bg-purple-500/10"
              >
                {selectedEmployee.shift}
              </Badge>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/20 border border-dashed border-border/40 text-muted-foreground text-sm">
              <AlertCircle className="w-4 h-4" /> Select an employee on the left
            </div>
          )}

          {/* Date picker */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Add Dates</label>
            <div className="flex gap-2">
              <Input
                type="date"
                value={dateInput}
                onChange={e => setDateInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addDate()}
                className="bg-secondary/30 border-border/40 flex-1"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={addDate}
                disabled={!dateInput}
                className="border-teal-500/40 text-teal-400 hover:bg-teal-500/10 gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </Button>
            </div>
            {dates.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {dates.map(d => (
                  <span
                    key={d}
                    className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded border bg-teal-500/10 text-teal-300 border-teal-500/30"
                  >
                    <Calendar className="w-2.5 h-2.5" />
                    {format(parseISO(d), "MMM d, yyyy")}
                    <button onClick={() => removeDate(d)} className="ml-0.5 hover:text-red-400 transition-colors">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {dates.length === 0 && (
              <p className="text-[11px] text-muted-foreground mt-1.5">No dates added yet</p>
            )}
          </div>

          {/* Priority */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Priority Rank</label>
            <select
              value={priority}
              onChange={e => setPriority(Number(e.target.value))}
              className="w-full h-9 rounded-md border border-border/40 bg-secondary/30 text-sm text-foreground px-3 focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {[1, 2, 3, 4, 5].map(p => (
                <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
              ))}
            </select>
          </div>

          {/* Continuity type */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Continuity Type</label>
            <div className="flex gap-2">
              {(["continuous", "intermittent"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setContinuityType(t)}
                  className={`flex-1 py-1.5 text-xs rounded-md border transition-all capitalize ${
                    continuityType === t
                      ? "border-teal-500/60 bg-teal-500/10 text-teal-300"
                      : "border-border/30 bg-secondary/20 text-muted-foreground hover:border-border/60"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Admin Note <span className="text-muted-foreground/60">(optional — included in email)</span>
            </label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="e.g. Pre-approved per union agreement, shift swap arrangement…"
              className="w-full rounded-md border border-border/40 bg-secondary/30 text-sm text-foreground px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
            />
          </div>

          {/* Submit */}
          {!showConfirm ? (
            <Button
              className="w-full bg-purple-600 hover:bg-purple-700 text-white gap-2"
              onClick={handleSubmit}
              disabled={!selectedEmpId || dates.length === 0}
            >
              <Calendar className="w-4 h-4" />
              Add {dates.length > 0 ? dates.length : ""} Date{dates.length !== 1 ? "s" : ""} + Send Email
            </Button>
          ) : (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-amber-300">Confirm Action</p>
                  <p className="text-amber-200/80 text-xs mt-0.5">
                    Adding <strong>{dates.length} date{dates.length !== 1 ? "s" : ""}</strong> as P{priority} for{" "}
                    <strong>{selectedEmployee?.firstName} {selectedEmployee?.lastName}</strong>.
                    An email notification will be sent to <strong>{selectedEmployee?.email}</strong>.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1 bg-amber-600 hover:bg-amber-700 text-white gap-1"
                  onClick={confirmSubmit}
                  disabled={addDatesMutation.isPending}
                >
                  {addDatesMutation.isPending ? (
                    <><Loader2 className="w-3 h-3 animate-spin" /> Processing…</>
                  ) : (
                    <><Mail className="w-3 h-3" /> Confirm & Send</>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 border-border/40"
                  onClick={() => setShowConfirm(false)}
                  disabled={addDatesMutation.isPending}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
