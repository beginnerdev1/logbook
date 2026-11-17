import { afterEach, describe, expect, it, vi } from "vitest";
import { getApiAdapter, isRealServiceEnabled } from "@/services/adapters";
import { realApiAdapter } from "@/services/adapters/realApiAdapter";
import { mockApiAdapter } from "@/services/adapters/mockApiAdapter";

describe("per-service adapter selection", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("recognizes the configured camel-case documentTypes service", () => {
    vi.stubEnv("VITE_REAL_SERVICES", "auth,offices,documentTypes");
    expect(isRealServiceEnabled("auth")).toBe(true);
    expect(isRealServiceEnabled("offices")).toBe(true);
    expect(isRealServiceEnabled("documentTypes")).toBe(true);
    expect(getApiAdapter("documentTypes")).toBe(realApiAdapter);
    expect(getApiAdapter("entries")).toBe(mockApiAdapter);
  });
});