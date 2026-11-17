import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { RECORD_STATUSES } from "@/lib/constants";
import { reviewerCommentSchema } from "@/features/approvals/reviewerCommentSchema";

export function ReviewDecisionDialog({ target, onClose, onConfirm }) {
  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm({
    resolver: zodResolver(reviewerCommentSchema),
    defaultValues: { comment: "" },
  });
  const isRejection =
    target?.decision === "rejected" ||
    target?.decision === RECORD_STATUSES.REJECTED;

  useEffect(() => {
    if (target) reset({ comment: "" });
  }, [target, reset]);

  function handleInvalidSubmit() {
    toast.error("Add a reviewer comment before continuing.");
  }

  return (
    <AlertDialog
      open={Boolean(target)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent>
        {target && (
          <form
            className="space-y-5"
            noValidate
            onSubmit={handleSubmit(onConfirm, handleInvalidSubmit)}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>
                {isRejection ? "Reject submission?" : "Approve submission?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {target.record.id} will be updated in this session's sample data
                only.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Controller
              control={control}
              name="comment"
              render={({ field, fieldState }) => (
                <Field data-invalid={Boolean(fieldState.error)}>
                  <FieldLabel htmlFor="reviewer-comment">
                    Reviewer comment
                    <span aria-hidden="true" className="text-destructive">
                      *
                    </span>
                  </FieldLabel>
                  <Textarea
                    id="reviewer-comment"
                    rows={3}
                    placeholder="Add a concise review note"
                    aria-required="true"
                    aria-invalid={Boolean(fieldState.error)}
                    aria-describedby={
                      fieldState.error ? "reviewer-comment-error" : undefined
                    }
                    {...field}
                  />
                  <FieldError
                    id="reviewer-comment-error"
                    errors={fieldState.error ? [fieldState.error] : []}
                  />
                </Field>
              )}
            />
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isSubmitting}>
                Keep pending
              </AlertDialogCancel>
              <Button
                type="submit"
                variant={isRejection ? "destructive" : "default"}
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? "Saving review..."
                  : isRejection
                    ? "Confirm rejection"
                    : "Confirm approval"}
              </Button>
            </AlertDialogFooter>
          </form>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
