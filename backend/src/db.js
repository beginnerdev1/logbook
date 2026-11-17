import mongoose from "mongoose";
import { env, testMongoUri } from "./config/env.js";

function safeErrorMessage(error) {
  let message = error instanceof Error ? error.message : String(error);
  for (const uri of [env.mongodbUri, testMongoUri]) {
    message = message.replaceAll(uri, "[redacted MongoDB URI]");
  }
  return message;
}

mongoose.connection.on("connected", () => {
  console.log(`MongoDB connected to database "${mongoose.connection.name}".`);
});

mongoose.connection.on("error", (error) => {
  console.error(`MongoDB connection error: ${safeErrorMessage(error)}`);
});

mongoose.connection.on("disconnected", () => {
  console.warn(
    `MongoDB disconnected from database "${mongoose.connection.name}".`,
  );
});

export async function connectDb(uri = env.mongodbUri) {
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  } catch (error) {
    const message = safeErrorMessage(error);
    console.error(`MongoDB connection failed: ${message}`);
    throw new Error(message);
  }
}
