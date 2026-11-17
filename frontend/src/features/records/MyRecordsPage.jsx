import { EntriesList } from "@/features/entries/EntriesList";

export function MyRecordsPage() {
  return (
    <EntriesList
      mode="own"
      title="My Records"
      description="Track your draft, pending, and approved submissions."
    />
  );
}
