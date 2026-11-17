import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/apiClient", () => ({
  apiClient: { get: vi.fn() },
}));

import { apiClient } from "@/lib/apiClient";
import { mockApiAdapter } from "@/services/adapters/mockApiAdapter";
import { realApiAdapter } from "@/services/adapters/realApiAdapter";

describe("lookup adapter shapes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns identical office and document-type keys from mock and real adapters", async () => {
    const mockOffice = await mockApiAdapter.listOffices();
    const mockDocumentType = await mockApiAdapter.listDocumentTypes({
      logbookType: "permit_certification",
    });
    apiClient.get
      .mockResolvedValueOnce({
        items: [
          {
            id: "real-office-id",
            code: "peso",
            fullName: "",
            kind: "internal",
            aliases: [],
            active: true,
            _id: "ignored",
            __v: 2,
          },
        ],
        total: 1,
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: "real-type-id",
            name: "purchase request",
            aliases: ["pr"],
            logbookTypes: ["permit_certification"],
            fieldRules: { amountCentavos: "required" },
            active: true,
            _id: "ignored",
            __v: 4,
          },
        ],
        total: 1,
      });

    const realOffice = await realApiAdapter.listOffices();
    const realDocumentType = await realApiAdapter.listDocumentTypes({
      logbookType: "permit_certification",
    });

    expect(Object.keys(realOffice[0])).toEqual(Object.keys(mockOffice[0]));
    expect(Object.keys(realDocumentType[0])).toEqual(
      Object.keys(mockDocumentType[0]),
    );
    expect(realDocumentType[0]).toHaveProperty("fieldRules");
    expect(
      mockDocumentType.find((item) => item.name === "purchase request")
        .fieldRules,
    ).toEqual({ amountCentavos: "required" });
    expect(
      mockDocumentType.find((item) => item.name === "certification").fieldRules,
    ).toEqual({ officeId: "hidden", amountCentavos: "hidden" });
    expect(realOffice[0].id).toBe("real-office-id");
    expect(realOffice[0]).not.toHaveProperty("_id");
    expect(realOffice[0]).not.toHaveProperty("__v");
    expect(realDocumentType[0]).not.toHaveProperty("_id");
    expect(realDocumentType[0]).not.toHaveProperty("__v");
  });
});
