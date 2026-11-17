const DEFAULT_BASE_URL = import.meta.env.VITE_API_URL ?? "/api";

export function isRealServiceEnabled(serviceName) {
  const configured = (import.meta.env.VITE_REAL_SERVICES ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return (
    configured.includes("all") ||
    configured.includes(String(serviceName).toLowerCase())
  );
}

function getBaseUrl() {
  return (DEFAULT_BASE_URL || "/api").replace(/\/$/, "");
}

function getUrl(path) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getBaseUrl()}${normalizedPath}`;
}

function toJsonBody(body) {
  if (body === undefined || body === null) {
    return undefined;
  }

  if (
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof URLSearchParams ||
    typeof body === "string"
  ) {
    return body;
  }

  return JSON.stringify(body);
}

function normalizeError(response, payload) {
  const code = payload?.code || payload?.errorCode || `HTTP_${response.status}`;
  const retryAfter = response.headers.get("Retry-After");

  let message =
    payload?.message ||
    payload?.error ||
    `Request failed with status ${response.status}`;

  if (code === "INVALID_CREDENTIALS") {
    message = "Invalid email or password.";
  } else if (code === "SESSION_EXPIRED") {
    message = "Your session has expired. Please sign in again.";
  } else if (code === "RATE_LIMITED") {
    const retryWindow = retryAfter
      ? ` Please retry in ${retryAfter} seconds.`
      : " Please try again shortly.";
    message = `Too many attempts.${retryWindow}`;
  } else if (response.status >= 500 || response.status === 0) {
    message = "Cannot reach the server.";
  }

  return {
    status: response.status,
    code,
    message,
    details: payload?.details ?? payload ?? null,
  };
}

async function parseResponse(response) {
  if (response.status === 204) return null;

  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  const text = await response.text();
  return text ? text : null;
}

async function request(
  path,
  {
    method = "GET",
    headers = {},
    body,
    signal,
    timeoutMs = 15000,
    ...options
  } = {},
) {
  const isJsonBody =
    body !== undefined &&
    typeof body === "object" &&
    !(body instanceof FormData) &&
    !(body instanceof Blob) &&
    !(body instanceof URLSearchParams);

  const requestHeaders = {
    Accept: "application/json",
    ...headers,
  };

  if (isJsonBody && !requestHeaders["Content-Type"]) {
    requestHeaders["Content-Type"] = "application/json";
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const handleAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", handleAbort, { once: true });
    }
  }

  try {
    let response;
    try {
      response = await fetch(getUrl(path), {
        method,
        headers: requestHeaders,
        body: toJsonBody(body),
        credentials: "include",
        signal: controller.signal,
        ...options,
      });
    } catch {
      throw {
        status: 0,
        code: "NETWORK_ERROR",
        message: "Cannot reach the server.",
        details: null,
      };
    }

    const payload = await parseResponse(response);

    if (response.status === 401 && payload?.code === "SESSION_EXPIRED") {
      const redirectTarget = `${window.location.pathname}${window.location.search}`;
      if (typeof window !== "undefined" && !isRealServiceEnabled("auth")) {
        sessionStorage.setItem("logbook-return-url", redirectTarget);
      }
      window.dispatchEvent(new CustomEvent("logbook:unauthorized"));
    }

    if (!response.ok) {
      throw normalizeError(response, payload);
    }

    return payload;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw {
        status: 408,
        code: "REQUEST_TIMEOUT",
        message: "The request timed out or was cancelled.",
        details: null,
      };
    }

    if (error && typeof error === "object" && "status" in error) {
      throw error;
    }

    throw {
      status: 0,
      code: "NETWORK_ERROR",
      message: "Cannot reach the server.",
      details: null,
    };
  } finally {
    clearTimeout(timeoutId);
    if (signal) {
      signal.removeEventListener("abort", handleAbort);
    }
  }
}

export const apiClient = {
  get: (path, options) => request(path, { ...options, method: "GET" }),
  post: (path, body, options) =>
    request(path, { ...options, method: "POST", body }),
  put: (path, body, options) =>
    request(path, { ...options, method: "PUT", body }),
  patch: (path, body, options) =>
    request(path, { ...options, method: "PATCH", body }),
  del: (path, options) => request(path, { ...options, method: "DELETE" }),
};
