import { exportEntries } from "@/services/entriesService";
import { listUsers } from "@/services/usersService";

const MOCK_REQUEST_DELAY = 250;
let backups = [];
let nextBackupNumber = 1;

function waitForMockRequest() {
  return new Promise((resolve) => setTimeout(resolve, MOCK_REQUEST_DELAY));
}

function describeBackup(backup) {
  const {
    id,
    filename,
    createdAt,
    recordCount,
    userCount,
    sizeBytes,
    lastRestoredAt,
  } = backup;

  return {
    id,
    filename,
    createdAt,
    recordCount,
    userCount,
    sizeBytes,
    lastRestoredAt,
  };
}

export async function listBackups() {
  await waitForMockRequest();
  return backups.map(describeBackup);
}

export async function createSampleBackup() {
  const [{ items: records }, users] = await Promise.all([
    exportEntries(),
    listUsers(),
  ]);
  const snapshot = {
    label: "Simulated sample backup",
    createdAt: new Date().toISOString(),
    records,
    users,
  };
  const filename = `logbook-sample-backup-${String(nextBackupNumber).padStart(3, "0")}.json`;
  const sizeBytes = new TextEncoder().encode(JSON.stringify(snapshot)).length;
  const backup = {
    id: `BKP-${String(nextBackupNumber).padStart(3, "0")}`,
    filename,
    createdAt: snapshot.createdAt,
    recordCount: records.length,
    userCount: users.length,
    sizeBytes,
    lastRestoredAt: null,
    snapshot,
  };

  nextBackupNumber += 1;
  backups = [backup, ...backups];
  return describeBackup(backup);
}

function findBackup(backupId) {
  const backup = backups.find((item) => item.id === backupId);

  if (!backup) {
    throw new Error("The sample backup could not be found.");
  }

  return backup;
}

export async function downloadSampleBackup(backupId) {
  await waitForMockRequest();
  const backup = findBackup(backupId);
  const file = new Blob([JSON.stringify(backup.snapshot, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = backup.filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return backup.filename;
}

export async function simulateBackupRestore(backupId) {
  await waitForMockRequest();
  const backup = findBackup(backupId);
  backup.lastRestoredAt = new Date().toISOString();
  return describeBackup(backup);
}
