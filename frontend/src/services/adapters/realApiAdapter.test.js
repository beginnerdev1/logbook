import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/apiClient", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    del: vi.fn(),
  },
}));

const { apiClient } = await import("@/lib/apiClient");
const { realApiAdapter } = await import("@/services/adapters/realApiAdapter");

beforeEach(() => vi.clearAllMocks());

describe("real entry adapter request bodies", () => {
  it("never sends resolved names, submitter, role, or user identity", async () => {
    apiClient.post.mockResolvedValue({});
    const payload = {
      logbookType: "petty_cash",
      entryDate: "2026-10-14",
      name: "Jordan Lee",
      officeId: "000000000000000000000003",
      officeName: "client label",
      documentTypeName: "client label",
      submittedBy: { id: "000000000000000000009001", name: "Jordan Lee" },
    };

    await realApiAdapter.createEntry(payload, {
      status: "pending",
      source: "manual",
      role: "admin",
      user: { id: "000000000000000000009000", name: "Admin Demo" },
    });

    expect(apiClient.post).toHaveBeenCalledWith("/entries", {
      logbookType: "petty_cash",
      entryDate: "2026-10-14",
      name: "Jordan Lee",
      officeId: "000000000000000000000003",
      source: "manual",
    });
  });

  it("serializes list scope as scalar API query parameters", async () => {
    apiClient.get.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 100,
    });

    await realApiAdapter.listEntries({
      page: 1,
      pageSize: 500,
      search: "travel",
      sort: { field: "entryDate", direction: "desc" },
      filters: {
        mine: true,
        status: ["draft", "rejected"],
        fromDate: "2026-10-01",
        toDate: "",
        officeId: "",
      },
    });

    const [path] = apiClient.get.mock.calls[0];
    const params = new URLSearchParams(path.split("?")[1]);
    expect(path).toContain("/entries?");
    expect(params.get("pageSize")).toBe("100");
    expect(params.get("sort")).toBe("entryDate");
    expect(params.get("order")).toBe("desc");
    expect(params.get("status")).toBe("draft,rejected");
    expect(params.get("mine")).toBe("true");
    expect(params.get("dateFrom")).toBe("2026-10-01");
    expect(params.has("dateTo")).toBe(false);
    expect(params.has("officeId")).toBe(false);
    expect(params.has("filters")).toBe(false);
    expect([...params.values()].every((value) => typeof value === "string")).toBe(
      true,
    );
  });

  it("posts only the latest version when submitting", async () => {
    apiClient.post.mockResolvedValue({ id: "000000000000000000000001" });
    await realApiAdapter.submitEntry(
      "000000000000000000000001",
      { name: "must not be submitted", status: "pending" },
      4,
      { source: "ai", status: "pending" },
    );

    expect(apiClient.post).toHaveBeenCalledWith(
      "/entries/000000000000000000000001/submit",
      { version: 4 },
    );
  });

  it("patches only configured fields and the current version", async () => {
    apiClient.patch.mockResolvedValue({ version: 5 });
    await realApiAdapter.updateEntry(
      "000000000000000000000001",
      {
        logbookType: "check",
        entryDate: "2026-10-14",
        name: "Transport reimbursement",
        particulars: "Local transit",
        officeId: "000000000000000000000003",
        details: { checkNumber: "000184", unconfigured: "ignore" },
        status: "pending",
        referenceNo: "ignore",
        officeName: "ignore",
        documentTypeName: "ignore",
        submittedBy: { name: "ignore" },
      },
      4,
    );

    expect(apiClient.patch).toHaveBeenCalledWith(
      "/entries/000000000000000000000001",
      {
        logbookType: "check",
        entryDate: "2026-10-14",
        name: "Transport reimbursement",
        particulars: "Local transit",
        officeId: "000000000000000000000003",
        details: { checkNumber: "000184" },
        version: 4,
      },
    );
  });

  it("normalizes history and 204 deletion to the mock adapter shapes", async () => {
    apiClient.get.mockResolvedValue({
      items: [
        {
          at: "2026-10-14T12:00:00.000Z",
          action: "entry_edited",
          actor: { id: "000000000000000000000002", name: "Reviewer" },
          changes: { name: { from: "Old", to: "New" } },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 25,
    });
    apiClient.del.mockResolvedValue(null);

    const history = await realApiAdapter.getEntryHistory(
      "000000000000000000000001",
    );
    const deleted = await realApiAdapter.deleteDraftEntry(
      "000000000000000000000001",
    );

    expect(history[0]).toMatchObject({
      changedFields: ["name"],
      changedBy: "Reviewer",
      changedAt: "2026-10-14T12:00:00.000Z",
    });
    expect(deleted).toEqual({
      id: "000000000000000000000001",
      deleted: true,
    });
  });

  it("sends only a decision and comment for review", async () => {
    apiClient.patch.mockResolvedValue({});
    await realApiAdapter.reviewEntry(
      "000000000000000000000001",
      "rejected",
      "Please verify the receipt.",
      "Untrusted client reviewer",
    );

    expect(apiClient.patch).toHaveBeenCalledWith(
      "/entries/000000000000000000000001/review",
      { decision: "rejected", reviewerComment: "Please verify the receipt." },
    );
  });
});
