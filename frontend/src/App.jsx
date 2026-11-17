import { Component, lazy, Suspense, useEffect } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppLayout } from "@/components/layout/AppLayout";
import { NAV_ITEMS } from "@/lib/constants";
import { PATHS } from "@/lib/paths";
import { RoleProvider } from "@/contexts/RoleProvider";
import { AuthProvider } from "@/contexts/AuthProvider";
import { useAuth } from "@/hooks/useAuth";
import { AccessDenied } from "@/pages/AccessDenied";
import { LoginPage } from "@/pages/LoginPage";
import { NotFound } from "@/pages/NotFound";
import { WorkspacePage } from "@/pages/WorkspacePage";
import { useRole } from "@/hooks/useRole";
import { can } from "@/lib/permissions";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { warnForMissingFeaturePages } from "@/lib/featurePageRegistry";
import { isRealServiceEnabled } from "@/lib/apiClient";

const AIProcessingPage = lazy(() =>
  import("@/features/ai-processing/AIProcessingPage").then(
    ({ AIProcessingPage: page }) => ({ default: page }),
  ),
);
const RecordsPage = lazy(() =>
  import("@/features/records/RecordsPage").then(({ RecordsPage: page }) => ({
    default: page,
  })),
);
const ApprovalsPage = lazy(() =>
  import("@/features/approvals/ApprovalsPage").then(
    ({ ApprovalsPage: page }) => ({ default: page }),
  ),
);
const DashboardPage = lazy(() =>
  import("@/features/dashboard/DashboardPage").then(
    ({ DashboardPage: page }) => ({ default: page }),
  ),
);
const MyRecordsPage = lazy(() =>
  import("@/features/records/MyRecordsPage").then(
    ({ MyRecordsPage: page }) => ({
      default: page,
    }),
  ),
);
const SubmissionHistoryPage = lazy(() =>
  import("@/features/submission-history/SubmissionHistoryPage").then(
    ({ SubmissionHistoryPage: page }) => ({ default: page }),
  ),
);
const UsersPage = lazy(() =>
  import("@/features/users/UsersPage").then(({ UsersPage: page }) => ({
    default: page,
  })),
);
const ActivityLogsPage = lazy(() =>
  import("@/features/activity-logs/ActivityLogsPage").then(
    ({ ActivityLogsPage: page }) => ({ default: page }),
  ),
);
const ProfilePage = lazy(() =>
  import("@/features/profile/ProfilePage").then(({ ProfilePage: page }) => ({
    default: page,
  })),
);
const SettingsPage = lazy(() =>
  import("@/features/settings/SettingsPage").then(({ SettingsPage: page }) => ({
    default: page,
  })),
);
const ReportsPage = lazy(() =>
  import("@/features/reports/ReportsPage").then(({ ReportsPage: page }) => ({
    default: page,
  })),
);
const DataStatusPage = lazy(() =>
  import("@/features/data-status/DataStatusPage").then(
    ({ DataStatusPage: page }) => ({ default: page }),
  ),
);
const BackupRestorePage = lazy(() =>
  import("@/features/backup-restore/BackupRestorePage").then(
    ({ BackupRestorePage: page }) => ({ default: page }),
  ),
);

const FEATURE_PAGES = {
  dashboard: DashboardPage,
  "new-entry": AIProcessingPage,
  records: RecordsPage,
  "my-records": MyRecordsPage,
  approvals: ApprovalsPage,
  "submission-history": SubmissionHistoryPage,
  users: UsersPage,
  "activity-logs": ActivityLogsPage,
  "my-profile": ProfilePage,
  settings: SettingsPage,
  "reports-export": ReportsPage,
  "data-status": DataStatusPage,
  "backup-restore": BackupRestorePage,
};

if (import.meta.env.DEV) {
  warnForMissingFeaturePages(NAV_ITEMS, FEATURE_PAGES);
}

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Application error boundary caught an error:", error);
    console.error("Application component stack:", errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6">
          <div className="max-w-md rounded-lg border border-border bg-card p-6 text-center shadow-sm">
            <h1 className="text-xl font-semibold">Something went wrong</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              The simulated app hit an unexpected error. You can reload and try
              again.
            </p>
            {import.meta.env.DEV && this.state.error && (
              <details className="mt-4 text-left">
                <summary className="cursor-pointer text-sm font-medium">
                  Details
                </summary>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">
                  {`${this.state.error.message}\n\n${this.state.error.stack ?? ""}`}
                </pre>
              </details>
            )}
            <div className="mt-4 flex justify-center gap-2">
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                onClick={() => window.location.reload()}
              >
                Reload app
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function RoleGuard({ item }) {
  const { role } = useRole();

  if (!item.roles.includes(role) || !can(role, item.permission)) {
    return <AccessDenied />;
  }

  const FeaturePage = FEATURE_PAGES[item.id];

  if (FeaturePage) {
    return (
      <Suspense
        fallback={
          <div className="py-8 text-sm text-muted-foreground" role="status">
            Loading section...
          </div>
        }
      >
        <FeaturePage />
      </Suspense>
    );
  }

  return <WorkspacePage item={item} />;
}

function AppRoutes() {
  const { isAuthenticated, isLoading } = useAuth();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const isRealAuthMode = isRealServiceEnabled("auth");

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!isAuthenticated && pathname !== PATHS.login) {
      if (!isRealAuthMode) {
        sessionStorage.setItem("logbook-return-url", `${pathname}${search}`);
      }
      navigate(PATHS.login, { replace: true });
      return;
    }

    if (isAuthenticated && pathname === PATHS.login) {
      if (!isRealAuthMode) {
        sessionStorage.removeItem("logbook-return-url");
      }
      navigate(PATHS.dashboard, { replace: true });
    }
  }, [isAuthenticated, isLoading, isRealAuthMode, navigate, pathname, search]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading session...
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path={PATHS.login} element={<LoginPage />} />
        <Route path="*" element={<Navigate to={PATHS.login} replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route
          path={PATHS.aiProcessingLegacy}
          element={<Navigate to={PATHS.newEntry} replace />}
        />
        <Route path={PATHS.changePassword} element={<ProfilePage />} />
        {NAV_ITEMS.map((item) =>
          item.path === PATHS.dashboard ? (
            <Route key={item.id} index element={<RoleGuard item={item} />} />
          ) : (
            <Route
              key={item.id}
              path={item.path}
              element={<RoleGuard item={item} />}
            />
          ),
        )}
        <Route path={PATHS.accessDenied} element={<AccessDenied />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <RoleProvider>
          <AuthProvider>
            <AppErrorBoundary>
              <TooltipProvider>
                <SidebarProvider>
                  <AppRoutes />
                </SidebarProvider>
                <Toaster position="top-right" closeButton />
              </TooltipProvider>
            </AppErrorBoundary>
          </AuthProvider>
        </RoleProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
