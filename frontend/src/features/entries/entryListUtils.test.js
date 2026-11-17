import { describe, expect, it } from "vitest";
import { LOGBOOK_TYPES } from "@/config/logbookTypes";
import {
  buildEntryFilters,
  getEntryTableValues,
  updateEntrySearchParams,
} from "@/features/entries/entryListUtils";
import { MOCK_DOCUMENT_TYPES, MOCK_OFFICES } from "@/data/mockLookups";

describe("entry list utilities", () => {
  it.each(Object.entries(LOGBOOK_TYPES))(
    "renders configured columns for %s",
    (logbookType, type) => {
      const values = getEntryTableValues({
        id: `entry-${logbookType}`,
        logbookType,
        status: "draft",
        entryDate: "2026-10-14",
        name: "Jordan Lee",
        particulars: "Sample particulars",
        officeName: "PESO",
        amountCentavos: 123456,
        tracking: { status: "returned", returnedTime: "16:43" },
        source: "manual",
      });

      expect(values).toMatchObject({
        referenceNo: "Draft",
        type: type.label,
        date: "Oct 14, 2026",
        name: "Jordan Lee",
        particulars: "Sample particulars",
        office: "PESO",
        amount: expect.stringContaining("1,234.56"),
        tracking: "Returned · 4:43 PM",
        status: "draft",
        source: "manual",
      });
    },
  );

  it("uses travel purpose when particulars are absent", () => {
    expect(
      getEntryTableValues({
        logbookType: "travel_order",
        status: "pending",
        entryDate: "2026-10-14",
        details: { purposeOfTravel: "Regional meeting" },
      }).particulars,
    ).toBe("Regional meeting");
  });

  it("shows an em dash for missing permit office and amount in tables", () => {
    expect(
      getEntryTableValues({
        logbookType: "permit_certification",
        status: "pending",
        entryDate: "2026-10-14",
        name: "Certification",
      }),
    ).toMatchObject({ office: "—", amount: "—" });
  });

  it("combines entry filters and scopes document type and owner", () => {
    const filters = buildEntryFilters(
      "own",
      "user",
      "Jordan Lee",
      "permit_certification",
      MOCK_DOCUMENT_TYPES[0].id,
      MOCK_OFFICES[0].id,
      "rejected",
      "returned",
      "2026-10-01",
      "2026-10-31",
    );

    expect(filters).toEqual({
      logbookType: "permit_certification",
      documentTypeId: MOCK_DOCUMENT_TYPES[0].id,
      officeId: MOCK_OFFICES[0].id,
      status: "rejected",
      trackingStatus: "returned",
      fromDate: "2026-10-01",
      toDate: "2026-10-31",
      submittedByName: "Jordan Lee",
    });
  });

  it("resets the page on filter changes and round-trips filters through the URL", () => {
    const next = updateEntrySearchParams(
      new URLSearchParams("page=8&pageSize=25&logbookType=check"),
      { status: "rejected", officeId: "office-1" },
    );
    const restored = new URLSearchParams(next.toString());

    expect(restored.get("page")).toBe("1");
    expect(restored.get("pageSize")).toBe("25");
    expect(restored.get("logbookType")).toBe("check");
    expect(restored.get("status")).toBe("rejected");
    expect(restored.get("officeId")).toBe("office-1");
  });
});
