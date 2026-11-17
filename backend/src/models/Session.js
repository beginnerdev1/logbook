import mongoose from "mongoose";

const { Schema } = mongoose;

const sessionSchema = new Schema(
  {
    tokenHash: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    remember: { type: Boolean, default: false, required: true },
    createdAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    lastRenewedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    absoluteExpiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    userAgent: { type: String, maxlength: 200, default: "" },
    ip: { type: String, default: "" },
  },
  { collection: "sessions", versionKey: false },
);

sessionSchema.index(
  { tokenHash: 1 },
  { unique: true, name: "tokenHash_unique" },
);
sessionSchema.index({ userId: 1 }, { name: "session_user" });
sessionSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: "session_expiry_ttl" },
);

export const Session =
  mongoose.models.Session ?? mongoose.model("Session", sessionSchema);
