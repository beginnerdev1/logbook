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
} from "./verificationDb.js";
import { createApp } from "../src/app.js";
import { LOGBOOK_TYPES } from "../src/shared/logbookTypes.js";
import {
  ActivityLog,
  DocumentType,
  Entry,
  Office,
  Session,
  User,
} from "../src/models/index.js";
import {
  canDeleteDraft,
  canEdit,
  canSubmit,
  canView,
} from "../src/policies/entryPolicy.js";

const tag = `b9a-${randomUUID().replaceAll("-", "")}`;
const password = randomBytes(32).toString("hex");
const createdUsers = [];
const createdEntryIds = [];
const createdOfficeIds = [];
const createdDocumentTypeIds = [];
const testReferenceSequences = new Map();
const countersBefore = new Map();
const servers = [];
const results = [];
const prefixes = [
  ...new Set(Object.values(LOGBOOK_TYPES).map(({ prefix }) => prefix)),
];
let base;
let actor;
let otherUser;
let admin;
let actorCookie;
let otherCookie;
let adminCookie;
let activeOffice;
let inactiveOffice;
let updateOffice;
let inactiveDocumentType;
let purchaseRequestType;
let certificationType;
let changingRulesType;
let connected = false;
let baseline;

function record(name, passed, detail = "") {
  results.push({ name, status: passed ? "PASS" : "FAIL", detail });
}

async function check(name, action) {
  try {
    record(name, true, (await action()) ?? "");
  } catch (error) {
    record(
      name,
      false,
      error instanceof Error ? error.message : "Check failed.",
    );
  }
}

async function createUser(role) {
  const sequence = createdUsers.length + 1;
  const user = await User.create({
    name: `${tag} ${role} ${sequence}`,
    email: `${tag}-${role}-${sequence}@example.test`,
    passwordHash: await bcrypt.hash(password, 12),
    role,
    active: true,
  });
  createdUsers.push(user);
  return user;
}

async function launch() {
  const server = createApp({
    config: authConfig,
    referenceNumberGenerator: testReferenceNo,
  }).listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}

async function testReferenceNo(prefix, year) {
  const key = `${prefix}-${year}`;
  const sequence = (testReferenceSequences.get(key) ?? 0) + 1;
  testReferenceSequences.set(key, sequence);
  return `${key}-${String(sequence).padStart(5, "0")}`;
}

function cookieFrom(response) {
  const cookies =
    response.headers.getSetCookie?.() ??
    [response.headers.get("set-cookie")].filter(Boolean);
  const line = cookies.find((value) =>
    value.startsWith(`${authConfig.cookieName}=`),
  );
  if (!line) throw new Error("Temporary login did not establish a session.");
  return line.split(";", 1)[0];
}

async function request(path, { method = "GET", body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const payload =
    response.status === 204 ? null : await response.json().catch(() => null);
  return { response, payload };
}

async function login(user) {
  const { response } = await request("/api/auth/login", {
    method: "POST",
    body: { email: user.email, password },
  });
  if (response.status !== 200)
    throw new Error(`Temporary ${user.role} login failed.`);
  return cookieFrom(response);
}

function assertStatus(result, status, code) {
  if (
    result.response.status !== status ||
    (code && result.payload?.code !== code)
  ) {
    throw new Error(
      `Expected ${status}${code ? ` ${code}` : ""}; received ${result.response.status} ${result.payload?.code ?? ""}: ${JSON.stringify(result.payload?.details ?? null)}`,
    );
  }
}

function safeShape(value) {
  return (
    value &&
    !Object.hasOwn(value, "_id") &&
    !Object.hasOwn(value, "__v") &&
    !Object.hasOwn(value, "passwordHash") &&
    !Object.hasOwn(value, "email")
  );
}

async function createDraft(
  logbookType,
  cookie = actorCookie,
  officeId = activeOffice._id.toString(),
) {
  const created = await request("/api/entries", {
    method: "POST",
    cookie,
    body: {
      logbookType,
      entryDate: "2099-01-02",
      name: `${tag} ${logbookType}`,
      officeId,
    },
  });
  if (created.response.status === 201 && created.payload?.id) {
    createdEntryIds.push(created.payload.id);
  }
  return created;
}

async function createPermitDraft(documentTypeId, values = {}) {
  const created = await request("/api/entries", {
    method: "POST",
    cookie: actorCookie,
    body: {
      logbookType: "permit_certification",
      entryDate: "2099-01-02",
      name: `${tag} permit record`,
      particulars: `${tag} particulars`,
      documentTypeId: documentTypeId.toString(),
      ...values,
    },
  });
  if (created.response.status === 201 && created.payload?.id) {
    createdEntryIds.push(created.payload.id);
  }
  return created;
}

async function createEntryFixture({
  owner = actor,
  status = "draft",
  name = `${tag} B9b fixture`,
  entryDate = "2098-01-02",
  source = "manual",
  needsReview = false,
  amountCentavos,
  trackingStatus,
  officeId = activeOffice._id,
  documentTypeId,
  logbookType = "petty_cash",
  reviewerComment,
} = {}) {
  const entry = await Entry.create({
    ...(status === "draft"
      ? {}
      : {
          referenceNo: `${tag}-${randomUUID()}`,
          submittedAt: new Date(),
        }),
    logbookType,
    entryDate,
    name,
    ...(logbookType !== "permit_certification"
      ? { officeId, officeName: activeOffice.fullName }
      : {}),
    ...(documentTypeId ? { documentTypeId } : {}),
    ...(amountCentavos !== undefined ? { amountCentavos } : {}),
    ...(trackingStatus ? { tracking: { status: trackingStatus } } : {}),
    status,
    source,
    needsReview,
    submittedBy: owner._id,
    ...(reviewerComment ? { reviewerComment } : {}),
  });
  createdEntryIds.push(entry._id.toString());
  return entry;
}

function queryPath(path, query) {
  const search = new URLSearchParams(query).toString();
  return search ? `${path}?${search}` : path;
}

function explainIndexes(plan) {
  const indexes = new Set();
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (value.stage === "IXSCAN" && value.indexName) {
      indexes.add(value.indexName);
    }
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === "object") visit(child);
    }
  };
  visit(plan);
  return [...indexes];
}

