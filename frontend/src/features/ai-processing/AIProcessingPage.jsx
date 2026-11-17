import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Expand,
  ImagePlus,
  LoaderCircle,
  Minus,
  Plus,
  RotateCcw,
  RotateCw,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EntryForm } from "@/features/entries/EntryForm";
import { processLogbookImage } from "@/services/aiProcessingService";
import {
  createEntry,
  getEntry,
  saveAndSubmitEntry,
  updateEntry,
} from "@/services/entriesService";
import { isRealServiceEnabled } from "@/services/adapters";
import { toFormValues } from "@/lib/entryMapper";
import { useRole } from "@/hooks/useRole";

const TABS = [
  { id: "ai", label: "Scan Photo (AI)" },
  { id: "manual", label: "Manual Entry" },
];
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_PREVIEW_SIZE = 2000;
const EMPTY_MANUAL_VALUES = { logbookType: "permit_certification" };

function getMobileCaptureFlag() {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function guessConfidenceMap(values = {}) {
  const entries = Object.entries(values);

  return Object.fromEntries(
    entries.map(([field, value], index) => {
      const baseConfidence =
        typeof value === "string" ? value.trim().length : 0;
      const score =
        baseConfidence > 0
          ? 0.92 - (index % 3) * 0.08
          : 0.66 - (index % 2) * 0.09;
      return [field, Math.min(Math.max(score, 0.58), 0.98)];
    }),
  );
}

async function normalizeUploadedImage(file) {
  if (!(file instanceof File) || !file.type.startsWith("image/")) {
    throw new Error("Choose an image file before processing.");
  }

  if (file.type === "image/heic" || /\.heic$/i.test(file.name)) {
    throw new Error(
      "This browser could not read HEIC files. Please use JPEG or PNG instead.",
    );
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error("The photo is too large. Please keep it under 10 MB.");
  }

  if (typeof createImageBitmap !== "function") {
    return file;
  }

  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  const maxDimension = Math.max(bitmap.width, bitmap.height);
  const scale =
    maxDimension > MAX_PREVIEW_SIZE ? MAX_PREVIEW_SIZE / maxDimension : 1;
  const targetWidth = Math.max(1, Math.round(bitmap.width * scale));
  const targetHeight = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return file;
  }

  context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
  bitmap.close();

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (nextBlob) => {
        if (nextBlob) {
          resolve(nextBlob);
          return;
        }
        reject(new Error("The image could not be prepared for the preview."));
      },
      "image/jpeg",
      0.8,
    );
  });

  const nextFile = new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
    type: "image/jpeg",
    lastModified: Date.now(),
  });

  return nextFile;
}

