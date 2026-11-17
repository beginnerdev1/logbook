import { EntriesList } from "@/features/entries/EntriesList";
import { DevOnlyMockNote } from "@/components/shared/DevOnlyMockNote";

export function ApprovalsPage() {
  return (
    <>
      <DevOnlyMockNote />
      <EntriesList
        mode="pending"
        title="Approvals"
        description="Review pending entries and record a reviewer comment."
      />
    </>
  );
}
