import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "../../shared/const";
import { verifyJwt } from "../_core/jwt";
import { publicProcedure, router } from "../_core/trpc";
import {
  getEmployeeById,
  getRecentRequestsForAdmin,
  getPendingDecisionDates,
  getRequestorHistory,
} from "../db";
import nodemailer from "nodemailer";

async function sendRawEmail(to: string, subject: string, html: string): Promise<boolean> {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;
  if (!user || !pass) {
    console.log(`[Email MOCK] To: ${to} | Subject: ${subject}`);
    return true;
  }
  try {
    const t = nodemailer.createTransport({ host: "smtp.gmail.com", port: 587, secure: false, auth: { user, pass }, tls: { rejectUnauthorized: false } });
    await t.sendMail({ from: `"VNC ICU Portal" <${user}>`, to, subject, html });
    return true;
  } catch (e) {
    console.error("[Email] Failed:", e);
    return false;
  }
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

export const adminLandingRouter = router({
  /** Section A: Recent requests (last 30, sorted by submission date) */
  getRecentRequests: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(30) }).optional())
    .query(async ({ input, ctx }) => {
      await requireAdmin(ctx);
      return getRecentRequestsForAdmin(input?.limit ?? 30);
    }),

  /** Section B: Pending decision dates */
  getPendingDates: publicProcedure
    .input(z.object({
      startDate: z.string().optional(), // YYYY-MM-DD
      endDate: z.string().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      await requireAdmin(ctx);
      return getPendingDecisionDates(input?.startDate, input?.endDate);
    }),

  /** Requestor History modal */
  getRequestorHistory: publicProcedure
    .input(z.object({ employeeId: z.number() }))
    .query(async ({ input, ctx }) => {
      await requireAdmin(ctx);
      return getRequestorHistory(input.employeeId);
    }),

  /** Admin → Superadmin message */
  sendMessageToSuperadmin: publicProcedure
    .input(z.object({
      subject: z.string().max(200).optional(),
      message: z.string().min(1).max(5000),
    }))
    .mutation(async ({ input, ctx }) => {
      const admin = await requireAdmin(ctx);
      // Find superadmin email
      const { getDb } = await import("../db");
      const { employees: empTable } = await import("../../drizzle/schema");
      const { sql } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const superAdmins = await db.select().from(empTable).where(sql`${empTable.role} = 'super_admin'`);
      if (!superAdmins.length) throw new TRPCError({ code: "NOT_FOUND", message: "No superadmin found" });

      const subject = input.subject ? `[VNC ICU Portal] ${input.subject}` : "[VNC ICU Portal] Message from Admin";
      const html = `
        <div style="font-family: sans-serif; background: #0F172A; color: #F1F5F9; padding: 24px; border-radius: 8px; max-width: 600px;">
          <h2 style="color: #06B6D4; margin-bottom: 8px;">Message from Admin</h2>
          <p style="color: #94A3B8; font-size: 14px; margin-bottom: 16px;">
            From: <strong style="color: #F1F5F9;">${admin.firstName} ${admin.lastName}</strong>
            (${admin.email}) — ${new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })} PT
          </p>
          ${input.subject ? `<p style="color: #CBD5E1; font-weight: 600; margin-bottom: 8px;">Subject: ${input.subject}</p>` : ""}
          <div style="background: #1E293B; border-radius: 6px; padding: 16px; white-space: pre-wrap; color: #E2E8F0; line-height: 1.6;">
${input.message}
          </div>
          <p style="color: #64748B; font-size: 12px; margin-top: 16px;">Sent via VNC ICU Portal Admin Landing Page</p>
        </div>
      `;

      let sent = false;
      for (const sa of superAdmins) {
        const ok = await sendRawEmail(sa.email, subject, html);
        if (ok) sent = true;
      }
      return { success: sent };
    }),
});
