export const ROLES = Object.freeze({
  ADMIN: "admin",
  USER: "user",
});

// Frontend checks improve the experience; the backend must enforce authorization.
export const PERMISSIONS = Object.freeze({
  [ROLES.ADMIN]: Object.freeze({
    "dashboard:view": true,
    "ai:process": true,
    "record:view-all": true,
    "record:view-own": true,
    "record:edit": true,
    "record:export": true,
    "approval:view": true,
    "approval:review": true,
    "users:manage": true,
    "activity:view": true,
    "settings:manage": true,
    "data-status:view": true,
    "backup:manage": true,
    "reports:view": true,
    "reports:export": true,
    "submission-history:view": true,
    "profile:view": true,
  }),
  [ROLES.USER]: Object.freeze({
    "dashboard:view": true,
    "ai:process": true,
    "record:view-all": false,
    "record:view-own": true,
    "record:edit": false,
    "record:export": false,
    "approval:view": false,
    "approval:review": false,
    "users:manage": false,
    "activity:view": false,
    "settings:manage": false,
    "data-status:view": false,
    "backup:manage": false,
    "reports:view": false,
    "reports:export": false,
    "submission-history:view": true,
    "profile:view": true,
  }),
});

export function can(role, action) {
  return Boolean(PERMISSIONS[role]?.[action]);
}

export function canEditSubmission(role, user, submission) {
  if (!submission) return false;

  if (role === ROLES.ADMIN && can(role, "record:edit")) {
    return true;
  }

  const allowedStatuses = ["draft", "rejected"];
  const submittedBy = submission.submittedBy;
  const sameOwner =
    typeof submittedBy === "string"
      ? [user?.name, user?.sampleOwnerName, user?.id].includes(submittedBy)
      : Boolean(
          (user?.id && submittedBy?.id === user.id) ||
          [user?.name, user?.sampleOwnerName].includes(submittedBy?.name),
        );

  return sameOwner && allowedStatuses.includes(submission.status);
}
