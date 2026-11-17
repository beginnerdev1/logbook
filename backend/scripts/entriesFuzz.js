import { randomBytes, randomUUID } from "node:crypto";
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
  restoreCounterSnapshots,
  snapshotCounterOnFirstUse,
} from "./verificationDb.js";
import { createApp } from "../src/app.js";
import { LOGBOOK_TYPES } from "../src/shared/logbookTypes.js";
import { parseDraftInput } from "../src/entries/entryValidation.js";
import { hashSessionToken } from "../src/utils/sessionToken.js";
import { nextReferenceNo } from "../src/utils/referenceNo.js";
import {
  ActivityLog,
  DocumentType,
  Entry,
  Office,
  Session,
  User,
} from "../src/models/index.js";

const tag = `fuzz-${randomUUID().replaceAll("-", "")}`;
const password = randomBytes(32).toString("hex");
const createdUsers = [];
const createdEntries = [];
const createdOffices = [];
const createdDocumentTypes = [];
const servers = [];
const results = [];
const prefixes = [
  ...new Set(Object.values(LOGBOOK_TYPES).map(({ prefix }) => prefix)),
];
const counterSnapshots = new Map();
let base;
let actor;
let other;
let admin;
let inactiveUser;
let expiredUser;
let actorCookie;
let otherCookie;
let adminCookie;
let inactiveCookie;
let expiredCookie;
let office;
let office2;
let doctype;
let documentTypesByScope;
let inactiveDoctype;
let wrongScopeDoctype;
let certificationDoctype;
let purchaseRequestDoctype;
let connected = false;
let baseline;

function ok(condition, message) {
  if (!condition) throw new Error(message);
}

async function check(name, action) {
  try {
    const detail = (await action()) ?? "";
    results.push({ name, status: "OK", detail });
  } catch (error) {
    results.push({
      name,
      status: "BUG",
      detail: error instanceof Error ? error.message : "Check failed",
    });
  }
}

async function makeUser(role, suffix = `${createdUsers.length + 1}`) {
  const user = await User.create({
    name: `${tag} ${role} ${suffix}`,
    email: `${tag}-${role}-${suffix}@example.test`,
    passwordHash: await bcrypt.hash(password, 4),
    role,
    active: true,
  });
  createdUsers.push(user);
  return user;
}

async function trackedReferenceNo(prefix, year) {
  await snapshotCounterOnFirstUse(counterSnapshots, `${prefix}-${year}`);
  return nextReferenceNo(prefix, year);
}

async function launch() {
  const server = createApp({
    config: authConfig,
    referenceNumberGenerator: trackedReferenceNo,
  }).listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}

function readCookie(response) {
  const cookies =
    response.headers.getSetCookie?.() ??
    [response.headers.get("set-cookie")].filter(Boolean);
  const value = cookies.find((line) =>
    line.startsWith(`${authConfig.cookieName}=`),
  );
  if (!value) throw new Error("Session cookie was not set.");
  return value.split(";", 1)[0];
}

async function request(
  path,
  {
    method = "GET",
    body,
    rawBody,
    contentType = "application/json",
    cookie,
  } = {},
) {
  const headers = {};
  if (contentType) headers["Content-Type"] = contentType;
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    ...(rawBody !== undefined ? { body: rawBody } : {}),
  });
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

async function login(user) {
  const result = await request("/api/auth/login", {
    method: "POST",
    body: { email: user.email, password },
  });
  if (result.response.status !== 200)
    throw new Error("Temporary login failed.");
  return readCookie(result.response);
}

function expectStatus(result, status, code) {
  const detail = `${result.payload?.code ?? "no code"} ${JSON.stringify(result.payload?.details ?? null)}`;
  ok(
    result.response.status === status,
    `Expected HTTP ${status}, received ${result.response.status} (${detail}).`,
  );
  if (code)
    ok(result.payload?.code === code, `Expected ${code}, received ${detail}.`);
}

function sharedError(result) {
  const payload = result.payload;
  return (
    result.response.status !== 500 &&
    payload &&
    Number.isInteger(payload.status) &&
    typeof payload.code === "string" &&
    typeof payload.message === "string" &&
    Object.hasOwn(payload, "details") &&
    !Object.hasOwn(payload, "stack")
  );
}

function safeResponse(payload) {
  if (!payload) return false;
  function containsProtectedKey(value) {
    if (!value || typeof value !== "object") return false;
    if (
      ["_id", "__v", "passwordHash", "email"].some((key) =>
        Object.hasOwn(value, key),
      )
    )
      return true;
    return Object.values(value).some(containsProtectedKey);
  }
  if (containsProtectedKey(payload)) return false;
  return ["submittedBy", "reviewedBy"].every((key) => {
    const value = payload[key];
    return (
      !value ||
      Object.keys(value).every((field) => ["id", "name"].includes(field))
    );
  });
}

function baseBodyForType(type) {
  const body = {
    logbookType: type,
    entryDate: "2000-02-29",
    name: `${tag} field fuzz`,
  };
  if (type !== "permit_certification") body.officeId = office._id.toString();
  if (type === "permit_certification") body.officeId = office._id.toString();
  if (type === "permit_certification" || type === "dtr_leave") {
    body.documentTypeId = documentTypesByScope.get(type)._id.toString();
  }
  if (type === "saln_mtop_bond_pds") {
    body.documentTypeId = documentTypesByScope.get(type)._id.toString();
  }
  return body;
}

async function createDraft({
  type = "petty_cash",
  entryDate = "2099-02-28",
  ownerCookie = actorCookie,
  officeId = office._id.toString(),
  extras = {},
} = {}) {
  const result = await request("/api/entries", {
    method: "POST",
    cookie: ownerCookie,
    body: {
      logbookType: type,
      entryDate,
      name: `${tag} draft`,
      officeId,
      ...extras,
    },
  });
  if (result.response.status === 201 && result.payload?.id)
    createdEntries.push(result.payload.id);
  return result;
}

async function readyDraft(draft, type = "petty_cash") {
  const data = {
    version: draft.version,
    particulars: `${tag} details`,
    amountCentavos: 100,
  };
  if (
    LOGBOOK_TYPES[type].fields.some(
      (field) => field.input === "documentType" && field.required,
    )
  ) {
    data.documentTypeId = doctype._id.toString();
  }
  const patched = await request(`/api/entries/${draft.id}`, {
    method: "PATCH",
    cookie: actorCookie,
    body: data,
  });
  expectStatus(patched, 200);
  return patched.payload;
}

async function createStoredEntry(status, ownerId = actor._id) {
  const values = {
    logbookType: "petty_cash",
    entryDate: "2099-02-28",
    name: `${tag} ${status}`,
    particulars: `${tag} particulars`,
    amountCentavos: 100,
    officeId: office._id,
    officeName: office.fullName,
    submittedBy: ownerId,
    status,
    source: "manual",
    ...(status === "draft" ? {} : { referenceNo: `PTC-2099-${randomUUID()}` }),
  };
  const entry = await Entry.create(values);
  createdEntries.push(entry._id);
  return entry;
}

