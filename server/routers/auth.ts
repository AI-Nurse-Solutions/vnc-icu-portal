import bcryptjs from "bcryptjs";
import { nanoid } from "nanoid";
import { z } from "zod";
import { COOKIE_NAME } from "../../shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import { signJwt, verifyJwt } from "../_core/jwt";
import {
  createEmployee,
  getEmployeeByEmail,
  getEmployeeById,
  getEmployeeByEmployeeNumber,
  getEmployeeByInviteToken,
  getEmployeeByResetToken,
  logAudit,
  updateEmployee,
} from "../db";
import {
  sendInviteEmail,
  sendOtpEmail,
  sendPasswordResetEmail,
} from "../email";
import { publicProcedure, router } from "../_core/trpc";

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export const authRouter = router({
  // Get current authenticated employee
  me: publicProcedure.query(async ({ ctx }) => {
    const token = ctx.req.cookies?.[COOKIE_NAME] || ctx.req.headers.authorization?.replace("Bearer ", "");
    if (!token) return null;
    try {
      const payload = await verifyJwt(token);
      if (!payload?.employeeId) return null;
      const emp = await getEmployeeById(payload.employeeId as number);
      if (!emp || !emp.isActive) return null;
      return {
        id: emp.id,
        employeeNumber: emp.employeeNumber,
        firstName: emp.firstName,
        lastName: emp.lastName,
        email: emp.email,
        shift: emp.shift,
        role: emp.role,
        seniorityDate: emp.seniorityDate,
      };
    } catch {
      return null;
    }
  }),

  // Login: verify email/password and issue session directly (MFA disabled)
  initiateLogin: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const emp = await getEmployeeByEmail(input.email.toLowerCase());
      if (!emp || !emp.isActive) {
        throw new Error("Invalid credentials");
      }
      if (!emp.passwordHash) {
        throw new Error("Account not set up. Please use your invitation link.");
      }

      const valid = await bcryptjs.compare(input.password, emp.passwordHash);
      if (!valid) {
        throw new Error("Invalid credentials");
      }

      // Issue JWT session immediately (MFA/OTP disabled)
      const token = await signJwt({ employeeId: emp.id, role: emp.role });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: 8 * 60 * 60 * 1000 });

      await logAudit({ actorId: emp.id, action: "login", targetType: "employee", targetId: String(emp.id), details: { email: emp.email } });

      return {
        success: true,
        email: emp.email,
        mfaRequired: false,
        employee: {
          id: emp.id,
          employeeNumber: emp.employeeNumber,
          firstName: emp.firstName,
          lastName: emp.lastName,
          email: emp.email,
          shift: emp.shift,
          role: emp.role,
          seniorityDate: emp.seniorityDate,
        },
      };
    }),

  // Step 2: verify OTP and issue session
  verifyOtp: publicProcedure
    .input(z.object({ email: z.string().email(), otp: z.string().length(6) }))
    .mutation(async ({ input, ctx }) => {
      const emp = await getEmployeeByEmail(input.email.toLowerCase());
      if (!emp || !emp.isActive) throw new Error("Invalid session");

      // Check lockout
      if (emp.otpLockedUntil && new Date() < new Date(emp.otpLockedUntil)) {
        throw new Error("Account locked due to too many failed attempts.");
      }

      if (!emp.otpCode || !emp.otpExpiresAt) throw new Error("No OTP pending. Please log in again.");
      if (new Date() > new Date(emp.otpExpiresAt)) throw new Error("OTP expired. Please log in again.");

      if (emp.otpCode !== input.otp) {
        const attempts = (emp.otpAttempts ?? 0) + 1;
        if (attempts >= 3) {
          await updateEmployee(emp.id, {
            otpAttempts: attempts,
            otpLockedUntil: new Date(Date.now() + 15 * 60 * 1000),
          });
          throw new Error("Too many failed attempts. Account locked for 15 minutes.");
        }
        await updateEmployee(emp.id, { otpAttempts: attempts });
        throw new Error(`Invalid OTP. ${3 - attempts} attempt(s) remaining.`);
      }

      // Clear OTP
      await updateEmployee(emp.id, {
        otpCode: undefined,
        otpExpiresAt: undefined,
        otpAttempts: 0,
        otpLockedUntil: undefined,
      });

      // Issue JWT session
      const token = await signJwt({ employeeId: emp.id, role: emp.role });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: 8 * 60 * 60 * 1000 });

      await logAudit({ actorId: emp.id, action: "login", targetType: "employee", targetId: String(emp.id), details: { email: emp.email } });

      return {
        success: true,
        employee: {
          id: emp.id,
          employeeNumber: emp.employeeNumber,
          firstName: emp.firstName,
          lastName: emp.lastName,
          email: emp.email,
          shift: emp.shift,
          role: emp.role,
          seniorityDate: emp.seniorityDate,
        },
      };
    }),

  // Self-signup: employee creates their own account (no 2FA, immediately active)
  signup: publicProcedure
    .input(z.object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().email(),
      employeeNumber: z.string().min(1),
      shift: z.enum(["AM", "PM", "NOC"]),
      password: z.string().min(8),
    }))
    .mutation(async ({ input, ctx }) => {
      // Check for duplicate email
      const existingEmail = await getEmployeeByEmail(input.email.toLowerCase());
      if (existingEmail) {
        throw new Error("An account with this email already exists.");
      }

      // Check for duplicate employee number
      const existingEmpNum = await getEmployeeByEmployeeNumber(input.employeeNumber);
      if (existingEmpNum) {
        throw new Error("An account with this employee number already exists.");
      }

      const bcrypt = await import("bcryptjs");
      const passwordHash = await bcrypt.hash(input.password, 12);

      // Use today as seniority date (admin can update later)
      const seniorityDate = new Date();

      await createEmployee({
        employeeNumber: input.employeeNumber,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email.toLowerCase(),
        shift: input.shift,
        seniorityDate,
        role: "employee",
        passwordHash,
        isActive: true,
      });

      // Fetch the newly created employee to get their ID for the JWT
      const emp = await getEmployeeByEmail(input.email.toLowerCase());
      if (!emp) throw new Error("Account creation failed. Please try again.");

      // Issue JWT session immediately — no 2FA
      const { signJwt } = await import("../_core/jwt");
      const { getSessionCookieOptions } = await import("../_core/cookies");
      const { COOKIE_NAME } = await import("../../shared/const");
      const token = await signJwt({ employeeId: emp.id, role: emp.role });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: 8 * 60 * 60 * 1000 });

      await logAudit({ actorId: emp.id, action: "signup", targetType: "employee", targetId: String(emp.id), details: { email: emp.email } });

      return {
        success: true,
        employee: {
          id: emp.id,
          employeeNumber: emp.employeeNumber,
          firstName: emp.firstName,
          lastName: emp.lastName,
          email: emp.email,
          shift: emp.shift,
          role: emp.role,
          seniorityDate: emp.seniorityDate,
        },
      };
    }),

  logout: publicProcedure.mutation(({ ctx }) => {
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return { success: true };
  }),

  // Request password reset
  requestPasswordReset: publicProcedure
    .input(z.object({ email: z.string().email(), origin: z.string() }))
    .mutation(async ({ input }) => {
      const emp = await getEmployeeByEmail(input.email.toLowerCase());
      // Always return success to prevent email enumeration
      if (!emp) return { success: true };

      const token = nanoid(48);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await updateEmployee(emp.id, { resetToken: token, resetTokenExpiresAt: expiresAt });

      const resetUrl = `${input.origin}/reset-password?token=${token}`;
      await sendPasswordResetEmail(emp.email, emp.firstName, resetUrl);

      return { success: true };
    }),

  // Complete password reset
  resetPassword: publicProcedure
    .input(z.object({ token: z.string(), newPassword: z.string().min(8) }))
    .mutation(async ({ input }) => {
      const emp = await getEmployeeByResetToken(input.token);
      if (!emp || !emp.resetTokenExpiresAt || new Date() > new Date(emp.resetTokenExpiresAt)) {
        throw new Error("Invalid or expired reset link.");
      }

      const hash = await bcryptjs.hash(input.newPassword, 10);
      await updateEmployee(emp.id, {
        passwordHash: hash,
        resetToken: undefined,
        resetTokenExpiresAt: undefined,
      });

      return { success: true };
    }),

  // Accept invite and set password
  acceptInvite: publicProcedure
    .input(z.object({ token: z.string(), password: z.string().min(8) }))
    .mutation(async ({ input }) => {
      const emp = await getEmployeeByInviteToken(input.token);
      if (!emp || !emp.inviteTokenExpiresAt || new Date() > new Date(emp.inviteTokenExpiresAt)) {
        throw new Error("Invalid or expired invitation link.");
      }

      const hash = await bcryptjs.hash(input.password, 10);
      await updateEmployee(emp.id, {
        passwordHash: hash,
        inviteToken: undefined,
        inviteTokenExpiresAt: undefined,
        isActive: true,
      });

      await logAudit({ actorId: emp.id, action: "accept_invite", targetType: "employee", targetId: String(emp.id) });

      return { success: true };
    }),
});
