import { mockApiAdapter } from "@/services/adapters/mockApiAdapter";
import { realApiAdapter } from "@/services/adapters/realApiAdapter";

export function isRealServiceEnabled(serviceName) {
  const configured = (import.meta.env.VITE_REAL_SERVICES ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return (
    configured.includes("all") ||
    configured.includes(String(serviceName).toLowerCase())
  );
}

export const isMockApiActive = import.meta.env.VITE_USE_MOCK !== "false";

export function getApiAdapter(serviceName = "all") {
  return isRealServiceEnabled(serviceName) ? realApiAdapter : mockApiAdapter;
}

export const apiAdapter = getApiAdapter("all");
