# BuildPOS — BRD Gap Implementation Plan

Source audit: "BuildPOS vs. BRD-ECR-BM-2026-001 — Implementation Audit" (2026-07-24). This plan breaks that audit into 20 standalone modules, ordered so each phase unblocks the next.

## How to use this document

Each module below is written as a **self-contained brief inside a fenced text block**. To hand a module to a different Claude Code session (or a different engineer):

1. Copy everything inside that module's fenced block (the ` ``` ` lines and everything between them).
2. Paste it as the first message in a fresh session.
3. The new session has enough context to open the cited files, understand what exists today, and start implementing — it does not need this conversation's history.

Work through modules roughly in order. Phase 1 fixes cheap-but-important gaps in logic that half-exists. Phase 2 builds the two things the BRD itself flags as "CRITICAL REQUIREMENT." Phase 3 closes compliance/resilience gaps. Phase 4 hardens the long tail. Modules within a phase can usually be done in parallel by different sessions/engineers unless a "Depends on" note says otherwise.

**Every module (1–20) requires automated tests, not just manually-checked acceptance criteria.** The repo currently has zero test infrastructure — no backend test project, no frontend test runner. **Module 0 sets that up and must land before any other module's tests can be written**, so treat it as an unconditional prerequisite even though it isn't listed in every module's "Depends on" column below. Each module's brief ends with a "TESTING REQUIREMENT" paragraph naming the specific tests it needs, on top of Module 0's shared setup.

## Master checklist

| # | Module | Phase | BRD ref | Depends on |
|---|---|---|---|---|
| 0 | Testing infrastructure setup | 0 | — | — (do this first, unconditionally) |
| 1 | Discount authorization tiers | 1 | §6.2 | Module 0 |
| 2 | Loyalty points calculation fix | 1 | §4.3.1 | Module 0 |
| 3 | B2B credit limit enforcement | 1 | §4.2 | Module 0 |
| 4 | Role model realignment | 1 | §10.1 | Module 0 |
| 5 | UOM conversion engine + cut-to-size | 2 | §2.3 | Module 0 |
| 6 | Three-way return workflow (Damaged/Surplus/Standard) | 2 | §3.2 | Module 0; Module 4 (roles) helps but not blocking |
| 7 | Loyalty tier benefits wiring | 2 | §4.3.2 | Module 0, Module 2 |
| 8 | Bundle-to-POS integration | 2 | §5 | Module 0 |
| 9 | Real payment gateway integration | 2 | §7.1 | Module 0 |
| 10 | Offline transaction queue + sync | 3 | §8/§13 | Module 0 |
| 11 | ZATCA B2B/standard invoice path | 3 | §6.3 | Module 0 |
| 12 | Financial & operational reporting engine | 3 | §11 | Module 0; Module 6 (return-type split feeds return reports) |
| 13 | Cash drawer–to–sale tie-in | 3 | §7.3 | Module 0, Module 9 |
| 14 | Catalog expansion (categories, attributes, supplier, bin) | 3 | §2.1/2.2 | Module 0 |
| 15 | Authentication hardening (PIN login, biometric, idle-lock, dual-PIN) | 4 | §10.2 | Module 0, Module 4 |
| 16 | Quotation & delivery POS integration | 4 | §3.4/3.5 | Module 0 |
| 17 | Void & line-item granularity | 4 | §3.6 | Module 0, Module 4 |
| 18 | Hardware driver completion | 4 | §12 | Module 0 |
| 19 | Webhook/event-driven integration layer | 4 | §13 | Module 0 |
| 20 | NFR hardening (encryption, PCI scoping, WCAG, receipts, points expiry) | 4 | §14 | Module 0 |
| 21 | Configurable loyalty policy (global tiers, branch-wise rates) | 3 | §4.3 | Module 0, Module 7 |

---

## Module 0 — Testing infrastructure setup

```
PROJECT CONTEXT
BuildPOS, Building Materials ECR/POS. Repo root: e:/MartProject/building-ecr.
Backend: ASP.NET Core 10 + EF Core (backend/src/EcrBuilding.*, solution file backend/EcrBuilding.slnx).
Frontend: React 19 + TanStack Router (src/), built with Vite, package.json has no test script today.

TASK: Stand this project's automated-test infrastructure up from scratch. Every other module in this
plan (1-20) depends on this landing first — none of them can satisfy their "TESTING REQUIREMENT"
paragraph without it. There is currently no backend test project at all (only Api/Application/Domain/
Infrastructure projects exist in the .slnx) and no frontend test runner (no vitest/jest config, no
@testing-library dependency, no "test" script in package.json).

WHAT TO BUILD

Backend:
1. Add a new xUnit test project, e.g. backend/src/EcrBuilding.Tests, referencing Api/Application/Domain/
   Infrastructure, and add it to backend/EcrBuilding.slnx.
2. Set it up for two kinds of tests: (a) fast unit tests against Domain/Application logic with no
   database, and (b) integration tests that spin up the real Api via
   Microsoft.AspNetCore.Mvc.Testing's WebApplicationFactory with EF Core's InMemory or SQLite
   in-memory provider swapped in for AppDbContext, so controller endpoints can be tested end-to-end
   without a real SQL Server/Postgres instance.
3. Add a small seed-data helper for tests (reuse/adapt patterns from
   backend/src/EcrBuilding.Infrastructure/Persistence/Seed/DbSeeder.cs rather than duplicating it) so
   integration tests can spin up a known-good dataset (a branch, a terminal, a cashier user, a few
   products) quickly.
4. Add a `dotnet test` step users can run locally; document it in this repo's README or AGENTS.md.

Frontend:
1. Add Vitest + @testing-library/react + @testing-library/jest-dom + @testing-library/user-event as
   devDependencies, and a vitest config (either a separate vitest.config.ts or a `test` block added to
   the existing vite.config.ts).
2. Add Mock Service Worker (msw) to intercept the API calls made by src/lib/api/*.ts in component tests,
   so components can be tested against realistic API responses without hitting a real backend.
3. Add a "test" script to package.json (e.g. `"test": "vitest run"`).
4. For the handful of true end-to-end acceptance criteria across this plan that describe a full user
   journey (e.g. "damaged goods return workflow completes end-to-end," "offline mode processes 50
   transactions and syncs on reconnection"), add Playwright as a devDependency and a minimal config —
   these are the only cases later modules will ask for a Playwright test specifically; everything else
   uses Vitest/RTL component tests or backend integration tests.

ACCEPTANCE CRITERIA
- `dotnet test` runs successfully from backend/ and discovers at least one placeholder test in the new
  EcrBuilding.Tests project.
- `npm test` (or the chosen package manager's equivalent) runs successfully and discovers at least one
  placeholder component test.
- A documented pattern exists (in the test project / a short README) for: writing a backend integration
  test against a real controller with in-memory EF Core, writing a frontend component test with a mocked
  API response via msw, and writing a Playwright e2e test — so every subsequent module's author can follow
  it without re-deriving the setup.
```

## Module 1 — Discount authorization tiers

```
PROJECT CONTEXT
I'm working on BuildPOS, a Building Materials ECR/POS system. Repo root: e:/MartProject/building-ecr.
Backend: ASP.NET Core 10 + EF Core, in backend/src/EcrBuilding.* (Api, Application, Domain, Infrastructure).
Frontend: React 19 + TanStack Router, in src/.

TASK: Enforce discount authorization tiers server-side.

BACKGROUND
The BRD requires: Cashier can apply up to 5% discount, Supervisor up to 15%, Manager above 15% —
enforced at the point of sale, not just as policy. Today, ManualDiscountInput (in
backend/src/EcrBuilding.Application/Pos/PosDtos.cs) accepts any percentage or fixed amount with
no server-side check in OrdersController.Checkout. There IS a generic ApprovalRequest workflow
(backend/src/EcrBuilding.Domain/Entities/ApprovalRequest.cs, ApprovalType.Discount/PriceOverride/Refund,
handled by ApprovalsController.cs) but it is never invoked from the checkout discount path — it's a
disconnected side-workflow today.

WHAT TO BUILD
1. In OrdersController.Checkout (or wherever the discount is applied), read the current user's role/
   permission level and compare it against the requested discount percentage.
2. If the discount exceeds what the current user's role allows, either reject the request with a clear
   error, or automatically create/require an ApprovalRequest (of type Discount) that a higher-tier user
   must approve before the order can complete — pick whichever matches how ApprovalsController is meant
   to be used elsewhere in the app (read ApprovalsController.cs and RequestApprovalDialog.tsx first to see
   the existing pattern).
3. Apply the same rule to Fixed Amount discounts (BRD: any fixed-amount discount needs supervisor approval).
4. Update the frontend discount UI (search src/components/buildpos/pos/ for the discount input, likely
   inside PosCheckout.tsx or a dialog) so the cashier sees why a discount was blocked/requires approval,
   consistent with how RequestApprovalDialog.tsx already surfaces approval requests.
5. This needs an actual role/permission model to check against — if Module 4 (role realignment) hasn't
   landed yet, use whatever role/permission fields exist today (RolePermission, ApprovalCap on Role) and
   note in your PR description that the check should be revisited once Module 4 lands.

ACCEPTANCE CRITERIA
- A user without supervisor rights cannot complete checkout with a discount above the configured cashier
  threshold without triggering an approval step.
- A user with supervisor rights can apply up to the supervisor threshold without approval, above that
  requires manager-tier approval.
- The rule applies to both percentage and fixed-amount discounts, and to bundle/quantity discounts if
  those exist by the time you implement this.
- Existing coupon/trade-account auto-discounts (which the BRD says need NO runtime approval) must
  continue to apply with zero friction — don't accidentally gate those.

TESTING REQUIREMENT (uses the shared setup from Module 0)
- Backend integration tests against the checkout endpoint: a cashier-role user requesting a 3% discount
  succeeds unmodified; a cashier-role user requesting an 8% discount is rejected or routed to approval;
  a supervisor-role user requesting 12% succeeds; a manager-role user requesting 20% succeeds; the same
  matrix repeated for fixed-amount discounts. Also assert a coupon/trade-account discount above 15%
  still applies with zero approval friction.
- Frontend component test: the discount input shows the correct blocked/approval-needed state for a
  mocked low-privilege user attempting an over-threshold discount.
```

