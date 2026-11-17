# Logbook API Contract

This contract describes the JSON API to replace the frontend's mock adapter. The configured base URL is `VITE_API_URL` (default `/api`); Vite proxies `/api` to `VITE_API_PROXY_TARGET` (default `http://localhost:3001`). Requests use cookie credentials.

## Shared Rules

- API entity IDs are lowercase 24-character hexadecimal strings.
- Roles are `admin` and `user`; the server is authoritative for authorization.
- Entry statuses are `draft`, `pending`, `approved`, `rejected`, and `failed`.
- Entry sources are `ai`, `manual`, and `import`.
- Date-only fields (`entryDate`, `travelStartDate`, `travelEndDate`) are `YYYY-MM-DD` strings. Timestamps are ISO 8601 strings.
- Amounts are non-negative integer centavos in requests and responses.
- Entry requests use `officeId` and `documentTypeId`; clients never send `officeName` or `documentTypeName`. The API resolves those names in responses.
- A draft has no `referenceNo`. The server assigns it when the entry is first submitted and retains it on later updates.
- Resubmitting a rejected entry changes its status to `pending` and keeps its `reviewerComment` as previous feedback.
- List paging defaults to `page=1`, `pageSize=25`; page is limited to 1–1000 and pageSize to 1–100. Allowed sort fields are `entryDate`, `createdAt`, `submittedAt`, `referenceNo`, `name`, `amountCentavos`, and `status`. `sort` and `order=asc|desc` are separate query parameters; the default is `entryDate` descending. `_id` is the stable ascending tie-breaker.
- List responses use `{ "items": [], "total": 0, "page": 1, "pageSize": 25 }`.
- Errors use `{ "status": 409, "code": "VERSION_CONFLICT", "message": "...", "details": [] }`. `VERSION_CONFLICT` and `INVALID_STATE` are `409`; `details` is an array of field issues or `null`.

## Authentication

| Method and path              | Query / body                                                    | Response                                                               | Required role                            | Frontend function                                 |
| ---------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------- |
| `POST /auth/login`           | `{ "email": "...", "password": "...", "rememberMe"?: boolean }` | `200 { user, session }`; set an HttpOnly server-session cookie         | Public                                   | `AuthContext.login`                               |
| `POST /auth/logout`          | Empty JSON body                                                 | `204`; revoke the current session and clear the cookie                 | Authenticated or no session (idempotent) | `AuthContext.logout`                              |
| `GET /auth/me`               | None                                                            | `200 { user, session }`; `401 SESSION_EXPIRED` without a valid session | Authenticated                            | `AuthContext.getSession` / initial session lookup |
| `POST /auth/change-password` | `{ "currentPassword": "...", "newPassword": "..." }`            | `204`; change password and revoke every other session                  | Authenticated                            | Password-change flow                              |

The returned `user` is `{ id, name, email, role, officeId, mustChangePassword }`. The returned `session` is `{ expiresAt, remember }`. Password hashes and raw session tokens are never returned.

The real adapter uses an opaque, random server-side session cookie, not JWTs. The cookie is HttpOnly, SameSite=Lax, path `/`, and Secure in production. Without remember-me it is a session cookie and expires after `SESSION_HOURS` (default 8). With `rememberMe: true`, its Max-Age and rolling expiration begin at `REMEMBER_ME_DAYS` (default 14), renewed no more often than `SESSION_RENEW_MINUTES` (default 60), and never past `REMEMBER_ME_MAX_DAYS` (default 30) from initial login. Production requires the configured `FRONTEND_ORIGINS` allowlist.

Login email is trimmed and lowercased. Passwords must be 1–128 characters and at most 72 UTF-8 bytes for bcrypt. Unknown email, wrong password, inactive user, locked user, and oversized password all return the same `401 INVALID_CREDENTIALS` response: `Invalid email or password.` After `LOGIN_MAX_FAILURES` (default 5), the account is locked for `LOCKOUT_MINUTES` (default 15). Change-password requires the current password and a different new password of 12–72 UTF-8 bytes; success clears `mustChangePassword` and revokes other sessions while retaining the current session.

