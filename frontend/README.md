# Logbook Frontend

React 19 and Vite frontend for the Logbook application. Use Node.js 20.19+ or 22.12+ with npm.

## Run Locally

```powershell
cd frontend
npm install
npm run dev
```

Vite prints the local URL when the server starts. The default port is `5173`; Vite selects the next available port if it is occupied.

## Scripts

| Command         | Purpose                               |
| --------------- | ------------------------------------- |
| `npm run dev`   | Start the Vite development server.    |
| `npm run build` | Create a production build in `dist/`. |
| `npm run lint`  | Run ESLint across the frontend.       |
| `npm test`      | Run Vitest tests in jsdom.            |

## Mock and Real API Modes

The mock adapter is active by default. Set `VITE_USE_MOCK=false` to select the real HTTP adapter for all services, or set `VITE_REAL_SERVICES` to a comma-separated list to enable selected real services while keeping the rest mocked. Connect 2 uses `VITE_REAL_SERVICES=auth,offices,documentTypes`.

`VITE_API_URL` defaults to `/api`; `VITE_API_PROXY_TARGET` defaults to `http://127.0.0.1:3000` for the Vite proxy.

Mock mode uses in-memory services and sample fixtures; changes do not persist after a page reload. Real mode expects the API described in [docs/api-contract.md](docs/api-contract.md).

## Source Layout

- `src/features/` contains route-level workflows and their feature components/tests.
- `src/components/` contains shared layout and UI primitives.
- `src/services/` contains frontend service boundaries; `src/services/adapters/` selects mock or HTTP implementations.
- `src/config/` contains shared field and logbook-type definitions.
- `src/lib/` contains date-only, money, time, mapping, permissions, and API utilities.
- `src/data/` contains mock-only fixtures.

Keep `src/config/logbookTypes.js` identical to the backend copy at `backend/src/shared/logbookTypes.js`.

## Data Conventions

- Keep date-only values as `YYYY-MM-DD` strings and use `src/lib/dateOnly.js` for comparison and formatting.
- Keep money as integer centavos and use `src/lib/money.js` for parsing and display.
- Keep times as `HH:mm` strings and use `src/lib/time.js` for conversion and display.
- Persisted API IDs are 24-character hexadecimal strings.
