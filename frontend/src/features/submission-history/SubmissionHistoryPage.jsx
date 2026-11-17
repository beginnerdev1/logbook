import { EntriesList } from "@/features/entries/EntriesList";

export function SubmissionHistoryPage() {
  return (
    <EntriesList
      mode="history"
      title="Submission History"
      description="Review submitted entries and their current status."
    />
  );
}
