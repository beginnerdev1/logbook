import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useSearchParams } from "react-router-dom";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LOGBOOK_TYPES } from "@/config/logbookTypes";
import { EntryDetailsDialog } from "@/features/entries/EntryDetailsDialog";
import { EntryForm } from "@/features/entries/EntryForm";
import { ReviewDecisionDialog } from "@/features/approvals/ReviewDecisionDialog";
import { useRole } from "@/hooks/useRole";
import { compareDateOnly } from "@/lib/dateOnly";
import { canEditSubmission, ROLES } from "@/lib/permissions";
import {
  getEntry,
  getEntryHistory,
  listEntries,
  deleteDraftEntry,
  reviewEntry,
  saveAndSubmitEntry,
  submitEntry,
  updateEntry,
} from "@/services/entriesService";
import { listDocumentTypes } from "@/services/documentTypesService";
import { listOffices } from "@/services/officesService";
import { toFormValues } from "@/lib/entryMapper";
import { isRealServiceEnabled } from "@/services/adapters";
import { mockApiAdapter } from "@/services/adapters/mockApiAdapter";
import {
  buildEntryFilters,
  getEntryTableValues,
  updateEntrySearchParams,
} from "@/features/entries/entryListUtils";

const PAGE_SIZES = [10, 25, 50];
const SORT_FIELDS = [
  "entryDate",
  "createdAt",
  "referenceNo",
  "name",
  "amountCentavos",
  "status",
];
const STATUSES = ["draft", "pending", "approved", "rejected", "failed"];

function paramValue(params, key, fallback = "") {
  return params.get(key) || fallback;
}

