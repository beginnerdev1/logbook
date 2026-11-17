import "dotenv/config";

const mongodbUri = process.env.MONGODB_URI?.trim();

if (!mongodbUri) {
  const message = "MONGODB_URI is required. Set it in backend/.env.";
  console.error(message);
  throw new Error(message);
}

const port = Number(process.env.PORT || 3000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

let databaseName = "test";

try {
  databaseName =
    new URL(mongodbUri).pathname.split("/").filter(Boolean)[0] || "test";
} catch {
  throw new Error("MONGODB_URI must be a valid MongoDB connection string.");
}

export const env = Object.freeze({ mongodbUri, port, databaseName });

export const testMongoUri =
  process.env.MONGODB_URI_TEST?.trim() ||
  "mongodb://127.0.0.1:27017/logbook_test";
