import { beforeAll, describe, expect, it, vi } from "vitest";

vi.stubEnv("VITE_USE_MOCK", "true");
const service = await import("@/services/entriesService");
const { MOCK_ENTRIES } = await import("@/data/mockEntries");
const { MOCK_DOCUMENT_TYPES, MOCK_OFFICES } =
  await import("@/data/mockLookups");
const { canEditSubmission } = await import("@/lib/permissions");

beforeAll(() => {
  expect(MOCK_ENTRIES).toHaveLength(40);
});

describe("mock entry service", () => {
  it("applies the role, status, and owner edit matrix", () => {
    const statuses = ["draft", "pending", "approved", "rejected", "failed"];
    const owner = { id: "owner-1", name: "Owner" };

    for (const status of statuses) {
      expect(
        canEditSubmission(
          "admin",
          { id: "admin-1" },
          {
            status,
            submittedBy: { id: "someone-else", name: "Someone else" },
          },
        ),
      ).toBe(true);
      expect(
        canEditSubmission("user", owner, {
          status,
          submittedBy: { id: "owner-1", name: "Owner" },
        }),
      ).toBe(status === "draft" || status === "rejected");
      expect(
        canEditSubmission("user", owner, {
          status,
          submittedBy: { id: "someone-else", name: "Someone else" },
        }),
      ).toBe(false);
    }
  });

  it("paginates and caps page size at 100", async () => {
    const first = await service.listEntries({ page: 1, pageSize: 5 });
    const second = await service.listEntries({ page: 2, pageSize: 5 });
    const capped = await service.listEntries({ page: 1, pageSize: 500 });

    expect(first).toMatchObject({ total: 40, page: 1, pageSize: 5 });
    expect(first.items).toHaveLength(5);
    expect(second.items).toHaveLength(5);
    expect(second.items[0].id).not.toBe(first.items[0].id);
    expect(capped.pageSize).toBe(100);
    expect(capped.items).toHaveLength(40);
  });

  it.each([
    ["logbookType", { logbookType: "travel_order" }],
    ["documentTypeId", { documentTypeId: MOCK_DOCUMENT_TYPES[0].id }],
    ["officeId", { officeId: MOCK_OFFICES[0].id }],
    ["status", { status: "rejected" }],
    ["trackingStatus", { trackingStatus: "returned" }],
    ["fromDate", { fromDate: "2026-10-10" }],
    ["toDate", { toDate: "2026-10-05" }],
  ])("filters by %s", async (_name, filters) => {
    const result = await service.listEntries({ pageSize: 100, filters });
    expect(result.items.length).toBeGreaterThan(0);
    for (const entry of result.items) {
      if (filters.logbookType)
        expect(entry.logbookType).toBe(filters.logbookType);
      if (filters.documentTypeId)
        expect(entry.documentTypeId).toBe(filters.documentTypeId);
      if (filters.officeId) expect(entry.officeId).toBe(filters.officeId);
      if (filters.status) expect(entry.status).toBe(filters.status);
      if (filters.trackingStatus)
        expect(entry.tracking?.status).toBe(filters.trackingStatus);
      if (filters.fromDate)
        expect(entry.entryDate >= filters.fromDate).toBe(true);
      if (filters.toDate) expect(entry.entryDate <= filters.toDate).toBe(true);
    }
  });

  it.each([
    ["name", "Jordan"],
    ["particulars", "purchase request"],
    ["remarks", "review"],
    ["referenceNo", "DOC-2026"],
    ["documentNumber", "PR-2026"],
  ])("searches by case-insensitive substring in %s", async (_field, search) => {
    const result = await service.listEntries({
      search: search.toUpperCase(),
      pageSize: 100,
    });
    expect(result.items.length).toBeGreaterThan(0);
  });

  it("treats regex punctuation in mock search as literal text", async () => {
    const result = await service.listEntries({ search: "[.*", pageSize: 100 });
    expect(result.items).toHaveLength(0);
  });

  it("combines filters before paging results", async () => {
    const documentType = MOCK_DOCUMENT_TYPES.find(
      (item) => item.name === "purchase request",
    );
    const office = MOCK_OFFICES.find((item) => item.code === "peso");
    const result = await service.listEntries({
      pageSize: 100,
      filters: {
        logbookType: "permit_certification",
        documentTypeId: documentType.id,
        officeId: office.id,
        status: "rejected",
        trackingStatus: "returned",
        fromDate: "2026-10-01",
        toDate: "2026-10-28",
      },
    });
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      logbookType: "permit_certification",
      documentTypeId: documentType.id,
      officeId: office.id,
      status: "rejected",
      tracking: { status: "returned" },
    });
  });

  it("exportEntries loops through pages of 100 rows", async () => {
    const listPage = vi.fn(async ({ page, pageSize, filters }) => ({
      items: Array.from(
        { length: Math.min(pageSize, 205 - (page - 1) * pageSize) },
        (_, index) => ({ id: `entry-${(page - 1) * pageSize + index}` }),
      ),
      total: 205,
      page,
      pageSize,
      filters,
    }));

    const result = await service.exportEntries(
      { status: "approved" },
      { listPage },
    );

    expect(result.items).toHaveLength(205);
    expect(result).toMatchObject({ total: 205, capped: false });
    expect(listPage).toHaveBeenCalledTimes(3);
    expect(listPage).toHaveBeenNthCalledWith(2, {
      page: 2,
      pageSize: 100,
      filters: { status: "approved" },
    });
  });

  it("exportEntries returns a zero total for an empty result", async () => {
    const listPage = vi.fn(async () => ({ items: [], total: 0 }));
    const result = await service.exportEntries({}, { listPage });

    expect(result).toEqual({ items: [], total: 0, capped: false });
    expect(listPage).toHaveBeenCalledOnce();
  });

  it("exportEntries caps at 5,000 rows and reports the cap", async () => {
    const listPage = vi.fn(async ({ page, pageSize }) => ({
      items: Array.from({ length: pageSize }, (_, index) => ({
        id: `entry-${(page - 1) * pageSize + index}`,
      })),
      total: 5001,
      page,
      pageSize,
    }));

    const result = await service.exportEntries({}, { listPage });

    expect(result.items).toHaveLength(5000);
    expect(result).toMatchObject({ total: 5001, capped: true });
    expect(listPage).toHaveBeenCalledTimes(50);
  });

  it("exportEntries applies a configured low cap to the 40 mock rows", async () => {
    const result = await service.exportEntries({}, { maxRows: 30 });

    expect(result.items).toHaveLength(30);
    expect(result.total).toBe(40);
    expect(result.capped).toBe(true);
  });

  it("exports exactly the rows returned by the same filters", async () => {
    const filters = { logbookType: "travel_order", status: "pending" };
    const preview = await service.listEntries({ pageSize: 100, filters });
    const exported = await service.exportEntries(filters);

    expect(exported.items.map((entry) => entry.id)).toEqual(
      preview.items.map((entry) => entry.id),
    );
  });

  it("sorts only by the allowlist and resets an out-of-range page", async () => {
    const sorted = await service.listEntries({
      pageSize: 100,
      sort: { field: "amountCentavos", direction: "desc" },
      filters: { logbookType: "check" },
    });
    expect(sorted.items[0].amountCentavos).toBeGreaterThanOrEqual(
      sorted.items.at(-1).amountCentavos,
    );

    const reset = await service.listEntries({
      page: 8,
      pageSize: 10,
      filters: { logbookType: "check" },
    });
    expect(reset.page).toBe(1);
    await expect(
      service.listEntries({ sort: { field: "submittedBy", direction: "asc" } }),
    ).rejects.toMatchObject({
      status: 400,
      code: "INVALID_SORT",
    });
  });

  it("returns valid 24-hex ids and the agreed entry shape", async () => {
    const { items } = await service.listEntries({ pageSize: 100 });
    for (const entry of items) {
      expect(entry.id).toMatch(/^[0-9a-f]{24}$/);
      expect(entry.submittedBy.id).toMatch(/^[0-9a-f]{24}$/);
      expect(entry).not.toHaveProperty("_id");
      expect(entry).not.toHaveProperty("__v");
    }
  });

  it("creates a minimal draft without a reference and assigns one on submit", async () => {
    const office = MOCK_OFFICES.find((item) => item.code === "peso");
    const documentType = MOCK_DOCUMENT_TYPES.find(
      (item) => item.name === "notice of award",
    );
    const draft = await service.createEntry(
      {
        logbookType: "permit_certification",
        entryDate: "2026-07-02",
        name: "Draft operator",
        officeId: office.id,
        officeName: "client-supplied name must be ignored",
        documentTypeId: documentType.id,
        documentTypeName: "client-supplied type must be ignored",
      },
      { submittedBy: { id: "000000000000000000009001", name: "Jordan Lee" } },
    );

    expect(draft.status).toBe("draft");
    expect(draft).not.toHaveProperty("referenceNo");
    expect(draft.officeName).toBe("PESO");
    expect(draft.documentTypeName).toBe("notice of award");

    const submitted = await service.updateEntry(
      draft.id,
      {
        entryDate: "2026-07-02",
        name: "Draft operator",
        particulars: "Submitted with required fields",
        officeId: office.id,
        documentTypeId: documentType.id,
      },
      draft.version,
      {
        status: "pending",
        source: "manual",
        role: "user",
        user: { id: "000000000000000000009001", name: "Jordan Lee" },
      },
    );

    expect(submitted.status).toBe("pending");
    expect(submitted.referenceNo).toMatch(/^DOC-2026-\d{5}$/);
    expect(submitted.version).toBe(1);
  });

  it("deletes only an owner's draft through the entry service", async () => {
    const office = MOCK_OFFICES.find((item) => item.code === "peso");
    const user = { id: "000000000000000000009001", name: "Jordan Lee" };
    const draft = await service.createEntry(
      {
        logbookType: "permit_certification",
        entryDate: "2026-07-02",
        name: "Jordan Lee",
        officeId: office.id,
      },
      { submittedBy: user },
    );

    await expect(
      service.deleteDraftEntry(draft.id, { role: "user", user }),
    ).resolves.toEqual({ id: draft.id, deleted: true });
    await expect(service.getEntry(draft.id)).rejects.toMatchObject({
      code: "ENTRY_NOT_FOUND",
    });
  });

  it("submitEntry resubmits a rejected entry and keeps its reviewer comment", async () => {
    const office = MOCK_OFFICES.find((item) => item.code === "peso");
    const documentType = MOCK_DOCUMENT_TYPES.find(
      (item) => item.name === "notice of award",
    );
    const user = { id: "000000000000000000009001", name: "Jordan Lee" };
    const rejected = await service.createEntry(
      {
        logbookType: "permit_certification",
        entryDate: "2026-07-02",
        name: "Jordan Lee",
        particulars: "Reviewed paperwork",
        officeId: office.id,
        documentTypeId: documentType.id,
      },
      { status: "rejected", source: "manual", submittedBy: user },
    );

    const submitted = await service.submitEntry(
      rejected.id,
      {
        entryDate: "2026-07-02",
        name: "Jordan Lee",
        particulars: "Updated paperwork",
        officeId: office.id,
        documentTypeId: documentType.id,
      },
      rejected.version,
      { role: "user", user },
    );

    expect(submitted.status).toBe("pending");
    expect(submitted.reviewerComment).toBe("Mock rejection comment");
  });

  it("removes prior type-only fields when an entry changes logbook type", async () => {
    const office = MOCK_OFFICES.find((item) => item.code === "peso");
    const documentType = MOCK_DOCUMENT_TYPES.find(
      (item) => item.name === "purchase request",
    );
    const actor = {
      role: "user",
      user: { id: "000000000000000000009001", name: "Jordan Lee" },
    };
    const draft = await service.createEntry(
      {
        logbookType: "permit_certification",
        entryDate: "2026-07-02",
        name: "Jordan Lee",
        particulars: "Old details",
        officeId: office.id,
        documentTypeId: documentType.id,
        documentNumber: "DOC-OLD",
        tracking: { status: "returned", returnedTime: "16:43" },
      },
      {
        submittedBy: actor.user,
        status: "draft",
      },
    );

    const updated = await service.updateEntry(
      draft.id,
      {
        logbookType: "petty_cash",
        entryDate: "2026-07-02",
        name: "Jordan Lee",
        particulars: "New type payload",
        officeId: office.id,
        amountCentavos: 1500,
      },
      draft.version,
      actor,
    );

    expect(updated.logbookType).toBe("petty_cash");
    expect(updated).not.toHaveProperty("documentNumber");
    expect(updated).not.toHaveProperty("tracking");
    expect(updated).not.toHaveProperty("details");
  });

  it("returns a 409-style error for a stale client version", async () => {
    const entry = MOCK_ENTRIES.find(
      (item) => item.logbookType === "check" && item.status === "pending",
    );
    const { toFormValues } = await import("@/lib/entryMapper");

    await expect(
      service.updateEntry(entry.id, toFormValues(entry), entry.version + 1, {
        role: "admin",
        user: { id: "admin-1", name: "Admin" },
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "VERSION_CONFLICT",
      message:
        "This record was changed by someone else. Reload to see the latest.",
    });
  });
});

describe("lookup services", () => {
  it("expose all seeded mock lookup rows and scope document types", async () => {
    const { listOffices } = await import("@/services/officesService");
    const { listDocumentTypes } =
      await import("@/services/documentTypesService");
    expect(await listOffices()).toHaveLength(28);
    expect(await listDocumentTypes()).toHaveLength(24);
    expect(
      (await listDocumentTypes({ logbookType: "dtr_leave" })).map(
        (item) => item.name,
      ),
    ).toEqual(["DTR", "Leave"]);
  });
});
