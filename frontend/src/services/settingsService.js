const DEFAULT_PREFERENCES = Object.freeze({
  dateFormat: "MMM d, yyyy",
  defaultExportFormat: "xlsx",
  includeReviewerComments: true,
  simulatedNotifications: true,
});

const DEFAULT_AI_CONFIGURATION = Object.freeze({
  status: "Not connected",
  mode: "Simulated extraction only",
});

const MOCK_REQUEST_DELAY = 180;
let preferences = { ...DEFAULT_PREFERENCES };

function waitForMockRequest() {
  return new Promise((resolve) => setTimeout(resolve, MOCK_REQUEST_DELAY));
}

function createSnapshot() {
  return {
    preferences: { ...preferences },
    aiConfiguration: { ...DEFAULT_AI_CONFIGURATION },
  };
}

export async function getAppSettings() {
  await waitForMockRequest();
  return createSnapshot();
}

export async function saveAppPreferences(nextPreferences) {
  await waitForMockRequest();
  preferences = {
    ...preferences,
    dateFormat: nextPreferences.dateFormat,
    defaultExportFormat: nextPreferences.defaultExportFormat,
    includeReviewerComments: Boolean(nextPreferences.includeReviewerComments),
    simulatedNotifications: Boolean(nextPreferences.simulatedNotifications),
  };
  return createSnapshot();
}
