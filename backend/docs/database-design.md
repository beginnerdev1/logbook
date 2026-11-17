The backend's `buildEntrySchema(typeKey, { mode, partial, documentType })` iterates `resolveFields(typeKey, documentType)`. Draft mode requires only `entryDate` and `name` for `permit_certification`; full mode applies each resolved field's required mode. The other seven logbook types continue using their static field requirements.

## Validation

Validation built from the same config (backend, using zod; zod is optional until the API stage):

```js
import { z } from "zod";
import { LOGBOOK_TYPES } from "./logbookTypes.js";

const DATE = z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/, "Use YYYY-MM-DD");
const TIME = z
  .string()
  .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "Use HH:mm (24-hour)");
const RULES = {
  text: z.string().trim(),
  textarea: z.string().trim(),
  date: DATE,
  money: z.number().int().nonnegative(),
  office: z.string().min(1),
  documentType: z.string().min(1),
  tracking: z.object({
    status: z.enum(["received", "returned"]),
    returnedTime: TIME.optional(),
  }),
};

export function buildSchema(typeKey) {
  const shape = {};
  for (const fld of LOGBOOK_TYPES[typeKey].fields) {
    let rule = RULES[fld.input];
    if (fld.required && (fld.input === "text" || fld.input === "textarea")) {
      rule = rule.min(1, fld.label + " is required");
    }
    shape[fld.key] = fld.required ? rule : rule.optional();
  }
  return z.object(shape);
}
```

# Logbook System: Final Database Design (MongoDB)

Version 1.0, 13 Oct 2026. Final for v1; items marked CONFIRM need an answer before they are relied on.

Based on the logbook workbook. Only one tab was readable (the Permit & Certification columns). The other seven logbooks follow the original field lists and are marked as assumed until confirmed against the real tabs.

Backend notes: Node.js + Express, ESM (`"type": "module"`), Mongoose, MongoDB at `127.0.0.1:27017`, database name `logbook`. File paths below are relative to `backend/`.

## 1. Key decisions

| Decision          | Choice                                                                          | Why                                                     |
| ----------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Layout            | One `entries` collection for all 8 logbooks                                     | One query for approvals, search, dashboards and reports |
| Raw vs clean data | Keep the text exactly as written, plus normalized fields                        | Audit trail plus reliable filters                       |
| Money             | Integer centavos (1,250.50 is stored as 125050)                                 | No decimal rounding errors                              |
| Date-only fields  | Strings like `'2026-10-13'`                                                     | Avoids the one-day-early bug (Philippines is UTC+8)     |
| Lookups           | `offices` and `documentTypes` collections with aliases                          | Typos and abbreviations map to one value                |
| Two statuses      | `status` (verification) and `tracking.status` (paper returned)                  | They mean different things                              |
| Validation        | One shared config, `logbookTypes.js`, used by frontend and backend              | The form and the API cannot disagree                    |
| Deleting          | Only the owner's drafts can be deleted; everything else is archived or rejected | Keeps the audit trail                                   |

## 2. Collections

| Collection      | Purpose                                                          |
| --------------- | ---------------------------------------------------------------- |
| `entries`       | Every logbook record                                             |
| `users`         | System accounts (admin and user roles)                           |
| `offices`       | Normalized office list with aliases                              |
| `documentTypes` | Normalized document types with aliases                           |
| `counters`      | Sequence numbers for reference numbers                           |
| `activityLogs`  | Who did what and when, with before and after values              |
| `sessions`      | Hashed opaque server-side login sessions and expiration metadata |

## 3. The `entries` document

