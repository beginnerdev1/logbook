import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AuthContext } from "@/contexts/authContext";
import { useRole } from "@/hooks/useRole";
import { apiClient, isRealServiceEnabled } from "@/lib/apiClient";
import { PATHS } from "@/lib/paths";
import { DEFAULT_PROFILES } from "@/services/profileService";
import { clearLookupCache } from "@/services/lookupCache";

const isRealAuthMode = isRealServiceEnabled("auth");

export function AuthProvider({ children }) {
  const { role, setRole, user } = useRole();
  const navigate = useNavigate();
  const location = useLocation();
  const [sessionUser, setSessionUser] = useState(() => {
    if (isRealAuthMode) return null;
    try {
      const storedUser = sessionStorage.getItem("logbook-auth-user");
      return storedUser ? JSON.parse(storedUser) : null;
    } catch {
      sessionStorage.removeItem("logbook-auth-user");
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState(() => isRealAuthMode);

  const currentUser = sessionUser ?? user;
  const isAuthenticated = Boolean(sessionUser);

  const getSession = useCallback(() => sessionUser, [sessionUser]);

  useEffect(() => {
    if (!isRealAuthMode) {
      return undefined;
    }

    let shouldIgnore = false;
    apiClient
      .get("/auth/me")
      .then((payload) => {
        if (shouldIgnore) return;
        const nextUser = payload?.user ?? null;
        if (!nextUser) {
          setSessionUser(null);
          return;
        }
        setSessionUser(nextUser);
        setRole(nextUser.role);
      })
      .catch((error) => {
        if (shouldIgnore) return;
        if (error?.code === "SESSION_EXPIRED") {
          setSessionUser(null);
          if (location.pathname !== PATHS.login) {
            navigate(PATHS.login, { replace: true });
          }
        }
      })
      .finally(() => {
        if (!shouldIgnore) setIsLoading(false);
      });

    return () => {
      shouldIgnore = true;
    };
  }, [location.pathname, navigate, setRole]);

  useEffect(() => {
    const handleUnauthorized = () => {
      clearLookupCache();
      if (location.pathname === PATHS.login) {
        setSessionUser(null);
        return;
      }
      const redirectTarget = `${location.pathname}${location.search}`;
      if (!isRealAuthMode) {
        sessionStorage.setItem("logbook-return-url", redirectTarget);
      }
      setSessionUser(null);
      if (!isRealAuthMode) {
        sessionStorage.removeItem("logbook-auth-user");
      }
      navigate(PATHS.login, { replace: true });
    };

    window.addEventListener("logbook:unauthorized", handleUnauthorized);

    return () => {
      window.removeEventListener("logbook:unauthorized", handleUnauthorized);
    };
  }, [location.pathname, location.search, navigate]);

  const login = useCallback(
    async ({ email, password, rememberMe = false }) => {
      const normalizedEmail = String(email ?? "")
        .trim()
        .toLowerCase();
      const passwordValue = String(password ?? "");

      if (!normalizedEmail || !passwordValue) {
        throw new Error("Email and password are required.");
      }

      if (!normalizedEmail.includes("@")) {
        throw new Error("Enter a valid email address.");
      }

      if (isRealAuthMode) {
        const response = await apiClient.post("/auth/login", {
          email: normalizedEmail,
          password: passwordValue,
          ...(rememberMe ? { rememberMe: true } : {}),
        });

        const nextUser = response?.user ?? null;
        if (!nextUser) {
          throw new Error("Invalid email or password.");
        }

        setSessionUser(nextUser);
        setRole(nextUser.role);

        if (nextUser.mustChangePassword) {
          navigate(PATHS.changePassword, { replace: true });
          return nextUser;
        }

        const returningTo =
          !isRealAuthMode && sessionStorage.getItem("logbook-return-url");
        const target =
          returningTo &&
          returningTo.startsWith("/") &&
          returningTo !== PATHS.login
            ? returningTo
            : PATHS.dashboard;

        if (!isRealAuthMode) {
          sessionStorage.removeItem("logbook-return-url");
        }
        navigate(target, { replace: true });
        return nextUser;
      }

      if (passwordValue.length < 6) {
        throw new Error("Password must be at least 6 characters.");
      }

      const match = Object.values(DEFAULT_PROFILES).find(
        (profile) => profile.email.toLowerCase() === normalizedEmail,
      );

      if (!match) {
        throw new Error("This simulated account does not exist.");
      }

      const nextUser = { ...match, role: match.role ?? role };
      setSessionUser(nextUser);
      setRole(nextUser.role);
      sessionStorage.setItem("logbook-auth-user", JSON.stringify(nextUser));

      const returningTo =
        sessionStorage.getItem("logbook-return-url") || PATHS.dashboard;
      sessionStorage.removeItem("logbook-return-url");
      navigate(
        returningTo.startsWith("/") && returningTo !== PATHS.login
          ? returningTo
          : PATHS.dashboard,
        { replace: true },
      );

      return nextUser;
    },
    [navigate, role, setRole],
  );

  const logout = useCallback(async () => {
    clearLookupCache();
    if (isRealAuthMode) {
      try {
        await apiClient.post("/auth/logout", {});
      } catch (error) {
        if (
          error?.code !== "SESSION_EXPIRED" &&
          error?.code !== "INVALID_CREDENTIALS"
        ) {
          // ignore logout API errors in real mode and still clear the client state
        }
      }
    }

    setSessionUser(null);
    if (!isRealAuthMode) {
      sessionStorage.removeItem("logbook-auth-user");
      sessionStorage.removeItem("logbook-return-url");
    }
    navigate(PATHS.login, { replace: true });
  }, [navigate]);

  const value = useMemo(
    () => ({
      currentUser,
      isAuthenticated,
      isLoading,
      login,
      logout,
      getSession,
    }),
    [currentUser, isAuthenticated, isLoading, login, logout, getSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
