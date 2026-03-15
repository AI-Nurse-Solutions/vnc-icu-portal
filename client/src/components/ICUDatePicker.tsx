/**
 * ICUDatePicker
 *
 * Two interaction modes:
 *   - "range"  : click-and-drag to select a continuous block of dates
 *   - "multi"  : click individual dates to toggle them on/off (non-contiguous)
 *
 * Props:
 *   selected       – controlled Set<string> of "yyyy-MM-dd" strings
 *   onChange       – called with the new Set whenever selection changes
 *   blackoutDates  – Set<string> of dates that cannot be selected
 *   shiftData      – optional per-date demand info for the employee's shift
 *   employeeShift  – "AM" | "PM" | "NOC" (used to look up shiftData)
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { format, getDaysInMonth, startOfMonth, getDay, addMonths, subMonths, eachDayOfInterval, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight, MousePointer2, ToggleLeft, AlertTriangle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";

type SelectionMode = "range" | "multi";

interface PerShiftData {
  count: number;
  cap: number;
  status: string;
  label?: string;
}

interface DayEntry {
  AM: PerShiftData;
  PM: PerShiftData;
  NOC: PerShiftData;
  isBlackout: boolean;
  blackoutReason?: string;
}

interface ICUDatePickerProps {
  selected: Set<string>;
  onChange: (dates: Set<string>) => void;
  blackoutDates?: Set<string>;
  shiftData?: Record<string, DayEntry>;
  employeeShift?: "AM" | "PM" | "NOC";
  minDate?: string; // "yyyy-MM-dd", defaults to today
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function sortedDates(set: Set<string>): string[] {
  return Array.from(set).sort();
}

function expandRange(a: string, b: string): string[] {
  const start = a <= b ? parseISO(a) : parseISO(b);
  const end = a <= b ? parseISO(b) : parseISO(a);
  return eachDayOfInterval({ start, end }).map(d => format(d, "yyyy-MM-dd"));
}

export function ICUDatePicker({
  selected,
  onChange,
  blackoutDates = new Set(),
  shiftData,
  employeeShift,
  minDate,
}: ICUDatePickerProps) {
  const today = format(new Date(), "yyyy-MM-dd");
  const effectiveMin = minDate ?? today;

  const [viewDate, setViewDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [mode, setMode] = useState<SelectionMode>("range");

  // Drag state (range mode)
  const [dragStart, setDragStart] = useState<string | null>(null);
  const [dragEnd, setDragEnd] = useState<string | null>(null);
  const isDragging = useRef(false);
  const dragSelectionBase = useRef<Set<string>>(new Set()); // snapshot before drag

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth() + 1;
  const daysInMonth = getDaysInMonth(new Date(year, month - 1));
  const firstDayOfWeek = getDay(startOfMonth(new Date(year, month - 1)));

  // Compute the "preview" set while dragging
  const previewSelected = useCallback((): Set<string> => {
    if (!isDragging.current || !dragStart || !dragEnd) return selected;
    const rangeDates = expandRange(dragStart, dragEnd).filter(
      d => d >= effectiveMin && !blackoutDates.has(d)
    );
    const next = new Set(dragSelectionBase.current);
    rangeDates.forEach(d => next.add(d));
    return next;
  }, [dragStart, dragEnd, selected, effectiveMin, blackoutDates]);

  const activeSelected = isDragging.current ? previewSelected() : selected;

  // ── Range mode handlers ──────────────────────────────────────────────────

  const handleMouseDown = useCallback((ds: string) => {
    if (mode !== "range") return;
    if (ds < effectiveMin || blackoutDates.has(ds)) return;
    isDragging.current = true;
    dragSelectionBase.current = new Set(selected);
    setDragStart(ds);
    setDragEnd(ds);
  }, [mode, effectiveMin, blackoutDates, selected]);

  const handleMouseEnter = useCallback((ds: string) => {
    if (!isDragging.current) return;
    setDragEnd(ds);
  }, []);

  const handleMouseUp = useCallback(() => {
    if (!isDragging.current || !dragStart || !dragEnd) return;
    isDragging.current = false;
    const rangeDates = expandRange(dragStart, dragEnd).filter(
      d => d >= effectiveMin && !blackoutDates.has(d)
    );
    const next = new Set(dragSelectionBase.current);
    rangeDates.forEach(d => next.add(d));
    onChange(next);
    setDragStart(null);
    setDragEnd(null);
  }, [dragStart, dragEnd, effectiveMin, blackoutDates, onChange]);

  // Cancel drag if mouse leaves the calendar entirely
  useEffect(() => {
    const cancel = () => {
      if (isDragging.current) {
        isDragging.current = false;
        setDragStart(null);
        setDragEnd(null);
      }
    };
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("mouseleave", cancel);
    return () => {
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("mouseleave", cancel);
    };
  }, [handleMouseUp]);

  // ── Multi mode handler ───────────────────────────────────────────────────

  const handleClick = useCallback((ds: string) => {
    if (mode !== "multi") return;
    if (ds < effectiveMin || blackoutDates.has(ds)) return;
    const next = new Set(selected);
    if (next.has(ds)) next.delete(ds);
    else next.add(ds);
    onChange(next);
  }, [mode, effectiveMin, blackoutDates, selected, onChange]);

  // ── Unified cell interaction ─────────────────────────────────────────────

  const handleCellMouseDown = (ds: string) => {
    if (mode === "range") handleMouseDown(ds);
    else handleClick(ds);
  };

  // ── Drag preview highlight ───────────────────────────────────────────────

  const isInDragPreview = (ds: string): boolean => {
    if (!isDragging.current || !dragStart || !dragEnd) return false;
    const lo = dragStart <= dragEnd ? dragStart : dragEnd;
    const hi = dragStart <= dragEnd ? dragEnd : dragStart;
    return ds >= lo && ds <= hi && ds >= effectiveMin && !blackoutDates.has(ds);
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="select-none">
      {/* Mode toggle */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-muted-foreground font-medium">Selection mode:</span>
        <div className="flex rounded-lg border border-border/50 overflow-hidden">
          <button
            onClick={() => setMode("range")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === "range"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/40"
            }`}
          >
            <MousePointer2 className="w-3 h-3" />
            Drag Range
          </button>
          <button
            onClick={() => setMode("multi")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors border-l border-border/50 ${
              mode === "multi"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/40"
            }`}
          >
            <ToggleLeft className="w-3 h-3" />
            Multi-Select
          </button>
        </div>
        <span className="text-xs text-muted-foreground ml-auto hidden sm:block">
          {mode === "range" ? "Click and drag to select a range" : "Click dates to toggle individually"}
        </span>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between mb-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setViewDate(d => subMonths(d, 1))}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm font-semibold text-foreground">
          {format(viewDate, "MMMM yyyy")}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setViewDate(d => addMonths(d, 1))}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map(d => (
          <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Date cells */}
      <div
        className="grid grid-cols-7 gap-1"
        onMouseLeave={() => {
          // keep drag alive when moving between cells; only cancel on full grid leave
        }}
      >
        {/* Empty leading cells */}
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}

        {/* Day cells */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const ds = dateStr(year, month, day);
          const isPast = ds < effectiveMin;
          const isBlackout = blackoutDates.has(ds);
          const isSelected = activeSelected.has(ds);
          const isDragPreview = isInDragPreview(ds);
          const isToday = ds === today;
          const dayEntry = shiftData?.[ds];
          const dayShift = employeeShift && dayEntry ? dayEntry[employeeShift] : null;

          let cellClass = "relative rounded-lg border p-1.5 text-left transition-all duration-100 min-h-[58px] ";

          if (isBlackout) {
            cellClass += "opacity-40 cursor-not-allowed bg-destructive/5 border-destructive/20";
          } else if (isPast) {
            cellClass += "opacity-25 cursor-not-allowed border-border/20";
          } else if (isSelected) {
            cellClass += "border-primary bg-primary/20 shadow-[0_0_0_2px_oklch(0.68_0.15_200/35%)] cursor-pointer";
          } else if (isDragPreview) {
            cellClass += "border-primary/60 bg-primary/10 cursor-pointer";
          } else {
            cellClass += `border-border/30 hover:border-primary/50 hover:bg-secondary/30 ${
              mode === "range" ? "cursor-crosshair" : "cursor-pointer"
            }`;
          }

          if (isToday) cellClass += " ring-1 ring-primary/50";

          return (
            <div
              key={ds}
              className={cellClass}
              onMouseDown={() => handleCellMouseDown(ds)}
              onMouseEnter={() => handleMouseEnter(ds)}
              title={isBlackout ? "Blackout date — requests not allowed" : undefined}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold ${
                  isToday ? "text-primary" :
                  isPast ? "text-muted-foreground/40" :
                  isSelected ? "text-primary" :
                  "text-foreground"
                }`}>
                  {day}
                </span>
                {isBlackout && <AlertTriangle className="w-2.5 h-2.5 text-destructive" />}
                {isSelected && !isBlackout && (
                  <span className="w-2 h-2 rounded-full bg-primary animate-scale-in" />
                )}
              </div>

              {/* Shift demand indicator */}
              {dayShift && !isPast && !isBlackout && (
                <div className={`mt-1 text-[9px] font-semibold px-1 py-0.5 rounded-sm leading-tight ${
                  dayShift.status === "red"
                    ? "bg-destructive/20 text-destructive"
                    : dayShift.status === "yellow"
                    ? "bg-[oklch(0.75_0.18_70/20%)] text-[oklch(0.75_0.18_70)]"
                    : "bg-[oklch(0.65_0.17_160/20%)] text-[oklch(0.65_0.17_160)]"
                }`}>
                  {dayShift.count}/{dayShift.cap}
                  <span className="ml-0.5 opacity-70">
                    {dayShift.status === "red" ? "FULL" : dayShift.status === "yellow" ? "LIM" : "OK"}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-border/30">
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Info className="w-3 h-3" />
          Shift demand:
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[oklch(0.65_0.17_160/20%)] text-[oklch(0.65_0.17_160)] font-semibold">OK — available</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[oklch(0.75_0.18_70/20%)] text-[oklch(0.75_0.18_70)] font-semibold">LIM — limited</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/20 text-destructive font-semibold">FULL — at cap</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/5 border border-destructive/20 text-muted-foreground font-semibold ml-auto">⚠ Blackout</span>
      </div>
    </div>
  );
}
