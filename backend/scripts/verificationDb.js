import mongoose from "mongoose";
import { connectDb } from "../src/db.js";
import { testMongoUri } from "../src/config/env.js";

export const BASELINE_COLLECTIONS = [
  "entries",
  "users",
  "offices",
  "documentTypes",
  "counters",
  "activityLogs",
  "sessions",
];

export function isAllowedVerificationDatabase(databaseName) {
  return databaseName === "logbook_test";
}

export async function connectTestDb() {
  let databaseName;
  try {
    databaseName = new URL(testMongoUri).pathname.split("/").filter(Boolean)[0];
  } catch {
    throw new Error("MONGODB_URI_TEST must be a valid MongoDB URI.");
  }
  if (!databaseName) {
    throw new Error("MONGODB_URI_TEST must include a database name.");
  }
  if (!isAllowedVerificationDatabase(databaseName)) {
    throw new Error(
      "Verification refused: MONGODB_URI_TEST must select the logbook_test database.",
    );
  }
  await connectDb(testMongoUri);
}

export async function captureCollectionBaseline() {
  const database = mongoose.connection.db;
  const actualNames = (
    await database.listCollections({}, { nameOnly: true }).toArray()
  ).map(({ name }) => name);
  const names = [...new Set([...BASELINE_COLLECTIONS, ...actualNames])].sort();
  const counts = {};
  for (const name of names) {
    counts[name] = await database.collection(name).countDocuments();
  }
  const activityLogIds = new Set(
    (
      await database
        .collection("activityLogs")
        .find({}, { projection: { _id: 1 } })
        .toArray()
    ).map(({ _id }) => String(_id)),
  );
  const counters = await database
    .collection("counters")
    .find({}, { projection: { _id: 1, seq: 1 } })
    .sort({ _id: 1 })
    .toArray();
  return { counts, activityLogIds, counters };
}

export async function countActivityLogsAdded(baseline) {
  const ids = await mongoose.connection.db
    .collection("activityLogs")
    .find({}, { projection: { _id: 1 } })
    .toArray();
  return ids.filter(({ _id }) => !baseline.activityLogIds.has(String(_id)))
    .length;
}

export async function compareCollectionBaseline(baseline) {
  const database = mongoose.connection.db;
  const differences = [];
  const actualNames = (
    await database.listCollections({}, { nameOnly: true }).toArray()
  ).map(({ name }) => name);
  const names = [
    ...new Set([...Object.keys(baseline.counts), ...actualNames]),
  ].sort();
  for (const name of names) {
    const after = await database.collection(name).countDocuments();
    if (after !== baseline.counts[name]) {
      differences.push(`${name}: ${baseline.counts[name]} -> ${after}`);
    }
  }
  const activityLogsAfter = await database
    .collection("activityLogs")
    .countDocuments();
  const countersAfter = await database
    .collection("counters")
    .find({}, { projection: { _id: 1, seq: 1 } })
    .sort({ _id: 1 })
    .toArray();
  const counterState = (items) =>
    items.map(({ _id, seq }) => [String(_id), seq]);
  if (
    JSON.stringify(counterState(countersAfter)) !==
    JSON.stringify(counterState(baseline.counters))
  ) {
    differences.push("counters content changed");
  }
  return {
    passed: differences.length === 0,
    differences,
    activityLogsBefore: baseline.counts.activityLogs,
    activityLogsAfter,
    activityLogsAdded: await countActivityLogsAdded(baseline),
  };
}

export async function snapshotCounterOnFirstUse(snapshots, id) {
  if (snapshots.has(id)) return;
  snapshots.set(
    id,
    await mongoose.connection.db.collection("counters").findOne({ _id: id }),
  );
}

export async function restoreCounterSnapshots(snapshots) {
  const counters = mongoose.connection.db.collection("counters");
  for (const [id, original] of snapshots) {
    const current = await counters.findOne({ _id: id });
    if (original === null) {
      if (current) {
        const result = await counters.deleteOne({ _id: id, seq: current.seq });
        if (result.deletedCount !== 1)
          throw new Error(`Could not restore newly created counter ${id}.`);
      }
    } else if (!current) {
      await counters.insertOne(original);
    } else if (current.seq !== original.seq) {
      const result = await counters.updateOne(
        { _id: id, seq: current.seq },
        { $set: { seq: original.seq } },
      );
      if (result.matchedCount !== 1)
        throw new Error(`Could not restore counter sequence ${id}.`);
    }
  }
}

export async function deleteExactIds(model, ids) {
  const uniqueIds = [...new Map(ids.map((id) => [String(id), id])).values()];
  if (!uniqueIds.length) return 0;
  const result = await model.deleteMany({ _id: { $in: uniqueIds } });
  return result.deletedCount;
}

export async function findIds(model, filter) {
  return model.find(filter).distinct("_id");
}
