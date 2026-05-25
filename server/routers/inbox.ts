import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import {
  getInboxMessages,
  markMessageRead,
  replyToMessage,
  deleteAdminMessage,
  getUnreadMessageCount,
  saveAdminMessage,
} from "../db";
import { notifyOwner } from "../_core/notification";

function requireSuperAdmin(ctx: { user: { role: string } }) {
  if (ctx.user.role !== "super_admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Super admin access required" });
  }
}

function requireAdminOrAbove(ctx: { user: { role: string } }) {
  const allowed = ["admin", "super_admin", "manager"];
  if (!allowed.includes(ctx.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
}

export const inboxRouter = router({
  // Super admin: get all messages
  getMessages: protectedProcedure.query(async ({ ctx }) => {
    requireSuperAdmin(ctx as any);
    const messages = await getInboxMessages();
    return messages.map((m) => ({
      ...m,
      createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : String(m.createdAt),
      readAt: m.readAt instanceof Date ? m.readAt.toISOString() : (m.readAt ? String(m.readAt) : null),
      repliedAt: m.repliedAt instanceof Date ? m.repliedAt.toISOString() : (m.repliedAt ? String(m.repliedAt) : null),
    }));
  }),

  // Super admin: get unread count (for badge)
  getUnreadCount: protectedProcedure.query(async ({ ctx }) => {
    requireSuperAdmin(ctx as any);
    return getUnreadMessageCount();
  }),

  // Super admin: mark a message as read
  markRead: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireSuperAdmin(ctx as any);
      await markMessageRead(input.id);
      return { success: true };
    }),

  // Super admin: reply to a message
  reply: protectedProcedure
    .input(z.object({ id: z.number(), replyBody: z.string().min(1).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      requireSuperAdmin(ctx as any);
      const employee = ctx.user as any;
      await replyToMessage(input.id, input.replyBody, employee.id);
      return { success: true };
    }),

  // Super admin: delete a message
  deleteMessage: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireSuperAdmin(ctx as any);
      await deleteAdminMessage(input.id);
      return { success: true };
    }),

  // Admin/manager: send a message to super admin (persists to DB + sends notification)
  sendMessage: protectedProcedure
    .input(z.object({
      subject: z.string().min(1).max(200),
      body: z.string().min(1).max(2000),
      isUrgent: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireAdminOrAbove(ctx as any);
      const employee = ctx.user as any;
      const msgId = await saveAdminMessage({
        fromEmployeeId: employee.id,
        subject: input.subject,
        body: input.body,
        isUrgent: input.isUrgent ?? false,
      });
      // Also fire an in-app notification to the owner
      const urgentTag = input.isUrgent ? "[URGENT] " : "";
      await notifyOwner({
        title: `${urgentTag}Message from ${employee.firstName} ${employee.lastName}: ${input.subject}`,
        content: input.body,
      }).catch(() => {}); // non-blocking
      return { success: true, id: msgId };
    }),
});
