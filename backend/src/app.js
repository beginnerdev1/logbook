import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import mongoose from "mongoose";
import { authConfig } from "./config/auth.js";
import { env } from "./config/env.js";
import { createRequireAuth } from "./middleware/auth.js";
import { errorHandler } from "./middleware/errors.js";
import { createAuthRouter } from "./routes/auth.js";
import { createLookupRouter } from "./routes/lookups.js";
import { createEntriesRouter } from "./routes/entries.js";
import { ApiError } from "./utils/apiError.js";

export function createApp({
  config = authConfig,
  registerRoutes,
  referenceNumberGenerator,
} = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use(
    cors({
      origin(origin, callback) {
        callback(
          null,
          !origin || config.frontendOrigins.includes(origin) ? origin : false,
        );
      },
      credentials: true,
      preflightContinue: true,
      methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Accept"],
    }),
  );

  app.use((req, _res, next) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      if (!req.is("application/json")) {
        next(
          new ApiError(
            415,
            "UNSUPPORTED_MEDIA_TYPE",
            "Content-Type must be application/json.",
          ),
        );
        return;
      }
    }
    next();
  });

  app.use((req, _res, next) => {
    const origin = req.get("origin");
    if (origin && !config.frontendOrigins.includes(origin)) {
      next(
        new ApiError(403, "ORIGIN_NOT_ALLOWED", "This origin is not allowed."),
      );
      return;
    }
    next();
  });

  app.options(/.*/, (_req, res) => res.sendStatus(204));

  app.get("/", (_req, res) => res.send("Hello, World!"));
  app.get("/api/health", (_req, res) => {
    const connected = mongoose.connection.readyState === 1;
    res.json({
      status: "ok",
      db: connected ? "connected" : "disconnected",
      dbName: mongoose.connection.name || env.databaseName,
    });
  });
  app.use("/api/auth", createAuthRouter(config));
  app.use("/api", createLookupRouter(config));
  app.use(
    "/api",
    createEntriesRouter(config, { referenceNumberGenerator }),
  );
  registerRoutes?.(app);

  app.use((_req, _res, next) => {
    next(new ApiError(404, "NOT_FOUND", "The requested route was not found."));
  });
  app.use(errorHandler);
  return app;
}

export { createRequireAuth };
