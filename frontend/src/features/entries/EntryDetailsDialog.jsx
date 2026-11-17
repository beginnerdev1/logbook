import { LOGBOOK_TYPES } from "@/config/logbookTypes";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDateOnly } from "@/lib/dateOnly";
import { formatPesos } from "@/lib/money";
import { format12Hour } from "@/lib/time";

function displayFieldValue(field, entry) {
  const value =
    field.where === "details" ? entry.details?.[field.key] : entry[field.key];

  if (field.input === "office")
    return entry.officeName || value || "Not provided";
  if (field.input === "documentType") {
    return entry.documentTypeName || value || "Not provided";
  }

  if (field.input === "money") {
    return Number.isSafeInteger(value) ? formatPesos(value) : "Not provided";
  }
  if (field.input === "date") {
    if (!value) return "Not provided";
    try {
      return formatDateOnly(value);
    } catch {
      return value;
    }
  }
  if (field.input === "tracking") {
    if (!value) return "Not provided";
    const returnedTime = value.returnedTime
      ? ` at ${format12Hour(value.returnedTime)}`
      : "";
    return `${value.status === "returned" ? "Returned" : "Received"}${returnedTime}`;
  }
  return value || "Not provided";
}

function getLockedReason(role, user, entry) {
  if (role === "admin") return "This entry is locked.";
  const submittedBy = entry.submittedBy;
  const isOwner =
    (user?.name && submittedBy?.name === (user.sampleOwnerName || user.name)) ||
    (typeof submittedBy === "string" &&
      [user?.name, user?.sampleOwnerName, user?.id].includes(submittedBy));
  return isOwner
    ? "Only your draft or rejected entries can be edited."
    : "You can edit only entries you submitted.";
}

export function EntryDetailsDialog({
  entry,
  role,
  user,
  canEdit,
  history = [],
  historyLoading = false,
  detailsLoading = false,
  onClose,
  onEdit,
  onDelete,
  onReview,
}) {
  const type = entry ? LOGBOOK_TYPES[entry.logbookType] : null;
  const attachmentUrl =
    entry?.attachment?.previewUrl || entry?.attachmentUrl || entry?.imageUrl;
  const confidenceMap =
    entry?.confidenceMap || entry?.aiConfidence || entry?.confidence || {};

  return (
    <Dialog
      open={Boolean(entry)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        {entry && type && (
          <>
            <DialogHeader>
              <DialogTitle>{entry.referenceNo || "Draft"}</DialogTitle>
              <DialogDescription>{type.label}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={entry.status} />
              <span className="rounded border px-2 py-1 text-xs">
                Source: {entry.source}
              </span>
              <span className="text-sm text-muted-foreground">
                Submitted by {entry.submittedBy?.name || entry.submittedBy}
              </span>
            </div>
            {detailsLoading && (
              <p className="text-sm text-muted-foreground" role="status">
                Refreshing entry details...
              </p>
            )}
            <dl className="grid gap-4 border-y border-border py-4 sm:grid-cols-2">
              {type.fields.map((field) => {
                const confidence = confidenceMap[field.key];
                return (
                  <div key={field.key} className="space-y-1">
                    <dt className="text-xs font-medium text-muted-foreground">
                      {field.label}
                      {entry.source === "ai" && Number.isFinite(confidence) && (
                        <span className="ml-2 text-amber-700 dark:text-amber-300">
                          {Math.round(confidence * 100)}% confidence
                        </span>
                      )}
                    </dt>
                    <dd className="break-words text-sm">
                      {displayFieldValue(field, entry)}
                    </dd>
                  </div>
                );
              })}
              {entry.reviewerComment && (
                <div className="space-y-1 sm:col-span-2">
                  <dt className="text-xs font-medium text-muted-foreground">
                    Previous feedback
                  </dt>
                  <dd className="break-words text-sm">
                    {entry.reviewerComment}
                  </dd>
                </div>
              )}
            </dl>
            {attachmentUrl && (
              <figure className="space-y-2">
                <img
                  src={attachmentUrl}
                  alt={`Attachment preview for ${entry.referenceNo || "draft"}`}
                  className="max-h-72 w-full rounded border object-contain"
                />
                <figcaption className="text-xs text-muted-foreground">
                  Attachment preview
                </figcaption>
              </figure>
            )}
            <section aria-label="Edit history" className="space-y-2">
              <h3 className="text-sm font-medium">Edit history</h3>
              {historyLoading ? (
                <p className="text-sm text-muted-foreground">
                  Loading history...
                </p>
              ) : history.length ? (
                <ol className="space-y-2 border-l border-border pl-4">
                  {history.map((item) => (
                    <li key={item.id} className="text-sm">
                      <p>
                        {item.version !== undefined
                          ? `Version ${item.version}`
                          : item.action || "Updated"}
                        {item.changedFields?.length
                          ? ` · ${item.changedFields.join(", ")}`
                          : ""}
                      </p>
                      <time className="text-xs text-muted-foreground">
                        {item.changedAt}
                        {item.changedBy ? ` · ${item.changedBy}` : ""}
                      </time>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No changes recorded.
                </p>
              )}
            </section>
            <DialogFooter className="flex-wrap">
              {canEdit && !detailsLoading ? (
                <Button type="button" onClick={onEdit}>
                  Edit
                </Button>
              ) : !detailsLoading ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="outline"
                          aria-disabled="true"
                        >
                          View only
                        </Button>
                      }
                    />
                    <TooltipContent>
                      {getLockedReason(role, user, entry)}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : null}
              {entry.status === "draft" &&
                canEdit &&
                !detailsLoading &&
                onDelete && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={onDelete}
                >
                  Delete draft
                </Button>
              )}
              {onReview && !detailsLoading && entry.status === "pending" && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onReview("approved")}
                  >
                    Approve
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => onReview("rejected")}
                  >
                    Reject
                  </Button>
                </>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
