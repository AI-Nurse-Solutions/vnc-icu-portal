import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createPool } from "mysql2";
import {
  auditLog,
  blackoutDates,
  config,
  employees,
  InsertEmployee,
  requestDateDecisions,
  requestDates,
  requests,
  submissionDeadlines,
  users,
  type InsertAuditLog,
  type InsertBlackoutDate,
  type InsertConfig,
  type InsertRequest,
  type InsertRequestDate,
  type InsertRequestDateDecision,
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
        // Force DATE/DATETIME columns to be returned as strings (YYYY-MM-DD)
        // This prevents mysql2 from converting DATE values to JS Date objects
        // using the server's local timezone (America/New_York), which causes
        // dates stored as UTC midnight to shift back by one day.
        dateStrings: ["DATE"],
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
    // Store dates as plain "YYYY-MM-DD" strings via sql`` to avoid
    // mysql2 converting JS Date objects through the server's local timezone
    // (America/New_York), which shifts UTC midnight dates by +1 day in storage.
    const dateRows = dates.map((d) => ({ requestId, date: sql`${d}` }));
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
      priority: requests.priority,
      workingPriority: requests.workingPriority,
      status: requests.status,
      submittedAt: requests.submittedAt,
      date: requestDates.date,
      summerShutout: requestDates.summerShutout,
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
  // Status filtering is now per-date (from request_date_decisions), not per-request.
  // "approved" = date has an approved decision
  // "denied"   = date has a denied decision
  // "pending"  = date has NO decision yet (left join is null)
  const allowedStatuses = statuses && statuses.length > 0 ? statuses : ["approved"];

  // Build the per-date status expression:
  // CASE WHEN rdd.decision IS NULL THEN 'pending' ELSE rdd.decision END
  const dateStatusExpr = sql<string>`CASE WHEN ${requestDateDecisions.decision} IS NULL THEN 'pending' ELSE ${requestDateDecisions.decision} END`;

  const conditions = [
    sql`${requestDates.date} >= ${startDate}`,
    sql`${requestDates.date} <= ${endDate}`,
    sql`${requests.status} != 'withdrawn'`,
    sql`(CASE WHEN ${requestDateDecisions.decision} IS NULL THEN 'pending' ELSE ${requestDateDecisions.decision} END) IN (${sql.join(allowedStatuses.map(s => sql`${s}`), sql`, `)})`,
  ];
  if (shift) conditions.push(eq(employees.shift, shift as any));
  if (requestType) conditions.push(eq(requests.requestType, requestType as any));

  return db
    .select({
      employeeNumber: employees.employeeNumber,
      firstName: employees.firstName,
      lastName: employees.lastName,
      shift: employees.shift,
      seniorityDate: employees.seniorityDate,
      requestType: requests.requestType,
      priority: requests.priority,
      workingPriority: requests.workingPriority,
      date: requestDates.date,
      // Per-date decision status (approved / denied / pending)
      dateStatus: dateStatusExpr,
      decidedAt: requestDateDecisions.decidedAt,
      decidedBy: requestDateDecisions.decidedBy,
    })
    .from(requestDates)
    .innerJoin(requests, eq(requestDates.requestId, requests.id))
    .innerJoin(employees, eq(requests.employeeId, employees.id))
    .leftJoin(
      requestDateDecisions,
      and(
        eq(requestDateDecisions.requestId, requestDates.requestId),
        eq(requestDateDecisions.date, requestDates.date)
      )
    )
    .where(and(...conditions))
    .orderBy(requestDates.date, employees.shift, employees.seniorityDate);
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

// ─── Decision Calendar ────────────────────────────────────────────────────────────────
// Get all non-withdrawn, non-ancillary, active-employee requests for a given date.
// Returns one row per request (not per date), with employee info, per-date decision,
// and unit-wide seniority rank.
// Shift filter is optional — if omitted, returns all shifts.
export async function getDecisionCalendarDay(date: string, shift?: string) {
  const db = await getDb();
  if (!db) return [];

  const whereConditions = [
    sql`${requestDates.date} = ${date}`,
    sql`${requests.status} != 'withdrawn'`,
    eq(requests.requestType, "vacation"),
    eq(employees.isActive, true),
    sql`COALESCE(${employees.category}, 'icu') != 'ancillary'`,
    sql`${employees.role} != 'ancillary'`,
  ];
  if (shift) {
    whereConditions.push(sql`${employees.shift} = ${shift}`);
  }

  const rows = await db
    .select({
      requestId: requests.id,
      employeeId: requests.employeeId,
      employeeNumber: employees.employeeNumber,
      firstName: employees.firstName,
      lastName: employees.lastName,
      shift: employees.shift,
      seniorityDate: employees.seniorityDate,
      isVerified: employees.isVerified,
      requestType: requests.requestType,
      continuityType: requests.continuityType,
      priority: requests.priority,
      status: requests.status,
      submittedAt: requests.submittedAt,
      comment: requests.comment,
      workingPriority: requests.workingPriority,
      summerShutout: requestDates.summerShutout,
      // Per-date decision (from request_date_decisions)
      dateDecision: requestDateDecisions.decision,
      dateDecisionNote: requestDateDecisions.note,
      dateDecidedAt: requestDateDecisions.decidedAt,
    })
    .from(requestDates)
    .innerJoin(requests, eq(requestDates.requestId, requests.id))
    .innerJoin(employees, eq(requests.employeeId, employees.id))
    .leftJoin(
      requestDateDecisions,
      and(
        eq(requestDateDecisions.requestId, requests.id),
        sql`${requestDateDecisions.date} = ${date}`
      )
    )
    .where(and(...whereConditions))
    .orderBy(requests.workingPriority, employees.seniorityDate);

  // Deduplicate: a request may span multiple dates; we only want it once per date
  const seen = new Set<number>();
  const deduped = rows.filter(r => {
    if (seen.has(r.requestId)) return false;
    seen.add(r.requestId);
    return true;
  });

  // Compute unit-wide seniority rank: rank all active ICU employees by seniorityDate ASC
  // We do this by sorting all returned employees by seniority and assigning 1-based ranks.
  // Note: this rank is across all shifts (unit-wide), not shift-specific.
  const allActiveEmpRows = await db
    .select({ id: employees.id, seniorityDate: employees.seniorityDate })
    .from(employees)
    .where(
      and(
        eq(employees.isActive, true),
        sql`COALESCE(${employees.category}, 'icu') != 'ancillary'`,
        sql`${employees.role} != 'ancillary'`
      )
    )
    .orderBy(employees.seniorityDate);

  const seniorityRankMap = new Map<number, number>();
  allActiveEmpRows.forEach((e, idx) => seniorityRankMap.set(e.id, idx + 1));

  return deduped.map(r => ({
    ...r,
    unitSeniorityRank: seniorityRankMap.get(r.employeeId) ?? null,
    dateDecidedAt: r.dateDecidedAt instanceof Date ? r.dateDecidedAt.toISOString() : (r.dateDecidedAt ? String(r.dateDecidedAt) : null),
  }));
}

// Upsert a per-date decision (approve or deny a single date of a request)
// Recompute and persist the request-level status from all per-date decisions.
// Rules:
//   - All dates decided as approved → approved
//   - All dates decided as denied  → denied
//   - Mix of approved + denied (no undecided) → approved (partial; treat as approved so export counts it)
//   - Any undecided dates remain   → pending
export async function syncRequestStatusFromDateDecisions(requestId: number) {
  const db = await getDb();
  if (!db) return;

  // Get all dates for this request
  const allDates = await db
    .select({ date: requestDates.date })
    .from(requestDates)
    .where(eq(requestDates.requestId, requestId));

  if (allDates.length === 0) return;

  // Get all per-date decisions for this request
  const decisions = await db
    .select({ date: requestDateDecisions.date, decision: requestDateDecisions.decision })
    .from(requestDateDecisions)
    .where(eq(requestDateDecisions.requestId, requestId));

  const decidedDates = new Set(decisions.map((d) => String(d.date).slice(0, 10)));
  const totalDates = allDates.length;
  const decidedCount = decisions.length;
  const approvedCount = decisions.filter((d) => d.decision === "approved").length;
  const deniedCount = decisions.filter((d) => d.decision === "denied").length;

  let newStatus: "pending" | "approved" | "denied";

  if (decidedCount < totalDates) {
    // Some dates still undecided — keep pending
    newStatus = "pending";
  } else if (approvedCount === totalDates) {
    newStatus = "approved";
  } else if (deniedCount === totalDates) {
    newStatus = "denied";
  } else {
    // Mix: at least one approved, at least one denied — treat as approved (partial)
    newStatus = "approved";
  }

  await db
    .update(requests)
    .set({ status: newStatus })
    .where(eq(requests.id, requestId));
}

export async function upsertDateDecision(
  requestId: number,
  date: string,
  decision: "approved" | "denied",
  decidedBy: number,
  note?: string
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // Check if a decision already exists for this request+date
  const existing = await db
    .select({ id: requestDateDecisions.id })
    .from(requestDateDecisions)
    .where(
      and(
        eq(requestDateDecisions.requestId, requestId),
        sql`${requestDateDecisions.date} = ${date}`
      )
    )
    .limit(1);

  if (existing.length > 0) {
    // Update existing decision
    await db
      .update(requestDateDecisions)
      .set({ decision, decidedBy, note: note ?? null, decidedAt: new Date() })
      .where(eq(requestDateDecisions.id, existing[0].id));
  } else {
    // Insert new decision
    await db.insert(requestDateDecisions).values({
      requestId,
      date: date as unknown as Date,
      decision,
      decidedBy,
      note: note ?? null,
    });
  }

  // Sync request-level status from all per-date decisions
  await syncRequestStatusFromDateDecisions(requestId);
}

// Get all dates that have at least one non-withdrawn vacation request in a month.
// Returns { date, shift, count } rows for building the month calendar heatmap.
export async function getDecisionCalendarMonth(year: number, month: number) {
  const db = await getDb();
  if (!db) return [];

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  // Last day of month
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  // Use per-date decisions (request_date_decisions) for approved/pending/denied counts.
  // A date-row is "approved" if rdd.decision='approved', "denied" if rdd.decision='denied',
  // and "pending" if no rdd row exists for that request+date combination.
  const rows = await db
    .select({
      // Use DATE_FORMAT to force a clean 'YYYY-MM-DD' string — avoids timezone
      // conversion that happens when Drizzle/mysql2 returns a JS Date object.
      date: sql<string>`DATE_FORMAT(${requestDates.date}, '%Y-%m-%d')`,
      shift: employees.shift,
      count: sql<number>`COUNT(DISTINCT ${requests.id})`,
      approvedCount: sql<number>`SUM(CASE WHEN rdd.decision = 'approved' THEN 1 ELSE 0 END)`,
      pendingCount: sql<number>`SUM(CASE WHEN rdd.decision IS NULL THEN 1 ELSE 0 END)`,
      deniedCount: sql<number>`SUM(CASE WHEN rdd.decision = 'denied' THEN 1 ELSE 0 END)`,
      decidedCount: sql<number>`SUM(CASE WHEN rdd.decision IS NOT NULL THEN 1 ELSE 0 END)`,
      totalCount: sql<number>`COUNT(DISTINCT ${requests.id})`,
    })
    .from(requestDates)
    .innerJoin(requests, eq(requestDates.requestId, requests.id))
    .innerJoin(employees, eq(requests.employeeId, employees.id))
    .leftJoin(
      requestDateDecisions,
      and(
        eq(requestDateDecisions.requestId, requestDates.requestId),
        sql`DATE(${requestDateDecisions.date}) = DATE(${requestDates.date})`
      )
    )
    .where(
      and(
        sql`${requestDates.date} >= ${startDate}`,
        sql`${requestDates.date} <= ${endDate}`,
        sql`${requests.status} != 'withdrawn'`,
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

// Delete a per-date decision (reset to undecided)
export async function clearDateDecision(requestId: number, date: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .delete(requestDateDecisions)
    .where(
      and(
        eq(requestDateDecisions.requestId, requestId),
        sql`${requestDateDecisions.date} = ${date}`
      )
    );
  // After clearing a date decision, request reverts to pending (has undecided dates again)
  await syncRequestStatusFromDateDecisions(requestId);
}

// Approve ALL dates of a request in one call, then sync request-level status.
export async function bulkApproveDates(requestId: number, decidedBy: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // Get all dates for this request
  const allDates = await db
    .select({ date: requestDates.date })
    .from(requestDates)
    .where(eq(requestDates.requestId, requestId));

  for (const row of allDates) {
    const dateStr = String(row.date).slice(0, 10);
    // Check if a decision already exists
    const existing = await db
      .select({ id: requestDateDecisions.id })
      .from(requestDateDecisions)
      .where(
        and(
          eq(requestDateDecisions.requestId, requestId),
          sql`${requestDateDecisions.date} = ${dateStr}`
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(requestDateDecisions)
        .set({ decision: "approved", decidedBy, decidedAt: new Date(), note: null })
        .where(eq(requestDateDecisions.id, existing[0].id));
    } else {
      await db.insert(requestDateDecisions).values({
        requestId,
        date: dateStr as unknown as Date,
        decision: "approved",
        decidedBy,
        note: null,
      });
    }
  }

  // Sync request-level status — all dates approved → approved
  await syncRequestStatusFromDateDecisions(requestId);
}
