import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useRole", () => ({
  useRole: () => ({
    role: "user",
    user: {
      id: "000000000000000000000101",
      name: "Signed-in user",
    },
  }),
}));

const { AIProcessingPage } = await import("./AIProcessingPage");

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("New Entry AI tab", () => {
  it("disables AI scanning and shows the notice for real entries", () => {
    vi.stubEnv("VITE_REAL_SERVICES", "entries");
    render(<AIProcessingPage />);

    expect(
      screen.getByRole("button", { name: "Scan Photo (AI)" }),
    ).toBeDisabled();
    expect(
      screen.getByText("AI scanning is not available yet"),
    ).toBeInTheDocument();
  });

  it("keeps the AI tab enabled when entries use mocks", () => {
    vi.stubEnv("VITE_REAL_SERVICES", "");
    render(<AIProcessingPage />);

    expect(
      screen.getByRole("button", { name: "Scan Photo (AI)" }),
    ).toBeEnabled();
    expect(
      screen.queryByText("AI scanning is not available yet"),
    ).not.toBeInTheDocument();
  });
});
