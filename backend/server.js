import mongoose from "mongoose";
import { env } from "./src/config/env.js";
import { connectDb } from "./src/db.js";
import { createApp } from "./src/app.js";

async function startServer() {
  try {
    await connectDb();
  } catch {
    await mongoose.disconnect().catch(() => {});
    process.exitCode = 1;
    return;
  }

  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(`Server listening on port ${env.port}.`);
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      server.close(async (error) => {
        await mongoose.disconnect();
        console.log("Server shut down cleanly.");
        if (error) process.exitCode = 1;
      });
    });
  }
}

void startServer();
