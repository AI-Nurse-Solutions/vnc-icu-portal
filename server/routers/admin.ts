import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { COOKIE_NAME } from "../../shared/const";
import { verifyJwt } from "../_core/jwt";
import { publicProcedure, router } from "../_core/trpc";
import {
  createEmployee,
  getAllEmployees,
  getAuditLog,
  getEmployeeByEmail,
  getEmployeeByEmployeeNumber,
  getEmployeeById,
  logAudit,
  updateEmployee,
} from "../db";
import { sendInviteEmail } from "../email";

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

export const adminRouter = router({
  // List all employees
  listEmployees: publicProcedure.query(async ({ ctx }) => {
    await requireAdmin(ctx);
    const emps = await getAllEmployees();
    return emps.map(e => ({
      id: e.id,
      employeeNumber: e.employeeNumber,
      firstName: e.firstName,
      lastName: e.lastName,
      email: e.email,
      shift: e.shift,
      role: e.role,
      category: (e as any).category ?? "icu",
      seniorityDate: e.seniorityDate instanceof Date ? e.seniorityDate.toISOString().split("T")[0] : String(e.seniorityDate).split("T")[0],
      isActive: e.isActive,
      isVerified: e.isVerified,
    }));
  }),

  // Invite a new employee
  inviteEmployee: publicProcedure
    .input(z.object({
      employeeNumber: z.string(),
      firstName: z.string(),
      lastName: z.string(),
      email: z.string().email(),
      shift: z.enum(["AM", "PM", "NOC"]),
      seniorityDate: z.string(),
      role: z.enum(["employee", "manager", "admin", "super_admin"]).default("employee"),
      category: z.enum(["icu", "ancillary"]).default("icu"),
      origin: z.string(),
      password: z.string().min(8).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const admin = await requireAdmin(ctx);
      const bcrypt = await import("bcryptjs");

      let passwordHash: string | undefined;
      let isActive = false;
      let inviteToken: string | undefined;
      let inviteTokenExpiresAt: Date | undefined;

      if (input.password) {
        // Password provided — hash it and activate the account immediately
        passwordHash = await bcrypt.hash(input.password, 12);
        isActive = true;
      } else {
        // No password — send invite email so employee can set their own
        inviteToken = nanoid(48);
        inviteTokenExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
      }

      await createEmployee({
        employeeNumber: input.employeeNumber,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email.toLowerCase(),
        shift: input.shift,
        seniorityDate: new Date(input.seniorityDate),
        role: input.role,
        category: input.category as any,
        passwordHash,
        inviteToken,
        inviteTokenExpiresAt,
        isActive,
      });

      if (!input.password && inviteToken) {
        const inviteUrl = `${input.origin}/accept-invite?token=${inviteToken}`;
        await sendInviteEmail(input.email, input.firstName, inviteUrl, input.role);
      }

      await logAudit({ actorId: admin.id, action: "invite_employee", targetType: "employee", targetId: input.email, details: { role: input.role, hasPassword: !!input.password } });
      return { success: true, activated: isActive };
    }),

  // Update employee
  updateEmployee: publicProcedure
    .input(z.object({
      id: z.number(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      email: z.string().email().optional(),
      shift: z.enum(["AM", "PM", "NOC"]).optional(),
      role: z.enum(["employee", "manager", "admin", "super_admin"]).optional(),
      category: z.enum(["icu", "ancillary"]).optional(),
      seniorityDate: z.string().optional(),
      employeeNumber: z.string().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const admin = await requireAdmin(ctx);
      const { id, ...updates } = input;
      // Check email uniqueness if email is being changed
      if (updates.email) {
        const existing = await getEmployeeByEmail(updates.email.toLowerCase());
        if (existing && existing.id !== id) {
          throw new TRPCError({ code: "CONFLICT", message: "That email address is already in use by another employee." });
        }
      }
      // Check employee number uniqueness if being changed
      if (updates.employeeNumber) {
        const existingByNum = await getEmployeeByEmployeeNumber(updates.employeeNumber);
        if (existingByNum && existingByNum.id !== id) {
          throw new TRPCError({ code: "CONFLICT", message: "That employee number is already assigned to another employee." });
        }
      }
      const updateData: any = { ...updates };
      if (updates.email) updateData.email = updates.email.toLowerCase();
      if (updates.seniorityDate) updateData.seniorityDate = new Date(updates.seniorityDate);
      await updateEmployee(id, updateData);
      await logAudit({ actorId: admin.id, action: "update_employee", targetType: "employee", targetId: String(id), details: updates });
      return { success: true };
    }),

  // Verify employee: admin sets official employee number + seniority date
  verifyEmployee: publicProcedure
    .input(z.object({
      id: z.number(),
      employeeNumber: z.string().min(1),
      seniorityDate: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const admin = await requireAdmin(ctx);
      // Check employee number uniqueness (excluding this employee)
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
        actorId: admin.id,
        action: "verify_employee",
        targetType: "employee",
        targetId: String(input.id),
        details: { employeeNumber: input.employeeNumber, seniorityDate: input.seniorityDate },
      });
      return { success: true };
    }),

  // Deactivate employee
  deactivateEmployee: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const admin = await requireAdmin(ctx);
      await updateEmployee(input.id, { isActive: false });
      await logAudit({ actorId: admin.id, action: "deactivate_employee", targetType: "employee", targetId: String(input.id) });
      return { success: true };
    }),

  // Import employees from CSV data (already parsed on frontend)
  importEmployees: publicProcedure
    .input(z.object({
      rows: z.array(z.object({
        employee_number: z.string(),
        first_name: z.string(),
        last_name: z.string(),
        seniority_date: z.string(),
        shift: z.enum(["AM", "PM", "NOC"]),
        email: z.string().email(),
        role: z.enum(["employee", "manager", "admin", "super_admin"]).default("employee"),
      })),
      origin: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const admin = await requireAdmin(ctx);
      const results = { created: 0, updated: 0, errors: [] as string[] };

      for (const row of input.rows) {
        try {
          const { getAllEmployees } = await import("../db");
          const existing = (await getAllEmployees()).find(e => e.employeeNumber === row.employee_number);

          if (existing) {
            await updateEmployee(existing.id, {
              firstName: row.first_name,
              lastName: row.last_name,
              seniorityDate: new Date(row.seniority_date),
              shift: row.shift,
              email: row.email.toLowerCase(),
              role: row.role,
            });
            results.updated++;
          } else {
            const token = nanoid(48);
            const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
            await createEmployee({
              employeeNumber: row.employee_number,
              firstName: row.first_name,
              lastName: row.last_name,
              email: row.email.toLowerCase(),
              shift: row.shift,
              seniorityDate: new Date(row.seniority_date),
              role: row.role,
              inviteToken: token,
              inviteTokenExpiresAt: expiresAt,
              isActive: false,
            });
            const inviteUrl = `${input.origin}/accept-invite?token=${token}`;
            await sendInviteEmail(row.email, row.first_name, inviteUrl, row.role);
            results.created++;
          }
        } catch (e: any) {
          results.errors.push(`Row ${row.employee_number}: ${e.message}`);
        }
      }

      await logAudit({
        actorId: admin.id,
        action: "csv_import",
        targetType: "employee",
        targetId: "bulk",
        details: results,
      });

      return results;
    }),

  // Get audit log
  getAuditLog: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(500).default(100) }))
    .query(async ({ input, ctx }) => {
      await requireAdmin(ctx);
      return getAuditLog(input.limit);
    }),
});