| Field                                         | Type                       | Required          | Notes                                                                                                            |
| --------------------------------------------- | -------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| `_id`                                         | ObjectId                   | auto              | Sent to the frontend as a string                                                                                 |
| `referenceNo`                                 | string                     | only after submit | Absent on drafts; server-generated on submit and unique when present                                             |
| `logbookType`                                 | enum                       | yes               | See section 4                                                                                                    |
| `entryDate`                                   | string `YYYY-MM-DD`        | yes               | Real calendar date; API accepts years 2000–2100                                                                  |
| `name`                                        | string                     | yes               | Exactly as written in the logbook                                                                                |
| `particulars`                                 | string                     | per type          | Exactly as written                                                                                               |
| `documentTypeId`, `documentTypeName`          | ObjectId, string           | per type          | Active type for new values; copied name is a snapshot                                                            |
| `officeId`, `officeName`                      | ObjectId, string           | per type/rule     | Required for the seven existing logbooks; permit rules can make it optional or hidden; copied name is a snapshot |
| `routingNote`                                 | string                     | no                | Instructions found in the office column                                                                          |
| `subject`                                     | string                     | no                | Cleaned description                                                                                              |
| `documentNumber`                              | string                     | no                | Resolution, executive order, ordinance numbers                                                                   |
| `counterparty`                                | string                     | no                | Supplier or sender                                                                                               |
| `amountCentavos`                              | integer                    | per type          | API range: 0–99,999,999,999; empty when ambiguous                                                                |
| `tracking`                                    | `{ status, returnedTime }` | no                | status: `received` or `returned`; time: `HH:mm` 24-hour                                                          |
| `remarks`                                     | string                     | no                | Exactly as written                                                                                               |
| `details`                                     | object                     | per type          | Type-specific fields (section 4); defaults to `{}`                                                               |
| `status`                                      | enum                       | yes               | `draft`, `pending`, `approved`, `rejected`, `failed`                                                             |
| `source`                                      | enum                       | yes               | Stored values include `ai`, `manual`, `import`; API accepts `ai` or `manual`, defaulting to `manual`             |
| `needsReview`                                 | boolean                    | yes               | True when parsing was uncertain                                                                                  |
| `attachment`                                  | object                     | no                | `{ path, mimeType, sizeBytes, originalName }`                                                                    |
| `ai`                                          | object                     | no                | `{ extractedAt, confidence: { fieldName: 0 to 1 } }`                                                             |
| `submittedBy`                                 | ObjectId                   | yes               | Immutable owner assigned at entry creation                                                                       |
| `submittedAt`                                 | Date                       | on submit         | Set by the server when a draft or rejected entry is submitted                                                    |
| `reviewedBy`, `reviewedAt`, `reviewerComment` |                            | no                | Set on approve or reject                                                                                         |
| `createdAt`, `updatedAt`, `__v`               | auto                       |                   | `__v` is exposed as `version` for conflict checks                                                                |

Example:

```js
{
  referenceNo: 'DOC-2026-00018',
  logbookType: 'permit_certification',
  entryDate: '2026-07-02',
  name: 'purchase request : peso',
  particulars: 'purchase request : snacks for the 3rd quarter ofc federation meeting - 1,800.00',
  documentTypeName: 'purchase request',
  officeName: 'PESO',
  amountCentavos: 180000,
  tracking: { status: 'returned', returnedTime: '16:43' }, // written as 4:43, a person confirms AM or PM
  remarks: 'returned 4:43',
  details: {},
  status: 'pending', source: 'import', needsReview: true
}
```

## 4. The 8 logbooks

| Key                         | Prefix | Required                                                                        | Optional                                                                       | Type-specific `details`                                                                                                            |
| --------------------------- | ------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `permit_certification`      | DOC    | draft: date, name; submit: particulars, document type, plus document-type rules | document number, counterparty, amount, tracking, routing note, office, remarks | none                                                                                                                               |
| `check`                     | CHK    | date, name, particulars, office, amount                                         | remarks                                                                        | `checkNumber` (string, required), `bank` (CONFIRM)                                                                                 |
| `petty_cash`                | PTC    | date, name, particulars, office, amount                                         | remarks                                                                        | `pcvNumber` (CONFIRM)                                                                                                              |
| `voucher`                   | VCH    | date, name, particulars, office, amount                                         | remarks                                                                        | `voucherNumber` (CONFIRM)                                                                                                          |
| `dtr_leave`                 | DTR    | date, name, particulars, document type (DTR or Leave), office                   | remarks                                                                        | `periodCovered` (optional)                                                                                                         |
| `travel_order`              | TVL    | date, name (main traveler), office                                              | remarks                                                                        | `travelOrderNumber`, `purposeOfTravel`, `destination`, `travelStartDate`, `travelEndDate` (all required), `travelers[]` (optional) |
| `saln_mtop_bond_pds`        | SMB    | date, particulars, name, document type (SALN, MTOP, Fidelity Bond, PDS), office | remarks                                                                        | `codeNumber`, `receivedBy` (required)                                                                                              |
| `certificate_of_appearance` | COA    | date, particulars, name, office                                                 | remarks                                                                        | `codeNumber`, `receivedBy` (required)                                                                                              |

Assumptions (not seen in the real tabs): Travel Order gets name and office, the amount is required for checks, petty cash and vouchers, and the prefixes are editable.

## 5. Lookup collections

