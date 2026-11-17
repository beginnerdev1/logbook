import { afterEach, describe, expect, it, vi } from "vitest";
import { MOCK_ENTRIES } from "@/data/mockEntries";
import { toFormValues } from "@/lib/entryMapper";
import { realApiAdapter } from "@/services/adapters/realApiAdapter";
import { saveAndSubmitEntry } from "@/services/entriesService";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("real entry submission sequence", () => {
  it("creates a draft, patches it, then submits with each latest version", async () => {
    vi.stubEnv("VITE_REAL_SERVICES", "entries");
    const sample = MOCK_ENTRIES.find(
      (entry) => entry.logbookType === "petty_cash",
    );
    const values = {
      ...toFormValues(sample),
      logbookType: sample.logbookType,
    };
    const draft = { ...sample, id: "000000000000000000000101", version: 0 };
    const saved = { ...draft, version: 2, status: "draft" };
    const submitted = {
      ...saved,
      version: 3,
      status: "pending",
      referenceNo: "PCV-2026-00001",
    };
    const calls = [];
    vi.spyOn(realApiAdapter, "createEntry").mockImplementation(async () => {
      calls.push("create");
      return draft;
    });
    vi.spyOn(realApiAdapter, "updateEntry").mockImplementation(
      async (_id, _payload, version) => {
        calls.push(`patch:${version}`);
        return saved;
      },
    );
    vi.spyOn(realApiAdapter, "submitEntry").mockImplementation(
      async (_id, _payload, version) => {
        calls.push(`submit:${version}`);
        return submitted;
      },
    );
    const versionUpdates = [];

    await expect(
      saveAndSubmitEntry(values, null, {
        role: "user",
        user: { id: sample.submittedBy.id, name: sample.submittedBy.name },
        onEntryChange: (entry) => versionUpdates.push(entry.version),
      }),
    ).resolves.toEqual(submitted);

    expect(calls).toEqual(["create", "patch:0", "submit:2"]);
    expect(versionUpdates).toEqual([0, 2, 3]);
  });
});
