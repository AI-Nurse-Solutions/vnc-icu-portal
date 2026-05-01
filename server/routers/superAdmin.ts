import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "../../shared/const";
import { verifyJwt } from "../_core/jwt";
import { publicProcedure, router } from "../_core/trpc";
import {
  createRequest,
  getAllEmployees,
  getEmployeeById,
  getRequestDates,
  logAudit,
  updateEmployee,
} from "../db";
import { sendDatesAddedOnBehalfEmail } from "../email";

// ─── Auth guard: super_admin only ─────────────────────────────────────────────
async function requireSuperAdmin(ctx: any) {
  const token = ctx.req.cookies?.[COOKIE_NAME] || ctx.req.headers.authorization?.replace("Bearer ", "");
  if (!token) throw new TRPCError({ code: "UNAUTHORIZED" });
  const payload = await verifyJwt(token);
  if (!payload?.employeeId) throw new TRPCError({ code: "UNAUTHORIZED" });
  const emp = await getEmployeeById(payload.employeeId as number);
  if (!emp || emp.role !== "super_admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Super admin access required" });
  }
  return emp;
}

export const superAdminRouter = router({
  // ─── List all employees (for employee picker) ────────────────────────────────
  listAllEmployees: publicProcedure.query(async ({ ctx }) => {
    await requireSuperAdmin(ctx);
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
      isVerified: e.isVerified,
      isActive: e.isActive,
      seniorityDate: e.seniorityDate instanceof Date ? e.seniorityDate.toISOString() : String(e.seniorityDate),
    }));
  }),

  // ─── Add vacation dates on behalf of an employee ─────────────────────────────
  addDatesOnBehalf: publicProcedure
    .input(z.object({
      employeeId: z.number(),
      dates: z.array(z.string()).min(1).max(60), // "YYYY-MM-DD" strings
      priority: z.number().min(1).max(9).default(1),
      continuityType: z.enum(["continuous", "intermittent"]).default("intermittent"),
      note: z.string().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const superAdmin = await requireSuperAdmin(ctx);
      const target = await getEmployeeById(input.employeeId);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });

      // Create the request on behalf of the employee
      const newRequestId = await createRequest(
        {
          employeeId: input.employeeId,
          requestType: "vacation",
          continuityType: input.continuityType,
          priority: input.priority,
          comment: input.note
            ? `[Added by Super Admin] ${input.note}`
            : "[Added by Super Admin]",
          status: "pending",
        },
        input.dates
      );

      // Fetch the created request dates for the email
      const requestDatesRows = await getRequestDates(newRequestId);
      const dateStrings = requestDatesRows.map(d => {
        const dt = d.date instanceof Date ? d.date : new Date(d.date);
        return dt.toISOString().split("T")[0];
      });

      // Send email notification to the employee
      await sendDatesAddedOnBehalfEmail(
        target.email,
        target.firstName,
        dateStrings,
        superAdmin.firstName + " " + superAdmin.lastName,
        input.note
      );

      await logAudit({
        actorId: superAdmin.id,
        action: "super_admin_add_dates",
        targetType: "request",
        targetId: String(newRequestId),
        details: {
          forEmployeeId: input.employeeId,
          forEmployee: `${target.firstName} ${target.lastName}`,
          dates: dateStrings,
          priority: input.priority,
          note: input.note,
        },
      });

      return {
        success: true,
        requestId: newRequestId,
        datesAdded: dateStrings.length,
        employeeName: `${target.firstName} ${target.lastName}`,
        employeeEmail: target.email,
      };
    }),

  // ─── Update employee role (promote/demote) ────────────────────────────────────
  updateEmployeeRole: publicProcedure
    .input(z.object({
      id: z.number(),
      role: z.enum(["employee", "manager", "admin", "super_admin"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const superAdmin = await requireSuperAdmin(ctx);
      if (input.id === superAdmin.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot change your own role." });
      }
      await updateEmployee(input.id, { role: input.role as any });
      await logAudit({
        actorId: superAdmin.id,
        action: "update_employee_role",
        targetType: "employee",
        targetId: String(input.id),
        details: { newRole: input.role },
      });
      return { success: true };
    }),

  // ─── Update employee category ─────────────────────────────────────────────────
  updateEmployeeCategory: publicProcedure
    .input(z.object({
      id: z.number(),
      category: z.enum(["icu", "ancillary"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const superAdmin = await requireSuperAdmin(ctx);
      await updateEmployee(input.id, { category: input.category } as any);
      await logAudit({
        actorId: superAdmin.id,
        action: "update_employee_category",
        targetType: "employee",
        targetId: String(input.id),
        details: { newCategory: input.category },
      });
      return { success: true };
    }),
});
