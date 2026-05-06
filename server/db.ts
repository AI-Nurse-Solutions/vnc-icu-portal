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
export async function getEmployeeByEmployeeNumber(employeeNumber: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(employees).where(eq(employees.employeeNumber, employeeNumber)).limit(1);
  return result[0];
}

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
        sql`${requests.status} != 'withdrawn'`,
        eq(employees.isActive, true),
        sql`COALESCE(${employees.category}, 'icu') != 'ancillary'`,
        sql`${employees.role} != 'ancillary'`
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
      priority: requests.priority,
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

// Delete a specific request date by its ID
export async function deleteRequestDate(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(requestDates).where(eq(requestDates.id, id));
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

// ─── Review Dashboard ─────────────────────────────────────────────────────────
// Get all pending requests with full employee + date info for the approval run
export async function getPendingRequestsForApprovalRun() {
  const db = await getDb();
  if (!db) return [];
  // Get all pending requests with employee info
  const rows = await db
    .select({
      requestId: requests.id,
      employeeId: requests.employeeId,
      requestType: requests.requestType,
      continuityType: requests.continuityType,
      priority: requests.priority,
      comment: requests.comment,
      status: requests.status,
      submittedAt: requests.submittedAt,
      firstName: employees.firstName,
      lastName: employees.lastName,
      shift: employees.shift,
      seniorityDate: employees.seniorityDate,
      employeeNumber: employees.employeeNumber,
      isVerified: employees.isVerified,
    })
    .from(requests)
    .innerJoin(employees, eq(requests.employeeId, employees.id))
    .where(and(
      eq(requests.status, "pending"),
      eq(employees.isActive, true),
      sql`COALESCE(${employees.category}, 'icu') != 'ancillary'`,
      sql`${employees.role} != 'ancillary'`
    ))
    .orderBy(requests.priority, employees.seniorityDate);
  return rows;
}

// ─── Hot Dates View ───────────────────────────────────────────────────────────
// Get oversubscription data: for each date, count pending vacation requests per shift
export async function getHotDatesData(startDate: string, endDate: string, cap = 8) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      date: requestDates.date,
      shift: employees.shift,
      count: sql<number>`COUNT(DISTINCT ${requests.id})`,
    })
    .from(requestDates)
    .innerJoin(requests, eq(requestDates.requestId, requests.id))
    .innerJoin(employees, eq(requests.employeeId, employees.id))
    .where(
      and(
        sql`${requestDates.date} >= ${startDate}`,
        sql`${requestDates.date} <= ${endDate}`,
        eq(requests.status, "pending"),
        eq(requests.requestType, "vacation"),
        eq(employees.isActive, true),
        sql`COALESCE(${employees.category}, 'icu') != 'ancillary'`,
        sql`${employees.role} != 'ancillary'`
      )
    )
    .groupBy(requestDates.date, employees.shift)
    .orderBy(requestDates.date, employees.shift);
  return rows;
}

// Get ranked requesters for a specific hot date
export async function getHotDateDrillDown(date: string) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      requestId: requests.id,
      employeeId: requests.employeeId,
      priority: requests.priority,
      comment: requests.comment,
      submittedAt: requests.submittedAt,
      firstName: employees.firstName,
      lastName: employees.lastName,
      shift: employees.shift,
      seniorityDate: employees.seniorityDate,
      employeeNumber: employees.employeeNumber,
    })
    .from(requestDates)
    .innerJoin(requests, eq(requestDates.requestId, requests.id))
    .innerJoin(employees, eq(requests.employeeId, employees.id))
    .where(
      and(
        sql`${requestDates.date} = ${date}`,
        eq(requests.status, "pending"),
        eq(requests.requestType, "vacation"),
        eq(employees.isActive, true),
        sql`COALESCE(${employees.category}, 'icu') != 'ancillary'`,
        sql`${employees.role} != 'ancillary'`
      )
    )
    .orderBy(requests.priority, employees.seniorityDate);
  return rows;
}

