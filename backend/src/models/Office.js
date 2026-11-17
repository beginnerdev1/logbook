import mongoose from "mongoose";

const officeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, lowercase: true, trim: true },
    fullName: { type: String, default: "" },
    kind: { type: String, enum: ["internal", "external"], required: true },
    aliases: { type: [String], default: [] },
    active: { type: Boolean, default: true, required: true },
  },
  { collection: "offices" },
);

officeSchema.index({ code: 1 }, { unique: true, name: "code_unique" });

export const Office =
  mongoose.models.Office ?? mongoose.model("Office", officeSchema);