async function checkCleanup() {
  const userIds = createdUsers.map((user) => user._id);
  const ownedEntryIds = userIds.length
    ? await findIds(Entry, { submittedBy: { $in: userIds } })
    : [];
  await deleteExactIds(Entry, [...createdEntries, ...ownedEntryIds]);
  await deleteExactIds(Office, createdOffices);
  await deleteExactIds(DocumentType, createdDocumentTypes);
  if (userIds.length) {
    await deleteExactIds(
      Session,
      await findIds(Session, { userId: { $in: userIds } }),
    );
    await deleteExactIds(
      ActivityLog,
      await findIds(ActivityLog, { userId: { $in: userIds } }),
    );
    await deleteExactIds(User, userIds);
  }
  await restoreCounterSnapshots(counterSnapshots);
  const remainingOwnedEntries = await Entry.countDocuments({
    submittedBy: { $in: userIds },
  });
  ok(
    remainingOwnedEntries === 0,
    `Fuzz cleanup left ${remainingOwnedEntries} temporary entries.`,
  );
}

async function bodyFuzz() {
  const baseBody = {
    logbookType: "petty_cash",
    entryDate: "2000-02-29",
    name: `${tag} body fuzz`,
    officeId: office._id.toString(),
  };
  for (const value of [[], 7, true, null, { nested: "value" }]) {
    const result = await request("/api/entries", {
      method: "POST",
      cookie: actorCookie,
      body: { ...baseBody, name: value },
    });
    expectStatus(result, 400, "VALIDATION_ERROR");
  }
  for (const field of ["entryDate", "officeId"]) {
    for (const value of [[], 7, true, null, { nested: "value" }]) {
      const result = await request("/api/entries", {
        method: "POST",
        cookie: actorCookie,
        body: { ...baseBody, [field]: value },
      });
      expectStatus(result, 400, "VALIDATION_ERROR");
    }
  }
  expectStatus(
    await request("/api/entries", {
      method: "POST",
      cookie: actorCookie,
      body: { ...baseBody, amountCentavos: "5" },
    }),
    400,
    "VALIDATION_ERROR",
  );

  for (const amount of [NaN, Infinity, -Infinity, 1e21, 0.1 + 0.2]) {
    let rejected = false;
    try {
      parseDraftInput({ ...baseBody, amountCentavos: amount });
    } catch (error) {
      rejected = error.code === "VALIDATION_ERROR";
    }
    ok(
      rejected,
      `Non-integral/out-of-range amount ${String(amount)} was accepted.`,
    );
  }
  for (const amount of [-0, 0, 99999999999]) {
    parseDraftInput({ ...baseBody, amountCentavos: amount });
  }
  const maximumAmount = await createDraft({
    extras: { amountCentavos: 99999999999 },
  });
  ok(
    maximumAmount.response.status === 201,
    "Maximum allowed amount was rejected by the API.",
  );
  const aboveMaximum = await request("/api/entries", {
    method: "POST",
    cookie: actorCookie,
    body: { ...baseBody, amountCentavos: 100000000000 },
  });
  expectStatus(aboveMaximum, 400, "VALIDATION_ERROR");
  let aboveMaxRejected = false;
  try {
    parseDraftInput({ ...baseBody, amountCentavos: 100000000000 });
  } catch {
    aboveMaxRejected = true;
  }
  ok(aboveMaxRejected, "100000000000 amount was accepted.");

  const maxName = await createDraft({ extras: { name: "x".repeat(200) } });
  ok(
    maxName.response.status === 201,
    `200-character name rejected: ${JSON.stringify(maxName.payload?.details)}`,
  );
  const longName = await request("/api/entries", {
    method: "POST",
    cookie: actorCookie,
    body: { ...baseBody, name: "x".repeat(201) },
  });
  expectStatus(longName, 400, "VALIDATION_ERROR");
  const unicode = `nul\u0000 emoji 😀 RTL אבג`; // Preserve non-control Unicode and safely store NUL.
  const unicodeResult = await createDraft({ extras: { name: unicode } });
  ok(
    unicodeResult.response.status === 201,
    `NUL/emoji/RTL rejected: ${JSON.stringify(unicodeResult.payload?.details)}`,
  );
  ok(
    unicodeResult.payload.name === unicode,
    "NUL, emoji, or RTL text was not preserved safely.",
  );
  const whitespace = await createDraft({ extras: { remarks: "   " } });
  ok(
    whitespace.response.status === 201,
    `Whitespace optional text rejected: ${JSON.stringify(whitespace.payload?.details)}`,
  );
  ok(
    !whitespace.payload.remarks,
    "Whitespace-only optional text was not treated as absent.",
  );
  const nullOptional = await createDraft({ extras: { remarks: null } });
  ok(
    nullOptional.response.status === 201,
    `Optional null rejected: ${JSON.stringify(nullOptional.payload?.details)}`,
  );
  const nullRequired = await request("/api/entries", {
    method: "POST",
    cookie: actorCookie,
    body: { ...baseBody, name: null },
  });
  expectStatus(nullRequired, 400, "VALIDATION_ERROR");

  for (const [type, config] of Object.entries(LOGBOOK_TYPES)) {
    for (const field of config.fields) {
      const base = baseBodyForType(type);
      const invalidValues =
        field.input === "money"
          ? [[], true, { nested: "value" }, "100"]
          : [[], 7, true, { nested: "value" }];
      for (const value of invalidValues) {
        const body = { ...base };
        if (field.where === "details") body.details = { [field.key]: value };
        else body[field.key] = value;
        const invalidResult = await request("/api/entries", {
          method: "POST",
          cookie: actorCookie,
          body,
        });
        try {
          expectStatus(invalidResult, 400, "VALIDATION_ERROR");
        } catch (error) {
          throw new Error(
            `${type}.${field.key} accepted ${JSON.stringify(value)}: ${error.message}`,
          );
        }
      }
      const body = { ...base };
      if (field.where === "details") body.details = { [field.key]: null };
      else body[field.key] = null;
      const nullResult = await request("/api/entries", {
        method: "POST",
        cookie: actorCookie,
        body,
      });
      const requiredInDraft =
        ["entryDate", "name"].includes(field.key) ||
        (field.key === "officeId" && type !== "permit_certification");
      expectStatus(
        nullResult,
        requiredInDraft ? 400 : 201,
        requiredInDraft ? "VALIDATION_ERROR" : undefined,
      );
    }
  }
  expectStatus(
    await request("/api/entries", {
      method: "POST",
      cookie: actorCookie,
      body: { ...baseBody, amountCentavos: "100" },
    }),
    400,
    "VALIDATION_ERROR",
  );
  return "types, numeric boundaries, text lengths, Unicode, NUL, and whitespace checked";
}

