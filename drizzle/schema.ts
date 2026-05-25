import {
  boolean,
  date,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

// ─── Employees ────────────────────────────────────────────────────────────────
export const employees = mysqlTable("employees", {
  id: int("id").autoincrement().primaryKey(),
  employeeNumber: varchar("employee_number", { length: 32 }).notNull().unique(),
  firstName: varchar("first_name", { length: 64 }).notNull(),
  lastName: varchar("last_name", { length: 64 }).notNull(),
  seniorityDate: date("seniority_date").notNull(),
  shift: mysqlEnum("shift", ["AM", "PM", "NOC"]).notNull(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  role: mysqlEnum("role", ["employee", "manager", "admin", "super_admin", "ancillary"]).notNull().default("employee"),
  category: mysqlEnum("category", ["icu", "ancillary"]).notNull().default("icu"),
  authProviderId: varchar("auth_provider_id", { length: 128 }),
  passwordHash: varchar("password_hash", { length: 256 }),
  otpCode: varchar("otp_code", { length: 6 }),
  otpExpiresAt: timestamp("otp_expires_at"),
  otpAttempts: int("otp_attempts").default(0),
  otpLockedUntil: timestamp("otp_locked_until"),
  resetToken: varchar("reset_token", { length: 128 }),
  resetTokenExpiresAt: timestamp("reset_token_expires_at"),
  inviteToken: varchar("invite_token", { length: 128 }),
  inviteTokenExpiresAt: timestamp("invite_token_expires_at"),
  isActive: boolean("is_active").default(true).notNull(),
  isVerified: boolean("is_verified").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type Employee = typeof employees.$inferSelect;
export type InsertEmployee = typeof employees.$inferInsert;

// ─── Requests ─────────────────────────────────────────────────────────────────
export const requests = mysqlTable("requests", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employee_id").notNull(),
  requestType: mysqlEnum("request_type", ["vacation", "education"]).notNull(),
  continuityType: mysqlEnum("continuity_type", ["continuous", "intermittent"]).notNull(),
  priority: int("priority").notNull().default(5), // 1 = highest, 9 = lowest
  workingPriority: int("working_priority"), // computed from CSV export; null for withdrawn
  comment: text("comment"),
  status: mysqlEnum("status", ["pending", "approved", "denied", "withdrawn"]).notNull().default("pending"),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  decidedAt: timestamp("decided_at"),
  decidedBy: int("decided_by"),
  decisionNote: text("decision_note"),
  priorStatus: mysqlEnum("prior_status", ["pending", "approved", "denied", "withdrawn"]),
  withdrawnAt: timestamp("withdrawn_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type Request = typeof requests.$inferSelect;
export type InsertRequest = typeof requests.$inferInsert;

// ─── Request Dates ────────────────────────────────────────────────────────────
export const requestDates = mysqlTable("request_dates", {
  id: int("id").autoincrement().primaryKey(),
  requestId: int("request_id").notNull(),
  date: date("date").notNull(),
  summerShutout: boolean("summer_shutout").default(false), // true = beyond 14-day consecutive cap in Jul/Aug
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type RequestDate = typeof requestDates.$inferSelect;
export type InsertRequestDate = typeof requestDates.$inferInsert;

// ─── Blackout Dates ───────────────────────────────────────────────────────────
export const blackoutDates = mysqlTable("blackout_dates", {
  id: int("id").autoincrement().primaryKey(),
  date: date("date").notNull().unique(),
  reason: text("reason"),
  createdBy: int("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type BlackoutDate = typeof blackoutDates.$inferSelect;
export type InsertBlackoutDate = typeof blackoutDates.$inferInsert;

// ─── Submission Deadlines ─────────────────────────────────────────────────────
export const submissionDeadlines = mysqlTable("submission_deadlines", {
  id: int("id").autoincrement().primaryKey(),
  deadlineDate: date("deadline_date").notNull(),
  coverageStart: date("coverage_start").notNull(),
  coverageEnd: date("coverage_end").notNull(),
  year: int("year").notNull(),
  createdBy: int("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type SubmissionDeadline = typeof submissionDeadlines.$inferSelect;
export type InsertSubmissionDeadline = typeof submissionDeadlines.$inferInsert;

// ─── Config ───────────────────────────────────────────────────────────────────
export const config = mysqlTable("config", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 64 }).notNull().unique(),
  value: varchar("value", { length: 256 }).notNull(),
  updatedBy: int("updated_by"),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type Config = typeof config.$inferSelect;
export type InsertConfig = typeof config.$inferInsert;

// ─── Request Date Decisions ─────────────────────────────────────────────────
// Stores per-date admin decisions for the Decision Calendar day-by-day workflow.
// A request may have many dates; each date gets its own decision independently.
export const requestDateDecisions = mysqlTable("request_date_decisions", {
  id: int("id").autoincrement().primaryKey(),
  requestId: int("request_id").notNull(),
  date: date("date").notNull(),
  decision: mysqlEnum("decision", ["approved", "denied"]).notNull(),
  decidedBy: int("decided_by").notNull(), // employee.id of the admin
  note: text("note"),
  decidedAt: timestamp("decided_at").defaultNow().notNull(),
});

export type RequestDateDecision = typeof requestDateDecisions.$inferSelect;
export type InsertRequestDateDecision = typeof requestDateDecisions.$inferInsert;

// ─── Audit Log ────────────────────────────────────────────────────────────────
export const auditLog = mysqlTable("audit_log", {
  id: int("id").autoincrement().primaryKey(),
  actorId: int("actor_id"),
  action: varchar("action", { length: 64 }).notNull(),
  targetType: varchar("target_type", { length: 64 }).notNull(),
  targetId: varchar("target_id", { length: 64 }),
  details: json("details"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export type AuditLog = typeof auditLog.$inferSelect;
export type InsertAuditLog = typeof auditLog.$inferInsert;

// ─── Announcements ───────────────────────────────────────────────────────────
export const announcements = mysqlTable("announcements", {
  id: int("id").autoincrement().primaryKey(),
  type: mysqlEnum("type", ["announcement", "tip"]).notNull().default("announcement"),
  title: varchar("title", { length: 128 }).notNull(),
  body: text("body").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: int("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type Announcement = typeof announcements.$inferSelect;
export type InsertAnnouncement = typeof announcements.$inferInsert;

// ─── Legacy users table (keep for template compatibility) ─────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Admin → Super Admin Messages ────────────────────────────────────────────
export const adminMessages = mysqlTable("admin_messages", {
  id: int("id").autoincrement().primaryKey(),
  fromEmployeeId: int("from_employee_id").notNull(),
  subject: varchar("subject", { length: 200 }).notNull(),
  body: text("body").notNull(),
  isRead: boolean("is_read").default(false).notNull(),
  readAt: timestamp("read_at"),
  replyBody: text("reply_body"),
  repliedAt: timestamp("replied_at"),
  repliedBy: int("replied_by"),
  isUrgent: boolean("is_urgent").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AdminMessage = typeof adminMessages.$inferSelect;
export type InsertAdminMessage = typeof adminMessages.$inferInsert;
