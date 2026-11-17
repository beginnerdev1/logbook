import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDb } from "../src/db.js";
import { ActivityLog, Office, User } from "../src/models/index.js";

function parseArguments(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith("--")) {
      throw new Error(`Unexpected argument: ${argument}`);
    }
    const [rawKey, inlineValue] = argument.slice(2).split("=", 2);
    const key = rawKey.toLowerCase();
    if (!["email", "name", "role", "office"].includes(key)) {
      throw new Error(`Unknown option: --${key}`);
    }
    const value = inlineValue ?? args[++index];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}.`);
    }
    values[key] = value;
  }

  const email = values.email?.trim().toLowerCase();
  const name = values.name?.trim();
  const role = values.role?.trim().toLowerCase() || "user";
  const officeCode = values.office?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new Error("Provide a valid --email.");
  }
  if (!name) throw new Error("Provide a non-empty --name.");
  if (!new Set(["admin", "user"]).has(role)) {
    throw new Error("--role must be admin or user.");
  }
  return { email, name, role, officeCode };
}

function readHidden(prompt) {
  const input = process.stdin;
  if (!input.isTTY || typeof input.setRawMode !== "function") {
    return Promise.reject(
      new Error("A TTY is required to enter a password without echo."),
    );
  }

  return new Promise((resolve, reject) => {
    const wasPaused = input.isPaused();
    let value = "";
    let finished = false;
    input.setEncoding("utf8");
    input.setRawMode(true);
    input.resume();
    process.stdout.write(prompt);

    function finish(error) {
      if (finished) return;
      finished = true;
      input.off("data", onData);
      input.setRawMode(false);
      if (wasPaused) input.pause();
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    }

    function onData(chunk) {
      for (const character of chunk) {
        if (character === "\u0003") {
          finish(new Error("Password entry cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u0008" || character === "\u007f") {
          value = Array.from(value).slice(0, -1).join("");
          continue;
        }
        if (character >= " ") value += character;
      }
    }

    input.on("data", onData);
  });
}

async function readConfirmedPassword() {
  const password = await readHidden("Password (input hidden): ");
  const confirmation = await readHidden("Confirm password (input hidden): ");
  if (password !== confirmation) {
    throw new Error("The passwords do not match.");
  }
  const bytes = Buffer.byteLength(password, "utf8");
  if (bytes < 12 || bytes > 72) {
    throw new Error("Password must be 12 to 72 UTF-8 bytes.");
  }
  return password;
}

async function createUser() {
  const { email, name, role, officeCode } = parseArguments(
    process.argv.slice(2),
  );
  await connectDb();

  if (await User.exists({ email })) {
    throw new Error("A user with that email already exists.");
  }

  let officeId;
  if (officeCode) {
    const office = await Office.findOne({ code: officeCode, active: true });
    if (!office) throw new Error("The active office code was not found.");
    officeId = office._id;
  }

  const password = await readConfirmedPassword();
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({
    email,
    name,
    role,
    passwordHash,
    ...(officeId ? { officeId } : {}),
  });
  await ActivityLog.create({
    at: new Date(),
    userId: user._id,
    userName: user.name,
    action: "user_created",
    resourceType: "user",
    resourceId: user._id,
    resourceRef: user._id.toString(),
    result: "success",
    details: `User created with role ${role}.`,
  });

  console.log(`User created: ${user._id.toString()} role=${user.role}`);
}

try {
  await createUser();
} catch (error) {
  if (error?.code === 11000) {
    console.error("A user with that email already exists.");
  } else {
    console.error(
      error instanceof Error ? error.message : "User creation failed.",
    );
  }
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
