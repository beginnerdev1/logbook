import { MOCK_NOTIFICATIONS } from "@/data/mockNotifications";

const MOCK_REQUEST_DELAY = 150;
let notifications = MOCK_NOTIFICATIONS.map((notification) => ({
  ...notification,
}));

function waitForMockRequest() {
  return new Promise((resolve) => setTimeout(resolve, MOCK_REQUEST_DELAY));
}

export async function listNotifications(role) {
  await waitForMockRequest();
  return notifications
    .filter(
      (notification) =>
        notification.role === role ||
        (notification.role !== "admin" && notification.role !== "user"),
    )
    .map((notification) => ({ ...notification }));
}

export async function markNotificationRead(notificationId) {
  await waitForMockRequest();
  notifications = notifications.map((notification) =>
    notification.id === notificationId
      ? { ...notification, read: true }
      : notification,
  );

  return notifications.find((notification) => notification.id === notificationId);
}

export async function getUnreadNotificationCount(role) {
  const items = await listNotifications(role);
  return items.filter((notification) => !notification.read).length;
}