// ─── 21-Day Ceiling Tracker ───────────────────────────────────────────────────
// Get all employees with their Period A and Period B vacation day totals (approved + pending)
export async function getAllEmployeePeriodTotals(year: number) {
  const db = await getDb();
  if (!db) return [];
  const periodAStart = `${year}-01-01`;
  const periodAEnd = `${year}-06-30`;
  const periodBStart = `${year}-07-01`;
  const periodBEnd = `${year}-12-31`;

  // Get all employees
  const allEmps = await db.select({
    id: employees.id,
    firstName: employees.firstName,
    lastName: employees.lastName,
    shift: employees.shift,
    seniorityDate: employees.seniorityDate,
    employeeNumber: employees.employeeNumber,
    isVerified: employees.isVerified,
    isActive: employees.isActive,
  }).from(employees).where(and(
    eq(employees.isActive, true),
    sql`COALESCE(${employees.category}, 'icu') != 'ancillary'`,
    sql`${employees.role} != 'ancillary'`
  )).orderBy(employees.shift, employees.seniorityDate);

  // Get all approved+pending vacation date counts grouped by employee and period
  const periodARows = await db
    .select({
      employeeId: requests.employeeId,
      approvedCount: sql<number>`SUM(CASE WHEN ${requests.status} = 'approved' THEN 1 ELSE 0 END)`,
      pendingCount: sql<number>`SUM(CASE WHEN ${requests.status} = 'pending' THEN 1 ELSE 0 END)`,
      p1Count: sql<number>`SUM(CASE WHEN ${requests.priority} = 1 AND ${requests.status} IN ('approved','pending') THEN 1 ELSE 0 END)`,
    })
    .from(requestDates)
    .innerJoin(requests, eq(requestDates.requestId, requests.id))
    .where(
      and(
        eq(requests.requestType, "vacation"),
        sql`${requests.status} IN ('approved', 'pending')`,
        sql`${requestDates.date} >= ${periodAStart}`,
        sql`${requestDates.date} <= ${periodAEnd}`,
      )
    )
    .groupBy(requests.employeeId);

  const periodBRows = await db
    .select({
      employeeId: requests.employeeId,
      approvedCount: sql<number>`SUM(CASE WHEN ${requests.status} = 'approved' THEN 1 ELSE 0 END)`,
      pendingCount: sql<number>`SUM(CASE WHEN ${requests.status} = 'pending' THEN 1 ELSE 0 END)`,
      p1Count: sql<number>`SUM(CASE WHEN ${requests.priority} = 1 AND ${requests.status} IN ('approved','pending') THEN 1 ELSE 0 END)`,
    })
    .from(requestDates)
    .innerJoin(requests, eq(requestDates.requestId, requests.id))
    .where(
      and(
        eq(requests.requestType, "vacation"),
        sql`${requests.status} IN ('approved', 'pending')`,
        sql`${requestDates.date} >= ${periodBStart}`,
        sql`${requestDates.date} <= ${periodBEnd}`,
      )
    )
    .groupBy(requests.employeeId);

  const aMap = new Map(periodARows.map(r => [r.employeeId, r]));
  const bMap = new Map(periodBRows.map(r => [r.employeeId, r]));

  return allEmps.map(emp => {
    const a = aMap.get(emp.id);
    const b = bMap.get(emp.id);
    const aTotal = (Number(a?.approvedCount ?? 0)) + (Number(a?.pendingCount ?? 0));
    const bTotal = (Number(b?.approvedCount ?? 0)) + (Number(b?.pendingCount ?? 0));
    const aP1Only = Number(a?.p1Count ?? 0);
    const bP1Only = Number(b?.p1Count ?? 0);
    return {
      ...emp,
      periodA: {
        approved: Number(a?.approvedCount ?? 0),
        pending: Number(a?.pendingCount ?? 0),
        total: aTotal,
        p1Only: aP1Only,
        overCeiling: aTotal > 21,
        atWarning: aTotal >= 15 && aTotal <= 21,
      },
      periodB: {
        approved: Number(b?.approvedCount ?? 0),
        pending: Number(b?.pendingCount ?? 0),
        total: bTotal,
        p1Only: bP1Only,
        overCeiling: bTotal > 21,
        atWarning: bTotal >= 15 && bTotal <= 21,
      },
    };
  });
}

// ─── Enhanced Audit Log ───────────────────────────────────────────────────────
// Get audit log with actor name lookup and optional filters
export async function getAuditLogWithActors(opts: {
  limit?: number;
  offset?: number;
  action?: string;
  targetType?: string;
  actorId?: number;
  fromDate?: string;
  toDate?: string;
}) {
  const db = await getDb();
  if (!db) return { rows: [], total: 0 };

  const conditions: any[] = [];
  if (opts.action) conditions.push(sql`${auditLog.action} LIKE ${`%${opts.action}%`}`);
  if (opts.targetType) conditions.push(eq(auditLog.targetType, opts.targetType));
  if (opts.actorId) conditions.push(eq(auditLog.actorId, opts.actorId));
  if (opts.fromDate) conditions.push(sql`${auditLog.timestamp} >= ${opts.fromDate}`);
  if (opts.toDate) conditions.push(sql`${auditLog.timestamp} <= ${opts.toDate + " 23:59:59"}`);

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countRows] = await Promise.all([
    db.select({
      id: auditLog.id,
      actorId: auditLog.actorId,
      action: auditLog.action,
      targetType: auditLog.targetType,
      targetId: auditLog.targetId,
      details: auditLog.details,
      timestamp: auditLog.timestamp,
    })
      .from(auditLog)
      .where(whereClause)
      .orderBy(desc(auditLog.timestamp))
      .limit(opts.limit ?? 100)
      .offset(opts.offset ?? 0),
    db.select({ count: sql<number>`COUNT(*)` })
      .from(auditLog)
      .where(whereClause),
  ]);

  // Enrich with actor names
  const actorIds = Array.from(new Set(rows.map(r => r.actorId).filter(Boolean))) as number[];
  let actorMap: Record<number, string> = {};
  if (actorIds.length > 0) {
    const actors = await db.select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName })
      .from(employees)
      .where(inArray(employees.id, actorIds));
    actorMap = Object.fromEntries(actors.map(a => [a.id, `${a.firstName} ${a.lastName}`]));
  }

  return {
    rows: rows.map(r => ({
      ...r,
      actorName: r.actorId ? (actorMap[r.actorId] ?? `#${r.actorId}`) : "System",
      timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp),
    })),
    total: Number(countRows[0]?.count ?? 0),
  };
}
