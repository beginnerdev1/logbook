import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { DataTable } from "@/components/shared/DataTable";
import { PageHeader } from "@/components/shared/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listActivityLogs } from "@/services/activityLogsService";
import { ACTIVITY_LOG_COLUMNS } from "@/features/activity-logs/activityLogColumns";

function filterLogs(logs, query) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return logs;

  return logs.filter((entry) =>
    [
      entry.timestamp,
      entry.user,
      entry.action,
      entry.resource,
      entry.result,
      entry.details,
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery),
  );
}

export function ActivityLogsPage() {
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let isActive = true;

    listActivityLogs()
      .then((items) => {
        if (isActive) {
          setLogs(items);
          setLoadError("");
        }
      })
      .catch(() => {
        if (isActive) setLoadError("Sample activity data could not be loaded.");
      })
      .finally(() => {
        if (isActive) setIsLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [reloadKey]);

  const filteredLogs = useMemo(() => filterLogs(logs, query), [logs, query]);

  function retryLoad() {
    setIsLoading(true);
    setLoadError("");
    setReloadKey((key) => key + 1);
  }

  return (
    <>
      <PageHeader
        title="Activity Logs"
        description="Search sample activity entries from this prototype."
      />
      <p className="mb-4 text-sm font-medium text-muted-foreground">
        Sample data, not a real audit log.
      </p>
      <div className="mb-4 max-w-sm">
        <Label htmlFor="activity-search">Search activity</Label>
        <div className="relative mt-1">
          <Search
            aria-hidden="true"
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="activity-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="User, action, resource, result..."
            className="pl-9"
          />
        </div>
      </div>
      <section className="overflow-hidden rounded-md border border-border bg-card">
        <DataTable
          columns={ACTIVITY_LOG_COLUMNS}
          data={filteredLogs}
          isLoading={isLoading}
          error={loadError}
          onRetry={retryLoad}
          emptyMessage={
            logs.length
              ? "No activity matches this search."
              : "No sample activity is available."
          }
          caption="Sample activity log. This is not a real audit log."
        />
      </section>
    </>
  );
}