Errors use `{ status, code, message, details }`: `VALIDATION_ERROR` (400), `INVALID_CREDENTIALS` and `SESSION_EXPIRED` (401), `FORBIDDEN` and `ORIGIN_NOT_ALLOWED` (403), `NOT_FOUND` (404), `CONFLICT`, `VERSION_CONFLICT`, and `INVALID_STATE` (409), `PAYLOAD_TOO_LARGE` (413), `UNSUPPORTED_MEDIA_TYPE` (415), and `RATE_LIMITED` (429). The frontend must redirect to login only for `SESSION_EXPIRED`; `INVALID_CREDENTIALS` is a login-form error and must not trigger a redirect.

Mock mode may continue to keep its simulated login user in `sessionStorage`. Real mode uses the server session cookie with `credentials: "include"`; it must not store a bearer token or JWT in browser storage.

Frontend integration work for the real adapter: send `rememberMe` from the login form; initialize and refresh auth state from `/auth/me`; treat logout's `204` as an empty response; add the change-password request and honor `mustChangePassword`; and dispatch a login redirect only for `SESSION_EXPIRED`, never for `INVALID_CREDENTIALS`. Keep mock-mode `sessionStorage` behavior isolated from the real cookie-backed session.

## Offices and Document Types

| Method and path             | Query / body                                       | Response                                                   | Required role | Frontend function                        |
| --------------------------- | -------------------------------------------------- | ---------------------------------------------------------- | ------------- | ---------------------------------------- |
| `GET /offices`              | `active` (default `true`), `kind`, `search`        | `{ items: Office[], total }`, max 200 sorted by code       | Authenticated | `officesService.listOffices`             |
| `GET /offices/:id`          | None                                               | `Office`, including inactive records                       | Authenticated | `officesService.getOffice`               |
| `POST /offices`             | Strict office body                                 | Created `Office`                                           | Admin         | Admin lookup management                  |
| `PATCH /offices/:id`        | Strict partial office body; code is immutable      | Updated `Office`                                           | Admin         | Admin lookup management                  |
| `GET /document-types`       | `active` (default `true`), `logbookType`, `search` | `{ items: DocumentType[], total }`, max 200 sorted by name | Authenticated | `documentTypesService.listDocumentTypes` |
| `GET /document-types/:id`   | None                                               | `DocumentType`, including inactive records                 | Authenticated | `documentTypesService.getDocumentType`   |
| `POST /document-types`      | Strict document-type body                          | Created `DocumentType`                                     | Admin         | Admin lookup management                  |
| `PATCH /document-types/:id` | Strict partial document-type body                  | Updated `DocumentType`                                     | Admin         | Admin lookup management                  |

`Office` fields are `id`, `code`, `fullName`, `kind`, `aliases`, and `active`. `DocumentType` fields are `id`, `name`, `aliases`, `logbookTypes`, `fieldRules`, and `active`; `fieldRules` defaults to `{}`. Document type results must honor the requested logbook-type scope. For `permit_certification`, only `officeId`, `amountCentavos`, `documentNumber`, `counterparty`, `tracking`, and `routingNote` accept `hidden`, `optional`, or `required` modes. Other logbook types do not support document-specific field rules. Admin POST/PATCH validate fieldRules and audit changes with `from` and `to` values.

Office codes use lowercase letters, digits, and hyphens (1–40 characters); `fullName` is limited to 200 characters. Document-type names are limited to 120 characters. Aliases are trimmed, lowercased, deduplicated, limited to 20 values of at most 80 characters, and cannot collide case-insensitively with another record's code/name or aliases in the same collection. `kind` is `internal` or `external`; `logbookTypes` use keys from `LOGBOOK_TYPES`. Lookup writes reject extra body fields. Deactivate with `PATCH` and `{ "active": false }`; there is no delete endpoint. Name changes do not rewrite snapshots in existing entries. Successful create, update, and deactivate operations write activity logs with field-level `changes`.

