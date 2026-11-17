import { MOCK_ENTRIES } from "@/data/mockEntries";
import { toFormValues } from "@/lib/entryMapper";

const SIMULATED_PROCESSING_DELAY = 900;

export async function processLogbookImage(imageFile) {
  if (!imageFile?.type?.startsWith("image/")) {
    throw new Error("Choose an image file before processing.");
  }

  await new Promise((resolve) => {
    window.setTimeout(resolve, SIMULATED_PROCESSING_DELAY);
  });

  const sampleEntry = MOCK_ENTRIES.find(
    (entry) =>
      entry.logbookType === "permit_certification" && entry.source === "ai",
  );
  return {
    ...toFormValues(sampleEntry),
    logbookType: sampleEntry.logbookType,
  };
}
