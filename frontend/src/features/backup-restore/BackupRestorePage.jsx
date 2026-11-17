import { useEffect, useState } from "react";
import { ArchiveRestore, Download, Plus } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/shared/DataTable";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
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
import {
  createSampleBackup,
  downloadSampleBackup,
  listBackups,
  simulateBackupRestore,
} from "@/services/backupService";

function formatDateTime(value) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatBytes(value) {
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} KB`;
}

const BACKUP_COLUMNS = [
  { accessorKey: "id", header: "Backup ID" },
  {
    accessorKey: "createdAt",
    header: "Created",
    cell: ({ row }) => formatDateTime(row.original.createdAt),
  },
  { accessorKey: "filename", header: "File name" },
  { accessorKey: "recordCount", header: "Records" },
  { accessorKey: "userCount", header: "Users" },
  {
    accessorKey: "sizeBytes",
    header: "Size",
    cell: ({ row }) => formatBytes(row.original.sizeBytes),
  },
  {
    accessorKey: "lastRestoredAt",
    header: "Last restore",
    cell: ({ row }) =>
      row.original.lastRestoredAt
        ? formatDateTime(row.original.lastRestoredAt)
        : "Never",
  },
  {
    id: "actions",
    header: "Actions",
    enableSorting: false,
    cell: ({ row, table }) => {
      const { onDownload, onRestore } = table.options.meta ?? {};
      return (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Download backup ${row.original.id}`}
            onClick={() => onDownload?.(row.original)}
          >
            <Download aria-hidden="true" />
            Download
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Restore backup ${row.original.id}`}
            onClick={() => onRestore?.(row.original)}
          >
            <ArchiveRestore aria-hidden="true" />
            Restore
          </Button>
        </div>
      );
    },
  },
];

export function BackupRestorePage() {
  const [backups, setBackups] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [restoreTarget, setRestoreTarget] = useState(null);

  useEffect(() => {
    let isActive = true;

    listBackups()
      .then((items) => {
        if (isActive) {
          setBackups(items);
          setLoadError("");
        }
      })
      .catch(() => {
        if (isActive) setLoadError("Sample backup history could not be loaded.");
      })
      .finally(() => {
        if (isActive) setIsLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [reloadKey]);

  function reloadBackups() {
    setIsLoading(true);
    setLoadError("");
    setReloadKey((key) => key + 1);
  }

  async function handleCreateBackup() {
    setIsCreating(true);

    try {
      const backup = await createSampleBackup();
      toast.success(
        `Simulated: created a sample backup with ${backup.recordCount} records and ${backup.userCount} users.`,
      );
      reloadBackups();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "The sample backup could not be created.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDownload(backup) {
    try {
      const filename = await downloadSampleBackup(backup.id);
      toast.success(`Simulated: downloaded ${filename}.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "The sample backup could not be downloaded.",
      );
    }
  }

  async function handleRestore() {
    if (!restoreTarget) return;

    try {
      const restored = await simulateBackupRestore(restoreTarget.id);
      setRestoreTarget(null);
      toast.success(
        `Simulated: ${restored.id} restore preview complete; live data was not changed.`,
      );
      reloadBackups();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "The sample restore could not be completed.",
      );
    }
  }

  const tableMeta = {
    onDownload: handleDownload,
    onRestore: setRestoreTarget,
  };

  return (
    <>
      <PageHeader
        title="Backup & Restore"
        description="Create and download sample snapshots or preview a simulated restore."
      />
      <p className="mb-4 text-xs text-muted-foreground">
        Sample data only · Restore never changes live records or users.
      </p>
      <div className="mb-4 flex justify-end">
        <Button type="button" disabled={isCreating} onClick={handleCreateBackup}>
          <Plus aria-hidden="true" />
          {isCreating ? "Creating..." : "Create sample backup"}
        </Button>
      </div>
      <section className="overflow-hidden rounded-md border border-border bg-card">
        <DataTable
          columns={BACKUP_COLUMNS}
          data={backups}
          meta={tableMeta}
          isLoading={isLoading}
          error={loadError}
          onRetry={reloadBackups}
          emptyMessage="No sample backups have been created yet."
          caption="Simulated sample backup history"
        />
      </section>

      <AlertDialog
        open={Boolean(restoreTarget)}
        onOpenChange={(open) => {
          if (!open) setRestoreTarget(null);
        }}
      >
        <AlertDialogContent>
          {restoreTarget && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Restore sample backup?</AlertDialogTitle>
                <AlertDialogDescription>
                  {restoreTarget.filename} will be used for a simulated restore preview only.
                  Current sample data will not be replaced.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleRestore} variant="destructive">
                  Confirm simulated restore
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}