async function operatorFuzz() {
  const countBefore = await Entry.countDocuments({ submittedBy: actor._id });
  for (const [type, config] of Object.entries(LOGBOOK_TYPES)) {
    for (const field of config.fields) {
      for (const operatorValue of [{ $ne: null }, { $gt: "" }]) {
        const body = baseBodyForType(type);
        const value =
          field.input === "tracking"
            ? { status: operatorValue }
            : operatorValue;
        if (field.where === "details") body.details = { [field.key]: value };
        else body[field.key] = value;
        const result = await request("/api/entries", {
          method: "POST",
          cookie: actorCookie,
          body,
        });
        expectStatus(result, 400, "VALIDATION_ERROR");
      }
    }
  }
  const withOperators = await request("/api/entries", {
    method: "POST",
    cookie: actorCookie,
    body: {
      logbookType: "permit_certification",
      entryDate: "2000-02-29",
      name: `${tag} operator`,
      officeId: office._id.toString(),
      details: { $ne: null },
      source: { $gt: "" },
    },
  });
  expectStatus(withOperators, 400, "VALIDATION_ERROR");
  for (const key of [
    "__proto__",
    "constructor",
    "prototype",
    "bad.key",
    "bad$dollar",
  ]) {
    const topLevel = baseBodyForType("petty_cash");
    Object.defineProperty(topLevel, key, {
      value: { polluted: true },
      enumerable: true,
    });
    expectStatus(
      await request("/api/entries", {
        method: "POST",
        cookie: actorCookie,
        body: topLevel,
      }),
      400,
      "VALIDATION_ERROR",
    );

    const nested = baseBodyForType("travel_order");
    nested.details = {};
    Object.defineProperty(nested.details, key, {
      value: "bad",
      enumerable: true,
    });
    expectStatus(
      await request("/api/entries", {
        method: "POST",
        cookie: actorCookie,
        body: nested,
      }),
      400,
      "VALIDATION_ERROR",
    );
  }
  ok(
    Object.prototype.polluted === undefined,
    "An input key changed the server process prototype.",
  );
  const draft = await createDraft();
  expectStatus(draft, 201);
  const createdStored = await Entry.findById(draft.payload.id).lean();
  ok(
    !Object.hasOwn(draft.payload, "referenceNo") &&
      draft.payload.version === createdStored.__v,
    "Draft reference/version response shape incorrect.",
  );
  ok(safeResponse(draft.payload), "Draft response exposed identity fields.");
  for (const version of [{ $ne: null }, { $gt: "" }]) {
    const versionOperator = await request(`/api/entries/${draft.payload.id}`, {
      method: "PATCH",
      cookie: actorCookie,
      body: { version, name: `${tag} update` },
    });
    expectStatus(versionOperator, 400, "VALIDATION_ERROR");
  }
  ok(
    (await Entry.countDocuments({ submittedBy: actor._id })) ===
      countBefore + 1,
    "Operator payloads reached persistence.",
  );
  return "operator objects and prototype/dotted/dollar keys rejected before writes";
}

async function transportFuzz() {
  const invalidJson = await request("/api/entries", {
    method: "POST",
    cookie: actorCookie,
    rawBody: "{invalid",
    contentType: "application/json",
  });
  ok(
    sharedError(invalidJson),
    "Invalid JSON did not return the shared non-500 error shape.",
  );
  const empty = await request("/api/entries", {
    method: "POST",
    cookie: actorCookie,
    rawBody: "",
    contentType: "application/json",
  });
  ok(
    sharedError(empty),
    "Empty body did not return the shared non-500 error shape.",
  );
  const oversized = await request("/api/entries", {
    method: "POST",
    cookie: actorCookie,
    rawBody: `{"x":"${"x".repeat(110000)}"}`,
    contentType: "application/json",
  });
  ok(
    sharedError(oversized),
    "Oversized body did not return the shared non-500 error shape.",
  );
  ok(
    oversized.response.status === 413 &&
      oversized.payload.code === "PAYLOAD_TOO_LARGE",
    "Oversized JSON did not return 413 PAYLOAD_TOO_LARGE.",
  );
  const wrongType = await request("/api/entries", {
    method: "POST",
    cookie: actorCookie,
    rawBody: "not-json",
    contentType: "text/plain",
  });
  ok(
    sharedError(wrongType) && wrongType.response.status === 415,
    "Wrong content type did not return the shared 415 error shape.",
  );
  return "invalid/empty/oversized JSON and wrong content type return shared errors without stacks";
}

async function idFuzz() {
  const draft = await createDraft();
  expectStatus(draft, 201);
  for (const id of [
    "not-an-id",
    "123",
    "g".repeat(24),
    `%5B%22${draft.payload.id}%22%5D`,
  ]) {
    const result = await request(`/api/entries/${id}`, { cookie: actorCookie });
    expectStatus(result, 400, "VALIDATION_ERROR");
  }
  expectStatus(
    await request(`/api/entries/${"f".repeat(24)}`, { cookie: actorCookie }),
    404,
    "NOT_FOUND",
  );
  expectStatus(
    await request(`/api/entries/${draft.payload.id.toUpperCase()}`, {
      cookie: actorCookie,
    }),
    400,
    "VALIDATION_ERROR",
  );
  expectStatus(
    await request("/api/entries", {
      method: "POST",
      cookie: actorCookie,
      body: {
        logbookType: "petty_cash",
        entryDate: "2000-02-29",
        name: "bad office",
        officeId: [],
      },
    }),
    400,
    "VALIDATION_ERROR",
  );
  expectStatus(
    await request("/api/entries", {
      method: "POST",
      cookie: actorCookie,
      body: {
        logbookType: "petty_cash",
        entryDate: "2000-02-29",
        name: "uppercase office",
        officeId: office._id.toString().toUpperCase(),
      },
    }),
    400,
    "VALIDATION_ERROR",
  );
  expectStatus(
    await request("/api/entries", {
      method: "POST",
      cookie: actorCookie,
      body: {
        logbookType: "permit_certification",
        entryDate: "2000-02-29",
        name: "uppercase type",
        officeId: office._id.toString(),
        documentTypeId: doctype._id.toString().toUpperCase(),
      },
    }),
    400,
    "VALIDATION_ERROR",
  );
  for (const documentTypeId of [false, [], { $ne: null }, "f".repeat(24)]) {
    const result = await request("/api/entries", {
      method: "POST",
      cookie: actorCookie,
      body: {
        logbookType: "permit_certification",
        entryDate: "2000-02-29",
        name: "bad type",
        officeId: office._id.toString(),
        documentTypeId,
      },
    });
    if (documentTypeId === "f".repeat(24))
      expectStatus(result, 400, "VALIDATION_ERROR");
    else expectStatus(result, 400, "VALIDATION_ERROR");
  }
  return "malformed, uppercase, unknown, array, and wrong-type ids checked";
}

