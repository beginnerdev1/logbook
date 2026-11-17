import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listDocumentTypes } from "@/services/documentTypesService";
import { listOffices } from "@/services/officesService";
import { MOCK_ENTRIES } from "@/data/mockEntries";
import { toFormValues } from "@/lib/entryMapper";
import { EntryForm } from "./EntryForm";
import { EntryDetailsDialog } from "./EntryDetailsDialog";

vi.stubEnv("VITE_USE_MOCK", "true");

describe("EntryForm", () => {
  let officeId;
  let documentTypeId;
  let purchaseRequestId;
  let certificationId;

  afterEach(() => cleanup());

  beforeEach(async () => {
    const [office] = await listOffices();
    const documentTypes = await listDocumentTypes({
      logbookType: "permit_certification",
    });
    officeId = office.id;
    documentTypeId = documentTypes.find(
      (item) => item.name === "notice of award",
    ).id;
    purchaseRequestId = documentTypes.find(
      (item) => item.name === "purchase request",
    ).id;
    certificationId = documentTypes.find(
      (item) => item.name === "certification",
    ).id;
  });

  it("accepts the minimum fields for a draft and blocks submit until the full schema passes", async () => {
    const onSaveDraft = vi.fn();
    const onSubmit = vi.fn();

    render(
      <EntryForm
        mode="create"
        logbookType="permit_certification"
        initialValues={{
          logbookType: "permit_certification",
          entryDate: "2026-07-02",
          name: "Draft operator",
          officeId,
          documentTypeId,
        }}
        onSaveDraft={onSaveDraft}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /save draft/i }));

    await waitFor(() => {
      expect(onSaveDraft).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(screen.getByText(/particulars is required/i)).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("converts peso input to centavos and preserves date-only strings", async () => {
    const onSubmit = vi.fn();

    render(
      <EntryForm
        mode="create"
        logbookType="petty_cash"
        initialValues={{
          logbookType: "petty_cash",
          entryDate: "2026-07-02",
          name: "Cash recipient",
          particulars: "Office supplies",
          officeId,
          amountCentavos: "1,234.56",
        }}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.submit(document.querySelector("form"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        entryDate: "2026-07-02",
        amountCentavos: 123456,
        logbookType: "petty_cash",
      }),
    );
  });

  it("shows a clear conflict message on stale edit submissions", async () => {
    const onSubmit = vi.fn().mockRejectedValue({
      status: 409,
      code: "VERSION_CONFLICT",
      message: "This entry was changed by someone else",
    });

    render(
      <EntryForm
        mode="edit"
        entryId="entry-123"
        version={1}
        logbookType="permit_certification"
        initialValues={{
          logbookType: "permit_certification",
          entryDate: "2026-07-02",
          name: "Draft operator",
          particulars: "Submitted with required fields",
          officeId,
          documentTypeId,
        }}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.submit(document.querySelector("form"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        logbookType: "permit_certification",
        entryDate: "2026-07-02",
        name: "Draft operator",
      }),
    );
    expect(
      screen.getByText(/this entry was changed by someone else/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });

  it("maps API validation details onto configured form fields", async () => {
    const onSubmit = vi.fn().mockRejectedValue({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "The entry is invalid.",
      details: [{ field: "name", message: "Name is already in use." }],
    });

    render(
      <EntryForm
        mode="create"
        logbookType="permit_certification"
        initialValues={{
          logbookType: "permit_certification",
          entryDate: "2026-07-02",
          name: "Draft operator",
          particulars: "Complete details",
          officeId,
          documentTypeId,
        }}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.submit(document.querySelector("form"));
    expect(await screen.findByText("Name is already in use.")).toBeInTheDocument();
    expect(document.getElementById("name")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("maps nested details validation paths to their configured form field", async () => {
    const travelEntry = MOCK_ENTRIES.find(
      (entry) => entry.logbookType === "travel_order",
    );
    const onSubmit = vi.fn().mockRejectedValue({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid entry.",
      details: [
        { field: "details.purposeOfTravel", message: "Use a clearer purpose." },
      ],
    });

    render(
      <EntryForm
        mode="create"
        logbookType="travel_order"
        initialValues={{
          ...toFormValues(travelEntry),
          logbookType: "travel_order",
        }}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.submit(document.querySelector("form"));
    expect(await screen.findByText("Use a clearer purpose.")).toBeInTheDocument();
    expect(document.getElementById("purposeOfTravel")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it.each([
    [403, "You do not have permission to change this entry."],
    [404, "This entry is no longer available."],
  ])("shows a friendly message for HTTP %s", async (status, message) => {
    const onSubmit = vi.fn().mockRejectedValue({ status });

    render(
      <EntryForm
        mode="create"
        logbookType="permit_certification"
        initialValues={{
          logbookType: "permit_certification",
          entryDate: "2026-07-02",
          name: "Draft operator",
          particulars: "Complete details",
          officeId,
          documentTypeId,
        }}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.submit(document.querySelector("form"));
    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it("prevents a second submit while the first request is pending", async () => {
    let finishRequest;
    const onSubmit = vi.fn(
      () =>
        new Promise((resolve) => {
          finishRequest = resolve;
        }),
    );

    render(
      <EntryForm
        mode="create"
        logbookType="permit_certification"
        initialValues={{
          logbookType: "permit_certification",
          entryDate: "2026-07-02",
          name: "Draft operator",
          particulars: "Complete details",
          officeId,
          documentTypeId,
        }}
        onSubmit={onSubmit}
      />,
    );

    const form = document.querySelector("form");
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
    finishRequest();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Submit" })).toBeEnabled(),
    );
  });

  it("submits certification without office or amount fields", async () => {
    const onSubmit = vi.fn();
    render(
      <EntryForm
        mode="create"
        logbookType="permit_certification"
        initialValues={{
          logbookType: "permit_certification",
          entryDate: "2026-07-02",
          name: "Certification",
          particulars: "Certificate of service",
          documentTypeId: certificationId,
        }}
        onSubmit={onSubmit}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByLabelText("Office")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Amount")).not.toBeInTheDocument();
    });
    fireEvent.submit(document.querySelector("form"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty("officeId");
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty("amountCentavos");
  });

  it("keeps stored office and amount values visible in entry details", () => {
    render(
      <EntryDetailsDialog
        entry={{
          id: "historical-certification",
          logbookType: "permit_certification",
          status: "pending",
          source: "manual",
          entryDate: "2026-07-02",
          name: "Historical certification",
          documentTypeName: "certification",
          officeName: "PESO",
          amountCentavos: 325,
          submittedBy: { name: "Jordan Lee" },
        }}
        role="user"
        user={{ name: "Jordan Lee" }}
        canEdit={false}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("PESO")).toBeInTheDocument();
    expect(screen.getByText("₱3.25")).toBeInTheDocument();
  });

  it("requires an amount for purchase requests", async () => {
    const onSubmit = vi.fn();
    render(
      <EntryForm
        mode="create"
        logbookType="permit_certification"
        initialValues={{
          logbookType: "permit_certification",
          entryDate: "2026-07-02",
          name: "Purchase request",
          particulars: "Office supplies",
          officeId,
          documentTypeId: purchaseRequestId,
        }}
        onSubmit={onSubmit}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("combobox", { name: "Document type" }),
      ).toHaveTextContent("purchase request");
    });
    fireEvent.submit(document.querySelector("form"));
    await waitFor(() => {
      expect(document.getElementById("amountCentavos")).toHaveAttribute(
        "aria-invalid",
        "true",
      );
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("confirms and removes values hidden by a document-type change", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <EntryForm
        mode="edit"
        entryId="permit-switch"
        version={0}
        logbookType="permit_certification"
        initialValues={{
          logbookType: "permit_certification",
          entryDate: "2026-07-02",
          name: "Certification",
          particulars: "Certificate",
          officeId,
          amountCentavos: "20.00",
          documentTypeId: purchaseRequestId,
        }}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "Document type" }));
    await user.click(
      await screen.findByRole("option", { name: "certification" }),
    );
    expect(confirm).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(screen.queryByLabelText("Office")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Amount")).not.toBeInTheDocument();
    });
    fireEvent.submit(document.querySelector("form"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty("officeId");
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty("amountCentavos");
    confirm.mockRestore();
  });

  it("confirms type changes and submits no obsolete type-specific values", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <EntryForm
        mode="edit"
        entryId="entry-type-change"
        version={0}
        logbookType="permit_certification"
        initialValues={{
          logbookType: "permit_certification",
          status: "rejected",
          entryDate: "2026-07-02",
          name: "Jordan Lee",
          particulars: "Old details",
          officeId,
          documentTypeId,
          documentNumber: "DOC-OLD",
          tracking: { status: "returned", returnedTime: "16:43" },
          reviewerComment: "Please verify the source details.",
        }}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(document.getElementById("name"), {
      target: { value: "Jordan Lee Updated" },
    });
    await user.click(screen.getByRole("combobox", { name: "Logbook type" }));
    await user.click(await screen.findByRole("option", { name: "Petty Cash" }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByText("Previous feedback")).toBeInTheDocument();
    fireEvent.change(document.getElementById("amountCentavos"), {
      target: { value: "15.00" },
    });
    fireEvent.submit(document.querySelector("form"));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        logbookType: "petty_cash",
        name: "Jordan Lee Updated",
        entryDate: "2026-07-02",
      }),
    );
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty("documentNumber");
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty("tracking");
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty("documentTypeId");
    confirm.mockRestore();
  });
});
