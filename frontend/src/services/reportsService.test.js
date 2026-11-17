import { describe, expect, it, vi } from "vitest";

vi.stubEnv("VITE_USE_MOCK", "true");
const {
  buildReportFilename,
  exportReportRows,
  formatReportRows,
  listReportRows,
  REPORT_COLUMNS,
  REPORT_LIGHT_PALETTE,
} = await import("@/services/reportsService");
const { formatPesos } = await import("@/lib/money");

describe("entry reports", () => {
  it("builds xlsx and pdf filenames from date-only strings", () => {
    expect(buildReportFilename("travel_order", "2026-10-14", "xlsx")).toBe(
      "logbook-travel_order-2026-10-14.xlsx",
    );
    expect(buildReportFilename("all", "2026-10-14", "pdf")).toBe(
      "logbook-all-2026-10-14.pdf",
    );
    expect(() => buildReportFilename("check", "10/14/2026", "pdf")).toThrow(
      "Filename date must be a YYYY-MM-DD string.",
    );
  });

  it("exports the same formatted rows returned by the active filters", async () => {
    const filters = { logbookType: "check", status: "approved" };
    const preview = await listReportRows({ page: 1, pageSize: 100, filters });
    const exported = await exportReportRows(filters);

    expect(exported.rows).toEqual(formatReportRows(preview.items));
    expect(Object.keys(exported.rows[0])).toEqual(REPORT_COLUMNS);
    expect(exported.rows[0].Date).toBe("Oct 8, 2026");
    expect(exported.rows[0].Amount).toBe(
      formatPesos(preview.items[0].amountCentavos),
    );
  });

  it("leaves missing office and amount cells blank in report rows", () => {
    expect(
      formatReportRows([
        {
          logbookType: "permit_certification",
          status: "pending",
          entryDate: "2026-10-14",
          name: "Certification",
        },
      ])[0],
    ).toMatchObject({ Office: "", Amount: "" });
  });

  it("uses fixed light colors independently of the application theme", () => {
    expect(REPORT_LIGHT_PALETTE).toEqual({
      background: "FFFFFF",
      headerBackground: "F1F5F9",
      alternateBackground: "F8FAFC",
      text: "111827",
      border: "CBD5E1",
    });
  });
});
