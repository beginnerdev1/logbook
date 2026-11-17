import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { isRealServiceEnabled } from "@/lib/apiClient";
import { normalizeLookupText } from "@/services/adapters/lookupShapes";

function optionLabel(option, kind) {
  return kind === "office"
    ? option.fullName || option.code?.toUpperCase() || "Office"
    : option.name || "Document type";
}

export function LookupCombobox({
  id,
  kind,
  label,
  value,
  onChange,
  options = [],
  snapshot,
  getById,
  isLoading,
  error,
  onRetry,
  isProcessing,
  required,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [resolved, setResolved] = useState(null);
  const activeOption = options.find((option) => option.id === value);
  const fetchedOption = resolved?.id === value ? resolved : null;
  const fallback =
    value && !activeOption && !fetchedOption
      ? {
          id: value,
          code: kind === "office" ? value : undefined,
          name: snapshot || "Selected document type",
          fullName: snapshot || "Selected office",
          aliases: [],
          active: true,
          isFallback: true,
        }
      : null;
  const selectedOption = activeOption || fetchedOption || fallback;
  const visibleOptions = useMemo(() => {
    const query = normalizeLookupText(search);
    const rows = options.filter((option) => {
      if (!query) return true;
      const fields =
        kind === "office"
          ? [option.code, option.fullName, ...(option.aliases ?? [])]
          : [option.name, ...(option.aliases ?? [])];
      return fields.some((field) => normalizeLookupText(field).includes(query));
    });
    if (
      selectedOption?.isFallback &&
      !rows.some((option) => option.id === value)
    ) {
      return [selectedOption, ...rows];
    }
    return rows;
  }, [kind, options, search, selectedOption, value]);

  useEffect(() => {
    if (
      !value ||
      isLoading ||
      activeOption ||
      !isRealServiceEnabled(kind === "office" ? "offices" : "documentTypes")
    ) {
      return undefined;
    }

    let current = true;
    getById(value)
      .then((option) => {
        if (current && option) setResolved(option);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [activeOption, getById, isLoading, kind, value]);

  const selectedLabel = selectedOption ? optionLabel(selectedOption, kind) : "";
  const statusLabel = selectedOption?.isFallback
    ? "(not in list)"
    : selectedOption?.active === false
      ? "(inactive)"
      : "";

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          id={id}
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-required={required}
          disabled={isProcessing}
          className="inline-flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
        >
          <span className="min-w-0 truncate">
            {selectedLabel ? (
              <>
                {selectedLabel} {statusLabel}
              </>
            ) : isLoading ? (
              `Loading ${label.toLowerCase()}...`
            ) : (
              `Choose ${label.toLowerCase()}`
            )}
          </span>
          <ChevronsUpDown
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--anchor-width)] gap-2 p-2"
        >
          <Input
            autoComplete="off"
            aria-label={`Search ${label.toLowerCase()}`}
            placeholder={`Search ${label.toLowerCase()}`}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div
            className="max-h-56 overflow-y-auto"
            role="listbox"
            aria-label={`${label} options`}
          >
            {isLoading ? (
              <p
                className="px-2 py-3 text-sm text-muted-foreground"
                role="status"
              >
                Loading {label.toLowerCase()}...
              </p>
            ) : visibleOptions.length ? (
              visibleOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={option.id === value}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    onChange(option.id);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <Check
                    className={`size-4 shrink-0 ${option.id === value ? "opacity-100" : "opacity-0"}`}
                  />
                  <span className="min-w-0 truncate">
                    {optionLabel(option, kind)}
                    {option.isFallback
                      ? " (not in list)"
                      : option.active === false
                        ? " (inactive)"
                        : ""}
                  </span>
                </button>
              ))
            ) : (
              <p
                className="px-2 py-3 text-sm text-muted-foreground"
                role="status"
              >
                {search
                  ? `No ${label.toLowerCase()} match that search.`
                  : `No ${label.toLowerCase()} available.`}
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>
      {error && (
        <div
          className="flex items-center justify-between gap-3 text-sm text-destructive"
          role="alert"
        >
          <span>
            {error.message || `Could not load ${label.toLowerCase()}.`}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </div>
      )}
      {!error && !isLoading && options.length === 0 && !selectedOption && (
        <p className="text-sm text-muted-foreground">
          No {label.toLowerCase()} available.
        </p>
      )}
    </div>
  );
}
