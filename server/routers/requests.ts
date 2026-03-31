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

  // Update priority of a pending request (employee only)
  updatePriority: publicProcedure
    .input(z.object({ requestId: z.number(), priority: z.number().int().min(1).max(9) }))
    .mutation(async ({ input, ctx }) => {
      const emp = await getAuthEmployee(ctx);
      if (!emp) throw new TRPCError({ code: "UNAUTHORIZED" });

      const req = await getRequestById(input.requestId);
      if (!req) throw new TRPCError({ code: "NOT_FOUND" });
      if (req.employeeId !== emp.id) throw new TRPCError({ code: "FORBIDDEN" });
      if (req.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Priority can only be changed on pending requests." });

      await updateRequest(input.requestId, { priority: input.priority });

      await logAudit({
        actorId: emp.id,
        action: "update_priority",
        targetType: "request",
        targetId: String(input.requestId),
        details: { priority: input.priority },
      });

      return { success: true };
    }),

  // Get vacation day counts for Period A (Jan–Jun) and Period B (Jul–Dec) of the current year
  periodDayCounts: publicProcedure.query(async ({ ctx }) => {
    const emp = await getAuthEmployee(ctx);
    if (!emp) throw new TRPCError({ code: "UNAUTHORIZED" });

    const year = new Date().getFullYear();
    const periodA_start = `${year}-01-01`;
    const periodA_end   = `${year}-06-30`;
    const periodB_start = `${year}-07-01`;
    const periodB_end   = `${year}-12-31`;

    const [periodA, periodB] = await Promise.all([
      countApprovedVacationDays(emp.id, periodA_start, periodA_end),
      countApprovedVacationDays(emp.id, periodB_start, periodB_end),
    ]);

    return { year, periodA, periodB };
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
