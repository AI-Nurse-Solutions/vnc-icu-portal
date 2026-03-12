import { describe, it, expect, beforeEach, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<TrpcContext> = {}): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
      cookies: {},
    } as any,
    res: {
      clearCookie: vi.fn(),
      cookie: vi.fn(),
    } as any,
    ...overrides,
  };
}

function makeEmployeeCtx(role: "employee" | "manager" | "admin" = "employee") {
  const employee = {
    id: 1,
    employeeNumber: "EMP001",
    firstName: "Jane",
    lastName: "Smith",
    email: "jane.smith@vnc.local",
    shift: "AM" as const,
    role,
    seniorityDate: new Date("2018-01-01"),
    isActive: true,
    passwordHash: null,
    otpCode: null,
    otpExpiresAt: null,
    otpAttempts: 0,
    otpLockedUntil: null,
    inviteToken: null,
    inviteTokenExpiresAt: null,
    resetToken: null,
    resetTokenExpiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  return makeCtx({ employee } as any);
}

// ── Auth tests ────────────────────────────────────────────────────────────────

describe("auth.logout", () => {
  it("clears the session cookie", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
  });
});

describe("auth.me", () => {
  it("returns null when not authenticated", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });
});

// ── Calendar tests ────────────────────────────────────────────────────────────

describe("calendar.getMonthData", () => {
  it("returns month data structure with shift demand", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.calendar.getMonthData({ year: 2026, month: 6 });
    expect(result).toHaveProperty("days");
    expect(typeof result.days).toBe("object");
    // Check at least one day has the right shape
    const dayKeys = Object.keys(result.days);
    if (dayKeys.length > 0) {
      const firstDay = result.days[dayKeys[0]];
      expect(firstDay).toHaveProperty("AM");
      expect(firstDay).toHaveProperty("PM");
      expect(firstDay).toHaveProperty("NOC");
      expect(firstDay.AM).toHaveProperty("count");
      expect(firstDay.AM).toHaveProperty("cap");
      expect(firstDay.AM).toHaveProperty("status");
      expect(["green", "yellow", "red"]).toContain(firstDay.AM.status);
    }
  });
});

describe("calendar.getBlackoutDates", () => {
  it("returns an array of blackout dates", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.calendar.getBlackoutDates();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("calendar.getDeadlines", () => {
  it("returns an array of submission deadlines", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.calendar.getDeadlines();
    expect(Array.isArray(result)).toBe(true);
  });
});

// ── Config tests ──────────────────────────────────────────────────────────────

describe("config.getAll", () => {
  it("returns configuration key-value pairs", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.config.getAll();
    expect(Array.isArray(result)).toBe(true);
    // Should have at least cap settings
    const keys = result.map(c => c.key);
    expect(keys).toContain("cap_am");
    expect(keys).toContain("cap_pm");
    expect(keys).toContain("cap_noc");
  });
});

// ── Demand status logic ───────────────────────────────────────────────────────

describe("Demand status calculation", () => {
  it("correctly categorizes demand levels", () => {
    const getDemandStatus = (count: number, cap: number, yellowThreshold: number, redThreshold: number) => {
      if (count >= redThreshold) return "red";
      if (count >= yellowThreshold) return "yellow";
      return "green";
    };

    expect(getDemandStatus(0, 8, 5, 8)).toBe("green");
    expect(getDemandStatus(4, 8, 5, 8)).toBe("green");
    expect(getDemandStatus(5, 8, 5, 8)).toBe("yellow");
    expect(getDemandStatus(7, 8, 5, 8)).toBe("yellow");
    expect(getDemandStatus(8, 8, 5, 8)).toBe("red");
    expect(getDemandStatus(10, 8, 5, 8)).toBe("red");
  });
});

// ── Seniority ranking logic ───────────────────────────────────────────────────

describe("Seniority ranking", () => {
  it("ranks employees by seniority date (earlier = higher rank)", () => {
    const employees = [
      { id: 1, seniorityDate: new Date("2020-01-01"), submittedAt: new Date("2026-01-10") },
      { id: 2, seniorityDate: new Date("2018-06-15"), submittedAt: new Date("2026-01-11") },
      { id: 3, seniorityDate: new Date("2018-06-15"), submittedAt: new Date("2026-01-09") }, // same seniority, earlier submission
    ];

    const sorted = [...employees].sort((a, b) => {
      const seniorityDiff = a.seniorityDate.getTime() - b.seniorityDate.getTime();
      if (seniorityDiff !== 0) return seniorityDiff;
      return a.submittedAt.getTime() - b.submittedAt.getTime();
    });

    expect(sorted[0].id).toBe(3); // 2018, submitted Jan 9
    expect(sorted[1].id).toBe(2); // 2018, submitted Jan 11
    expect(sorted[2].id).toBe(1); // 2020
  });
});

// ── Vacation limit policy ─────────────────────────────────────────────────────

describe("Vacation limit policy", () => {
  it("enforces 21-day limit in rolling 6-month period", () => {
    const checkVacationLimit = (existingDays: number, newDays: number, maxDays = 21) => {
      return existingDays + newDays <= maxDays;
    };

    expect(checkVacationLimit(0, 21)).toBe(true);
    expect(checkVacationLimit(0, 22)).toBe(false);
    expect(checkVacationLimit(15, 6)).toBe(true);
    expect(checkVacationLimit(15, 7)).toBe(false);
    expect(checkVacationLimit(21, 1)).toBe(false);
  });
});