## Entries

The logbook-specific field set is defined by `src/config/logbookTypes.js`; nested type-specific fields are carried in `details`.

| Method and path            | Query / body                                                                                | Response                                                               | Required role                                  | Frontend function                 |
| -------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------- |
| `POST /entries`               | Configured entry fields and optional source (`manual` or `ai`); server creates only a draft | `201 Entry`                                                            | Authenticated; server assigns immutable owner  | `entriesService.createEntry`      |
| `GET /entries`                | Strict paging, sorting, filters, and search query parameters (see below)                     | `{ items: Entry[], total, page, pageSize }`                            | Authenticated; server-scoped                    | `entriesService.listEntries`      |
| `GET /entries/stats`          | Same validated scope filters and search as the list                                          | Counts, approved-amount totals; admin-only summaries                    | Authenticated; server-scoped                    | `entriesService.getEntryStats`    |
| `GET /entries/:id`            | None                                                                                        | `200 Entry`                                                            | Owner or admin; others receive `404 NOT_FOUND` | `entriesService.getEntry`         |
| `GET /entries/:id/history`    | `page` (default 1), `pageSize` (default 25, max 50)                                          | `{ items, total, page, pageSize }`                                     | Owner or admin; others receive `404 NOT_FOUND` | `entriesService.getEntryHistory`  |
| `PATCH /entries/:id`          | `version` and strict partial configured fields; source may be `manual` or `ai`              | `200 Entry`; stale version is `409 VERSION_CONFLICT`                   | Owner of draft/rejected entry, or admin        | `entriesService.updateEntry`      |
| `POST /entries/:id/submit`    | `{ "version": 0 }`                                                                          | `200 Entry` with `status: "pending"` and server-assigned `referenceNo` | Owner of draft/rejected entry                  | `entriesService.submitEntry`      |
| `POST /entries/:id/approve`   | `{ "version": 0, "comment"?: "..." }`                                                       | `200 Entry`; stale version is `409 VERSION_CONFLICT`                   | Admin; pending entries only                    | Admin review                      |
| `POST /entries/:id/reject`    | `{ "version": 0, "comment": "..." }`                                                        | `200 Entry`; stale version is `409 VERSION_CONFLICT`                   | Admin; pending entries only                    | Admin review                      |
| `DELETE /entries/:id`         | Empty JSON body                                                                             | `204`                                                                  | Owner of an unsubmitted draft only             | `entriesService.deleteDraftEntry` |

List, review, statistics, and history are implemented in B9b. Upload and AI endpoints are not implemented.

`Entry` responses contain `id`, `version` (stored `__v`), `logbookType`, `entryDate`, stored root fields, `details` (an object, default `{}`), `status`, `source`, `needsReview`, `submittedBy` (`{ id, name }`), `reviewedBy` (`{ id, name }` or `null`), `createdAt`, `updatedAt`, optional `submittedAt`, optional `referenceNo`, optional `reviewerComment`, and stored `tracking`, `attachment`, or `ai` metadata when present. `officeId`/`officeName` and `documentTypeId`/`documentTypeName` are returned when stored; permit rules may omit them for new entries, while previously stored hidden values remain readable. Lookup renames do not rewrite snapshots on existing entries. Historical records with `source: "import"` may be returned, but clients cannot set that source. Responses never expose `_id`, `__v`, `passwordHash`, or email.

### Create and Submit Semantics

