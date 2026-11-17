import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import express from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { authConfig, sessionCookieOptions } from "../config/auth.js";
import { ActivityLog, Session, User } from "../models/index.js";
import { createRequireAuth } from "../middleware/auth.js";
import { ApiError, validationError } from "../utils/apiError.js";
import { createSessionToken, hashSessionToken } from "../utils/sessionToken.js";

const DUMMY_PASSWORD = randomBytes(48).toString("base64url");
const DUMMY_PASSWORD_HASH = bcrypt.hash(DUMMY_PASSWORD, 12);
const INVALID_CREDENTIALS = new ApiError(
  401,
  "INVALID_CREDENTIALS",
  "Invalid email or password.",
);

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
  rememberMe: z.boolean().optional().default(false),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(1).max(128),
});

function publicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    officeId: user.officeId?.toString() ?? null,
    mustChangePassword: Boolean(user.mustChangePassword),
  };
}

function sessionResponse(user, session) {
  return {
    user: publicUser(user),
    session: {
      expiresAt: session.expiresAt.toISOString(),
      remember: session.remember,
    },
  };
}

async function logAuthActivity({ action, user, email, result, details = "" }) {
  await ActivityLog.create({
    at: new Date(),
    ...(user ? { userId: user._id, userName: user.name } : {}),
    action,
    resourceType: "auth",
    ...(email ? { resourceRef: email.slice(0, 200) } : {}),
    result,
    details,
  });
}

function parseBody(schema, body) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}

function addLoginFailure(user, now, config) {
  const nextFailureCount = (user.failedLoginCount ?? 0) + 1;
  const shouldLock = nextFailureCount >= config.loginMaxFailures;
  user.failedLoginCount = nextFailureCount;
  if (shouldLock) {
    user.lockedUntil = new Date(
      now.getTime() + config.lockoutMinutes * 60 * 1000,
    );
  }
  return shouldLock;
}

function createLoginLimiter() {
  // The in-memory store resets on restart; configure Express `trust proxy` when
  // deployed behind a reverse proxy so the limiter receives the client IP.
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        status: 429,
        code: "RATE_LIMITED",
        message: "Too many login attempts. Try again later.",
        details: null,
      });
    },
  });
}