export function AIProcessingPage() {
  const { role, user } = useRole();
  const realEntriesMode = isRealServiceEnabled("entries");
  const [activeTab, setActiveTab] = useState(
    realEntriesMode ? "manual" : "ai",
  );
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [reviewValues, setReviewValues] = useState(null);
  const [manualValues, setManualValues] = useState(EMPTY_MANUAL_VALUES);
  const [manualEntry, setManualEntry] = useState(null);
  const [manualFormKey, setManualFormKey] = useState(0);
  const [manualImageFile, setManualImageFile] = useState(null);
  const [manualPreviewUrl, setManualPreviewUrl] = useState("");
  const [aiDirty, setAiDirty] = useState(false);
  const [manualDirty, setManualDirty] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingError, setProcessingError] = useState("");
  const [pendingAction, setPendingAction] = useState(null);
  const [pendingTab, setPendingTab] = useState(null);
  const [fullSizeImageUrl, setFullSizeImageUrl] = useState("");
  const [imageZoom, setImageZoom] = useState(1);
  const [imageRotation, setImageRotation] = useState(0);
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 });
  const fileInputRef = useRef(null);
  const manualInputRef = useRef(null);
  const hasUnsavedChangesRef = useRef(false);
  const isMobileCapture = getMobileCaptureFlag();

  const hasUnsavedChanges =
    activeTab === "ai"
      ? Boolean(imageFile || reviewValues || aiDirty || processingError)
      : Boolean(manualImageFile || manualDirty);

  useEffect(() => {
    if (!previewUrl) {
      return undefined;
    }

    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    if (!manualPreviewUrl) {
      return undefined;
    }

    return () => URL.revokeObjectURL(manualPreviewUrl);
  }, [manualPreviewUrl]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (manualPreviewUrl) URL.revokeObjectURL(manualPreviewUrl);
      if (fullSizeImageUrl) URL.revokeObjectURL(fullSizeImageUrl);
    };
  }, [fullSizeImageUrl, manualPreviewUrl, previewUrl]);

  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (!hasUnsavedChangesRef.current) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  function resetAiEntry() {
    setImageFile(null);
    setPreviewUrl("");
    setReviewValues(null);
    setProcessingError("");
    setAiDirty(false);
  }

  function resetManualEntry() {
    setManualValues({ ...EMPTY_MANUAL_VALUES });
    setManualEntry(null);
    setManualFormKey((key) => key + 1);
    setManualImageFile(null);
    setManualPreviewUrl("");
    setManualDirty(false);
  }

  function handleTabChange(nextTab) {
    if (realEntriesMode && nextTab === "ai") return;
    if (nextTab === activeTab) {
      return;
    }

    if (!hasUnsavedChanges) {
      setActiveTab(nextTab);
      return;
    }

    setPendingTab(nextTab);
  }

  async function handleFileChange(event) {
    const [nextFile] = event.target.files ?? [];
    event.target.value = "";

    if (!nextFile) {
      return;
    }

    try {
      const previousUrl = previewUrl;
      const normalizedFile = await normalizeUploadedImage(nextFile);

      if (previousUrl) {
        URL.revokeObjectURL(previousUrl);
      }

      setImageFile(normalizedFile);
      setPreviewUrl(URL.createObjectURL(normalizedFile));
      setReviewValues(null);
      setProcessingError("");
      setAiDirty(false);
      setImageZoom(1);
      setImageRotation(0);
      setImageOffset({ x: 0, y: 0 });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Choose an image file to continue.";
      toast.error(message);
    }
  }

  async function handleManualImageChange(event) {
    const [nextFile] = event.target.files ?? [];
    event.target.value = "";

    if (!nextFile) {
      return;
    }

    try {
      const previousUrl = manualPreviewUrl;
      const normalizedFile = await normalizeUploadedImage(nextFile);

      if (previousUrl) {
        URL.revokeObjectURL(previousUrl);
      }

      setManualImageFile(normalizedFile);
      setManualPreviewUrl(URL.createObjectURL(normalizedFile));
      setImageZoom(1);
      setImageRotation(0);
      setImageOffset({ x: 0, y: 0 });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Choose an image file to continue.";
      toast.error(message);
    }
  }

  async function handleProcessImage() {
    if (!imageFile || isProcessing) {
      return;
    }

    setIsProcessing(true);
    setProcessingError("");
    setReviewValues(null);
    toast.info("Simulated: image processing started.");

    try {
      const extractedValues = await processLogbookImage(imageFile);
      setReviewValues(extractedValues);
      setAiDirty(false);
      toast.success(
        "Simulated: extraction complete. Review all fields; nothing is verified.",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Try again.";
      setProcessingError(message);
      toast.error(`Simulated: image processing failed. ${message}`);
    } finally {
      setIsProcessing(false);
    }
  }

  function handleConfirmAction() {
    const action = pendingAction;
    const nextTab = pendingTab;
    setPendingAction(null);
    setPendingTab(null);

    if (nextTab) {
      if (activeTab === "ai") {
        resetAiEntry();
      } else {
        resetManualEntry();
      }
      setActiveTab(nextTab);
      return;
    }

    if (action === "reprocess") {
      void handleProcessImage();
      return;
    }

    if (action === "discard") {
      resetAiEntry();
      toast.info("Simulated: review canceled. Nothing was submitted.");
      return;
    }

    if (action === "manual-discard" || action === "manual-reprocess") {
      resetManualEntry();
      toast.info(
        realEntriesMode
          ? "Manual entry changes cleared. Any saved draft remains in My Records."
          : "Simulated: manual entry cleared. Nothing was submitted.",
      );
    }
  }

  async function handleSaveDraft(values, source) {
    if (realEntriesMode && source === "manual") {
      const saved = manualEntry
        ? await updateEntry(manualEntry.id, values, manualEntry.version, {
            role,
            user,
            status: "draft",
          })
        : await createEntry(values, {
            logbookType: values.logbookType,
            status: "draft",
            source: "manual",
          });
      setManualEntry(saved);
      setManualValues(toFormValues(saved));
      toast.success("Draft saved.");
      return;
    }

    try {
      const draft = await createEntry(values, {
        logbookType: values.logbookType,
        status: "draft",
        source,
        submittedBy: user.name,
      });
      toast.success(`Simulated: draft ${draft.id} saved for ${user.name}.`);

      if (source === "manual") {
        resetManualEntry();
      } else {
        resetAiEntry();
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "The draft could not be saved.",
      );
    }
  }

  async function handleSubmitForApproval(values, source) {
    if (realEntriesMode && source === "manual") {
      const submission = await saveAndSubmitEntry(values, manualEntry, {
        role,
        user,
        source: "manual",
        onEntryChange: setManualEntry,
      });
      toast.success(`${submission.referenceNo} submitted for approval.`);
      resetManualEntry();
      return;
    }

    try {
      const submission = await createEntry(values, {
        logbookType: values.logbookType,
        status: "pending",
        source,
        submittedBy: user.name,
      });
      toast.success(
        `Simulated: ${submission.referenceNo} submitted for approval and is now Pending.`,
      );

      if (source === "manual") {
        resetManualEntry();
      } else {
        resetAiEntry();
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "The submission could not be created.",
      );
    }
  }

  const actionIsReprocess = pendingAction?.endsWith("reprocess") ?? false;
  const actionIsManual = pendingAction?.startsWith("manual-") ?? false;
  const confidenceMap = useMemo(() => {
    if (activeTab === "ai" && reviewValues) {
      return guessConfidenceMap(reviewValues);
    }

    return {};
  }, [activeTab, reviewValues]);

  return (
    <>
      <PageHeader
        title="New Entry"
        description={
          realEntriesMode
            ? "Create a submission by entering the details manually."
            : "Create a submission by scanning a photo or entering the details manually."
        }
      />

      <div className="mb-4 flex flex-wrap gap-2 rounded-md border border-border bg-card p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            disabled={realEntriesMode && tab.id === "ai"}
            className={[
              "rounded-md px-3 py-2 text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted",
            ].join(" ")}
            onClick={() => handleTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {realEntriesMode && (
        <p className="mb-4 text-sm text-muted-foreground" role="status">
          AI scanning is not available yet
        </p>
      )}

      {activeTab === "ai" ? (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(18rem,0.85fr)_minmax(0,1.15fr)]">
          <section
            aria-labelledby="photo-section-title"
            className="space-y-4 rounded-md border border-border bg-card p-4"
          >
            <div>
              <h2 id="photo-section-title" className="text-base font-semibold">
                Logbook photo
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Image preview stays in this browser session.
              </p>
            </div>

            <Input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture={isMobileCapture ? "environment" : undefined}
              aria-label="Choose a logbook photo"
              tabIndex={-1}
              className="hidden"
              onChange={handleFileChange}
            />

            {previewUrl ? (
              <div className="space-y-3">
                <div className="flex aspect-[4/3] min-h-48 items-center justify-center overflow-hidden rounded-md bg-muted">
                  <div className="relative h-full w-full overflow-hidden">
                    <img
                      src={previewUrl}
                      alt={`Preview of ${imageFile.name}`}
                      className="size-full object-contain transition-transform duration-150 ease-out"
                      style={{
                        transform: `translate(${imageOffset.x}px, ${imageOffset.y}px) rotate(${imageRotation}deg) scale(${imageZoom})`,
                        transformOrigin: "center center",
                      }}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setImageZoom((value) =>
                        Math.max(1, Number((value - 0.1).toFixed(1))),
                      )
                    }
                  >
                    <Minus aria-hidden="true" className="size-4" />
                    Zoom out
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setImageZoom((value) =>
                        Math.min(2.5, Number((value + 0.1).toFixed(1))),
                      )
                    }
                  >
                    <Plus aria-hidden="true" className="size-4" />
                    Zoom in
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setImageRotation((value) => (value + 90) % 360)
                    }
                  >
                    <RotateCw aria-hidden="true" className="size-4" />
                    Rotate
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setImageOffset({ x: 0, y: 0 })}
                  >
                    <RotateCcw aria-hidden="true" className="size-4" />
                    Reset view
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setFullSizeImageUrl(previewUrl)}
                  >
                    <Expand aria-hidden="true" className="size-4" />
                    Full size
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isProcessing}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload aria-hidden="true" />
                    Replace photo
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={isProcessing}
                    onClick={() => setPendingAction("discard")}
                  >
                    <Trash2 aria-hidden="true" />
                    Remove photo
                  </Button>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setImageOffset((current) => ({
                        ...current,
                        x: current.x - 12,
                      }))
                    }
                  >
                    <ChevronLeft aria-hidden="true" className="size-4" />
                    Pan left
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setImageOffset((current) => ({
                        ...current,
                        x: current.x + 12,
                      }))
                    }
                  >
                    Pan right
                    <ChevronRight aria-hidden="true" className="size-4" />
                  </Button>
                </div>
                <p
                  className="truncate text-sm font-medium"
                  title={imageFile.name}
                >
                  {imageFile.name}
                </p>
              </div>
            ) : (
              <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border bg-muted/30 px-5 text-center">
                <ImagePlus
                  aria-hidden="true"
                  className="size-8 text-muted-foreground"
                />
                <div>
                  <p className="text-sm font-medium">No photo selected</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Select a photo of a logbook page to preview it here.
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload aria-hidden="true" />
                  Choose photo
                </Button>
              </div>
            )}

            {imageFile && !reviewValues && (
              <Button
                type="button"
                className="w-full"
                disabled={isProcessing}
                onClick={handleProcessImage}
              >
                {isProcessing ? (
                  <LoaderCircle aria-hidden="true" className="animate-spin" />
                ) : (
                  <ImagePlus aria-hidden="true" />
                )}
                {isProcessing ? "Processing image..." : "Process Image"}
              </Button>
            )}

            {processingError && (
              <p className="text-sm text-destructive" role="alert">
                {processingError}
              </p>
            )}
          </section>

          <section aria-label="Review extracted logbook fields">
            {reviewValues ? (
              <EntryForm
                mode="review"
                logbookType={reviewValues.logbookType}
                initialValues={reviewValues}
                isProcessing={isProcessing}
                onCancel={() => setPendingAction("discard")}
                onReprocess={() => setPendingAction("reprocess")}
                onSaveDraft={(values) => handleSaveDraft(values, "ai")}
                onSubmit={(values) => handleSubmitForApproval(values, "ai")}
                onDirtyChange={setAiDirty}
                confidenceMap={confidenceMap}
              />
            ) : (
              <div className="flex min-h-48 flex-col justify-center rounded-md border border-border bg-card p-5">
                <h2 className="text-base font-semibold">Review fields</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {isProcessing
                    ? "Simulated processing is in progress..."
                    : "The editable review form will appear after simulated processing."}
                </p>
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(18rem,0.85fr)_minmax(0,1.15fr)]">
          <section className="space-y-4 rounded-md border border-border bg-card p-4">
            <div>
              <h2 className="text-base font-semibold">Optional attachment</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Attach a photo if you want to keep it with this manual entry.
              </p>
            </div>

            <Input
              ref={manualInputRef}
              type="file"
              accept="image/*"
              capture={isMobileCapture ? "environment" : undefined}
              aria-label="Attach an image for this manual entry"
              tabIndex={-1}
              className="hidden"
              onChange={handleManualImageChange}
            />

            {manualPreviewUrl ? (
              <div className="space-y-3">
                <div className="flex aspect-[4/3] min-h-48 items-center justify-center overflow-hidden rounded-md bg-muted">
                  <div className="relative h-full w-full overflow-hidden">
                    <img
                      src={manualPreviewUrl}
                      alt={`Attachment preview for ${manualImageFile?.name ?? "manual entry"}`}
                      className="size-full object-contain transition-transform duration-150 ease-out"
                      style={{
                        transform: `translate(${imageOffset.x}px, ${imageOffset.y}px) rotate(${imageRotation}deg) scale(${imageZoom})`,
                        transformOrigin: "center center",
                      }}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setImageZoom((value) =>
                        Math.max(1, Number((value - 0.1).toFixed(1))),
                      )
                    }
                  >
                    <Minus aria-hidden="true" className="size-4" />
                    Zoom out
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setImageZoom((value) =>
                        Math.min(2.5, Number((value + 0.1).toFixed(1))),
                      )
                    }
                  >
                    <Plus aria-hidden="true" className="size-4" />
                    Zoom in
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setImageRotation((value) => (value + 90) % 360)
                    }
                  >
                    <RotateCw aria-hidden="true" className="size-4" />
                    Rotate
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setFullSizeImageUrl(manualPreviewUrl)}
                  >
                    <Expand aria-hidden="true" className="size-4" />
                    Full size
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => manualInputRef.current?.click()}
                  >
                    <Upload aria-hidden="true" />
                    Replace image
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setManualPreviewUrl("");
                      setManualImageFile(null);
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border bg-muted/30 px-5 text-center">
                <ImagePlus
                  aria-hidden="true"
                  className="size-8 text-muted-foreground"
                />
                <div>
                  <p className="text-sm font-medium">No attachment</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    You can skip this and still submit a record manually.
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={() => manualInputRef.current?.click()}
                >
                  <Upload aria-hidden="true" />
                  Add attachment
                </Button>
              </div>
            )}
          </section>

          <section aria-label="Manual entry form">
            <EntryForm
              key={manualFormKey}
              mode={manualEntry ? "edit" : "create"}
              entryId={manualEntry?.id}
              version={manualEntry?.version}
              logbookType={manualEntry?.logbookType ?? manualValues.logbookType}
              initialValues={
                manualEntry
                  ? {
                      ...toFormValues(manualEntry),
                      status: manualEntry.status,
                    }
                  : manualValues
              }
              isProcessing={false}
              onCancel={() => setPendingAction("manual-discard")}
              onSaveDraft={(values) => handleSaveDraft(values, "manual")}
              onSubmit={(values) => handleSubmitForApproval(values, "manual")}
              onDirtyChange={setManualDirty}
              onReload={async () => {
                if (!manualEntry) return;
                const freshEntry = await getEntry(manualEntry.id);
                setManualEntry(freshEntry);
                setManualValues(toFormValues(freshEntry));
              }}
            />
          </section>
        </div>
      )}

      {fullSizeImageUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-5xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-sm font-medium">Image preview</span>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setFullSizeImageUrl("")}
              >
                Close
              </Button>
            </div>
            <div className="flex max-h-[80vh] items-center justify-center overflow-auto bg-muted/20 p-4">
              <img
                src={fullSizeImageUrl}
                alt="Full-size preview"
                className="max-h-[70vh] max-w-full object-contain"
                style={{
                  transform: `translate(${imageOffset.x}px, ${imageOffset.y}px) rotate(${imageRotation}deg) scale(${imageZoom})`,
                  transformOrigin: "center center",
                }}
              />
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 border-t border-border px-4 py-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setImageZoom((value) =>
                    Math.max(1, Number((value - 0.1).toFixed(1))),
                  )
                }
              >
                <Minus aria-hidden="true" className="size-4" />
                Zoom out
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setImageZoom((value) =>
                    Math.min(2.5, Number((value + 0.1).toFixed(1))),
                  )
                }
              >
                <Plus aria-hidden="true" className="size-4" />
                Zoom in
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setImageRotation((value) => (value + 90) % 360)}
              >
                <RotateCw aria-hidden="true" className="size-4" />
                Rotate
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setImageOffset({ x: 0, y: 0 })}
              >
                Reset
              </Button>
            </div>
          </div>
        </div>
      )}

      <AlertDialog
        open={Boolean(pendingAction || pendingTab)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingAction(null);
            setPendingTab(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingTab
                ? "Switch tabs?"
                : actionIsReprocess
                  ? actionIsManual
                    ? "Reset manual entry?"
                    : "Reprocess this photo?"
                  : actionIsManual
                    ? "Discard manual entry?"
                    : "Discard this review?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingTab
                ? "Switching tabs will discard the unsaved changes in this entry."
                : actionIsReprocess
                  ? actionIsManual
                    ? "Resetting this manual entry clears its current field values. Nothing has been saved."
                    : "Reprocessing replaces your current field corrections with new simulated, unverified values."
                  : actionIsManual
                    ? realEntriesMode && manualEntry
                      ? "This clears the unsaved changes. The saved draft remains in My Records."
                      : "This clears the manual entry values. Nothing has been saved."
                    : "This removes the photo and clears the current review fields. Nothing has been saved."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep reviewing</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAction}
              variant="destructive"
            >
              {pendingTab
                ? "Switch tabs"
                : actionIsReprocess
                  ? actionIsManual
                    ? "Reset entry"
                    : "Reprocess"
                  : actionIsManual
                    ? "Discard entry"
                    : "Discard review"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