function fullValues(logbookType) {
  const values = {};
  const details = {};
  for (const field of LOGBOOK_TYPES[logbookType].fields) {
    if (!field.required) continue;
    let value;
    switch (field.input) {
      case "date":
        value = "2099-01-02";
        break;
      case "office":
        value = activeOffice._id.toString();
        break;
      case "documentType":
        value = undefined;
        break;
      case "money":
        value = 12345;
        break;
      case "tracking":
        value = { status: "received" };
        break;
      default:
        value = `${tag}-${field.key}`;
    }
    if (field.input === "documentType") continue;
    if (field.where === "details") details[field.key] = value;
    else values[field.key] = value;
  }
  values.officeId ??= activeOffice._id.toString();
  values.entryDate ??= "2099-01-02";
  values.name ??= `${tag} ${logbookType}`;
  return { values, details };
}

async function fullPatchValues(logbookType) {
  const { values, details } = fullValues(logbookType);
  if (
    LOGBOOK_TYPES[logbookType].fields.some(
      (field) => field.input === "documentType" && field.required,
    )
  ) {
    const documentType = await DocumentType.findOne(
      logbookType === "permit_certification"
        ? { name: "notice of award", active: true }
        : { active: true, logbookTypes: logbookType },
    );
    if (!documentType)
      throw new Error(`No active document type for ${logbookType}.`);
    values.documentTypeId = documentType._id.toString();
  }
  return { ...values, ...(Object.keys(details).length ? { details } : {}) };
}

async function prepareDraftForSubmit(draft, logbookType) {
  const values = await fullPatchValues(logbookType);
  const patched = await request(`/api/entries/${draft.id}`, {
    method: "PATCH",
    cookie: actorCookie,
    body: { version: draft.version, ...values },
  });
  assertStatus(patched, 200);
  return patched.payload;
}

async function cleanup() {
  const userIds = createdUsers.map((user) => user._id);
  const ownedEntryIds = userIds.length
    ? await findIds(Entry, { submittedBy: { $in: userIds } })
    : [];
  await deleteExactIds(Entry, [...createdEntryIds, ...ownedEntryIds]);
  await deleteExactIds(Office, createdOfficeIds);
  await deleteExactIds(DocumentType, createdDocumentTypeIds);
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
}

async function closeServers() {
  await Promise.all(
    servers.map((server) => new Promise((resolve) => server.close(resolve))),
  );
}

function verifyPolicyMatrix() {
  const statuses = ["draft", "pending", "approved", "rejected", "failed"];
  for (const status of statuses) {
    const ownEntry = { submittedBy: actor._id, status };
    const otherEntry = { submittedBy: otherUser._id, status };
    const editable = ["draft", "rejected"].includes(status);
    if (
      !canView(actor, ownEntry) ||
      canView(actor, otherEntry) ||
      !canView(admin, otherEntry)
    )
      throw new Error(`canView policy failed for ${status}.`);
    if (canEdit(actor, ownEntry) !== editable || !canEdit(admin, otherEntry))
      throw new Error(`canEdit policy failed for ${status}.`);
    if (canSubmit(actor, ownEntry) !== editable || canSubmit(admin, otherEntry))
      throw new Error(`canSubmit policy failed for ${status}.`);
    if (
      canDeleteDraft(actor, ownEntry) !== (status === "draft") ||
      canDeleteDraft(admin, otherEntry)
    )
      throw new Error(`canDeleteDraft policy failed for ${status}.`);
  }
}

