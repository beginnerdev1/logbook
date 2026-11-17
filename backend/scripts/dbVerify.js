import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import {
  captureCollectionBaseline,
  compareCollectionBaseline,
  connectTestDb,
  countActivityLogsAdded,
  deleteExactIds,
} from "./verificationDb.js";
import {
  ActivityLog,
  DocumentType,
  Entry,
  Office,
  Session,
  User,
} from "../src/models/index.js";
import { nextReferenceNo } from "../src/utils/referenceNo.js";

const testId = randomUUID().replaceAll("-", "");
const createdEntryIds = [];
const createdOfficeIds = [];
const results = [];
const models = [Entry, User, Office, DocumentType, ActivityLog, Session];
const counterId = "DOC-2099";
const expectedDatabaseCollections = [
  "entries",
  "users",
  "offices",
  "documentTypes",
  "counters",
  "activityLogs",
  "sessions",
];

function safeErrorMessage(error) {
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of [
    process.env.MONGODB_URI,
    process.env.MONGODB_URI_TEST,
    process.env.SEED_ADMIN_PASSWORD,
  ]) {
    if (secret) message = message.replaceAll(secret, "[redacted]");
  }
  return message;
}

function record(name, passed, detail = "") {
  results.push({ name, status: passed ? "PASS" : "FAIL", detail });
}

async function runCheck(name, check) {
  try {
    const detail = await check();
    record(name, true, detail ?? "");
  } catch (error) {
    record(name, false, safeErrorMessage(error));
  }
}

function createTestEntry(referenceNo, overrides = {}) {
  return new Entry({
    referenceNo,
    logbookType: "permit_certification",
    entryDate: "2026-10-13",
    name: `B6 test ${testId}`,
    particulars: "B6 verification particulars",
    officeId: new mongoose.Types.ObjectId(),
    officeName: "B6 test office",
    submittedBy: new mongoose.Types.ObjectId(),
    source: "manual",
    ...overrides,
  });
}

function keysMatch(expected, actual) {
  const expectedTextFields = Object.keys(expected.keys).filter(
    (key) => expected.keys[key] === "text",
  );

  if (expectedTextFields.length > 0) {
    const actualTextFields = Object.keys(actual.weights ?? {}).sort();
    return (
      JSON.stringify(expectedTextFields.sort()) ===
        JSON.stringify(actualTextFields) &&
      actual.default_language === expected.options.default_language
    );
  }

  return (
    JSON.stringify(Object.entries(expected.keys)) ===
    JSON.stringify(Object.entries(actual.key))
  );
}