- `POST /entries` creates a draft without `referenceNo`; the server sets `submittedBy` to the authenticated user.
- Draft validation requires `logbookType`, `entryDate`, and `name` for `permit_certification`; the other seven types retain their existing `officeId` draft requirement. Submit validation uses the selected document type's current `fieldRules` for permit fields and existing `LOGBOOK_TYPES` requirements for all other types, including nested `details` fields.
- Optional null fields clear to absent; null for required fields or `source` is a `400 VALIDATION_ERROR`. When present, source is exactly `manual` or `ai`; create defaults omitted source to `manual`.
- New or changed office/document-type values must be active, and document types must match the selected logbook scope. An unchanged inactive lookup may remain on an entry; lookup renames never rewrite its stored name snapshot.
- `POST /entries/:id/submit` accepts only `{ "version": n }`, validates the complete entry, assigns `referenceNo` using the logbook prefix and `entryDate` year, sets `submittedAt`, and changes status to pending. A rejected entry retains its reviewer feedback metadata.
- `PATCH /entries/:id` requires the current integer `version`, rejects status and other server-controlled fields, and saves with optimistic concurrency. A stale version returns `409 VERSION_CONFLICT`.
- A no-op PATCH returns the same `version` and writes no `entry_edited` activity log.
- Changing a permit entry's `documentTypeId` clears stored values and snapshots for fields hidden by the new rules, after confirmation in the frontend. Rule edits do not rewrite existing entries; hidden stored values remain readable. Requests that send hidden fields are rejected with `400 VALIDATION_ERROR` and field details.
- Logbook type may change only before reference assignment. `DELETE` returns `204` and is limited to the owner's draft without a reference number.
- Dates must be real calendar dates in `YYYY-MM-DD` with years 2000–2100; returned times use 24-hour `HH:mm`; amounts are integer centavos from 0 through 99,999,999,999.
- Unknown fields return `400 VALIDATION_ERROR` with field details. `INVALID_STATE` is `409`; malformed IDs are `400`; missing entries and entries not visible to the requester return `404 NOT_FOUND`.

Example create body (other configured fields vary by `logbookType`):

```json
{
  "logbookType": "petty_cash",
  "entryDate": "2026-10-14",
  "name": "Jordan Lee",
  "particulars": "Local transport reimbursement",
  "officeId": "000000000000000000000003",
  "amountCentavos": 7250,
  "source": "manual"
}
```

The authenticated user is assigned as `submittedBy`; any client-supplied submitter, status, reference number, reviewer fields, or resolved names are rejected. Ownership and activity are enforced by the backend. Upload and AI workflows are not implemented.

### List, Review, Statistics, and History

`GET /entries` accepts only these query parameters: `page`, `pageSize`, `sort`, `order`, `logbookType`, `documentTypeId`, `officeId`, `status`, `trackingStatus`, `source`, `needsReview`, `dateFrom`, `dateTo`, `submittedBy`, `mine`, and `search`. Unknown parameters, repeated/array values, nested/operator values, and invalid values return `400 VALIDATION_ERROR`. IDs must be lowercase 24-character hexadecimal strings. `status` may be one status or a comma-separated list. Dates are real `YYYY-MM-DD` dates and inclusive; `dateFrom` cannot be after `dateTo`. `mine` accepts only `true`; `submittedBy` is admin-only.

Search is a case-insensitive literal substring, at most 100 characters, over `name`, `particulars`, `remarks`, `referenceNo`, and `documentNumber`. Regex metacharacters are escaped. User scope is always the authenticated user's entries, regardless of query parameters. Admins see all non-draft entries plus their own drafts; other users' drafts are excluded. List items have exactly the same shape as `GET /entries/:id` and never include `_id`, `__v`, password hashes, or email addresses. `submittedBy` and `reviewedBy` contain only `{ id, name }` or `null`.

Review requests require a non-negative integer `version`. Only admins may review pending entries; stale versions return `409 VERSION_CONFLICT` and non-pending entries return `409 INVALID_STATE`. Rejection requires a trimmed 1–1000 character `comment`; approval accepts an optional comment and clears any prior comment when omitted. Review responses set `reviewedBy`, `reviewedAt`, `status`, and `reviewerComment`. Successful reviews log `entry_approved` or `entry_rejected`, including actor, `resourceRef`, a comment truncated to 200 characters, and `selfReview`; failed attempts do not create success logs.

Stats returns `total`, `byStatus`, `byLogbookType`, `needsReview`, `approvedAmountCentavos`, and `approvedWithAmountCount` under the same server scope and filters. Approved amount totals include only approved entries that have a numeric amount; entries without an amount are not treated as zero-valued amounts. Admins additionally receive `totalActiveUsers`, up to five latest `recentSubmissions` (each with the entry response shape), and up to ten latest `recentActivity` items containing timestamp, actor name, action, and `resourceRef` only.

