
# Phase 1 — Shell + Dashboard

Aligns the app to the "MI MONEY BUILDPOS — Industrial Blueprint" spec (sections 1–7). No other module pages are touched in this phase (they keep their existing content); Phase 2+ will bring each module in line.

## 1. Sidebar restructure (`AppLayout.tsx`)

Rewrite `nav` groups to match the spec exactly:

1. **Dashboard** (standalone item, no group header)
2. **Operate** — POS Checkout, Orders & Quotations, Customers & Contractors, Cashier Workspace, Cashier Shifts
3. **Products & Stock** — Product Catalog, Categories & Attributes, Inventory & Stock, Material Validity, Stock Transfers, Bundles & Systems
4. **Procurement** — Suppliers, Purchase Orders, Supplier Returns
5. **Finance & Customers** — Expenses, Pricing/Discounts/Coupons, Returns & Refunds, Loyalty Program, Invoices & Tax Compliance
6. **Delivery** — Delivery & Dispatch
7. **HRMS** — HR Dashboard, Employees, Departments, Shift & Attendance, Leave Management, Documents & Contracts, HR Activity Logs
8. **Network** — Branches, Terminals, Devices
9. **Insights** — Reports, Analytics, KPI Evaluation
10. **Admin** — Admin Overview, Registered Users, Roles & Permissions, Rules Engine, POS Settings, Audit Logs, Plans & Pricing, General Settings

Removed items: Warehouses, Maintenance, Compliance (moved to Dashboard tab), ZATCA Invoices, ZATCA Phase 2, Control Tower, Business Intelligence.

Existing route files stay in place (renamed labels only, `to:` targets kept to existing paths for now, e.g. Product Catalog → `/stock/inventory`, Material Validity → `/stock/expiry`, Invoices & Tax Compliance → `/finance/tax-zatca`). New sidebar items that don't have routes yet (HRMS, Loyalty Program, Analytics, Bundles, Categories & Attributes, Delivery & Dispatch, Purchase Orders under Procurement group) point to a shared placeholder route `/coming-soon` created as a lightweight "Module coming in next phase" page — no existing route is deleted so functionality is preserved.

## 2. Top status bar (`AppLayout.tsx` + `data.ts`)

Extend the header with the full spec status bar:
- Business name (Al Binaa Building Materials Trading)
- Branch (Riyadh Main Branch) + Branch Code (B-RYD-001)
- Terminal (POS-01)
- User + Role (Ahmed Al-Harbi · Store Manager)
- Shift (Open since 08:00 AM)
- Business Date (Gregorian)
- Language toggle (EN/AR chip)
- Online/Offline chip
- Pending Sync count (2)
- Invoice-compliance chip (Connected)
- Notifications bell
- Profile menu

Dummy values added to `src/lib/buildpos/data.ts` under a new `statusBar` shape (extends current one).

## 3. Global filter bar (`sections.tsx` `FilterBar`)

Rework the existing `FilterBar` to expose the primary filters as real dropdowns with the spec option lists:
- Date Range (7 presets + Custom)
- Branch (5 branches + All Permitted)
- Terminal (POS-01…06)
- Cashier (6 cashiers)
- Category (14 building-material categories)
- Status (module-specific — dashboard passes "Overview" set)
- **More Filters** dropdown: Customer, Contractor account, Supplier, Payment Method, Order/Delivery/Stock/Return/Invoice status, Employee Department, Shift Status

Actions row: Apply · Reset · Save View · Refresh · Export. Active filters render as removable chips below the row.

State stays in `filter-context` so tables/cards react (unchanged mechanism, just more fields).

## 4. Dashboard rebuild (`src/routes/dashboard.tsx`)

Replace the current single-page-plus-tabs layout with the spec's 7-tab dashboard. Remove the permanent right-side `AlertsRail`, the numbered "01/02/03…" section stack, and the hero-image header (replaced by a compact page title block per spec: title "Building Materials Operations" + subtitle).

Tabs (order per spec):

1. **Overview**
   - Six KPI cards only: Today's Material Sales / Net Sales / Transactions / Low Stock Materials / Pending Deliveries / Open Shifts (values from spec)
   - Today's Sales Summary — compact hourly chart 08:00–18:00 with the spec's dummy hourly values and gross/net/transactions/avg-basket footer
   - Top Material Categories — table of 6 categories with Sales / Units / Stock status / Top product + "View All" → Analytics
   - Dispatch Pipeline Preview — 6-stage horizontal pipeline with spec counts, 1–2 example cards per active stage, "View All" → Delivery
   - Cashier Workspace Summary — Active terminals 5/6, Open shifts 6, Parked 7, Approvals 3, Offline (POS-03), Cash variance (SH-1044 -40), quick actions row