async function verifyIndexes() {
  const missing = [];

  for (const model of models) {
    const actualIndexes = await model.collection.listIndexes().toArray();
    for (const [keys, options] of model.schema.indexes()) {
      const expected = { keys, options };
      const matchingIndex = actualIndexes.find((index) => {
        if (!keysMatch(expected, index)) return false;
        if (options.unique && index.unique !== true) return false;
        if (options.sparse && index.sparse !== true) return false;
        if (
          options.partialFilterExpression &&
          JSON.stringify(index.partialFilterExpression) !==
            JSON.stringify(options.partialFilterExpression)
        ) {
          return false;
        }
        if (
          options.expireAfterSeconds !== undefined &&
          index.expireAfterSeconds !== options.expireAfterSeconds
        ) {
          return false;
        }
        return true;
      });

      if (!matchingIndex) {
        missing.push(
          `${model.collection.collectionName}:${JSON.stringify(keys)}`,
        );
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing design indexes: ${missing.join("; ")}`);
  }

  return "All model indexes are present.";
}

async function verifyReferenceCounter() {
  const counters = mongoose.connection.collection("counters");
  const previousCounter = await counters.findOne({ _id: counterId });
  let latestSequence;

  try {
    const first = await nextReferenceNo("DOC", 2099);
    latestSequence = Number(first.split("-").at(-1));
    const second = await nextReferenceNo("DOC", 2099);
    latestSequence = Number(second.split("-").at(-1));

    if (
      !Number.isInteger(latestSequence) ||
      Number(first.split("-").at(-1)) >= latestSequence
    ) {
      throw new Error(`Counter did not increase: ${first}, ${second}`);
    }

    return `${first} then ${second}`;
  } finally {
    if (latestSequence !== undefined) {
      if (previousCounter === null) {
        const cleanup = await counters.deleteOne({
          _id: counterId,
          seq: latestSequence,
        });
        if (cleanup.deletedCount !== 1) {
          throw new Error(
            "Test counter changed concurrently; it was preserved for safety.",
          );
        }
      } else {
        const cleanup = await counters.updateOne(
          { _id: counterId, seq: latestSequence },
          { $set: { seq: previousCounter.seq } },
        );
        if (cleanup.matchedCount !== 1) {
          throw new Error(
            "Existing counter changed concurrently; it was preserved for safety.",
          );
        }
      }
    }
  }
}

async function cleanupTestDocuments() {
  await deleteExactIds(Entry, createdEntryIds);
  await deleteExactIds(Office, createdOfficeIds);
}

async function printResults() {
  console.log("Check | Result | Detail");
  for (const result of results) {
    console.log(`${result.name} | ${result.status} | ${result.detail}`);
  }
  console.log(
    `Overall | ${results.every((result) => result.status === "PASS") ? "PASS" : "FAIL"}`,
  );
}

let connected = false;
let baseline;
try {
  await connectTestDb();
  connected = true;
  baseline = await captureCollectionBaseline();
  record(
    "Connection and database name",
    mongoose.connection.readyState === 1 &&
      mongoose.connection.name === "logbook_test",
    `database=${mongoose.connection.name}`,
  );

  await runCheck("Database collections match design", async () => {
    const actual = (
      await mongoose.connection.db
        .listCollections({}, { nameOnly: true })
        .toArray()
    )
      .map(({ name }) => name)
      .sort();
    const expected = [...expectedDatabaseCollections].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      const extras = actual.filter((name) => !expected.includes(name));
      const missing = expected.filter((name) => !actual.includes(name));
      throw new Error(
        `Expected exactly [${expected.join(", ")}]; found [${actual.join(", ")}]. Extras: [${extras.join(", ")}]. Missing: [${missing.join(", ")}].`,
      );
    }
    return "Exact seven design collections are present.";
  });

  await runCheck("Atomic DOC-2026 reference counter", verifyReferenceCounter);

  await runCheck("Fractional amount rejected", async () => {
    const entry = createTestEntry(`B6-AMOUNT-${testId}`, {
      amountCentavos: 12.5,
    });
    try {
      await entry.validate();
    } catch (error) {
      if (error.errors?.amountCentavos)
        return "amountCentavos validation error";
      throw error;
    }
    throw new Error("Entry accepted amountCentavos 12.5.");
  });

  await runCheck("Amount above API maximum rejected", async () => {
    const entry = createTestEntry(`B6-AMOUNT-MAX-${testId}`, {
      amountCentavos: 100000000000,
    });
    try {
      await entry.validate();
    } catch (error) {
      if (error.errors?.amountCentavos)
        return "amountCentavos maximum validation error";
      throw error;
    }
    throw new Error("Entry accepted amountCentavos above 99,999,999,999.");
  });

  await runCheck("Invalid entry date rejected", async () => {
    const entry = createTestEntry(`B6-DATE-${testId}`, {
      entryDate: "13-10-2026",
    });
    try {
      await entry.validate();
    } catch (error) {
      if (error.errors?.entryDate) return "entryDate validation error";
      throw error;
    }
    throw new Error("Entry accepted entryDate 13-10-2026.");
  });

  await runCheck("Duplicate referenceNo rejected", async () => {
    const referenceNo = `B6-DUP-${testId}`;
    const original = await createTestEntry(referenceNo).save();
    createdEntryIds.push(original._id);
    try {
      const duplicate = await createTestEntry(referenceNo).save();
      createdEntryIds.push(duplicate._id);
    } catch (error) {
      if (error.code === 11000) return "duplicate key error 11000";
      throw error;
    }
    throw new Error("Duplicate referenceNo was accepted.");
  });

  await runCheck(
    "Partial reference index permits multiple drafts",
    async () => {
      const first = await createTestEntry(undefined, {
        status: "draft",
      }).save();
      createdEntryIds.push(first._id);
      const second = await createTestEntry(undefined, {
        status: "draft",
      }).save();
      createdEntryIds.push(second._id);
      if (first.referenceNo || second.referenceNo) {
        throw new Error("Drafts unexpectedly received a reference number.");
      }
      const index = (await Entry.collection.listIndexes().toArray()).find(
        (item) => item.name === "referenceNo_unique",
      );
      if (
        index?.unique !== true ||
        JSON.stringify(index.partialFilterExpression) !==
          JSON.stringify({ referenceNo: { $type: "string" } })
      ) {
        throw new Error(
          "referenceNo_unique is not the required partial unique index.",
        );
      }
      return "two drafts saved without referenceNo under the partial unique index";
    },
  );

  await runCheck("Optimistic concurrency rejects stale save", async () => {
    const entry = await createTestEntry(`B6-VERSION-${testId}`).save();
    createdEntryIds.push(entry._id);
    const current = await Entry.findById(entry._id);
    const stale = await Entry.findById(entry._id);
    current.name = `B6 current ${testId}`;
    await current.save();
    stale.name = `B6 stale ${testId}`;

    try {
      await stale.save();
    } catch (error) {
      if (
        error instanceof mongoose.Error.VersionError ||
        error.name === "VersionError"
      ) {
        return "Mongoose VersionError";
      }
      throw error;
    }
    throw new Error("Stale save unexpectedly succeeded.");
  });

  await runCheck("Duplicate office code rejected", async () => {
    const code = `b6-${testId.slice(0, 16)}`;
    const original = await Office.create({
      code,
      fullName: "B6 test office",
      kind: "internal",
      aliases: [],
      active: true,
    });
    createdOfficeIds.push(original._id);
    try {
      const duplicate = await Office.create({
        code,
        fullName: "B6 duplicate office",
        kind: "internal",
        aliases: [],
        active: true,
      });
      createdOfficeIds.push(duplicate._id);
    } catch (error) {
      if (error.code === 11000) return "duplicate key error 11000";
      throw error;
    }
    throw new Error("Duplicate office code was accepted.");
  });

  await runCheck("Text search finds particulars", async () => {
    const marker = `B6TEXT${testId}`;
    const entry = await createTestEntry(`B6-TEXT-${testId}`, {
      particulars: marker,
    }).save();
    createdEntryIds.push(entry._id);
    const matches = await Entry.find({ $text: { $search: marker } }).select(
      "_id",
    );
    if (!matches.some((match) => match._id.equals(entry._id))) {
      throw new Error("Text search did not return the test entry.");
    }
    return "test particulars returned by text index";
  });

  await runCheck("All design indexes exist", verifyIndexes);
} catch (error) {
  if (!connected) {
    record("Connection and database name", false, safeErrorMessage(error));
    for (const name of [
      "Atomic DOC-2026 reference counter",
      "Database collections match design",
      "Fractional amount rejected",
      "Invalid entry date rejected",
      "Duplicate referenceNo rejected",
      "Optimistic concurrency rejects stale save",
      "Duplicate office code rejected",
      "Text search finds particulars",
      "All design indexes exist",
    ]) {
      record(name, false, "UNVERIFIED: database connection failed");
    }
  } else {
    record("Verification runner", false, safeErrorMessage(error));
  }
} finally {
  if (connected) {
    try {
      const activityLogsAdded = await countActivityLogsAdded(baseline);
      await cleanupTestDocuments();
      record(
        "Cleanup of test documents",
        true,
        "Only tracked test entry/office IDs removed.",
      );
      const baselineCheck = await compareCollectionBaseline(baseline);
      record(
        "Database collection baseline restored",
        baselineCheck.passed,
        `activityLogs added=${activityLogsAdded}; ${baselineCheck.differences.join(", ") || "protected counts restored"}`,
      );
    } catch (error) {
      record("Cleanup of test documents", false, safeErrorMessage(error));
    }
  }

  await printResults();
  await mongoose.disconnect();
}

if (results.some((result) => result.status !== "PASS")) {
  process.exitCode = 1;
}