async function dateFuzz() {
  for (const date of ["2000-02-29", "2024-02-29", "2100-12-31"]) {
    const result = await createDraft({ entryDate: date });
    expectStatus(result, 201);
  }
  for (const date of [
    "2026-02-29",
    "2026-13-01",
    "2026-1-5",
    "2026-07-03T00:00:00Z",
    "0001-01-01",
    "9999-12-31",
    "2101-01-01",
  ]) {
    const result = await request("/api/entries", {
      method: "POST",
      cookie: actorCookie,
      body: {
        logbookType: "petty_cash",
        entryDate: date,
        name: "bad date",
        officeId: office._id.toString(),
      },
    });
    expectStatus(result, 400, "VALIDATION_ERROR");
  }
  for (const time of ["24:00", "4:43"]) {
    expectStatus(
      await request("/api/entries", {
        method: "POST",
        cookie: actorCookie,
        body: {
          logbookType: "permit_certification",
          entryDate: "2024-02-29",
          name: "time check",
          officeId: office._id.toString(),
          documentTypeId: doctype._id.toString(),
          tracking: { status: "returned", returnedTime: time },
        },
      }),
      400,
      "VALIDATION_ERROR",
    );
  }
  expectStatus(
    await request("/api/entries", {
      method: "POST",
      cookie: actorCookie,
      body: {
        logbookType: "permit_certification",
        entryDate: "2024-02-29",
        name: "time check",
        officeId: office._id.toString(),
        documentTypeId: doctype._id.toString(),
        tracking: { status: "returned", returnedTime: "23:59" },
      },
    }),
    201,
  );
  return "real dates, 2000-2100 year range, and HH:mm boundaries checked";
}

async function patchFuzz() {
  const travel = await createDraft({ type: "travel_order" });
  expectStatus(travel, 201);
  let first = await request(`/api/entries/${travel.payload.id}`, {
    method: "PATCH",
    cookie: actorCookie,
    body: {
      version: travel.payload.version,
      details: { travelOrderNumber: "T-1", destination: "Harbor" },
    },
  });
  expectStatus(first, 200);
  const versionAfterFirst = first.payload.version;
  const second = await request(`/api/entries/${travel.payload.id}`, {
    method: "PATCH",
    cookie: actorCookie,
    body: {
      version: versionAfterFirst,
      details: { purposeOfTravel: "Inspection" },
    },
  });
  expectStatus(second, 200);
  const stored = await Entry.findById(travel.payload.id).lean();
  ok(
    stored.details.travelOrderNumber === "T-1" &&
      stored.details.destination === "Harbor" &&
      stored.details.purposeOfTravel === "Inspection",
    "Partial details PATCH erased existing detail fields.",
  );

  const changeType = await request(`/api/entries/${travel.payload.id}`, {
    method: "PATCH",
    cookie: actorCookie,
    body: { version: second.payload.version, logbookType: "petty_cash" },
  });
  expectStatus(changeType, 200);
  const changed = await Entry.findById(travel.payload.id).lean();
  ok(
    Object.keys(changed.details ?? {}).length === 0,
    "Changing type retained details no longer valid.",
  );

  const draft = await createDraft({ extras: { remarks: `${tag} clear me` } });
  expectStatus(draft, 201);
  const cleared = await request(`/api/entries/${draft.payload.id}`, {
    method: "PATCH",
    cookie: actorCookie,
    body: { version: draft.payload.version, remarks: null },
  });
  expectStatus(cleared, 200);
  ok(!cleared.payload.remarks, "Null did not clear optional remarks.");

  const requiredNull = await request(`/api/entries/${draft.payload.id}`, {
    method: "PATCH",
    cookie: actorCookie,
    body: { version: cleared.payload.version, name: null },
  });
  expectStatus(requiredNull, 400, "VALIDATION_ERROR");

  const beforeNoop = await Entry.findById(draft.payload.id).lean();
  const beforeLogs = await ActivityLog.countDocuments({
    resourceId: draft.payload.id,
    action: "entry_edited",
  });
  const noop = await request(`/api/entries/${draft.payload.id}`, {
    method: "PATCH",
    cookie: actorCookie,
    body: { version: beforeNoop.__v, name: beforeNoop.name },
  });
  expectStatus(noop, 200);
  const afterNoop = await Entry.findById(draft.payload.id).lean();
  const afterLogs = await ActivityLog.countDocuments({
    resourceId: draft.payload.id,
    action: "entry_edited",
  });
  ok(
    noop.payload.version === beforeNoop.__v && afterNoop.__v === beforeNoop.__v,
    "No-op PATCH unexpectedly bumped the version.",
  );
  ok(afterLogs === beforeLogs, "No-op PATCH wrote an empty edit activity log.");
  return "undefined unchanged, optional null clear, partial details merge, type cleanup, and no-op policy checked";
}

async function versionFuzz() {
  const draft = await createDraft();
  expectStatus(draft, 201);
  for (const version of ["0", -1, 1.5, undefined]) {
    const body = { name: "invalid version" };
    if (version !== undefined) body.version = version;
    expectStatus(
      await request(`/api/entries/${draft.payload.id}`, {
        method: "PATCH",
        cookie: actorCookie,
        body,
      }),
      400,
      "VALIDATION_ERROR",
    );
  }
  const before = await Entry.findById(draft.payload.id).lean();
  const update = await request(`/api/entries/${draft.payload.id}`, {
    method: "PATCH",
    cookie: actorCookie,
    body: { version: before.__v, name: `${tag} version +1` },
  });
  expectStatus(update, 200);
  ok(
    update.payload.version === before.__v + 1,
    "Successful edit did not increment version exactly once.",
  );

  const parallel = await createDraft();
  const [a, b] = await Promise.all(
    [1, 2].map((number) =>
      request(`/api/entries/${parallel.payload.id}`, {
        method: "PATCH",
        cookie: actorCookie,
        body: {
          version: parallel.payload.version,
          name: `${tag} parallel ${number}`,
        },
      }),
    ),
  );
  ok(
    [a, b].filter((result) => result.response.status === 200).length === 1,
    "Parallel PATCH did not have exactly one winner.",
  );
  ok(
    [a, b].some(
      (result) =>
        result.response.status === 409 &&
        result.payload.code === "VERSION_CONFLICT",
    ),
    "Parallel PATCH loser was not VERSION_CONFLICT.",
  );

  const racing = await createDraft();
  const ready = await readyDraft(racing.payload);
  const [patch, submit] = await Promise.all([
    request(`/api/entries/${ready.id}`, {
      method: "PATCH",
      cookie: actorCookie,
      body: { version: ready.version, name: `${tag} racing patch` },
    }),
    request(`/api/entries/${ready.id}/submit`, {
      method: "POST",
      cookie: actorCookie,
      body: { version: ready.version },
    }),
  ]);
  ok(
    [patch, submit].filter((result) => result.response.status === 200)
      .length === 1,
    "PATCH-submit race did not have one winner.",
  );
  ok(
    [patch, submit].some(
      (result) =>
        result.response.status === 409 &&
        ["VERSION_CONFLICT", "INVALID_STATE"].includes(result.payload.code),
    ),
    "PATCH-submit race loser was not a conflict.",
  );
  return "version validation, +1 saves, parallel edits, and submit race checked";
}