## Module 2 — Loyalty points calculation fix

```
PROJECT CONTEXT
BuildPOS, Building Materials ECR/POS. Repo root: e:/MartProject/building-ecr.
Backend: ASP.NET Core 10 + EF Core (backend/src/EcrBuilding.*). Frontend: React 19 (src/).

TASK: Fix a real bug — loyalty points are currently earned on VAT and delivery fees, which the BRD
explicitly forbids, and there's no per-category accrual rate.

BACKGROUND
Points are awarded in OrdersController.cs (around lines 251-260) using
LoyaltyRules.PointsForSar(order.GrandTotal - loyaltyAmount). order.GrandTotal includes VAT and any
delivery fees (order.Fees), so points are currently earned on both — the BRD says points must NOT be
awarded on VAT amounts, delivery fees, or any portion paid using redeemed loyalty points.
LoyaltyRules (backend/src/EcrBuilding.Domain/Common/LoyaltyRules.cs) has one flat SarPerPointEarned
constant — there's no per-product-category accrual rate multiplier as the BRD requires (e.g. 2x on
featured categories during promotions).

WHAT TO BUILD
1. Change the points calculation to use the taxable, fee-excluded subtotal — i.e. sum of order line
   totals excluding VAT and excluding any delivery/handling fee lines — minus whatever portion was paid
   via redeemed loyalty points.
2. Add a per-category accrual-rate concept: either a multiplier field on Category (or a new
   CategoryLoyaltyRate concept) that OrdersController reads when computing points per line, defaulting to
   1x when not configured.
3. Confirm points are only credited after full payment is confirmed (this part is already correct —
   don't break it).
4. Add/update the receipt output so it shows points earned this transaction, updated balance, and next
   tier threshold (check EscPosBuilder.cs and ReceiptDialog.tsx — this data may need a new field on
   whatever DTO feeds the receipt).

ACCEPTANCE CRITERIA
- A transaction with cash total X (excl. VAT), VAT Y, and delivery fee Z awards points on X only, never
  on Y or Z.
- A transaction partially paid with redeemed loyalty points does not earn points on that redeemed portion.
- A category with a configured 2x accrual multiplier earns double points on qualifying lines versus a
  standard category, verified with a real seeded product in each.
- Receipt shows points earned / balance / next tier threshold.

TESTING REQUIREMENT (uses the shared setup from Module 0)
- Backend unit test on the points-calculation function directly: given a known subtotal, VAT amount, and
  delivery fee, assert points are computed only on the subtotal. A second case with a partial
  loyalty-points redemption confirms the redeemed portion is excluded too.
- Backend integration test: a full checkout through the real endpoint with a mixed cart (taxable lines +
  a delivery fee) awards the mathematically correct point count, not GrandTotal-based points.
- Backend test asserting a category configured with a 2x multiplier awards double points versus a
  default-rate category, using two real seeded products.
- Frontend test confirming the receipt component renders points earned / balance / next-tier threshold
  from a mocked order response.
```

## Module 3 — B2B credit limit enforcement

```
PROJECT CONTEXT
BuildPOS, Building Materials ECR/POS. Repo root: e:/MartProject/building-ecr.
Backend: ASP.NET Core 10 + EF Core (backend/src/EcrBuilding.*). Frontend: React 19 (src/).

TASK: Make the B2B/Contractor credit limit actually mean something at checkout — right now it's a
purely cosmetic field.

BACKGROUND
Customer.CreditLimit and Customer.Outstanding (backend/src/EcrBuilding.Domain/Entities/Customer.cs)
exist and are displayed in CustomersPage.tsx and CustomerStatementDialog.tsx, but
OrdersController.Checkout never reads CreditLimit or Outstanding, never blocks or warns when a sale
would exceed the limit, and never updates Outstanding after a credit sale completes. The field is
effectively dead outside of manual display.

WHAT TO BUILD
1. In OrdersController.Checkout, when the attached customer is a B2B/Contractor type and the payment
   method involves Account Credit (or the order is left partially/unpaid against the account), check
   whether Outstanding + this order's balance-due would exceed CreditLimit.
2. If it would exceed the limit: block the sale by default, but allow a supervisor/manager override
   (reuse the approval pattern from Module 1 if that's landed, otherwise a simple role check) — the BRD
   allows either "block or warn," so implement block with override, which is the stricter and more useful
   behavior.
3. After a credit-based sale completes, increment Customer.Outstanding by the unpaid/credit portion.
   Make sure returns/refunds that credit a B2B account (see Module 6) decrement Outstanding correctly —
   these two need to stay consistent.
4. Surface the current credit status (limit, outstanding, available credit) directly in the POS checkout
   screen when a B2B customer is attached, not just in the back-office Customers module — check
   PosCheckout.tsx for where the customer is attached and add a small credit-status indicator there.

ACCEPTANCE CRITERIA
- Attaching a B2B customer whose Outstanding is already at or near CreditLimit and attempting a credit
  sale that would exceed it is blocked (with an override path for supervisors).
- Completing a credit sale increases Outstanding by the correct amount.
- The POS checkout screen visibly shows the customer's available credit before the cashier commits to
  payment method.

TESTING REQUIREMENT (uses the shared setup from Module 0)
- Backend integration test: a B2B customer seeded with Outstanding near CreditLimit attempting a credit
  sale that would exceed it is blocked; a supervisor-role override succeeds; a non-credit payment method
  is never blocked regardless of Outstanding.
- Backend test confirming Outstanding increases by the correct unpaid/credit amount after a completed
  credit sale, and (once Module 6 lands) decreases correctly after a damaged/surplus return credit.
- Frontend test: attaching a B2B customer with known CreditLimit/Outstanding in PosCheckout renders the
  correct available-credit figure.
```

## Module 4 — Role model realignment

```
PROJECT CONTEXT
BuildPOS, Building Materials ECR/POS. Repo root: e:/MartProject/building-ecr.
Backend: ASP.NET Core 10 + EF Core (backend/src/EcrBuilding.*). Frontend: React 19 (src/).

TASK: Realign the role/permission model to match the BRD's 5-tier ladder with graduated numeric limits,
instead of the current generic per-module RBAC.

BACKGROUND
The BRD specifies exactly 5 roles — Cashier, Senior Cashier, Supervisor, Store Manager, System Admin —
each with specific numeric permissions (discount % ceiling, return authorization value ceiling, etc. —
see BRD section 10.1's table for exact numbers per role). The actual seeded roles today
(backend/src/EcrBuilding.Infrastructure/Persistence/Seed/DbSeeder.cs, roughly lines 145-227) are Owner,
Admin, Branch Manager, Cashier, Warehouse Staff, Delivery Driver, HR Officer, Accountant — a generic
ModuleArea × AccessLevel{None,View,Edit,Full} RBAC plus a single flat ApprovalCap decimal per role.
This doesn't carry graduated discount-%, return-value, or void-authorization limits at all.

WHAT TO BUILD
1. Decide (and document in the PR) whether to: (a) add the BRD's 5 roles alongside the existing 8 as a
   distinct "POS operational role" layer used specifically for discount/return/void authorization checks
   (recommended — the existing 8 roles look like they serve broader admin/HR/warehouse access control
   that the BRD doesn't cover, so don't just delete them), or (b) fully replace the role table. Read
   RolesController.cs and Role.cs/RolePermission.cs fully before deciding.
2. Add the specific numeric ceilings the BRD requires per role: discount % ceiling, surplus-return-value
   ceiling, damaged/any-value return authorization flag, void authorization flag, X-report/Z-report access,
   price-list/settings management flag.
3. Seed the 5 BRD roles with their exact numeric values from BRD section 10.1's table.
4. Update RolesController and the admin.roles.tsx frontend page to manage these new fields.
5. This module is a dependency for Module 1 (discount tiers), Module 15 (auth hardening), and
   Module 17 (void authorization) — those modules need a real role field to check against, so land this
   one first if possible, or coordinate closely if working in parallel.

ACCEPTANCE CRITERIA
- All 5 BRD roles exist and are assignable to users.
- Each role's discount %, return authorization, and void authorization ceilings match the BRD's table
  exactly and are enforced (not just stored) once Modules 1/6/17 read them.
- Existing admin/HR/warehouse role usage elsewhere in the app is not broken by this change.

TESTING REQUIREMENT (uses the shared setup from Module 0)
- Backend test seeding all 5 BRD roles and asserting each numeric ceiling (discount %, return-value,
  void-authorization) matches the BRD's table exactly.
- Backend integration tests on RolesController CRUD covering create/update/assign for the new fields.
- Regression test confirming existing admin/HR/warehouse role-gated endpoints still authorize correctly
  for users on the pre-existing 8-role model, proving this change is additive, not destructive.
- Frontend test: admin.roles.tsx renders and saves the new ceiling fields correctly for a mocked role.
```

## Module 5 — UOM conversion engine + cut-to-size dimension entry

