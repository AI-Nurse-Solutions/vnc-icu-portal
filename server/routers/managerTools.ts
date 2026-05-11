import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "../../shared/const";
import { verifyJwt } from "../_core/jwt";
import { publicProcedure, router } from "../_core/trpc";
import {
  getAllEmployeePeriodTotals,
  getAuditLogWithActors,
  getDecisionCalendarDay,
  getDecisionCalendarMonth,
  getEmployeeById,
  getHotDateDrillDown,
  getHotDatesData,
  getPendingRequestsForApprovalRun,
  getRequestDates,
  upsertDateDecision,
  clearDateDecision,
  bulkApproveDates,
} from "../db";

async function requireManagerOrAdmin(ctx: any) {
  const token = ctx.req.cookies?.[COOKIE_NAME] || ctx.req.headers.authorization?.replace("Bearer ", "");
  if (!token) throw new TRPCError({ code: "UNAUTHORIZED" });
  const payload = await verifyJwt(token);
  if (!payload?.employeeId) throw new TRPCError({ code: "UNAUTHORIZED" });
  const emp = await getEmployeeById(payload.employeeId as number);
  if (!emp || (emp.role !== "manager" && emp.role !== "admin" && emp.role !== "super_admin")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Manager or admin access required" });
  }
  return emp;
}

