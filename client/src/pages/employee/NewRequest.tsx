import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format, differenceInCalendarDays } from "date-fns";
import { Loader2, Send, X, AlertTriangle, Info, Bell, CalendarDays, List, ChevronDown } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEmployee } from "@/hooks/useEmployee";
import { useLocation } from "wouter";
import { ICUDatePicker } from "@/components/ICUDatePicker";

export default function NewRequest() {
  const [, navigate] = useLocation();
  const { employee } = useEmployee();
  const utils = trpc.useUtils();

  const today = format(new Date(), "yyyy-MM-dd");
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [requestType, setRequestType] = useState<"vacation" | "education">("vacation");
  const [continuityType, setContinuityType] = useState<"continuous" | "intermittent">("continuous");
  const [priority, setPriority] = useState<"routine" | "preferred" | "critical">("routine");
  const [comment, setComment] = useState("");

  // Derive year/month from the first selected date or today for data fetching
  const firstSelected = Array.from(selectedDates).sort()[0];
  const viewYear = firstSelected ? parseInt(firstSelected.slice(0, 4)) : new Date().getFullYear();
  const viewMonth = firstSelected ? parseInt(firstSelected.slice(5, 7)) : new Date().getMonth() + 1;

  const { data: monthData } = trpc.calendar.getMonthData.useQuery({ year: viewYear, month: viewMonth });
  const { data: blackouts } = trpc.calendar.getBlackoutDates.useQuery();
  const { data: deadlines } = trpc.calendar.getDeadlines.useQuery();

  const blackoutSet = useMemo(() => new Set(blackouts?.map(b => b.date) ?? []), [blackouts]);

  const submitMutation = trpc.requests.submit.useMutation({
    onSuccess: () => {
      toast.success("Request submitted successfully! You'll receive a confirmation email.");
      utils.requests.myRequests.invalidate();
      navigate("/dashboard/my-requests");
    },
    onError: (e) => toast.error(e.message),
  });

  const sortedSelected = useMemo(() => Array.from(selectedDates).sort(), [selectedDates]);

  const handleSubmit = () => {
    if (selectedDates.size === 0) {
      toast.error("Please select at least one date.");
      return;
    }
    submitMutation.mutate({
      requestType,
      continuityType,
      priority,
      dates: sortedSelected,
      comment: comment.trim() || undefined,
    });
  };

  const removeDate = (d: string) => {
    const next = new Set(selectedDates);
    next.delete(d);
    setSelectedDates(next);
  };

  // Find applicable deadline for the first selected date
  const applicableDeadline = useMemo(() => {
    if (sortedSelected.length === 0) return null;
    const first = sortedSelected[0];
    return deadlines?.find(d => first >= d.coverageStart && first <= d.coverageEnd) ?? null;
  }, [sortedSelected, deadlines]);

  // Detect contiguous vs. non-contiguous for auto-setting continuity type
  const isContiguous = useMemo(() => {
    if (sortedSelected.length <= 1) return true;
    for (let i = 1; i < sortedSelected.length; i++) {
      const prev = new Date(sortedSelected[i - 1] + "T12:00:00");
      const curr = new Date(sortedSelected[i] + "T12:00:00");
      if (differenceInCalendarDays(curr, prev) !== 1) return false;
    }
    return true;
  }, [sortedSelected]);

  // Group consecutive dates for summary display
  const dateGroups = useMemo(() => {
    if (sortedSelected.length === 0) return [];
    const groups: { start: string; end: string; count: number }[] = [];
    let groupStart = sortedSelected[0];
    let groupEnd = sortedSelected[0];

    for (let i = 1; i < sortedSelected.length; i++) {
      const prev = new Date(sortedSelected[i - 1] + "T12:00:00");
      const curr = new Date(sortedSelected[i] + "T12:00:00");
      if (differenceInCalendarDays(curr, prev) === 1) {
        groupEnd = sortedSelected[i];
      } else {
        groups.push({
          start: groupStart,
          end: groupEnd,
          count: differenceInCalendarDays(new Date(groupEnd + "T12:00:00"), new Date(groupStart + "T12:00:00")) + 1,
        });
        groupStart = sortedSelected[i];
        groupEnd = sortedSelected[i];
      }
    }
    groups.push({
      start: groupStart,
      end: groupEnd,
      count: differenceInCalendarDays(new Date(groupEnd + "T12:00:00"), new Date(groupStart + "T12:00:00")) + 1,
    });
    return groups;
  }, [sortedSelected]);

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary" />
          New Time-Off Request
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Select dates using drag (range) or click (multi-select). Shift:{" "}
          <span className="text-primary font-medium">{employee?.shift}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* ── Calendar ─────────────────────────────────────────────── */}
        <div className="xl:col-span-2">
          <div className="bg-card border border-border/40 rounded-xl p-4">
            <ICUDatePicker
              selected={selectedDates}
              onChange={setSelectedDates}
              blackoutDates={blackoutSet}
              shiftData={monthData?.days as any}
              employeeShift={employee?.shift as "AM" | "PM" | "NOC" | undefined}
              minDate={today}
            />
          </div>
        </div>

        {/* ── Right panel ──────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* ── Date Summary ─────────────────────────────────────── */}
          <div className="bg-card border border-border/40 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <List className="w-4 h-4 text-primary" />
                Selected Dates
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  ({selectedDates.size} day{selectedDates.size !== 1 ? "s" : ""})
                </span>
              </h3>
              {selectedDates.size > 0 && (
                <button
                  onClick={() => setSelectedDates(new Set())}
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>

            {selectedDates.size === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <CalendarDays className="w-8 h-8 text-muted-foreground/30 mb-2" />
                <p className="text-xs text-muted-foreground">
                  No dates selected yet.
                  <br />
                  Use <span className="text-primary font-medium">Drag Range</span> or{" "}
                  <span className="text-primary font-medium">Multi-Select</span> on the calendar.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {/* Grouped ranges */}
                {dateGroups.map((group, idx) => (
                  <div
                    key={`group-${idx}`}
                    className="flex items-center justify-between bg-primary/8 border border-primary/20 rounded-lg px-3 py-2"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground">
                        {group.start === group.end
                          ? format(new Date(group.start + "T12:00:00"), "EEE, MMM d, yyyy")
                          : `${format(new Date(group.start + "T12:00:00"), "MMM d")} – ${format(new Date(group.end + "T12:00:00"), "MMM d, yyyy")}`}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {group.count} day{group.count !== 1 ? "s" : ""}
                        {group.start !== group.end ? " · consecutive" : ""}
                      </p>
                    </div>
                    {/* Remove individual dates in the group */}
                    <button
                      onClick={() => {
                        const next = new Set(selectedDates);
                        // Remove all dates in this group
                        const start = new Date(group.start + "T12:00:00");
                        const end = new Date(group.end + "T12:00:00");
                        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                          next.delete(format(d, "yyyy-MM-dd"));
                        }
                        setSelectedDates(next);
                      }}
                      className="ml-2 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                      title="Remove this block"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

                {/* Individual date chips for non-contiguous dates */}
                {!isContiguous && (
                  <div className="pt-1 border-t border-border/20">
                    <p className="text-[10px] text-muted-foreground mb-1.5">All selected dates:</p>
                    <div className="flex flex-wrap gap-1">
                      {sortedSelected.map(d => (
                        <span
                          key={d}
                          className="flex items-center gap-1 text-[10px] bg-secondary/40 text-foreground border border-border/40 px-2 py-0.5 rounded-full"
                        >
                          {format(new Date(d + "T12:00:00"), "M/d")}
                          <button
                            onClick={() => removeDate(d)}
                            className="hover:text-destructive ml-0.5 transition-colors"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Summary stats */}
            {selectedDates.size > 0 && (
              <div className="mt-3 pt-3 border-t border-border/20 grid grid-cols-2 gap-2">
                <div className="text-center">
                  <p className="text-lg font-bold text-primary">{selectedDates.size}</p>
                  <p className="text-[10px] text-muted-foreground">Total Days</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-foreground">{dateGroups.length}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {dateGroups.length === 1 ? "Block" : "Blocks"}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ── Request Type ─────────────────────────────────────── */}
          <div className="bg-card border border-border/40 rounded-xl p-4">
            <Label className="text-sm font-semibold mb-3 block">Request Type</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["vacation", "education"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setRequestType(t)}
                  className={`py-2 px-3 rounded-lg text-sm font-medium border transition-all ${
                    requestType === t
                      ? t === "vacation"
                        ? "bg-primary/15 text-primary border-primary/40"
                        : "bg-[oklch(0.70_0.15_290/15%)] text-[oklch(0.70_0.15_290)] border-[oklch(0.70_0.15_290/40%)]"
                      : "border-border/40 text-muted-foreground hover:text-foreground hover:border-border/70"
                  }`}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* ── Request Priority ─────────────────────────────────── */}
          <div className="bg-card border border-border/40 rounded-xl p-4">
            <Label htmlFor="priority" className="text-sm font-semibold mb-3 block">
              Request Priority
            </Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
              <SelectTrigger
                id="priority"
                className={`w-full border transition-colors ${
                  priority === "critical"
                    ? "border-red-500/50 bg-red-500/8 text-red-400"
                    : priority === "preferred"
                    ? "border-amber-500/50 bg-amber-500/8 text-amber-400"
                    : "border-border/60 text-foreground"
                }`}
              >
                <SelectValue placeholder="Select priority" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border/60">
                <SelectItem value="routine">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                    <span>Routine</span>
                    <span className="text-xs text-muted-foreground ml-1">— Standard scheduling request</span>
                  </div>
                </SelectItem>
                <SelectItem value="preferred">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                    <span>Preferred</span>
                    <span className="text-xs text-muted-foreground ml-1">— Important personal event</span>
                  </div>
                </SelectItem>
                <SelectItem value="critical">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                    <span>Critical</span>
                    <span className="text-xs text-muted-foreground ml-1">— Urgent / non-negotiable</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-2">
              {priority === "critical"
                ? "Manager will be notified of urgency. Use sparingly."
                : priority === "preferred"
                ? "Flags this request as higher importance for manager review."
                : "Default priority — no special flag."}
            </p>
          </div>

          {/* ── Date Pattern ─────────────────────────────────────── */}
          <div className="bg-card border border-border/40 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <Label className="text-sm font-semibold">Date Pattern</Label>
              {selectedDates.size > 0 && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  isContiguous
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "bg-[oklch(0.70_0.15_290/10%)] text-[oklch(0.70_0.15_290)] border border-[oklch(0.70_0.15_290/20%)]"
                }`}>
                  Auto-detected: {isContiguous ? "Continuous" : "Intermittent"}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(["continuous", "intermittent"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setContinuityType(t)}
                  className={`py-2 px-3 rounded-lg text-sm font-medium border transition-all ${
                    continuityType === t
                      ? "bg-primary/15 text-primary border-primary/40"
                      : "border-border/40 text-muted-foreground hover:text-foreground hover:border-border/70"
                  }`}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {continuityType === "continuous" ? "Consecutive days in a block" : "Non-consecutive individual days"}
            </p>
          </div>

          {/* ── Private Comment ──────────────────────────────────── */}
          <div className="bg-card border border-border/40 rounded-xl p-4">
            <Label htmlFor="comment" className="text-sm font-semibold mb-2 block">
              Private Comment{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="comment"
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Visible only to you and your manager..."
              className="bg-input border-border/60 text-sm resize-none h-20"
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground mt-1">{comment.length}/500</p>
          </div>

          {/* ── Deadline Warning ─────────────────────────────────── */}
          {applicableDeadline && (
            <div className="bg-[oklch(0.75_0.18_70/10%)] border border-[oklch(0.75_0.18_70/30%)] rounded-xl p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-[oklch(0.75_0.18_70)] shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-semibold text-[oklch(0.75_0.18_70)]">Submission Deadline</p>
                <p className="text-muted-foreground mt-0.5">
                  Deadline for this period:{" "}
                  <span className="text-foreground">
                    {format(new Date(applicableDeadline.deadlineDate + "T12:00:00"), "MMM d, yyyy")}
                  </span>
                </p>
              </div>
            </div>
          )}

          {/* ── Data Preview (dev aid) ────────────────────────────── */}
          {selectedDates.size > 0 && (
            <div className="bg-secondary/20 border border-border/30 rounded-xl p-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
                <Info className="w-3 h-3" />
                Output Array ({selectedDates.size} dates)
              </p>
              <code className="text-[10px] text-muted-foreground break-all leading-relaxed">
                {JSON.stringify(sortedSelected)}
              </code>
            </div>
          )}

          {/* ── Submit ───────────────────────────────────────────── */}
          <Button
            onClick={handleSubmit}
            disabled={submitMutation.isPending || selectedDates.size === 0}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold h-11"
          >
            {submitMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting...</>
            ) : (
              <><Send className="w-4 h-4 mr-2" /> Submit Request ({selectedDates.size} day{selectedDates.size !== 1 ? "s" : ""})</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
