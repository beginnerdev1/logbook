import { describe, expect, it, vi } from "vitest";
import { warnForMissingFeaturePages } from "@/lib/featurePageRegistry";

describe("feature page registry", () => {
  it("warns in development when a navigation id has no page", () => {
    const logger = { warn: vi.fn() };
    const pages = { dashboard: () => null };
    const items = [{ id: "dashboard" }, { id: "missing-feature" }];

    warnForMissingFeaturePages(items, pages, logger);

    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith(
      'No feature page is registered for navigation item "missing-feature".',
    );
  });
});