async function requireAdmin(ctx: any) {
  const token = ctx.req.cookies?.[COOKIE_NAME] || ctx.req.headers.authorization?.replace("Bearer ", "");
  if (!token) throw new TRPCError({ code: "UNAUTHORIZED" });
  const payload = await verifyJwt(token);
  if (!payload?.employeeId) throw new TRPCError({ code: "UNAUTHORIZED" });
  const emp = await getEmployeeById(payload.employeeId as number);
  if (!emp || (emp.role !== "admin" && emp.role !== "super_admin")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return emp;
}

export const managerToolsRouter = router({
  // ─── Review Dashboard ────────────────────────────────────────────────────────
  // Returns all pending requests with dates, sorted by priority → seniority
  // Groups by month so manager can process one month at a time
  getApprovalRunData: publicProcedure
    .input(z.object({
      month: z.number().min(1).max(12).optional(), // filter to specific month (1-12)
      year: z.number().optional(),
    }))
    .query(async ({ input, ctx }) => {
      await requireManagerOrAdmin(ctx);
      const allPending = await getPendingRequestsForApprovalRun();
      const cap = 8;

      // Fetch dates for all pending requests
      const requestsWithDates = await Promise.all(
        allPending.map(async (req) => {
          const dates = await getRequestDates(req.requestId);
          const sortedDates = dates
            .map(d => (d.date instanceof Date ? d.date.toISOString().split("T")[0] : String(d.date)))
            .sort();
          return { ...req, dates: sortedDates };
        })
      );

      // Filter by month/year if specified
      const year = input.year ?? new Date().getFullYear();
      let filtered = requestsWithDates;
      if (input.month) {
        const monthStr = String(input.month).padStart(2, "0");
        filtered = requestsWithDates.filter(req =>
          req.dates.some(d => d.startsWith(`${year}-${monthStr}`))
        );
      }

      // Build per-date oversubscription map (vacation only, pending)
      const dateCountMap: Record<string, { shift: string; count: number; requests: number[] }[]> = {};
      for (const req of requestsWithDates) {
        if (req.requestType !== "vacation") continue;
        for (const d of req.dates) {
          if (!dateCountMap[d]) dateCountMap[d] = [];
          const existing = dateCountMap[d].find(x => x.shift === req.shift);
          if (existing) {
            existing.count++;
            existing.requests.push(req.requestId);
          } else {
            dateCountMap[d].push({ shift: req.shift, count: 1, requests: [req.requestId] });
          }
        }
      }

      // Mark hot dates (oversubscribed)
      const hotDates = new Set<string>();
      for (const [date, shiftCounts] of Object.entries(dateCountMap)) {
        if (shiftCounts.some(s => s.count > cap)) hotDates.add(date);
      }

      // Get available months from all pending requests
      const monthSet = new Set<string>();
      for (const req of requestsWithDates) {
        for (const d of req.dates) {
          monthSet.add(d.substring(0, 7)); // "YYYY-MM"
        }
      }
      const availableMonths = Array.from(monthSet).sort();

      // Build per-date seniority rank map:
      // For each date, sort all pending vacation requests by priority asc then seniorityDate asc
      // and record the 1-based rank for each requestId on that date
      const dateRankMap: Record<string, Record<number, number>> = {};
      for (const date of Object.keys(dateCountMap)) {
        const reqsOnDate = requestsWithDates.filter(
          r => r.requestType === "vacation" && r.dates.includes(date)
        );
        const sorted = [...reqsOnDate].sort((a, b) => {
          if (a.priority !== b.priority) return a.priority - b.priority;
          const aMs = a.seniorityDate instanceof Date ? a.seniorityDate.getTime() : new Date(String(a.seniorityDate)).getTime();
          const bMs = b.seniorityDate instanceof Date ? b.seniorityDate.getTime() : new Date(String(b.seniorityDate)).getTime();
          return aMs - bMs;
        });
        dateRankMap[date] = {};
        sorted.forEach((r, idx) => { dateRankMap[date][r.requestId] = idx + 1; });
      }
      // For each request, flag which of its dates are hot
      const enriched = filtered.map(req => ({
        requestId: req.requestId,
        employeeId: req.employeeId,
        requestType: req.requestType,
        continuityType: req.continuityType,
        priority: req.priority,
        comment: req.comment ?? null,
        status: req.status,
        submittedAt: req.submittedAt instanceof Date ? req.submittedAt.toISOString() : String(req.submittedAt),
        firstName: req.firstName,
        lastName: req.lastName,
        shift: req.shift,
        seniorityDate: req.seniorityDate instanceof Date ? req.seniorityDate.toISOString() : String(req.seniorityDate),
        employeeNumber: req.employeeNumber,
        isVerified: req.isVerified,
        dates: req.dates,
        hotDates: req.dates.filter(d => hotDates.has(d)),
        hasHotDates: req.dates.some(d => hotDates.has(d)),
        isAllClear: req.requestType === "vacation" && !req.dates.some(d => hotDates.has(d)),
        // Per-date seniority rank for this request (only for vacation requests)
        dateRanks: req.requestType === "vacation"
          ? Object.fromEntries(req.dates.map(d => [d, dateRankMap[d]?.[req.requestId] ?? 99]))
          : {},
      }));

      return {
        requests: enriched,
        hotDates: Array.from(hotDates).sort(),
        availableMonths,
        totalPending: allPending.length,
        cap,
      };
    }),

  // ─── Hot Dates View ──────────────────────────────────────────────────────────
  getHotDates: publicProcedure
    .input(z.object({
      startDate: z.string(), // "YYYY-MM-DD"
      endDate: z.string(),
      cap: z.number().min(1).max(20).default(8),
    }))
    .query(async ({ input, ctx }) => {
      await requireManagerOrAdmin(ctx);
      const rows = await getHotDatesData(input.startDate, input.endDate, input.cap);

      // Group by date
      const dateMap: Record<string, { shift: string; count: number; overCap: boolean; severity: number }[]> = {};
      for (const row of rows) {
        const dateStr = row.date instanceof Date ? row.date.toISOString().split("T")[0] : String(row.date);
        if (!dateMap[dateStr]) dateMap[dateStr] = [];
        const count = Number(row.count);
        const overCap = count > input.cap;
        const severity = overCap ? Math.min(Math.ceil((count - input.cap) / 2), 5) : 0; // 1-5 severity
        dateMap[dateStr].push({ shift: row.shift, count, overCap, severity });
      }

      const result = Object.entries(dateMap)
        .map(([date, shifts]) => ({
          date,
          shifts,
          isHot: shifts.some(s => s.overCap),
          maxSeverity: Math.max(...shifts.map(s => s.severity)),
          totalRequests: shifts.reduce((sum, s) => sum + s.count, 0),
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return result;
    }),

  getHotDateDrillDown: publicProcedure
    .input(z.object({ date: z.string() }))
    .query(async ({ input, ctx }) => {
      await requireManagerOrAdmin(ctx);
      const rows = await getHotDateDrillDown(input.date);
      return rows.map(r => ({
        requestId: r.requestId,
        employeeId: r.employeeId,
        priority: r.priority,
        comment: r.comment ?? null,
        submittedAt: r.submittedAt instanceof Date ? r.submittedAt.toISOString() : String(r.submittedAt),
        firstName: r.firstName,
        lastName: r.lastName,
        shift: r.shift,
        seniorityDate: r.seniorityDate instanceof Date ? r.seniorityDate.toISOString() : String(r.seniorityDate),
        employeeNumber: r.employeeNumber,
      }));
    }),

  // ─── 21-Day Ceiling Tracker ──────────────────────────────────────────────────
  getCeilingTrackerData: publicProcedure
    .input(z.object({ year: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      await requireManagerOrAdmin(ctx);
      const year = input.year ?? new Date().getFullYear();
      const data = await getAllEmployeePeriodTotals(year);
      return {
        year,
        employees: data.map(emp => ({
          id: emp.id,
          firstName: emp.firstName,
          lastName: emp.lastName,
          shift: emp.shift,
          seniorityDate: emp.seniorityDate instanceof Date ? emp.seniorityDate.toISOString() : String(emp.seniorityDate),
          employeeNumber: emp.employeeNumber,
          isVerified: emp.isVerified,
          periodA: emp.periodA,
          periodB: emp.periodB,
          flagged: emp.periodA.overCeiling || emp.periodB.overCeiling,
        })),
        summary: {
          total: data.length,
          overCeilingA: data.filter(e => e.periodA.overCeiling).length,
          overCeilingB: data.filter(e => e.periodB.overCeiling).length,
          atWarningA: data.filter(e => e.periodA.atWarning).length,
          atWarningB: data.filter(e => e.periodB.atWarning).length,
        },
      };
    }),

  // ─── Decision Calendar ─────────────────────────────────────────────────────────
  // Month heatmap: returns per-date, per-shift counts for the calendar grid
  getDecisionCalendarMonth: publicProcedure
    .input(z.object({
      year: z.number(),
      month: z.number().min(1).max(12),
    }))
    .query(async ({ input, ctx }) => {
      await requireAdmin(ctx);
      const rows = await getDecisionCalendarMonth(input.year, input.month);
      const cap = 8;

      // Build date → shift map
      const dateMap: Record<string, {
        shift: string;
        count: number;
        approvedCount: number;
        pendingCount: number;
        deniedCount: number;
        decidedCount: number;
        overCap: boolean;
      }[]> = {};

      for (const row of rows) {
        // DATE_FORMAT in the SQL query guarantees row.date is already 'YYYY-MM-DD'
        const dateStr = String(row.date);
        if (!dateMap[dateStr]) dateMap[dateStr] = [];
        const count = Number(row.count);
        dateMap[dateStr].push({
          shift: row.shift,
          count,
          approvedCount: Number(row.approvedCount),
          pendingCount: Number(row.pendingCount),
          deniedCount: Number(row.deniedCount),
          decidedCount: Number(row.decidedCount ?? 0),
          overCap: count > cap,
        });
      }

      return {
        year: input.year,
        month: input.month,
        cap,
        dates: Object.entries(dateMap).map(([date, shifts]) => ({
          date,
          shifts,
          totalCount: shifts.reduce((s, x) => s + x.count, 0),
          decidedCount: shifts.reduce((s, x) => s + x.decidedCount, 0),
          isOverCap: shifts.some(s => s.overCap),
          allApproved: shifts.every(s => s.pendingCount === 0 && s.approvedCount > 0),
        })).sort((a, b) => a.date.localeCompare(b.date)),
      };
    }),

  // Day drill-down: returns all non-withdrawn vacation requests for a date,
  // with working_priority computed server-side using the same 5 rules.
  getDecisionCalendarDay: publicProcedure
    .input(z.object({
      date: z.string(), // "YYYY-MM-DD"
      shift: z.enum(["AM", "PM", "NOC"]).optional(),
    }))
    .query(async ({ input, ctx }) => {
      await requireAdmin(ctx);
      const cap = 8;
      const rows = await getDecisionCalendarDay(input.date, input.shift);

      // Compute working_priority server-side using the same 5 rules as the CSV script.
      // Group all rows by employee to determine their working_priority.
      // Note: rows here are only for this date; we need to know the employee's
      // full request set to apply the rules. We use the priority and submittedAt
      // from each row. Since we only have this date's requests, we apply a
      // simplified version: use the priority field directly as working_priority,
      // which matches what the CSV script computed (the CSV is the source of truth).
      // The full rule engine runs in the CSV script; here we just surface the
      // final_priority as working_priority (same result for the calendar view).
      //
      // For the calendar view, working_priority = priority (already computed by CSV).
      // Admins can cross-reference the CSV for the full picture.

      const enriched = rows.map((r, idx) => ({
        requestId: r.requestId,
        employeeId: r.employeeId,
        employeeNumber: r.employeeNumber,
        firstName: r.firstName,
        lastName: r.lastName,
        shift: r.shift,
        seniorityDate: r.seniorityDate instanceof Date ? r.seniorityDate.toISOString() : String(r.seniorityDate),
        isVerified: r.isVerified,
        requestType: r.requestType,
        continuityType: r.continuityType,
        priority: r.priority,
        status: r.status,
        submittedAt: r.submittedAt instanceof Date ? r.submittedAt.toISOString() : String(r.submittedAt),
        comment: r.comment ?? null,
        workingPriority: r.workingPriority ?? null,
        summerShutout: r.summerShutout ?? false,
        // Unit-wide seniority rank (1 = most senior across all active ICU staff)
        unitSeniorityRank: r.unitSeniorityRank ?? null,
        // Per-date decision (from request_date_decisions table)
        dateDecision: r.dateDecision ?? null,
        dateDecisionNote: r.dateDecisionNote ?? null,
        dateDecidedAt: r.dateDecidedAt ?? null,
        // Seniority rank within this date's results (1 = most senior)
        seniorityRank: idx + 1,
        // Over cap flag
        overCap: idx >= cap,
      }));

      // Group by shift for the UI
      const byShift: Record<string, typeof enriched> = {};
      for (const r of enriched) {
        if (!byShift[r.shift]) byShift[r.shift] = [];
        byShift[r.shift].push(r);
      }

      // Re-number seniority rank within each shift
      for (const shiftRows of Object.values(byShift)) {
        // Sort by priority ASC then seniorityDate ASC
        shiftRows.sort((a, b) => {
          // Sort by working_priority first (null = last), then seniority date
          const wpA = a.workingPriority ?? 9999;
          const wpB = b.workingPriority ?? 9999;
          if (wpA !== wpB) return wpA - wpB;
          return a.seniorityDate.localeCompare(b.seniorityDate);
        });
        // Assign ranks and cap flags.
        // Summer shut-out rows are always excluded from the cap count and ranked last.
        let capSlot = 0;
        shiftRows.forEach((r, i) => {
          r.seniorityRank = i + 1;
          if (r.summerShutout) {
            r.overCap = true; // shut-out rows are always over cap
          } else {
            r.overCap = capSlot >= cap;
            capSlot++;
          }
        });
      }

      return {
        date: input.date,
        shift: input.shift ?? "ALL",
        cap,
        requests: enriched,
        byShift,
        totalCount: enriched.length,
      };
    }),

  // ─── Per-Date Approve / Deny ────────────────────────────────────────────────────────────
  // Approve a single date of a request (does NOT approve the whole request)
  approveDateDecision: publicProcedure
    .input(z.object({
      requestId: z.number(),
      date: z.string(), // "YYYY-MM-DD"
      note: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const admin = await requireAdmin(ctx);
      await upsertDateDecision(input.requestId, input.date, "approved", admin.id, input.note);
      return { success: true };
    }),

  // Deny a single date of a request (does NOT deny the whole request)
  denyDateDecision: publicProcedure
    .input(z.object({
      requestId: z.number(),
      date: z.string(), // "YYYY-MM-DD"
      note: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const admin = await requireAdmin(ctx);
      await upsertDateDecision(input.requestId, input.date, "denied", admin.id, input.note);
      return { success: true };
    }),

  // Clear (undo) a per-date decision — resets the date back to undecided
  clearDateDecision: publicProcedure
    .input(z.object({
      requestId: z.number(),
      date: z.string(), // "YYYY-MM-DD"
    }))
    .mutation(async ({ input, ctx }) => {
      await requireAdmin(ctx);
      await clearDateDecision(input.requestId, input.date);
      return { success: true };
    }),

  // Bulk approve ALL dates of a request in one action
  bulkApproveDates: publicProcedure
    .input(z.object({
      requestId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const admin = await requireAdmin(ctx);
      await bulkApproveDates(input.requestId, admin.id);
      return { success: true };
    }),

  // ─── Enhanced Audit Log ────────────────────────────────────────────────────────────────
  getAuditLogEnhanced: publicProcedure
    .input(z.object({
      limit: z.number().min(1).max(500).default(50),
      offset: z.number().min(0).default(0),
      action: z.string().optional(),
      targetType: z.string().optional(),
      actorId: z.number().optional(),
      fromDate: z.string().optional(),
      toDate: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      await requireManagerOrAdmin(ctx);
      return getAuditLogWithActors(input);
    }),
});