```
PROJECT CONTEXT
BuildPOS, Building Materials ECR/POS. Repo root: e:/MartProject/building-ecr.
Backend: ASP.NET Core 10 + EF Core (backend/src/EcrBuilding.*). Frontend: React 19 (src/).

TASK: Build the Unit-of-Measure conversion engine. The BRD calls this its single most technically
distinctive, CRITICAL requirement, and it currently does not exist as real logic — only cosmetic fields.

BACKGROUND
Product.StockUom (string) and Product.SellUomsJson (backend/src/EcrBuilding.Domain/Entities/Catalog.cs,
around lines 35-36) exist, but SellUomsJson deserializes to a plain string[] of UOM name labels — there
is no conversion-factor field or entity anywhere (e.g. no way to express "1 pallet = 50 bags" or
"1 bundle = 12 pieces"). In the POS cart, CartLine (src/components/buildpos/PosCheckout.tsx, around
line 86) hard-locks the line's UOM to the product's stock UOM at add-to-cart time (line ~141) — there is
no UOM dropdown next to the quantity control anywhere in the cart UI. There is also no dimension-entry
(length × width) support for cut-to-size products like glass, timber, or cable — the seeded glass SKU
(GLASS-6MM-CLR, stock UOM "m²") is sold as a flat unit like anything else.

WHAT TO BUILD
1. Backend: add a conversion-factor model. Likely a new entity e.g. ProductUomConversion
   (ProductId, FromUom, ToUom, Factor) or a structured field replacing SellUomsJson with
   { Uom: string, ConversionToStockUom: decimal }[]. Make it admin-configurable via the existing catalog
   admin endpoints/UI (CatalogController.cs, admin.categories.tsx or wherever products are edited).
2. Backend: at checkout, when a cart line specifies a selling UOM different from stock UOM, convert the
   entered quantity to stock UOM using the configured factor before deducting from BranchStockLevel.OnHand
   (see OrdersController.cs around lines 147-158 for the current atomic deduction logic — this needs to
   deduct converted quantity, not raw entered quantity).
3. Frontend: add a UOM selector (dropdown) next to the quantity control in the POS cart line UI in
   PosCheckout.tsx. When the cashier changes UOM mid-line, recompute price and quantity-for-deduction
   using the conversion factor, live.
4. Frontend + backend: for products flagged as cut-to-size (add a boolean/attribute to Product, e.g.
   IsCutToSize), replace the plain quantity field with length × width dimension inputs when such a
   product is added to the cart. Auto-calculate area (or linear quantity for cable/timber) from the
   dimensions, and auto-calculate the line price as price-per-m² (or per-metre) × calculated quantity.
5. Make sure the receipt and order line storage record both the entered selling-UOM quantity/dimensions
   AND the converted stock-UOM quantity actually deducted, for audit purposes.

ACCEPTANCE CRITERIA
- An admin can configure, per product, a stock UOM and at least 2 selling UOMs with conversion factors.
- A cashier can pick a different selling UOM from a dropdown next to the quantity field in the cart, and
  the displayed price updates accordingly.
- Adding a cut-to-size product (e.g. glass) to the cart presents length × width fields, and the system
  auto-calculates area and price per m².
- Completing a sale in any selling UOM deducts the mathematically correct quantity from stock in stock
  UOM — verify with a product where 1 pallet = 50 bags: selling 1 pallet deducts 50 bags of on-hand stock,
  not 1.

TESTING REQUIREMENT (uses the shared setup from Module 0)
- Backend unit tests on the conversion-factor math in isolation: 1 pallet = 50 bags converts correctly in
  both directions; an unconfigured/missing conversion factor fails loudly rather than silently defaulting
  to 1:1.
- Backend integration test: checking out a cart line sold in an alternate UOM deducts the correct
  converted quantity from BranchStockLevel.OnHand.
- Backend unit test on cut-to-size area calculation: given length × width, assert the computed area and
  the resulting price-per-m² line total are correct, including at least one non-square (rectangular)
  dimension case.
- Frontend test: selecting a different UOM from the cart-line dropdown updates displayed price/quantity
  correctly; adding a cut-to-size product renders dimension inputs and computes area live as values change.
```

## Module 6 — Three-way return workflow (Standard / Damaged / Surplus)

```
PROJECT CONTEXT
BuildPOS, Building Materials ECR/POS. Repo root: e:/MartProject/building-ecr.
Backend: ASP.NET Core 10 + EF Core (backend/src/EcrBuilding.*). Frontend: React 19 (src/).

TASK: Build the BRD's other CRITICAL requirement — a real three-way differentiated return workflow
for Standard, Damaged/Defective, and Surplus/Excess returns. Today all three collapse into one generic
Return entity/flow that only differs in whether stock gets restocked.

BACKGROUND
Return entity and ReturnType enum (Standard/Surplus/Damaged/Exchange) already exist
(backend/src/EcrBuilding.Domain/Entities/Finance.cs), handled by FinanceController.cs, with a UI in
CreateReturnDialog.tsx. Today: return creation always sends every line of the original order (no partial
line/qty picker); Reason is free text (no Damage Reason Code enum); there's no photo reference field, no
damaged-qty-vs-original validation, no DGRN (Damaged Goods Return Note) generation anywhere in the
codebase; damaged stock is correctly excluded from restock (FinanceController.cs ~lines 195-207) but
there's no real quarantine location entity; there's no restocking-fee calculation anywhere (a
"Surplus Restocking Fee" pricing rule exists only as unused seed data in DbSeeder.cs ~line 513); there's
no pre-confirm cashback preview, no dedicated Refund Payment screen (only PaymentDialog.tsx exists, used
for sales), no VAT-reversal line shown to the user, no cashback-method selection, no B2B account-credit
posting, and no dual-PIN gate for cash refunds above SAR 500.

This is the largest module in the plan. Consider splitting it across multiple sessions using the
sub-tasks below as natural boundaries — each sub-task is independently shippable on top of the same
Return entity.

WHAT TO BUILD

Sub-task A — Standard returns:
- Rebuild return creation so the cashier picks specific lines and quantities from the original order
  (not the whole order automatically), with server-side validation that the requested return quantity
  does not exceed original quantity minus any prior returns already processed against that line.
- Enforce the configurable return window (default 15 days from purchase) — returns beyond it require
  supervisor authorization with a mandatory reason code. Category.ReturnRule already holds a decorative
  string ("Standard 15 days") — wire actual date-math logic to read/enforce it (make it structured, not
  just a display string, if needed).
- Build the linked exchange workflow: a return and a new sale in one transaction, with the net
  payable/receivable calculated automatically. ReturnType.Exchange exists but has no distinct handling —
  build it.

Sub-task B — Damaged/Defective returns:
- Replace the free-text Reason field (for Damaged returns specifically) with a mandatory Damage Reason
  Code enum: Manufacturing Defect, Transit Damage, Incorrect Product Supplied, Quality Below
  Specification, Other.
- Add an optional photo reference field (a string/URL is enough — don't build image upload
  infrastructure unless one already exists elsewhere in the app; check for an existing attachment/upload
  pattern first).
- Validate damaged quantity does not exceed the original purchased quantity.
- Generate a DGRN (Damaged Goods Return Note) — a real document/number (e.g. DGRN-{yyyy}-{seq}, following
  the same pattern as Order.OrderNo / Return.ReturnNo) referencing original transaction ID, SKU, damage
  code, quantity, and the authorizing manager. Add a print/PDF view for it alongside the existing receipt
  printing infrastructure (EscPosBuilder.cs has the pattern to follow for thermal printing, or add a
  simple print view if a full document isn't needed yet).
- Add a real quarantine stock concept — either a dedicated warehouse/bin location entity, or at minimum a
  distinct StockBatchStatus/location value that's queryable and reportable, so damaged stock is not just
  "not restocked" but visibly tracked somewhere pending QA assessment.
- Add manager-authorization gating on the Approve action specifically for Damaged returns (use the role
  model from Module 4).
- For B2B customers, post the damaged-return credit to Customer.Outstanding (decrease it), consistent
  with Module 3's credit tracking.
- Add damaged returns to a daily exception report queryable by purchasing/QA (this can be a simple
  filtered endpoint for now; Module 12 will build the full reporting engine).

Sub-task C — Surplus/Excess returns:
- Enforce eligibility rules: product must be unopened/unused (there's no "opened" state to check
  today — this may just be a cashier attestation checkbox, be pragmatic), return window (default 90 days,
  configurable), and category exclusions. Product.Returnable / Category.Returnable booleans already exist
  but are never read anywhere — wire them in, and grey out / block non-returnable items in
  CreateReturnDialog.tsx with a clear "Non-Returnable" label.
- Validate surplus return quantity against original quantity minus any prior returns on that line.
- Build the Return Value Calculation preview: show original unit price, trade discount applied at
  purchase, restocking fee (see below), net refund, and VAT reversal amount — shown to the cashier BEFORE
  they confirm the return.
- Build the configurable restocking-fee engine: a percentage fee per category (the existing but unused
  "Surplus Restocking Fee" seed rule is the intended shape — make RulesController/FinanceController
  actually read and apply it), clearly displayed and deducted from the cashback.
- Confirm stock reintegration to sellable inventory already works (it does, per FinanceController.cs
  ~195-207) — just make sure the restocking fee doesn't affect the physical stock reintegration quantity,
  only the cashback amount.
- Report surplus returns separately from damaged returns everywhere (this feeds Module 12).

Sub-task D — Cashback/refund processing rules (applies to all three types):
- Always calculate and display the cashback amount to the cashier before they can confirm any return.
- Build a dedicated Refund Payment screen, distinct from PaymentDialog.tsx (which is sale-only today) —
  it should show: refund amount, VAT-exclusive amount + VAT reversal amount as separate lines, restocking
  fee deduction if any, and let the cashier pick a cashback method (same method as original payment by
  default, cash, or store credit / account credit for B2B).
- For mixed-method original payments, default to splitting cashback proportionally across the original
  payment methods, with a supervisor override to change the split.
- Enforce dual-PIN authorization (cashier PIN + supervisor PIN) for any cash refund above a configurable
  threshold (default SAR 500) — this needs Module 15's real PIN infrastructure; if that hasn't landed
  yet, implement with whatever auth mechanism exists today and flag it for revisit.
- Ensure every return/refund is logged with: return type, original transaction ID, refund method,
  authorizing user, and timestamp (some of this logging already exists — extend it, don't duplicate it).

ACCEPTANCE CRITERIA (mirrors BRD acceptance criteria 5-8)
- A damaged-goods return completes end-to-end: damage code selected, DGRN generated, stock moved to
  quarantine (not sellable), full cashback processed with VAT reversal shown on the return receipt.
- A surplus return of an eligible product correctly calculates cashback with restocking fee deducted;
  stock is reintegrated to sellable inventory; the return receipt shows all components.
- Attempting a surplus return of a non-returnable product (e.g. custom-tinted paint, cut-to-size glass)
  is blocked with a clear message.
- A cash refund above SAR 500 requires dual-PIN authorization before it can be processed.
- Standard, Damaged, and Surplus returns are distinguishable from each other in every report and audit
  log entry that touches returns.

TESTING REQUIREMENT (uses the shared setup from Module 0)
This module is large enough that tests should be written per sub-task, alongside that sub-task's code,
rather than saved for the end.
- Sub-task A: backend tests for partial-line/qty return selection validation (rejects returning more
  than original-minus-prior-returns); a return attempted past the 15-day window without supervisor auth
  is rejected, with auth it succeeds; an Exchange-type return correctly nets the return against a linked
  new sale.
- Sub-task B: backend tests asserting Damage Reason Code is mandatory (request without one is rejected);
  damaged quantity exceeding original purchase quantity is rejected; DGRN numbers are generated,
  sequential, and unique; damaged stock lands in the quarantine location/status and never appears as
  sellable `OnHand`; approval requires a manager-tier role (Module 4) and is rejected for a plain cashier.
- Sub-task C: backend tests asserting non-returnable products/categories are blocked with a clear error;
  the restocking-fee percentage is correctly computed and deducted from cashback for a configured
  category; stock reintegration quantity is unaffected by the fee (fee only affects cashback amount, not
  physical stock).
- Sub-task D: backend unit tests on the cashback-calculation function covering VAT reversal and
  restocking-fee deduction math in isolation; a test asserting a cash refund above SAR 500 is rejected
  without two valid PINs and succeeds with them; a test asserting mixed-method original payments split
  cashback proportionally by default.
- Add two Playwright end-to-end tests matching the BRD's own acceptance criteria word-for-word: one
  walking through a full damaged-goods return (damage code → DGRN → quarantine → cashback with VAT
  reversal shown), one walking through a full surplus return (eligibility check → restocking fee →
  cashback → stock reintegrated). These are the two acceptance-criteria items in the whole BRD explicit
  enough to warrant a dedicated e2e test rather than component/integration tests alone.
```

