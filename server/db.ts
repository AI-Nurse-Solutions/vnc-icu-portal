import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createPool } from "mysql2";
import {
  auditLog,
  blackoutDates,
  config,
  employees,
  InsertEmployee,
  requestDates,
  requests,
  submissionDeadlines,
  users,
  type InsertAuditLog,
  type InsertBlackoutDate,
  type InsertConfig,
  type InsertRequest,
  type InsertRequestDate,
  type InsertSubmissionDeadline,
  type InsertUser,
} from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: ReturnType<typeof createPool> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _pool = createPool({
        uri: process.env.DATABASE_URL,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
      });
      _db = drizzle(_pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Legacy users (Manus OAuth compat) ────────────────────────────────────────
export async function upsertUser(user: InsertUser): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(users).values(user).onDuplicateKeyUpdate({ set: { lastSignedIn: new Date() } });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

// ─── Employees ────────────────────────────────────────────────────────────────
export async function getEmployeeByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(employees).where(eq(employees.email, email.toLowerCase())).limit(1);
  return result[0];
}

export async function getEmployeeById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
  return result[0];
}

export async function getEmployeeByInviteToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(employees).where(eq(employees.inviteToken, token)).limit(1);
  return result[0];
}

export async function getEmployeeByResetToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(employees).where(eq(employees.resetToken, token)).limit(1);
  return result[0];
}

export async function getAllEmployees() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(employees).orderBy(employees.lastName);
}

export async function getManagersAndAdmins() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(employees).where(
    sql`${employees.role} IN ('manager', 'admin')`
  );
}

export async function createEmployee(data: InsertEmployee) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(employees).values(data);
  return result;
}

export async function updateEmployee(id: number, data: Partial<InsertEmployee>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(employees).set(data).where(eq(employees.id, id));
}

// ─── Requests ─────────────────────────────────────────────────────────────────
export async function createRequest(data: InsertRequest, dates: string[]) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(requests).values(data);
  const requestId = (result as any)[0].insertId as number;
  if (dates.length > 0) {
    const dateRows = dates.map((d) => ({ requestId, date: new Date(d) }));
    await db.insert(requestDates).values(dateRows);
  }
  return requestId;
}

export async function getRequestById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(requests).where(eq(requests.id, id)).limit(1);
  return result[0];
}

export async function getRequestDates(requestId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(requestDates).where(eq(requestDates.requestId, requestId));
}

export async function getRequestsByEmployee(employeeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(requests)
    .where(eq(requests.employeeId, employeeId))
    .orderBy(desc(requests.submittedAt));
}

export async function updateRequest(id: number, data: Partial<InsertRequest>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(requests).set(data).where(eq(requests.id, id));
}

// Get all active (non-withdrawn) requests for a date range with employee info
export async function getRequestsForDateRange(startDate: string, endDate: string) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      requestId: requests.id,
      employeeId: requests.employeeId,
      requestType: requests.requestType,
      status: requests.status,
      submittedAt: requests.submittedAt,
      date: requestDates.date,
      firstName: employees.firstName,
      lastName: employees.lastName,
      shift: employees.shift,
      seniorityDate: employees.seniorityDate,
      comment: requests.comment,
    })
    .from(requestDates)
    .innerJoin(requests, eq(requestDates.requestId, requests.id))
    .innerJoin(employees, eq(requests.employeeId, employees.id))
    .where(
      and(
        sql`${requestDates.date} >= ${startDate}`,
        sql`${requestDates.date} <= ${endDate}`,
        sql`${requests.status} != 'withdrawn'`
      )
    );
  return rows;
}

// Count approved vacation days for an employee in a rolling 6-month period
export async function countApprovedVacationDays(employeeId: number, fromDate: string, toDate: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ count: sql<number>`COUNT(${requestDates.id})` })
    .from(requestDates)
    .innerJoin(requests, eq(requestDates.requestId, requests.id))
    .where(
      and(
        eq(requests.employeeId, employeeId),
        eq(requests.requestType, "vacation"),
        sql`${requests.status} IN ('pending', 'approved')`,
        sql`${requestDates.date} >= ${fromDate}`,
        sql`${requestDates.date} <= ${toDate}`
      )
    );
  return rows[0]?.count ?? 0;
}