export function EntriesList({ mode, title, description }) {
  const { role, user } = useRole();
  const realEntries = isRealServiceEnabled("entries");
  const entriesAdapter =
    mode === "pending" && realEntries ? mockApiAdapter : undefined;
  const [searchParams, setSearchParams] = useSearchParams();
  const currentPage = Math.max(
    1,
    Number.parseInt(paramValue(searchParams, "page", "1"), 10) || 1,
  );
  const parsedPageSize = Number.parseInt(
    paramValue(searchParams, "pageSize", "10"),
    10,
  );
  const pageSize = PAGE_SIZES.includes(parsedPageSize) ? parsedPageSize : 10;
  const requestedSort = paramValue(searchParams, "sort", "createdAt");
  const sortField = SORT_FIELDS.includes(requestedSort)
    ? requestedSort
    : "createdAt";
  const sortDirection =
    paramValue(searchParams, "direction", "desc") === "asc" ? "asc" : "desc";
  const search = paramValue(searchParams, "search");
  const logbookType = paramValue(searchParams, "logbookType");
  const documentTypeId = paramValue(searchParams, "documentTypeId");
  const officeId = paramValue(searchParams, "officeId");
  const status = paramValue(searchParams, "status");
  const trackingStatus = paramValue(searchParams, "trackingStatus");
  const fromDate = paramValue(searchParams, "fromDate");
  const toDate = paramValue(searchParams, "toDate");
  const ownerName = realEntries
    ? user?.name
    : user?.sampleOwnerName || user?.name;
  const filters = useMemo(
    () =>
      buildEntryFilters(
        mode,
        role,
        ownerName,
        logbookType,
        documentTypeId,
        officeId,
        status,
        trackingStatus,
        fromDate,
        toDate,
        realEntries && mode !== "pending",
      ),
    [
      mode,
      role,
      ownerName,
      logbookType,
      documentTypeId,
      officeId,
      status,
      trackingStatus,
      fromDate,
      toDate,
      realEntries,
    ],
  );

  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [loadResult, setLoadResult] = useState(null);
  const [lookupError, setLookupError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [offices, setOffices] = useState([]);
  const [documentTypes, setDocumentTypes] = useState([]);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [historyResult, setHistoryResult] = useState(null);
  const [editingEntry, setEditingEntry] = useState(null);
  const [decisionTarget, setDecisionTarget] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const detailsRequest = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let active = true;
    Promise.all([listOffices(), listDocumentTypes({ logbookType })])
      .then(([officeRows, documentRows]) => {
        if (!active) return;
        setOffices(officeRows);
        setDocumentTypes(documentRows);
        setLookupError("");
      })
      .catch(() => {
        if (active) setLookupError("Entry filters could not be loaded.");
      });
    return () => {
      active = false;
    };
  }, [logbookType, reloadKey]);

  const requestKey = JSON.stringify([
    mode,
    role,
    ownerName,
    currentPage,
    pageSize,
    sortField,
    sortDirection,
    search,
    debouncedSearch,
    filters,
    reloadKey,
  ]);

  useEffect(() => {
    let active = true;
    if (search !== debouncedSearch) return undefined;
    listEntries({
      page: currentPage,
      pageSize,
      sort: { field: sortField, direction: sortDirection },
      search: debouncedSearch,
      filters,
      adapter: entriesAdapter,
    })
      .then((nextResult) => {
        if (!active) return;
        setLoadResult({ requestKey, result: nextResult, error: "" });
        if (nextResult.page !== currentPage) {
          setSearchParams(
            (currentParams) => {
              const nextParams = new URLSearchParams(currentParams);
              nextParams.set("page", String(nextResult.page));
              return nextParams;
            },
            { replace: true },
          );
        }
      })
      .catch(() => {
        if (active) {
          setLoadResult({
            requestKey,
            result: null,
            error: "Entries could not be loaded.",
          });
        }
      });
    return () => {
      active = false;
    };
  }, [
    currentPage,
    pageSize,
    sortField,
    sortDirection,
    requestKey,
    search,
    debouncedSearch,
    filters,
    entriesAdapter,
    reloadKey,
    setSearchParams,
  ]);

  const currentLoadResult =
    loadResult?.requestKey === requestKey ? loadResult : null;
  const result = currentLoadResult?.result;
  const loading = !currentLoadResult;
  const error = currentLoadResult?.error || lookupError;

  useEffect(() => {
    let active = true;
    if (!selectedEntry) return undefined;
    getEntryHistory(selectedEntry.id, entriesAdapter)
      .then((items) => {
        if (active) setHistoryResult({ entryId: selectedEntry.id, items });
      })
      .catch(() => {
        if (active) setHistoryResult({ entryId: selectedEntry.id, items: [] });
      });
    return () => {
      active = false;
    };
  }, [selectedEntry, entriesAdapter]);

  const history =
    selectedEntry && historyResult?.entryId === selectedEntry.id
      ? historyResult.items
      : [];
  const historyLoading = Boolean(
    selectedEntry && historyResult?.entryId !== selectedEntry.id,
  );

  function updateParams(changes, resetPage = true) {
    setSearchParams(updateEntrySearchParams(searchParams, changes, resetPage));
  }

  function setFilter(key, value) {
    const changes = { [key]: value };
    if (key === "logbookType") changes.documentTypeId = "";
    updateParams(changes);
  }

  function clearFilters() {
    updateParams({
      search: "",
      logbookType: "",
      documentTypeId: "",
      officeId: "",
      status: "",
      trackingStatus: "",
      fromDate: "",
      toDate: "",
    });
  }

  function retry() {
    setReloadKey((key) => key + 1);
  }

  async function openDetails(entry) {
    const requestId = ++detailsRequest.current;
    setSelectedEntry(entry);
    setHistoryResult(null);
    setDetailsLoading(true);
    try {
      const loaded = await getEntry(entry.id, entriesAdapter);
      if (requestId === detailsRequest.current) setSelectedEntry(loaded);
    } catch (error) {
      if (requestId === detailsRequest.current) {
        setSelectedEntry(null);
        toast.error(
          error?.status === 404
            ? "This entry is no longer available."
            : "Entry details could not be loaded.",
        );
      }
    } finally {
      if (requestId === detailsRequest.current) setDetailsLoading(false);
    }
  }

  async function saveEntry(values) {
    const updateOptions = {
      role,
      user,
      adapter: entriesAdapter,
    };
    let updated;
    if (editingEntry.status === "draft" || editingEntry.status === "rejected") {
      if (realEntries && !entriesAdapter) {
        updated = await saveAndSubmitEntry(values, editingEntry, {
          ...updateOptions,
          onEntryChange: setEditingEntry,
        });
      } else {
        updated = await submitEntry(
          editingEntry.id,
          values,
          editingEntry.version,
          updateOptions,
        );
      }
    } else {
      updated = await updateEntry(
        editingEntry.id,
        values,
        editingEntry.version,
        { ...updateOptions, status: editingEntry.status },
      );
    }
    setEditingEntry(null);
    setSelectedEntry(null);
    toast.success("Entry saved.");
    retry();
    return updated;
  }

  async function reloadEditingEntry() {
    const freshEntry = await getEntry(editingEntry.id, entriesAdapter);
    setEditingEntry(freshEntry);
  }

  async function removeDraft(entry) {
    if (!window.confirm("Delete this draft? This cannot be undone.")) return;
    try {
      await deleteDraftEntry(entry.id, { role, user, adapter: entriesAdapter });
      setSelectedEntry(null);
      toast.success("Draft deleted.");
      retry();
    } catch (error) {
      toast.error(
        error?.status === 404
          ? "This entry is no longer available."
          : error?.status === 403
            ? "You do not have permission to delete this draft."
            : "The draft could not be deleted.",
      );
    }
  }

  async function confirmReview({ comment }) {
    try {
      await reviewEntry(
        decisionTarget.record.id,
        decisionTarget.decision,
        comment,
        { role, user, adapter: entriesAdapter },
      );
      setDecisionTarget(null);
      setSelectedEntry(null);
      toast.success(`Entry ${decisionTarget.decision}.`);
      retry();
    } catch (reviewError) {
      toast.error(
        reviewError instanceof Error
          ? reviewError.message
          : "The review could not be saved.",
      );
    }
  }

  const rows = result?.items ?? [];
  const total = result?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const dateRangeInvalid =
    fromDate &&
    toDate &&
    (() => {
      try {
        return compareDateOnly(toDate, fromDate) < 0;
      } catch {
        return true;
      }
    })();
  if (mode === "pending" && role !== ROLES.ADMIN) {
    return (
      <div className="rounded-md border border-border p-6 text-sm text-muted-foreground">
        Approval review is not available for this role.
      </div>
    );
  }

  function sortBy(field) {
    if (!SORT_FIELDS.includes(field)) return;
    const direction =
      sortField === field && sortDirection === "asc" ? "desc" : "asc";
    updateParams({ sort: field, direction });
  }

  return (
    <>
      <PageHeader title={title} description={description} />
      <div className="mb-4 grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <Label htmlFor="entry-search">Search entries</Label>
          <div className="relative mt-1">
            <Search
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="entry-search"
              value={search}
              onChange={(event) => {
                const value = event.target.value;
                updateParams({ search: value });
              }}
              placeholder="Reference, name, particulars..."
              className="pl-9"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="filter-logbook-type">Logbook type</Label>
          <Select
            value={logbookType || "all"}
            onValueChange={(value) =>
              setFilter("logbookType", value === "all" ? "" : value)
            }
          >
            <SelectTrigger id="filter-logbook-type" className="mt-1 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {Object.entries(LOGBOOK_TYPES).map(([key, type]) => (
                <SelectItem key={key} value={key}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="filter-document-type">Document type</Label>
          <Select
            value={documentTypeId || "all"}
            onValueChange={(value) =>
              setFilter("documentTypeId", value === "all" ? "" : value)
            }
            disabled={!documentTypes.length}
          >
            <SelectTrigger id="filter-document-type" className="mt-1 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All document types</SelectItem>
              {documentTypes.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="filter-office">Office</Label>
          <Select
            value={officeId || "all"}
            onValueChange={(value) =>
              setFilter("officeId", value === "all" ? "" : value)
            }
          >
            <SelectTrigger id="filter-office" className="mt-1 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All offices</SelectItem>
              {offices.map((office) => (
                <SelectItem key={office.id} value={office.id}>
                  {office.fullName || office.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="filter-status">Status</Label>
          <Select
            value={mode === "pending" ? "pending" : status || "all"}
            onValueChange={(value) =>
              setFilter("status", value === "all" ? "" : value)
            }
            disabled={mode === "pending"}
          >
            <SelectTrigger id="filter-status" className="mt-1 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="filter-tracking">Tracking status</Label>
          <Select
            value={trackingStatus || "all"}
            onValueChange={(value) =>
              setFilter("trackingStatus", value === "all" ? "" : value)
            }
          >
            <SelectTrigger id="filter-tracking" className="mt-1 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tracking</SelectItem>
              <SelectItem value="received">Received</SelectItem>
              <SelectItem value="returned">Returned</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="filter-date-from">From date</Label>
          <Input
            id="filter-date-from"
            type="date"
            className="mt-1"
            value={fromDate}
            onChange={(event) => setFilter("fromDate", event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="filter-date-to">To date</Label>
          <Input
            id="filter-date-to"
            type="date"
            className="mt-1"
            value={toDate}
            onChange={(event) => setFilter("toDate", event.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 xl:col-span-4">
          <Button type="button" variant="outline" onClick={clearFilters}>
            Clear filters
          </Button>
          <Label htmlFor="entry-page-size">Rows</Label>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => updateParams({ pageSize: value })}
          >
            <SelectTrigger id="entry-page-size" className="w-24">
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
      {dateRangeInvalid && (
        <p className="mb-3 text-sm text-destructive" role="alert">
          The end date must be on or after the start date.
        </p>
      )}

      {error ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-md border border-border p-6 text-sm"
        >
          <p>{error}</p>
          <Button type="button" variant="outline" onClick={retry}>
            Retry
          </Button>
        </div>
      ) : (
        <section
          className="overflow-x-auto rounded-md border border-border bg-card"
          aria-busy={loading}
        >
          <table className="w-full min-w-[1200px] text-left text-sm">
            <caption className="sr-only">{title} entries</caption>
            <thead>
              <tr className="border-b bg-muted/40">
                {[
                  ["Ref No", "referenceNo"],
                  ["Type", null],
                  ["Date", "entryDate"],
                  ["Name", "name"],
                  ["Particulars", null],
                  ["Office", null],
                  ["Amount", "amountCentavos"],
                  ["Tracking", null],
                  ["Status", "status"],
                  ["Source", null],
                  ["Actions", null],
                ].map(([label, field]) => (
                  <th
                    key={label}
                    scope="col"
                    className={`whitespace-nowrap px-3 py-3 font-medium ${label === "Amount" ? "text-right" : ""}`}
                  >
                    {field ? (
                      <button
                        type="button"
                        className="hover:underline"
                        onClick={() => sortBy(field)}
                      >
                        {label}
                        {sortField === field
                          ? sortDirection === "asc"
                            ? " ↑"
                            : " ↓"
                          : ""}
                      </button>
                    ) : (
                      label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: Math.min(pageSize, 5) }, (_, rowIndex) => (
                  <tr key={`loading-${rowIndex}`} className="border-b">
                    {Array.from({ length: 11 }, (_, colIndex) => (
                      <td key={colIndex} className="px-3 py-4">
                        <span className="block h-4 w-24 animate-pulse rounded bg-muted" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.length ? (
                rows.map((entry) => {
                  const values = getEntryTableValues(entry);
                  return (
                    <tr key={entry.id} className="border-b last:border-0">
                      <td className="whitespace-nowrap px-3 py-3">
                        {values.referenceNo}
                      </td>
                      <td className="px-3 py-3">{values.type}</td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {values.date}
                      </td>
                      <td className="px-3 py-3">{values.name}</td>
                      <td className="max-w-xs px-3 py-3">
                        {values.particulars}
                      </td>
                      <td className="px-3 py-3">{values.office}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                        {values.amount}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {values.tracking}
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={values.status} />
                      </td>
                      <td className="px-3 py-3 capitalize">{values.source}</td>
                      <td className="px-3 py-3">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void openDetails(entry)}
                        >
                          View
                        </Button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={11}
                    className="px-3 py-10 text-center text-muted-foreground"
                  >
                    <p>No entries match these filters</p>
                    <Button type="button" variant="link" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-3">
            <p className="text-sm text-muted-foreground">
              {total} entries · Page {currentPage} of {pageCount}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading || currentPage <= 1}
                onClick={() => updateParams({ page: currentPage - 1 }, false)}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading || currentPage >= pageCount}
                onClick={() => updateParams({ page: currentPage + 1 }, false)}
              >
                Next
              </Button>
            </div>
          </div>
        </section>
      )}

      <EntryDetailsDialog
        entry={selectedEntry}
        role={role}
        user={user}
        canEdit={
          selectedEntry
            ? (selectedEntry.canEditSubmission ??
              canEditSubmission(role, user, selectedEntry))
            : false
        }
        detailsLoading={detailsLoading}
        history={history}
        historyLoading={historyLoading}
        onClose={() => {
          detailsRequest.current += 1;
          setDetailsLoading(false);
          setSelectedEntry(null);
        }}
        onEdit={() => {
          setEditingEntry(selectedEntry);
          setSelectedEntry(null);
        }}
        onDelete={() => void removeDraft(selectedEntry)}
        onReview={(decision) => {
          setDecisionTarget({ record: selectedEntry, decision });
          setSelectedEntry(null);
        }}
      />
      <Dialog
        open={Boolean(editingEntry)}
        onOpenChange={(open) => {
          if (!open) setEditingEntry(null);
        }}
      >
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
          {editingEntry && (
            <>
              <DialogHeader>
                <DialogTitle>Edit entry</DialogTitle>
                <DialogDescription>
                  {editingEntry.referenceNo || "Draft"}
                </DialogDescription>
              </DialogHeader>
              <EntryForm
                key={editingEntry.id}
                mode="edit"
                entryId={editingEntry.id}
                version={editingEntry.version}
                logbookType={editingEntry.logbookType}
                initialValues={{
                  ...toFormValues(editingEntry),
                  status: editingEntry.status,
                  reviewerComment: editingEntry.reviewerComment,
                }}
                role={role}
                user={user}
                onCancel={() => setEditingEntry(null)}
                onSubmit={saveEntry}
                onReload={reloadEditingEntry}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
      <ReviewDecisionDialog
        target={decisionTarget}
        onClose={() => setDecisionTarget(null)}
        onConfirm={confirmReview}
      />
    </>
  );
}
