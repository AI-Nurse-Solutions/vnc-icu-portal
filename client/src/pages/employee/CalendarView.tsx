import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar, Info, AlertTriangle } from "lucide-react";
import { format, getDaysInMonth, startOfMonth, getDay } from "date-fns";

const SHIFTS = ["AM", "PM", "NOC"] as const;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function DemandPill({ status, label, count, cap }: { status: string; label: string; count: number; cap: number }) {
  const cls = status === "red" ? "demand-red" : status === "yellow" ? "demand-yellow" : "demand-green";
  return (
    <span className={`${cls} text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-1`} title={`${count}/${cap} slots used`}>
      <span className="sr-only">Demand level: </span>
      {label}
    </span>
  );
}

export default function CalendarView() {
  const today = new Date();
  const [viewDate, setViewDate] = useState(today);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedShift, setSelectedShift] = useState<"AM" | "PM" | "NOC">("AM");

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth() + 1;

  const { data: monthData, isLoading } = trpc.calendar.getMonthData.useQuery({ year, month });
  const { data: drillDown, isLoading: drillLoading } = trpc.calendar.getDayDrillDown.useQuery(
    { date: selectedDate!, shift: selectedShift },
    { enabled: !!selectedDate }
  );

  const daysInMonth = getDaysInMonth(new Date(year, month - 1));
  const firstDayOfWeek = getDay(startOfMonth(new Date(year, month - 1)));

  const prevMonth = () => setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  const todayStr = format(today, "yyyy-MM-dd");

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            Shift Demand Calendar
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">View staffing demand across all shifts</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={prevMonth} className="h-8 w-8">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-semibold text-foreground min-w-[140px] text-center">
            {format(viewDate, "MMMM yyyy")}
          </span>
          <Button variant="ghost" size="icon" onClick={nextMonth} className="h-8 w-8">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 mb-4 text-xs">
        <span className="text-muted-foreground font-medium">Demand:</span>
        <span className="demand-green px-2 py-0.5 rounded-full text-[11px]">Open — Available</span>
        <span className="demand-yellow px-2 py-0.5 rounded-full text-[11px]">Filling — Near Capacity</span>
        <span className="demand-red px-2 py-0.5 rounded-full text-[11px]">Full — At/Over Cap</span>
        <span className="ml-2 text-muted-foreground">Click a date to see seniority-ranked requesters</span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Calendar grid */}
        <div className="xl:col-span-2">
          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map(d => (
              <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-2">{d}</div>
            ))}
          </div>

          {/* Calendar cells */}
          <div className="grid grid-cols-7 gap-1">
            {/* Empty cells for first week */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}

            {/* Day cells */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const dayData = monthData?.days[dateStr];
              const isToday = dateStr === todayStr;
              const isPast = dateStr < todayStr;
              const isBlackout = dayData?.isBlackout;
              const isSelected = selectedDate === dateStr;

              return (
                <button
                  key={dateStr}
                  onClick={() => {
                    if (!isBlackout) {
                      setSelectedDate(dateStr === selectedDate ? null : dateStr);
                    }
                  }}
                  className={`relative rounded-lg border p-1.5 text-left transition-all duration-150 min-h-[80px] ${
                    isBlackout
                      ? "opacity-50 cursor-not-allowed bg-destructive/5 border-destructive/20"
                      : isPast
                      ? "opacity-40 cursor-default border-border/20"
                      : isSelected
                      ? "border-primary bg-primary/10 shadow-[0_0_0_2px_oklch(0.68_0.15_200/40%)]"
                      : "border-border/30 hover:border-primary/50 hover:bg-secondary/40 cursor-pointer"
                  } ${isToday ? "ring-1 ring-primary/50" : ""}`}
                  disabled={isBlackout}
                  title={isBlackout ? dayData?.blackoutReason ?? "Blackout date" : undefined}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-bold ${isToday ? "text-primary" : isPast ? "text-muted-foreground/60" : "text-foreground"}`}>
                      {day}
                    </span>
                    {isBlackout && <AlertTriangle className="w-3 h-3 text-destructive" />}
                    {isToday && <span className="text-[9px] text-primary font-semibold">TODAY</span>}
                  </div>

                  {isLoading ? (
                    <div className="space-y-1">
                      {[0,1,2].map(i => <div key={i} className="h-3 bg-muted/40 rounded animate-pulse" />)}
                    </div>
                  ) : dayData ? (
                    <div className="space-y-0.5">
                      {SHIFTS.map(shift => (
                        <DemandPill
                          key={shift}
                          status={dayData[shift].status}
                          label={`${shift} ${dayData[shift].count}/${dayData[shift].cap}`}
                          count={dayData[shift].count}
                          cap={dayData[shift].cap}
                        />
                      ))}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* Drill-down panel */}
        <div className="xl:col-span-1">
          {selectedDate ? (
            <div className="bg-card border border-border/60 rounded-xl p-4 animate-slide-up sticky top-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-foreground text-sm">
                  {format(new Date(selectedDate + "T12:00:00"), "EEEE, MMM d")}
                </h3>
                <button onClick={() => setSelectedDate(null)} className="text-muted-foreground hover:text-foreground text-xs">✕</button>
              </div>

              {/* Shift tabs */}
              <div className="flex gap-1 mb-4 bg-secondary/40 rounded-lg p-1">
                {SHIFTS.map(s => (
                  <button
                    key={s}
                    onClick={() => setSelectedShift(s)}
                    className={`flex-1 text-xs font-semibold py-1.5 rounded-md transition-all ${
                      selectedShift === s
                        ? "bg-primary text-primary-foreground shadow"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {/* Demand indicator */}
              {monthData?.days[selectedDate] && (
                <div className="mb-3">
                  <DemandPill
                    status={monthData.days[selectedDate][selectedShift].status}
                    label={`${monthData.days[selectedDate][selectedShift].count} of ${monthData.days[selectedDate][selectedShift].cap} slots used — ${monthData.days[selectedDate][selectedShift].label}`}
                    count={monthData.days[selectedDate][selectedShift].count}
                    cap={monthData.days[selectedDate][selectedShift].cap}
                  />
                </div>
              )}

              {/* Seniority-ranked list */}
              {drillLoading ? (
                <div className="space-y-2">
                  {[1,2,3].map(i => <div key={i} className="h-8 bg-muted/40 rounded animate-pulse" />)}
                </div>
              ) : drillDown && drillDown.length > 0 ? (
                <div className="space-y-1 animate-stagger">
                  {drillDown.map((r, idx) => {
                    const cap = monthData?.days[selectedDate]?.[selectedShift]?.cap ?? 8;
                    const isAboveCap = idx === cap;
                    return (
                      <div key={r.requestId}>
                        {isAboveCap && (
                          <div className="rank-cutoff my-2 pt-2" />
                        )}
                        <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs ${
                          idx < cap ? "bg-secondary/30" : "bg-destructive/5 opacity-70"
                        }`}>
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                            idx < cap ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                          }`}>
                            {r.rank}
                          </span>
                          <span className="font-medium text-foreground flex-1 truncate">{r.displayName}</span>
                          <span className={r.requestType === "vacation" ? "badge-vacation" : "badge-education"}>
                            {r.requestType === "vacation" ? "Vac" : "Edu"}
                          </span>
                          <span className={`badge-${r.status}`}>{r.status.charAt(0).toUpperCase() + r.status.slice(1)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground text-xs">
                  <Info className="w-5 h-5 mx-auto mb-2 opacity-50" />
                  No requests for this shift on this date
                </div>
              )}
            </div>
          ) : (
            <div className="bg-card/50 border border-border/30 rounded-xl p-6 text-center">
              <Calendar className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Click a date to see seniority-ranked requesters</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
