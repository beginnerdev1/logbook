# Logbook Backend

## Databases

The application uses `MONGODB_URI` (default database: `logbook`). Automated verification uses `MONGODB_URI_TEST`, defaulting to `mongodb://127.0.0.1:27017/logbook_test`.

Initialize and seed only the test database with:

```powershell
npm run test:db:init
npm run test:db:seed
```

Reset only the `_test` database with `npm run test:db:reset`. Reset refuses database names that do not end in `_test`.

The test seed creates offices and document types, not an admin account. Test init, seed, and reset always require a database name ending in `_test`. All `*:verify` commands and `entries:fuzz` use the test database and refuse other names unless explicitly passed `--allow-real-db`.

Run checks with `npm run db:verify`, `npm run auth:verify`, `npm run entries:verify`, `npm run lookups:verify`, or `npm run entries:fuzz`. Temporary fixtures are deleted by their exact IDs, and each script checks its collection-count and counter-content baseline before exit. `npm run db:check` is read-only and inspects the normal `MONGODB_URI` database.
