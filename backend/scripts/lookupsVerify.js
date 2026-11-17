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
import {
  ActivityLog,
  DocumentType,
  Office,
  Session,
  User,
} from "../src/models/index.js";

const tag = `b8${randomUUID().replaceAll("-", "").slice(0, 14)}`;
const password = randomBytes(32).toString("hex");
const createdUsers = [];
const servers = [];
const officeCodes = [
  `${tag}-office`,
  `${tag}-inactive`,
  `${tag}-alias`,
  `${tag}-blocked`,
  `${tag}-case-office`,
  `${tag}-alias-collision`,
];
const documentNames = [`${tag} document`, `${tag} inactive document`];
const createdDocumentTypeIds = [];
const createdOfficeIds = [];
const results = [];
let base;
let admin;
let user;
let adminCookie;
let userCookie;
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
  const created = await User.create({
    name: `${tag} ${role}`,
    email: `${tag}-${role}@example.test`,
    passwordHash: await bcrypt.hash(password, 12),
    role,
    active: true,
  });
  createdUsers.push(created);
  return created;
}

async function launch() {
  const server = createApp({ config: authConfig }).listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}

function cookieFrom(response) {
  const lines =
    response.headers.getSetCookie?.() ??
    [response.headers.get("set-cookie")].filter(Boolean);
  const line = lines.find((value) =>
    value.startsWith(`${authConfig.cookieName}=`),
  );
  if (!line) throw new Error("Login did not set a session cookie.");
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
  if (response.status === 201 && payload?.id) {
    if (path === "/api/offices") createdOfficeIds.push(payload.id);
    if (path === "/api/document-types") createdDocumentTypeIds.push(payload.id);
  }
  return { response, payload };
}

async function login(created) {
  const { response, payload } = await request("/api/auth/login", {
    method: "POST",
    body: { email: created.email, password },
  });
  if (response.status !== 200)
    throw new Error(`Temporary ${created.role} login failed.`);
  return cookieFrom(response);
}

function assertStatus(result, status, code) {
  if (
    result.response.status !== status ||
    (code && result.payload?.code !== code)
  ) {
    throw new Error(
      `Expected ${status}${code ? ` ${code}` : ""}; received ${result.response.status} ${result.payload?.code ?? ""}.`,
    );
  }
}

function hasNoMongooseFields(value) {
  return value && !Object.hasOwn(value, "_id") && !Object.hasOwn(value, "__v");
}

function trackCreated(result, ids) {
  if (result.response.status === 201 && result.payload?.id) {
    ids.push(result.payload.id);
  }
}

