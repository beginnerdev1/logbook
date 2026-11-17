import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDb } from "../src/db.js";
import { connectTestDb } from "./verificationDb.js";
import {
  ActivityLog,
  DocumentType,
  Entry,
  Office,
  User,
} from "../src/models/index.js";

const internalOfficeCodes = [
  "mdrrmo",
  "mdrrmc",
  "abe",
  "peso",
  "lsb",
  "mho",
  "mswdo",
  "bac",
  "mpdc",
  "mcr",
  "sb",
  "mbo",
  "mao",
  "menro",
  "bplo",
  "hr",
  "tourism",
  "treasury",
  "assessor",
  "accounting",
  "records",
  "budget",
];

const externalOfficeCodes = [
  "pcg-air-station",
  "bfp",
  "pnp",
  "dilg",
  "psa",
  "aurelco",
];

const amountRequired = { amountCentavos: "required" };
const amountHidden = { amountCentavos: "hidden" };
const permitDocumentTypes = [
  { name: "purchase request", aliases: ["pr"], fieldRules: amountRequired },
  { name: "purchase order", aliases: [], fieldRules: amountRequired },
  { name: "job order", aliases: [], fieldRules: amountRequired },
  { name: "notice of award", aliases: [], fieldRules: {} },
  {
    name: "activity proposal",
    aliases: ["activity prosal", "activity propsal"],
    fieldRules: {},
  },
  { name: "request letter", aliases: ["letter of request"], fieldRules: {} },
  { name: "letter of invitation", aliases: [], fieldRules: amountHidden },
  { name: "notice of meeting", aliases: [], fieldRules: amountHidden },
  { name: "minutes of the meeting", aliases: [], fieldRules: {} },
  { name: "resolution", aliases: [], fieldRules: {} },
  { name: "executive order", aliases: [], fieldRules: amountHidden },
  { name: "ordinance", aliases: ["ordinansa"], fieldRules: {} },
  {
    name: "certification",
    aliases: ["cetification"],
    fieldRules: { officeId: "hidden", amountCentavos: "hidden" },
  },
  { name: "itinerary of travel", aliases: [], fieldRules: amountHidden },
  { name: "trip ticket", aliases: [], fieldRules: amountHidden },
  {
    name: "transmittal letter",
    aliases: ["transmital letter"],
    fieldRules: amountHidden,
  },
  { name: "report", aliases: [], fieldRules: {} },
  { name: "directive", aliases: [], fieldRules: amountHidden },
].map((documentType) => ({
  ...documentType,
  fieldRules: documentType.fieldRules ?? {},
  logbookTypes: ["permit_certification"],
  active: true,
}));

const documentTypes = [
  ...permitDocumentTypes,
  ...["DTR", "Leave"].map((name) => ({
    name,
    aliases: [],
    logbookTypes: ["dtr_leave"],
    active: true,
  })),
  ...["SALN", "MTOP", "Fidelity Bond", "PDS"].map((name) => ({
    name,
    aliases: [],
    logbookTypes: ["saln_mtop_bond_pds"],
    active: true,
  })),
];

function safeErrorMessage(error) {
  let message = error instanceof Error ? error.message : String(error);
  const secrets = [
    process.env.MONGODB_URI,
    process.env.MONGODB_URI_TEST,
    process.env.SEED_ADMIN_PASSWORD,
  ];

  for (const secret of secrets) {
    if (secret) message = message.replaceAll(secret, "[redacted]");
  }

  return message;
}

async function upsertReferenceData() {
  const offices = [
    ...internalOfficeCodes.map((code) => ({ code, kind: "internal" })),
    ...externalOfficeCodes.map((code) => ({ code, kind: "external" })),
  ];

  for (const office of offices) {
    await Office.updateOne(
      { code: office.code },
      {
        $setOnInsert: {
          ...office,
          fullName: "",
          aliases: [],
          active: true,
        },
      },
      { upsert: true },
    );
  }

  for (const documentType of documentTypes) {
    const { fieldRules, ...insertData } = documentType;
    await DocumentType.updateOne(
      { name: documentType.name },
      {
        $setOnInsert: insertData,
        $set: { fieldRules: fieldRules ?? {} },
      },
      { upsert: true },
    );
  }
}

async function seedAdminIfMissing() {
  if (await User.exists({ role: "admin" })) {
    console.log("Admin already exists; skipped admin creation.");
    return;
  }

  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set in backend/.env before the first admin seed.",
    );
  }

  if (password.length < 12) {
    throw new Error("SEED_ADMIN_PASSWORD must be at least 12 characters.");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await User.create({
    name: "Admin",
    email,
    passwordHash,
    role: "admin",
    active: true,
  });
  console.log("Admin account created; password was not logged.");
}

async function printCounts() {
  const counts = {
    entries: await Entry.countDocuments(),
    users: await User.countDocuments(),
    offices: await Office.countDocuments(),
    documentTypes: await DocumentType.countDocuments(),
    counters: await mongoose.connection.collection("counters").countDocuments(),
    activityLogs: await ActivityLog.countDocuments(),
  };

  for (const [collection, count] of Object.entries(counts)) {
    console.log(`${collection}: ${count}`);
  }
}

try {
  const testDatabase = process.argv.includes("--test-db");
  if (testDatabase) await connectTestDb();
  else await connectDb();
  if (!testDatabase) await seedAdminIfMissing();
  await upsertReferenceData();
  await printCounts();
} catch (error) {
  console.error(`Database seed failed: ${safeErrorMessage(error)}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
