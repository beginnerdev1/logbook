import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { authConfig } from "../src/config/auth.js";
import {
  captureCollectionBaseline,
  compareCollectionBaseline,
  connectTestDb,
  countActivityLogsAdded,
  deleteExactIds,
  findIds,
} from "./verificationDb.js";
import { createApp, createRequireAuth } from "../src/app.js";
import { requireRole } from "../src/middleware/auth.js";
import { ActivityLog, Session, User } from "../src/models/index.js";
import { hashSessionToken } from "../src/utils/sessionToken.js";

const testTag = `b7-${randomUUID().replaceAll("-", "")}`;
const initialPassword = "B7-Initial-Password-2026!";
const createdUsers = [];
const servers = [];
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, status: passed ? "PASS" : "FAIL", detail });
}

async function runCheck(name, check) {
  try {
    record(name, true, (await check()) ?? "");
  } catch (error) {
    record(
      name,
      false,
      error instanceof Error ? error.message : "Check failed.",
    );
  }
}

async function createTestUser({ role = "user", active = true } = {}) {
  const sequence = createdUsers.length + 1;
  const user = await User.create({
    name: `B7 Verify ${sequence}`,
    email: `${testTag}-${sequence}@example.test`,
    passwordHash: await bcrypt.hash(initialPassword, 12),
    role,
    active,
  });
  createdUsers.push(user);
  return user;
}