async function cleanup() {
  const userIds = createdUsers.map((created) => created._id);
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

let connected = false;
try {
  await connectTestDb();
  connected = true;
  baseline = await captureCollectionBaseline();
  const seededOfficeCount = await Office.countDocuments();
  const seededDocumentTypeCount = await DocumentType.countDocuments();
  await check(
    "Seeded counts are 28 offices and 24 document types",
    async () => {
      if (seededOfficeCount !== 28 || seededDocumentTypeCount !== 24) {
        throw new Error(
          `Observed offices=${seededOfficeCount}, documentTypes=${seededDocumentTypeCount}.`,
        );
      }
    },
  );
  await check("Seeded permit document field rules match CONFIG-2", async () => {
    const expected = {
      "purchase request": { amountCentavos: "required" },
      "purchase order": { amountCentavos: "required" },
      "job order": { amountCentavos: "required" },
      "notice of award": {},
      "activity proposal": {},
      resolution: {},
      ordinance: {},
      "request letter": {},
      report: {},
      "minutes of the meeting": {},
      certification: { officeId: "hidden", amountCentavos: "hidden" },
      "letter of invitation": { amountCentavos: "hidden" },
      "notice of meeting": { amountCentavos: "hidden" },
      "itinerary of travel": { amountCentavos: "hidden" },
      "trip ticket": { amountCentavos: "hidden" },
      "transmittal letter": { amountCentavos: "hidden" },
      directive: { amountCentavos: "hidden" },
      "executive order": { amountCentavos: "hidden" },
    };
    for (const [name, fieldRules] of Object.entries(expected)) {
      const documentType = await DocumentType.findOne({ name }).lean();
      if (
        !documentType ||
        JSON.stringify(documentType.fieldRules ?? {}) !==
          JSON.stringify(fieldRules)
      ) {
        throw new Error(`Seeded fieldRules mismatch for ${name}.`);
      }
    }
  });

  admin = await createUser("admin");
  user = await createUser("user");
  base = await launch();
  adminCookie = await login(admin);
  userCookie = await login(user);

  await check("401 without a session", async () => {
    assertStatus(await request("/api/offices"), 401, "SESSION_EXPIRED");
  });
  await check("User can read lookup lists", async () => {
    assertStatus(await request("/api/offices", { cookie: userCookie }), 200);
    assertStatus(
      await request("/api/document-types", { cookie: userCookie }),
      200,
    );
  });
  await check("User gets 403 on POST and PATCH", async () => {
    assertStatus(
      await request("/api/offices", {
        method: "POST",
        body: { code: `${tag}-blocked`, kind: "internal" },
        cookie: userCookie,
      }),
      403,
      "FORBIDDEN",
    );
    assertStatus(
      await request(`/api/offices/${"0".repeat(24)}`, {
        method: "PATCH",
        body: { active: false },
        cookie: userCookie,
      }),
      403,
      "FORBIDDEN",
    );
  });

  let office;
  let documentType;
  let inactiveOffice;
  let inactiveDocumentType;
  await check("Admin creates offices and document types", async () => {
    const officeResult = await request("/api/offices", {
      method: "POST",
      body: {
        code: officeCodes[0],
        fullName: `${tag} Office`,
        kind: "internal",
        aliases: [`${tag} office alias`, `${tag.toUpperCase()} OFFICE ALIAS`],
      },
      cookie: adminCookie,
    });
    const typeResult = await request("/api/document-types", {
      method: "POST",
      body: {
        name: documentNames[0],
        aliases: [`${tag} document alias`],
        logbookTypes: ["permit_certification"],
        fieldRules: { amountCentavos: "optional" },
      },
      cookie: adminCookie,
    });
    trackCreated(officeResult, createdOfficeIds);
    trackCreated(typeResult, createdDocumentTypeIds);
    assertStatus(officeResult, 201);
    assertStatus(typeResult, 201);
    office = officeResult.payload;
    documentType = typeResult.payload;
    if (office.aliases.length !== 1)
      throw new Error("Office aliases were not normalized and deduplicated.");
    if (
      !hasNoMongooseFields(office) ||
      !hasNoMongooseFields(typeResult.payload)
    ) {
      throw new Error("Create response included _id or __v.");
    }
    if (documentType.fieldRules.amountCentavos !== "optional") {
      throw new Error("POST did not return document fieldRules.");
    }
  });

  await check("Admin updates both lookup types", async () => {
    const updatedOffice = await request(`/api/offices/${office.id}`, {
      method: "PATCH",
      body: { fullName: `${tag} Updated Office` },
      cookie: adminCookie,
    });
    const updatedType = await request(
      `/api/document-types/${documentType.id}`,
      {
        method: "PATCH",
        body: {
          name: `${tag} updated document`,
          fieldRules: { amountCentavos: "required" },
        },
        cookie: adminCookie,
      },
    );
    assertStatus(updatedOffice, 200);
    assertStatus(updatedType, 200);
    office = updatedOffice.payload;
    documentType = updatedType.payload;
    documentNames[0] = documentType.name;
    if (documentType.fieldRules.amountCentavos !== "required") {
      throw new Error("PATCH did not update document fieldRules.");
    }
  });

  await check(
    "Invalid fieldRules are rejected without changing data",
    async () => {
      const invalidCreate = await request("/api/document-types", {
        method: "POST",
        body: {
          name: `${tag} invalid rules`,
          logbookTypes: ["permit_certification"],
          fieldRules: { amountCentavos: "sometimes" },
        },
        cookie: adminCookie,
      });
      trackCreated(invalidCreate, createdDocumentTypeIds);
      assertStatus(invalidCreate, 400, "VALIDATION_ERROR");
      const invalidPatch = await request(
        `/api/document-types/${documentType.id}`,
        {
          method: "PATCH",
          body: { fieldRules: { particulars: "hidden" } },
          cookie: adminCookie,
        },
      );
      assertStatus(invalidPatch, 400, "VALIDATION_ERROR");
      const unchanged = await DocumentType.findById(documentType.id).lean();
      if (unchanged.fieldRules.amountCentavos !== "required") {
        throw new Error("Invalid fieldRules PATCH changed the document type.");
      }
    },
  );

  await check(
    "Default lists hide inactive and active=false shows them",
    async () => {
      const createdOffice = await request("/api/offices", {
        method: "POST",
        body: {
          code: officeCodes[1],
          fullName: `${tag} Inactive`,
          kind: "external",
        },
        cookie: adminCookie,
      });
      const createdType = await request("/api/document-types", {
        method: "POST",
        body: { name: documentNames[1], logbookTypes: ["dtr_leave"] },
        cookie: adminCookie,
      });
      trackCreated(createdOffice, createdOfficeIds);
      trackCreated(createdType, createdDocumentTypeIds);
      assertStatus(createdOffice, 201);
      assertStatus(createdType, 201);
      inactiveOffice = createdOffice.payload;
      inactiveDocumentType = createdType.payload;
      const officePatch = await request(`/api/offices/${inactiveOffice.id}`, {
        method: "PATCH",
        body: { active: false },
        cookie: adminCookie,
      });
      const typePatch = await request(
        `/api/document-types/${inactiveDocumentType.id}`,
        {
          method: "PATCH",
          body: { active: false },
          cookie: adminCookie,
        },
      );
      assertStatus(officePatch, 200);
      assertStatus(typePatch, 200);
      const defaultOffices = await request("/api/offices", {
        cookie: userCookie,
      });
      const inactiveOffices = await request("/api/offices?active=false", {
        cookie: userCookie,
      });
      const defaultTypes = await request("/api/document-types", {
        cookie: userCookie,
      });
      const inactiveTypes = await request("/api/document-types?active=false", {
        cookie: userCookie,
      });
      if (
        defaultOffices.payload.items.some(
          (item) => item.id === inactiveOffice.id,
        ) ||
        defaultTypes.payload.items.some(
          (item) => item.id === inactiveDocumentType.id,
        ) ||
        !inactiveOffices.payload.items.some(
          (item) => item.id === inactiveOffice.id,
        ) ||
        !inactiveTypes.payload.items.some(
          (item) => item.id === inactiveDocumentType.id,
        )
      ) {
        throw new Error(
          "Inactive list filtering did not match the active query.",
        );
      }
    },
  );

  await check("GET by id returns inactive records", async () => {
    assertStatus(
      await request(`/api/offices/${inactiveOffice.id}`, {
        cookie: userCookie,
      }),
      200,
    );
    assertStatus(
      await request(`/api/document-types/${inactiveDocumentType.id}`, {
        cookie: userCookie,
      }),
      200,
    );
  });

  await check(
    "Case-insensitive code and name collisions return 409",
    async () => {
      const seededOffice = await Office.findOne().select("code").lean();
      const codeCollision = await request("/api/offices", {
        method: "POST",
        body: {
          code: `${tag}-case-office`,
          kind: "internal",
          aliases: [seededOffice.code.toUpperCase()],
        },
        cookie: adminCookie,
      });
      trackCreated(codeCollision, createdOfficeIds);
      const seededType = await DocumentType.findOne().select("name").lean();
      const variant =
        seededType.name === seededType.name.toLowerCase()
          ? seededType.name.toUpperCase()
          : seededType.name.toLowerCase();
      const nameCollision = await request("/api/document-types", {
        method: "POST",
        body: { name: variant },
        cookie: adminCookie,
      });
      if (nameCollision.response.status === 201 && nameCollision.payload?.id) {
        createdDocumentTypeIds.push(nameCollision.payload.id);
      }
      assertStatus(codeCollision, 409, "CONFLICT");
      assertStatus(nameCollision, 409, "CONFLICT");
    },
  );

  await check("Alias collision with another record returns 409", async () => {
    const created = await request("/api/offices", {
      method: "POST",
      body: {
        code: officeCodes[2],
        kind: "internal",
        aliases: [`${tag}-cross-alias`],
      },
      cookie: adminCookie,
    });
    trackCreated(created, createdOfficeIds);
    assertStatus(created, 201);
    createdOfficeIds.push(created.payload.id);
    const collision = await request("/api/offices", {
      method: "POST",
      body: {
        code: `${tag}-alias-collision`,
        kind: "internal",
        aliases: [`${tag.toUpperCase()}-CROSS-ALIAS`],
      },
      cookie: adminCookie,
    });
    assertStatus(collision, 409, "CONFLICT");
  });

  await check("Office code is immutable", async () => {
    const result = await request(`/api/offices/${office.id}`, {
      method: "PATCH",
      body: { code: `${tag}-changed` },
      cookie: adminCookie,
    });
    assertStatus(result, 400, "VALIDATION_ERROR");
    const unchanged = await Office.findById(office.id).lean();
    if (unchanged.code !== officeCodes[0])
      throw new Error("Rejected patch changed the office code.");
  });

  await check("Malformed id is 400 and unknown id is 404", async () => {
    assertStatus(
      await request("/api/offices/not-an-id", { cookie: userCookie }),
      400,
      "VALIDATION_ERROR",
    );
    assertStatus(
      await request(`/api/document-types/${"f".repeat(24)}`, {
        cookie: userCookie,
      }),
      404,
      "NOT_FOUND",
    );
  });

  await check("Extra fields are rejected without changing data", async () => {
    const before = await Office.findById(office.id).lean();
    const rejected = await request(`/api/offices/${office.id}`, {
      method: "PATCH",
      body: { fullName: "Should not be saved", extra: true },
      cookie: adminCookie,
    });
    const after = await Office.findById(office.id).lean();
    assertStatus(rejected, 400, "VALIDATION_ERROR");
    if (before.fullName !== after.fullName)
      throw new Error("Invalid strict body changed office data.");
  });

  await check("logbookTypes filter works", async () => {
    const result = await request(
      "/api/document-types?logbookType=permit_certification",
      { cookie: userCookie },
    );
    assertStatus(result, 200);
    if (!result.payload.items.some((item) => item.id === documentType.id)) {
      throw new Error("The matching document type was not returned.");
    }
  });

  await check("Activity logs include user and field changes", async () => {
    const logs = await ActivityLog.find({
      userId: admin._id,
      resourceId: { $in: [office.id, documentType.id, inactiveOffice.id] },
    }).lean();
    if (
      logs.length < 5 ||
      logs.some((log) => !Array.isArray(log.changes) || !log.changes.length)
    ) {
      throw new Error("Expected create, update, and deactivate audit changes.");
    }
    const ruleChange = logs
      .flatMap((log) => log.changes)
      .find((change) => change.field === "fieldRules");
    if (
      !ruleChange ||
      ruleChange.from.amountCentavos !== "optional" ||
      ruleChange.to.amountCentavos !== "required"
    ) {
      throw new Error("fieldRules audit entry omitted from/to values.");
    }
  });

  await check("Lookup responses omit _id and __v", async () => {
    const lists = await Promise.all([
      request("/api/offices", { cookie: userCookie }),
      request("/api/document-types", { cookie: userCookie }),
    ]);
    for (const list of lists) {
      assertStatus(list, 200);
      if (!list.payload.items.every(hasNoMongooseFields))
        throw new Error("List response exposed _id or __v.");
    }
    if (
      !hasNoMongooseFields(
        (await request(`/api/offices/${office.id}`, { cookie: userCookie }))
          .payload,
      ) ||
      !hasNoMongooseFields(
        (
          await request(`/api/document-types/${documentType.id}`, {
            cookie: userCookie,
          })
        ).payload,
      )
    ) {
      throw new Error("Detail response exposed _id or __v.");
    }
    const fetchedDocumentType = await request(
      `/api/document-types/${documentType.id}`,
      { cookie: userCookie },
    );
    assertStatus(fetchedDocumentType, 200);
    if (fetchedDocumentType.payload.fieldRules.amountCentavos !== "required") {
      throw new Error("GET did not return document fieldRules.");
    }
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
      const offices = await Office.countDocuments();
      const documentTypes = await DocumentType.countDocuments();
      record(
        "Temporary records cleaned; seeded counts remain 28 and 24",
        offices === 28 && documentTypes === 24 && baselineCheck.passed,
        `offices=${offices}, documentTypes=${documentTypes}; activityLogs added=${activityLogsAdded}; ${baselineCheck.differences.join(", ") || "protected counts restored"}`,
      );
    } catch (error) {
      record(
        "Temporary record cleanup",
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
