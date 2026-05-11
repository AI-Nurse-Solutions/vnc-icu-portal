import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../_core/trpc";
import { getAllEmployees, getRequestsByEmployee, getRequestDates, getEmployeeById, getDb } from "../db";
import { announcements, requestDateDecisions } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { verifyJwt } from "../_core/jwt";
import { COOKIE_NAME } from "../../shared/const";

async function getAuthEmployee(ctx: any) {
  const token = ctx.req.cookies?.[COOKIE_NAME] || ctx.req.headers.authorization?.replace("Bearer ", "");
  if (!token) return null;
  try {
    const payload = await verifyJwt(token);
    if (!payload?.employeeId) return null;
    return getEmployeeById(payload.employeeId as number);
  } catch {
    return null;
  }
}

export const portalRouter = router({
  /** Full data bundle for the My Portal landing page */
  getPortalData: publicProcedure.query(async ({ ctx }) => {
    const emp = await getAuthEmployee(ctx);
    if (!emp) throw new TRPCError({ code: "UNAUTHORIZED" });

    // Seniority rank within shift
    const allEmployees = await getAllEmployees();
    const shiftEmployees = allEmployees
      .filter(e => e.shift === emp.shift && e.isActive && e.role !== "ancillary")
      .sort((a, b) => {
        const sa = a.seniorityDate instanceof Date ? a.seniorityDate : new Date(a.seniorityDate as string);
        const sb = b.seniorityDate instanceof Date ? b.seniorityDate : new Date(b.seniorityDate as string);
        return sa.getTime() - sb.getTime();
      });
    const shiftRank = shiftEmployees.findIndex(e => e.id === emp.id) + 1;
    const totalInShift = shiftEmployees.length;

    // My requests with date ranges and per-date decisions
    const reqs = await getRequestsByEmployee(emp.id);
    const dbConn2 = await getDb();
    const requestsWithDates = await Promise.all(
      reqs.map(async (req) => {
        const dates = await getRequestDates(req.id);
        const sortedDates = dates
          .map(d => (d.date instanceof Date ? d.date : new Date(d.date as string)).toISOString().split("T")[0])
          .sort();

        // Per-date decisions for this request
        let approvedDates: string[] = [];
        let deniedDates: string[] = [];
        if (dbConn2) {
          const decisions = await dbConn2
            .select()
            .from(requestDateDecisions)
            .where(eq(requestDateDecisions.requestId, req.id));
          approvedDates = decisions
            .filter(d => d.decision === "approved")
            .map(d => (d.date instanceof Date ? d.date : new Date(d.date as string)).toISOString().split("T")[0])
            .sort();
          deniedDates = decisions
            .filter(d => d.decision === "denied")
            .map(d => (d.date instanceof Date ? d.date : new Date(d.date as string)).toISOString().split("T")[0])
            .sort();
        }
        const pendingDates = sortedDates.filter(d => !approvedDates.includes(d) && !deniedDates.includes(d));

        return {
          id: req.id,
          requestType: req.requestType,
          status: req.status,
          priority: req.priority,
          workingPriority: req.workingPriority,
          submittedAt: req.submittedAt,
          dateStart: sortedDates[0] ?? null,
          dateEnd: sortedDates[sortedDates.length - 1] ?? null,
          totalDates: sortedDates.length,
          approvedDates,
          deniedDates,
          pendingDates,
        };
      })
    );

    // Total approved vacation days
    const approvedDays = requestsWithDates
      .reduce((sum, r) => sum + r.approvedDates.length, 0);

    // Active announcements
    const dbConn = await getDb();
    const activeAnnouncements = dbConn
      ? await dbConn.select().from(announcements).where(eq(announcements.isActive, true)).orderBy(announcements.createdAt)
      : [];

    const seniorityDateStr =
      emp.seniorityDate instanceof Date
        ? emp.seniorityDate.toISOString().split("T")[0]
        : String(emp.seniorityDate);

    return {
      employee: {
        id: emp.id,
        firstName: emp.firstName,
        lastName: emp.lastName,
        shift: emp.shift,
        seniorityDate: seniorityDateStr,
        role: emp.role,
        isVerified: emp.isVerified,
      },
      shiftRank,
      totalInShift,
      approvedDays,
      requests: requestsWithDates,
      announcements: activeAnnouncements.map((a: typeof activeAnnouncements[0]) => ({
        id: a.id,
        type: a.type,
        title: a.title,
        body: a.body,
      })),
    };
  }),
});
