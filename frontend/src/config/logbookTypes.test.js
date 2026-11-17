import { describe, expect, it } from "vitest";
import {
  LOGBOOK_TYPES as FRONTEND_LOGBOOK_TYPES,
  resolveFields as resolveFrontendFields,
  validateFieldRules as validateFrontendRules,
} from "./logbookTypes.js";
import {
  LOGBOOK_TYPES as BACKEND_LOGBOOK_TYPES,
  resolveFields as resolveBackendFields,
  validateFieldRules as validateBackendRules,
} from "../../../backend/src/shared/logbookTypes.js";

describe("shared logbook type config", () => {
  it("matches the backend config except for the required header comment", () => {
    expect(FRONTEND_LOGBOOK_TYPES).toEqual(BACKEND_LOGBOOK_TYPES);
  });

  it("keeps field resolution and validation in parity", () => {
    const documentType = {
      fieldRules: { officeId: "hidden", amountCentavos: "required" },
    };
    expect(resolveFrontendFields("permit_certification", documentType)).toEqual(
      resolveBackendFields("permit_certification", documentType),
    );
    expect(
      validateFrontendRules("permit_certification", documentType.fieldRules),
    ).toEqual(
      validateBackendRules("permit_certification", documentType.fieldRules),
    );
  });
});
