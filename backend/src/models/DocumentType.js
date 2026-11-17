import mongoose from "mongoose";
import { LOGBOOK_TYPES } from "../shared/logbookTypes.js";

const documentTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    aliases: { type: [String], default: [] },
    logbookTypes: {
      type: [{ type: String, enum: Object.keys(LOGBOOK_TYPES) }],
      default: [],
    },
    fieldRules: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    active: { type: Boolean, default: true, required: true },
  },
  { collection: "documentTypes" },
);

documentTypeSchema.index({ name: 1 }, { unique: true, name: "name_unique" });

export const DocumentType =
  mongoose.models.DocumentType ??
  mongoose.model("DocumentType", documentTypeSchema);
