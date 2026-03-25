import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../_core/trpc";
import { verifyJwt } from "../_core/jwt";
import { COOKIE_NAME } from "../../shared/const";
import {
  getEmployeeById,
  getManagersAndAdmins,
  getAllEmployees,
  createRequest,
  getRequestsByEmployee,
  getRequestDates,
  getRequestById,
  updateRequest,
  countApprovedVacationDays,
  getBlackoutDates,
  getAllRequestsWithEmployees,
  logAudit,
} from "../db";
import {
  sendSubmissionConfirmation,
  sendStatusChangeEmail,
  sendWithdrawalManagerNotification,
  sendNewSubmissionManagerNotification,
} from "../email";

async function getAuthEmployee(ctx: any) {
  const token = ctx.req.cookies?.[COOKIE_NAME] || ctx.req.headers.authorization?.replace("Bearer ", "");
  if (!token) return null;
  try {
    const payload = await verifyJwt(token);
    if (!payload?.employeeId) return null;
    return getEmployeeById(payload.employeeId as number);
  } catch {
    return null;
  }
}

function formatDate(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export const requestsRouter = router({
  // Submit a new request
  submit: publicProcedure
    .input(z.object({
      requestType: z.enum(["vacation", "education"]),
      continuityType: z.enum(["continuous", "intermittent"]),
      priority: z.number().int().min(1).max(9).default(5),
      dates: z.array(z.string()).min(1).max(60),
      comment: z.string().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const emp = await getAuthEmployee(ctx);
      if (!emp) throw new TRPCError({ code: "UNAUTHORIZED" });

      // Check blackout dates
      const blackouts = await getBlackoutDates();
      const blackoutSet = new Set(blackouts.map(b => {
        const d = b.date instanceof Date ? b.date : new Date(b.date);
        return d.toISOString().split("T")[0];
      }));
      const blackoutConflicts = input.dates.filter(d => blackoutSet.has(d));
      if (blackoutConflicts.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot request blackout dates: ${blackoutConflicts.join(", ")}` });
      }

      // Validate 21-day vacation rule
      if (input.requestType === "vacation") {
        const today = new Date();
        const sixMonthsAgo = new Date(today);
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const sixMonthsAhead = new Date(today);
        sixMonthsAhead.setMonth(sixMonthsAhead.getMonth() + 6);

        // Check rolling 6-month window for each requested date
        for (const dateStr of input.dates) {
          const reqDate = new Date(dateStr);
          const windowStart = new Date(reqDate);
          windowStart.setMonth(windowStart.getMonth() - 6);
          const windowEnd = new Date(reqDate);
          windowEnd.setMonth(windowEnd.getMonth() + 6);

          const existing = await countApprovedVacationDays(
            emp.id,
            windowStart.toISOString().split("T")[0],
            windowEnd.toISOString().split("T")[0]
          );
          if (existing + input.dates.length > 21) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `This request would exceed the 21-day vacation limit in a rolling 6-month period. You currently have ${existing} days in this window.`,
            });
          }
          break; // Check once is sufficient for the batch
        }
      }

      const requestId = await createRequest(
        {
          employeeId: emp.id,
          requestType: input.requestType,
          continuityType: input.continuityType,
          priority: input.priority,
          comment: input.comment,
          status: "pending",
          submittedAt: new Date(),
        },
        input.dates
      );

      const formattedDates = input.dates.map(formatDate);

      // Send confirmation to employee
      await sendSubmissionConfirmation(emp.email, emp.firstName, input.requestType, formattedDates, "pending");

      // Notify managers
      const managers = await getManagersAndAdmins();
      for (const mgr of managers) {
        if (mgr.id !== emp.id) {
          await sendNewSubmissionManagerNotification(
            mgr.email, mgr.firstName,
            `${emp.firstName} ${emp.lastName}`,
            input.requestType, formattedDates
          );
        }
      }

      await logAudit({
        actorId: emp.id,
        action: "submit",
        targetType: "request",
        targetId: String(requestId),
        details: { requestType: input.requestType, dates: input.dates },
      });

      return { success: true, requestId };
    }),

  // Get my requests
   myRequests: publicProcedure.query(async ({ ctx }) => {
    const emp = await getAuthEmployee(ctx);
    if (!emp) throw new TRPCError({ code: "UNAUTHORIZED" });
    const reqs = await getRequestsByEmployee(emp.id);

    // Compute seniority-based priority rank among all active employees in the same shift
    // Priority = position when all employees in shift are sorted by seniorityDate asc, then submittedAt asc
    const allEmployees = await getAllEmployees();
    const shiftEmployees = allEmployees
      .filter(e => e.shift === emp.shift && e.isActive)
      .sort((a, b) => {
        const sa = a.seniorityDate instanceof Date ? a.seniorityDate : new Date(a.seniorityDate);
        const sb = b.seniorityDate instanceof Date ? b.seniorityDate : new Date(b.seniorityDate);
        return sa.getTime() - sb.getTime();
      });
    const shiftPriority = shiftEmployees.findIndex(e => e.id === emp.id) + 1;
    const totalInShift = shiftEmployees.length;

    const result = [];
    for (const req of reqs) {
      const dates = await getRequestDates(req.id);
      result.push({
        ...req,
        dates: dates.map(d => {
          const date = d.date instanceof Date ? d.date : new Date(d.date);
          return date.toISOString().split("T")[0];
        }),
        seniorityDate: emp.seniorityDate,
        shiftPriority,
        totalInShift,
      });
    }
    return result;
  }),

  // Resend confirmation email for a request
  resendConfirmation: publicProcedure
    .input(z.object({ requestId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const emp = await getAuthEmployee(ctx);
      if (!emp) throw new TRPCError({ code: "UNAUTHORIZED" });

      const req = await getRequestById(input.requestId);
      if (!req) throw new TRPCError({ code: "NOT_FOUND" });
      if (req.employeeId !== emp.id) throw new TRPCError({ code: "FORBIDDEN" });

      const dates = await getRequestDates(input.requestId);
      const formattedDates = dates.map(d => formatDate(d.date));

      if (req.status === "pending") {
        await sendSubmissionConfirmation(emp.email, emp.firstName, req.requestType, formattedDates, "pending");
      } else {
        await sendStatusChangeEmail(
          emp.email, emp.firstName, req.requestType,
          formattedDates, req.status,
          (req as any).decisionNote ?? undefined
        );
      }

      await logAudit({
        actorId: emp.id,
        action: "resend_confirmation",
        targetType: "request",
        targetId: String(input.requestId),
        details: { status: req.status },
      });

      return { success: true };
    }),

  // Withdraw a request
  withdraw: publicProcedure
    .input(z.object({ requestId: z.number(), reason: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const emp = await getAuthEmployee(ctx);
      if (!emp) throw new TRPCError({ code: "UNAUTHORIZED" });

      const req = await getRequestById(input.requestId);
      if (!req) throw new TRPCError({ code: "NOT_FOUND" });
      if (req.employeeId !== emp.id) throw new TRPCError({ code: "FORBIDDEN" });
      if (req.status === "withdrawn") throw new TRPCError({ code: "BAD_REQUEST", message: "Already withdrawn" });

      const wasApproved = req.status === "approved";
      const priorStatus = req.status;

      await updateRequest(input.requestId, {
        status: "withdrawn",
        priorStatus,
        withdrawnAt: new Date(),
      });

      const dates = await getRequestDates(input.requestId);
      const formattedDates = dates.map(d => formatDate(d.date));

      // Send withdrawal confirmation to employee
      await sendStatusChangeEmail(emp.email, emp.firstName, req.requestType, formattedDates, "withdrawn");

      // If was approved, notify managers
      if (wasApproved) {
        const managers = await getManagersAndAdmins();
        for (const mgr of managers) {
          await sendWithdrawalManagerNotification(
            mgr.email, mgr.firstName,
            `${emp.firstName} ${emp.lastName}`,
            req.requestType, formattedDates
          );
        }
      }

      await logAudit({
        actorId: emp.id,
        action: "withdraw",
        targetType: "request",
        targetId: String(input.requestId),
        details: { priorStatus, wasApproved },
      });

      return { success: true };
    }),
});