async function launch(config = authConfig) {
  const app = createApp({
    config,
    registerRoutes(testApp) {
      testApp.get(
        "/__auth_verify/admin-only",
        createRequireAuth(config),
        requireRole("admin"),
        (_req, res) => res.status(200).json({ allowed: true }),
      );
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}

function cookieFrom(response, name) {
  const lines =
    response.headers.getSetCookie?.() ??
    [response.headers.get("set-cookie")].filter(Boolean);
  const line = lines.find((value) => value.startsWith(`${name}=`));
  if (!line) throw new Error("Expected a session Set-Cookie header.");
  return { line, cookie: line.split(";", 1)[0] };
}

async function jsonRequest(
  base,
  path,
  { method = "GET", body, cookie, origin } = {},
) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  if (origin) headers.Origin = origin;
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let payload = null;
  if (response.status !== 204) {
    payload = await response.json().catch(() => null);
  }
  return { response, payload };
}

async function login(
  base,
  user,
  { rememberMe = false, origin, cookieName = authConfig.cookieName } = {},
) {
  const { response, payload } = await jsonRequest(base, "/api/auth/login", {
    method: "POST",
    body: { email: user.email, password: initialPassword, rememberMe },
    origin,
  });
  return {
    response,
    payload,
    ...(response.ok ? cookieFrom(response, cookieName) : {}),
  };
}

async function cleanup() {
  const ids = createdUsers.map((user) => user._id);
  if (ids.length) {
    await deleteExactIds(
      Session,
      await findIds(Session, { userId: { $in: ids } }),
    );
    const activityIds = await findIds(ActivityLog, {
      $or: [
        { userId: { $in: ids } },
        { resourceRef: { $regex: `^${testTag}`, $options: "i" } },
      ],
    });
    await deleteExactIds(ActivityLog, activityIds);
    await deleteExactIds(User, ids);
  }
}

async function closeServers() {
  await Promise.all(
    servers.map(
      (server) => new Promise((resolve) => server.close(() => resolve())),
    ),
  );
}

function addDatabaseVerificationResult() {
  const args = ["scripts/dbVerify.js"];
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const checkLines = output
    .split(/\r?\n/)
    .filter((line) => /^.+\s\|\s(?:PASS|FAIL)\s\|/.test(line));
  const overallPassed =
    result.status === 0 && output.includes("Overall | PASS");
  for (const line of checkLines) {
    const [name, status, detail] = line.split("|").map((part) => part.trim());
    record(`db:verify ${name}`, status === "PASS" && overallPassed, detail);
  }
  if (!checkLines.length) {
    record(
      "db:verify seeded collection checks",
      false,
      output.trim().slice(-500) || "UNVERIFIED: db:verify produced no table.",
    );
  }
}

let connected = false;
let baseline;
let contractBase;
let lockedUser;
try {
  await connectTestDb();
  connected = true;
  baseline = await captureCollectionBaseline();

  const wrongPasswordUser = await createTestUser();
  lockedUser = await createTestUser();
  const normalUser = await createTestUser();
  const rememberUser = await createTestUser();
  const expiredUser = await createTestUser();
  const absoluteExpiredUser = await createTestUser();
  const inactiveUser = await createTestUser();
  const changePasswordUser = await createTestUser();
  const roleUser = await createTestUser();
  const adminUser = await createTestUser({ role: "admin" });

  contractBase = await launch();

  await runCheck("Wrong and unknown credentials are identical", async () => {
    const wrong = await jsonRequest(contractBase, "/api/auth/login", {
      method: "POST",
      body: { email: wrongPasswordUser.email, password: "wrong-password" },
    });
    const unknown = await jsonRequest(contractBase, "/api/auth/login", {
      method: "POST",
      body: {
        email: `${testTag}-unknown@example.test`,
        password: "wrong-password",
      },
    });
    const oversized = await jsonRequest(contractBase, "/api/auth/login", {
      method: "POST",
      body: { email: wrongPasswordUser.email, password: "x".repeat(73) },
    });
    const fields = ({ response, payload }) => ({
      status: response.status,
      code: payload?.code,
      message: payload?.message,
    });
    if (
      JSON.stringify(fields(wrong)) !== JSON.stringify(fields(unknown)) ||
      JSON.stringify(fields(wrong)) !== JSON.stringify(fields(oversized))
    ) {
      throw new Error("Credential failure responses differ.");
    }
    if (
      wrong.response.status !== 401 ||
      wrong.payload?.code !== "INVALID_CREDENTIALS" ||
      wrong.payload?.message !== "Invalid email or password."
    ) {
      throw new Error("Credential failures did not use the required response.");
    }
  });

  await runCheck(
    "Fifth failure locks account until lockout expires",
    async () => {
      for (
        let attempt = 0;
        attempt < authConfig.loginMaxFailures;
        attempt += 1
      ) {
        const failed = await jsonRequest(contractBase, "/api/auth/login", {
          method: "POST",
          body: { email: lockedUser.email, password: "wrong-password" },
        });
        if (failed.response.status !== 401) {
          throw new Error(`Failure ${attempt + 1} was not rejected.`);
        }
      }
      const lockedUntil = (await User.findById(lockedUser._id)).lockedUntil;
      const refused = await jsonRequest(contractBase, "/api/auth/login", {
        method: "POST",
        body: { email: lockedUser.email, password: initialPassword },
      });
      if (
        !lockedUntil ||
        lockedUntil <= new Date() ||
        refused.response.status !== 401 ||
        refused.payload?.code !== "INVALID_CREDENTIALS"
      ) {
        throw new Error("Correct password was not refused during lockout.");
      }
      await User.updateOne(
        { _id: lockedUser._id },
        { $set: { lockedUntil: new Date(Date.now() - 1000) } },
      );
      const accepted = await jsonRequest(contractBase, "/api/auth/login", {
        method: "POST",
        body: { email: lockedUser.email, password: initialPassword },
      });
      if (accepted.response.status !== 200) {
        throw new Error(
          "Correct password remained blocked after lockout expiry.",
        );
      }
    },
  );

  await runCheck("Origin allowlist and non-JSON writes", async () => {
    for (const origin of authConfig.frontendOrigins) {
      const allowed = await fetch(`${contractBase}/api/auth/login`, {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type",
        },
      });
      if (
        allowed.status !== 204 ||
        allowed.headers.get("access-control-allow-origin") !== origin
      ) {
        throw new Error(`Configured origin was not allowed: ${origin}`);
      }
    }
    const wrongOrigin = await jsonRequest(contractBase, "/api/auth/login", {
      method: "POST",
      body: { email: wrongPasswordUser.email, password: initialPassword },
      origin: "https://outside.example",
    });
    if (
      wrongOrigin.response.status !== 403 ||
      wrongOrigin.payload?.code !== "ORIGIN_NOT_ALLOWED"
    ) {
      throw new Error("Unlisted origin was not rejected.");
    }
    const unsupported = await fetch(`${contractBase}/api/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "logout",
    });
    const unsupportedBody = await unsupported.json();
    if (
      unsupported.status !== 415 ||
      unsupportedBody.code !== "UNSUPPORTED_MEDIA_TYPE"
    ) {
      throw new Error("Non-JSON mutation was not rejected.");
    }
  });

  await runCheck("/me requires a session", async () => {
    const { response, payload } = await jsonRequest(
      contractBase,
      "/api/auth/me",
    );
    if (response.status !== 401 || payload?.code !== "SESSION_EXPIRED") {
      throw new Error("Unauthenticated /me did not return SESSION_EXPIRED.");
    }
  });

  contractBase = await launch();

  const normalLogin = await login(contractBase, normalUser);
  await runCheck("Normal login cookie flags and /me response", async () => {
    const header = normalLogin.line;
    if (
      !/HttpOnly/i.test(header) ||
      !/SameSite=Lax/i.test(header) ||
      /;\s*Secure(?:;|$)/i.test(header) ||
      /Max-Age=/i.test(header)
    ) {
      throw new Error("Session cookie flags or persistence do not match.");
    }
    const me = await jsonRequest(contractBase, "/api/auth/me", {
      cookie: normalLogin.cookie,
    });
    if (
      me.response.status !== 200 ||
      me.payload?.user?.id !== normalUser._id.toString() ||
      Object.hasOwn(me.payload?.user ?? {}, "passwordHash")
    ) {
      throw new Error("/me did not return the safe authenticated user shape.");
    }
  });

  await runCheck("Raw session token is never stored", async () => {
    const rawToken = normalLogin.cookie.slice(
      normalLogin.cookie.indexOf("=") + 1,
    );
    const session = await Session.findOne({
      tokenHash: hashSessionToken(rawToken),
    });
    if (
      !session ||
      session.tokenHash === rawToken ||
      !/^[0-9a-f]{64}$/.test(session.tokenHash)
    ) {
      throw new Error("Session token hash was not stored correctly.");
    }
  });

  await runCheck("Logout revokes cookie idempotently", async () => {
    const loggedOut = await jsonRequest(contractBase, "/api/auth/logout", {
      method: "POST",
      body: {},
      cookie: normalLogin.cookie,
    });
    const oldCookie = await jsonRequest(contractBase, "/api/auth/me", {
      cookie: normalLogin.cookie,
    });
    const noCookieLogout = await jsonRequest(contractBase, "/api/auth/logout", {
      method: "POST",
      body: {},
    });
    if (
      loggedOut.response.status !== 204 ||
      oldCookie.response.status !== 401 ||
      noCookieLogout.response.status !== 204
    ) {
      throw new Error("Logout did not revoke or behave idempotently.");
    }
  });

  const rememberLogin = await login(contractBase, rememberUser, {
    rememberMe: true,
  });
  await runCheck("Remember-me Max-Age and bounded renewal", async () => {
    const expectedMaxAge = authConfig.rememberMeDays * 24 * 60 * 60;
    if (
      !new RegExp(`Max-Age=${expectedMaxAge}(?:;|$)`, "i").test(
        rememberLogin.line,
      )
    ) {
      throw new Error("Remember-me cookie Max-Age is incorrect.");
    }
    const rawToken = rememberLogin.cookie.slice(
      rememberLogin.cookie.indexOf("=") + 1,
    );
    const session = await Session.findOne({
      tokenHash: hashSessionToken(rawToken),
    });
    const oldExpiry = session.expiresAt;
    const oldRenewal = new Date(
      Date.now() - (authConfig.sessionRenewMinutes + 1) * 60 * 1000,
    );
    await Session.updateOne(
      { _id: session._id },
      { $set: { lastRenewedAt: oldRenewal } },
    );
    const renewed = await jsonRequest(contractBase, "/api/auth/me", {
      cookie: rememberLogin.cookie,
    });
    const afterRenewal = await Session.findById(session._id);
    const renewalCookie = (
      renewed.response.headers.getSetCookie?.() ??
      [renewed.response.headers.get("set-cookie")].filter(Boolean)
    ).find((line) => line.startsWith(`${authConfig.cookieName}=`));
    if (
      renewed.response.status !== 200 ||
      afterRenewal.expiresAt <= oldExpiry ||
      afterRenewal.expiresAt > afterRenewal.absoluteExpiresAt ||
      !renewalCookie
    ) {
      throw new Error("Remember-me renewal did not extend within its cap.");
    }

    const now = new Date();
    const absoluteCap = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    await Session.updateOne(
      { _id: session._id },
      {
        $set: {
          expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
          absoluteExpiresAt: absoluteCap,
          lastRenewedAt: new Date(
            now.getTime() - (authConfig.sessionRenewMinutes + 1) * 60 * 1000,
          ),
        },
      },
    );
    await jsonRequest(contractBase, "/api/auth/me", {
      cookie: rememberLogin.cookie,
    });
    const cappedSession = await Session.findById(session._id);
    if (cappedSession.expiresAt > cappedSession.absoluteExpiresAt) {
      throw new Error("Renewed expiration exceeded absoluteExpiresAt.");
    }
    await Session.updateOne(
      { _id: session._id },
      {
        $set: {
          absoluteExpiresAt: new Date(Date.now() - 1000),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      },
    );
    const absoluteExpired = await jsonRequest(contractBase, "/api/auth/me", {
      cookie: rememberLogin.cookie,
    });
    if (
      absoluteExpired.response.status !== 401 ||
      absoluteExpired.payload?.code !== "SESSION_EXPIRED"
    ) {
      throw new Error("Session past absoluteExpiresAt was accepted.");
    }
  });

  const expiredLogin = await login(contractBase, expiredUser);
  await runCheck("Expired expiresAt session is rejected", async () => {
    const rawToken = expiredLogin.cookie.slice(
      expiredLogin.cookie.indexOf("=") + 1,
    );
    await Session.updateOne(
      { tokenHash: hashSessionToken(rawToken) },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    const response = await jsonRequest(contractBase, "/api/auth/me", {
      cookie: expiredLogin.cookie,
    });
    if (
      response.response.status !== 401 ||
      response.payload?.code !== "SESSION_EXPIRED"
    ) {
      throw new Error("Expired session was accepted.");
    }
  });

  const inactiveLogin = await login(contractBase, inactiveUser);
  await runCheck(
    "Deactivated account invalidates existing session",
    async () => {
      await User.updateOne(
        { _id: inactiveUser._id },
        { $set: { active: false } },
      );
      const response = await jsonRequest(contractBase, "/api/auth/me", {
        cookie: inactiveLogin.cookie,
      });
      if (
        response.response.status !== 401 ||
        response.payload?.code !== "SESSION_EXPIRED"
      ) {
        throw new Error("Deactivated account session was accepted.");
      }
    },
  );

  const changeLoginA = await login(contractBase, changePasswordUser);
  const changeLoginB = await login(contractBase, changePasswordUser);
  await runCheck(
    "Change-password validates current and new password",
    async () => {
      const wrongCurrent = await jsonRequest(
        contractBase,
        "/api/auth/change-password",
        {
          method: "POST",
          body: {
            currentPassword: "wrong-current",
            newPassword: "B7-New-Password-2026!",
          },
          cookie: changeLoginA.cookie,
        },
      );
      const tooLong = await jsonRequest(
        contractBase,
        "/api/auth/change-password",
        {
          method: "POST",
          body: {
            currentPassword: initialPassword,
            newPassword: "x".repeat(73),
          },
          cookie: changeLoginA.cookie,
        },
      );
      if (
        wrongCurrent.response.status !== 400 ||
        wrongCurrent.payload?.code !== "VALIDATION_ERROR" ||
        tooLong.response.status !== 400 ||
        tooLong.payload?.code !== "VALIDATION_ERROR"
      ) {
        throw new Error(
          "Password-change validation did not reject invalid input.",
        );
      }

      const changed = await jsonRequest(
        contractBase,
        "/api/auth/change-password",
        {
          method: "POST",
          body: {
            currentPassword: initialPassword,
            newPassword: "B7-New-Password-2026!",
          },
          cookie: changeLoginA.cookie,
        },
      );
      const currentSession = await Session.findOne({
        tokenHash: hashSessionToken(
          changeLoginA.cookie.slice(changeLoginA.cookie.indexOf("=") + 1),
        ),
      });
      const otherSession = await Session.findOne({
        tokenHash: hashSessionToken(
          changeLoginB.cookie.slice(changeLoginB.cookie.indexOf("=") + 1),
        ),
      });
      const currentMe = await jsonRequest(contractBase, "/api/auth/me", {
        cookie: changeLoginA.cookie,
      });
      const otherMe = await jsonRequest(contractBase, "/api/auth/me", {
        cookie: changeLoginB.cookie,
      });
      const changedUser = await User.findById(changePasswordUser._id);
      if (
        changed.response.status !== 204 ||
        !currentSession ||
        currentSession.revokedAt ||
        !otherSession?.revokedAt ||
        currentMe.response.status !== 200 ||
        otherMe.response.status !== 401 ||
        !changedUser.passwordChangedAt ||
        changedUser.mustChangePassword
      ) {
        throw new Error(
          "Password change did not preserve/revoke the right sessions.",
        );
      }
    },
  );

  const roleUserLogin = await login(contractBase, roleUser);
  const adminLogin = await login(contractBase, adminUser);
  await runCheck("Admin-only middleware distinguishes roles", async () => {
    const normal = await jsonRequest(
      contractBase,
      "/__auth_verify/admin-only",
      { cookie: roleUserLogin.cookie },
    );
    const admin = await jsonRequest(contractBase, "/__auth_verify/admin-only", {
      cookie: adminLogin.cookie,
    });
    if (normal.response.status !== 403 || admin.response.status !== 200) {
      throw new Error(
        `Admin-only route returned user=${normal.response.status}/${normal.payload?.code} and admin=${admin.response.status}/${admin.payload?.code}.`,
      );
    }
  });

  const productionConfig = {
    ...authConfig,
    nodeEnv: "production",
    cookieName: "__Host-logbook_session",
  };
  const productionBase = await launch(productionConfig);
  await runCheck("Production cookie is Secure", async () => {
    const result = await login(productionBase, await createTestUser(), {
      origin: authConfig.frontendOrigins[0],
      cookieName: productionConfig.cookieName,
    });
    if (
      result.response.status !== 200 ||
      !/^__Host-logbook_session=/.test(result.line) ||
      !/Secure/i.test(result.line)
    ) {
      throw new Error(
        "Production session cookie did not use Secure __Host flags.",
      );
    }
  });

  const rateLimitBase = await launch();
  await runCheck(
    "Eleventh login attempt from one IP is rate limited",
    async () => {
      let lastResponse;
      for (let attempt = 0; attempt < 11; attempt += 1) {
        lastResponse = await jsonRequest(rateLimitBase, "/api/auth/login", {
          method: "POST",
          body: {
            email: `${testTag}-rate-limit@example.test`,
            password: "wrong-password",
          },
        });
      }
      if (
        lastResponse.response.status !== 429 ||
        lastResponse.payload?.code !== "RATE_LIMITED"
      ) {
        throw new Error("The eleventh login attempt was not rate limited.");
      }
    },
  );

  addDatabaseVerificationResult();
} catch (error) {
  record(
    "Auth verification setup",
    false,
    error instanceof Error ? error.message : "Verification setup failed.",
  );
} finally {
  await closeServers();
  if (connected) {
    try {
      const activityLogsAdded = await countActivityLogsAdded(baseline);
      await cleanup();
      record(
        "Temporary user/session/activity cleanup",
        true,
        `Exact B7 fixture IDs removed; activityLogs added=${activityLogsAdded}.`,
      );
      const baselineCheck = await compareCollectionBaseline(baseline);
      record(
        "Database collection baseline restored",
        baselineCheck.passed,
        baselineCheck.differences.join(", ") || "protected counts restored",
      );
    } catch (error) {
      record(
        "Temporary user/session/activity cleanup",
        false,
        error instanceof Error ? error.message : "Cleanup failed.",
      );
    }
  }
  await mongoose.disconnect();
}

console.log("Check | Result | Detail");
for (const result of results) {
  console.log(`${result.name} | ${result.status} | ${result.detail}`);
}
const passed =
  results.length > 0 && results.every(({ status }) => status === "PASS");
console.log(`Overall | ${passed ? "PASS" : "FAIL"}`);
if (!passed) process.exitCode = 1;
