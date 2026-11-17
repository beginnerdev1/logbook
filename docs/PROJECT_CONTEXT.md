# Logbook Project Context

## Summary

Logbook is a full-stack records system for office and document logbooks. The workspace contains a React/Vite frontend and a Node.js ESM Express/Mongoose backend. The design targets MongoDB at 127.0.0.1:27017 in the logbook database.

## Stack

- Frontend: React 19, Vite, Tailwind v4, shadcn/Base UI, React Router
- Backend: Node.js ESM, Express 5, Mongoose 9, MongoDB
- Auth: opaque server-side sessions, HttpOnly cookies, bcryptjs hashing
- Shared rules: YYYY-MM-DD dates, integer centavos, HH:mm times, 24-char hex ids

## Folder map

- backend/: Express app, MongoDB models, route/auth logic, docs, scripts
- frontend/: React app, routes/pages, services, tests, Vite config
- docs/: project working notes

## Run commands and ports

- Backend: `npm install` then `npm run db:init`, `npm run db:seed`, `npm run auth:verify`, `npm run db:verify`, `npm run entries:verify`, `npm run entries:fuzz`, `npm run lookups:verify`, `npm test`, `npm run dev` or `npm start`; default port 3000
- Frontend: `npm install`, `npm run dev`; Vite default port 5173; `/api` proxies to the backend target
- MongoDB: 127.0.0.1:27017; database logbook

## Stage status

| Item                 | Status  | Evidence                                                                             |
| -------------------- | ------- | ------------------------------------------------------------------------------------ |
| B1 connection        | DONE    | backend/server.js + backend/src/db.js                                                |
| B2 models            | DONE    | backend/src/models/\*.js and collection names                                        |
| B3 init              | DONE    | backend/scripts/dbInit.js                                                            |
| B4 seed              | DONE    | backend/scripts/dbSeed.js                                                            |
| B5 verify            | DONE    | backend/scripts/dbVerify.js + authVerify.js                                          |
| B6 auth              | DONE    | backend/src/routes/auth.js + middleware/auth.js                                      |
| B7 user:create       | DONE    | backend/scripts/userCreate.js                                                        |
| B8 lookup APIs       | DONE    | backend/src/routes/lookups.js + backend/scripts/lookupsVerify.js                     |
| F8a routes/pages     | DONE    | frontend/src/App.jsx + frontend/src/lib/paths.js                                     |
| F8b auth flow        | DONE    | frontend/src/contexts/AuthProvider.jsx                                               |
| F8c helpers          | DONE    | frontend/src/lib/\*.js and config/logbookTypes.js                                    |
| F8d adapter switch   | DONE    | frontend/src/services/adapters/index.js                                              |
| F8e tests            | DONE    | frontend/src/\*_/_.test.\*                                                           |
| F8f Vite proxy/ports | PARTIAL | vite.config.js still allows ngrok and default proxy target 3001                      |
| Connect 1            | PARTIAL | real auth not fully wired; mock sessionStorage remains                               |
| Connect 2            | DONE    | frontend lookup adapters, five-minute cache, EntryForm fallbacks, and Settings lists |
| B9a entries API      | DONE    | backend/src/routes/entries.js + backend/scripts/entriesVerify.js + entries:fuzz      |
| B9b entries list/review/stats/history | DONE | strict server-scoped APIs and frontend entries adapter integration; live API UNVERIFIED |
| Connect 3a entry screens | DONE (automated) | real adapter, manual save/submit, server-paged records, details/history, tests; live API UNVERIFIED |
| CONFIG-2 field rules | DONE    | entries:verify, lookups:verify, backend/frontend tests, build, and lint passed       |

## Rules

- Date-only values are YYYY-MM-DD strings, never Date objects.
- Money is integer centavos via money.js only.
- Times are HH:mm 24-hour strings.
- IDs are 24-character lowercase hex strings.
- The client never sends officeName or documentTypeName.
- referenceNo is assigned on first submit and absent on drafts.
- logbookTypes.js is identical in both folders except the header comment.
- `permit_certification` document types may override the six configurable field modes; the other seven types remain static.
- No secrets in code; keep .env values outside source control.
- Session cookies are HttpOnly; no bearer/JWT tokens in browser storage.

## Working method

1. Read docs/PROJECT_CONTEXT.md at the start of every session.
2. Work one stage at a time, then stop and wait.
3. Ask before adding any dependency.
4. Keep diffs minimal and review them before completion.
5. Mark unverified items as UNVERIFIED.
6. Never request or print passwords or secret values.
7. Keep replies short and direct.

## Open questions

- PCV and voucher numbers
- Bank on checks and check-number uniqueness
- Which offices are external, and whether mdrrmo and mdrrmc are the same
- Meaning of "returned"
- Importing the old spreadsheet rows

## Notes

