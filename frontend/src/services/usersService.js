import { MOCK_USERS } from "@/data/mockUsers";

const MOCK_REQUEST_DELAY = 200;
let users = MOCK_USERS.map((user) => ({ ...user }));
let nextUserNumber = users.length + 1;

function waitForMockRequest() {
  return new Promise((resolve) => setTimeout(resolve, MOCK_REQUEST_DELAY));
}

function copyUser(user) {
  return { ...user };
}

function userObjectId(sequence) {
  return (9000 + sequence).toString(16).padStart(24, "0");
}

function findUserIndex(userId) {
  const index = users.findIndex((user) => user.id === userId);

  if (index < 0) {
    throw new Error("The sample user could not be found.");
  }

  return index;
}

function ensureUniqueEmail(email, exceptUserId) {
  const normalizedEmail = email.trim().toLowerCase();
  const duplicate = users.some(
    (user) =>
      user.id !== exceptUserId && user.email.toLowerCase() === normalizedEmail,
  );

  if (duplicate) {
    throw new Error("A sample user already uses that email address.");
  }
}

export async function listUsers() {
  await waitForMockRequest();
  return users.map(copyUser);
}

export async function createUser(values) {
  ensureUniqueEmail(values.email);
  await waitForMockRequest();
  const user = {
    id: userObjectId(nextUserNumber),
    name: values.name.trim(),
    email: values.email.trim(),
    role: values.role,
    isActive: true,
    createdAt: new Date().toISOString(),
    lastLogin: "Never",
  };

  nextUserNumber += 1;
  users = [...users, user];
  return copyUser(user);
}

export async function updateUser(userId, values) {
  ensureUniqueEmail(values.email, userId);
  await waitForMockRequest();
  const index = findUserIndex(userId);
  users[index] = {
    ...users[index],
    name: values.name.trim(),
    email: values.email.trim(),
    role: values.role,
  };

  return copyUser(users[index]);
}

export async function setUserActive(userId, isActive) {
  await waitForMockRequest();
  const index = findUserIndex(userId);
  users[index] = { ...users[index], isActive };
  return copyUser(users[index]);
}