2. **Sales Performance** — 6 KPI cards (Gross/Net/Discounts/Returns/Avg Basket/Contractor Sales), hourly summary, retail vs contractor split, top products, top categories, branch summary, recent orders table (5 spec rows), "Open Full Analytics" button.

3. **Inventory Health** — 6 KPI cards (Available/Reserved/Low/OOS/Quarantine/Pending Transfers), Low-stock table (6 spec rows), Reserved / Quarantine / Transfers / Validity / Branch availability sub-panels. No warehouse heatmap.

4. **Delivery & Dispatch** — Pipeline board with 6 stages and 5 spec delivery cards (DO-1021…DO-1025), pipeline actions on hover, animated stage transitions using existing `bp-enter` classes.

5. **Cashier & Terminal** — 6 KPI cards, 5-row terminal table (POS-01…05) with per-row actions.

6. **Payments & Returns** — Payment summary tiles (Cash/Card/Wallet/Bank Transfer/Account Credit/Loyalty), Return summary tiles. Mada removed; "Card" used.

7. **Compliance & Alerts** — Alerts grouped Critical/Warning/Information with spec dummy alerts and per-alert action buttons.

## 5. Data (`src/lib/buildpos/data.ts`)

Add spec-accurate dummy data blocks used across the dashboard tabs:
- `overviewKpis`, `hourlySales`, `topCategories`, `dispatchPipeline`, `cashierWorkspaceSummary`
- `salesPerformanceKpis`, `recentOrders`
- `inventoryKpis`, `lowStock`
- `deliveryPipeline` (with driver, vehicle, weight, area, priority)
- `cashierTerminals`
- `paymentSummary`, `returnSummary`
- `alerts` grouped by severity

## 6. Sections (`sections.tsx`)

- Update / add components: `OverviewKpis`, `HourlyChart`, `TopCategories` (add View All → Analytics), `DispatchPipelinePreview`, `CashierWorkspaceSummary`, `SalesPerfKpis`, `RecentOrders`, `InventoryKpis`, `LowStockTable`, `DispatchBoardFull`, `TerminalTable`, `PaymentSummary`, `ReturnSummary`, `AlertsByGroup`.
- Keep old exports (`CommandKpis`, `AlertsRail`, `ContractorOrders`, `StockYardHealth`, etc.) or remove them only after confirming no other route imports them — the module pages under `/insights/*`, `/finance/*`, `/stock/*` currently do not import from dashboard sections, so unused ones can be deleted safely.

## 7. Animation & motion polish

- Respect `prefers-reduced-motion` on all `bp-fade` / `bp-enter` classes (add a `@media (prefers-reduced-motion: reduce)` block in `styles.css` that neutralises them).
- Pipeline card status change: animate translate + fade using existing `pos-pop`/`bp-enter` primitives.
- Number changes in KPI cards on filter apply: brief tabular-num flash via existing utility, no new keyframes required.

## Out of scope for Phase 1

Everything below the Dashboard — POS Checkout redesign (already partially built), Orders/Customers/Cashier/Stock/Procurement/Finance/HRMS/Insights/Admin module pages, Analytics module, Reports module, Loyalty module. Those keep their current content in this phase; each is queued for a follow-up phase.

## Technical notes

- All new dropdown filter options are static arrays — no backend/Cloud enabled (per prior "UI only" scope).
- No route deletions this phase; new sidebar entries with no route target the placeholder `/coming-soon` page created under `src/routes/coming-soon.tsx`.
- Head metadata on `/dashboard` updated to title "Building Materials Operations — BuildPOS" and matching description/og tags.
- Typecheck + build verified after each of the three file batches (shell, data, dashboard).

```text
Layout after Phase 1:

┌─ Sidebar (10 groups per spec) ─┐┌─ Header status bar (business/branch/terminal/user/shift/sync/zatca/lang/bell/profile)
│ Dashboard                      ││
│ Operate  ▸                     │├─ Filter bar (Date/Branch/Terminal/Cashier/Category/Status · More filters · Apply Reset Save Refresh Export)
│ Products & Stock ▸             ││   Active-filter chips row
│ Procurement ▸                  │├─ H1 "Building Materials Operations"
│ Finance & Customers ▸          ││
│ Delivery ▸                     │├─ Tabs: Overview | Sales | Inventory | Delivery | Cashier | Payments | Compliance
│ HRMS ▸                         ││
│ Network ▸                      ││   Overview tab body:
│ Insights ▸                     ││     KPI x6 → Hourly summary → Top Categories → Dispatch preview → Cashier summary
│ Admin ▸                        ││
└────────────────────────────────┘└──
```