## Module 7 — Loyalty tier benefits wiring

```
PROJECT CONTEXT
BuildPOS, Building Materials ECR/POS. Repo root: e:/MartProject/building-ecr.
Backend: ASP.NET Core 10 + EF Core (backend/src/EcrBuilding.*). Frontend: React 19 (src/).

TASK: Wire real tier-based benefits into the loyalty program — today only point accrual/redemption
exist; tiers carry no discount, multiplier, or perk logic at all.

BACKGROUND
LoyaltyTier enum (backend/src/EcrBuilding.Domain/Common/LoyaltyRules.cs) is Standard/Silver/Gold/Platinum,
keyed on lifetime POINTS at thresholds 0/500/2,000/5,000 — nothing like the BRD's SAR-SPEND-based bands
(Bronze SAR 0-4,999, Silver SAR 5,000-19,999, Gold SAR 20,000-49,999, Platinum SAR 50,000+). There is no
"Bronze" tier name today (it's called "Standard"). No point multiplier (1x/1.5x/2x/3x) exists anywhere —
PointsForSar uses one flat rate regardless of tier. No tier discount (5%/10%/15%) or perk (free delivery
over SAR 500, dedicated account manager for Gold, priority billing for Platinum) is wired into any
pricing/checkout logic anywhere. This depends on Module 2 (loyalty points calc fix) being done first or
in parallel, since both touch the same points-calculation code path.

WHAT TO BUILD
1. Change the tier-qualification basis from lifetime points to cumulative SAR spend, matching the BRD's
   exact bands (Bronze/Silver/Gold/Platinum at the SAR thresholds above). Rename "Standard" to "Bronze"
   throughout (enum, UI labels, translations in src/locales/*.ts).
2. Add a point multiplier per tier (1x/1.5x/2x/3x) and apply it in the points-accrual calculation from
   Module 2.
3. Add tier discount percentages (Silver 5% on select categories, Gold 10% on all categories, Platinum
   15%) and apply them automatically in checkout pricing when a loyalty customer of that tier is attached
   — this is a real pricing-logic change in OrdersController.cs, not just a display field.
4. Add free-delivery-over-SAR-500 logic for Silver+ tiers, wired into whatever computes delivery fees
   (check DeliveryOrdersController.cs / DeliveryDtos.cs for where fees are calculated).
5. Add a "dedicated account manager" reference field for Gold+ customers (can be a simple assigned-user
   FK, displayed in CustomerStatementDialog.tsx / CustomersPage.tsx) and a "priority project billing" flag
   for Platinum (can start as a display/sort-order flag if the actual billing workflow doesn't
   distinguish priority yet).
6. Show the customer's current tier, discount %, and progress to next tier in the POS checkout screen
   when a loyalty customer is attached (PosCheckout.tsx).

ACCEPTANCE CRITERIA
- A customer's tier is computed from cumulative SAR spend matching the BRD's bands exactly.
- A Gold-tier customer automatically receives a 10% discount at checkout without any manual action by
  the cashier.
- A Silver+ tier customer's delivery fee is waived on orders above SAR 500.
- Points accrue at the correct multiplier for the customer's current tier.

TESTING REQUIREMENT (uses the shared setup from Module 0)
- Backend unit tests asserting tier computation from cumulative SAR spend matches the BRD's bands exactly
  at each boundary (e.g. SAR 4,999 = Bronze, SAR 5,000 = Silver).
- Backend integration test: checking out as a seeded Gold-tier customer applies the 10% discount
  automatically with no manual cashier action; a Silver-tier customer's order above SAR 500 has its
  delivery fee waived, at/under SAR 500 it is not.
- Backend unit test confirming points accrue at the tier's configured multiplier (1x/1.5x/2x/3x).
- Frontend test: PosCheckout renders the correct tier badge/discount indicator for a mocked customer at
  each tier.
```

## Module 8 — Bundle-to-POS integration

```
PROJECT CONTEXT
BuildPOS, Building Materials ECR/POS. Repo root: e:/MartProject/building-ecr.
Backend: ASP.NET Core 10 + EF Core (backend/src/EcrBuilding.*). Frontend: React 19 (src/).

TASK: Make product bundles actually sellable through the POS. Today ProductBundle/BundleLine
(backend/src/EcrBuilding.Domain/Entities/Catalog.cs, ~lines 48-67) exist with full admin CRUD via
CatalogController.cs's BundlesController, and there's an admin-facing pricing table in the frontend
(stock.bundles.tsx / src/lib/api/bundles.ts) — but OrdersController.cs has zero references to Bundle
anywhere. A bundle cannot be added to a cart, scanned, or sold at all today. The BRD's "Bundles &
Packages" POS tab shown in its own visual mockup has no functional counterpart.

WHAT TO BUILD
1. Add a bundle-type field to ProductBundle if it doesn't cleanly map today — the BRD describes 6 types
   (Product System Bundle, Project Starter Pack, Quantity/Pallet Bundle, Trade Value Bundle,
   Cross-Category Bundle, Promotional Bundle). At minimum these need to be distinguishable for reporting;
   they likely don't need entirely separate code paths if the underlying mechanic (constituent lines +
   combined price) is the same for all of them.
2. Backend: add checkout support for adding a bundle to an order — when a bundle is added, expand it into
   its constituent ProductBundle/BundleLine items as individual order lines, each tagged with a shared
   BundleId/BundleSaleId so they're visually grouped, with the combined bundle discount computed and
   shown as one discount line (not blended into each item's price).
3. Backend: VAT must be calculated per constituent item at its own individual VAT rate — never a blended
   bundle-wide rate. Verify this explicitly with a bundle containing items at different VAT rates if any
   exist (e.g. standard-rated vs zero-rated), otherwise note it as untested.
4. Frontend: add a "Bundles & Packages" tab/section to the POS product browse area in PosCheckout.tsx,
   showing bundle cards with constituent summary, individual-total vs bundle-price, and savings %.
   Scanning/searching any constituent product's SKU should surface the bundle as a suggestion.
5. Frontend: support a partial-match nudge — if the cart already contains 80%+ of a bundle's constituent
   items, suggest completing the bundle for the additional discount.
6. Frontend: let the cashier adjust quantities within a bundle (e.g. add extra bags to a cement pallet
   bundle) and recompute the bundle price accordingly.
7. Frontend: grey out bundles where any constituent is out of stock, labeled "Unavailable — [item] Out of
   Stock" — this needs to read current stock levels the same way individual products do in PosCheckout.tsx.
8. Add a Bundle Sales Report (units sold, revenue at bundle price vs. individual price, discount value
   given) — coordinate with Module 12 if that's in progress, since it's building the reporting engine.

ACCEPTANCE CRITERIA
- A cashier can add a bundle to the cart from the Bundles & Packages tab or by scanning any constituent
  item, and all constituent items appear as individual, correctly-priced, correctly-VAT'd lines tagged to
  the bundle.
- The receipt itemizes all bundle constituents as separate lines with a subtotal line showing bundle
  discount and bundle total.
- A bundle with an out-of-stock constituent shows as unavailable in the browse UI.
- A Bundle Sales Report exists showing units sold and discount value given per bundle.

TESTING REQUIREMENT (uses the shared setup from Module 0)
- Backend integration test: adding a bundle to checkout expands into the correct constituent order lines,
  each carrying its own individual VAT rate (test with a bundle containing items at two different VAT
  rates to prove no blended rate is used), plus one combined discount line.
- Backend test: a bundle with an out-of-stock constituent is rejected/flagged unavailable at checkout.
- Backend test for the Bundle Sales Report endpoint asserting correct units-sold and discount-value
  aggregation against seeded bundle sales.
- Frontend tests: bundle card renders constituent summary and correct savings %; scanning a constituent
  SKU surfaces the bundle suggestion; adding items matching 80%+ of a bundle's composition triggers the
  completion nudge.
```

## Module 9 — Real payment gateway integration