async function submitFuzz() {
  for (const config of Object.values(LOGBOOK_TYPES)) {
    const testReference = await trackedReferenceNo(config.prefix, 2099);
    ok(
      testReference.startsWith(`${config.prefix}-2099-`),
      `Test-year reference prefix failed for ${config.prefix}.`,
    );
  }
  const beforeFailure = await createDraft();
  const missing = await request(
    `/api/entries/${beforeFailure.payload.id}/submit`,
    {
      method: "POST",
      cookie: actorCookie,
      body: { version: beforeFailure.payload.version },
    },
  );
  expectStatus(missing, 400, "VALIDATION_ERROR");
  let stored = await Entry.findById(beforeFailure.payload.id).lean();
  ok(
    stored.status === "draft" && !stored.referenceNo,
    "Pre-assignment submit failure changed draft state.",
  );

  const failedSaveDraft = await createDraft();
  const ready = await readyDraft(failedSaveDraft.payload);
  const counterId = "PTC-2099";
  const counter = await mongoose.connection
    .collection("counters")
    .findOne({ _id: counterId });
  const sequence = (counter?.seq ?? 0) + 1;
  const blockedReference = `PTC-2099-${String(sequence).padStart(5, "0")}`;
  const blocker = await Entry.create({
    referenceNo: blockedReference,
    logbookType: "petty_cash",
    entryDate: "2099-02-28",
    name: `${tag} reference blocker`,
    officeId: office._id,
    officeName: office.fullName,
    submittedBy: actor._id,
    source: "manual",
    status: "pending",
  });
  createdEntries.push(blocker._id);
  const afterAssignmentFailure = await request(
    `/api/entries/${ready.id}/submit`,
    {
      method: "POST",
      cookie: actorCookie,
      body: { version: ready.version },
    },
  );
  ok(
    afterAssignmentFailure.response.status === 409,
    "Forced post-allocation duplicate did not fail with a conflict.",
  );
  stored = await Entry.findById(ready.id).lean();
  ok(
    stored.status === "draft" && !stored.referenceNo,
    "Post-assignment save failure left a referenced draft or pending entry without a reference.",
  );

  const twice = await createDraft();
  const twiceReady = await readyDraft(twice.payload);
  const [one, two] = await Promise.all(
    [1, 2].map(() =>
      request(`/api/entries/${twiceReady.id}/submit`, {
        method: "POST",
        cookie: actorCookie,
        body: { version: twiceReady.version },
      }),
    ),
  );
  ok(
    [one, two].filter((result) => result.response.status === 200).length === 1,
    "Parallel same-entry submits did not have exactly one winner.",
  );
  ok(
    [one, two].some(
      (result) =>
        result.response.status === 409 &&
        result.payload.code === "INVALID_STATE",
    ),
    "Double-submit loser was not INVALID_STATE.",
  );

  const batch = await Promise.all(
    Array.from({ length: 20 }, () => createDraft()),
  );
  const readyBatch = [];
  for (const result of batch) {
    expectStatus(result, 201);
    readyBatch.push(await readyDraft(result.payload));
  }
  const submitted = await Promise.all(
    readyBatch.map((entry) =>
      request(`/api/entries/${entry.id}/submit`, {
        method: "POST",
        cookie: actorCookie,
        body: { version: entry.version },
      }),
    ),
  );
  ok(
    submitted.every((result) => result.response.status === 200),
    "Not all 20 parallel submissions succeeded.",
  );
  const nums = submitted
    .map((result) => Number(result.payload.referenceNo.split("-").at(-1)))
    .sort((a, b) => a - b);
  ok(
    new Set(nums).size === 20 &&
      nums.every(
        (value, index) => index === 0 || value === nums[index - 1] + 1,
      ),
    "20 references were not distinct, increasing, and contiguous.",
  );

  for (const [type, config] of Object.entries(LOGBOOK_TYPES)) {
    const draft = await createDraft({ type, entryDate: "2099-02-28" });
    const fields = {};
    const details = {};
    for (const field of LOGBOOK_TYPES[type].fields) {
      if (["entryDate", "name", "officeId"].includes(field.key)) continue;
      let value;
      switch (field.input) {
        case "documentType":
          value = documentTypesByScope
            .get(
              type === "dtr_leave"
                ? "dtr_leave"
                : type === "saln_mtop_bond_pds"
                  ? "saln_mtop_bond_pds"
                  : "permit_certification",
            )
            ._id.toString();
          break;
        case "money":
          value = 100;
          break;
        case "date":
          value = "2099-02-28";
          break;
        case "tracking":
          value = { status: "received" };
          break;
        default:
          value = `${tag}-${field.key}`;
      }
      if (field.where === "details") details[field.key] = value;
      else fields[field.key] = value;
    }
    if (Object.keys(details).length) fields.details = details;
    const patched = await request(`/api/entries/${draft.payload.id}`, {
      method: "PATCH",
      cookie: actorCookie,
      body: { version: draft.payload.version, ...fields },
    });
    expectStatus(patched, 200);
    const result = await request(`/api/entries/${draft.payload.id}/submit`, {
      method: "POST",
      cookie: actorCookie,
      body: { version: patched.payload.version },
    });
    expectStatus(result, 200);
    ok(
      result.payload.referenceNo.startsWith(`${config.prefix}-2099-`),
      `${type} used the wrong prefix/year.`,
    );
  }
  const rejectedDraft = await createDraft();
  const rejectedReady = await readyDraft(rejectedDraft.payload);
  const rejectedEntry = await Entry.findById(rejectedReady.id);
  rejectedEntry.referenceNo = await trackedReferenceNo("PTC", 2099);
  rejectedEntry.status = "rejected";
  await rejectedEntry.save();
  const preservedReference = rejectedEntry.referenceNo;
  const resubmitted = await request(
    `/api/entries/${rejectedEntry._id}/submit`,
    {
      method: "POST",
      cookie: actorCookie,
      body: { version: rejectedEntry.__v },
    },
  );
  expectStatus(resubmitted, 200);
  ok(
    resubmitted.payload.referenceNo === preservedReference,
    "Rejected resubmission changed its reference number.",
  );
  return "pre/post allocation failures, double submit, 20-way counter, and all eight prefixes checked";
}

