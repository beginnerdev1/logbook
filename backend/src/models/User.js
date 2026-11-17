import mongoose from "mongoose";

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ["admin", "user"], required: true },
    active: { type: Boolean, default: true, required: true },
    officeId: { type: Schema.Types.ObjectId, ref: "Office" },
    lastLoginAt: Date,
    failedLoginCount: { type: Number, default: 0 },
    lockedUntil: Date,
    passwordChangedAt: Date,
    mustChangePassword: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now, required: true },
  },
  { collection: "users" },
);

userSchema.index({ email: 1 }, { unique: true, name: "email_unique" });

export const User = mongoose.models.User ?? mongoose.model("User", userSchema);