`offices`: `{ code (unique, lowercase), fullName, kind: 'internal' or 'external', aliases: [], active }`

Starter codes from the data: mdrrmo, mdrrmc, abe, peso, lsb, mho, mswdo, bac, mpdc, mcr, sb, mbo, mao, menro, bplo, hr, tourism, treasury, assessor, accounting, records, budget, plus external ones: pcg-air-station, bfp, pnp, dilg, psa, aurelco. Fill in `fullName` and `kind` later (CONFIRM). Do not merge similar codes such as mdrrmo and mdrrmc unless confirmed to be the same office.

`documentTypes`: `{ name (unique), aliases: [], logbookTypes: [], fieldRules: {}, active }`

For `permit_certification`, `fieldRules` may set `officeId`, `amountCentavos`, `documentNumber`, `counterparty`, `tracking`, or `routingNote` to `hidden`, `optional`, or `required`. Defaults are office required and all other configurable fields optional. The seed requires amount for purchase request, purchase order, and job order; hides office and amount for certification; hides amount for letter of invitation, notice of meeting, itinerary of travel, trip ticket, transmittal letter, directive, and executive order; remaining permit document types keep amount optional. Other logbook types do not use document-type field rules. Changing a rule does not rewrite stored entry values; changing an entry's document type clears values newly hidden by that type.

| Scope (`logbookTypes`) | Starter values                                                                                                                                                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `permit_certification` | purchase request, purchase order, job order, notice of award, activity proposal, request letter, letter of invitation, notice of meeting, minutes of the meeting, resolution, executive order, ordinance, certification, itinerary of travel, trip ticket, transmittal letter, report, directive |
| `dtr_leave`            | DTR, Leave                                                                                                                                                                                                                                                                                       |
| `saln_mtop_bond_pds`   | SALN, MTOP, Fidelity Bond, PDS                                                                                                                                                                                                                                                                   |

Typos found in the data (activity prosal, cetification, transmital) are stored as aliases of the correct type. Admins can add types and offices from the Settings page.

## 6. Other collections

`users`: `{ name, email (unique, lowercase), passwordHash, role: 'admin' or 'user', active, officeId, lastLoginAt, failedLoginCount, lockedUntil, passwordChangedAt, mustChangePassword, createdAt }`. Never store plain passwords; hash with bcryptjs. Authentication adds defaults for new fields, so existing user documents remain valid without a migration.

`counters`: `{ _id: 'DOC-2026', seq: 18 }`, one document per prefix and year.

`activityLogs`: `{ at, userId, userName, action, resourceType, resourceId, resourceRef, result, details, changes: [{ field, from, to }] }`. Actions: login, logout, entry created, entry edited, submitted, approved, rejected, draft deleted, user changed, export, backup.

`sessions`: `{ tokenHash, userId, remember, createdAt, lastSeenAt, lastRenewedAt, expiresAt, absoluteExpiresAt, revokedAt, userAgent, ip }`. The browser receives a random opaque cookie token; only its SHA-256 hash is stored. `tokenHash` is unique; `userId` is indexed; `expiresAt` has a TTL index with `expireAfterSeconds: 0`. TTL cleanup is asynchronous, so request middleware also checks `expiresAt`, `absoluteExpiresAt`, and `revokedAt`.

## 7. Indexes

