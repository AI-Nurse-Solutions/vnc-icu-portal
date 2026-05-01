import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "../../shared/const";
import { verifyJwt } from "../_core/jwt";
import { publicProcedure, router } from "../_core/trpc";
import {
  addBlackoutDate,
  deleteSubmissionDeadline,
  getAllConfig,
  getBlackoutDates,
  getEmployeeById,
  getSubmissionDeadlines,
  logAudit,
  removeBlackoutDate,
  setConfig,
  upsertSubmissionDeadline,
} from "../db";

async function requireManagerOrAdmin(ctx: any) {
  const token = ctx.req.cookies?.[COOKIE_NAME] || ctx.req.headers.authorization?.replace("Bearer ", "");
  if (!token) throw new TRPCError({ code: "UNAUTHORIZED" });
  const payload = await verifyJwt(token);
  if (!payload?.employeeId) throw new TRPCError({ code: "UNAUTHORIZED" });
  const emp = await getEmployeeById(payload.employeeId as number);
  if (!emp || (emp.role !== "manager" && emp.role !== "admin" && emp.role !== "super_admin")) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return emp;
}

export const configRouter = router({
  getAll: publicProcedure.query(async () => {
    return getAllConfig();
  }),

  setCapacity: publicProcedure
    .input(z.object({
      capAM: z.number().min(1).max(50),
      capPM: z.number().min(1).max(50),
      capNOC: z.number().min(1).max(50),
      yellowThreshold: z.number().min(1).max(50),
      redThreshold: z.number().min(1).max(50),
    }))
    .mutation(async ({ input, ctx }) => {
      const mgr = await requireManagerOrAdmin(ctx);
      await setConfig("cap_am", String(input.capAM), mgr.id);
      await setConfig("cap_pm", String(input.capPM), mgr.id);
      await setConfig("cap_noc", String(input.capNOC), mgr.id);
      await setConfig("color_yellow_threshold", String(input.yellowThreshold), mgr.id);
      await setConfig("color_red_threshold", String(input.redThreshold), mgr.id);
      await logAudit({ actorId: mgr.id, action: "config_change", targetType: "config", targetId: "capacity", details: input });
      return { success: true };
    }),

  addBlackout: publicProcedure
    .input(z.object({ date: z.string(), reason: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const mgr = await requireManagerOrAdmin(ctx);
      await addBlackoutDate({ date: new Date(input.date), reason: input.reason, createdBy: mgr.id });
      await logAudit({ actorId: mgr.id, action: "config_change", targetType: "blackout_date", targetId: input.date, details: { reason: input.reason } });
      return { success: true };
    }),

  removeBlackout: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const mgr = await requireManagerOrAdmin(ctx);
      await removeBlackoutDate(input.id);
      await logAudit({ actorId: mgr.id, action: "config_change", targetType: "blackout_date", targetId: String(input.id), details: { action: "remove" } });
      return { success: true };
    }),

  getBlackouts: publicProcedure.query(async () => {
    const rows = await getBlackoutDates();
    return rows.map(b => ({
      id: b.id,
      date: b.date instanceof Date ? b.date.toISOString().split("T")[0] : String(b.date).split("T")[0],
      reason: b.reason,
    }));
  }),

  getDeadlines: publicProcedure.query(async () => {
    const rows = await getSubmissionDeadlines();
    return rows.map(d => ({
      id: d.id,
      deadlineDate: d.deadlineDate instanceof Date ? d.deadlineDate.toISOString().split("T")[0] : String(d.deadlineDate).split("T")[0],
      coverageStart: d.coverageStart instanceof Date ? d.coverageStart.toISOString().split("T")[0] : String(d.coverageStart).split("T")[0],
      coverageEnd: d.coverageEnd instanceof Date ? d.coverageEnd.toISOString().split("T")[0] : String(d.coverageEnd).split("T")[0],
      year: d.year,
    }));
  }),

  addDeadline: publicProcedure
    .input(z.object({
      deadlineDate: z.string(),
      coverageStart: z.string(),
      coverageEnd: z.string(),
      year: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const mgr = await requireManagerOrAdmin(ctx);
      await upsertSubmissionDeadline({
        deadlineDate: new Date(input.deadlineDate),
        coverageStart: new Date(input.coverageStart),
        coverageEnd: new Date(input.coverageEnd),
        year: input.year,
        createdBy: mgr.id,
      });
      await logAudit({ actorId: mgr.id, action: "config_change", targetType: "deadline", targetId: input.deadlineDate, details: input });
      return { success: true };
    }),

  removeDeadline: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const mgr = await requireManagerOrAdmin(ctx);
      await deleteSubmissionDeadline(input.id);
      await logAudit({ actorId: mgr.id, action: "config_change", targetType: "deadline", targetId: String(input.id), details: { action: "remove" } });
      return { success: true };
    }),
});
