import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "../../shared/const";
import { verifyJwt } from "../_core/jwt";
import { publicProcedure, router } from "../_core/trpc";
import {
  getAllEmployees,
  getAllRequestsWithEmployees,
  getApprovedRequestsForExport,
  getEmployeeByEmployeeNumber,
  getEmployeeById,
  getRequestById,
  getRequestDates,
  logAudit,
  updateEmployee,
  updateRequest,
} from "../db";
import { sendStatusChangeEmail } from "../email";

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

function formatDate(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export const managerRouter = router({
  // Get all requests with employee info for manager review
  getAllRequests: publicProcedure
    .input(z.object({
      status: z.array(z.enum(["pending", "approved", "denied", "withdrawn"])).optional(),
      shift: z.enum(["AM", "PM", "NOC"]).optional(),
      requestType: z.enum(["vacation", "education"]).optional(),
    }))
    .query(async ({ input, ctx }) => {
      await requireManagerOrAdmin(ctx);

      let reqs = await getAllRequestsWithEmployees(input.status as string[] | undefined);

      if (input.shift) reqs = reqs.filter(r => r.shift === input.shift);
      if (input.requestType) reqs = reqs.filter(r => r.requestType === input.requestType);

      // Attach dates to each request
      const result = [];
      for (const req of reqs) {
        const dates = await getRequestDates(req.requestId);
        result.push({
          ...req,
          dates: dates.map(d => {
            const date = d.date instanceof Date ? d.date : new Date(d.date);
            return date.toISOString().split("T")[0];
          }),
        });
      }
      return result;
    }),

  // Get requests for a specific date, shift — seniority ranked
  getDayRequests: publicProcedure
    .input(z.object({ date: z.string(), shift: z.enum(["AM", "PM", "NOC"]) }))
    .query(async ({ input, ctx }) => {
      await requireManagerOrAdmin(ctx);

      const { getRequestsForDateRange } = await import("../db");
      const rows = await getRequestsForDateRange(input.date, input.date);
      const shiftRows = rows.filter(r => r.shift === input.shift && r.status !== "withdrawn");

      shiftRows.sort((a, b) => {
        const sa = a.seniorityDate instanceof Date ? a.seniorityDate : new Date(a.seniorityDate);
        const sb = b.seniorityDate instanceof Date ? b.seniorityDate : new Date(b.seniorityDate);
        if (sa.getTime() !== sb.getTime()) return sa.getTime() - sb.getTime();
        const ta = a.submittedAt instanceof Date ? a.submittedAt : new Date(a.submittedAt);
        const tb = b.submittedAt instanceof Date ? b.submittedAt : new Date(b.submittedAt);
        return ta.getTime() - tb.getTime();
      });

      return shiftRows.map((r, idx) => ({
        rank: idx + 1,
        requestId: r.requestId,
        employeeId: r.employeeId,
        displayName: `${r.firstName} ${r.lastName}`,
        requestType: r.requestType,
        status: r.status,
        seniorityDate: r.seniorityDate,
        submittedAt: r.submittedAt,
        comment: r.comment,
      }));
    }),

  // Approve a request
  approve: publicProcedure
    .input(z.object({ requestId: z.number(), note: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const manager = await requireManagerOrAdmin(ctx);

      const req = await getRequestById(input.requestId);
      if (!req) throw new TRPCError({ code: "NOT_FOUND" });
      if (req.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Request is not pending" });

      await updateRequest(input.requestId, {
        status: "approved",
        decidedAt: new Date(),
        decidedBy: manager.id,
        decisionNote: input.note,
      });

      const emp = await getEmployeeById(req.employeeId);
      if (emp) {
        const dates = await getRequestDates(input.requestId);
        await sendStatusChangeEmail(
          emp.email, emp.firstName, req.requestType,
          dates.map(d => formatDate(d.date)), "approved", input.note
        );
      }

      await logAudit({
        actorId: manager.id,
        action: "approve",
        targetType: "request",
        targetId: String(input.requestId),
        details: { note: input.note },
      });

      return { success: true };
    }),

  // Deny a request
  deny: publicProcedure
    .input(z.object({ requestId: z.number(), note: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const manager = await requireManagerOrAdmin(ctx);

      const req = await getRequestById(input.requestId);
      if (!req) throw new TRPCError({ code: "NOT_FOUND" });
      if (req.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Request is not pending" });

      await updateRequest(input.requestId, {
        status: "denied",
        decidedAt: new Date(),
        decidedBy: manager.id,
        decisionNote: input.note,
      });

      const emp = await getEmployeeById(req.employeeId);
      if (emp) {
        const dates = await getRequestDates(input.requestId);
        await sendStatusChangeEmail(
          emp.email, emp.firstName, req.requestType,
          dates.map(d => formatDate(d.date)), "denied", input.note
        );
      }

      await logAudit({
        actorId: manager.id,
        action: "deny",
        targetType: "request",
        targetId: String(input.requestId),
        details: { note: input.note },
      });

      return { success: true };
    }),

  // Verify employee: manager sets official employee number + seniority date
  verifyEmployee: publicProcedure
    .input(z.object({
      id: z.number(),
      employeeNumber: z.string().min(1),
      seniorityDate: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const manager = await requireManagerOrAdmin(ctx);
      const existing = await getEmployeeByEmployeeNumber(input.employeeNumber);
      if (existing && existing.id !== input.id) {
        throw new TRPCError({ code: "CONFLICT", message: "That employee number is already assigned to another employee." });
      }
      await updateEmployee(input.id, {
        employeeNumber: input.employeeNumber,
        seniorityDate: new Date(input.seniorityDate),
        isVerified: true,
      });
      await logAudit({
        actorId: manager.id,
        action: "verify_employee",
        targetType: "employee",
        targetId: String(input.id),
        details: { employeeNumber: input.employeeNumber, seniorityDate: input.seniorityDate },
      });
      return { success: true };
    }),

  // List all employees (for manager verification view)
  listEmployees: publicProcedure.query(async ({ ctx }) => {
    await requireManagerOrAdmin(ctx);
    const emps = await getAllEmployees();
    return emps.map(e => ({
      id: e.id,
      employeeNumber: e.employeeNumber,
      firstName: e.firstName,
      lastName: e.lastName,
      email: e.email,
      shift: e.shift,
      role: e.role,
      seniorityDate: e.seniorityDate instanceof Date ? e.seniorityDate.toISOString().split("T")[0] : String(e.seniorityDate).split("T")[0],
      isActive: e.isActive,
      isVerified: e.isVerified,
    }));
  }),

  // Export requests to CSV data — supports pending and approved status filters
  exportApproved: publicProcedure
    .input(z.object({
      startDate: z.string(),
      endDate: z.string(),
      shift: z.enum(["AM", "PM", "NOC"]).optional(),
      requestType: z.enum(["vacation", "education"]).optional(),
      statuses: z.array(z.enum(["pending", "approved", "denied", "withdrawn"])).optional(),
    }))
    .query(async ({ input, ctx }) => {
      await requireManagerOrAdmin(ctx);
      const manager = await requireManagerOrAdmin(ctx);

      const rows = await getApprovedRequestsForExport(
        input.startDate, input.endDate,
        input.shift, input.requestType, input.statuses
      );

      await logAudit({
        actorId: manager.id,
        action: "csv_export",
        targetType: "request",
        targetId: "bulk",
        details: { startDate: input.startDate, endDate: input.endDate, shift: input.shift, requestType: input.requestType, statuses: input.statuses, rowCount: rows.length },
      });

      // Compute per-date seniority rank within each shift
      // Group rows by date+shift, sort by seniorityDate ascending, assign rank
      const dateShiftGroups: Record<string, typeof rows> = {};
      for (const r of rows) {
        const dateStr = r.date instanceof Date ? r.date.toISOString().split("T")[0] : String(r.date).split("T")[0];
        const key = `${dateStr}|${r.shift}`;
        if (!dateShiftGroups[key]) dateShiftGroups[key] = [];
        dateShiftGroups[key].push(r);
      }
      // Sort each group by seniority date ascending (most senior = rank 1)
      for (const key of Object.keys(dateShiftGroups)) {
        dateShiftGroups[key].sort((a, b) => {
          const sa = a.seniorityDate instanceof Date ? a.seniorityDate : new Date(a.seniorityDate ?? 0);
          const sb = b.seniorityDate instanceof Date ? b.seniorityDate : new Date(b.seniorityDate ?? 0);
          return sa.getTime() - sb.getTime();
        });
      }
      // Build rank lookup: employeeNumber+date+shift -> rank
      const rankMap: Record<string, number> = {};
      for (const [, group] of Object.entries(dateShiftGroups)) {
        group.forEach((r, idx) => {
          const dateStr = r.date instanceof Date ? r.date.toISOString().split("T")[0] : String(r.date).split("T")[0];
          const rankKey = `${r.employeeNumber}|${dateStr}|${r.shift}`;
          rankMap[rankKey] = idx + 1;
        });
      }
      return rows.map(r => {
        const dateStr = r.date instanceof Date ? r.date.toISOString().split("T")[0] : String(r.date).split("T")[0];
        const rankKey = `${r.employeeNumber}|${dateStr}|${r.shift}`;
        return {
          employee_number: r.employeeNumber,
          employee_name: `${r.firstName} ${r.lastName}`,
          shift: r.shift,
          seniority_date: r.seniorityDate instanceof Date
            ? r.seniorityDate.toISOString().split("T")[0]
            : String(r.seniorityDate ?? "").split("T")[0],
          request_type: r.requestType,
          priority: r.priority ?? 1,
          date: dateStr,
          seniority_rank_on_date: rankMap[rankKey] ?? "",
          status: r.status,
          decided_date: r.decidedAt
            ? (r.decidedAt instanceof Date ? r.decidedAt.toISOString() : String(r.decidedAt))
            : "",
        };
      });
    }),

  // Submit a granular decision: per-date approve/deny with admin note
  submitDecision: publicProcedure
    .input(z.object({
      requestId: z.number(),
      // Array of { dateId, date, decision } — decision is 'approved' | 'denied' | 'pending'
      dateDecisions: z.array(z.object({
        dateId: z.number(),
        date: z.string(),
        decision: z.enum(["approved", "denied", "pending"]),
      })),
      note: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const manager = await requireManagerOrAdmin(ctx);

      const req = await getRequestById(input.requestId);
      if (!req) throw new TRPCError({ code: "NOT_FOUND" });
      if (req.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Request is not pending" });

      const { deleteRequestDate } = await import("../db");

      const approvedDates: string[] = [];
      const deniedDates: string[] = [];
      const pendingDates: string[] = [];

      for (const dd of input.dateDecisions) {
        if (dd.decision === "denied") {
          await deleteRequestDate(dd.dateId);
          deniedDates.push(dd.date);
        } else if (dd.decision === "approved") {
          approvedDates.push(dd.date);
        } else {
          pendingDates.push(dd.date);
        }
      }

      // Determine overall request status
      // If all decided dates are denied and no pending remain → denied
      // If any approved and no pending remain → approved (partial or full)
      // If pending remain → still pending (partial decision not final)
      let newStatus: "approved" | "denied" | "pending" = "pending";
      if (pendingDates.length === 0) {
        if (approvedDates.length === 0) {
          newStatus = "denied";
        } else {
          newStatus = "approved";
        }
      }

      if (newStatus !== "pending") {
        const partialNote = deniedDates.length > 0 && approvedDates.length > 0
          ? `Partial approval: ${approvedDates.length} date(s) approved, ${deniedDates.length} date(s) denied.${input.note ? " " + input.note : ""}`
          : input.note;

        await updateRequest(input.requestId, {
          status: newStatus,
          decidedAt: new Date(),
          decidedBy: manager.id,
          decisionNote: partialNote,
        });

        const emp = await getEmployeeById(req.employeeId);
        if (emp) {
          const emailDates = approvedDates.length > 0 ? approvedDates : deniedDates;
          const emailStatus = newStatus;
          await sendStatusChangeEmail(
            emp.email, emp.firstName, req.requestType,
            emailDates.map(d => formatDate(d)), emailStatus, partialNote
          );
        }

        await logAudit({
          actorId: manager.id,
          action: `submit_decision_${newStatus}`,
          targetType: "request",
          targetId: String(input.requestId),
          details: { approved: approvedDates, denied: deniedDates, note: input.note },
        });
      }

      return { success: true, newStatus, approvedCount: approvedDates.length, deniedCount: deniedDates.length, pendingCount: pendingDates.length };
    }),

  // Get Period A and Period B vacation day counts for a specific employee
  // Get a single request with its dates (including date IDs) for the review UI
  getRequestDetail: publicProcedure
    .input(z.object({ requestId: z.number() }))
    .query(async ({ input, ctx }) => {
      await requireManagerOrAdmin(ctx);
      const { getRequestById, getRequestDates } = await import("../db");
      const req = await getRequestById(input.requestId);
      if (!req) throw new TRPCError({ code: "NOT_FOUND" });
      const dates = await getRequestDates(input.requestId);
      return {
        ...req,
        dates: dates.map(d => ({
          id: d.id,
          date: d.date instanceof Date ? d.date.toISOString().split("T")[0] : String(d.date),
        })),
      };
    }),

  getEmployeePeriodCounts: publicProcedure
    .input(z.object({ employeeId: z.number() }))
    .query(async ({ input, ctx }) => {
      await requireManagerOrAdmin(ctx);
      const { countApprovedVacationDays } = await import("../db");
      const year = new Date().getFullYear();
      const [periodA, periodB] = await Promise.all([
        countApprovedVacationDays(input.employeeId, `${year}-01-01`, `${year}-06-30`),
        countApprovedVacationDays(input.employeeId, `${year}-07-01`, `${year}-12-31`),
      ]);
      return { year, periodA, periodB };
    }),

  // Full leave history for an employee — all requests with their dates
  getEmployeeLeaveHistory: publicProcedure
    .input(z.object({ employeeId: z.number() }))
    .query(async ({ input, ctx }) => {
      await requireManagerOrAdmin(ctx);
      const { getRequestsByEmployee, getRequestDates } = await import("../db");
      const allRequests = await getRequestsByEmployee(input.employeeId);
      const result = [];
      for (const req of allRequests) {
        const dates = await getRequestDates(req.id);
        const sortedDates = dates
          .map(d => (d.date instanceof Date ? d.date.toISOString().split("T")[0] : String(d.date)))
          .sort();
        const year = sortedDates[0] ? parseInt(sortedDates[0].split("-")[0]) : new Date().getFullYear();
        const month = sortedDates[0] ? parseInt(sortedDates[0].split("-")[1]) : 1;
        const period = month <= 6 ? "A (Jan–Jun)" : "B (Jul–Dec)";
        result.push({
          requestId: req.id,
          requestType: req.requestType,
          continuityType: req.continuityType,
          status: req.status,
          priority: req.priority,
          submittedAt: req.submittedAt instanceof Date ? req.submittedAt.toISOString() : String(req.submittedAt),
          decidedAt: req.decidedAt ? (req.decidedAt instanceof Date ? req.decidedAt.toISOString() : String(req.decidedAt)) : null,
          decisionNote: req.decisionNote ?? null,
          totalDays: sortedDates.length,
          dateRange: sortedDates.length > 0
            ? sortedDates.length === 1
              ? sortedDates[0]
              : `${sortedDates[0]} → ${sortedDates[sortedDates.length - 1]}`
            : "No dates",
          dates: sortedDates,
          year,
          period,
        });
      }
      return result;
    }),

  // Export all employees as CSV-ready rows
  exportEmployees: publicProcedure
    .input(z.object({
      shift: z.enum(["AM", "PM", "NOC"]).optional(),
      role: z.enum(["employee", "manager", "admin", "super_admin"]).optional(),
      category: z.enum(["icu", "ancillary"]).optional(),
      activeOnly: z.boolean().default(true),
    }))
    .query(async ({ input, ctx }) => {
      await requireManagerOrAdmin(ctx);
      const emps = await getAllEmployees();
      let filtered = emps;
      if (input.activeOnly) filtered = filtered.filter(e => e.isActive);
      if (input.shift) filtered = filtered.filter(e => e.shift === input.shift);
      if (input.role) filtered = filtered.filter(e => e.role === input.role);
      if (input.category) filtered = filtered.filter(e => (e as any).category === input.category);
      // Sort by seniority date ascending (most senior first)
      filtered.sort((a, b) => {
        const sa = a.seniorityDate instanceof Date ? a.seniorityDate : new Date(a.seniorityDate);
        const sb = b.seniorityDate instanceof Date ? b.seniorityDate : new Date(b.seniorityDate);
        return sa.getTime() - sb.getTime();
      });
      return filtered.map((e, idx) => ({
        seniority_rank: idx + 1,
        employee_number: e.employeeNumber ?? "",
        first_name: e.firstName,
        last_name: e.lastName,
        email: e.email,
        shift: e.shift,
        role: e.role,
        category: (e as any).category ?? "icu",
        seniority_date: e.seniorityDate instanceof Date ? e.seniorityDate.toISOString().split("T")[0] : String(e.seniorityDate).split("T")[0],
        is_active: e.isActive ? "yes" : "no",
        is_verified: e.isVerified ? "yes" : "no",
      }));
    }),
});
