import { describe, expect, it, vi } from "vitest";

vi.stubEnv("VITE_USE_MOCK", "true");
const { createUser, listUsers } = await import("@/services/usersService");

describe("mock user identifiers", () => {
  it("uses 24-character hexadecimal IDs for existing and new users", async () => {
    const existingUsers = await listUsers();
    const createdUser = await createUser({
      name: "Test User",
      email: "test.user@logbook.example",
      role: "user",
    });

    expect(
      [...existingUsers, createdUser].every((user) =>
        /^[0-9a-f]{24}$/.test(user.id),
      ),
    ).toBe(true);
  });
});
