import { describe, it, expect } from "vitest";
import { execSync } from "child_process";

describe("GITHUB_BACKUP_TOKEN", () => {
  it("should be set and allow access to the backup repo", () => {
    const token = process.env.GITHUB_BACKUP_TOKEN;
    expect(token, "GITHUB_BACKUP_TOKEN must be set").toBeTruthy();
    expect(token!.length, "Token should be at least 20 chars").toBeGreaterThan(20);

    // Verify the token can reach the backup repo via the GitHub API
    const result = execSync(
      `curl -s -o /dev/null -w "%{http_code}" -H "Authorization: token ${token}" https://api.github.com/repos/AI-Nurse-Solutions/vnc-icu-portal-backup`,
      { encoding: "utf8", timeout: 15000 }
    ).trim();

    expect(result, "GitHub API should return 200 for the backup repo").toBe("200");
  });
});