async function policyFuzz() {
  const statuses = ["draft", "pending", "approved", "rejected"];
  for (const status of statuses) {
    const visible = await createStoredEntry(status);
    for (const [cookie, expected] of [
      [otherCookie, 404],
      [actorCookie, 200],
      [adminCookie, 200],
    ]) {
      const result = await request(`/api/entries/${visible._id}`, { cookie });
      expectStatus(
        result,
        expected,
        expected === 404 ? "NOT_FOUND" : undefined,
      );
    }

    for (const action of ["patch", "delete", "submit"]) {
      const method =
        action === "patch" ? "PATCH" : action === "submit" ? "POST" : "DELETE";
      async function call(cookie) {
        const fixture = await createStoredEntry(status);
        const path = `/api/entries/${fixture._id}${action === "submit" ? "/submit" : ""}`;
        const body =
          action === "patch"
            ? { version: fixture.__v, name: `${tag} ${status} edit` }
            : action === "submit"
              ? { version: fixture.__v }
              : {};
        return request(path, { method, body, cookie });
      }

      expectStatus(await call(otherCookie), 404, "NOT_FOUND");
      const ownerResult = await call(actorCookie);
      const adminResult = await call(adminCookie);
      if (action === "patch") {
        expectStatus(
          ownerResult,
          ["draft", "rejected"].includes(status) ? 200 : 403,
        );
        expectStatus(adminResult, 200);
      } else if (action === "delete") {
        expectStatus(ownerResult, status === "draft" ? 204 : 403);
        expectStatus(adminResult, 403, "FORBIDDEN");
      } else {
        if (["draft", "rejected"].includes(status)) {
          expectStatus(ownerResult, 200);
          expectStatus(adminResult, 403, "FORBIDDEN");
        } else {
          expectStatus(ownerResult, 409, "INVALID_STATE");
          expectStatus(adminResult, 409, "INVALID_STATE");
        }
      }
    }
  }
  const adminOwnedDraft = await createStoredEntry("draft", admin._id);
  expectStatus(
    await request(`/api/entries/${adminOwnedDraft._id}`, {
      method: "DELETE",
      cookie: adminCookie,
      body: {},
    }),
    403,
    "FORBIDDEN",
  );

  const protectedEntry = await createDraft();
  const expiredLogin = await login(expiredUser);
  const rawToken = expiredLogin.slice(expiredLogin.indexOf("=") + 1);
  await Session.updateOne(
    { tokenHash: hashSessionToken(rawToken) },
    { $set: { expiresAt: new Date(Date.now() - 1000) } },
  );
  expectStatus(
    await request(`/api/entries/${protectedEntry.payload.id}`, {
      cookie: expiredLogin,
    }),
    401,
    "SESSION_EXPIRED",
  );
  const inactiveLogin = await login(inactiveUser);
  await User.updateOne({ _id: inactiveUser._id }, { $set: { active: false } });
  expectStatus(
    await request(`/api/entries/${protectedEntry.payload.id}`, {
      cookie: inactiveLogin,
    }),
    401,
    "SESSION_EXPIRED",
  );
  return "owner/other/admin across statuses/actions, admin delete, inactive user, and expired session checked";
}

async function lookupFuzz() {
  const fakeId = new mongoose.Types.ObjectId().toString();
  const invalids = [
    fakeId,
    inactiveDoctype._id.toString(),
    wrongScopeDoctype._id.toString(),
  ];
  for (const documentTypeId of invalids) {
    const result = await request("/api/entries", {
      method: "POST",
      cookie: actorCookie,
      body: {
        logbookType: "permit_certification",
        entryDate: "2000-02-29",
        name: `${tag} invalid type`,
        officeId: office._id.toString(),
        documentTypeId,
      },
    });
    expectStatus(result, 400, "VALIDATION_ERROR");
  }
  const unchangedOfficeDraft = await createDraft({
    officeId: office2._id.toString(),
  });
  expectStatus(unchangedOfficeDraft, 201);
  await Office.updateOne({ _id: office2._id }, { $set: { active: false } });
  const inactiveOfficeCreate = await request("/api/entries", {
    method: "POST",
    cookie: actorCookie,
    body: {
      logbookType: "petty_cash",
      entryDate: "2000-02-29",
      name: "inactive office",
      officeId: office2._id.toString(),
    },
  });
  expectStatus(inactiveOfficeCreate, 400, "VALIDATION_ERROR");
  const keptInactiveOffice = await request(
    `/api/entries/${unchangedOfficeDraft.payload.id}`,
    {
      method: "PATCH",
      cookie: actorCookie,
      body: {
        version: unchangedOfficeDraft.payload.version,
        remarks: `${tag} kept office`,
      },
    },
  );
  expectStatus(keptInactiveOffice, 200);
  ok(
    keptInactiveOffice.payload.officeName === office2.fullName,
    "Unchanged inactive office snapshot was not retained.",
  );

  const draft = await createDraft({
    type: "permit_certification",
    extras: { documentTypeId: doctype._id.toString() },
  });
  expectStatus(draft, 201);
  const officeOldName = draft.payload.officeName;
  const docOldName = draft.payload.documentTypeName;
  await Office.updateOne(
    { _id: office._id },
    { $set: { fullName: `${tag} Renamed Office` } },
  );
  await DocumentType.updateOne(
    { _id: doctype._id },
    { $set: { name: `${tag} Renamed Type` } },
  );
  const patched = await request(`/api/entries/${draft.payload.id}`, {
    method: "PATCH",
    cookie: actorCookie,
    body: { version: draft.payload.version, remarks: `${tag} snapshot check` },
  });
  expectStatus(patched, 200);
  ok(
    patched.payload.officeName === officeOldName &&
      patched.payload.documentTypeName === docOldName,
    "Lookup rename changed stored entry snapshot names.",
  );

  const certification = await request("/api/entries", {
    method: "POST",
    cookie: actorCookie,
    body: {
      logbookType: "permit_certification",
      entryDate: "2000-02-29",
      name: `${tag} certification`,
      particulars: `${tag} certificate`,
      documentTypeId: certificationDoctype._id.toString(),
    },
  });
  expectStatus(certification, 201);
  createdEntries.push(certification.payload.id);
  const certificationSubmit = await request(
    `/api/entries/${certification.payload.id}/submit`,
    {
      method: "POST",
      cookie: actorCookie,
      body: { version: certification.payload.version },
    },
  );
  expectStatus(certificationSubmit, 200);
  for (const [field, value] of [
    ["officeId", office._id.toString()],
    ["amountCentavos", 100],
  ]) {
    const hidden = await request("/api/entries", {
      method: "POST",
      cookie: actorCookie,
      body: {
        logbookType: "permit_certification",
        entryDate: "2000-02-29",
        name: `${tag} hidden field`,
        documentTypeId: certificationDoctype._id.toString(),
        [field]: value,
      },
    });
    expectStatus(hidden, 400, "VALIDATION_ERROR");
  }
  const purchase = await request("/api/entries", {
    method: "POST",
    cookie: actorCookie,
    body: {
      logbookType: "permit_certification",
      entryDate: "2000-02-29",
      name: `${tag} purchase request`,
      particulars: `${tag} request`,
      officeId: office._id.toString(),
      documentTypeId: purchaseRequestDoctype._id.toString(),
    },
  });
  expectStatus(purchase, 201);
  createdEntries.push(purchase.payload.id);
  expectStatus(
    await request(`/api/entries/${purchase.payload.id}/submit`, {
      method: "POST",
      cookie: actorCookie,
      body: { version: purchase.payload.version },
    }),
    400,
    "VALIDATION_ERROR",
  );
  return "lookup IDs, inactive offices, snapshots, and CONFIG-2 rules checked";
}

