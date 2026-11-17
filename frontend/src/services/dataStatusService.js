import { getEntryStats } from "@/services/entriesService";
import { listUsers } from "@/services/usersService";

export async function getSampleDataStatus() {
  const [stats, users] = await Promise.all([getEntryStats(), listUsers()]);

  return {
    lastChecked: new Date().toISOString(),
    connection: "Mock services",
    records: stats.total,
    users: users.length,
    pending: stats.byStatus.pending,
    storage: "Browser memory",
  };
}