try {
  await connectTestDb();
  connected = true;
  baseline = await captureCollectionBaseline();
  const counters = mongoose.connection.collection("counters");
  for (const prefix of prefixes) {
    const id2099 = `${prefix}-2099`;
    countersBefore.set(id2099, await counters.findOne({ _id: id2099 }));
  }
  actor = await createUser("user");
  otherUser = await createUser("user");
  admin = await createUser("admin");
  activeOffice = await Office.create({
    code: `${tag}-office`,
    fullName: `${tag} Office`,
    kind: "internal",
    aliases: [],
    active: true,
  });
  createdOfficeIds.push(activeOffice._id);
  inactiveOffice = await Office.create({
    code: `${tag}-inactive`,
    fullName: `${tag} Inactive`,
    kind: "internal",
    aliases: [],
    active: false,
  });
  createdOfficeIds.push(inactiveOffice._id);
  updateOffice = await Office.create({
    code: `${tag}-update`,
    fullName: `${tag} Update Office`,
    kind: "internal",
    aliases: [],
    active: true,
  });
  createdOfficeIds.push(updateOffice._id);
  inactiveDocumentType = await DocumentType.create({
    name: `${tag} inactive type`,
    aliases: [],
    logbookTypes: ["permit_certification"],
    active: false,
  });
  createdDocumentTypeIds.push(inactiveDocumentType._id);
  purchaseRequestType = await DocumentType.create({
    name: `${tag} purchase request`,
    aliases: [],
    logbookTypes: ["permit_certification"],
    fieldRules: { amountCentavos: "required" },
    active: true,
  });
  certificationType = await DocumentType.create({
    name: `${tag} certification`,
    aliases: [],
    logbookTypes: ["permit_certification"],
    fieldRules: { officeId: "hidden", amountCentavos: "hidden" },
    active: true,
  });
  changingRulesType = await DocumentType.create({
    name: `${tag} changing rules`,
    aliases: [],
    logbookTypes: ["permit_certification"],
    fieldRules: {},
    active: true,
  });
  createdDocumentTypeIds.push(
    purchaseRequestType._id,
    certificationType._id,
    changingRulesType._id,
  );
  base = await launch();
  actorCookie = await login(actor);
  otherCookie = await login(otherUser);
  adminCookie = await login(admin);

  await check(
    "Policy matrix covers role, status, and ownership",
    verifyPolicyMatrix,
  );
  await check(
    "All eight types create minimal drafts and submit with required fields",
    async () => {
      const references = [];
      for (const logbookType of Object.keys(LOGBOOK_TYPES)) {
        const draft = await createDraft(logbookType);
        assertStatus(draft, 201);
        if (
          draft.payload.status !== "draft" ||
          draft.payload.referenceNo ||
          !safeShape(draft.payload)
        )
          throw new Error(`Invalid minimal draft response for ${logbookType}.`);
        if (
          draft.payload.submittedBy?.id !== actor._id.toString() ||
          draft.payload.reviewedBy !== null
        )
          throw new Error(
            "Creation did not bind the owner or safe reviewer shape.",
          );
        const missing = await request(
          `/api/entries/${draft.payload.id}/submit`,
          {
            method: "POST",
            cookie: actorCookie,
            body: { version: draft.payload.version },
          },
        );
        assertStatus(missing, 400, "VALIDATION_ERROR");
        if (
          !Array.isArray(missing.payload.details) ||
          !missing.payload.details.length
        )
          throw new Error("Full-schema errors did not include field details.");
        const completed = await prepareDraftForSubmit(
          draft.payload,
          logbookType,
        );
        const submitted = await request(`/api/entries/${completed.id}/submit`, {
          method: "POST",
          cookie: actorCookie,
          body: { version: completed.version },
        });
        assertStatus(submitted, 200);
        if (
          submitted.payload.status !== "pending" ||
          !submitted.payload.referenceNo ||
          !submitted.payload.submittedAt
        )
          throw new Error(`Submit failed for ${logbookType}.`);
        if (!safeShape(submitted.payload))
          throw new Error("Response exposed internal fields.");
        references.push(submitted.payload.referenceNo);
        createdEntryIds.push(submitted.payload.id);
      }
      if (
        new Set(references).size !== references.length ||
        references.some((value) => !value.includes("-2099-"))
      ) {
        throw new Error(
          "Test-year references were not unique and isolated from real counters.",
        );
      }
      const counterCollection = mongoose.connection.collection("counters");
      for (const prefix of Object.values(LOGBOOK_TYPES).map(
        ({ prefix }) => prefix,
      )) {
        const counterId = `${prefix}-2099`;
        const before = countersBefore.get(counterId)?.seq ?? null;
        const after =
          (await counterCollection.findOne({ _id: counterId }))?.seq ?? null;
        if (before !== after)
          throw new Error(`Submit touched the real ${counterId} counter.`);
      }
    },
  );

  await check(
    "Permit document rules control office, amount, switching, and stored values",
    async () => {
      const certification = await createPermitDraft(certificationType._id);
      assertStatus(certification, 201);
      const submittedCertification = await request(
        `/api/entries/${certification.payload.id}/submit`,
        {
          method: "POST",
          cookie: actorCookie,
          body: { version: certification.payload.version },
        },
      );
      assertStatus(submittedCertification, 200);
      if (
        submittedCertification.payload.officeId ||
        submittedCertification.payload.amountCentavos !== undefined
      ) {
        throw new Error("Certification retained a hidden office or amount.");
      }

      for (const hiddenField of ["officeId", "amountCentavos"]) {
        const rejected = await createPermitDraft(certificationType._id, {
          [hiddenField]:
            hiddenField === "officeId" ? activeOffice._id.toString() : 100,
        });
        assertStatus(rejected, 400, "VALIDATION_ERROR");
        if (
          !rejected.payload.details?.some(
            (issue) => issue.field === hiddenField,
          )
        ) {
          throw new Error(`Hidden ${hiddenField} lacked a field issue.`);
        }
      }

      const purchase = await createPermitDraft(purchaseRequestType._id, {
        officeId: activeOffice._id.toString(),
      });
      assertStatus(purchase, 201);
      const missingAmount = await request(
        `/api/entries/${purchase.payload.id}/submit`,
        {
          method: "POST",
          cookie: actorCookie,
          body: { version: purchase.payload.version },
        },
      );
      assertStatus(missingAmount, 400, "VALIDATION_ERROR");
      if (
        !missingAmount.payload.details?.some(
          (issue) => issue.field === "amountCentavos",
        )
      ) {
        throw new Error("Missing required amount lacked a field issue.");
      }

      const switchDraft = await createPermitDraft(purchaseRequestType._id, {
        officeId: activeOffice._id.toString(),
        amountCentavos: 100,
      });
      assertStatus(switchDraft, 201);
      const switched = await request(`/api/entries/${switchDraft.payload.id}`, {
        method: "PATCH",
        cookie: actorCookie,
        body: {
          version: switchDraft.payload.version,
          entryDate: "2000-01-02",
          name: `${tag} switched record`,
          particulars: `${tag} particulars`,
          documentTypeId: certificationType._id.toString(),
        },
      });
      assertStatus(switched, 200);
      if (
        switched.payload.officeId !== undefined ||
        switched.payload.officeName !== undefined ||
        switched.payload.amountCentavos !== undefined
      ) {
        throw new Error("Changing document type did not clear hidden values.");
      }

      const existing = await createPermitDraft(changingRulesType._id, {
        officeId: activeOffice._id.toString(),
        amountCentavos: 456,
      });
      assertStatus(existing, 201);
      await DocumentType.updateOne(
        { _id: changingRulesType._id },
        { $set: { fieldRules: { amountCentavos: "hidden" } } },
      );
      const existingRead = await request(
        `/api/entries/${existing.payload.id}`,
        { cookie: actorCookie },
      );
      assertStatus(existingRead, 200);
      if (existingRead.payload.amountCentavos !== 456) {
        throw new Error("A rule change rewrote a previously stored amount.");
      }
      const newHiddenValue = await createPermitDraft(changingRulesType._id, {
        officeId: activeOffice._id.toString(),
        amountCentavos: 789,
      });
      assertStatus(newHiddenValue, 400, "VALIDATION_ERROR");
    },
  );

  await check(
    "Malformed dates and source/import restrictions return validation errors",
    async () => {
      const badDate = await request("/api/entries", {
        method: "POST",
        cookie: actorCookie,
        body: {
          logbookType: "petty_cash",
          entryDate: "2026-02-30",
          name: "Bad date",
          officeId: activeOffice._id.toString(),
        },
      });
      assertStatus(badDate, 400, "VALIDATION_ERROR");
      const badSource = await request("/api/entries", {
        method: "POST",
        cookie: actorCookie,
        body: {
          logbookType: "petty_cash",
          entryDate: "2000-01-02",
          name: "Bad source",
          officeId: activeOffice._id.toString(),
          source: "import",
        },
      });
      assertStatus(badSource, 400, "VALIDATION_ERROR");
    },
  );

  await check("Malformed entry id returns 400 VALIDATION_ERROR", async () => {
    assertStatus(
      await request("/api/entries/not-an-object-id", { cookie: actorCookie }),
      400,
      "VALIDATION_ERROR",
    );
  });

  await check(
    "Mass assignment and client officeName are rejected without writes",
    async () => {
      const before = await Entry.countDocuments({ submittedBy: actor._id });
      const rejectedCreate = await request("/api/entries", {
        method: "POST",
        cookie: actorCookie,
        body: {
          logbookType: "petty_cash",
          entryDate: "2000-01-02",
          name: "Mass assign",
          officeId: activeOffice._id.toString(),
          officeName: "forged",
          status: "approved",
          submittedBy: admin._id.toString(),
        },
      });
      assertStatus(rejectedCreate, 400, "VALIDATION_ERROR");
      if ((await Entry.countDocuments({ submittedBy: actor._id })) !== before)
        throw new Error("Rejected mass assignment created an entry.");
      const draft = await createDraft("petty_cash");
      assertStatus(draft, 201);
      const patch = await request(`/api/entries/${draft.payload.id}`, {
        method: "PATCH",
        cookie: actorCookie,
        body: {
          version: draft.payload.version,
          status: "approved",
          referenceNo: "FORGED",
          officeName: "forged",
        },
      });
      assertStatus(patch, 400, "VALIDATION_ERROR");
      const unchanged = await Entry.findById(draft.payload.id).lean();
      if (
        unchanged.status !== "draft" ||
        unchanged.referenceNo ||
        unchanged.officeName !== activeOffice.fullName
      )
        throw new Error(
          "Rejected PATCH changed data or used the client officeName.",
        );
    },
  );

  await check(
    "Inactive office rejected on create but unchanged inactive office retained on update",
    async () => {
      const rejected = await request("/api/entries", {
        method: "POST",
        cookie: actorCookie,
        body: {
          logbookType: "petty_cash",
          entryDate: "2000-01-02",
          name: "Inactive reject",
          officeId: inactiveOffice._id.toString(),
        },
      });
      assertStatus(rejected, 400, "VALIDATION_ERROR");
      const draft = await createDraft(
        "petty_cash",
        actorCookie,
        updateOffice._id.toString(),
      );
      assertStatus(draft, 201);
      await Office.updateOne(
        { _id: updateOffice._id },
        { $set: { active: false } },
      );
      const patched = await request(`/api/entries/${draft.payload.id}`, {
        method: "PATCH",
        cookie: actorCookie,
        body: { version: draft.payload.version, name: `${tag} kept inactive` },
      });
      assertStatus(patched, 200);
      if (patched.payload.officeName !== updateOffice.fullName)
        throw new Error("Unchanged inactive office snapshot was not retained.");
    },
  );

  await check("Inactive document type rejected for a new value", async () => {
    const rejected = await request("/api/entries", {
      method: "POST",
      cookie: actorCookie,
      body: {
        logbookType: "permit_certification",
        entryDate: "2000-01-02",
        name: "Inactive type",
        officeId: activeOffice._id.toString(),
        documentTypeId: inactiveDocumentType._id.toString(),
      },
    });
    assertStatus(rejected, 400, "VALIDATION_ERROR");
  });

  let submittedEntry;
  await check(
    "Owner controls visibility and editing; admins may edit any entry",
    async () => {
      const draft = await createDraft("petty_cash");
      assertStatus(draft, 201);
      const ownerRead = await request(`/api/entries/${draft.payload.id}`, {
        cookie: actorCookie,
      });
      assertStatus(ownerRead, 200);
      if (!safeShape(ownerRead.payload))
        throw new Error("GET response exposed internal fields.");
      const hidden = await request(`/api/entries/${draft.payload.id}`, {
        cookie: otherCookie,
      });
      assertStatus(hidden, 404, "NOT_FOUND");
      const completed = await prepareDraftForSubmit(
        draft.payload,
        "petty_cash",
      );
      const submitted = await request(`/api/entries/${completed.id}/submit`, {
        method: "POST",
        cookie: actorCookie,
        body: { version: completed.version },
      });
      assertStatus(submitted, 200);
      submittedEntry = submitted.payload;
      const ownerEdit = await request(`/api/entries/${submittedEntry.id}`, {
        method: "PATCH",
        cookie: actorCookie,
        body: {
          version: submittedEntry.version,
          name: `${tag} forbidden edit`,
        },
      });
      assertStatus(ownerEdit, 403, "FORBIDDEN");
      if (ownerEdit.payload.message !== "This entry can no longer be edited.")
        throw new Error("Owner lock response message was incorrect.");
      const adminEdit = await request(`/api/entries/${submittedEntry.id}`, {
        method: "PATCH",
        cookie: adminCookie,
        body: { version: submittedEntry.version, name: `${tag} admin edit` },
      });
      assertStatus(adminEdit, 200);
      submittedEntry = adminEdit.payload;
      const deletePending = await request(`/api/entries/${submittedEntry.id}`, {
        method: "DELETE",
        cookie: actorCookie,
        body: {},
      });
      assertStatus(deletePending, 403, "FORBIDDEN");
      const typeChange = await request(`/api/entries/${submittedEntry.id}`, {
        method: "PATCH",
        cookie: adminCookie,
        body: { version: submittedEntry.version, logbookType: "check" },
      });
      assertStatus(typeChange, 409, "INVALID_STATE");
    },
  );

  await check("Resubmission retains reviewer feedback metadata", async () => {
    const draft = await createDraft("petty_cash");
    assertStatus(draft, 201);
    const completed = await prepareDraftForSubmit(draft.payload, "petty_cash");
    const stored = await Entry.findById(completed.id);
    stored.referenceNo = await testReferenceNo("PTC", 2000);
    stored.status = "rejected";
    stored.reviewedBy = admin._id;
    stored.reviewedAt = new Date("2000-01-03T00:00:00.000Z");
    stored.reviewerComment = `${tag} previous feedback`;
    await stored.save();
    const resubmitted = await request(`/api/entries/${stored._id}/submit`, {
      method: "POST",
      cookie: actorCookie,
      body: { version: stored.__v },
    });
    assertStatus(resubmitted, 200);
    if (
      resubmitted.payload.referenceNo !== stored.referenceNo ||
      resubmitted.payload.reviewerComment !== stored.reviewerComment ||
      resubmitted.payload.reviewedBy?.id !== admin._id.toString()
    ) {
      throw new Error("Resubmission did not retain prior reviewer feedback.");
    }
  });

  await check("Delete succeeds only for owner drafts", async () => {
    const draft = await createDraft("petty_cash");
    assertStatus(draft, 201);
    const deleted = await request(`/api/entries/${draft.payload.id}`, {
      method: "DELETE",
      cookie: actorCookie,
      body: {},
    });
    assertStatus(deleted, 204);
    createdEntryIds.splice(createdEntryIds.indexOf(draft.payload.id), 1);
  });

  await check("Parallel submits never duplicate references", async () => {
    const first = await createDraft("petty_cash");
    const second = await createDraft("petty_cash");
    assertStatus(first, 201);
    assertStatus(second, 201);
    const firstReady = await prepareDraftForSubmit(first.payload, "petty_cash");
    const secondReady = await prepareDraftForSubmit(
      second.payload,
      "petty_cash",
    );
    const [a, b] = await Promise.all([
      request(`/api/entries/${firstReady.id}/submit`, {
        method: "POST",
        cookie: actorCookie,
        body: { version: firstReady.version },
      }),
      request(`/api/entries/${secondReady.id}/submit`, {
        method: "POST",
        cookie: actorCookie,
        body: { version: secondReady.version },
      }),
    ]);
    const successes = [a, b].filter((result) => result.response.status === 200);
    if (
      successes.length !== 2 ||
      successes[0].payload.referenceNo === successes[1].payload.referenceNo
    )
      throw new Error(
        "Parallel submissions did not receive unique reference numbers.",
      );
  });

  await check("Sequential submit references increase", async () => {
    const first = await createDraft("voucher");
    const second = await createDraft("voucher");
    assertStatus(first, 201);
    assertStatus(second, 201);
    const firstReady = await prepareDraftForSubmit(first.payload, "voucher");
    const secondReady = await prepareDraftForSubmit(second.payload, "voucher");
    const firstSubmitted = await request(
      `/api/entries/${firstReady.id}/submit`,
      {
        method: "POST",
        cookie: actorCookie,
        body: { version: firstReady.version },
      },
    );
    const secondSubmitted = await request(
      `/api/entries/${secondReady.id}/submit`,
      {
        method: "POST",
        cookie: actorCookie,
        body: { version: secondReady.version },
      },
    );
    assertStatus(firstSubmitted, 200);
    assertStatus(secondSubmitted, 200);
    if (
      Number(secondSubmitted.payload.referenceNo.split("-").at(-1)) <=
      Number(firstSubmitted.payload.referenceNo.split("-").at(-1))
    ) {
      throw new Error("Sequential references did not increase.");
    }
  });

  await check(
    "Stale version and parallel patches return VERSION_CONFLICT",
    async () => {
      const draft = await createDraft("petty_cash");
      assertStatus(draft, 201);
      const [first, second] = await Promise.all([
        request(`/api/entries/${draft.payload.id}`, {
          method: "PATCH",
          cookie: actorCookie,
          body: { version: draft.payload.version, name: `${tag} patch one` },
        }),
        request(`/api/entries/${draft.payload.id}`, {
          method: "PATCH",
          cookie: actorCookie,
          body: { version: draft.payload.version, name: `${tag} patch two` },
        }),
      ]);
      const succeeded = [first, second].find(
        (result) => result.response.status === 200,
      );
      const conflicted = [first, second].find(
        (result) => result.response.status === 409,
      );
      assertStatus(succeeded, 200);
      assertStatus(conflicted, 409, "VERSION_CONFLICT");
      assertStatus(
        await request(`/api/entries/${draft.payload.id}`, {
          method: "PATCH",
          cookie: actorCookie,
          body: { version: draft.payload.version, name: "Stale" },
        }),
        409,
        "VERSION_CONFLICT",
      );
    },
  );

  await check("Activity logs include entry actions and actor ids", async () => {
    const logs = await ActivityLog.find({
      userId: actor._id,
      resourceType: "entry",
      resourceRef: { $exists: true },
    }).lean();
    const actions = new Set(logs.map((log) => log.action));
    for (const action of [
      "entry_created",
      "entry_edited",
      "entry_submitted",
      "draft_deleted",
    ]) {
      if (!actions.has(action))
        throw new Error(`Missing ${action} activity log.`);
    }
    if (logs.some((log) => !log.userId || !log.resourceRef))
      throw new Error("Activity log omitted actor or resource reference.");
    if (
      logs
        .filter((log) => log.action === "entry_edited")
        .some((log) => !log.changes.length)
    )
      throw new Error("Edit activity log omitted field changes.");
  });

  await check(
    "B9b list scope, filters, stable paging, and strict search/query validation",
    async () => {
      const listFixtures = [
        await createEntryFixture({
          status: "pending",
          name: `${tag} B9b pending searchable`,
          source: "ai",
          needsReview: true,
          amountCentavos: 101,
          trackingStatus: "returned",
          documentTypeId: purchaseRequestType._id,
          entryDate: "2098-01-02",
        }),
        await createEntryFixture({
          status: "approved",
          name: `${tag} B9b approved searchable`,
          amountCentavos: 202,
          officeId: updateOffice._id,
          entryDate: "2098-01-03",
        }),
        await createEntryFixture({
          status: "rejected",
          name: `${tag} B9b rejected searchable`,
          entryDate: "2098-01-04",
        }),
      ];
      const otherDraft = await createEntryFixture({
        owner: otherUser,
        name: `${tag} B9b other draft`,
      });
      const otherPending = await createEntryFixture({
        owner: otherUser,
        status: "pending",
        name: `${tag} B9b other pending`,
      });
      const permit = await createEntryFixture({
        status: "approved",
        name: `${tag} B9b permit`,
        logbookType: "permit_certification",
        documentTypeId: certificationType._id,
        entryDate: "2098-01-05",
      });

      const ownerList = await request(
        queryPath("/api/entries", { pageSize: "100" }),
        { cookie: actorCookie },
      );
      assertStatus(ownerList, 200);
      if (
        ownerList.payload.items.some(
          (item) => item.submittedBy?.id !== actor._id.toString(),
        )
      ) {
        throw new Error("A normal user received another user's entry.");
      }
      const listItem = ownerList.payload.items.find(
        (item) => item.id === listFixtures[0]._id.toString(),
      );
      const singleItem = await request(
        `/api/entries/${listFixtures[0]._id}`,
        { cookie: actorCookie },
      );
      assertStatus(singleItem, 200);
      if (
        JSON.stringify(Object.keys(listItem ?? {}).sort()) !==
          JSON.stringify(Object.keys(singleItem.payload).sort()) ||
        JSON.stringify(Object.keys(listItem?.submittedBy ?? {}).sort()) !==
          JSON.stringify(["id", "name"]) ||
        (listItem?.reviewedBy &&
          JSON.stringify(Object.keys(listItem.reviewedBy).sort()) !==
            JSON.stringify(["id", "name"]))
      ) {
        throw new Error("List entry shape differed from GET one.");
      }
      const adminOtherScope = await request(
        queryPath("/api/entries", {
          submittedBy: otherUser._id.toString(),
          pageSize: "100",
        }),
        { cookie: adminCookie },
      );
      assertStatus(adminOtherScope, 200);
      const adminOtherIds = new Set(
        adminOtherScope.payload.items.map((item) => item.id),
      );
      if (!adminOtherIds.has(otherPending._id.toString()) || adminOtherIds.has(otherDraft._id.toString())) {
        throw new Error("Admin scope did not hide only other users' drafts.");
      }
      assertStatus(
        await request(
          queryPath("/api/entries", {
            submittedBy: actor._id.toString(),
          }),
          { cookie: actorCookie },
        ),
        400,
        "VALIDATION_ERROR",
      );
      const ownMine = await request(
        queryPath("/api/entries", { mine: "true", pageSize: "100" }),
        { cookie: actorCookie },
      );
      assertStatus(ownMine, 200);
      if (ownMine.payload.items.some((item) => item.submittedBy?.id !== actor._id.toString())) {
        throw new Error("mine=true did not remain scoped to the requester.");
      }

      const scoped = { submittedBy: actor._id.toString() };
      const filters = [
        { logbookType: "permit_certification", expected: [permit._id] },
        {
          documentTypeId: certificationType._id.toString(),
          expected: [permit._id],
        },
        { officeId: activeOffice._id.toString(), expected: [listFixtures[0]._id] },
        {
          status: "pending,rejected",
          expected: [listFixtures[0]._id, listFixtures[2]._id],
        },
        { trackingStatus: "returned", expected: [listFixtures[0]._id] },
        { source: "ai", expected: [listFixtures[0]._id] },
        { needsReview: "true", expected: [listFixtures[0]._id] },
        {
          dateFrom: "2098-01-03",
          dateTo: "2098-01-04",
          expected: [listFixtures[1]._id, listFixtures[2]._id],
        },
      ];
      for (const { expected, ...filter } of filters) {
        const result = await request(
          queryPath("/api/entries", { ...scoped, ...filter, pageSize: "100" }),
          { cookie: adminCookie },
        );
        assertStatus(result, 200);
        const foundIds = new Set(result.payload.items.map((item) => item.id));
        if (expected.some((id) => !foundIds.has(id.toString()))) {
          throw new Error(`List filter ${Object.keys(filter).join(",")} failed.`);
        }
      }
      const combinedFilter = await request(
        queryPath("/api/entries", {
          ...scoped,
          status: "pending",
          source: "ai",
          trackingStatus: "returned",
          needsReview: "true",
          dateFrom: "2098-01-02",
          dateTo: "2098-01-02",
          pageSize: "100",
        }),
        { cookie: adminCookie },
      );
      assertStatus(combinedFilter, 200);
      if (
        combinedFilter.payload.total !== 1 ||
        combinedFilter.payload.items[0]?.id !== listFixtures[0]._id.toString()
      ) {
        throw new Error("Combined list filters were not all applied.");
      }
      assertStatus(
        await request(
          queryPath("/api/entries", {
            ...scoped,
            dateFrom: "2098-01-04",
            dateTo: "2098-01-03",
          }),
          { cookie: adminCookie },
        ),
        400,
        "VALIDATION_ERROR",
      );
      for (const sort of [
        "entryDate",
        "createdAt",
        "submittedAt",
        "referenceNo",
        "name",
        "amountCentavos",
        "status",
      ]) {
        assertStatus(
          await request(queryPath("/api/entries", { ...scoped, sort }), {
            cookie: adminCookie,
          }),
          200,
        );
      }

      const duplicateA = await createEntryFixture({
        status: "pending",
        name: `${tag} B9b stable duplicate`,
        entryDate: "2097-01-01",
      });
      const duplicateB = await createEntryFixture({
        status: "pending",
        name: `${tag} B9b stable duplicate`,
        entryDate: "2097-01-01",
      });
      const stableQuery = {
        ...scoped,
        search: "B9b stable duplicate",
        sort: "entryDate",
        order: "asc",
        pageSize: "1",
      };
      const firstPage = await request(
        queryPath("/api/entries", { ...stableQuery, page: "1" }),
        { cookie: adminCookie },
      );
      const secondPage = await request(
        queryPath("/api/entries", { ...stableQuery, page: "2" }),
        { cookie: adminCookie },
      );
      assertStatus(firstPage, 200);
      assertStatus(secondPage, 200);
      const expectedOrder = [
        duplicateA._id.toString(),
        duplicateB._id.toString(),
      ].sort();
      if (
        firstPage.payload.items[0]?.id !== expectedOrder[0] ||
        secondPage.payload.items[0]?.id !== expectedOrder[1]
      ) {
        throw new Error(
          `Equal sort keys did not page stably by _id: ${firstPage.payload.items[0]?.id}, ${secondPage.payload.items[0]?.id}; expected ${expectedOrder.join(",")}.`,
        );
      }
      const pastEnd = await request(
        queryPath("/api/entries", {
          ...stableQuery,
          page: "1000",
        }),
        { cookie: adminCookie },
      );
      assertStatus(pastEnd, 200);
      if (
        pastEnd.payload.items.length !== 0 ||
        pastEnd.payload.total !== 2 ||
        pastEnd.payload.page !== 1000
      ) {
        throw new Error("Past-end paging did not return an empty page and total.");
      }
      assertStatus(
        await request("/api/entries?pageSize=101", { cookie: actorCookie }),
        400,
        "VALIDATION_ERROR",
      );

      const specialValues = [".*", "(", "[", "\\", "$"];
      for (const value of specialValues) {
        await createEntryFixture({
          status: "pending",
          name: `${tag} B9b literal ${value}`,
          entryDate: "2096-01-01",
        });
        const result = await request(
          queryPath("/api/entries", {
            ...scoped,
            search: value,
            pageSize: "100",
          }),
          { cookie: adminCookie },
        );
        assertStatus(result, 200);
        if (
          result.payload.total !== 1 ||
          !result.payload.items[0].name.endsWith(`literal ${value}`)
        ) {
          throw new Error(`Search did not treat ${JSON.stringify(value)} literally.`);
        }
      }
      assertStatus(
        await request(
          queryPath("/api/entries", { search: "x".repeat(101) }),
          { cookie: actorCookie },
        ),
        400,
        "VALIDATION_ERROR",
      );
      for (const path of [
        "/api/entries?unknown=value",
        "/api/entries?status%5B%24ne%5D=pending",
        "/api/entries?status=pending&status=approved",
        "/api/entries?__proto__=x",
        "/api/entries?page%5B%5D=1",
      ]) {
        assertStatus(
          await request(path, { cookie: actorCookie }),
          400,
          "VALIDATION_ERROR",
        );
      }
    },
  );

  await check(
    "B9b approve/reject authorization, versioning, audit logs, and single-winner review",
    async () => {
      const forbiddenReview = await createEntryFixture({ status: "pending" });
      const forbiddenLogsBefore = await ActivityLog.countDocuments({
        resourceId: forbiddenReview._id,
        action: { $in: ["entry_approved", "entry_rejected"] },
      });
      assertStatus(
        await request(`/api/entries/${forbiddenReview._id}/approve`, {
          method: "POST",
          cookie: actorCookie,
          body: { version: forbiddenReview.__v },
        }),
        403,
        "FORBIDDEN",
      );
      assertStatus(
        await request(`/api/entries/${"f".repeat(24)}/approve`, {
          method: "POST",
          cookie: adminCookie,
          body: { version: 0 },
        }),
        404,
        "NOT_FOUND",
      );
      assertStatus(
        await request(`/api/entries/${forbiddenReview._id}/approve`, {
          method: "POST",
          cookie: adminCookie,
          body: { version: forbiddenReview.__v + 1 },
        }),
        409,
        "VERSION_CONFLICT",
      );
      assertStatus(
        await request(`/api/entries/${forbiddenReview._id}/reject`, {
          method: "POST",
          cookie: adminCookie,
          body: { version: forbiddenReview.__v },
        }),
        400,
        "VALIDATION_ERROR",
      );
      assertStatus(
        await request(`/api/entries/${forbiddenReview._id}/reject`, {
          method: "POST",
          cookie: adminCookie,
          body: { version: forbiddenReview.__v, comment: "   " },
        }),
        400,
        "VALIDATION_ERROR",
      );
      const draft = await createEntryFixture();
      assertStatus(
        await request(`/api/entries/${draft._id}/approve`, {
          method: "POST",
          cookie: adminCookie,
          body: { version: draft.__v },
        }),
        409,
        "INVALID_STATE",
      );
      const forbiddenLogsAfter = await ActivityLog.countDocuments({
        resourceId: forbiddenReview._id,
        action: { $in: ["entry_approved", "entry_rejected"] },
      });
      if (forbiddenLogsAfter !== forbiddenLogsBefore) {
        throw new Error("A failed review attempt wrote a success activity log.");
      }

      const selfReview = await createEntryFixture({
        owner: admin,
        status: "pending",
        reviewerComment: `${tag} old comment`,
      });
      const approved = await request(
        `/api/entries/${selfReview._id}/approve`,
        {
          method: "POST",
          cookie: adminCookie,
          body: { version: selfReview.__v },
        },
      );
      assertStatus(approved, 200);
      if (
        approved.payload.status !== "approved" ||
        approved.payload.reviewedBy?.id !== admin._id.toString() ||
        approved.payload.reviewerComment !== undefined
      ) {
        throw new Error("Approve did not clear old comment or set reviewer fields.");
      }
      const selfLog = await ActivityLog.findOne({
        resourceId: selfReview._id,
        action: "entry_approved",
      }).lean();
      if (!selfLog?.selfReview || selfLog.userId.toString() !== admin._id.toString()) {
        throw new Error("Self-review was not recorded on the activity log.");
      }

      const rejectTarget = await createEntryFixture({ status: "pending" });
      const longComment = `  ${"c".repeat(250)}  `;
      const rejected = await request(
        `/api/entries/${rejectTarget._id}/reject`,
        {
          method: "POST",
          cookie: adminCookie,
          body: { version: rejectTarget.__v, comment: longComment },
        },
      );
      assertStatus(rejected, 200);
      const rejectLog = await ActivityLog.findOne({
        resourceId: rejectTarget._id,
        action: "entry_rejected",
      }).lean();
      if (
        rejected.payload.reviewerComment !== "c".repeat(250) ||
        rejectLog?.comment !== "c".repeat(200) ||
        rejectLog.selfReview !== false
      ) {
        throw new Error("Rejection comment trimming, truncation, or audit data failed.");
      }

      const raced = await createEntryFixture({ status: "pending" });
      const raceResults = await Promise.all(
        ["approve", "approve"].map(() =>
          request(`/api/entries/${raced._id}/approve`, {
            method: "POST",
            cookie: adminCookie,
            body: { version: raced.__v },
          }),
        ),
      );
      if (
        raceResults.filter((item) => item.response.status === 200).length !== 1 ||
        raceResults.filter((item) => item.response.status === 409).length !== 1
      ) {
        throw new Error("Concurrent approve did not have exactly one winner.");
      }
      const raceLogs = await ActivityLog.countDocuments({
        resourceId: raced._id,
        action: "entry_approved",
      });
      if (raceLogs !== 1) {
        throw new Error("Concurrent review wrote more than one success log.");
      }
    },
  );

  await check(
    "B9b history visibility, pagination, ordering, and response minimization",
    async () => {
      const draft = await createDraft("petty_cash");
      assertStatus(draft, 201);
      const ready = await prepareDraftForSubmit(draft.payload, "petty_cash");
      const submitted = await request(`/api/entries/${ready.id}/submit`, {
        method: "POST",
        cookie: actorCookie,
        body: { version: ready.version },
      });
      assertStatus(submitted, 200);
      const approved = await request(`/api/entries/${ready.id}/approve`, {
        method: "POST",
        cookie: adminCookie,
        body: { version: submitted.payload.version },
      });
      assertStatus(approved, 200);
      assertStatus(
        await request(`/api/entries/${ready.id}/history`, {
          cookie: otherCookie,
        }),
        404,
        "NOT_FOUND",
      );
      const firstPage = await request(
        `/api/entries/${ready.id}/history?page=1&pageSize=2`,
        { cookie: actorCookie },
      );
      assertStatus(firstPage, 200);
      if (
        firstPage.payload.total < 3 ||
        firstPage.payload.items.length !== 2 ||
        firstPage.payload.items[0].action !== "entry_approved"
      ) {
        throw new Error("History was not paginated newest first.");
      }
      const pageKeys = ["action", "actor", "at", "changes", "result"].sort();
      for (const item of firstPage.payload.items) {
        if (
          JSON.stringify(Object.keys(item).sort()) !== JSON.stringify(pageKeys) ||
          JSON.stringify(Object.keys(item.actor).sort()) !==
            JSON.stringify(["id", "name"]) ||
          ["ip", "userAgent", "cookie", "body", "requestBody"].some((key) =>
            Object.hasOwn(item, key),
          )
        ) {
          throw new Error("History exposed fields outside its safe response shape.");
        }
      }
      assertStatus(
        await request(`/api/entries/${ready.id}/history?pageSize=51`, {
          cookie: actorCookie,
        }),
        400,
        "VALIDATION_ERROR",
      );
    },
  );

  await check(
    "B9b stats scope, admin-only summaries, and approved amount aggregation",
    async () => {
      const statsLabel = `${tag} B9b stats group`;
      await createEntryFixture({
        status: "approved",
        name: `${statsLabel} amount one`,
        amountCentavos: 100,
      });
      await createEntryFixture({
        status: "approved",
        name: `${statsLabel} amount two`,
        amountCentavos: 200,
      });
      await createEntryFixture({
        status: "approved",
        name: `${statsLabel} no amount`,
        logbookType: "permit_certification",
        documentTypeId: certificationType._id,
      });
      await createEntryFixture({
        owner: otherUser,
        status: "approved",
        name: `${statsLabel} other approved`,
        amountCentavos: 1000,
      });
      await createEntryFixture({
        owner: otherUser,
        name: `${statsLabel} other draft`,
        amountCentavos: 5000,
      });
      const query = queryPath("/api/entries/stats", {
        search: statsLabel,
      });
      const userStats = await request(query, { cookie: actorCookie });
      assertStatus(userStats, 200);
      if (
        userStats.payload.total !== 3 ||
        userStats.payload.approvedAmountCentavos !== 300 ||
        userStats.payload.approvedWithAmountCount !== 2 ||
        Object.hasOwn(userStats.payload, "totalActiveUsers") ||
        Object.hasOwn(userStats.payload, "recentActivity")
      ) {
        throw new Error("User stats scope or amount aggregation was incorrect.");
      }
      const adminStats = await request(query, { cookie: adminCookie });
      assertStatus(adminStats, 200);
      if (
        adminStats.payload.total !== 4 ||
        adminStats.payload.approvedAmountCentavos !== 1300 ||
        adminStats.payload.approvedWithAmountCount !== 3 ||
        typeof adminStats.payload.totalActiveUsers !== "number" ||
        adminStats.payload.recentSubmissions.length > 5 ||
        adminStats.payload.recentActivity.length > 10
      ) {
        throw new Error("Admin stats scope or admin-only summaries were incorrect.");
      }
      if (
        adminStats.payload.recentSubmissions.some(
          (item) => !safeShape(item) || !item.submittedBy?.id,
        ) ||
        adminStats.payload.recentActivity.some((item) =>
          ["ip", "userAgent", "cookie", "body"].some((key) =>
            Object.hasOwn(item, key),
          ),
        )
      ) {
        throw new Error("Admin statistics exposed unsafe activity or entry fields.");
      }
      const sampleId = adminStats.payload.recentSubmissions[0]?.id;
      if (sampleId) {
        const one = await request(`/api/entries/${sampleId}`, {
          cookie: adminCookie,
        });
        assertStatus(one, 200);
        if (
          JSON.stringify(Object.keys(one.payload).sort()) !==
          JSON.stringify(Object.keys(adminStats.payload.recentSubmissions[0]).sort())
        ) {
          throw new Error("Recent submission item shape differed from GET one.");
        }
      }
    },
  );

  await check("B9b approval and My Records explain plans use their indexes", async () => {
    const approvals = await Entry.find({
      status: "pending",
      submittedAt: { $exists: true },
    })
      .sort({ submittedAt: -1 })
      .explain("queryPlanner");
    const myRecords = await Entry.find({
      submittedBy: actor._id,
      status: "approved",
    })
      .sort({ entryDate: -1 })
      .explain("queryPlanner");
    const approvalsIndexes = explainIndexes(approvals.queryPlanner.winningPlan);
    const myRecordsIndexes = explainIndexes(myRecords.queryPlanner.winningPlan);
    if (
      !approvalsIndexes.includes("approvals_queue") ||
      !myRecordsIndexes.includes("my_records")
    ) {
      throw new Error(
        `Expected approvals_queue and my_records; got ${approvalsIndexes.join(",") || "none"} and ${myRecordsIndexes.join(",") || "none"}.`,
      );
    }
    return `approvals_queue=${approvalsIndexes.join(",")}; my_records=${myRecordsIndexes.join(",")}`;
  });
} catch (error) {
  record(
    "Verifier setup",
    false,
    error instanceof Error ? error.message : "Verification setup failed.",
  );
} finally {
  await closeServers();
  if (connected) {
    try {
      const activityLogsAdded = await countActivityLogsAdded(baseline);
      await cleanup();
      const baselineCheck = await compareCollectionBaseline(baseline);
      record(
        "Temporary users, entries, lookup fixtures, logs, sessions, and 2099 counters cleaned",
        baselineCheck.passed,
        `activityLogs added=${activityLogsAdded}; ${baselineCheck.differences.join(", ") || "protected counts restored"}`,
      );
    } catch (error) {
      record(
        "Temporary records cleanup",
        false,
        error instanceof Error ? error.message : "Cleanup failed.",
      );
    }
  }
  await mongoose.disconnect();
}

console.log("Check | Result | Detail");
for (const result of results)
  console.log(`${result.name} | ${result.status} | ${result.detail}`);
const passed =
  results.length > 0 && results.every(({ status }) => status === "PASS");
console.log(`Overall | ${passed ? "PASS" : "FAIL"}`);
if (!passed) process.exitCode = 1;