async function responseFuzz() {
  const draft = await createDraft();
  expectStatus(draft, 201);
  const stored = await Entry.findById(draft.payload.id).lean();
  ok(
    !Object.hasOwn(draft.payload, "referenceNo") &&
      draft.payload.version === stored.__v,
    "Draft reference/version response shape incorrect.",
  );
  ok(safeResponse(draft.payload), "Create response exposed internal fields.");
  const read = await request(`/api/entries/${draft.payload.id}`, {
    cookie: actorCookie,
  });
  expectStatus(read, 200);
  ok(safeResponse(read.payload), "GET response exposed internal fields.");
  const ready = await readyDraft(draft.payload);
  const submitted = await request(`/api/entries/${ready.id}/submit`, {
    method: "POST",
    cookie: actorCookie,
    body: { version: ready.version },
  });
  expectStatus(submitted, 200);
  ok(
    safeResponse(submitted.payload),
    "Submit response exposed internal fields.",
  );
  const storedSubmitted = await Entry.findById(ready.id).lean();
  ok(
    submitted.payload.version === storedSubmitted.__v,
    "Submit response version differs from stored __v.",
  );
  const unknown = await request("/api/entries/no-such-route/extra", {
    cookie: actorCookie,
  });
  ok(
    sharedError(unknown) && unknown.response.status === 404,
    "Unknown nested route lacked shared error shape.",
  );
  const method = await request(`/api/entries/${draft.payload.id}`, {
    method: "PUT",
    cookie: actorCookie,
    body: {},
  });
  ok(
    sharedError(method) && method.response.status === 404,
    "Unknown method lacked shared error shape.",
  );
  return "create/get/submit response fields, stored versions, and unknown routes/methods checked";
}

async function activityFuzz() {
  const bodyMarker = `${tag}-request-body-marker-${randomUUID()}`;
  const draft = await createDraft({ extras: { remarks: bodyMarker } });
  expectStatus(draft, 201);
  const createLog = await ActivityLog.findOne({
    resourceId: draft.payload.id,
    action: "entry_created",
  }).lean();
  ok(
    createLog?.userId?.equals(actor._id),
    "Create audit log has the wrong actor.",
  );
  ok(
    createLog?.resourceRef === draft.payload.id,
    "Draft create log has the wrong resource ref.",
  );
  ok(
    createLog?.changes?.length === 0,
    "Create audit log copied the validated request fields into changes.",
  );
  ok(
    !JSON.stringify(createLog).includes(bodyMarker),
    "Create audit log stored the full request body.",
  );

  const edited = await request(`/api/entries/${draft.payload.id}`, {
    method: "PATCH",
    cookie: actorCookie,
    body: { version: draft.payload.version, name: `${tag} edited name` },
  });
  expectStatus(edited, 200);
  const editLog = await ActivityLog.findOne({
    resourceId: draft.payload.id,
    action: "entry_edited",
  }).lean();
  ok(editLog?.userId?.equals(actor._id), "Edit audit log has the wrong actor.");
  ok(
    editLog?.changes?.map((change) => change.field).join(",") === "name",
    "Edit audit log included unchanged fields.",
  );
  ok(
    (await ActivityLog.countDocuments({
      resourceId: draft.payload.id,
      action: "entry_edited",
    })) === 1,
    "Edit action wrote multiple logs.",
  );

  const pendingDraft = await createDraft();
  const pendingReady = await readyDraft(pendingDraft.payload);
  const pending = await request(`/api/entries/${pendingReady.id}/submit`, {
    method: "POST",
    cookie: actorCookie,
    body: { version: pendingReady.version },
  });
  expectStatus(pending, 200);
  const failedResourceIds = [draft.payload.id, pending.payload.id];
  const logBefore = await ActivityLog.countDocuments({
    resourceId: { $in: failedResourceIds },
  });
  const failed = await request(`/api/entries/${draft.payload.id}`, {
    method: "PATCH",
    cookie: otherCookie,
    body: { version: draft.payload.version, name: "not owner" },
  });
  expectStatus(failed, 404, "NOT_FOUND");
  expectStatus(
    await request(`/api/entries/${draft.payload.id}`, {
      method: "PATCH",
      cookie: actorCookie,
      body: { version: draft.payload.version, name: `${tag} stale` },
    }),
    409,
    "VERSION_CONFLICT",
  );
  expectStatus(
    await request(`/api/entries/${pending.payload.id}`, {
      method: "PATCH",
      cookie: actorCookie,
      body: { version: pending.payload.version, name: `${tag} locked` },
    }),
    403,
    "FORBIDDEN",
  );
  expectStatus(
    await request(`/api/entries/${pending.payload.id}/submit`, {
      method: "POST",
      cookie: actorCookie,
      body: { version: pending.payload.version },
    }),
    409,
    "INVALID_STATE",
  );
  const logAfter = await ActivityLog.countDocuments({
    resourceId: { $in: failedResourceIds },
  });
  ok(logBefore === logAfter, "Failed request wrote a success activity log.");

  const logs = await ActivityLog.find({
    userId: actor._id,
    resourceId: draft.payload.id,
  }).lean();
  ok(
    logs.some((item) => item.action === "entry_created"),
    "Missing create activity log.",
  );
  ok(
    logs.every(
      (item) =>
        !JSON.stringify(item).includes(password) &&
        !JSON.stringify(item).includes(actorCookie) &&
        !JSON.stringify(item).includes(bodyMarker),
    ),
    "Activity log contains a secret or request-body marker.",
  );
  const createLogs = logs.filter((item) => item.action === "entry_created");
  ok(
    createLogs.length === 1 && createLogs[0].changes.length === 0,
    "Create log duplicated or stored request fields.",
  );
  ok(
    createLogs[0].resourceRef === draft.payload.id &&
      createLogs[0].userId.equals(actor._id),
    "Create log actor or resource is incorrect.",
  );

  const completed = await readyDraft(edited.payload);
  const beforeSubmit = await Entry.findById(completed.id).lean();
  const submitted = await request(`/api/entries/${completed.id}/submit`, {
    method: "POST",
    cookie: actorCookie,
    body: { version: completed.version },
  });
  expectStatus(submitted, 200);
  ok(
    safeResponse(submitted.payload),
    "Submit response exposed identity fields.",
  );
  const submitLog = await ActivityLog.findOne({
    resourceId: completed.id,
    action: "entry_submitted",
  }).lean();
  ok(
    submitLog?.resourceRef === submitted.payload.referenceNo &&
      submitLog.userId.equals(actor._id),
    "Submit log actor/resource is incorrect.",
  );
  ok(
    submitLog.changes.some(
      (change) =>
        change.field === "status" &&
        change.from === "draft" &&
        change.to === "pending",
    ),
    "Submit log omitted its status change.",
  );
  ok(
    submitLog.changes.every(
      (change) =>
        change.field === "referenceNo" ||
        change.field === "status" ||
        change.field === "submittedAt" ||
        change.field === "officeName",
    ),
    "Submit log includes unrelated fields.",
  );
  ok(
    (await ActivityLog.countDocuments({
      resourceId: completed.id,
      action: "entry_submitted",
    })) === 1,
    "Submit action wrote multiple logs.",
  );
  ok(beforeSubmit.status === "draft", "Submit fixture was not a draft.");

  const deleteDraft = await createDraft();
  expectStatus(deleteDraft, 201);
  expectStatus(
    await request(`/api/entries/${deleteDraft.payload.id}`, {
      method: "DELETE",
      cookie: actorCookie,
      body: {},
    }),
    204,
  );
  const deleteLogs = await ActivityLog.find({
    resourceId: deleteDraft.payload.id,
    action: "draft_deleted",
  }).lean();
  ok(
    deleteLogs.length === 1 &&
      deleteLogs[0].resourceRef === deleteDraft.payload.id &&
      deleteLogs[0].userId.equals(actor._id),
    "Draft deletion audit log is incorrect.",
  );
  return "action audit deltas, actor/resource references, secret exclusion, and failed-attempt logging checked";
}

