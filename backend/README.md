# ECR Building — Backend (.NET 10 / ASP.NET Core)

Real backend for the BuildPOS frontend: MariaDB via EF Core, JWT httpOnly-cookie auth, RBAC,
and full business logic for POS, delivery, HR, finance/GL, and ZATCA Phase 2 (simulate mode).

## Solution layout

```
backend/
  src/EcrBuilding.Domain          entities, enums — no dependencies
  src/EcrBuilding.Application     DTOs, service interfaces (Abstractions/)
  src/EcrBuilding.Infrastructure  EF Core AppDbContext, migrations, DbSeeder, auth/payments/GL/ZATCA/printing services
  src/EcrBuilding.Api             ASP.NET Core Web API — controllers, JWT cookie auth, Program.cs
```

## Prerequisites

- .NET 10 SDK
- MariaDB/MySQL running locally with a database named `ecr-building` (already created if you're
  reading this in the working repo). Connection string lives in `src/EcrBuilding.Api/appsettings.json`
  — defaults to `server=127.0.0.1;port=3306;database=ecr-building;user=root;password=mota`.

## Run

```bash
cd backend/src/EcrBuilding.Api
dotnet run --urls http://localhost:5080
```

On first run, `DbSeeder` automatically applies all EF Core migrations (`dotnet ef database update`
equivalent) and seeds the full demo dataset if the database is empty: branches/terminals/devices,
roles/permissions, demo users, product catalog, delivery drivers/vehicles/zones, HR employees, a
chart of accounts, and per-branch ZATCA billing settings (VAT/CR/address).

ZATCA Phase 2 now talks to the real e-invoicing gateway (`gw-fatoora.zatca.gov.sa`) instead of a
local simulator, so onboarding can no longer be auto-seeded with made-up VAT numbers — ZATCA would
just reject them. From the ZATCA Phase 2 Settings page, save a branch's real VAT number, then walk
through Generate CSR → Compliance CSID (OTP from the Fatoora portal) → Production CSID once, using
a genuinely registered CR/VAT. Until that's done, POS sales still complete normally but their
invoice submission is skipped (logged as a warning) and receipts show "ZATCA invoice pending."

To create a new migration after changing an entity:

```bash
cd backend/src/EcrBuilding.Api
dotnet ef migrations add <Name> \
  --project ../EcrBuilding.Infrastructure/EcrBuilding.Infrastructure.csproj \
  --startup-project . \
  -o ../EcrBuilding.Infrastructure/Persistence/Migrations
```

## Demo credentials

All seeded users share the password `Passw0rd!`:

The role roster is capped at exactly the BRD §10.1 ladder — Cashier, Senior Cashier, Supervisor,
Store Manager, System Admin. A few demo users below keep their original names/emails (referenced as
FKs by other seed data, e.g. the Jeddah warehouse contact and the Riyadh delivery driver) but are
assigned to their nearest ladder role rather than a standalone role of their own.

| Email | Role |
|---|---|
| admin@ecr-building.local | System Admin |
| manager.ruh@ecr-building.local | Store Manager (Riyadh) |
| cashier.ruh@ecr-building.local | Cashier (Riyadh) |
| senior-cashier.ruh@ecr-building.local | Senior Cashier (Riyadh) |
| supervisor.ruh@ecr-building.local | Supervisor (Riyadh) |
| warehouse.jed@ecr-building.local | Supervisor (Jeddah warehouse contact) |
| driver.ruh@ecr-building.local | Supervisor (Riyadh delivery driver) |
| hr@ecr-building.local | Supervisor (HR contact) |
| accountant@ecr-building.local | Supervisor (finance contact) |

## Key architectural notes

- **Auth**: JWT access token (15 min) + refresh token (14 days), both set as `httpOnly` cookies by
  `AuthController` — the frontend never touches the token directly. Page permissions are NOT baked
  into the token — `[RequireModule(pageKey, PermissionAction)]`
  (`Api/Authorization/RequireModuleAttribute.cs`) resolves the caller's effective grid per request via
  `IPermissionResolver` (role default + any per-user `UserPermissionOverride`, cached in-process and
  invalidated by a global `PermissionsEpoch` bump), so a role edit or a per-user "Customize
  Permissions" override takes effect on the very next request instead of waiting for a token refresh.
  `pageKey` is a frontend route string (e.g. `/stock/warehouses`) — see
  `Infrastructure/Persistence/Seed/PermissionCatalog.cs`, kept in sync by hand with `AppLayout.tsx`'s
  nav array.
- **GL posting** (`IGlPostingService`): every money-moving action (a completed sale, an approved
  expense, a received PO, an approved return) posts a balanced double-entry journal entry. See
  `Infrastructure/Services/GlPostingService.cs` — throws if debits ≠ credits.
- **ZATCA Phase 2** (`Infrastructure/Zatca/`): real EC keypair + PKCS#10 CSR generation
  (BouncyCastle), a real ICV/PIH SHA-256 hash chain, and a real 9-tag TLV QR builder — but
  `ZatcaService` talks to an internal simulator instead of ZATCA's real gateway
  (`ZatcaIdentity.Environment = Simulate`). Swapping to a real sandbox/production account later is
  a config/data change, not a code change. Every completed order auto-submits a simplified invoice;
  failures never block the sale (`OrdersController.Checkout`).
- **Printing** (`Infrastructure/Printing/EscPosBuilder.cs`): builds real ESC/POS command bytes
  (init, bold/center, the `GS ( k` QR block) and a human-readable preview, stored in `PrintJobs`
  instead of being sent to a physical printer (none attached to this environment).
- **Delivery state machine**: `DeliveryOrdersController` enforces the exact `AllowedTransitions`
  map and per-stage guards (driver+vehicle before Assign/Dispatch, stock reserved before Loading,
  loaded/delivered quantities before Ready-to-Dispatch/Delivered) that the original frontend mock
  only checked client-side.
- **Payments**: `IPaymentGateway` (`MockPaymentGateway`) always succeeds — happy-path only, by
  design. Swap in a real Mada/STC Pay/Apple Pay provider later without touching `Order`/`OrderPayment`.
