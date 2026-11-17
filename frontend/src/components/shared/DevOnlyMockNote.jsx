export function DevOnlyMockNote() {
  if (!import.meta.env.DEV) return null;

  return (
    <p className="mb-4 text-xs text-muted-foreground">
      Development only: this area still uses mock data until Part C.
    </p>
  );
}