History returns newest-first items with `{ at, action, actor: { id, name }, result, changes }`. It uses the same visibility rule as `GET /entries/:id`; other users receive `404 NOT_FOUND`. History responses omit IP addresses, user agents, cookies, and request bodies. Export remains client-side paging over the list endpoint, stops at 5,000 rows, and reports `{ items, total, capped }`; XLSX/PDF generation is not a separate API endpoint.

## Users, Notifications, Profile, and Settings

| Method and path                 | Query / body                                                                                                                      | Response                                                                                                                                                                                                                                    | Required role                                          | Frontend function                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------- |
| `GET /users`                    | None                                                                                                                              | `User[]`                                                                                                                                                                                                                                    | Admin                                                  | `usersService.listUsers`                                   |
| `POST /users`                   | `{ "name": "...", "email": "...", "role": "user" }`                                                                               | Created `User`                                                                                                                                                                                                                              | Admin                                                  | `usersService.createUser`                                  |
| `PATCH /users/:id`              | `{ "name": "...", "email": "...", "role": "user" }`                                                                               | Updated `User`                                                                                                                                                                                                                              | Admin; self-profile updates may change only name/email | `usersService.updateUser` / `profileService.updateProfile` |
| `PATCH /users/:id/active`       | `{ "isActive": true }`                                                                                                            | Updated `User`                                                                                                                                                                                                                              | Admin                                                  | `usersService.setUserActive`                               |
| `GET /notifications`            | None; session scopes results                                                                                                      | `Notification[]`                                                                                                                                                                                                                            | Authenticated                                          | `notificationsService.listNotifications`                   |
| `PATCH /notifications/:id/read` | `{ "read": true }`                                                                                                                | Updated `Notification`                                                                                                                                                                                                                      | Owner of notification                                  | `notificationsService.markNotificationRead`                |
| `GET /settings/preferences`     | None                                                                                                                              | `{ "preferences": { "dateFormat": "MMM d, yyyy", "defaultExportFormat": "xlsx", "includeReviewerComments": true, "simulatedNotifications": true }, "aiConfiguration": { "status": "Not connected", "mode": "Simulated extraction only" } }` | Admin                                                  | `settingsService.getAppSettings`                           |
| `PATCH /settings/preferences`   | `{ "dateFormat": "MMM d, yyyy", "defaultExportFormat": "xlsx", "includeReviewerComments": true, "simulatedNotifications": true }` | Updated settings snapshot                                                                                                                                                                                                                   | Admin                                                  | `settingsService.saveAppPreferences`                       |
| `POST /auth/password-change`    | `{ "currentPassword": "...", "newPassword": "..." }`                                                                              | `{ "accepted": true }`                                                                                                                                                                                                                      | Authenticated                                          | `profileService.requestPasswordChange`                     |

`Notification` contains `id`, `role`, `type`, `title`, `message`, `createdAt`, `read`, and optional `actionLabel`/`actionHref`.

## Upload Placeholder

| Method and path | Query / body                             | Response                                          | Required role | Frontend function                                                             |
| --------------- | ---------------------------------------- | ------------------------------------------------- | ------------- | ----------------------------------------------------------------------------- |
| `POST /uploads` | `multipart/form-data` with an image file | `{ "uploadId": "<24-hex>", "previewUrl": "..." }` | Authenticated | Placeholder for the upload stage of `aiProcessingService.processLogbookImage` |

The current mock keeps image processing in-browser and does not call an upload endpoint. This row reserves the backend contract only.

## Mock-Only Operations

Dashboard statistics, Activity Logs rows, Data Status, sample backup creation/restore, and XLSX/PDF rendering are composed in frontend services from entries and users. They do not require separate backend endpoints. The real adapter and service boundaries are in `src/services/adapters` and `src/services`.