| Collection      | Index                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entries`       | `referenceNo` unique with partial filter `{ referenceNo: { $type: 'string' } }`; `{ logbookType, entryDate: -1 }`; `{ status, submittedAt: -1 }`; `{ submittedBy, status, entryDate: -1 }`; `{ officeId, entryDate: -1 }`; `{ documentTypeId, entryDate: -1 }`; `documentNumber` sparse; text index on `name`, `particulars`, `remarks` with `default_language: 'none'` (mixed English and Filipino) |
| `offices`       | `code` unique                                                                                                                                                                                                                                                                                                                                                                                        |
| `documentTypes` | `name` unique                                                                                                                                                                                                                                                                                                                                                                                        |
| `users`         | `email` unique                                                                                                                                                                                                                                                                                                                                                                                       |
| `activityLogs`  | `{ at: -1 }`; `{ resourceId: 1, at: -1 }`                                                                                                                                                                                                                                                                                                                                                            |
| `sessions`      | `tokenHash` unique; `{ userId: 1 }`; `{ expiresAt: 1 }` with TTL `expireAfterSeconds: 0`                                                                                                                                                                                                                                                                                                             |

Check numbers and code numbers are warned about when duplicated, not blocked, until it is decided how they are scoped (CONFIRM).

## 8. Rules

1. Amounts are whole centavos. If a document lists several amounts or the text cannot be parsed (for example 8,576,304.000.00), leave the amount empty and set `needsReview`.
2. Dates are real `YYYY-MM-DD` calendar dates. The entries API accepts years 2000–2100. In the paper logbook the date is written only on the first row of the day: the form defaults to the last date used, and AI or import carries the date forward and assumes the logbook year.
3. Times are stored 24-hour. When the page says 4:43 without AM or PM, never guess: set `needsReview` and let the reviewer choose.
4. The AI only proposes. Backend code normalizes the result (matches document types and offices through aliases, parses amounts and dates) so results are the same every day. A person confirms before anything is saved as pending.
5. Reference numbers are generated on the server with the counter (section 11), never in the browser.
6. Optimistic concurrency: updates use `doc.save()` with `optimisticConcurrency: true`. A stale update raises a version error, which the API returns as HTTP 409. (`updateOne` skips this check, so do not use it for edits.)
7. `submittedBy` is the immutable owner set at entry creation. A user may view only their entries, edit their own draft/rejected entries, delete their own unsubmitted drafts, and submit their own draft/rejected entries. Other users receive not-found responses. Admins may view and edit any entry. Every edit writes an `activityLogs` record with the changed fields.
8. Roles are enforced on the server. The frontend checks only hide buttons.
9. Authentication uses opaque server-side sessions, never JWTs. Session tokens are generated with `node:crypto`; only SHA-256 hashes are stored.
10. Remember-me sessions renew after the configured idle-renew interval but never past their absolute expiration. Normal sessions are not persistent cookies.
11. Inactive users and expired, revoked, or absolute-expired sessions are rejected on every authenticated request.
12. B9a creates drafts only, assigns the immutable `submittedBy` owner at creation, and assigns a reference plus `submittedAt` only on valid submit. Entry API date years are restricted to 2000–2100.
13. Entry reads are owner/admin scoped; a non-owner receives not-found. Owners edit drafts/rejected entries; admins may edit any entry. Only a non-admin owner may delete an unsubmitted draft.
14. Entry API text is trimmed (`name` max 200; `particulars` and `remarks` max 2,000); amounts are integers from 0 to 99,999,999,999; `returnedTime` is 24-hour `HH:mm`. Optional null PATCH values clear the field; null on required fields or `source` is invalid.
15. A no-op PATCH does not increment `__v` or write an edit activity log. Create audit logs do not copy the request body; edit logs contain only actual field changes.
16. API lookup IDs must be lowercase 24-character hex strings. New/changed lookups must be active and in scope; unchanged inactive lookups preserve their stored name snapshots.

## 9. Shared field config: `src/shared/logbookTypes.js`

Backend path: `backend/src/shared/logbookTypes.js`. Frontend copy: `src/config/logbookTypes.js`. The frontend builds the form from it, and the backend builds validation from it. It is plain ESM with no dependencies.

```js
const f = (key, label, input, required = false, where = "root") => ({
  key,
  label,
  input,
  required,
  where,
});

const date = f("entryDate", "Date", "date", true);
const name = (label = "Name") => f("name", label, "text", true);
const particulars = (req = true) =>
  f("particulars", "Particulars", "textarea", req);
const office = f("officeId", "Office", "office", true);
const remarks = f("remarks", "Remarks", "textarea");
const amount = (req) => f("amountCentavos", "Amount", "money", req);
const docType = f("documentTypeId", "Document type", "documentType", true);
const codeNumber = f("codeNumber", "Code number", "text", true, "details");
const receivedBy = f("receivedBy", "Received by", "text", true, "details");
const permitFieldModes = {
  officeId: "required",
  amountCentavos: "optional",
  documentNumber: "optional",
  counterparty: "optional",
  tracking: "optional",
  routingNote: "optional",
};