```
PROJECT CONTEXT
BuildPOS, Building Materials ECR/POS. Repo root: e:/MartProject/building-ecr.
Backend: ASP.NET Core 10 + EF Core (backend/src/EcrBuilding.*). Frontend: React 19 (src/).

TASK: Replace the mock payment gateway with a real card/mobile-wallet integration. This is the single
biggest production blocker found in the audit.

BACKGROUND
MockPaymentGateway.ChargeAsync (backend/src/EcrBuilding.Infrastructure/Payments/MockPaymentGateway.cs)
always returns success with a random fake reference — its own comment says "Always succeeds — happy-flow
only." IPaymentGateway (backend/src/EcrBuilding.Application/Abstractions/IPaymentGateway.cs) is the
interface to implement against. PaymentMethod enum (backend/src/EcrBuilding.Domain/Entities/Order.cs)
already lists ApplePay and StcPay, so the enum shape is ready — only the actual gateway call is missing.
Cheque and Account Credit payment methods don't exist in the enum at all yet and should probably be added
here too since they're closely related BRD requirements (§7.1).

WHAT TO BUILD
1. Pick and integrate a real payment provider/terminal SDK for Mada/Visa/Mastercard card processing —
   this requires a business decision (which acquirer/PSP to integrate with) that should be confirmed with
   whoever owns vendor relationships before writing code; don't guess a provider.
2. Implement IPaymentGateway against the chosen real provider, replacing (not deleting — keep Mock
   available for local dev/testing) MockPaymentGateway as the production implementation, selected via
   configuration (backend/src/EcrBuilding.Infrastructure/DependencyInjection.cs).
3. Wire real mobile wallet support (STC Pay, Apple Pay) — likely through the same PSP if it supports
   wallet acceptance, or a separate wallet-specific SDK.
4. Add PaymentMethod.Cheque (record cheque number, bank, date — B2B only) and
   PaymentMethod.AccountCredit (B2B only, must check against Module 3's credit-limit logic) to the enum
   and to OrdersController's payment handling and PaymentDialog.tsx.
5. Persist TenderedAmount and ChangeDue on OrderPayment for cash transactions (currently computed
   client-side only in PaymentDialog.tsx and never sent to/stored by the backend) so it can appear on the
   receipt and in reports.
6. Make Bank Transfer genuinely land in "Pending" status until a real confirmation step occurs (today the
   mock gateway always returns success, so Transfer never actually stays pending in practice) — this
   should now work correctly once the mock is replaced for that path, but verify it.

ACCEPTANCE CRITERIA
- A real card payment goes through an actual PSP/terminal integration and can genuinely fail (e.g.
  insufficient funds, declined card) — not just always succeed.
- Cheque and Account Credit are selectable payment methods for B2B customers, with cheque details
  recorded and account credit correctly checked against/updating the customer's credit limit (Module 3).
- A cash sale's tendered amount and change due are persisted server-side and appear on the printed
  receipt.
- Split payment across 3+ different methods (not just Cash+Card) completes without error, matching BRD
  acceptance criterion 4.

TESTING REQUIREMENT (uses the shared setup from Module 0)
- Backend integration tests against the real gateway's sandbox/test mode: a known test card that
  succeeds, and a known test card that the provider documents as "always declined" — the second must
  produce a real failure surfaced to the caller, proving this isn't the old always-succeeds mock.
- Backend test: Cheque and Account Credit payment methods are accepted only for B2B customers and
  correctly reject/require the credit-limit check from Module 3.
- Backend test: TenderedAmount/ChangeDue persist on OrderPayment for a cash transaction and are retrievable
  afterward.
- Backend test: split payment across 3 distinct methods in one transaction completes and each method is
  recorded as a separate OrderPayment row.
- Frontend test: PaymentDialog shows a clear, specific error state when the gateway returns a decline,
  rather than treating it as success.
```

## Module 10 — Offline transaction queue + sync

```
PROJECT CONTEXT
BuildPOS, Building Materials ECR/POS. Repo root: e:/MartProject/building-ecr.
Backend: ASP.NET Core 10 + EF Core (backend/src/EcrBuilding.*). Frontend: React 19 (src/).

TASK: Build genuine offline mode — this is currently completely absent and fails an explicit BRD
acceptance criterion ("Offline mode processes 50 transactions and syncs all on reconnection with no data
loss").

BACKGROUND
AppLayout.tsx (src/components/buildpos/AppLayout.tsx, ~lines 196-207, 423-424) listens to
navigator.onLine/online/offline events, but only to show a cosmetic "Online/Offline" navbar pill — there
is no IndexedDB, no service worker, no local write-queue anywhere in the frontend. Checkout is a
synchronous REST call (useCheckout → POST /api/pos/orders in src/lib/api/pos.ts) with no offline fallback.
A network outage today simply fails the checkout attempt with zero local persistence of the sale.

WHAT TO BUILD
1. Frontend: add a local write-queue for checkout (and likely returns/void) requests — IndexedDB is the
   right tool for this in a browser context; a service worker is optional but recommended for reliable
   background sync. When navigator.onLine is false (or a request fails due to network error), write the
   full checkout payload to the local queue instead of failing, and show the cashier a clear
   "saved offline, will sync" confirmation with a locally-generated pending reference.
2. Frontend: when connectivity returns (the 'online' event fires, or a periodic check succeeds), replay
   queued transactions against the real API in order, handling and surfacing any conflicts (e.g. a stock
   deduction that can no longer be satisfied because someone else sold the last unit while offline).
3. Backend: confirm OrdersController.Checkout is safe to receive a batch of delayed transactions with
   original client-side timestamps — the order numbering scheme (ORD-{yyyy}-{seq}) and stock deduction
   logic (already atomic/race-safe, OrdersController.cs ~147-158) should mostly cope, but explicitly test
   this and add a client-generated idempotency key to each queued transaction so a retry after a partial
   network failure doesn't double-charge/double-sell.
4. Decide how long the app can safely operate offline (the BRD's NFR table says up to 72 hours) and
   what happens if local storage fills up or a queued transaction's referenced product/customer no longer
   exists by sync time — surface these as clear exceptions to the cashier/manager, don't fail silently.
5. Extend this pattern to at minimum returns and stock enquiry (read-only cached data) if time allows —
   but checkout is the priority since it's what the acceptance criterion tests.

ACCEPTANCE CRITERIA
- With the network disabled, a cashier can complete 50 sales in a row; each is stored locally with no
  error blocking the workflow.
- Reconnecting the network automatically syncs all 50 queued transactions to the server with no data
  loss and no duplicates.
- A conflict during sync (e.g. insufficient stock at sync time) is surfaced clearly rather than silently
  dropped or silently overselling.

TESTING REQUIREMENT (uses the shared setup from Module 0)
- Frontend unit tests (Vitest, with a fake/mock IndexedDB) covering: a checkout attempted while offline is
  written to the local queue instead of failing; the queue replays in original order once back online;
  a retried transaction carrying the same idempotency key is not double-submitted server-side.
- Backend test: the checkout endpoint accepts a client-supplied idempotency key and returns the original
  result (not a duplicate order) if the same key is submitted twice.
- Add the Playwright end-to-end test named in Module 0: simulate offline network conditions, complete 50
  transactions, restore connectivity, and assert all 50 land server-side exactly once with no data loss —
  this directly proves BRD acceptance criterion 9.
```

## Module 11 — ZATCA B2B/standard invoice path

```
PROJECT CONTEXT
BuildPOS, Building Materials ECR/POS. Repo root: e:/MartProject/building-ecr.
Backend: ASP.NET Core 10 + EF Core (backend/src/EcrBuilding.*). Frontend: React 19 (src/).

TASK: Enable the standard/B2B ZATCA invoice path — the cryptography for this already exists in the
codebase and is genuinely production-grade; it's simply never invoked.

BACKGROUND
ZatcaService.cs (backend/src/EcrBuilding.Infrastructure/Zatca/ZatcaService.cs, ~lines 238-276) is
hardcoded to always submit simplified/B2C invoices (Subtype "0200000"), with a code comment stating
"this POS never captures a buyer VAT number" and "this system applies one uniform VAT rate to the whole
cart." ZatcaInvoiceSigner.cs (~lines 48-51, 183-230) already has code paths for both simplified AND
standard/unsigned invoices — the standard path exists but is never called by ZatcaService. Customer.VatNo
already exists as a field on the Customer entity.

WHAT TO BUILD
1. In ZatcaService, add logic to choose between simplified and standard invoice submission based on
   whether the attached customer is a B2B/Contractor with a captured VAT registration number — B2B sales
   should go through the standard invoice path, retail/walk-in through simplified (as today).
2. Ensure the customer's VAT registration number is actually captured and validated (format-checked) when
   creating/editing a B2B customer (CustomerFormDialog.tsx) and is passed through to the invoice-building
   step.
3. Add PO reference and project code fields to the Order (or capture them at checkout when a B2B customer
   is attached — see Module 16 for related quotation/project-code work, coordinate if both are in
   progress) and include them on the standard tax invoice output.
4. Fix per-line-rate VAT aggregation: today the whole cart is submitted at one uniform VAT rate; if the
   catalog has multi-rate items (standard/zero-rated/exempt) in the same cart, the invoice needs to
   aggregate VAT correctly per rate code rather than collapsing to one rate. Verify with a cart containing
   items at two different VAT rates.
5. Add the inclusive/exclusive VAT display toggle the BRD requires on receipts.

ACCEPTANCE CRITERIA
- A sale to a B2B customer with a captured VAT number generates and successfully submits a standard
  (non-simplified) ZATCA tax invoice, distinct from the simplified QR invoice used for retail sales.
- The B2B invoice includes the customer's VAT number, PO reference, and project code where provided.
- A cart with items at two different VAT rates produces a correctly rate-segmented VAT breakdown on both
  the receipt and the submitted invoice.

TESTING REQUIREMENT (uses the shared setup from Module 0)
- Backend unit test on the invoice-type selection logic: a B2B customer with a captured VAT number
  routes to the standard invoice path; a walk-in/retail customer (or a B2B customer with no VAT number)
  routes to simplified — cover both branches explicitly.
- Backend test asserting the standard invoice output includes VAT number, PO reference, and project code
  when provided.
- Backend unit test on VAT aggregation: a cart with lines at two different VAT rates produces correctly
  segmented per-rate totals, not one blended rate.
- Backend test for the inclusive/exclusive VAT display toggle producing mathematically consistent totals
  either way.
```

## Module 12 — Financial & operational reporting engine

