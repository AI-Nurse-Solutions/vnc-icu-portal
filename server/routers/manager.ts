import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "../../shared/const";
import { verifyJwt } from "../_core/jwt";
import { publicProcedure, router } from "../_core/trpc";
import {
  getAllRequestsWithEmployees,
  getApprovedRequestsForExport,
  getEmployeeById,
  getRequestById,
  getRequestDates,
  logAudit,
  updateRequest,
} from "../db";
import { sendStatusChangeEmail } from "../email";

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

      return rows.map(r => ({
        employee_number: r.employeeNumber,
        employee_name: `${r.firstName} ${r.lastName}`,
        shift: r.shift,
        request_type: r.requestType,
        date: r.date instanceof Date ? r.date.toISOString().split("T")[0] : String(r.date).split("T")[0],
        status: r.status,
        decided_date: r.decidedAt ? (r.decidedAt instanceof Date ? r.decidedAt.toISOString() : String(r.decidedAt)) : "",
      }));
    }),
});
