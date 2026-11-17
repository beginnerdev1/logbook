import { PageHeader } from "@/components/shared/PageHeader";

export function WorkspacePage({ item }) {
  return (
    <>
      <PageHeader
        title={item.label}
        description="Workspace overview for the selected section."
      />
      <section className="max-w-3xl rounded-md border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Preview only</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This section will be implemented in a later stage. No records are
          loaded or saved here.
        </p>
      </section>
    </>
  );
}