```
PROJECT CONTEXT
BuildPOS, Building Materials ECR/POS. Repo root: e:/MartProject/building-ecr.
Backend: ASP.NET Core 10 + EF Core (backend/src/EcrBuilding.*). Frontend: React 19 (src/).

TASK: Build a real report-generation engine. Today's "reports" (insights.reports.tsx,
ReportDefinitionDto) are a metadata catalog — name, owner, format, frequency, status — with no code path
that actually produces a PDF/Excel file or sends a scheduled email. This module depends on Module 6
(three-way return split) for the return-type-segmented reports to have real data to report on.

BACKGROUND
InsightsController.cs has category-level sales/return aggregates and a KPI endpoint, which work and
should be reused/extended rather than rebuilt. CSV export already works client-side in several places
(e.g. exportToCsv in CashierShiftPage.tsx) — that pattern can extend to other list views relatively
cheaply. What's missing is real PDF/Excel generation and scheduled email delivery, plus several report
types that don't exist as endpoints at all yet.

WHAT TO BUILD
1. Pick a server-side PDF/Excel generation approach (e.g. a .NET library like QuestPDF or
   ClosedXML/EPPlus — confirm licensing is acceptable for this project before adding a dependency) and
   wire it into a shared "report rendering" service that any report endpoint can use.
2. Build the following operational report endpoints (backend/src/EcrBuilding.Api/Controllers/
   InsightsController.cs or a new ReportsController): Daily Sales Summary (by register/cashier/payment
   method), Top-selling products (revenue + units), Slow-moving stock, Returns Analysis split by
   Standard/Surplus/Damaged (needs Module 6's type distinction to be meaningful), Damaged Goods Returns
   Report (DGRN listing), Surplus Returns Report (with restocking fees collected), Refund Method Report,
   Delivery order status report.
3. Build the following financial report endpoints: VAT collected/reversed by rate code and period
   (including return VAT reversals as separate lines), Revenue by customer tier, Contractor account aging
   (including return credits applied — needs Module 3/6), Discount and promotion utilization, Cash
   variance trend, Restocking fee revenue report.
4. Add PDF and Excel/CSV export to each of the above.
5. Add scheduled email delivery — a background job (check what's already used for scheduled work in this
   project, if anything, otherwise a simple hosted background service) that renders and emails configured
   reports on their configured frequency to designated addresses. This needs an actual email-sending
   integration (SMTP or a transactional email API) which doesn't exist anywhere in the codebase yet —
   confirm which provider to use before implementing.
6. Wire the existing ReportDefinitionDto registry to these real endpoints instead of being purely
   decorative metadata.

ACCEPTANCE CRITERIA
- Each report listed above is a real endpoint returning real data from the database, not mock/seed data.
- Each report can be exported to both PDF and Excel/CSV.
- At least one report can be scheduled and is actually emailed to a configured recipient at the
  configured frequency.
- The on-screen KPI dashboard (already partially working) reflects the same numbers as the exported
  reports for the same period.

TESTING REQUIREMENT (uses the shared setup from Module 0)
- Backend integration test per report endpoint: seed a known dataset (specific sales, returns, discounts,
  VAT rates) and assert each report's numbers match a hand-calculated expected result exactly — this is
  the highest-value test in this module since reports are pure aggregation logic.
- Backend smoke test per export format: PDF/Excel generation produces a non-empty file with the expected
  row count for a known dataset.
- Backend test (using a fake/test mailer) asserting a scheduled report job fires and "sends" on its
  configured frequency.
- Cross-check test: the KPI dashboard endpoint and the corresponding exported report return matching
  totals for the same seeded period.
```

## Module 13 — Cash drawer–to–sale tie-in

```
PROJECT CONTEXT
BuildPOS, Building Materials ECR/POS. Repo root: e:/MartProject/building-ecr.
Backend: ASP.NET Core 10 + EF Core (backend/src/EcrBuilding.*). Frontend: React 19 (src/).

TASK: Tie cash drawer opening to actual sale completion, and gate "no-sale" drawer opens behind
supervisor authorization. Depends on Module 9 (real payment gateway) landing first so "cash payment
completed" is a reliable, real signal to hook into.

BACKGROUND
Cash drawer control today (NetworkController/DevicesController OpenDrawer endpoint) is a standalone
device-test action — it logs an audit event (DEVICE_DRAWER_OPENED) but is not triggered by an actual
cash sale completing, and requires only generic Network-Edit access, not a supervisor-specific check for
the "no-sale" case. The printer/drawer hardware bridge (QzTrayController.cs, EscPosBuilder.cs) is
otherwise solid and should be reused, not replaced.

WHAT TO BUILD
1. When a checkout completes with Cash as (part of) the payment method, automatically trigger the
   existing drawer-open call as part of that same request/flow, rather than requiring a separate manual
   action.
2. Add a distinct "No-Sale" drawer-open action (for cashiers needing to make change, etc.) that requires
   supervisor authorization (use Module 4's role model) and is logged as a distinct event type from a
   sale-triggered open, so reports can tell the two apart.
3. Make sure drawer-open events retain user ID and timestamp logging as they do today.

ACCEPTANCE CRITERIA
- Completing a cash sale opens the drawer automatically without a separate manual step.
- Opening the drawer outside of a sale (no-sale open) requires supervisor authorization and is logged
  distinctly from a sale-triggered open.

TESTING REQUIREMENT (uses the shared setup from Module 0)
- Backend integration test: completing a cash checkout triggers exactly one drawer-open call as part of
  that request.
- Backend test: a no-sale drawer-open request from a plain cashier is rejected; from a supervisor it
  succeeds and is logged with a distinct event type from a sale-triggered open.
```

## Module 14 — Catalog expansion (categories, attributes, supplier, bin location)

```
PROJECT CONTEXT
BuildPOS, Building Materials ECR/POS. Repo root: e:/MartProject/building-ecr.
Backend: ASP.NET Core 10 + EF Core (backend/src/EcrBuilding.*). Frontend: React 19 (src/).

TASK: Expand the product catalog to cover the BRD's full 14-category structure and missing product
attributes. This is independent of Module 5 (UOM engine) but touches the same Product/Category entities —
coordinate if both are in progress simultaneously to avoid migration conflicts.

BACKGROUND
Only 7 of the BRD's 14 required top-level categories are seeded today (Cement & Binders, Steel &
Reinforcement, Tiles & Stone, Paint & Coatings, Pipes & Plumbing, Electrical, Power & Hand Tools — check
backend/src/EcrBuilding.Infrastructure/Persistence/Seed/DbSeeder.cs ~lines 388-394 for exact current
list). Missing: Aggregates & Sand, Timber & Boards, Insulation, Glass & Windows, Hardware & Fasteners,
Waterproofing, Landscaping. Category.AttributesJson is free-text labels only — no structured per-product
attribute values exist for color code, size, grade, diameter, length, R-value, or pressure rating.
Product has no supplier foreign key (Supplier is a disconnected entity) and no stock bin/aisle location
field.

WHAT TO BUILD
1. Seed the remaining 7 categories with sensible sub-categories and default UOMs, following the BRD's
   §2.1 table exactly (sub-categories, primary UOM, and notes column per category).
2. Add structured per-product custom attributes — likely a key-value attribute table
   (ProductAttribute: ProductId, AttributeName, Value) or a small set of nullable typed columns if the
   attribute set is stable enough (color code, size, grade, diameter, length, R-value, pressure rating).
   Prefer the key-value table if attribute sets vary a lot by category.
3. Add a SupplierId foreign key on Product, linking to the existing Supplier entity, and surface it in
   the product admin UI.
4. Add a stock location (bin/aisle reference) field to BranchStockLevel or Product (whichever makes more
   sense given how stock location is actually tracked physically — confirm with whoever owns warehouse
   operations if unclear) and surface it in the inventory admin UI and stock enquiry dialog.
5. Add EAN-13 barcode format/checksum validation when a barcode is entered/edited.

ACCEPTANCE CRITERIA
- All 14 BRD-specified top-level categories exist with sensible sub-categories and default UOMs.
- A product can have structured attribute values (not just free text) for at least color, size, grade,
  diameter, and R-value.
- A product can be linked to a specific supplier and a specific bin/aisle stock location, both visible in
  the relevant admin screens.

TESTING REQUIREMENT (uses the shared setup from Module 0)
- Backend test asserting all 14 BRD categories exist after seeding/migration, each with sensible
  sub-categories and a default UOM.
- Backend unit tests on EAN-13 validation: a valid checksum barcode is accepted, an invalid one is
  rejected with a clear error.
- Backend test: a product's structured attribute values (color, size, grade, diameter, R-value) persist
  and round-trip correctly through create/update/read.
- Backend test: a product correctly links to a supplier and a bin/aisle location and both are retrievable
  via the product API.
```

## Module 15 — Authentication hardening (PIN login, biometric, idle-lock, dual-PIN)

```
PROJECT CONTEXT
BuildPOS, Building Materials ECR/POS. Repo root: e:/MartProject/building-ecr.
Backend: ASP.NET Core 10 + EF Core (backend/src/EcrBuilding.*). Frontend: React 19 (src/).

TASK: Close the authentication gaps: real PIN-based POS login, real idle auto-lock, and real
concurrent dual-PIN authorization (not the current async approval queue). Depends on Module 4 (role
model) for role-aware authorization checks.

BACKGROUND
Current login (AuthController.cs, JwtTokenService.cs) is email + password. User.PinHash exists
(UsersController.cs ~lines 73-85) but is only used for kiosk-lockdown-exit and password reset, never as a
sign-in path. User.BiometricEnabled is an unused boolean column with zero capture/verification logic
anywhere. "Auto-lock after idle 3 minutes" exists only as an unused translated string across all locale
files — no idle timer is wired to anything. What's called "dual authorization" today
(RequestApprovalDialog.tsx → ApprovalsController) is an asynchronous submit-then-approve-later queue, not
a concurrent second-PIN prompt entered at the point of sale.

WHAT TO BUILD
1. Add a PIN-based quick-login mode for POS terminals (distinct from the existing email+password login,
   which can remain for back-office/admin use) — cashier enters username/ID + PIN to start a shift or
   unlock the terminal, without going through the full password flow each time.
2. Wire an actual idle-timer in the frontend (default 3 minutes, configurable) that locks the POS screen
   and requires PIN re-entry to resume, without losing the in-progress cart.
3. Decide whether biometric (fingerprint) support is worth building now given available hardware — if the
   target terminals have fingerprint readers, implement capture/verification; if not, it's reasonable to
   formally descope this specific line item and note that decision rather than build unused
   infrastructure. Flag this as a decision point for whoever owns hardware procurement.
4. Build real concurrent dual-PIN authorization for the specific moments the BRD requires it (manager
   overrides, high-value cash refunds from Module 6): a modal that requires the current cashier's PIN AND
   a second, different user's PIN with sufficient role (from Module 4) entered together before the action
   proceeds — not a queued request reviewed later.

ACCEPTANCE CRITERIA
- A cashier can log into a POS terminal using username + PIN, not just email + password.
- The POS screen locks itself after 3 minutes of inactivity and requires PIN re-entry, without losing
  the current cart.
- A cash refund above the configured threshold requires two different real people's PINs entered at the
  same point in the flow, verified against their role, before it proceeds.

TESTING REQUIREMENT (uses the shared setup from Module 0)
- Backend test: PIN login succeeds with a correct username+PIN pair and fails with an incorrect one,
  independently of the existing email+password path.
- Frontend test (Vitest fake timers): the POS screen locks after the configured idle duration and the
  in-progress cart is preserved and restored correctly after PIN re-entry.
- Backend test: the dual-PIN action rejects a single PIN, rejects two PINs from the same user, and
  succeeds only with two distinct users where the second holds sufficient role (Module 4).
```