// Get requests for CSV export — supports filtering by statuses array
export async function getApprovedRequestsForExport(
  startDate: string, endDate: string, shift?: string, requestType?: string, statuses?: string[]
) {
  const db = await getDb();
  if (!db) return [];
  const allowedStatuses = statuses && statuses.length > 0 ? statuses : ["approved"];
  const conditions = [
    sql`${requests.status} IN (${sql.join(allowedStatuses.map(s => sql`${s}`), sql`, `)})`,
    sql`${requestDates.date} >= ${startDate}`,
    sql`${requestDates.date} <= ${endDate}`,
  ];
  if (shift) conditions.push(eq(employees.shift, shift as any));
  if (requestType) conditions.push(eq(requests.requestType, requestType as any));

  return db
    .select({
      employeeNumber: employees.employeeNumber,
      firstName: employees.firstName,
      lastName: employees.lastName,
      shift: employees.shift,
      requestType: requests.requestType,
      date: requestDates.date,
      status: requests.status,
      decidedAt: requests.decidedAt,
      decidedBy: requests.decidedBy,
    })
    .from(requestDates)
    .innerJoin(requests, eq(requestDates.requestId, requests.id))
    .innerJoin(employees, eq(requests.employeeId, employees.id))
    .where(and(...conditions))
    .orderBy(requestDates.date, employees.shift);
}

// Get all requests with full info for manager review
export async function getAllRequestsWithEmployees(statusFilter?: string[]) {
  const db = await getDb();
  if (!db) return [];
  const conditions = statusFilter
    ? [sql`${requests.status} IN (${sql.join(statusFilter.map(s => sql`${s}`), sql`, `)})`]
    : [];

  return db
    .select({
      requestId: requests.id,
      employeeId: requests.employeeId,
      requestType: requests.requestType,
      continuityType: requests.continuityType,
      comment: requests.comment,
      status: requests.status,
      submittedAt: requests.submittedAt,
      decidedAt: requests.decidedAt,
      decidedBy: requests.decidedBy,
      decisionNote: requests.decisionNote,
      firstName: employees.firstName,
      lastName: employees.lastName,
      shift: employees.shift,
      seniorityDate: employees.seniorityDate,
      employeeNumber: employees.employeeNumber,
    })
    .from(requests)
    .innerJoin(employees, eq(requests.employeeId, employees.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(requests.submittedAt));
}

// ─── Blackout Dates ───────────────────────────────────────────────────────────
export async function getBlackoutDates() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(blackoutDates).orderBy(blackoutDates.date);
}

export async function addBlackoutDate(data: InsertBlackoutDate) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(blackoutDates).values(data);
}

export async function removeBlackoutDate(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(blackoutDates).where(eq(blackoutDates.id, id));
}

// ─── Submission Deadlines ─────────────────────────────────────────────────────
export async function getSubmissionDeadlines(year?: number) {
  const db = await getDb();
  if (!db) return [];
  const q = db.select().from(submissionDeadlines);
  if (year) return q.where(eq(submissionDeadlines.year, year));
  return q.orderBy(submissionDeadlines.deadlineDate);
}

export async function upsertSubmissionDeadline(data: InsertSubmissionDeadline) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(submissionDeadlines).values(data);
}

export async function deleteSubmissionDeadline(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(submissionDeadlines).where(eq(submissionDeadlines.id, id));
}

// ─── Config ───────────────────────────────────────────────────────────────────
export async function getConfig(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(config).where(eq(config.key, key)).limit(1);
  return result[0]?.value ?? null;
}

export async function getAllConfig() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(config);
}

export async function setConfig(key: string, value: string, updatedBy?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(config).values({ key, value, updatedBy }).onDuplicateKeyUpdate({ set: { value, updatedBy } });
}

// ─── Audit Log ────────────────────────────────────────────────────────────────
export async function logAudit(data: InsertAuditLog) {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(auditLog).values(data);
  } catch (e) {
    console.error("[Audit] Failed to log:", e);
  }
}

export async function getAuditLog(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(auditLog).orderBy(desc(auditLog.timestamp)).limit(limit);
}
