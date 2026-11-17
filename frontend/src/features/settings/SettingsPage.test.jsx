import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAppSettings: vi.fn(),
  listOffices: vi.fn(),
  listDocumentTypes: vi.fn(),
  saveAppPreferences: vi.fn(),
}));

vi.mock("@/services/settingsService", () => ({
  getAppSettings: mocks.getAppSettings,
  saveAppPreferences: mocks.saveAppPreferences,
}));
vi.mock("@/services/officesService", () => ({
  listOffices: mocks.listOffices,
}));
vi.mock("@/services/documentTypesService", () => ({
  listDocumentTypes: mocks.listDocumentTypes,
}));

import { SettingsPage } from "./SettingsPage";

describe("SettingsPage lookup lists", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("loads inactive records on toggle without reloading preferences", async () => {
    const user = userEvent.setup();
    mocks.getAppSettings.mockResolvedValue({
      preferences: {
        dateFormat: "MMM d, yyyy",
        defaultExportFormat: "xlsx",
        includeReviewerComments: true,
        simulatedNotifications: true,
      },
      aiConfiguration: { mode: "Simulated extraction only" },
    });
    mocks.listOffices.mockImplementation(({ active = true } = {}) =>
      Promise.resolve(
        active
          ? [
              {
                id: "office-active",
                code: "peso",
                fullName: "",
                kind: "internal",
                aliases: [],
                active: true,
              },
            ]
          : [
              {
                id: "office-inactive",
                code: "old",
                fullName: "Old Office",
                kind: "external",
                aliases: ["former"],
                active: false,
              },
            ],
      ),
    );
    mocks.listDocumentTypes.mockImplementation(({ active = true } = {}) =>
      Promise.resolve(
        active
          ? [
              {
                id: "type-active",
                name: "Purchase request",
                aliases: [],
                logbookTypes: ["permit_certification"],
                active: true,
              },
            ]
          : [
              {
                id: "type-inactive",
                name: "Old type",
                aliases: ["legacy"],
                logbookTypes: ["permit_certification"],
                active: false,
              },
            ],
      ),
    );

    render(<SettingsPage />);
    await screen.findByText("PESO");
    await user.click(
      screen.getByRole("switch", { name: /include inactive lookup values/i }),
    );

    await screen.findByText("Old Office");
    expect(screen.getByText(/former/)).toBeInTheDocument();
    expect(screen.getByText(/Old type/)).toBeInTheDocument();
    await waitFor(() => expect(mocks.getAppSettings).toHaveBeenCalledOnce());
    expect(mocks.listOffices).toHaveBeenCalledWith({ active: false });
    expect(mocks.listDocumentTypes).toHaveBeenCalledWith({ active: false });
  });
});