## Module 16 — Quotation & delivery POS integration

```
PROJECT CONTEXT
BuildPOS, Building Materials ECR/POS. Repo root: e:/MartProject/building-ecr.
Backend: ASP.NET Core 10 + EF Core (backend/src/EcrBuilding.*). Frontend: React 19 (src/).

TASK: Connect the quotation and delivery-order features to the live POS cart, instead of being
disconnected side-flows.

BACKGROUND
Pressing "Convert to quotation" in the POS cart today just shows a "coming soon" toast
(PosCheckout.tsx ~lines 609-615) — QuotationFormDialog.tsx is a completely separate builder with its own
product search, not fed from the active cart. Quotation/CreateQuotationRequest have no ProjectCode or
CustomerReference fields at all. Quotation validity defaults to 14 days in two places
(Quotation.cs and QuotationsController.cs) — the BRD specifies 15. Delivery orders are created as an
entirely separate flow (DeliveryOrdersController) rather than as a per-line flag inside the active POS
cart/checkout, and delivery status isn't visible from the main order view in the POS.

WHAT TO BUILD
1. Make the POS "Convert to quotation" button actually take the current cart's contents and hand them to
   the quotation creation flow (either inline, or by passing cart state into QuotationFormDialog.tsx
   pre-populated) instead of showing a stub toast.
2. Add mandatory ProjectCode and CustomerReference fields to Quotation/CreateQuotationRequest and to the
   quotation form UI.
3. Fix the validity default from 14 to 15 days in both places it's set.
4. Add a print/receipt view for quotations (there isn't one today).
5. Add a per-line "requires delivery" flag directly in the POS cart UI (PosCheckout.tsx), so a cashier can
   mark specific items for delivery as part of the same checkout flow, rather than creating a fully
   separate delivery order afterward. When flagged, capture delivery address/date/driver preference
   inline and forward to the existing DeliveryOrdersController creation logic.
6. Surface delivery status (Pending/Dispatched/Delivered) directly on order rows in OrdersPage.tsx /
   PosCheckout.tsx's order history, not just in the separate Delivery module.

ACCEPTANCE CRITERIA
- A cashier can convert the actual current cart into a quotation with one action, with project code and
  customer reference captured.
- Quotations default to 15-day validity and can be printed.
- A cashier can flag specific cart line items for delivery during checkout and capture delivery details
  without leaving the sale flow.
- Delivery status for an order is visible from the main POS order view.

TESTING REQUIREMENT (uses the shared setup from Module 0)
- Frontend test: converting the active cart to a quotation carries the correct line items, and rejects
  submission when project code or customer reference is missing.
- Backend test: quotation validity defaults to 15 days (not 14).
- Backend integration test: flagging cart lines for delivery during checkout creates a correctly-linked
  DeliveryOrder with the captured address/date/driver details.
- Frontend test: OrdersPage/PosCheckout order rows render the correct delivery status for a mocked order.
```

## Module 17 — Void & line-item granularity

```
PROJECT CONTEXT
BuildPOS, Building Materials ECR/POS. Repo root: e:/MartProject/building-ecr.
Backend: ASP.NET Core 10 + EF Core (backend/src/EcrBuilding.*). Frontend: React 19 (src/).

TASK: Add line-item void and proper authorization/reason-code tracking to voids. Depends on Module 4
(role model) for the authorization checks.

BACKGROUND
OrdersController.Void (~lines 58-85) handles whole-order void only, for both pre- and post-payment cases,
requiring only a free-text Reason with no role/PIN gate and no distinct "authorizing manager" identity —
the voiding user and the "authorizer" are the same person today. There is no line-item void
endpoint or UI at all.

WHAT TO BUILD
1. Add a line-item void endpoint and UI control (in the POS cart, per line) that removes a single item
   from an in-progress transaction, gated behind an authorization threshold from Module 4's role model
   for anything above a configurable value.
2. Replace the free-text void Reason with a reason-code enum (configurable list, following the same
   pattern as Module 6's Damage Reason Code).
3. Require a distinct authorizing-manager identity captured separately from the voiding cashier for
   any void above the cashier's own authorization ceiling (reuse Module 4's role limits), and for all
   post-payment voids specifically per the BRD.
4. Keep the existing stock-restoration and audit-logging behavior on void — just extend the log entry to
   include the reason code and the separate authorizing-manager ID.

ACCEPTANCE CRITERIA
- A cashier can void a single line item from an in-progress sale without voiding the whole transaction.
- Any void above the configured threshold requires a second, higher-role user's authorization, captured
  as a distinct identity from the person initiating the void.
- Every void is logged with a reason code (not free text), user ID, timestamp, and authorizing manager ID.

TESTING REQUIREMENT (uses the shared setup from Module 0)
- Backend test: line-item void removes only that line, restores only that line's stock, and leaves the
  rest of the order intact.
- Backend test: a void above the configured threshold is rejected without a distinct authorizing-manager
  ID different from the voiding cashier, and succeeds when one is supplied.
- Backend test: the void reason must be a valid code from the configured enum — a free-text/invalid value
  is rejected.
```

## Module 18 — Hardware driver completion

```
PROJECT CONTEXT
BuildPOS, Building Materials ECR/POS. Repo root: e:/MartProject/building-ecr.
Backend: ASP.NET Core 10 + EF Core (backend/src/EcrBuilding.*). Frontend: React 19 (src/).

TASK: Build actual driver/input-handling logic for hardware that currently only has admin device
records — barcode scanner input formalization, card terminal/PED, customer display, weighing scale.

BACKGROUND
The printer and cash-drawer integration (EscPosBuilder.cs, QzTrayController.cs) is genuinely strong and
should be used as the reference pattern for hardware integration quality in this project. By contrast,
barcode scanner input, card terminal/PED, customer display, and weighing scale each have a Device entity
for pairing/status/connection-type records (see Device.cs and NetworkController.cs) but no actual driver
or input-handling code behind them. Barcode scanning today works via keystroke-capture in
PosCheckout.tsx (treating any fast keyboard input as scanner input, which works for USB-HID scanners
acting as a keyboard, but isn't a formalized "driver").

WHAT TO BUILD
1. Barcode scanner: formalize and harden the existing keystroke-capture approach (confirm it correctly
   handles Bluetooth scanners and both 1D and 2D/QR codes, not just USB-HID keyboard-emulation), and
   document the supported scanner types clearly.
2. Card terminal/PED: this overlaps heavily with Module 9 (real payment gateway) — the terminal
   integration IS the PED integration in most modern setups (the PSP's SDK talks to the physical terminal
   directly). Coordinate with whoever does Module 9 rather than building this separately.
3. Customer-facing display: build a simple secondary-display view (a browser window/tab or dedicated
   endpoint) showing running line items and total, driven by the same cart state as the main POS screen —
   this can likely reuse existing state management rather than needing new hardware protocol work, since
   most customer displays are just a second monitor.
4. Weighing scale (RS-232/USB): this needs an actual serial-communication bridge, similar in spirit to how
   QzTrayController.cs bridges browser-to-hardware for printing — investigate whether a similar browser
   bridge approach (WebSerial API, or another QZ-Tray-like local agent) fits, then push scale readings
   into the cart's quantity field automatically for weight-based products.

ACCEPTANCE CRITERIA
- Barcode scanning is confirmed working for both 1D and 2D codes via at least one USB and one Bluetooth
  scanner.
- A secondary customer-facing display shows live line items and total during a sale.
- A connected weighing scale's reading auto-populates the quantity field for a weight-based product
  without manual entry.

TESTING REQUIREMENT (uses the shared setup from Module 0)
- These are hardware-dependent; automate what's testable without physical devices and document manual
  verification steps for the rest.
- Frontend unit test: simulated fast-keystroke input (mimicking a USB-HID scanner) is correctly parsed
  into a barcode lookup, for both 1D and 2D-shaped test payloads.
- Frontend unit test: the customer-display component reflects cart-state changes correctly given a
  simulated state update.
- Frontend unit test: a simulated serial-scale reading payload correctly populates the quantity field for
  a weight-based product.
- Document (in the module's PR) the manual hardware checklist for anything not automatable — e.g. actual
  Bluetooth scanner pairing, actual PED transaction flow, actual RS-232 scale connection.
```

## Module 19 — Webhook/event-driven integration layer

