import bcryptjs from "bcryptjs";
import { drizzle } from "drizzle-orm/mysql2";
import { employees, requests, requestDates, blackoutDates, submissionDeadlines, config } from "../drizzle/schema";
import { eq, sql } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL not set");

const db = drizzle(DATABASE_URL);

const DEFAULT_PASSWORD = "VncIcu2026!";

async function hashPw(pw: string) {
  return bcryptjs.hash(pw, 10);
}

async function seed() {
  console.log("[Seed] Checking if seed data already exists...");

  const existing = await db.select().from(employees).limit(1);
  if (existing.length > 0) {
    console.log("[Seed] Data already exists. Skipping seed.");
    return;
  }

  console.log("[Seed] Seeding employees...");
  const pw = await hashPw(DEFAULT_PASSWORD);

  const employeeData = [
    // Admin
    { employeeNumber: "EMP001", firstName: "Robert", lastName: "Domondon", seniorityDate: new Date("2002-03-15"), shift: "NOC" as const, email: "admin@vnc-icu.local", role: "admin" as const, passwordHash: pw },
    // Managers
    { employeeNumber: "MGR001", firstName: "Sandra", lastName: "Chen", seniorityDate: new Date("2005-06-01"), shift: "AM" as const, email: "manager.am@vnc-icu.local", role: "manager" as const, passwordHash: pw },
    { employeeNumber: "MGR002", firstName: "Marcus", lastName: "Rivera", seniorityDate: new Date("2007-09-15"), shift: "PM" as const, email: "manager.pm@vnc-icu.local", role: "manager" as const, passwordHash: pw },
    { employeeNumber: "MGR003", firstName: "Diane", lastName: "Okafor", seniorityDate: new Date("2010-01-20"), shift: "NOC" as const, email: "manager.noc@vnc-icu.local", role: "manager" as const, passwordHash: pw },
    // AM shift employees
    { employeeNumber: "EMP002", firstName: "Laura", lastName: "Martinez", seniorityDate: new Date("2004-02-10"), shift: "AM" as const, email: "laura.m@vnc-icu.local", role: "employee" as const, passwordHash: pw },
    { employeeNumber: "EMP003", firstName: "James", lastName: "Robinson", seniorityDate: new Date("2006-07-22"), shift: "AM" as const, email: "james.r@vnc-icu.local", role: "employee" as const, passwordHash: pw },
    { employeeNumber: "EMP004", firstName: "Priya", lastName: "Sharma", seniorityDate: new Date("2009-11-05"), shift: "AM" as const, email: "priya.s@vnc-icu.local", role: "employee" as const, passwordHash: pw },
    { employeeNumber: "EMP005", firstName: "Carlos", lastName: "Nguyen", seniorityDate: new Date("2012-04-18"), shift: "AM" as const, email: "carlos.n@vnc-icu.local", role: "employee" as const, passwordHash: pw },
    { employeeNumber: "EMP006", firstName: "Aisha", lastName: "Thompson", seniorityDate: new Date("2014-08-30"), shift: "AM" as const, email: "aisha.t@vnc-icu.local", role: "employee" as const, passwordHash: pw },
    { employeeNumber: "EMP007", firstName: "Kevin", lastName: "Park", seniorityDate: new Date("2016-03-12"), shift: "AM" as const, email: "kevin.p@vnc-icu.local", role: "employee" as const, passwordHash: pw },
    { employeeNumber: "EMP008", firstName: "Maria", lastName: "Gonzalez", seniorityDate: new Date("2018-10-01"), shift: "AM" as const, email: "maria.g@vnc-icu.local", role: "employee" as const, passwordHash: pw },
    // PM shift employees
    { employeeNumber: "EMP009", firstName: "Thomas", lastName: "Williams", seniorityDate: new Date("2003-05-14"), shift: "PM" as const, email: "thomas.w@vnc-icu.local", role: "employee" as const, passwordHash: pw },
    { employeeNumber: "EMP010", firstName: "Fatima", lastName: "Hassan", seniorityDate: new Date("2008-01-28"), shift: "PM" as const, email: "fatima.h@vnc-icu.local", role: "employee" as const, passwordHash: pw },
    { employeeNumber: "EMP011", firstName: "Daniel", lastName: "Kim", seniorityDate: new Date("2011-06-09"), shift: "PM" as const, email: "daniel.k@vnc-icu.local", role: "employee" as const, passwordHash: pw },
    { employeeNumber: "EMP012", firstName: "Sofia", lastName: "Patel", seniorityDate: new Date("2013-12-15"), shift: "PM" as const, email: "sofia.p@vnc-icu.local", role: "employee" as const, passwordHash: pw },
    { employeeNumber: "EMP013", firstName: "Andre", lastName: "Jackson", seniorityDate: new Date("2015-07-20"), shift: "PM" as const, email: "andre.j@vnc-icu.local", role: "employee" as const, passwordHash: pw },
    { employeeNumber: "EMP014", firstName: "Mei", lastName: "Liu", seniorityDate: new Date("2017-02-14"), shift: "PM" as const, email: "mei.l@vnc-icu.local", role: "employee" as const, passwordHash: pw },
    { employeeNumber: "EMP015", firstName: "Ryan", lastName: "O'Brien", seniorityDate: new Date("2019-09-03"), shift: "PM" as const, email: "ryan.o@vnc-icu.local", role: "employee" as const, passwordHash: pw },
    // NOC shift employees
    { employeeNumber: "EMP016", firstName: "Yuki", lastName: "Tanaka", seniorityDate: new Date("2001-11-30"), shift: "NOC" as const, email: "yuki.t@vnc-icu.local", role: "employee" as const, passwordHash: pw },
    { employeeNumber: "EMP017", firstName: "Grace", lastName: "Adeyemi", seniorityDate: new Date("2007-04-25"), shift: "NOC" as const, email: "grace.a@vnc-icu.local", role: "employee" as const, passwordHash: pw },
    { employeeNumber: "EMP018", firstName: "Michael", lastName: "Torres", seniorityDate: new Date("2010-08-17"), shift: "NOC" as const, email: "michael.t@vnc-icu.local", role: "employee" as const, passwordHash: pw },
    { employeeNumber: "EMP019", firstName: "Nadia", lastName: "Petrov", seniorityDate: new Date("2013-03-08"), shift: "NOC" as const, email: "nadia.p@vnc-icu.local", role: "employee" as const, passwordHash: pw },
    { employeeNumber: "EMP020", firstName: "Samuel", lastName: "Osei", seniorityDate: new Date("2016-11-22"), shift: "NOC" as const, email: "samuel.o@vnc-icu.local", role: "employee" as const, passwordHash: pw },
    { employeeNumber: "EMP021", firstName: "Lena", lastName: "Fischer", seniorityDate: new Date("2019-05-11"), shift: "NOC" as const, email: "lena.f@vnc-icu.local", role: "employee" as const, passwordHash: pw },
    { employeeNumber: "EMP022", firstName: "Omar", lastName: "Khalil", seniorityDate: new Date("2021-01-15"), shift: "NOC" as const, email: "omar.k@vnc-icu.local", role: "employee" as const, passwordHash: pw },
  ];

  await db.insert(employees).values(employeeData);
  console.log(`[Seed] Inserted ${employeeData.length} employees.`);

  // Get inserted employee IDs
  const allEmps = await db.select().from(employees);
  const empMap = new Map(allEmps.map(e => [e.employeeNumber, e.id]));

  // Seed requests
  console.log("[Seed] Seeding requests...");
  const today = new Date();
  const currentYear = today.getFullYear();

  const sampleRequests = [
    { empNum: "EMP002", type: "vacation" as const, status: "approved" as const, dates: [`${currentYear}-04-14`, `${currentYear}-04-15`, `${currentYear}-04-16`], continuity: "continuous" as const },
    { empNum: "EMP003", type: "vacation" as const, status: "pending" as const, dates: [`${currentYear}-04-14`, `${currentYear}-04-15`], continuity: "continuous" as const },
    { empNum: "EMP004", type: "education" as const, status: "approved" as const, dates: [`${currentYear}-04-20`], continuity: "continuous" as const },
    { empNum: "EMP005", type: "vacation" as const, status: "pending" as const, dates: [`${currentYear}-04-21`, `${currentYear}-04-22`], continuity: "continuous" as const },
    { empNum: "EMP006", type: "vacation" as const, status: "denied" as const, dates: [`${currentYear}-04-14`], continuity: "continuous" as const },
    { empNum: "EMP007", type: "vacation" as const, status: "pending" as const, dates: [`${currentYear}-05-05`, `${currentYear}-05-06`, `${currentYear}-05-07`], continuity: "continuous" as const },
    { empNum: "EMP009", type: "vacation" as const, status: "approved" as const, dates: [`${currentYear}-04-14`, `${currentYear}-04-15`], continuity: "continuous" as const },
    { empNum: "EMP010", type: "vacation" as const, status: "pending" as const, dates: [`${currentYear}-04-28`, `${currentYear}-04-29`], continuity: "continuous" as const },
    { empNum: "EMP011", type: "education" as const, status: "pending" as const, dates: [`${currentYear}-04-22`], continuity: "continuous" as const },
    { empNum: "EMP012", type: "vacation" as const, status: "approved" as const, dates: [`${currentYear}-05-12`, `${currentYear}-05-13`, `${currentYear}-05-14`, `${currentYear}-05-15`], continuity: "continuous" as const },
    { empNum: "EMP016", type: "vacation" as const, status: "pending" as const, dates: [`${currentYear}-04-14`, `${currentYear}-04-21`, `${currentYear}-04-28`], continuity: "intermittent" as const },
    { empNum: "EMP017", type: "vacation" as const, status: "approved" as const, dates: [`${currentYear}-04-14`, `${currentYear}-04-15`, `${currentYear}-04-16`, `${currentYear}-04-17`], continuity: "continuous" as const },
    { empNum: "EMP018", type: "education" as const, status: "pending" as const, dates: [`${currentYear}-04-25`], continuity: "continuous" as const },
    { empNum: "EMP019", type: "vacation" as const, status: "withdrawn" as const, dates: [`${currentYear}-04-14`], continuity: "continuous" as const },
    { empNum: "EMP020", type: "vacation" as const, status: "pending" as const, dates: [`${currentYear}-06-02`, `${currentYear}-06-03`, `${currentYear}-06-04`], continuity: "continuous" as const },
  ];

  const managerAMId = empMap.get("MGR001")!;

  for (const r of sampleRequests) {
    const empId = empMap.get(r.empNum);
    if (!empId) continue;
    const submittedAt = new Date(today.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000);
    const result = await db.insert(requests).values({
      employeeId: empId,
      requestType: r.type,
      continuityType: r.continuity,
      status: r.status,
      submittedAt,
      decidedAt: r.status !== "pending" ? new Date() : undefined,
      decidedBy: r.status !== "pending" ? managerAMId : undefined,
      comment: Math.random() > 0.6 ? "Family event planned in advance." : undefined,
    });
    const requestId = (result as any)[0].insertId as number;
    await db.insert(requestDates).values(r.dates.map(d => ({ requestId, date: new Date(d) })));
  }
  console.log(`[Seed] Inserted ${sampleRequests.length} requests.`);

  // Blackout dates
  console.log("[Seed] Seeding blackout dates...");
  const adminId = empMap.get("EMP001")!;
  await db.insert(blackoutDates).values([
    { date: new Date(`${currentYear}-07-04`), reason: "Independence Day — unit-wide blackout", createdBy: adminId },
    { date: new Date(`${currentYear}-12-25`), reason: "Christmas Day — unit-wide blackout", createdBy: adminId },
    { date: new Date(`${currentYear}-11-27`), reason: "Thanksgiving — unit-wide blackout", createdBy: adminId },
  ]);
  console.log("[Seed] Inserted 3 blackout dates.");

  // Submission deadlines
  console.log("[Seed] Seeding submission deadlines...");
  await db.insert(submissionDeadlines).values([
    { deadlineDate: new Date(`${currentYear}-02-01`), coverageStart: new Date(`${currentYear}-01-01`), coverageEnd: new Date(`${currentYear}-04-30`), year: currentYear, createdBy: adminId },
    { deadlineDate: new Date(`${currentYear}-06-01`), coverageStart: new Date(`${currentYear}-05-01`), coverageEnd: new Date(`${currentYear}-08-31`), year: currentYear, createdBy: adminId },
    { deadlineDate: new Date(`${currentYear}-10-01`), coverageStart: new Date(`${currentYear}-09-01`), coverageEnd: new Date(`${currentYear}-12-31`), year: currentYear, createdBy: adminId },
  ]);
  console.log("[Seed] Inserted 3 submission deadlines.");

  // Config
  console.log("[Seed] Seeding config...");
  await db.insert(config).values([
    { key: "cap_am", value: "8", updatedBy: adminId },
    { key: "cap_pm", value: "8", updatedBy: adminId },
    { key: "cap_noc", value: "8", updatedBy: adminId },
    { key: "color_yellow_threshold", value: "5", updatedBy: adminId },
    { key: "color_red_threshold", value: "8", updatedBy: adminId },
    { key: "deadline_reminder_days", value: "7", updatedBy: adminId },
    { key: "vacation_max_days", value: "21", updatedBy: adminId },
    { key: "vacation_rolling_months", value: "6", updatedBy: adminId },
  ]);
  console.log("[Seed] Inserted config defaults.");

  console.log("\n[Seed] ✅ Seed complete!");
  console.log(`[Seed] Default password for all accounts: ${DEFAULT_PASSWORD}`);
  console.log("[Seed] Admin: admin@vnc-icu.local");
  console.log("[Seed] Manager AM: manager.am@vnc-icu.local");
  console.log("[Seed] Manager PM: manager.pm@vnc-icu.local");
  console.log("[Seed] Manager NOC: manager.noc@vnc-icu.local");
  console.log("[Seed] Employee example: laura.m@vnc-icu.local");
}

seed().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
