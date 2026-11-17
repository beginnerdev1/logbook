# Authentication Design: Server-Side Sessions

Stage B7 uses opaque server-side sessions. It does not use JWTs. Session tokens are 32 cryptographically random bytes from `node:crypto`, encoded as base64url for the cookie. The database stores only a SHA-256 hex hash of the token; the raw token is never persisted or logged.

## Session Collection

The `sessions` collection stores `tokenHash`, `userId`, `remember`, `createdAt`, `lastSeenAt`, `lastRenewedAt`, `expiresAt`, `absoluteExpiresAt`, `revokedAt`, `userAgent` (truncated to 200 characters), and `ip`. Indexes are a unique `tokenHash`, a `userId` index, and a TTL index on `expiresAt` with `expireAfterSeconds: 0`. TTL deletion is asynchronous; middleware independently checks all expiration and revocation conditions.

User documents add `failedLoginCount` (default 0), `lockedUntil`, `passwordChangedAt`, and `mustChangePassword` (default false). Defaults allow existing user documents to continue working without a migration. Passwords are bcryptjs hashes at 12 rounds and are never selected into public API responses.

## Lifetimes and Cookies

Configuration is read and validated at process startup:

| Variable                | Default                               | Meaning                                                         |
| ----------------------- | ------------------------------------- | --------------------------------------------------------------- |
| `SESSION_HOURS`         | `8`                                   | Non-remembered session lifetime.                                |
| `REMEMBER_ME_DAYS`      | `14`                                  | Remember-me rolling cookie/session lifetime.                    |
| `REMEMBER_ME_MAX_DAYS`  | `30`                                  | Absolute maximum remember-me lifetime from login.               |
| `SESSION_RENEW_MINUTES` | `60`                                  | Minimum interval between renewal/last-seen database writes.     |
| `LOGIN_MAX_FAILURES`    | `5`                                   | Consecutive failures before account lockout.                    |
| `LOCKOUT_MINUTES`       | `15`                                  | Account lockout duration.                                       |
| `FRONTEND_ORIGINS`      | Four localhost origins in development | Comma-separated exact origin allowlist; required in production. |
| `NODE_ENV`              | `development`                         | Controls production cookie naming and `Secure`.                 |

Every cookie is HttpOnly, SameSite=Lax, and Path=/. `Secure` is enabled in production. Development uses `logbook_session`; production uses `__Host-logbook_session`. A normal login sets a session cookie without Max-Age and expires at `now + SESSION_HOURS`. Remember-me sets Max-Age and `expiresAt` to `now + REMEMBER_ME_DAYS`, and `absoluteExpiresAt` to `now + REMEMBER_ME_MAX_DAYS`. A remember-me request renews only after the renewal interval, caps `expiresAt` at `absoluteExpiresAt`, and sends the renewed Max-Age. Normal request processing does not write `lastSeenAt` on every request.

## Login and Lockout

Login input is validated with zod. Email is trimmed and lowercased; password length is 1–128 characters, and bcrypt inputs over 72 UTF-8 bytes are refused as invalid credentials. Unknown, incorrect, inactive, locked, and oversized-password attempts all receive the same `401 INVALID_CREDENTIALS` status and `Invalid email or password.` message. A valid dummy bcrypt hash is generated at startup and compared for unknown, inactive, locked, and oversized-password cases to keep bcrypt work uniform.

Failed attempts for an existing account increment `failedLoginCount`; reaching the configured threshold sets `lockedUntil`. Successful login clears the counter and lock, updates `lastLoginAt`, revokes a session represented by the incoming cookie if present, creates a new session, and returns only the safe user/session shape. The login endpoint has a 10-request/15-minute per-IP in-memory rate limit. Its store resets on restart; behind a reverse proxy, configure Express `trust proxy` so the client IP is correct.

## Request Authentication and Password Changes

`requireAuth` hashes the cookie value, finds a non-revoked session whose rolling and absolute expirations are future, and loads the user from MongoDB on every request. Missing or inactive users and invalid sessions return `401 SESSION_EXPIRED`; inactive-user sessions are revoked. `requireRole('admin')` returns `403 FORBIDDEN` for other roles.

Password change requires an authenticated user, verifies the current password, requires a different new password of 12–72 UTF-8 bytes, writes a 12-round bcryptjs hash, sets `passwordChangedAt`, clears `mustChangePassword`, revokes all other active sessions, and keeps the current session.

## Activity and Errors

Auth activity is written to `activityLogs` for `login`, `login_failed`, `account_locked`, `logout`, and `password_changed`. Failed-login records contain the lowercased attempted email truncated to 200 characters; passwords and raw tokens are never logged.

Every API error is `{ status, code, message, details }`. Codes used by B7 are `VALIDATION_ERROR` (400), `INVALID_CREDENTIALS` and `SESSION_EXPIRED` (401), `FORBIDDEN` and `ORIGIN_NOT_ALLOWED` (403), `UNSUPPORTED_MEDIA_TYPE` (415), and `RATE_LIMITED` (429). Unexpected server errors return a generic message without a stack trace or internal error details.

## Middleware and Origins

Middleware order is Helmet, 100 KB JSON parser, cookie parser, credentialed CORS for `FRONTEND_ORIGINS`, JSON-only enforcement for POST/PUT/PATCH/DELETE, exact `Origin` allowlist enforcement (requests without Origin are allowed), routes, and the central error handler. Origin entries must be exact HTTP(S) origins with no wildcard or path. Production startup fails when the allowlist is missing or invalid.
