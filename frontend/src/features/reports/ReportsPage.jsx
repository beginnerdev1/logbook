import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LOGBOOK_TYPES } from "@/config/logbookTypes";
import { compareDateOnly, todayDateOnly } from "@/lib/dateOnly";
import { ROLES } from "@/lib/permissions";
import { useRole } from "@/hooks/useRole";
import {
  buildReportFilename,
  exportReportRows,
  formatReportRows,
  listReportRows,
  MAX_EXPORT_ROWS,
  REPORT_COLUMNS,
  REPORT_LIGHT_PALETTE,
} from "@/services/reportsService";
import { listDocumentTypes } from "@/services/documentTypesService";
import { listOffices } from "@/services/officesService";
import { DevOnlyMockNote } from "@/components/shared/DevOnlyMockNote";

const PAGE_SIZES = [10, 25, 50];
const STATUSES = ["draft", "pending", "approved", "rejected", "failed"];

function buildXlsxStyles(worksheet, rowCount, columnCount) {
  for (let column = 0; column < columnCount; column += 1) {
    const cell = worksheet[String.fromCharCode(65 + column) + "1"];
    if (cell) {
      cell.s = {
        fill: {
          patternType: "solid",
          fgColor: { rgb: REPORT_LIGHT_PALETTE.headerBackground },
        },
        font: { bold: true, color: { rgb: REPORT_LIGHT_PALETTE.text } },
        border: {
          bottom: {
            style: "thin",
            color: { rgb: REPORT_LIGHT_PALETTE.border },
          },
        },
      };
    }
  }
  for (let row = 2; row <= rowCount + 1; row += 1) {
    for (let column = 0; column < columnCount; column += 1) {
      const cell = worksheet[String.fromCharCode(65 + column) + row];
      if (cell) {
        cell.s = {
          fill: {
            patternType: "solid",
            fgColor: {
              rgb:
                row % 2 === 0
                  ? REPORT_LIGHT_PALETTE.background
                  : REPORT_LIGHT_PALETTE.alternateBackground,
            },
          },
          font: { color: { rgb: REPORT_LIGHT_PALETTE.text } },
        };
      }
    }
  }
}

