import { authConfig, sessionCookieOptions } from "../config/auth.js";
import { Session, User } from "../models/index.js";
import { ApiError } from "../utils/apiError.js";
import { hashSessionToken } from "../utils/sessionToken.js";

const SESSION_EXPIRED = new ApiError(
  401,
  "SESSION_EXPIRED",
  "Your session has expired. Please sign in again.",
);

export function createRequireAuth(config = authConfig) {
  return async function requireAuth(req, res, next) {
    try {
      const rawToken = req.cookies?.[config.cookieName];
      if (!rawToken) throw SESSION_EXPIRED;

      const now = new Date();
      const session = await Session.findOne({
        tokenHash: hashSessionToken(rawToken),
        revokedAt: null,
        expiresAt: { $gt: now },
        absoluteExpiresAt: { $gt: now },
      });
      if (!session) throw SESSION_EXPIRED;

      const user = await User.findById(session.userId);
      if (!user || !user.active) {
        await Session.updateOne(
          { _id: session._id, revokedAt: null },
          { $set: { revokedAt: now } },
        );
        throw SESSION_EXPIRED;
      }

      const renewInterval = config.sessionRenewMinutes * 60 * 1000;
      if (
        session.remember &&
        now.getTime() - session.lastRenewedAt.getTime() > renewInterval
      ) {
        const requestedExpiry = new Date(
          now.getTime() + config.rememberMeDays * 24 * 60 * 60 * 1000,
        );
        const expiresAt =
          requestedExpiry < session.absoluteExpiresAt
            ? requestedExpiry
            : session.absoluteExpiresAt;
        session.expiresAt = expiresAt;
        session.lastRenewedAt = now;
        session.lastSeenAt = now;
        await session.save();
        res.cookie(
          config.cookieName,
          rawToken,
          sessionCookieOptions(
            config,
            true,
            expiresAt.getTime() - now.getTime(),
          ),
        );
      } else if (now.getTime() - session.lastSeenAt.getTime() > renewInterval) {
        session.lastSeenAt = now;
        await session.save();
      }

      req.user = user;
      req.session = session;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireRole(role) {
  return function roleGuard(req, _res, next) {
    if (req.user?.role !== role) {
      next(new ApiError(403, "FORBIDDEN", "You are not allowed to do that."));
      return;
    }
    next();
  };
}
