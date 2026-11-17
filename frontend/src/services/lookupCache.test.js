import { beforeEach, describe, expect, it, vi } from "vitest";

const lookupAdapter = vi.hoisted(() => ({
  listOffices: vi.fn(),
  listDocumentTypes: vi.fn(),
}));

vi.mock("@/services/adapters", () => ({
  getApiAdapter: vi.fn(() => lookupAdapter),
}));

import { listOffices } from "@/services/officesService";
import { listDocumentTypes } from "@/services/documentTypesService";
import {
  clearLookupCache,
  getCachedLookup,
  LOOKUP_CACHE_FRESHNESS_MS,
} from "@/services/lookupCache";

describe("lookup caching and filtering", () => {
  beforeEach(() => {
    clearLookupCache();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("reuses fresh results and refreshes after five minutes", async () => {
    vi.useFakeTimers();
    const loader = vi.fn().mockResolvedValue(["fresh"]);
    await expect(getCachedLookup("test", loader)).resolves.toEqual(["fresh"]);
    await getCachedLookup("test", loader);
    expect(loader).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(LOOKUP_CACHE_FRESHNESS_MS + 1);
    await getCachedLookup("test", loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("clears cached lookup results when the session cache is cleared", async () => {
    lookupAdapter.listOffices.mockResolvedValue([
      {
        id: "office",
        code: "peso",
        fullName: "",
        kind: "internal",
        aliases: [],
        active: true,
      },
    ]);
    await listOffices();
    await listOffices();
    expect(lookupAdapter.listOffices).toHaveBeenCalledOnce();

    clearLookupCache();
    await listOffices();
    expect(lookupAdapter.listOffices).toHaveBeenCalledTimes(2);
  });

  it("filters office and document-type search client-side", async () => {
    lookupAdapter.listOffices.mockResolvedValue([
      {
        id: "a",
        code: "peso",
        fullName: "",
        kind: "internal",
        aliases: ["treasury"],
        active: true,
      },
      {
        id: "b",
        code: "bfp",
        fullName: "Fire Bureau",
        kind: "external",
        aliases: [],
        active: true,
      },
    ]);
    lookupAdapter.listDocumentTypes.mockResolvedValue([
      {
        id: "c",
        name: "purchase request",
        aliases: ["pr"],
        logbookTypes: ["permit_certification"],
        active: true,
      },
      {
        id: "d",
        name: "directive",
        aliases: [],
        logbookTypes: ["permit_certification"],
        active: true,
      },
    ]);

    await expect(listOffices({ search: "TREASURY" })).resolves.toMatchObject([
      { id: "a" },
    ]);
    await expect(listOffices({ kind: "external" })).resolves.toMatchObject([
      { id: "b" },
    ]);
    await expect(
      listDocumentTypes({ logbookType: "permit_certification", search: "pr" }),
    ).resolves.toMatchObject([{ id: "c" }]);
    expect(lookupAdapter.listDocumentTypes).toHaveBeenCalledOnce();
  });
});
