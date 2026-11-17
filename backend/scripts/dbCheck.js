import mongoose from "mongoose";
import { connectDb } from "../src/db.js";

const expectedCollections = [
  "activityLogs",
  "counters",
  "documentTypes",
  "entries",
  "offices",
  "sessions",
  "users",
];

try {
  await connectDb();
  const database = mongoose.connection.db;
  const collections = (
    await database.listCollections({}, { nameOnly: true }).toArray()
  )
    .map(({ name }) => name)
    .sort();
  const counts = {};
  const indexes = {};
  for (const name of expectedCollections) {
    const collection = database.collection(name);
    counts[name] = await collection.countDocuments();
    indexes[name] = (await collection.listIndexes().toArray()).map((index) => ({
      name: index.name,
      key: index.key,
      unique: index.unique === true,
      partialFilterExpression: index.partialFilterExpression ?? null,
      expireAfterSeconds: index.expireAfterSeconds ?? null,
    }));
  }

  const referenceIndex = indexes.entries.find(
    (index) => index.key.referenceNo === 1,
  );
  const ttlIndex = indexes.sessions.find(
    (index) => index.key.expiresAt === 1 && index.expireAfterSeconds === 0,
  );
  const checks = [
    [
      "7 design collections",
      JSON.stringify(collections) === JSON.stringify(expectedCollections),
    ],
    ["offices=28", counts.offices === 28],
    ["documentTypes=24", counts.documentTypes === 24],
    [
      "referenceNo unique partial index",
      Boolean(
        referenceIndex?.unique &&
        JSON.stringify(referenceIndex.partialFilterExpression) ===
          JSON.stringify({ referenceNo: { $type: "string" } }),
      ),
    ],
    ["sessions TTL index", Boolean(ttlIndex)],
  ];

  console.log(`Collections: ${JSON.stringify(collections)}`);
  console.log(`Document counts: ${JSON.stringify(counts)}`);
  console.log(`Indexes: ${JSON.stringify(indexes)}`);
  for (const [name, passed] of checks) {
    console.log(`${name} | ${passed ? "PASS" : "FAIL"}`);
  }
  console.log(
    `Overall | ${checks.every(([, passed]) => passed) ? "PASS" : "FAIL"}`,
  );
  if (checks.some(([, passed]) => !passed)) process.exitCode = 1;
} catch {
  console.error("db:check | FAIL | Could not inspect the configured database.");
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