export const LOGBOOK_TYPES = {
  permit_certification: {
    label: "Permit & Certification (Document Tracking)",
    prefix: "DOC",
    configurableFields: permitFieldModes,
    fields: [
      date,
      name("Name / Title"),
      particulars(),
      docType,
      office,
      f("documentNumber", "Document number", "text"),
      f("counterparty", "Supplier / sender", "text"),
      amount(false),
      f("tracking", "Returned?", "tracking"),
      f("routingNote", "Routing note", "text"),
      remarks,
    ],
  },
  check: {
    label: "Checks",
    prefix: "CHK",
    fields: [
      date,
      name(),
      particulars(),
      office,
      f("checkNumber", "Check number", "text", true, "details"),
      amount(true),
      remarks,
    ],
  },
  petty_cash: {
    label: "Petty Cash",
    prefix: "PTC",
    fields: [date, name(), particulars(), office, amount(true), remarks],
  },
  voucher: {
    label: "Vouchers",
    prefix: "VCH",
    fields: [date, name(), particulars(), office, amount(true), remarks],
  },
  dtr_leave: {
    label: "DTR / Leave",
    prefix: "DTR",
    fields: [
      date,
      name(),
      particulars(),
      docType,
      office,
      f("periodCovered", "Period covered", "text", false, "details"),
      remarks,
    ],
  },
  travel_order: {
    label: "Travel Order",
    prefix: "TVL",
    fields: [
      date,
      name("Traveler"),
      office,
      f("travelOrderNumber", "Travel order number", "text", true, "details"),
      f("purposeOfTravel", "Purpose of travel", "textarea", true, "details"),
      f("destination", "Destination", "text", true, "details"),
      f("travelStartDate", "Travel start", "date", true, "details"),
      f("travelEndDate", "Travel end", "date", true, "details"),
      remarks,
    ],
  },
  saln_mtop_bond_pds: {
    label: "SALN / MTOP / Fidelity Bond / PDS",
    prefix: "SMB",
    fields: [
      date,
      codeNumber,
      particulars(),
      name(),
      docType,
      office,
      receivedBy,
      remarks,
    ],
  },
  certificate_of_appearance: {
    label: "Certificate of Appearance",
    prefix: "COA",
    fields: [
      date,
      codeNumber,
      particulars(),
      name(),
      office,
      receivedBy,
      remarks,
    ],
  },
};

export function resolveFields(logbookTypeKey, documentType) {
  const config = LOGBOOK_TYPES[logbookTypeKey];
  if (!config) return [];
  if (logbookTypeKey !== "permit_certification") return config.fields;
  const rules = documentType?.fieldRules ?? {};
  return config.fields.flatMap((field) => {
    const defaultMode = permitFieldModes[field.key];
    if (!defaultMode) return [field];
    const mode = rules[field.key] ?? defaultMode;
    if (mode === "hidden") return [];
    return [{ ...field, required: mode === "required" }];
  });
}

export function validateFieldRules(logbookTypeKey, rules) {
  const issues = [];
  if (!LOGBOOK_TYPES[logbookTypeKey])
    return [{ field: "logbookType", message: "Unknown logbook type." }];
  if (!rules || typeof rules !== "object" || Array.isArray(rules)) {
    return [{ field: "fieldRules", message: "Expected an object." }];
  }
  const allowed =
    logbookTypeKey === "permit_certification" ? permitFieldModes : {};
  for (const [field, mode] of Object.entries(rules)) {
    if (!Object.hasOwn(allowed, field)) {
      issues.push({
        field: `fieldRules.${field}`,
        message: "Field is not configurable.",
      });
    } else if (!["hidden", "optional", "required"].includes(mode)) {
      issues.push({
        field: `fieldRules.${field}`,
        message: "Invalid field mode.",
      });
    }
  }
  return issues;
}
```

Backend validation uses Zod and `resolveFields(logbookTypeKey, documentType)`. Permit drafts require only date and name; submit requires every visible field marked required by the selected document type. The other seven logbook types keep their static requirements. `validateFieldRules` returns field-specific issues for unknown fields, invalid modes, or non-object values.

The form must send `undefined` (not an empty string) for empty optional dates and amounts. Fields with `where: 'details'` are stored inside `details`; all others are stored at the top level.

## 10. Mongoose model: `src/models/Entry.js`

```js
import mongoose from "mongoose";
import { LOGBOOK_TYPES } from "../shared/logbookTypes.js";

const { Schema } = mongoose;
const oid = (ref) => ({ type: Schema.Types.ObjectId, ref });

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
    documentTypeId: oid("DocumentType"),
    documentTypeName: String,
    officeId: {
      ...oid("Office"),
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
        message: "Amount must be whole centavos",
      },
    },
    tracking: {
      status: { type: String, enum: ["received", "returned"] },
      returnedTime: String,
    },
    remarks: String,
    details: { type: Schema.Types.Mixed, default: {} },
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
    ai: { extractedAt: Date, confidence: { type: Map, of: Number } },
    submittedBy: { ...oid("User"), required: true },
    submittedAt: Date,
    reviewedBy: oid("User"),
    reviewedAt: Date,
    reviewerComment: String,
  },
  { timestamps: true, optimisticConcurrency: true },
);

