import "dotenv/config";

const DEVELOPMENT_ORIGINS = [
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:5174",
  "http://localhost:5174",
];

function positiveInteger(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function parseOrigin(value) {
  const origin = value.trim();
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error(`FRONTEND_ORIGINS contains an invalid origin: ${origin}`);
  }

  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.origin !== origin ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password ||
    origin.includes("*")
  ) {
    throw new Error(
      `FRONTEND_ORIGINS entries must be exact origins without paths: ${origin}`,
    );
  }
  return origin;
}

const nodeEnv = process.env.NODE_ENV?.trim() || "development";
const configuredOrigins = process.env.FRONTEND_ORIGINS;
if (nodeEnv === "production" && !configuredOrigins?.trim()) {
  throw new Error("FRONTEND_ORIGINS is required in production.");
}
const frontendOrigins = (configuredOrigins ?? DEVELOPMENT_ORIGINS.join(","))
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)
  .map(parseOrigin);

if (frontendOrigins.length === 0) {
  throw new Error("FRONTEND_ORIGINS must contain at least one origin.");
}

const sessionHours = positiveInteger("SESSION_HOURS", 8);
const rememberMeDays = positiveInteger("REMEMBER_ME_DAYS", 14);
const rememberMeMaxDays = positiveInteger("REMEMBER_ME_MAX_DAYS", 30);
const sessionRenewMinutes = positiveInteger("SESSION_RENEW_MINUTES", 60);
const loginMaxFailures = positiveInteger("LOGIN_MAX_FAILURES", 5);
const lockoutMinutes = positiveInteger("LOCKOUT_MINUTES", 15);

if (rememberMeDays > rememberMeMaxDays) {
  throw new Error("REMEMBER_ME_DAYS cannot exceed REMEMBER_ME_MAX_DAYS.");
}

export const authConfig = Object.freeze({
  nodeEnv,
  frontendOrigins: Object.freeze(frontendOrigins),
  sessionHours,
  rememberMeDays,
  rememberMeMaxDays,
  sessionRenewMinutes,
  loginMaxFailures,
  lockoutMinutes,
  cookieName:
    nodeEnv === "production" ? "__Host-logbook_session" : "logbook_session",
});

export function sessionCookieOptions(config, remember, maxAge) {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: config.nodeEnv === "production",
    ...(remember ? { maxAge } : {}),
  };
}
