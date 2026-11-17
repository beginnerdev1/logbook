import { describe, expect, it, vi } from "vitest";

vi.stubEnv("VITE_USE_MOCK", "true");
const { listNotifications, markNotificationRead } =
  await import("@/services/notificationsService");

describe("mock notification identifiers", () => {
  it("uses 24-character hexadecimal IDs and updates a notification by ID", async () => {
    const notifications = await listNotifications("admin");
    expect(notifications.length).toBeGreaterThan(0);
    expect(notifications.every((item) => /^[0-9a-f]{24}$/.test(item.id))).toBe(
      true,
    );

    const updated = await markNotificationRead(notifications[0].id);
    expect(updated).toMatchObject({ id: notifications[0].id, read: true });
  });
});
