import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { RoleContext } from "@/contexts/roleContext";
import { ReportsPage } from "@/features/reports/ReportsPage";
import { SettingsPage } from "@/features/settings/SettingsPage";

vi.stubEnv("VITE_USE_MOCK", "true");
vi.mock("xlsx", () => ({
  utils: {
    aoa_to_sheet: () => ({}),
    book_new: () => ({}),
    book_append_sheet: () => {},
  },
  writeFile: () => {},
}));

const adminContext = {
  role: "admin",
  user: {
    id: "USR-001",
    name: "Admin Demo",
    sampleOwnerName: "Admin Demo",
  },
};

afterEach(() => cleanup());

describe("entry reports and settings lookups", () => {
  it("shows the development mock-data note", async () => {
    render(
      <MemoryRouter>
        <RoleContext.Provider value={adminContext}>
          <ReportsPage />
        </RoleContext.Provider>
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(
        "Development only: this area still uses mock data until Part C.",
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("table", {
        name: "Filtered report entry preview",
      }),
    ).toBeInTheDocument();
  });

  it("shows the cap message when a low limit truncates the 40 mock rows", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <RoleContext.Provider value={adminContext}>
          <ReportsPage maxExportRows={30} />
        </RoleContext.Provider>
      </MemoryRouter>,
    );

    await screen.findByText("Preview: 40 matching entries");
    await user.click(screen.getByRole("button", { name: "Export Excel" }));
    expect(
      await screen.findByText("Export limited to 30 of 40 matching entries."),
    ).toBeInTheDocument();
  });

  it("shows read-only office and document type lists instead of categories", async () => {
    render(<SettingsPage />);

    expect(
      await screen.findByRole("heading", { name: "Offices" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Document types" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Record categories")).not.toBeInTheDocument();
    expect(screen.getByText("purchase request")).toBeInTheDocument();
    expect(screen.getByText("PESO")).toBeInTheDocument();
  });
});
