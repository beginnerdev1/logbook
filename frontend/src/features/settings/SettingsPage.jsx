import { useEffect, useState } from "react";
import { Bell, Bot, Building2, FileText } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SYSTEM_STATUSES } from "@/lib/constants";
import { listDocumentTypes } from "@/services/documentTypesService";
import { listOffices } from "@/services/officesService";
import { getAppSettings, saveAppPreferences } from "@/services/settingsService";

export function SettingsPage() {
  const [settings, setSettings] = useState(null);
  const [preferences, setPreferences] = useState(null);
  const [offices, setOffices] = useState([]);
  const [documentTypes, setDocumentTypes] = useState([]);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [isSettingsLoading, setIsSettingsLoading] = useState(true);
  const [areLookupsLoading, setAreLookupsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [lookupError, setLookupError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const isLoading = isSettingsLoading || areLookupsLoading;
  const error = settingsError || lookupError;

  useEffect(() => {
    let isActive = true;

    getAppSettings()
      .then((value) => {
        if (!isActive) return;
        setSettings(value);
        setPreferences(value.preferences);
        setSettingsError("");
      })
      .catch(() => {
        if (isActive) setSettingsError("Settings could not be loaded.");
      })
      .finally(() => {
        if (isActive) setIsSettingsLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [reloadKey]);

  useEffect(() => {
    let isActive = true;
    const officesRequest = includeInactive
      ? Promise.all([listOffices(), listOffices({ active: false })]).then(
          ([active, inactive]) => [...active, ...inactive],
        )
      : listOffices();
    const documentTypesRequest = includeInactive
      ? Promise.all([
          listDocumentTypes(),
          listDocumentTypes({ active: false }),
        ]).then(([active, inactive]) => [...active, ...inactive])
      : listDocumentTypes();

    Promise.all([officesRequest, documentTypesRequest])
      .then(([officeRows, documentRows]) => {
        if (!isActive) return;
        setOffices(officeRows);
        setDocumentTypes(documentRows);
        setLookupError("");
      })
      .catch(() => {
        if (isActive) setLookupError("Lookup lists could not be loaded.");
      })
      .finally(() => {
        if (isActive) setAreLookupsLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [includeInactive, reloadKey]);

  function retryLoad() {
    setIsSettingsLoading(true);
    setAreLookupsLoading(true);
    setSettingsError("");
    setLookupError("");
    setReloadKey((key) => key + 1);
  }

  function updatePreference(key, value) {
    setPreferences((current) => ({ ...current, [key]: value }));
  }

  async function savePreferences() {
    setIsSaving(true);

    try {
      const saved = await saveAppPreferences(preferences);
      setSettings(saved);
      setPreferences(saved.preferences);
      toast.success("Simulated: preferences saved for this browser session.");
    } catch {
      toast.error("Simulated: preferences could not be saved.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description="Manage sample app preferences and configuration status."
      />
      <p className="mb-5 text-xs text-muted-foreground">
        Lookup values are read-only. Preference changes are simulated.
      </p>

      <Field
        orientation="horizontal"
        className="mb-6 max-w-md items-center justify-between"
      >
        <FieldLabel htmlFor="include-inactive-lookups">
          Include inactive lookup values
        </FieldLabel>
        <Switch
          id="include-inactive-lookups"
          checked={includeInactive}
          onCheckedChange={(checked) => {
            setAreLookupsLoading(true);
            setLookupError("");
            setIncludeInactive(checked);
          }}
        />
      </Field>

      {error ? (
        <div
          className="flex flex-col items-start gap-3 rounded-md border border-border p-5"
          role="alert"
        >
          <p className="text-sm">{error}</p>
          <Button type="button" variant="outline" onClick={retryLoad}>
            Try again
          </Button>
        </div>
      ) : isLoading || !settings || !preferences ? (
        <div className="max-w-3xl space-y-4" aria-busy="true">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <div className="max-w-4xl space-y-8">
          <section aria-labelledby="preferences-title">
            <div className="mb-4 flex items-center gap-2">
              <Bell
                aria-hidden="true"
                className="size-4 text-muted-foreground"
              />
              <h2 id="preferences-title" className="text-base font-semibold">
                App preferences
              </h2>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field>
                <FieldLabel id="date-format-label">Date format</FieldLabel>
                <Select
                  value={preferences.dateFormat}
                  onValueChange={(value) =>
                    updatePreference("dateFormat", value)
                  }
                >
                  <SelectTrigger
                    className="w-full"
                    aria-labelledby="date-format-label"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MMM d, yyyy">Oct 12, 2026</SelectItem>
                    <SelectItem value="MM/dd/yyyy">10/12/2026</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel id="export-format-label">
                  Default export format
                </FieldLabel>
                <Select
                  value={preferences.defaultExportFormat}
                  onValueChange={(value) =>
                    updatePreference("defaultExportFormat", value)
                  }
                >
                  <SelectTrigger
                    className="w-full"
                    aria-labelledby="export-format-label"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
                    <SelectItem value="pdf">PDF (.pdf)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field
                orientation="horizontal"
                className="items-center justify-between"
              >
                <FieldLabel htmlFor="include-comments">
                  Include reviewer comments in exports
                </FieldLabel>
                <Switch
                  id="include-comments"
                  checked={preferences.includeReviewerComments}
                  onCheckedChange={(checked) =>
                    updatePreference("includeReviewerComments", checked)
                  }
                />
              </Field>
              <Field
                orientation="horizontal"
                className="items-center justify-between"
              >
                <FieldLabel htmlFor="simulated-notifications">
                  Simulated notifications
                </FieldLabel>
                <Switch
                  id="simulated-notifications"
                  checked={preferences.simulatedNotifications}
                  onCheckedChange={(checked) =>
                    updatePreference("simulatedNotifications", checked)
                  }
                />
              </Field>
            </div>
            <Button
              className="mt-5"
              type="button"
              disabled={isSaving}
              onClick={savePreferences}
            >
              {isSaving ? "Saving..." : "Save preferences"}
            </Button>
          </section>

          <section aria-labelledby="offices-title">
            <div className="mb-3 flex items-center gap-2">
              <Building2
                aria-hidden="true"
                className="size-4 text-muted-foreground"
              />
              <h2 id="offices-title" className="text-base font-semibold">
                Offices
              </h2>
            </div>
            <p className="mb-3 text-sm text-muted-foreground">
              Configured office lookup values. This list is read-only.
            </p>
            <ul className="divide-y divide-border border-y border-border sm:grid sm:grid-cols-2 sm:divide-y-0">
              {offices.map((office) => (
                <li
                  key={office.id}
                  className="flex items-center justify-between gap-3 py-2.5 pr-4 text-sm sm:border-b sm:border-border"
                >
                  <span className="min-w-0">
                    <span className="block truncate">
                      {office.fullName || office.code.toUpperCase()}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {office.code}
                      {office.aliases.length
                        ? ` · ${office.aliases.join(", ")}`
                        : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs capitalize text-muted-foreground">
                    {office.kind}
                    {office.active ? "" : " · inactive"}
                  </span>
                </li>
              ))}
            </ul>
            {offices.length === 0 && (
              <p className="py-3 text-sm text-muted-foreground">
                No offices found.
              </p>
            )}
          </section>

          <section aria-labelledby="document-types-title">
            <div className="mb-3 flex items-center gap-2">
              <FileText
                aria-hidden="true"
                className="size-4 text-muted-foreground"
              />
              <h2 id="document-types-title" className="text-base font-semibold">
                Document types
              </h2>
            </div>
            <p className="mb-3 text-sm text-muted-foreground">
              Configured document type lookup values. This list is read-only.
            </p>
            <ul className="divide-y divide-border border-y border-border sm:grid sm:grid-cols-2 sm:divide-y-0">
              {documentTypes.map((documentType) => (
                <li
                  key={documentType.id}
                  className="flex items-center justify-between gap-3 py-2.5 pr-4 text-sm sm:border-b sm:border-border"
                >
                  <span className="min-w-0">
                    <span className="block truncate">{documentType.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {documentType.aliases.join(", ") || "No aliases"}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-xs text-muted-foreground">
                    {documentType.logbookTypes.join(", ")}
                    {documentType.active ? "" : " · inactive"}
                  </span>
                </li>
              ))}
            </ul>
            {documentTypes.length === 0 && (
              <p className="py-3 text-sm text-muted-foreground">
                No document types found.
              </p>
            )}
          </section>

          <section aria-labelledby="ai-configuration-title">
            <div className="mb-3 flex items-center gap-2">
              <Bot
                aria-hidden="true"
                className="size-4 text-muted-foreground"
              />
              <h2
                id="ai-configuration-title"
                className="text-base font-semibold"
              >
                AI configuration
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-y border-border py-4">
              <StatusBadge status={SYSTEM_STATUSES.NOT_CONNECTED} />
              <span className="text-sm">{settings.aiConfiguration.mode}</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              No AI service is connected. No API credentials are configured or
              displayed.
            </p>
          </section>
        </div>
      )}
    </>
  );
}
