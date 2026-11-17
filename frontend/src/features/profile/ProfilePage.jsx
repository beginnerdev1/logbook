import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useLocation } from "react-router-dom";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PATHS } from "@/lib/paths";
import { useRole } from "@/hooks/useRole";
import { requestPasswordChange } from "@/services/profileService";
import {
  passwordChangeSchema,
  profileSchema,
} from "@/features/profile/profileSchemas";

export function ProfilePage() {
  const location = useLocation();
  const isChangePasswordMode = location.pathname === PATHS.changePassword;
  const { user, saveProfile } = useRole();
  const {
    control: profileControl,
    handleSubmit: handleProfileSubmit,
    reset: resetProfile,
    formState: { isSubmitting: isSavingProfile },
  } = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user.name, email: user.email },
  });
  const {
    control: passwordControl,
    handleSubmit: handlePasswordSubmit,
    reset: resetPassword,
    formState: { isSubmitting: isSavingPassword },
  } = useForm({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    resetProfile({ name: user.name, email: user.email });
  }, [user.name, user.email, resetProfile]);

  async function saveProfileFields(values) {
    try {
      await saveProfile(values);
      toast.success("Simulated: profile updated in this session.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "The sample profile could not be updated.",
      );
    }
  }

  async function submitPasswordChange(values) {
    try {
      await requestPasswordChange(values);
      resetPassword();
      toast.success("Other sessions were signed out.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "The password change request could not continue.";
      toast.error(message);
    }
  }

  function showProfileErrors() {
    toast.error("Correct the highlighted profile fields.");
  }

  function showPasswordErrors() {
    toast.error("Check the password fields before continuing.");
  }

  return (
    <>
      <PageHeader
        title={isChangePasswordMode ? "Change password" : "My Profile"}
        description={
          isChangePasswordMode
            ? "Enter your current password and choose a new one."
            : "Manage the permitted fields for this simulated profile."
        }
      />
      {!isChangePasswordMode && (
        <p className="mb-5 text-xs text-muted-foreground">
          Sample profile · Role: {user.title}
        </p>
      )}

      <div className="grid max-w-4xl gap-8 lg:grid-cols-2">
        {!isChangePasswordMode && (
          <section aria-labelledby="profile-details-title">
            <h2
              id="profile-details-title"
              className="mb-4 text-base font-semibold"
            >
              Profile details
            </h2>
            <form
              className="space-y-5"
              noValidate
              onSubmit={handleProfileSubmit(
                saveProfileFields,
                showProfileErrors,
              )}
            >
              <FieldGroup className="gap-4">
                <Controller
                  control={profileControl}
                  name="name"
                  render={({ field, fieldState }) => (
                    <Field data-invalid={Boolean(fieldState.error)}>
                      <FieldLabel htmlFor="profile-name">Name</FieldLabel>
                      <Input
                        id="profile-name"
                        autoComplete="name"
                        aria-invalid={Boolean(fieldState.error)}
                        aria-describedby={
                          fieldState.error ? "profile-name-error" : undefined
                        }
                        {...field}
                      />
                      <FieldError
                        id="profile-name-error"
                        errors={fieldState.error ? [fieldState.error] : []}
                      />
                    </Field>
                  )}
                />
                <Controller
                  control={profileControl}
                  name="email"
                  render={({ field, fieldState }) => (
                    <Field data-invalid={Boolean(fieldState.error)}>
                      <FieldLabel htmlFor="profile-email">Email</FieldLabel>
                      <Input
                        id="profile-email"
                        type="email"
                        autoComplete="email"
                        aria-invalid={Boolean(fieldState.error)}
                        aria-describedby={
                          fieldState.error ? "profile-email-error" : undefined
                        }
                        {...field}
                      />
                      <FieldError
                        id="profile-email-error"
                        errors={fieldState.error ? [fieldState.error] : []}
                      />
                    </Field>
                  )}
                />
                <Field>
                  <FieldLabel htmlFor="profile-role">Role</FieldLabel>
                  <Input
                    id="profile-role"
                    value={user.title}
                    disabled
                    readOnly
                  />
                </Field>
              </FieldGroup>
              <Button type="submit" disabled={isSavingProfile}>
                {isSavingProfile ? "Saving..." : "Save profile"}
              </Button>
            </form>
          </section>
        )}

        <section
          aria-labelledby="password-title"
          className={isChangePasswordMode ? "lg:col-span-2" : ""}
        >
          <h2 id="password-title" className="mb-2 text-base font-semibold">
            Change password
          </h2>
          <form
            className="space-y-5"
            noValidate
            onSubmit={handlePasswordSubmit(
              submitPasswordChange,
              showPasswordErrors,
            )}
          >
            <FieldGroup className="gap-4">
              {[
                ["currentPassword", "Current password", "current-password"],
                ["newPassword", "New password", "new-password"],
                ["confirmPassword", "Confirm new password", "new-password"],
              ].map(([name, label, autoComplete]) => (
                <Controller
                  key={name}
                  control={passwordControl}
                  name={name}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={Boolean(fieldState.error)}>
                      <FieldLabel htmlFor={`profile-${name}`}>
                        {label}
                      </FieldLabel>
                      <Input
                        id={`profile-${name}`}
                        type="password"
                        autoComplete={autoComplete}
                        aria-invalid={Boolean(fieldState.error)}
                        aria-describedby={
                          fieldState.error ? `profile-${name}-error` : undefined
                        }
                        {...field}
                      />
                      <FieldError
                        id={`profile-${name}-error`}
                        errors={fieldState.error ? [fieldState.error] : []}
                      />
                    </Field>
                  )}
                />
              ))}
            </FieldGroup>
            <Button
              type="submit"
              variant={isChangePasswordMode ? "default" : "outline"}
              disabled={isSavingPassword}
            >
              {isSavingPassword ? "Submitting..." : "Submit password change"}
            </Button>
          </form>
        </section>
      </div>
    </>
  );
}
