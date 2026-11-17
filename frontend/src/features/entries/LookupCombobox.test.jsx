import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LookupCombobox } from "./LookupCombobox";

describe("LookupCombobox", () => {
  afterEach(() => cleanup());
  beforeEach(() => vi.stubEnv("VITE_REAL_SERVICES", "auth"));

  it("preserves inactive and not-in-list selections with clear labels", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <LookupCombobox
        id="officeId"
        kind="office"
        label="Office"
        value="inactive-id"
        onChange={onChange}
        options={[
          {
            id: "inactive-id",
            code: "peso",
            fullName: "Treasury",
            aliases: [],
            active: false,
          },
        ]}
        getById={vi.fn()}
      />,
    );
    expect(screen.getByRole("combobox", { name: "Office" })).toHaveTextContent(
      "(inactive)",
    );

    rerender(
      <LookupCombobox
        id="officeId"
        kind="office"
        label="Office"
        value="mock-only-id"
        snapshot="Legacy Office"
        onChange={onChange}
        options={[]}
        getById={vi.fn()}
      />,
    );
    expect(screen.getByRole("combobox", { name: "Office" })).toHaveTextContent(
      "Legacy Office (not in list)",
    );
  });

  it("shows loading, empty, error, and retry states", async () => {
    const retry = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <LookupCombobox
        id="documentTypeId"
        kind="document type"
        label="Document type"
        value=""
        onChange={vi.fn()}
        options={[]}
        getById={vi.fn()}
        isLoading
      />,
    );
    await user.click(screen.getByRole("combobox", { name: "Document type" }));
    expect(screen.getByRole("status")).toHaveTextContent("Loading");

    rerender(
      <LookupCombobox
        id="documentTypeId"
        kind="document type"
        label="Document type"
        value=""
        onChange={vi.fn()}
        options={[]}
        getById={vi.fn()}
      />,
    );
    expect(
      screen.getAllByText("No document type available.").length,
    ).toBeGreaterThan(0);

    rerender(
      <LookupCombobox
        id="documentTypeId"
        kind="document type"
        label="Document type"
        value=""
        onChange={vi.fn()}
        options={[]}
        getById={vi.fn()}
        error={new Error("Lookup unavailable")}
        onRetry={retry}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Lookup unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("searches options in the browser", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <LookupCombobox
        id="officeId"
        kind="office"
        label="Office"
        value=""
        onChange={onChange}
        options={[
          {
            id: "a",
            code: "peso",
            fullName: "Treasury Office",
            aliases: ["treasury"],
            active: true,
          },
          {
            id: "b",
            code: "bfp",
            fullName: "Fire Bureau",
            aliases: [],
            active: true,
          },
        ]}
        getById={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("combobox", { name: "Office" }));
    await user.type(
      screen.getByRole("textbox", { name: "Search office" }),
      "fire",
    );
    expect(
      screen.getByRole("option", { name: /Fire Bureau/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /Treasury Office/ }),
    ).toBeNull();
  });
});
