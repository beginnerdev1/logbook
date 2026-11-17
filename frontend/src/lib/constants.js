import { ROLES } from "@/lib/permissions";
import { PATHS } from "@/lib/paths";

export const RECORD_STATUSES = Object.freeze({
  DRAFT: "Draft",
  PENDING: "Pending",
  PROCESSING: "Processing",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  FAILED: "Failed",
});

export const PROCESSING_STATUSES = Object.freeze({
  PROCESSING: RECORD_STATUSES.PROCESSING,
  COMPLETED: "Completed",
  FAILED: RECORD_STATUSES.FAILED,
  NOT_SUBMITTED: "Not submitted",
});

export const USER_STATUSES = Object.freeze({
  ACTIVE: "Active",
  INACTIVE: "Inactive",
});

export const SYSTEM_STATUSES = Object.freeze({
  SIMULATED: "Simulated",
  NOT_CONNECTED: "Not connected",
});

export const NAV_ITEMS = Object.freeze([
  {
    id: "dashboard",
    label: "Dashboard",
    path: PATHS.dashboard,
    icon: "dashboard",
    permission: "dashboard:view",
    roles: [ROLES.ADMIN, ROLES.USER],
  },
  {
    id: "new-entry",
    label: "New Entry",
    path: PATHS.newEntry,
    icon: "ai-processing",
    permission: "ai:process",
    roles: [ROLES.ADMIN, ROLES.USER],
  },
  {
    id: "records",
    label: "Records",
    path: PATHS.records,
    icon: "records",
    permission: "record:view-all",
    roles: [ROLES.ADMIN],
  },
  {
    id: "approvals",
    label: "Approvals",
    path: PATHS.approvals,
    icon: "approvals",
    permission: "approval:view",
    roles: [ROLES.ADMIN],
  },
  {
    id: "users",
    label: "Users",
    path: PATHS.users,
    icon: "users",
    permission: "users:manage",
    roles: [ROLES.ADMIN],
  },
  {
    id: "activity-logs",
    label: "Activity Logs",
    path: PATHS.activityLogs,
    icon: "activity-logs",
    permission: "activity:view",
    roles: [ROLES.ADMIN],
  },
  {
    id: "settings",
    label: "Settings",
    path: PATHS.settings,
    icon: "settings",
    permission: "settings:manage",
    roles: [ROLES.ADMIN],
  },
  {
    id: "data-status",
    label: "Data Status",
    path: PATHS.dataStatus,
    icon: "data-status",
    permission: "data-status:view",
    roles: [ROLES.ADMIN],
  },
  {
    id: "backup-restore",
    label: "Backup & Restore",
    path: PATHS.backupRestore,
    icon: "backup-restore",
    permission: "backup:manage",
    roles: [ROLES.ADMIN],
  },
  {
    id: "reports-export",
    label: "Reports & Export",
    path: PATHS.reports,
    icon: "reports",
    permission: "reports:view",
    roles: [ROLES.ADMIN],
  },
  {
    id: "my-records",
    label: "My Records",
    path: PATHS.myRecords,
    icon: "records",
    permission: "record:view-own",
    roles: [ROLES.USER],
  },
  {
    id: "submission-history",
    label: "Submission History",
    path: PATHS.submissionHistory,
    icon: "submission-history",
    permission: "submission-history:view",
    roles: [ROLES.ADMIN, ROLES.USER],
    navigationRoles: [ROLES.USER],
  },
  {
    id: "my-profile",
    label: "My Profile",
    path: PATHS.profile,
    icon: "profile",
    permission: "profile:view",
    roles: [ROLES.ADMIN, ROLES.USER],
    navigationRoles: [ROLES.USER],
  },
]);

export const NAVIGATION = Object.freeze({
  [ROLES.ADMIN]: NAV_ITEMS.filter((item) =>
    (item.navigationRoles ?? item.roles).includes(ROLES.ADMIN),
  ),
  [ROLES.USER]: NAV_ITEMS.filter((item) =>
    (item.navigationRoles ?? item.roles).includes(ROLES.USER),
  ),
});
