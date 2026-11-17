import { getEntryStats, listEntries } from "@/services/entriesService";
import { listUsers } from "@/services/usersService";
import { ROLES } from "@/lib/permissions";
import { listActivityLogs } from "@/services/activityLogsService";
import { mockApiAdapter } from "@/services/adapters/mockApiAdapter";

export async function getDashboardData(role, userName) {
  const isAdmin = role === ROLES.ADMIN;
  const scope = isAdmin ? {} : { submittedByName: userName };
  const [stats, recentResult, users, activity] = await Promise.all([
    getEntryStats(scope, mockApiAdapter),
    listEntries({
      page: 1,
      pageSize: 5,
      sort: { field: "createdAt", direction: "desc" },
      filters: scope,
      adapter: mockApiAdapter,
    }),
    isAdmin ? listUsers() : Promise.resolve([]),
    isAdmin ? listActivityLogs() : Promise.resolve([]),
  ]);
  const recentRecords = recentResult.items.map((entry) => ({
    id: entry.referenceNo || "Draft",
    date: entry.entryDate,
    name: entry.name,
    particulars: entry.particulars || entry.details?.purposeOfTravel || "",
    submittedBy: entry.submittedBy?.name || entry.submittedBy,
    status: entry.status,
  }));

  return {
    summary: {
      total: stats.total,
      pending: stats.byStatus.pending,
      approved: stats.byStatus.approved,
      rejected: stats.byStatus.rejected,
    },
    totalUsers: users.length,
    recentRecords,
    recentSubmissions: isAdmin ? recentRecords : [],
    recentActivity: activity.slice(0, 5).map((item) => ({
      id: item.id,
      recordId: item.resource,
      actor: item.user,
      action: item.action.toLowerCase(),
      timestamp: item.timestamp,
    })),
  };
}
