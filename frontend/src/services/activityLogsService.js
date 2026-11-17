import { listEntries } from "@/services/entriesService";

export async function listActivityLogs() {
  const { items } = await listEntries({
    page: 1,
    pageSize: 100,
    sort: { field: "createdAt", direction: "desc" },
  });

  return items
    .map((entry) => ({
      id: `${entry.id}-activity`,
      timestamp: entry.updatedAt || entry.createdAt,
      user: entry.submittedBy?.name || entry.submittedBy,
      action:
        entry.status === "approved" || entry.status === "rejected"
          ? `${entry.status} logbook entry`
          : "Submitted logbook entry",
      resource: entry.referenceNo || entry.id,
      result: "Success",
      details:
        entry.reviewerComment ||
        `${entry.logbookType} entry submitted by ${entry.submittedBy?.name || entry.submittedBy}.`,
    }))
    .sort(
      (first, second) =>
        new Date(second.timestamp).getTime() -
        new Date(first.timestamp).getTime(),
    );
}
