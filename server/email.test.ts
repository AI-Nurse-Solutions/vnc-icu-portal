import { describe, it, expect } from "vitest";
import * as dotenv from "dotenv";
dotenv.config();

describe("Email configuration", () => {
  it("SMTP_USER and SMTP_PASS are set in environment", () => {
    // These are injected as env vars by the platform
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    // We just verify they are present (non-empty strings)
    // Actual SMTP connectivity is tested at runtime
    expect(typeof smtpUser).toBe("string");
    expect(typeof smtpPass).toBe("string");
    expect(smtpUser?.length).toBeGreaterThan(0);
    expect(smtpPass?.length).toBeGreaterThan(0);
  });

  it("email module exports sendOtpEmail function", async () => {
    const emailModule = await import("./email");
    expect(typeof emailModule.sendOtpEmail).toBe("function");
    expect(typeof emailModule.sendPasswordResetEmail).toBe("function");
    expect(typeof emailModule.sendSubmissionConfirmation).toBe("function");
    expect(typeof emailModule.sendStatusChangeEmail).toBe("function");
  });
});
