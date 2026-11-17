import mongoose from "mongoose";
import { LOGBOOK_TYPES } from "../shared/logbookTypes.js";

const { Schema } = mongoose;
const objectIdRef = (ref) => ({ type: Schema.Types.ObjectId, ref });

const entrySchema = new Schema(
  {
    referenceNo: {
      type: String,
      required: function referenceRequired() {
        return this.status !== "draft";
      },
    },
    logbookType: {
      type: String,
      required: true,
      enum: Object.keys(LOGBOOK_TYPES),
    },
    entryDate: {
      type: String,
      required: true,
      match: /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/,
    },
    name: { type: String, trim: true, required: true },
    particulars: { type: String, trim: true },
    documentTypeId: objectIdRef("DocumentType"),
    documentTypeName: String,
    officeId: {
      ...objectIdRef("Office"),
      required: function officeRequired() {
        return this.logbookType !== "permit_certification";
      },
    },
    officeName: {
      type: String,
      required: function officeNameRequired() {
        return this.logbookType !== "permit_certification";
      },
    },
    routingNote: String,
    subject: String,
    documentNumber: String,
    counterparty: String,
    amountCentavos: {
      type: Number,
      min: 0,
      max: 99999999999,
      validate: {
        validator: (value) => value == null || Number.isInteger(value),
        message: "Amount must be whole centavos.",
      },
    },
    tracking: {
      status: { type: String, enum: ["received", "returned"] },
      returnedTime: String,
    },
    remarks: String,
    details: { type: Schema.Types.Mixed, default: () => ({}) },
    status: {
      type: String,
      enum: ["draft", "pending", "approved", "rejected", "failed"],
      default: "draft",
      required: true,
    },
    source: { type: String, enum: ["ai", "manual", "import"], required: true },
    needsReview: { type: Boolean, default: false, required: true },
    attachment: {
      path: String,
      mimeType: String,
      sizeBytes: Number,
      originalName: String,
    },
    ai: {
      extractedAt: Date,
      confidence: { type: Map, of: Number },
    },
    submittedBy: { ...objectIdRef("User"), required: true },
    submittedAt: Date,
    reviewedBy: objectIdRef("User"),
    reviewedAt: Date,
    reviewerComment: String,
  },
  { collection: "entries", timestamps: true, optimisticConcurrency: true },
);

entrySchema.index(
  { referenceNo: 1 },
  {
    unique: true,
    name: "referenceNo_unique",
    partialFilterExpression: { referenceNo: { $type: "string" } },
  },
);
entrySchema.index({ logbookType: 1, entryDate: -1 }, { name: "type_date" });
entrySchema.index({ status: 1, submittedAt: -1 }, { name: "approvals_queue" });
entrySchema.index(
  { submittedBy: 1, status: 1, entryDate: -1 },
  { name: "my_records" },
);
entrySchema.index({ officeId: 1, entryDate: -1 }, { name: "office_date" });
entrySchema.index(
  { documentTypeId: 1, entryDate: -1 },
  { name: "doctype_date" },
);
entrySchema.index(
  { documentNumber: 1 },
  { sparse: true, name: "document_number_sparse" },
);
entrySchema.index(
  { name: "text", particulars: "text", remarks: "text" },
  { default_language: "none", name: "entry_text" },
);

export const Entry =
  mongoose.models.Entry ?? mongoose.model("Entry", entrySchema);