- Git repo root is not the Logbook folder in this session; it resolves to C:/Users/Admin.
- Backend .env names observed: MONGODB_URI, PORT, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, NODE_ENV, SESSION_HOURS, REMEMBER_ME_DAYS, REMEMBER_ME_MAX_DAYS, SESSION_RENEW_MINUTES, LOGIN_MAX_FAILURES, LOCKOUT_MINUTES, FRONTEND_ORIGINS.
- Frontend .env names observed: VITE_API_URL, VITE_API_PROXY_TARGET, VITE_USE_MOCK, VITE_REAL_SERVICES.

## B8 Files Changed

- backend/package.json
- backend/src/app.js
- backend/src/middleware/errors.js
- backend/src/routes/lookups.js
- backend/src/services/lookups.js
- backend/src/services/lookups.test.js
- backend/src/utils/apiError.js
- backend/scripts/lookupsVerify.js
- frontend/docs/api-contract.md
- docs/PROJECT_CONTEXT.md

## Connect 2 Files Changed

- frontend/.env.development
- frontend/.env.example
- frontend/README.md
- frontend/src/lib/apiClient.js
- frontend/src/services/adapters/index.js
- frontend/src/services/adapters/index.test.js
- frontend/src/services/adapters/lookupShapes.js
- frontend/src/services/adapters/lookups.test.js
- frontend/src/services/adapters/mockApiAdapter.js
- frontend/src/services/adapters/realApiAdapter.js
- frontend/src/services/lookupCache.js
- frontend/src/services/lookupCache.test.js
- frontend/src/services/officesService.js
- frontend/src/services/documentTypesService.js
- frontend/src/contexts/AuthProvider.jsx
- frontend/src/features/entries/EntryForm.jsx
- frontend/src/features/entries/LookupCombobox.jsx
- frontend/src/features/entries/LookupCombobox.test.jsx
- frontend/src/features/settings/SettingsPage.jsx
- frontend/src/features/settings/SettingsPage.test.jsx
- docs/PROJECT_CONTEXT.md

## B9a Files Changed

- backend/docs/database-design.md
- backend/package.json
- backend/scripts/dbVerify.js
- backend/scripts/entriesVerify.js
- backend/scripts/entriesFuzz.js
- backend/src/app.js
- backend/src/entries/entryValidation.js
- backend/src/entries/entryValidation.test.js
- backend/src/middleware/errors.js
- backend/src/models/Entry.js
- backend/src/policies/entryPolicy.js
- backend/src/policies/entryPolicy.test.js
- backend/src/routes/entries.js
- backend/src/utils/apiError.js
- frontend/docs/api-contract.md
- docs/PROJECT_CONTEXT.md

## B9b Files Changed

- backend/src/routes/entries.js
- backend/src/policies/entryPolicy.js and entryPolicy.test.js
- backend/src/models/ActivityLog.js
- backend/scripts/entriesVerify.js and verificationDb.js and verificationDb.test.js
- backend/docs/database-design.md
- frontend/docs/api-contract.md
- docs/PROJECT_CONTEXT.md

## CONFIG-2 Files Changed

- backend/src/shared/logbookTypes.js and backend/src/shared/logbookTypes.test.js
- backend/src/models/DocumentType.js, backend/src/models/Entry.js, backend/src/routes/lookups.js, backend/src/routes/entries.js
- backend/scripts/dbSeed.js, backend/scripts/entriesVerify.js, backend/scripts/lookupsVerify.js
- frontend/src/config/logbookTypes.js and frontend/src/config/logbookTypes.test.js
- frontend/src/features/entries/EntryForm.jsx and related tests
- frontend/src/lib/buildSchema.js, frontend/src/lib/entryMapper.js, and related tests
- frontend/src/data/mockLookups.js and frontend/src/services/adapters/lookupShapes.js
- frontend/src/services/reportsService.js and related tests
- backend/docs/database-design.md, backend/docs/logbook-schema.dbml, frontend/docs/api-contract.md, docs/PROJECT_CONTEXT.md

## Connect 3a Files Changed

- frontend/.env.development
- frontend/src/services/adapters/realApiAdapter.js and related tests
- frontend/src/services/entriesService.js and related tests
- frontend/src/features/entries/EntryForm.jsx and related tests
- frontend/src/features/entries/EntriesList.jsx and related tests
- frontend/src/features/entries/EntryDetailsDialog.jsx
- frontend/src/features/ai-processing/AIProcessingPage.jsx and related tests
- frontend/src/features/approvals/ApprovalsPage.jsx
- frontend/src/features/dashboard/DashboardPage.jsx
- frontend/src/services/dashboardService.js
- frontend/src/features/reports/ReportsPage.jsx and related tests
- frontend/src/services/reportsService.js
- frontend/src/components/shared/DevOnlyMockNote.jsx
- frontend/src/features/entries/entryListUtils.js
- docs/PROJECT_CONTEXT.md
