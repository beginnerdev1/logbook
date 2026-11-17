import mongoose from "mongoose";
import { DocumentType, Office } from "../models/index.js";

const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

export function normalizeLookupText(text) {
  return String(text ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function isValidLookupId(id) {
  return typeof id === "string" && OBJECT_ID_PATTERN.test(id);
}

export async function findOfficeById(id) {
  if (!isValidLookupId(id) || !mongoose.isValidObjectId(id)) return null;
  return Office.findById(id);
}

export async function findDocumentTypeById(id) {
  if (!isValidLookupId(id) || !mongoose.isValidObjectId(id)) return null;
  return DocumentType.findById(id);
}
