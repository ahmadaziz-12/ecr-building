# ECR Building — BuildPOS

A construction-materials POS/ERP system: TanStack Start (React 19) frontend + a real ASP.NET Core
(.NET 10) backend on MariaDB. See [`backend/README.md`](backend/README.md) for backend details.

## Running locally

Two processes, both from a fresh clone:

**Backend** (MariaDB must be running with a `ecr-building` database — see `backend/README.md` for
the connection string):

```bash
cd backend/src/EcrBuilding.Api
dotnet run --urls http://localhost:5080
```

First run auto-migrates the database and seeds full demo data (branches, users, catalog, delivery
fleet, HR roster, chart of accounts, a production-ready ZATCA identity in simulate mode).

**Frontend**:

```bash
bun install   # or npm install
bun run dev   # or npm run dev — starts on http://localhost:8080
```

Open `http://localhost:8080` and sign in with any seeded account (all share password
`Passw0rd!` — see `backend/README.md` for the full list, e.g. `owner@ecr-building.local`).

## What's real vs. simulated

- **Real**: auth/RBAC, catalog & inventory (with stock movement), POS checkout (cart → stock
  deduction → VAT/discount → payment → GL posting → ZATCA invoice), delivery dispatch state
  machine, HR (attendance/leave with side effects), finance double-entry ledger, ZATCA Phase 2
  crypto (CSR, hash chain, TLV QR) — all persisted in MariaDB, no localStorage anywhere.
- **Simulated by design** (per explicit scope decisions): ZATCA submissions go to an internal
  simulator instead of the real government gateway (no real CR/VAT credential available here);
  "printing" renders real ESC/POS bytes + a preview instead of driving a physical printer (none
  attached); payments always succeed via a mock gateway (happy-path only).
- **Lighter/config-only** (real DB-backed CRUD, no deep execution engine): admin Rules Engine,
  Compliance, Maintenance, Plans/Subscriptions, Insights Reports catalog and BI feed monitor.
