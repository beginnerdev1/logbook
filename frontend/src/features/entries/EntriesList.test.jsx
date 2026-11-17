import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const { listEntriesMock } = vi.hoisted(() => ({
  listEntriesMock: vi.fn(),
}));

vi.mock("@/hooks/useRole", () => ({
  useRole: () => ({
    role: "user",
    user: {
      id: "000000000000000000000101",
      name: "Signed-in user",
    },
  }),
}));

vi.mock("@/services/entriesService", () => ({
  listEntries: listEntriesMock,
  getEntry: vi.fn(),
  getEntryHistory: vi.fn().mockResolvedValue([]),
  deleteDraftEntry: vi.fn(),
  reviewEntry: vi.fn(),
  saveAndSubmitEntry: vi.fn(),
  submitEntry: vi.fn(),
  updateEntry: vi.fn(),
}));

vi.mock("@/services/officesService", () => ({
  listOffices: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/services/documentTypesService", () => ({
  listDocumentTypes: vi.fn().mockResolvedValue([]),
}));

const { EntriesList } = await import("./EntriesList");

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function listResult(name) {
  return {
    items: [
      {
        id: name,
        logbookType: "petty_cash",
        entryDate: "2026-10-14",
        name,
        status: "pending",
        source: "manual",
      },
    ],
    total: 1,
    page: 1,
    pageSize: 10,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("EntriesList request ordering", () => {
  it("ignores an outdated page response after a newer search response", async () => {
    vi.stubEnv("VITE_REAL_SERVICES", "");
    const first = deferred();
    const second = deferred();
    listEntriesMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    render(
      <MemoryRouter initialEntries={["/my-records"]}>
        <Routes>
          <Route
            path="*"
            element={
              <EntriesList mode="own" title="My Records" description="" />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(listEntriesMock).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("Search entries"), {
      target: { value: "new" },
    });
    await waitFor(() => expect(listEntriesMock).toHaveBeenCalledTimes(2), {
      timeout: 1500,
    });

    await act(async () => second.resolve(listResult("New result")));
    expect(await screen.findByText("New result")).toBeInTheDocument();

    await act(async () => first.resolve(listResult("Old result")));
    expect(screen.queryByText("Old result")).not.toBeInTheDocument();
    expect(screen.getByText("New result")).toBeInTheDocument();
  });
});
