import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "../../shared/const";
import { verifyJwt } from "../_core/jwt";
import { publicProcedure, router } from "../_core/trpc";
import {
  getAllEmployeePeriodTotals,
  getAuditLogWithActors,
  getEmployeeById,
  getHotDateDrillDown,
  getHotDatesData,
  getPendingRequestsForApprovalRun,
  getRequestDates,
} from "../db";

async function requireManagerOrAdmin(ctx: any) {
  const token = ctx.req.cookies?.[COOKIE_NAME] || ctx.req.headers.authorization?.replace("Bearer ", "");
  if (!token) throw new TRPCError({ code: "UNAUTHORIZED" });
  const payload = await verifyJwt(token);
  if (!payload?.employeeId) throw new TRPCError({ code: "UNAUTHORIZED" });
  const emp = await getEmployeeById(payload.employeeId as number);
  if (!emp || (emp.role !== "manager" && emp.role !== "admin")) {
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
  if (!emp || emp.role !== "admin") {
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

  // ─── Enhanced Audit Log ──────────────────────────────────────────────────────
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