export function createAuthRouter(config = authConfig) {
  const router = express.Router();
  const requireAuth = createRequireAuth(config);
  const loginLimiter = createLoginLimiter();

  router.post("/login", loginLimiter, async (req, res) => {
    const { email, password, rememberMe } = parseBody(loginSchema, req.body);
    const now = new Date();
    const user = await User.findOne({ email }).select("+passwordHash");
    const locked = Boolean(user?.lockedUntil && user.lockedUntil > now);
    const withinBcryptLimit = Buffer.byteLength(password, "utf8") <= 72;
    const eligible = Boolean(user?.active && !locked && withinBcryptLimit);
    const hash = eligible ? user.passwordHash : await DUMMY_PASSWORD_HASH;
    const passwordMatches = await bcrypt.compare(
      withinBcryptLimit ? password : DUMMY_PASSWORD,
      hash,
    );

    if (!eligible || !passwordMatches) {
      if (user) {
        const wasLocked = Boolean(user.lockedUntil && user.lockedUntil > now);
        const isNowLocked = addLoginFailure(user, now, config);
        await user.save();
        await logAuthActivity({
          action: "login_failed",
          user,
          email,
          result: "failure",
          details: `Failed authentication for ${email.slice(0, 200)}.`,
        });
        if (isNowLocked && !wasLocked) {
          await logAuthActivity({
            action: "account_locked",
            user,
            email,
            result: "success",
            details: `Account locked until ${user.lockedUntil.toISOString()}.`,
          });
        }
      } else {
        await logAuthActivity({
          action: "login_failed",
          email,
          result: "failure",
          details: `Failed authentication for ${email.slice(0, 200)}.`,
        });
      }
      throw INVALID_CREDENTIALS;
    }

    const previousToken = req.cookies?.[config.cookieName];
    if (previousToken) {
      await Session.updateOne(
        { tokenHash: hashSessionToken(previousToken), revokedAt: null },
        { $set: { revokedAt: now } },
      );
    }

    const token = createSessionToken();
    const sessionHash = hashSessionToken(token);
    const expiresAt = new Date(
      now.getTime() +
        (rememberMe
          ? config.rememberMeDays * 24 * 60 * 60 * 1000
          : config.sessionHours * 60 * 60 * 1000),
    );
    const absoluteExpiresAt = rememberMe
      ? new Date(now.getTime() + config.rememberMeMaxDays * 24 * 60 * 60 * 1000)
      : expiresAt;
    const session = await Session.create({
      tokenHash: sessionHash,
      userId: user._id,
      remember: rememberMe,
      createdAt: now,
      lastSeenAt: now,
      lastRenewedAt: now,
      expiresAt,
      absoluteExpiresAt,
      userAgent: String(req.get("user-agent") ?? "").slice(0, 200),
      ip: String(req.ip ?? req.socket.remoteAddress ?? ""),
    });

    user.failedLoginCount = 0;
    user.lockedUntil = null;
    user.lastLoginAt = now;
    await user.save();
    await logAuthActivity({
      action: "login",
      user,
      result: "success",
      details: rememberMe ? "Remember-me session created." : "Session created.",
    });
    res.cookie(
      config.cookieName,
      token,
      sessionCookieOptions(
        config,
        rememberMe,
        rememberMe ? expiresAt.getTime() - now.getTime() : undefined,
      ),
    );
    res.status(200).json(sessionResponse(user, session));
  });

  router.post("/logout", async (req, res) => {
    const token = req.cookies?.[config.cookieName];
    if (token) {
      const session = await Session.findOneAndUpdate(
        { tokenHash: hashSessionToken(token), revokedAt: null },
        { $set: { revokedAt: new Date() } },
      );
      if (session) {
        const user = await User.findById(session.userId);
        await logAuthActivity({
          action: "logout",
          user,
          result: "success",
          details: "Session revoked.",
        });
      }
    }
    res.clearCookie(config.cookieName, sessionCookieOptions(config, false));
    res.status(204).end();
  });

  router.get("/me", requireAuth, (req, res) => {
    res.status(200).json(sessionResponse(req.user, req.session));
  });

  router.post("/change-password", requireAuth, async (req, res) => {
    const { currentPassword, newPassword } = parseBody(
      changePasswordSchema,
      req.body,
    );
    const newPasswordBytes = Buffer.byteLength(newPassword, "utf8");
    if (newPasswordBytes < 12 || newPasswordBytes > 72) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "New password must be 12 to 72 bytes.",
        [{ field: "newPassword", message: "Must be 12 to 72 bytes." }],
      );
    }
    if (newPassword === currentPassword) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "New password must differ from the current password.",
        [
          {
            field: "newPassword",
            message: "Must differ from current password.",
          },
        ],
      );
    }
    if (Buffer.byteLength(currentPassword, "utf8") > 72) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Current password is invalid.",
        [{ field: "currentPassword", message: "Current password is invalid." }],
      );
    }

    const user = await User.findById(req.user._id).select("+passwordHash");
    const matches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!matches) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Current password is incorrect.",
        [
          {
            field: "currentPassword",
            message: "Current password is incorrect.",
          },
        ],
      );
    }

    const now = new Date();
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    user.passwordChangedAt = now;
    user.mustChangePassword = false;
    await user.save();
    await Session.updateMany(
      { userId: user._id, _id: { $ne: req.session._id }, revokedAt: null },
      { $set: { revokedAt: now } },
    );
    await logAuthActivity({
      action: "password_changed",
      user,
      result: "success",
      details: "Password changed; other sessions revoked.",
    });
    res.status(204).end();
  });

  return router;
}
