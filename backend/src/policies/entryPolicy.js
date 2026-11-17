function idOf(value) {
  if (value == null) return null;
  if (typeof value === "object") {
    return value._id?.toString() ?? value.id?.toString() ?? value.toString();
  }
  return value.toString();
}

function isOwner(user, entry) {
  return idOf(user?._id ?? user?.id) === idOf(entry?.submittedBy);
}

export function canView(user, entry) {
  return user?.role === "admin" || isOwner(user, entry);
}

export function canEdit(user, entry) {
  return (
    user?.role === "admin" ||
    (isOwner(user, entry) && ["draft", "rejected"].includes(entry?.status))
  );
}

export function canDeleteDraft(user, entry) {
  return (
    user?.role !== "admin" &&
    isOwner(user, entry) && entry?.status === "draft" && !entry?.referenceNo
  );
}

export function canSubmit(user, entry) {
  return isOwner(user, entry) && ["draft", "rejected"].includes(entry?.status);
}

export function canReview(user, entry) {
  return user?.role === "admin" && entry?.status === "pending";
}
