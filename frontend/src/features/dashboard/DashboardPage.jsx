import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, Check, Clock3, Files, UsersRound, X } from "lucide-react";
import { DataTable } from "@/components/shared/DataTable";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ROLES } from "@/lib/permissions";
import { PATHS } from "@/lib/paths";
import { useRole } from "@/hooks/useRole";
import { getDashboardData } from "@/services/dashboardService";
import { DASHBOARD_COLUMNS } from "@/features/dashboard/dashboardColumns";
import { DevOnlyMockNote } from "@/components/shared/DevOnlyMockNote";

const SUMMARY_CARDS = [
  { key: "total", label: "Total entries", icon: Files },
  { key: "pending", label: "Pending", icon: Clock3 },
  { key: "approved", label: "Approved", icon: Check },
  { key: "rejected", label: "Rejected", icon: X },
];

function formatDateTime(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function DashboardPage() {
  const { role, user } = useRole();
  const [result, setResult] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const isAdmin = role === ROLES.ADMIN;
  const requestKey = `${role}:${user.name}:${reloadKey}`;
  const isCurrentResult = result?.requestKey === requestKey;
  const dashboard = isCurrentResult ? result.data : null;
  const error = isCurrentResult ? result.error : "";
  const isLoading = !isCurrentResult;

  useEffect(() => {
    let isActive = true;

    getDashboardData(role, user.sampleOwnerName ?? user.name)
      .then((data) => {
        if (isActive) {
          setResult({ requestKey, data, error: "" });
        }
      })
      .catch(() => {
        if (isActive) {
          setResult({
            requestKey,
            data: null,
            error: "Sample dashboard data could not be loaded.",
          });
        }
      });

    return () => {
      isActive = false;
    };
  }, [role, user.name, user.sampleOwnerName, reloadKey, requestKey]);

  function retryLoad() {
    setReloadKey((key) => key + 1);
  }

  const summaryCards = [
    ...SUMMARY_CARDS,
    ...(isAdmin
      ? [{ key: "totalUsers", label: "Total users", icon: UsersRound }]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          isAdmin
            ? "Overview of all sample logbook activity."
            : `Overview of ${user.name}'s sample records.`
        }
      />

      <DevOnlyMockNote />

      {error ? (
        <div
          className="flex flex-col items-start gap-3 rounded-md border border-border p-5"
          role="alert"
        >
          <p className="text-sm">{error}</p>
          <Button type="button" variant="outline" onClick={retryLoad}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          <section
            aria-label="Record summary"
            className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
          >
            {summaryCards.map(({ key, label, icon: Icon }) => (
              <div
                key={key}
                className="min-w-0 rounded-md border border-border bg-card p-4"
                aria-busy={isLoading}
              >
                <div className="mb-4 flex items-center justify-between gap-2">
                  <h2 className="text-sm text-muted-foreground">{label}</h2>
                  <Icon
                    aria-hidden="true"
                    className="size-4 text-muted-foreground"
                  />
                </div>
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <p className="text-2xl font-semibold tabular-nums">
                    {key === "totalUsers"
                      ? dashboard.totalUsers
                      : dashboard.summary[key]}
                  </p>
                )}
              </div>
            ))}
          </section>

          {isAdmin && (
            <section aria-labelledby="recent-activity-title" className="mb-8">
              <div className="mb-3 flex items-center gap-2">
                <Activity
                  aria-hidden="true"
                  className="size-4 text-muted-foreground"
                />
                <h2
                  id="recent-activity-title"
                  className="text-base font-semibold"
                >
                  Recent activity
                </h2>
              </div>
              {isLoading ? (
                <div className="space-y-3" aria-busy="true">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : dashboard.recentActivity.length ? (
                <ul className="divide-y divide-border border-y border-border">
                  {dashboard.recentActivity.map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3"
                    >
                      <p className="min-w-0 text-sm">
                        <span className="font-medium">
                          {item.actor || "Sample user"}
                        </span>{" "}
                        {item.action}{" "}
                        <span className="font-medium">{item.recordId}</span>
                      </p>
                      <time
                        className="shrink-0 text-xs text-muted-foreground"
                        dateTime={item.timestamp}
                      >
                        {formatDateTime(item.timestamp)}
                      </time>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="border-y border-border py-6 text-sm text-muted-foreground">
                  No sample activity is available.
                </p>
              )}
            </section>
          )}

          <section aria-labelledby="recent-records-title">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2
                  id="recent-records-title"
                  className="text-base font-semibold"
                >
                  {isAdmin ? "Recent submissions" : "My recent records"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {isAdmin
                    ? "Latest submissions from all sample users."
                    : "Latest submissions associated with your simulated user."}
                </p>
              </div>
              {isAdmin && (
                <Button
                  variant="outline"
                  render={<Link to={PATHS.submissionHistory} />}
                  nativeButton={false}
                >
                  View all submissions
                </Button>
              )}
            </div>
            <section className="overflow-hidden rounded-md border border-border bg-card">
              <DataTable
                columns={DASHBOARD_COLUMNS}
                data={dashboard?.recentRecords ?? []}
                isLoading={isLoading}
                error={error}
                onRetry={retryLoad}
                emptyMessage="No sample records are available for this user."
                caption={
                  isAdmin
                    ? "Recent sample submissions from all users"
                    : "Recent sample records for the current user"
                }
              />
            </section>
          </section>
        </>
      )}
    </>
  );
}
