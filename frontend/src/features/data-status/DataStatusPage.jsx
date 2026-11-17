import { useEffect, useState } from "react";
import { Activity, Database, Files, HardDrive, UsersRound } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getSampleDataStatus } from "@/services/dataStatusService";

const STATUS_CARDS = [
  { key: "connection", label: "Connection", description: "No external database is connected.", icon: Database },
  { key: "records", label: "Records", description: "Sample logbook entries.", icon: Files },
  { key: "users", label: "Users", description: "Sample user profiles.", icon: UsersRound },
  { key: "pending", label: "Pending", description: "Sample records awaiting review.", icon: Activity },
  { key: "storage", label: "Storage", description: "No database storage is used.", icon: HardDrive },
];

export function DataStatusPage() {
  const [snapshot, setSnapshot] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isActive = true;

    getSampleDataStatus()
      .then((result) => {
        if (isActive) {
          setSnapshot(result);
          setError("");
        }
      })
      .catch(() => {
        if (isActive) setError("Sample status data could not be checked.");
      })
      .finally(() => {
        if (isActive) setIsLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [reloadKey]);

  function checkAgain() {
    setIsLoading(true);
    setError("");
    setReloadKey((key) => key + 1);
  }

  const lastChecked = snapshot
    ? new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(snapshot.lastChecked))
    : "";

  return (
    <>
      <PageHeader
        title="Data Status"
        description="Read-only overview of this prototype's sample data."
      />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">Sample data</p>
        <div className="flex items-center gap-3">
          {lastChecked && (
            <p className="text-xs text-muted-foreground">
              Last checked <time dateTime={snapshot.lastChecked}>{lastChecked}</time>
            </p>
          )}
          <Button type="button" variant="outline" disabled={isLoading} onClick={checkAgain}>
            {isLoading ? "Checking..." : "Check again"}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-border p-5" role="alert">
          <p className="mb-3 text-sm">{error}</p>
          <Button type="button" variant="outline" onClick={checkAgain}>
            Retry check
          </Button>
        </div>
      ) : (
        <section aria-label="Sample data status" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {STATUS_CARDS.map(({ key, label, description, icon: Icon }) => (
            <div
              key={key}
              className="min-w-0 rounded-md border border-border bg-card p-4"
              aria-busy={isLoading}
            >
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2 className="text-sm text-muted-foreground">{label}</h2>
                <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
              </div>
              {isLoading ? (
                <Skeleton className="mb-3 h-7 w-32" />
              ) : (
                <p className="truncate text-lg font-semibold" title={String(snapshot[key])}>
                  {snapshot[key]}
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">{description}</p>
            </div>
          ))}
        </section>
      )}
    </>
  );
}