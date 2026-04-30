import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB helpers ──────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getPendingRequestsForApprovalRun: vi.fn().mockResolvedValue([]),
  getRequestDates: vi.fn().mockResolvedValue([]),
  getHotDatesData: vi.fn().mockResolvedValue([]),
  getHotDateDrillDown: vi.fn().mockResolvedValue([]),
  getAllEmployeePeriodTotals: vi.fn().mockResolvedValue([]),
  getAuditLogWithActors: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
  getEmployeeById: vi.fn().mockResolvedValue({ id: 1, role: "manager", firstName: "Test", lastName: "Manager" }),
}));

// ─── Mock JWT ─────────────────────────────────────────────────────────────────
vi.mock("./_core/jwt", () => ({
  verifyJwt: vi.fn().mockResolvedValue({ employeeId: 1 }),
}));

// ─── Mock shared const ────────────────────────────────────────────────────────
vi.mock("../../shared/const", () => ({
  COOKIE_NAME: "app_session_id",
}));

import * as db from "./db";
import { managerToolsRouter } from "./routers/managerTools";

// Helper: create a fake tRPC context with a manager cookie
function makeCtx(role: "manager" | "admin" | "user" = "manager") {
  vi.mocked(db.getEmployeeById).mockResolvedValue({
    id: 1,
    role,
    firstName: "Test",
    lastName: role === "manager" ? "Manager" : role === "admin" ? "Admin" : "User",
  } as any);
  return {
    req: { cookies: { app_session_id: "fake-token" }, headers: {} },
    res: {},
    user: null,
  };
}

describe("managerToolsRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getApprovalRunData", () => {
    it("returns empty requests when no pending requests exist", async () => {
      vi.mocked(db.getPendingRequestsForApprovalRun).mockResolvedValue([]);
      const caller = managerToolsRouter.createCaller(makeCtx("manager") as any);
      const result = await caller.getApprovalRunData({ year: 2026 });
      expect(result.requests).toHaveLength(0);
      expect(result.totalPending).toBe(0);
      expect(result.cap).toBe(8);
    });

    it("throws FORBIDDEN for non-manager users", async () => {
      const caller = managerToolsRouter.createCaller(makeCtx("user") as any);
      await expect(caller.getApprovalRunData({})).rejects.toThrow();
    });
  });

  describe("getHotDates", () => {
    it("returns empty array when no data", async () => {
      vi.mocked(db.getHotDatesData).mockResolvedValue([]);
      const caller = managerToolsRouter.createCaller(makeCtx("manager") as any);
      const result = await caller.getHotDates({
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        cap: 8,
      });
      expect(result).toHaveLength(0);
    });

    it("correctly marks oversubscribed dates as hot", async () => {
      vi.mocked(db.getHotDatesData).mockResolvedValue([
        { date: new Date("2026-06-15"), shift: "AM", count: 10 as any },
        { date: new Date("2026-06-15"), shift: "PM", count: 5 as any },
      ] as any);
      const caller = managerToolsRouter.createCaller(makeCtx("manager") as any);
      const result = await caller.getHotDates({
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        cap: 8,
      });
      expect(result).toHaveLength(1);
      expect(result[0].isHot).toBe(true);
      expect(result[0].shifts.find(s => s.shift === "AM")?.overCap).toBe(true);
      expect(result[0].shifts.find(s => s.shift === "PM")?.overCap).toBe(false);
    });
  });

  describe("getCeilingTrackerData", () => {
    it("returns summary with correct counts", async () => {
      vi.mocked(db.getAllEmployeePeriodTotals).mockResolvedValue([
        {
          id: 1, firstName: "Alice", lastName: "Smith", shift: "AM",
          seniorityDate: new Date("2005-01-01"), employeeNumber: "E001", isVerified: true,
          periodA: { approved: 15, pending: 8, total: 23, p1Only: 10, overCeiling: true, atWarning: false },
          periodB: { approved: 10, pending: 5, total: 15, p1Only: 8, overCeiling: false, atWarning: true },
        },
        {
          id: 2, firstName: "Bob", lastName: "Jones", shift: "PM",
          seniorityDate: new Date("2010-01-01"), employeeNumber: "E002", isVerified: true,
          periodA: { approved: 5, pending: 3, total: 8, p1Only: 5, overCeiling: false, atWarning: false },
          periodB: { approved: 4, pending: 2, total: 6, p1Only: 4, overCeiling: false, atWarning: false },
        },
      ] as any);

      const caller = managerToolsRouter.createCaller(makeCtx("manager") as any);
      const result = await caller.getCeilingTrackerData({ year: 2026 });
      expect(result.employees).toHaveLength(2);
      expect(result.summary.total).toBe(2);
      expect(result.summary.overCeilingA).toBe(1);
      expect(result.summary.atWarningB).toBe(1);
      expect(result.employees[0].flagged).toBe(true);
      expect(result.employees[1].flagged).toBe(false);
    });
  });

  describe("getAuditLogEnhanced", () => {
    it("returns paginated audit log with actor names", async () => {
      vi.mocked(db.getAuditLogWithActors).mockResolvedValue({
        rows: [
          {
            id: 1, actorId: 1, actorName: "Test Manager",
            action: "approve_request", targetType: "request", targetId: "42",
            details: { requestId: 42 }, timestamp: new Date().toISOString(),
          },
        ],
        total: 1,
      });
      const caller = managerToolsRouter.createCaller(makeCtx("manager") as any);
      const result = await caller.getAuditLogEnhanced({ limit: 50, offset: 0 });
      expect(result.total).toBe(1);
      expect(result.rows[0].action).toBe("approve_request");
      expect(result.rows[0].actorName).toBe("Test Manager");
    });

    it("passes filters to db helper", async () => {
      vi.mocked(db.getAuditLogWithActors).mockResolvedValue({ rows: [], total: 0 });
      const caller = managerToolsRouter.createCaller(makeCtx("admin") as any);
      await caller.getAuditLogEnhanced({
        limit: 10,
        offset: 0,
        action: "approve",
        targetType: "request",
        fromDate: "2026-01-01",
        toDate: "2026-12-31",
      });
      expect(db.getAuditLogWithActors).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "approve",
          targetType: "request",
          fromDate: "2026-01-01",
          toDate: "2026-12-31",
        })
      );
    });
  });
});
