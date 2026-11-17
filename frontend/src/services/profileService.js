import { apiClient, isRealServiceEnabled } from "@/lib/apiClient";
import { ROLES } from "@/lib/permissions";
import { updateUser } from "@/services/usersService";

export const DEFAULT_PROFILES = Object.freeze({
  [ROLES.ADMIN]: Object.freeze({
    id: "000000000000000000009000",
    name: "Admin Demo",
    email: "admin.demo@logbook.example",
    title: "Administrator",
    initials: "AD",
    sampleOwnerName: "Admin Demo",
    role: ROLES.ADMIN,
  }),
  [ROLES.USER]: Object.freeze({
    id: "000000000000000000009001",
    name: "Jordan Lee",
    email: "jordan.lee@logbook.example",
    title: "User",
    initials: "JL",
    sampleOwnerName: "Jordan Lee",
    role: ROLES.USER,
  }),
});

const MOCK_REQUEST_DELAY = 180;
let profiles = Object.fromEntries(
  Object.entries(DEFAULT_PROFILES).map(([role, profile]) => [
    role,
    { ...profile },
  ]),
);

function getInitials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export async function updateProfile(role, changes) {
  await new Promise((resolve) => setTimeout(resolve, MOCK_REQUEST_DELAY));
  const currentProfile = profiles[role];

  if (!currentProfile) {
    throw new Error("The sample profile could not be found.");
  }

  const updatedUser = await updateUser(currentProfile.id, {
    name: changes.name.trim(),
    email: changes.email.trim(),
    role: currentProfile.role,
  });
  const profile = {
    ...currentProfile,
    name: updatedUser.name,
    email: updatedUser.email,
    initials: getInitials(updatedUser.name),
  };

  profiles = { ...profiles, [role]: profile };
  return { ...profile };
}

export async function requestPasswordChange({ currentPassword, newPassword }) {
  if (isRealServiceEnabled("auth")) {
    await apiClient.post("/auth/change-password", {
      currentPassword,
      newPassword,
    });
    return { accepted: true };
  }

  await new Promise((resolve) => setTimeout(resolve, MOCK_REQUEST_DELAY));
  return { simulated: true };
}
