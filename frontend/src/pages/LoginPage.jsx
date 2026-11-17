import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { isRealServiceEnabled } from "@/lib/apiClient";

const DEMO_ACCOUNTS = [
  {
    label: "Admin",
    email: "admin.demo@logbook.example",
    password: "password",
    role: "Admin",
  },
  {
    label: "User",
    email: "jordan.lee@logbook.example",
    password: "password",
    role: "User",
  },
];

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(6, "Password must be at least 6 characters."),
  rememberMe: z.boolean().optional().default(false),
});

export function LoginPage() {
  const { login } = useAuth();
  const [submitError, setSubmitError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const isRealAuthMode = isRealServiceEnabled("auth");

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: isRealAuthMode ? "" : "admin.demo@logbook.example",
      password: isRealAuthMode ? "" : "password",
      rememberMe: false,
    },
  });

  async function onSubmit(values) {
    try {
      setSubmitError("");
      await login(values);
      reset();
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "The login could not continue.",
      );
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <LockKeyhole aria-hidden="true" className="size-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Logbook</p>
            <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          </div>
        </div>

        <div className="mb-5 inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {isRealAuthMode ? "Real login" : "Simulated login"}
        </div>

        <form
          className="space-y-5"
          onSubmit={handleSubmit(onSubmit)}
          noValidate
        >
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="user@logbook.example"
                className="pl-9"
                aria-invalid={Boolean(errors.email)}
                {...register("email")}
              />
            </div>
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter your password"
                aria-invalid={Boolean(errors.password)}
                {...register("password")}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute top-1/2 right-2 -translate-y-1/2 px-2"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </Button>
            </div>
            {errors.password && (
              <p className="text-sm text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>

          <label className="flex items-start gap-3 rounded-xl border border-border bg-muted/25 p-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              {...register("rememberMe")}
            />
            <span>
              <span className="font-medium">
                Keep me signed in on this device
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                Do not use on shared computers.
              </span>
            </span>
          </label>

          {submitError && (
            <div
              className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {submitError}
            </div>
          )}

          {!isRealAuthMode && (
            <div className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
              <p className="mb-3 font-medium text-foreground">Demo accounts</p>
              <div className="space-y-2">
                {DEMO_ACCOUNTS.map((account) => (
                  <div
                    key={account.email}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/60 p-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {account.label}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {account.email}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setValue("email", account.email, {
                          shouldDirty: true,
                          shouldTouch: true,
                        });
                        setValue("password", account.password, {
                          shouldDirty: true,
                          shouldTouch: true,
                        });
                      }}
                    >
                      Use this account
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </div>
    </main>
  );
}