export function ReportsPage({ maxExportRows = MAX_EXPORT_ROWS }) {
  const { role } = useRole();
  const [logbookType, setLogbookType] = useState("");
  const [documentTypeId, setDocumentTypeId] = useState("");
  const [officeId, setOfficeId] = useState("");
  const [status, setStatus] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [lookups, setLookups] = useState({ offices: [], documentTypes: [] });
  const [lookupError, setLookupError] = useState("");
  const [loadResult, setLoadResult] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");

  const filters = useMemo(
    () => ({
      ...(logbookType ? { logbookType } : {}),
      ...(documentTypeId ? { documentTypeId } : {}),
      ...(officeId ? { officeId } : {}),
      ...(status ? { status } : {}),
      ...(fromDate ? { fromDate } : {}),
      ...(toDate ? { toDate } : {}),
    }),
    [logbookType, documentTypeId, officeId, status, fromDate, toDate],
  );
  const requestKey = JSON.stringify([filters, page, pageSize, reloadKey]);
  const currentLoadResult =
    loadResult?.requestKey === requestKey ? loadResult : null;
  const result = currentLoadResult?.result;
  const isLoading = !currentLoadResult;
  const error = currentLoadResult?.error || lookupError;
  const rows = result?.items ?? [];
  const total = result?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    let active = true;
    Promise.all([listOffices(), listDocumentTypes({ logbookType })])
      .then(([offices, documentTypes]) => {
        if (!active) return;
        setLookups({ offices, documentTypes });
        setLookupError("");
      })
      .catch(() => {
        if (active) setLookupError("Report filters could not be loaded.");
      });
    return () => {
      active = false;
    };
  }, [logbookType, reloadKey]);

  useEffect(() => {
    let active = true;
    listReportRows({
      page,
      pageSize,
      sort: { field: "entryDate", direction: "desc" },
      filters,
    })
      .then((nextResult) => {
        if (!active) return;
        setLoadResult({ requestKey, result: nextResult, error: "" });
        if (nextResult.page !== page) setPage(nextResult.page);
      })
      .catch(() => {
        if (active) {
          setLoadResult({
            requestKey,
            result: null,
            error: "Report entries could not be loaded.",
          });
        }
      });
    return () => {
      active = false;
    };
  }, [page, pageSize, filters, requestKey]);

  function clearFilters() {
    setLogbookType("");
    setDocumentTypeId("");
    setOfficeId("");
    setStatus("");
    setFromDate("");
    setToDate("");
    setPage(1);
    setExportMessage("");
  }

  function retryLoad() {
    setReloadKey((key) => key + 1);
    setLoadResult(null);
  }

  function setFilter(setter, value) {
    setter(value);
    setPage(1);
    setExportMessage("");
  }

  async function exportReport(format) {
    if (isExporting) return;
    setIsExporting(true);
    setExportMessage("");
    try {
      const report = await exportReportRows(filters, {
        maxRows: maxExportRows,
      });
      if (!report.rows.length) {
        toast.error("No filtered entries are available to export.");
        return;
      }
      const filename = buildReportFilename(
        logbookType || "all",
        todayDateOnly(),
        format,
      );

      if (format === "xlsx") {
        const XLSX = await import("xlsx");
        const worksheet = XLSX.utils.aoa_to_sheet([
          REPORT_COLUMNS,
          ...report.rows.map((row) =>
            REPORT_COLUMNS.map((column) => row[column]),
          ),
        ]);
        worksheet["!cols"] = REPORT_COLUMNS.map((column) => ({
          wch: Math.min(Math.max(column.length + 4, 14), 40),
        }));
        buildXlsxStyles(worksheet, report.rows.length, REPORT_COLUMNS.length);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Logbook entries");
        XLSX.writeFile(workbook, filename, { cellStyles: true });
      } else {
        const [{ jsPDF }, { autoTable }] = await Promise.all([
          import("jspdf"),
          import("jspdf-autotable"),
        ]);
        const pdf = new jsPDF({ orientation: "landscape" });
        pdf.setFillColor(255, 255, 255);
        pdf.rect(
          0,
          0,
          pdf.internal.pageSize.getWidth(),
          pdf.internal.pageSize.getHeight(),
          "F",
        );
        pdf.setTextColor(17, 24, 39);
        pdf.setFontSize(14);
        pdf.text("Logbook report", 14, 16);
        pdf.setFontSize(9);
        pdf.text(`${report.rows.length} filtered entries`, 14, 22);
        autoTable(pdf, {
          startY: 28,
          head: [REPORT_COLUMNS],
          body: report.rows.map((row) =>
            REPORT_COLUMNS.map((column) => row[column] ?? ""),
          ),
          styles: {
            fontSize: 8,
            cellPadding: 2,
            fillColor: [255, 255, 255],
            textColor: [17, 24, 39],
            lineColor: [203, 213, 225],
          },
          headStyles: {
            fillColor: [241, 245, 249],
            textColor: [17, 24, 39],
          },
          alternateRowStyles: { fillColor: [248, 250, 252] },
        });
        pdf.save(filename);
      }

      if (report.capped) {
        setExportMessage(
          `Export limited to ${maxExportRows.toLocaleString()} of ${report.total.toLocaleString()} matching entries.`,
        );
      }
      toast.success(`Exported ${report.rows.length.toLocaleString()} entries.`);
    } catch (exportError) {
      toast.error(
        exportError instanceof Error
          ? `Export failed: ${exportError.message}`
          : "Export failed.",
      );
    } finally {
      setIsExporting(false);
    }
  }

  const invalidDateRange = Boolean(
    fromDate &&
    toDate &&
    (() => {
      try {
        return compareDateOnly(toDate, fromDate) < 0;
      } catch {
        return true;
      }
    })(),
  );

  if (role !== ROLES.ADMIN) {
    return (
      <div className="rounded-md border border-border p-6 text-sm text-muted-foreground">
        Reports are not available for this role.
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Reports & Export"
        description="Filter logbook entries, review the preview, then export matching results."
      />
      <DevOnlyMockNote />

      <div className="mb-5 grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <Label htmlFor="report-logbook-type">Logbook type</Label>
          <Select
            value={logbookType || "all"}
            onValueChange={(value) => {
              setLogbookType(value === "all" ? "" : value);
              setDocumentTypeId("");
              setPage(1);
              setExportMessage("");
            }}
          >
            <SelectTrigger id="report-logbook-type" className="mt-1 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All logbook types</SelectItem>
              {Object.entries(LOGBOOK_TYPES).map(([key, type]) => (
                <SelectItem key={key} value={key}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="report-document-type">Document type</Label>
          <Select
            value={documentTypeId || "all"}
            onValueChange={(value) =>
              setFilter(setDocumentTypeId, value === "all" ? "" : value)
            }
            disabled={!lookups.documentTypes.length}
          >
            <SelectTrigger id="report-document-type" className="mt-1 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All document types</SelectItem>
              {lookups.documentTypes.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="report-office">Office</Label>
          <Select
            value={officeId || "all"}
            onValueChange={(value) =>
              setFilter(setOfficeId, value === "all" ? "" : value)
            }
          >
            <SelectTrigger id="report-office" className="mt-1 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All offices</SelectItem>
              {lookups.offices.map((office) => (
                <SelectItem key={office.id} value={office.id}>
                  {office.fullName || office.code.toUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="report-status">Status</Label>
          <Select
            value={status || "all"}
            onValueChange={(value) =>
              setFilter(setStatus, value === "all" ? "" : value)
            }
          >
            <SelectTrigger id="report-status" className="mt-1 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="report-date-from">From date</Label>
          <Input
            id="report-date-from"
            type="date"
            className="mt-1"
            value={fromDate}
            onChange={(event) => setFilter(setFromDate, event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="report-date-to">To date</Label>
          <Input
            id="report-date-to"
            type="date"
            className="mt-1"
            value={toDate}
            onChange={(event) => setFilter(setToDate, event.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 xl:col-span-2">
          <Button type="button" variant="outline" onClick={clearFilters}>
            Clear filters
          </Button>
          <Label htmlFor="report-page-size">Rows</Label>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              setPageSize(Number(value));
              setPage(1);
            }}
          >
            <SelectTrigger id="report-page-size" className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {invalidDateRange && (
        <p className="mb-3 text-sm text-destructive" role="alert">
          The end date must be on or after the start date.
        </p>
      )}
      {error ? (
        <div
          role="alert"
          className="mb-4 flex flex-col items-start gap-3 rounded-md border border-border p-5"
        >
          <p>{error}</p>
          <Button type="button" variant="outline" onClick={retryLoad}>
            Retry
          </Button>
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Preview: {isLoading ? "…" : total.toLocaleString()} matching
              entries
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={
                  isLoading || isExporting || total === 0 || invalidDateRange
                }
                onClick={() => void exportReport("xlsx")}
              >
                <FileSpreadsheet aria-hidden="true" />
                {isExporting ? "Exporting..." : "Export Excel"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={
                  isLoading || isExporting || total === 0 || invalidDateRange
                }
                onClick={() => void exportReport("pdf")}
              >
                <FileText aria-hidden="true" />
                {isExporting ? "Exporting..." : "Export PDF"}
              </Button>
            </div>
          </div>
          {exportMessage && (
            <p role="status" className="mb-3 text-sm text-amber-700">
              {exportMessage}
            </p>
          )}
          <section
            className="overflow-x-auto rounded-md border border-border bg-card"
            aria-busy={isLoading}
          >
            <table className="w-full min-w-[1100px] text-left text-sm">
              <caption className="sr-only">
                Filtered report entry preview
              </caption>
              <thead>
                <tr className="border-b bg-muted/40">
                  {REPORT_COLUMNS.map((column) => (
                    <th
                      key={column}
                      scope="col"
                      className={`whitespace-nowrap px-3 py-3 font-medium ${column === "Amount" ? "text-right" : ""}`}
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from(
                    { length: Math.min(pageSize, 5) },
                    (_, rowIndex) => (
                      <tr
                        key={`report-loading-${rowIndex}`}
                        className="border-b"
                      >
                        {REPORT_COLUMNS.map((column) => (
                          <td key={column} className="px-3 py-4">
                            <span className="block h-4 w-24 animate-pulse rounded bg-muted" />
                          </td>
                        ))}
                      </tr>
                    ),
                  )
                ) : rows.length ? (
                  rows.map((entry) => {
                    const values = formatReportRows([entry])[0];
                    return (
                      <tr key={entry.id} className="border-b last:border-0">
                        <td className="whitespace-nowrap px-3 py-3">
                          {values["Ref No"]}
                        </td>
                        <td className="px-3 py-3">{values.Type}</td>
                        <td className="whitespace-nowrap px-3 py-3">
                          {values.Date}
                        </td>
                        <td className="px-3 py-3">{values.Name}</td>
                        <td className="max-w-xs px-3 py-3">
                          {values.Particulars}
                        </td>
                        <td className="px-3 py-3">{values.Office}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                          {values.Amount}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          {values.Tracking}
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge status={entry.status} />
                        </td>
                        <td className="px-3 py-3 capitalize">
                          {values.Source}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td
                      colSpan={REPORT_COLUMNS.length}
                      className="px-3 py-10 text-center text-muted-foreground"
                    >
                      No entries match these filters
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-3">
              <p className="text-sm text-muted-foreground">
                Page {page} of {pageCount}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isLoading || page <= 1}
                  onClick={() => setPage((value) => value - 1)}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isLoading || page >= pageCount}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </section>
        </>
      )}
    </>
  );
}
