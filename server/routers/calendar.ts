import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { getRequestsForDateRange, getBlackoutDates, getSubmissionDeadlines, getAllConfig } from "../db";
import { verifyJwt } from "../_core/jwt";
import { COOKIE_NAME } from "../../shared/const";
import { getEmployeeById } from "../db";

export const calendarRouter = router({
  // Get calendar data for a month: per-shift demand counts, blackout dates
  getMonthData: publicProcedure
    .input(z.object({ year: z.number(), month: z.number() }))
    .query(async ({ input, ctx }) => {
      const { year, month } = input;
      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

      const [rows, blackouts, configs] = await Promise.all([
        getRequestsForDateRange(startDate, endDate),
        getBlackoutDates(),
        getAllConfig(),
      ]);

      const configMap = Object.fromEntries(configs.map(c => [c.key, c.value]));
      const caps = {
        AM: parseInt(configMap.cap_am ?? "8"),
        PM: parseInt(configMap.cap_pm ?? "8"),
        NOC: parseInt(configMap.cap_noc ?? "8"),
      };
      const yellowThreshold = parseInt(configMap.color_yellow_threshold ?? "5");
      const redThreshold = parseInt(configMap.color_red_threshold ?? "8");

      // Build day-level demand map
      const demandMap: Record<string, { AM: number; PM: number; NOC: number }> = {};
      for (const row of rows) {
        const dateStr = row.date instanceof Date
          ? row.date.toISOString().split("T")[0]
          : String(row.date).split("T")[0];
        if (!demandMap[dateStr]) demandMap[dateStr] = { AM: 0, PM: 0, NOC: 0 };
        demandMap[dateStr][row.shift]++;
      }

      const blackoutSet = new Set(
        blackouts.map(b => {
          const d = b.date instanceof Date ? b.date : new Date(b.date);
          return d.toISOString().split("T")[0];
        })
      );

      function getStatus(count: number, cap: number, yellow: number, red: number): { status: string; label: string } {
        if (count >= red) return { status: "red", label: "Full" };
        if (count >= yellow) return { status: "yellow", label: "Filling" };
        return { status: "green", label: "Open" };
      }

      const days: Record<string, {
        AM: { count: number; status: string; label: string; cap: number };
        PM: { count: number; status: string; label: string; cap: number };
        NOC: { count: number; status: string; label: string; cap: number };
        isBlackout: boolean;
        blackoutReason?: string;
      }> = {};

      for (let d = 1; d <= lastDay; d++) {
        const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const demand = demandMap[dateStr] ?? { AM: 0, PM: 0, NOC: 0 };
        const isBlackout = blackoutSet.has(dateStr);
        const blackoutReason = isBlackout
          ? blackouts.find(b => {
              const bd = b.date instanceof Date ? b.date : new Date(b.date);
              return bd.toISOString().split("T")[0] === dateStr;
            })?.reason ?? undefined
          : undefined;

        days[dateStr] = {
          AM: { count: demand.AM, cap: caps.AM, ...getStatus(demand.AM, caps.AM, yellowThreshold, redThreshold) },
          PM: { count: demand.PM, cap: caps.PM, ...getStatus(demand.PM, caps.PM, yellowThreshold, redThreshold) },
          NOC: { count: demand.NOC, cap: caps.NOC, ...getStatus(demand.NOC, caps.NOC, yellowThreshold, redThreshold) },
          isBlackout,
          blackoutReason,
        };
      }

      return { days, caps };
    }),

  // Get day drill-down: seniority-ranked requesters for a date
  getDayDrillDown: publicProcedure
    .input(z.object({ date: z.string(), shift: z.enum(["AM", "PM", "NOC"]) }))
    .query(async ({ input, ctx }) => {
      // Determine if caller is manager/admin
      const token = ctx.req.cookies?.[COOKIE_NAME] || ctx.req.headers.authorization?.replace("Bearer ", "");
      let isManager = false;
      if (token) {
        try {
          const payload = await verifyJwt(token);
          if (payload?.employeeId) {
            const emp = await getEmployeeById(payload.employeeId as number);
            isManager = emp?.role === "manager" || emp?.role === "admin";
          }
        } catch {}
      }

      const rows = await getRequestsForDateRange(input.date, input.date);
      const shiftRows = rows.filter(r => r.shift === input.shift);

      // Sort by seniority date (older = higher rank), then by submittedAt
      shiftRows.sort((a, b) => {
        const sa = a.seniorityDate instanceof Date ? a.seniorityDate : new Date(a.seniorityDate);
        const sb = b.seniorityDate instanceof Date ? b.seniorityDate : new Date(b.seniorityDate);
        if (sa.getTime() !== sb.getTime()) return sa.getTime() - sb.getTime();
        const ta = a.submittedAt instanceof Date ? a.submittedAt : new Date(a.submittedAt);
        const tb = b.submittedAt instanceof Date ? b.submittedAt : new Date(b.submittedAt);
        return ta.getTime() - tb.getTime();
      });

      return shiftRows.map((r, idx) => ({
        rank: idx + 1,
        requestId: r.requestId,
        employeeId: r.employeeId,
        // Managers see full names, employees see First Name + Last Initial
        displayName: isManager
          ? `${r.firstName} ${r.lastName}`
          : `${r.firstName} ${r.lastName.charAt(0)}.`,
        requestType: r.requestType,
        status: r.status,
        seniorityDate: r.seniorityDate,
        submittedAt: r.submittedAt,
        // Only managers see comments
        comment: isManager ? r.comment : undefined,
      }));
    }),

  getBlackoutDates: publicProcedure.query(async () => {
    const rows = await getBlackoutDates();
    return rows.map(b => ({
      id: b.id,
      date: b.date instanceof Date ? b.date.toISOString().split("T")[0] : String(b.date).split("T")[0],
      reason: b.reason,
    }));
  }),

  getDeadlines: publicProcedure.query(async () => {
    const rows = await getSubmissionDeadlines();
    return rows.map(d => ({
      id: d.id,
      deadlineDate: d.deadlineDate instanceof Date ? d.deadlineDate.toISOString().split("T")[0] : String(d.deadlineDate).split("T")[0],
      coverageStart: d.coverageStart instanceof Date ? d.coverageStart.toISOString().split("T")[0] : String(d.coverageStart).split("T")[0],
      coverageEnd: d.coverageEnd instanceof Date ? d.coverageEnd.toISOString().split("T")[0] : String(d.coverageEnd).split("T")[0],
      year: d.year,
    }));
  }),
});
