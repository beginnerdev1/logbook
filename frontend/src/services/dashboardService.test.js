import { describe, expect, it, vi } from "vitest";

vi.stubEnv("VITE_USE_MOCK", "true");
const { getDashboardData } = await import("@/services/dashboardService");
const { getEntryStats } = await import("@/services/entriesService");

describe("dashboard entry statistics", () => {
  it("uses full-dataset getEntryStats totals for admins", async () => {
    const [expectedStats, dashboard] = await Promise.all([
      getEntryStats({}),
      getDashboardData("admin", "Admin Demo"),
    ]);

    expect(dashboard.summary).toEqual({
      total: expectedStats.total,
      pending: expectedStats.byStatus.pending,
      approved: expectedStats.byStatus.approved,
      rejected: expectedStats.byStatus.rejected,
    });
    expect(dashboard.summary.total).toBeGreaterThan(
      dashboard.recentRecords.length,
    );
    expect(dashboard.totalUsers).toBeGreaterThan(0);
    expect(dashboard.recentActivity).toHaveLength(5);
    expect(dashboard.recentSubmissions).toHaveLength(5);
  });

  it("scopes every user dashboard count to that user's entries", async () => {
    const ownerName = "Jordan Lee";
    const expectedStats = await getEntryStats({ submittedByName: ownerName });
    const dashboard = await getDashboardData("user", ownerName);

    expect(dashboard.summary.total).toBe(expectedStats.total);
    expect(dashboard.summary.pending).toBe(expectedStats.byStatus.pending);
    expect(dashboard.summary.approved).toBe(expectedStats.byStatus.approved);
    expect(dashboard.summary.rejected).toBe(expectedStats.byStatus.rejected);
    expect(dashboard.totalUsers).toBe(0);
    expect(dashboard.recentActivity).toEqual([]);
    expect(dashboard.recentRecords.length).toBeLessThanOrEqual(5);
  });
});
