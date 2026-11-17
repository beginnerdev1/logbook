import { spawnSync } from "node:child_process";
import mongoose from "mongoose";
import { connectTestDb } from "./verificationDb.js";

function run(script) {
  const result = spawnSync(
    process.execPath,
    [`scripts/${script}`, "--test-db"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: process.env,
    },
  );
  if (result.status !== 0) {
    throw new Error(`${script} failed; see its sanitized process output.`);
  }
  console.log(`${script}: PASS`);
}

let connected = false;
try {
  await connectTestDb();
  connected = true;
  const database = mongoose.connection.db;
  const counters = database.collection("counters");
  const before = await counters
    .find({}, { projection: { _id: 1, seq: 1 } })
    .sort({ _id: 1 })
    .toArray();
  for (const { name } of await database
    .listCollections({}, { nameOnly: true })
    .toArray()) {
    await database.dropCollection(name);
  }
  await mongoose.disconnect();
  connected = false;
  run("dbInit.js");
  run("dbSeed.js");
  await connectTestDb();
  connected = true;
  const after = await mongoose.connection.db
    .collection("counters")
    .find({}, { projection: { _id: 1, seq: 1 } })
    .sort({ _id: 1 })
    .toArray();
  console.log(`Counters before reset: ${JSON.stringify(before)}`);
  console.log(`Counters after reset: ${JSON.stringify(after)}`);
  const users = await mongoose.connection.db
    .collection("users")
    .countDocuments();
  console.log(`Users after reset: ${users} (expected 0)`);
  if (users !== 0) process.exitCode = 1;
} catch {
  console.error(
    "Test database reset failed; verify MONGODB_URI_TEST and database access.",
  );
  process.exitCode = 1;
} finally {
  if (connected) await mongoose.disconnect();
}