```
PROJECT CONTEXT
BuildPOS, Building Materials ECR/POS. Repo root: e:/MartProject/building-ecr.
Backend: ASP.NET Core 10 + EF Core (backend/src/EcrBuilding.*). Frontend: React 19 (src/).

TASK: Add an event-driven webhook layer. Today every integration (ZATCA aside, which is a real direct
API integration) is synchronous REST/DB calls — there is no webhook mechanism anywhere in the codebase,
and the BI feed sync (InsightsController.BiFeeds) is mocked (its "RetryBiFeed" just resets a status flag,
it doesn't actually push data anywhere external).

WHAT TO BUILD
1. Decide which events genuinely need to be event-driven vs. staying synchronous — the BRD specifically
   calls out inventory updates and payment confirmations as needing "event-driven webhooks." Don't
   over-engineer this into a full event-bus architecture if the actual integration need is narrower;
   confirm with whoever owns the ERP/WMS/BI integration relationships what they actually need to receive
   and how.
2. Add a webhook registration/delivery mechanism (endpoint URL + secret per subscriber, retry-with-backoff
   on delivery failure, delivery log for debugging) for at minimum: stock-level-changed and
   payment-confirmed events.
3. Fire real webhook deliveries from the relevant existing code paths (stock deduction in
   OrdersController.cs, payment confirmation once Module 9's real gateway lands) rather than replacing
   those code paths.
4. Replace the mocked BI feed sync with a real push (webhook or scheduled export, whichever the actual BI
   tool expects) once there's a real external BI target to push to — this may not be actionable until a
   business decision is made about which BI tool to integrate with; flag that dependency clearly rather
   than building toward an unspecified target.

ACCEPTANCE CRITERIA
- A registered webhook subscriber receives a real HTTP callback when stock levels change and when a
  payment is confirmed, with retry-on-failure behavior and a visible delivery log.
- The BI feed status shown in the admin console reflects a real integration attempt, not a mocked status
  flip.

TESTING REQUIREMENT (uses the shared setup from Module 0)
- Backend test: a registered webhook subscriber receives a callback when a stock-level-changed event
  fires, and another when a payment is confirmed.
- Backend test: a simulated delivery failure (subscriber endpoint returns an error) triggers a retry with
  backoff, and the attempt is recorded in the delivery log.
- Backend test: the delivery log accurately reflects success/failure/retry history for a given event.
```

## Module 20 — NFR hardening

```
PROJECT CONTEXT
BuildPOS, Building Materials ECR/POS. Repo root: e:/MartProject/building-ecr.
Backend: ASP.NET Core 10 + EF Core (backend/src/EcrBuilding.*). Frontend: React 19 (src/).

TASK: Close the remaining non-functional-requirement gaps: data-at-rest encryption, PCI-DSS scoping,
accessibility, email/SMS receipts, points expiry, and birthday bonus. These are independent line items —
treat each as its own small task rather than one big change.

BACKGROUND
Password/PIN hashing already correctly uses PBKDF2-SHA256 (PasswordHasher.cs) — that part is fine and
shouldn't be touched. But there's no AES-256 (or equivalent) encryption for other stored sensitive data,
no PCI-DSS scoping documentation/controls, no WCAG/accessibility audit beyond whatever the underlying
shadcn/ui component library provides by default, no email/SMS delivery of digital receipts anywhere in
the codebase, no points-expiry field or background job on the loyalty program, and no birthday-bonus
multiplier (there's no date-of-birth field on Customer at all today).

WHAT TO BUILD
1. Identify which stored fields actually need encryption-at-rest under PCI-DSS scope (this is mostly
   about payment/cardholder data — once Module 9 lands a real payment gateway, confirm with that
   integration whether any cardholder data is stored locally at all, since the better PCI posture is
   usually to never store it and rely entirely on the PSP's tokenization; only add local encryption for
   whatever must remain in this database).
2. Document PCI-DSS scope explicitly (what's in scope, what's been done to reduce scope) — this is partly
   a documentation/process deliverable, not only code.
3. Run a WCAG 2.1 AA pass over the POS screens actually used daily by cashiers (PosCheckout.tsx,
   PaymentDialog.tsx, and the shift/return dialogs) — focus on keyboard operability, focus states, and
   color contrast, using the existing shadcn/ui primitives' accessibility features rather than rebuilding
   components from scratch.
4. Add email/SMS delivery of the digital receipt copy at transaction completion (this needs an actual
   email/SMS provider integration, which doesn't exist anywhere yet — confirm which provider to use;
   this may overlap with Module 12's scheduled-report email work, so share the same email-sending
   infrastructure if that module has landed).
5. Add a DateOfBirth field to Customer, and a points-expiry background job (default: expire points after
   12 months of inactivity, configurable per tier) that runs on a schedule and alerts the cashier at POS
   when a customer has expiring points soon.
6. Add the birthday-bonus multiplier: during the customer's birthday month, automatically apply a
   configurable bonus multiplier to points accrual (built on top of Module 2/7's points-calculation logic).

ACCEPTANCE CRITERIA
- PCI scope is explicitly documented, and any cardholder data that must be stored locally (ideally none,
  post-Module-9) is encrypted at rest.
- The core POS screens pass a basic WCAG 2.1 AA keyboard-navigation and contrast check.
- A customer receives their receipt by email or SMS after a completed sale, if they've provided contact
  info.
- A customer's loyalty points visibly expire after 12 months of inactivity (configurable), with the
  cashier alerted to expiring points at POS.
- A customer's points accrual is automatically boosted during their birthday month.

TESTING REQUIREMENT (uses the shared setup from Module 0)
- Backend test: a round-trip encryption test for any newly-encrypted field (encrypt, store, retrieve,
  decrypt, assert equality).
- Backend test (fast-forwarded/injectable clock): a customer inactive for exactly 12 months has their
  points expire on schedule; one inactive for 11 months does not.
- Backend test: a customer whose birth month matches the current month accrues points at the boosted
  multiplier; one whose birth month doesn't match accrues at the normal rate.
- Frontend/automated accessibility smoke test (e.g. axe-core run against PosCheckout, PaymentDialog, and
  the return dialogs) catching obvious contrast/ARIA violations — this supplements, and does not replace,
  the manual WCAG 2.1 AA review called for in the module above.
- Backend/integration test: a completed sale with a customer email/phone on file triggers a (test-mode)
  email/SMS send call with the correct receipt content.
```

## Module 21 — Configurable loyalty policy (global tiers, branch-wise rates)

```
PROJECT CONTEXT
BuildPOS, Building Materials ECR/POS. Repo root: e:/MartProject/building-ecr.
Backend: ASP.NET Core 10 + EF Core (backend/src/EcrBuilding.*). Frontend: React 19 (src/).

TASK: Make the loyalty program's economics configurable at runtime — tier ladder configured ONCE
company-wide (all branches), earn/redemption rates overridable PER BRANCH — replacing the hardcoded
constants in backend/src/EcrBuilding.Domain/Common/LoyaltyRules.cs. Requested by the store owner on
2026-07-25 after Module 7 landed.

BACKGROUND
Module 7 implemented the BRD §4.3.2 tier ladder (SAR-spend bands 5k/20k/50k, multipliers 1/1.5/2/3x,
tier discounts 5/10/15%, free delivery Silver+ over SAR 500) plus earn (10 SAR/point) and redemption
(0.10 SAR/point) — ALL as constants in LoyaltyRules.cs. The Settings table (SettingsController,
Setting entity) already supports Global vs Branch scope with a BranchId column — it's how
ReturnsController reads ReturnWindow.StandardDays/SurplusDays/Refund.DualAuthCashThreshold, and that
resolution pattern (branch row wins → global row → hardcoded default) is the one to reuse.
IMPORTANT DESIGN RULE confirmed with the owner: a customer's TIER is company-wide — tier bands,
multipliers, and tier discounts must never differ per branch (Gold in Riyadh = Gold in Jeddah).
Owner accepted the recommendation to keep redemption value global by default; earn rate is the
branch-promotional lever — but build both as branch-overridable so policy stays a data decision.

WHAT TO BUILD
1. Backend: a LoyaltyPolicy resolver (e.g. ILoyaltyPolicyService.GetAsync(branchId)) that reads
   Settings keys and falls back to today's LoyaltyRules constants:
   - Global-only keys: Loyalty.Tier.SilverSpend / GoldSpend / PlatinumSpend,
     Loyalty.Tier.SilverMultiplier / GoldMultiplier / PlatinumMultiplier,
     Loyalty.Tier.SilverDiscountPct / GoldDiscountPct / PlatinumDiscountPct,
     Loyalty.FreeDeliveryMinOrderSar.
   - Branch-overridable keys: Loyalty.SarPerPointEarned, Loyalty.SarValuePerPoint,
     Loyalty.MinRedemptionPoints (BRD §4.3.3 default 500), Loyalty.MaxRedemptionPctOfTotal (default 20).
2. Replace every LoyaltyRules constant read with the resolved policy: OrdersController.Checkout
   (earn, redeem validation, tier discount, free-delivery waiver), LoyaltyController (manual redeem),
   ReturnsController (points reversal). Keep LoyaltyRules' pure functions but parameterize them.
3. Enforce the BRD §4.3.3 caps that are currently unenforced: minimum redemption points and maximum
   redemption as % of transaction total, using the resolved per-branch values.
4. New endpoint GET /api/loyalty/policy?branchId=N returning the effective policy — the POS frontend
   MUST fetch this and use it in src/lib/buildpos/loyalty.ts instead of its hardcoded mirror, or cart
   totals will mismatch the server charge whenever a setting is changed.
5. Admin UI: these are plain Settings rows, so the existing admin Settings page already edits them —
   just seed the global defaults as visible Setting rows (category "Pos", group "Loyalty") so admins
   discover them, and document the branch-override behavior in the row description.

ACCEPTANCE CRITERIA
- Changing a tier band/multiplier/discount in Settings changes behavior at EVERY branch with no deploy.
- Setting Loyalty.SarPerPointEarned for one branch changes earn at that branch only; other branches
  keep the global value. Same mechanics for redemption value.
- A redemption below the configured minimum points, or above the configured % of transaction total,
  is rejected with a clear message.
- POS cart totals still match server totals after any setting change (client uses the policy endpoint).

TESTING REQUIREMENT (uses the shared setup from Module 0)
- Backend unit tests on the resolver: branch override wins over global, global wins over default;
  tier keys ignore branch scope entirely (a branch-scoped tier row must NOT change tier behavior).
- Backend integration test: two branches, one with an earn-rate override — the same sale earns
  different points per branch, while redemption value and tier discount stay identical.
- Backend test: min-redemption and max-% caps enforced at checkout.
- Frontend test: loyalty.ts helpers driven by a mocked policy response instead of constants.
```
