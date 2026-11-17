export const API_ERROR_CODES = Object.freeze({
  VALIDATION_ERROR: "VALIDATION_ERROR",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  VERSION_CONFLICT: "VERSION_CONFLICT",
  INVALID_STATE: "INVALID_STATE",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
});

export class ApiError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function validationError(error) {
  const details =
    error.issues?.flatMap((issue) => {
      if (issue.code === "unrecognized_keys") {
        return issue.keys.map((key) => ({
          field: [...issue.path, key].join("."),
          message: "Unrecognized field.",
        }));
      }
      return [{ field: issue.path.join("."), message: issue.message }];
    }) ?? null;
  return new ApiError(
    400,
    API_ERROR_CODES.VALIDATION_ERROR,
    "Request validation failed.",
    details,
  );
}
