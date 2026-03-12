import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format, getDaysInMonth, startOfMonth, getDay } from "date-fns";
import { ChevronLeft, ChevronRight, Loader2, Send, X, AlertTriangle, Info, Bell } from "lucide-react";
import { useEmployee } from "@/hooks/useEmployee";
import { useLocation } from "wouter";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function NewRequest() {
  const [, navigate] = useLocation();
  const { employee } = useEmployee();
  const utils = trpc.useUtils();

  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [requestType, setRequestType] = useState<"vacation" | "education">("vacation");
  const [continuityType, setContinuityType] = useState<"continuous" | "intermittent">("continuous");
  const [comment, setComment] = useState("");

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth() + 1;

  const { data: monthData } = trpc.calendar.getMonthData.useQuery({ year, month });
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

  const daysInMonth = getDaysInMonth(new Date(year, month - 1));
  const firstDayOfWeek = getDay(startOfMonth(new Date(year, month - 1)));
  const todayStr = format(today, "yyyy-MM-dd");

  const toggleDate = (dateStr: string) => {
    if (dateStr < todayStr) return;
    if (blackoutSet.has(dateStr)) return;
    const next = new Set(selectedDates);
    if (next.has(dateStr)) next.delete(dateStr);
    else next.add(dateStr);
    setSelectedDates(next);
  };

  const handleSubmit = () => {
    if (selectedDates.size === 0) {
      toast.error("Please select at least one date.");
      return;
    }
    submitMutation.mutate({
      requestType,
      continuityType,
      dates: Array.from(selectedDates).sort(),
      comment: comment.trim() || undefined,
    });
  };

  // Find applicable deadline
  const applicableDeadline = deadlines?.find(d => {
    const dates = Array.from(selectedDates).sort();
    if (dates.length === 0) return false;
    const firstDate = dates[0];
    return firstDate >= d.coverageStart && firstDate <= d.coverageEnd;
  });

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary" />
          New Time-Off Request
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Select dates and fill in the details below. Shift: <span className="text-primary font-medium">{employee?.shift}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <div className="lg:col-span-2">
          <div className="bg-card border border-border/40 rounded-xl p-4">
            {/* Month nav */}
            <div className="flex items-center justify-between mb-4">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm font-semibold text-foreground">{format(viewDate, "MMMM yyyy")}</span>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {DAYS.map(d => (
                <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-1">{d}</div>
              ))}
            </div>

            {/* Cells */}
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e-${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const isPast = dateStr < todayStr;
                const isBlackout = blackoutSet.has(dateStr);
                const isSelected = selectedDates.has(dateStr);
                const isToday = dateStr === todayStr;
                const dayData = monthData?.days[dateStr];
                const shiftData = employee?.shift ? dayData?.[employee.shift as "AM" | "PM" | "NOC"] : null;

                return (
                  <button
                    key={dateStr}
                    onClick={() => toggleDate(dateStr)}
                    disabled={isPast || isBlackout}
                    title={isBlackout ? "Blackout date — requests not allowed" : undefined}
                    className={`relative rounded-lg border p-1.5 text-left transition-all duration-150 min-h-[64px] ${
                      isBlackout
                        ? "opacity-40 cursor-not-allowed bg-destructive/5 border-destructive/20"
                        : isPast
                        ? "opacity-30 cursor-not-allowed border-border/20"
                        : isSelected
                        ? "border-primary bg-primary/15 shadow-[0_0_0_2px_oklch(0.68_0.15_200/40%)]"
                        : "border-border/30 hover:border-primary/50 hover:bg-secondary/30 cursor-pointer"
                    } ${isToday ? "ring-1 ring-primary/40" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold ${isToday ? "text-primary" : isPast ? "text-muted-foreground/50" : "text-foreground"}`}>
                        {day}
                      </span>
                      {isBlackout && <AlertTriangle className="w-2.5 h-2.5 text-destructive" />}
                      {isSelected && <span className="w-2 h-2 rounded-full bg-primary" />}
                    </div>
                    {shiftData && !isPast && !isBlackout && (
                      <div className={`mt-1 text-[9px] font-semibold px-1 py-0.5 rounded-sm ${
                        shiftData.status === "red" ? "bg-destructive/20 text-destructive" :
                        shiftData.status === "yellow" ? "bg-[oklch(0.75_0.18_70/20%)] text-[oklch(0.75_0.18_70)]" :
                        "bg-[oklch(0.65_0.17_160/20%)] text-[oklch(0.65_0.17_160)]"
                      }`}>
                        {shiftData.count}/{shiftData.cap}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
              <Info className="w-3 h-3" />
              Numbers show current requests vs. approval cap for your shift ({employee?.shift})
            </p>
          </div>
        </div>

        {/* Form panel */}
        <div className="space-y-4">
          {/* Selected dates */}
          <div className="bg-card border border-border/40 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">
              Selected Dates ({selectedDates.size})
            </h3>
            {selectedDates.size === 0 ? (
              <p className="text-xs text-muted-foreground">Click dates on the calendar to select them</p>
            ) : (
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                {Array.from(selectedDates).sort().map(d => (
                  <span key={d} className="flex items-center gap-1 text-xs bg-primary/15 text-primary border border-primary/30 px-2 py-0.5 rounded-full">
                    {format(new Date(d + "T12:00:00"), "MMM d")}
                    <button onClick={() => toggleDate(d)} className="hover:text-destructive ml-0.5">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Request type */}
          <div className="bg-card border border-border/40 rounded-xl p-4">
            <Label className="text-sm font-semibold mb-3 block">Request Type</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["vacation", "education"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setRequestType(t)}
                  className={`py-2 px-3 rounded-lg text-sm font-medium border transition-all ${
                    requestType === t
                      ? t === "vacation" ? "bg-primary/15 text-primary border-primary/40" : "bg-[oklch(0.70_0.15_290/15%)] text-[oklch(0.70_0.15_290)] border-[oklch(0.70_0.15_290/40%)]"
                      : "border-border/40 text-muted-foreground hover:text-foreground hover:border-border/70"
                  }`}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Continuity */}
          <div className="bg-card border border-border/40 rounded-xl p-4">
            <Label className="text-sm font-semibold mb-3 block">Date Pattern</Label>
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

          {/* Comment */}
          <div className="bg-card border border-border/40 rounded-xl p-4">
            <Label htmlFor="comment" className="text-sm font-semibold mb-2 block">
              Private Comment <span className="text-muted-foreground font-normal">(optional)</span>
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

          {/* Deadline warning */}
          {applicableDeadline && (
            <div className="bg-[oklch(0.75_0.18_70/10%)] border border-[oklch(0.75_0.18_70/30%)] rounded-xl p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-[oklch(0.75_0.18_70)] shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-semibold text-[oklch(0.75_0.18_70)]">Submission Deadline</p>
                <p className="text-muted-foreground mt-0.5">
                  Deadline for this period: <span className="text-foreground">{format(new Date(applicableDeadline.deadlineDate + "T12:00:00"), "MMM d, yyyy")}</span>
                </p>
              </div>
            </div>
          )}

          {/* Submit */}
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
