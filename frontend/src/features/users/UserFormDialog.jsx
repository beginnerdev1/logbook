import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
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
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLES } from "@/lib/permissions";
import { createEmptyUserValues, userSchema } from "@/features/users/userSchema";

export function UserFormDialog({ open, user, onClose, onSave }) {
  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm({
    resolver: zodResolver(userSchema),
    defaultValues: createEmptyUserValues(),
  });
  const isEditing = Boolean(user);

  useEffect(() => {
    reset(
      user
        ? { name: user.name, email: user.email, role: user.role }
        : createEmptyUserValues(),
    );
  }, [user, reset, open]);

  function handleInvalidSubmit() {
    toast.error("Correct the highlighted user fields.");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <form
          className="space-y-5"
          noValidate
          onSubmit={handleSubmit(onSave, handleInvalidSubmit)}
        >
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit user" : "Add user"}</DialogTitle>
            <DialogDescription>
              Changes affect sample data in this browser session only.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="gap-4">
            <Controller
              control={control}
              name="name"
              render={({ field, fieldState }) => (
                <Field data-invalid={Boolean(fieldState.error)}>
                  <FieldLabel htmlFor="user-name">
                    Name <span aria-hidden="true" className="text-destructive">*</span>
                  </FieldLabel>
                  <Input
                    id="user-name"
                    autoComplete="name"
                    aria-required="true"
                    aria-invalid={Boolean(fieldState.error)}
                    aria-describedby={fieldState.error ? "user-name-error" : undefined}
                    {...field}
                  />
                  <FieldError
                    id="user-name-error"
                    errors={fieldState.error ? [fieldState.error] : []}
                  />
                </Field>
              )}
            />
            <Controller
              control={control}
              name="email"
              render={({ field, fieldState }) => (
                <Field data-invalid={Boolean(fieldState.error)}>
                  <FieldLabel htmlFor="user-email">
                    Email <span aria-hidden="true" className="text-destructive">*</span>
                  </FieldLabel>
                  <Input
                    id="user-email"
                    type="email"
                    autoComplete="email"
                    aria-required="true"
                    aria-invalid={Boolean(fieldState.error)}
                    aria-describedby={fieldState.error ? "user-email-error" : undefined}
                    {...field}
                  />
                  <FieldError
                    id="user-email-error"
                    errors={fieldState.error ? [fieldState.error] : []}
                  />
                </Field>
              )}
            />
            <Controller
              control={control}
              name="role"
              render={({ field, fieldState }) => (
                <Field data-invalid={Boolean(fieldState.error)}>
                  <FieldLabel htmlFor="user-role">
                    Role <span aria-hidden="true" className="text-destructive">*</span>
                  </FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger
                      id="user-role"
                      className="w-full"
                      aria-invalid={Boolean(fieldState.error)}
                      aria-describedby={fieldState.error ? "user-role-error" : undefined}
                    >
                      <SelectValue>
                        {field.value === ROLES.ADMIN ? "Admin" : "User"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ROLES.ADMIN}>Admin</SelectItem>
                      <SelectItem value={ROLES.USER}>User</SelectItem>
                    </SelectContent>
                  </Select>
                  <FieldError
                    id="user-role-error"
                    errors={fieldState.error ? [fieldState.error] : []}
                  />
                </Field>
              )}
            />
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : isEditing ? "Save changes" : "Add user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}