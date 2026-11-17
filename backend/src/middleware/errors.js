import { ApiError, API_ERROR_CODES } from "../utils/apiError.js";

export function errorHandler(error, _req, res, next) {
  if (res.headersSent) return next(error);

  const status =
    error.name === "CastError"
      ? 400
      : Number.isInteger(error.status)
        ? error.status
        : 500;
  const knownError = error instanceof ApiError;
  const entryConflictCodes = [
    API_ERROR_CODES.VERSION_CONFLICT,
    API_ERROR_CODES.INVALID_STATE,
  ];
  const code =
    status === 413
      ? API_ERROR_CODES.PAYLOAD_TOO_LARGE
      : status === 409 && entryConflictCodes.includes(error.code)
      ? error.code
      : knownError
        ? error.code
        : status === 400 || error.name === "CastError"
          ? API_ERROR_CODES.VALIDATION_ERROR
          : status === 404
            ? API_ERROR_CODES.NOT_FOUND
            : status === 409
              ? API_ERROR_CODES.CONFLICT
              : "INTERNAL_SERVER_ERROR";
  const message = knownError
    ? error.message
    : status === 413
      ? "Request body is too large."
      : status === 400 || error.name === "CastError"
      ? "Request validation failed."
      : "An unexpected server error occurred.";
  const details = knownError ? error.details : null;

  res.status(status).json({ status, code, message, details });
}
