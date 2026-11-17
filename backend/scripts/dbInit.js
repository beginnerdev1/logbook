import mongoose from "mongoose";
import { connectDb } from "../src/db.js";
import { connectTestDb } from "./verificationDb.js";
import {
  ActivityLog,
  DocumentType,
  Entry,
  Office,
  Session,
  User,
} from "../src/models/index.js";

const models = [Entry, User, Office, DocumentType, ActivityLog, Session];
const COUNTERS_COLLECTION = "counters";

async function createCollectionIfMissing(createCollection) {
  try {
    await createCollection();
  } catch (error) {
    if (error.code !== 48 && error.codeName !== "NamespaceExists") {
      throw error;
    }
  }
}

function safeErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  for (const uri of [process.env.MONGODB_URI, process.env.MONGODB_URI_TEST]) {
    if (uri) message = message.replaceAll(uri, "[redacted MongoDB URI]");
  }
  return message;
}

async function initializeDatabase() {
  if (process.argv.includes("--test-db"))
    await connectTestDb();
  else await connectDb();
  const database = mongoose.connection.db;
  const managedCollectionNames = [];

  for (const model of models) {
    const collectionName = model.collection.collectionName;
    await createCollectionIfMissing(() => model.createCollection());
    await model.syncIndexes();
    const indexes = await database
      .collection(collectionName)
      .listIndexes()
      .toArray();

    managedCollectionNames.push(collectionName);
    console.log(`${collectionName}: ${JSON.stringify(indexes)}`);
  }

  await createCollectionIfMissing(() =>
    database.createCollection(COUNTERS_COLLECTION),
  );
  const counterIndexes = await database
    .collection(COUNTERS_COLLECTION)
    .listIndexes()
    .toArray();
  managedCollectionNames.push(COUNTERS_COLLECTION);
  console.log(`${COUNTERS_COLLECTION}: ${JSON.stringify(counterIndexes)}`);

  const allCollections = await database
    .listCollections({}, { nameOnly: true })
    .toArray();
  const extraCollections = allCollections
    .map(({ name }) => name)
    .filter((name) => !managedCollectionNames.includes(name));

  console.log(`Managed collection count: ${managedCollectionNames.length}`);
  console.log(`Database collection count: ${allCollections.length}`);
  if (extraCollections.length > 0) {
    console.warn(
      `Unmanaged collections preserved: ${extraCollections.join(", ")}`,
    );
  }
}

try {
  await initializeDatabase();
} catch (error) {
  console.error(`Database initialization failed: ${safeErrorMessage(error)}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
