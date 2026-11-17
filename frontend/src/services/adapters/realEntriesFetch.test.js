import { afterEach, describe, expect, it, vi } from "vitest";

const { realApiAdapter } = await import("@/services/adapters/realApiAdapter");

function jsonResponse(body, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => (name === "content-type" ? "application/json" : null) },
    json: async () => body,
    text: async () => "",
  };
}

describe("real entries adapter over fetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("preserves the mock list shape and serializes only scalar API parameters", async () => {
    const result = {
      items: [{ id: "000000000000000000000001", version: 0 }],
      total: 1,
      page: 1,
      pageSize: 100,
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(result));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      realApiAdapter.listEntries({
        page: 1,
        pageSize: 200,
        search: "receipt",
        sort: { field: "entryDate", direction: "desc" },
        filters: {
          mine: true,
          status: ["draft", "rejected"],
          fromDate: "2026-10-01",
          officeId: "",
        },
      }),
    ).resolves.toEqual(result);

    const url = new URL(fetchMock.mock.calls[0][0], "http://localhost");
    expect(url.searchParams.get("pageSize")).toBe("100");
    expect(url.searchParams.get("sort")).toBe("entryDate");
    expect(url.searchParams.get("order")).toBe("desc");
    expect(url.searchParams.get("status")).toBe("draft,rejected");
    expect(url.searchParams.get("mine")).toBe("true");
    expect(url.searchParams.get("dateFrom")).toBe("2026-10-01");
    expect(url.searchParams.has("officeId")).toBe(false);
    expect(url.searchParams.has("filters")).toBe(false);
    expect([...url.searchParams.values()].every((value) => typeof value === "string")).toBe(
      true,
    );
  });

  it("sends configured entry fields and returns an API entry without changing its shape", async () => {
    const entry = {
      id: "000000000000000000000001",
      version: 0,
      logbookType: "petty_cash",
      entryDate: "2026-10-14",
      name: "Transport reimbursement",
      details: {},
      status: "draft",
      source: "manual",
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(entry));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      realApiAdapter.createEntry(
        {
          logbookType: "petty_cash",
          entryDate: "2026-10-14",
          name: "Transport reimbursement",
          status: "pending",
          referenceNo: "MUST-NOT-SEND",
          officeName: "Must not send",
          documentTypeName: "Must not send",
          submittedBy: { name: "Must not send" },
        },
        { status: "pending", source: "manual" },
      ),
    ).resolves.toEqual(entry);

    const [, options] = fetchMock.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({
      logbookType: "petty_cash",
      entryDate: "2026-10-14",
      name: "Transport reimbursement",
      source: "manual",
    });
  });
});