entrySchema.index({ logbookType: 1, entryDate: -1 });
entrySchema.index(
  { referenceNo: 1 },
  {
    unique: true,
    name: "referenceNo_unique",
    partialFilterExpression: { referenceNo: { $type: "string" } },
  },
);
entrySchema.index({ status: 1, submittedAt: -1 });
entrySchema.index({ submittedBy: 1, status: 1, entryDate: -1 });
entrySchema.index({ officeId: 1, entryDate: -1 });
entrySchema.index({ documentTypeId: 1, entryDate: -1 });
entrySchema.index({ documentNumber: 1 }, { sparse: true });
entrySchema.index(
  { name: "text", particulars: "text", remarks: "text" },
  { default_language: "none" },
);

export const Entry = mongoose.model("Entry", entrySchema);
```

## 11. Reference number counter: `src/utils/referenceNo.js`

```js
import mongoose from "mongoose";

export async function nextReferenceNo(prefix, year) {
  const id = prefix + "-" + year;
  const result = await mongoose.connection
    .collection("counters")
    .findOneAndUpdate(
      { _id: id },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after" },
    );
  // The MongoDB driver returns the document directly in recent versions
  // and { value: document } in older ones. Check the installed version and test it.
  const doc = result && result.value !== undefined ? result.value : result;
  return id + "-" + String(doc.seq).padStart(5, "0");
}
```

The update is atomic, so two people saving at the same moment never get the same number.

## 12. Connecting MongoDB to Express (Windows)

Local MongoDB Community Server runs as a Windows service. Connection string: `mongodb://127.0.0.1:27017/logbook` (use 127.0.0.1, not localhost, to avoid IPv6 resolution problems). Keep it in `backend/.env` as `MONGODB_URI` and never commit `.env`.

Start the Express server only after the database connection succeeds. Seed `offices` and `documentTypes` with a one-time script before the first entry.

## 13. Importing the old spreadsheet rows (optional)

1. Export each tab to CSV and skip blank rows.
2. Carry each date forward to the rows below it, parse the mixed formats, and assume year 2026.
3. Split `type : office` from the name column and match both against the alias lists.
4. Parse amounts; leave them empty when ambiguous.
5. Save every row with `source: 'import'`, `status: 'approved'` or `'pending'` (a choice to make), and `needsReview: true`.
6. Review the flagged rows in the app, then clear the flag.

## 14. Open items (CONFIRM)

1. Is the tab that was read really Permit & Certification, and does it hold all incoming documents?
2. Real column headers and 3 sample rows for the other 7 tabs, so their designs can be verified.
3. Do petty cash and vouchers have a PCV or voucher number? Do checks need a bank field?
4. Are check numbers and code numbers unique globally, or per bank or year?
5. What does 'returned' mean exactly (handed back to the submitting office or person)?
6. Which offices are external, and are mdrrmo and mdrrmc the same office?
7. Should the old spreadsheet rows be imported?

## 15. B9b entry list, review, statistics, and history

The authenticated user's entry list and statistics are always scoped by `submittedBy` on the server. Admins see all non-draft entries and their own drafts, never another user's drafts. List filters are combined with that visibility scope; search uses escaped, case-insensitive substring matching and never evaluates query text as an operator or `$where` expression. Paging sorts by the selected field plus ascending `_id` for stable page boundaries.

The existing `approvals_queue` index `{ status: 1, submittedAt: -1 }` serves the pending approvals query. The existing `my_records` index `{ submittedBy: 1, status: 1, entryDate: -1 }` serves scoped My Records queries. B9b verification runs `explain()` for both and confirms those index names; no additional index was needed.

Admins review only pending entries. Each review requires the current optimistic-concurrency version and stores the reviewer, review time, outcome, and trimmed reviewer comment. `activityLogs` records `entry_approved` or `entry_rejected` with actor ID/name, resource reference, optional comment truncated to 200 characters, and `selfReview`; failed reviews do not write success logs. Entry history reads those logs by `resourceId`, newest first, and returns only timestamp, action, actor, result, and changes.

Statistics apply the same visibility scope and list filters. Approved amount totals count only approved records with an amount value; certifications and other amount-less entries are excluded from both the sum and amount count. Admin-only summaries include active-user count, five latest submitted entries, and ten latest activity items without request metadata.