try {
  await connectTestDb();
  connected = true;
  baseline = await captureCollectionBaseline();
  actor = await makeUser("user");
  other = await makeUser("user");
  admin = await makeUser("admin");
  inactiveUser = await makeUser("user", "inactive");
  expiredUser = await makeUser("user", "expired");
  office = await Office.create({
    code: `${tag}-office`,
    fullName: `${tag} Office`,
    kind: "internal",
    aliases: [],
    active: true,
  });
  createdOffices.push(office._id);
  office2 = await Office.create({
    code: `${tag}-office-two`,
    fullName: `${tag} Office Two`,
    kind: "external",
    aliases: [],
    active: true,
  });
  createdOffices.push(office2._id);
  const doc = await DocumentType.create({
    name: `${tag} permit type`,
    aliases: [],
    logbookTypes: ["permit_certification"],
    active: true,
  });
  doctype = doc;
  createdDocumentTypes.push(doc._id);
  inactiveDoctype = await DocumentType.create({
    name: `${tag} inactive type`,
    aliases: [],
    logbookTypes: ["permit_certification"],
    active: false,
  });
  createdDocumentTypes.push(inactiveDoctype._id);
  wrongScopeDoctype = await DocumentType.create({
    name: `${tag} wrong scope type`,
    aliases: [],
    logbookTypes: ["dtr_leave"],
    active: true,
  });
  createdDocumentTypes.push(wrongScopeDoctype._id);
  certificationDoctype = await DocumentType.create({
    name: `${tag} certification`,
    aliases: [],
    logbookTypes: ["permit_certification"],
    fieldRules: { officeId: "hidden", amountCentavos: "hidden" },
    active: true,
  });
  createdDocumentTypes.push(certificationDoctype._id);
  purchaseRequestDoctype = await DocumentType.create({
    name: `${tag} purchase request`,
    aliases: [],
    logbookTypes: ["permit_certification"],
    fieldRules: { amountCentavos: "required" },
    active: true,
  });
  createdDocumentTypes.push(purchaseRequestDoctype._id);
  documentTypesByScope = new Map([
    ["permit_certification", doctype],
    [
      "dtr_leave",
      await DocumentType.create({
        name: `${tag} DTR type`,
        aliases: [],
        logbookTypes: ["dtr_leave"],
        active: true,
      }),
    ],
    [
      "saln_mtop_bond_pds",
      await DocumentType.create({
        name: `${tag} SALN type`,
        aliases: [],
        logbookTypes: ["saln_mtop_bond_pds"],
        active: true,
      }),
    ],
  ]);
  for (const documentType of documentTypesByScope.values()) {
    if (!createdDocumentTypes.some((id) => id.equals(documentType._id)))
      createdDocumentTypes.push(documentType._id);
  }
  base = await launch();
  actorCookie = await login(actor);
  otherCookie = await login(other);
  adminCookie = await login(admin);

  await check(
    "1 Input types, amount boundaries, text limits, Unicode, and blanks",
    bodyFuzz,
  );
  await check(
    "2 Operators, prototype keys, dots, dollars, and version",
    operatorFuzz,
  );
  await check(
    "3 Invalid JSON, empty/oversized body, and content type",
    transportFuzz,
  );
  await check("4 IDs and lookup ID value types", idFuzz);
  await check("5 Calendar dates, year bounds, and returnedTime", dateFuzz);
  await check("6 PATCH null/undefined/details/type/no-op behavior", patchFuzz);
  await check(
    "7 Version increments, validation, parallel edits, and PATCH-submit race",
    versionFuzz,
  );
  await check(
    "8 Reference failure atomicity, double submit, 20-way numbers, eight prefixes",
    submitFuzz,
  );
  await check(
    "9 Policy matrix by owner/other/admin, status, and action",
    policyFuzz,
  );
  await check("10 Lookup validity and snapshot names", lookupFuzz);
  await check("11 Response shape and unknown route/method", responseFuzz);
  await check(
    "12 Activity log actor/resource/changes/secrets/failure behavior",
    activityFuzz,
  );
} catch (error) {
  results.push({
    name: "Setup and cleanup",
    status: "UNVERIFIED",
    detail: error instanceof Error ? error.message : "Setup failed",
  });
} finally {
  await Promise.all(
    servers.map((server) => new Promise((resolve) => server.close(resolve))),
  );
  if (connected) {
    try {
      const activityLogsAdded = await countActivityLogsAdded(baseline);
      await checkCleanup();
      const baselineCheck = await compareCollectionBaseline(baseline);
      results.push({
        name: "Temporary users, entries, lookup fixtures, sessions, logs, and 2099 counters cleaned",
        status: baselineCheck.passed ? "OK" : "BUG",
        detail: `activityLogs added=${activityLogsAdded}; ${baselineCheck.differences.join(", ") || "protected counts restored; exact fixture IDs removed"}`,
      });
    } catch (error) {
      results.push({
        name: "Temporary cleanup",
        status: "BUG",
        detail: error instanceof Error ? error.message : "Cleanup failed",
      });
    }
  }
  await mongoose.disconnect();
}

console.log("Check | Result | Detail");
for (const result of results)
  console.log(`${result.name} | ${result.status} | ${result.detail}`);
const failed = results.some((result) => result.status !== "OK");
console.log(`Overall | ${failed ? "FAIL" : "PASS"}`);
if (failed) process.exitCode = 1;
