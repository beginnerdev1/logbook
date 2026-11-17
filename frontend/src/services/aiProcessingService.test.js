import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("VITE_USE_MOCK", "true");
const { processLogbookImage } = await import("@/services/aiProcessingService");

afterEach(() => vi.useRealTimers());

describe("mock AI entry extraction", () => {
  it("returns a configured entry shape without generic activity/category fields", async () => {
    vi.useFakeTimers();
    const extraction = processLogbookImage({ type: "image/png" });
    await vi.advanceTimersByTimeAsync(900);
    const values = await extraction;

    expect(values).toMatchObject({
      logbookType: "permit_certification",
      entryDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      name: expect.any(String),
      particulars: expect.any(String),
    });
    expect(values).not.toHaveProperty("activity");
    expect(values).not.toHaveProperty("category");
  });
});
