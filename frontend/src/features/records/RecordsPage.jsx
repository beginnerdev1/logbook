import { EntriesList } from "@/features/entries/EntriesList";

export function RecordsPage() {
  return (
    <EntriesList
      mode="all"
      title="Records"
      description="Search, filter, and review logbook entries."
    />
  );
}
