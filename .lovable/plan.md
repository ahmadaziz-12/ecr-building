# Mi Money BuildPOS — Building Materials Dashboard (KSA)

Build a single, richly-populated dashboard route styled with a Mi Money purple gradient theme and construction/warehouse accents. All content, labels, and dummy data will match the uploaded FRD exactly (SAR values, Arabic ر.س suffix, cashier names, SKUs, ZATCA statuses, etc.).

## Scope

Frontend-only, static dummy data (no backend). One dashboard page with tabbed sections + filter bar + quick actions + footer.

## Design Direction

- Purple gradient background (deep indigo → violet), glass-effect cards with soft shadows, rounded-2xl corners.
- Subtle construction grid pattern overlay + faint warehouse/tile/cement/steel line motifs.
- Semantic tokens added to `src/styles.css` (brand purple, glass surface, severity colors: critical/warning/success/info).
- Typography: modern sans (Space Grotesk display + Inter body) loaded via `<link>` in `__root.tsx`.
- Lucide icons for categories (Package, Hammer, Layers, PaintBucket, Wrench, Zap, etc.) + severity badges.
- Full LTR layout; ر.س suffix shown inline with numbers.

## Route Structure

- `src/routes/index.tsx` → BuildPOS dashboard (replace placeholder).
- Update `__root.tsx` head: title "BuildPOS — Building Materials POS Dashboard", matching description/og tags, font `<link>`s.

## Page Composition (top → bottom)

1. **Top Status Bar** — Branch, Terminal, User (Ahmed Al-Harbi / Store Manager), Business Date, Shift/Sync/ZATCA status pills, currency.
2. **Header** — "Building Materials Dashboard" + subtitle.
3. **Filter Bar** — Date Range, Branch, Terminal, Cashier, Category, Payment Method, Alert Type, Delivery Status, Stock Status (shadcn Select + DateRange).
4. **Tabs** — Overview | Sales | Inventory | Delivery | Cashier Activity | Compliance. Overview shown by default; other tabs render their focused section subsets.
5. **8 KPI Cards** — Today's Sales, Net Sales, Transactions, VAT Collected, Low Stock, Pending Deliveries, Open Shifts, Failed Sync/ZATCA with sub-indicators and severity colors.
6. **Quick Actions Row** — 8 shortcut buttons with badges (Start Sale, Recall Parked (7), Quotation, Stock Check, Delivery Queue (18), Reports, Sync ZATCA (3), Close Shift (6)).
7. **Sales Performance** — Recharts hourly area/bar chart (Gross vs Net + Returns line) using hourly dummy dataset.
8. **Top Material Categories** — 8 category cards with icon, sales, units, return %, stock health badge.
9. **Inventory Health** — 5 summary stat cards + Low Stock table (SKU, product, category, branch, qty, reorder, supplier, status).
10. **Cashier & Terminal Activity** — Terminal table + Shift Summary table with variance highlighting.
11. **Delivery & Dispatch Queue** — KPI chips + orders table with status pills.
12. **Operational Alerts** — Alert cards list with severity, module, message, age, assignee, action button.
13. **Payment Collection** — Recharts donut + breakdown list per method.
14. **Returns & Refunds** — 4 stat cards + returns table.
15. **Branch Performance** — Table across 5 branches.
16. **Footer Note** — Last Updated 02:45 PM, auto-refresh 60s, data sources.

Empty-state strings kept in a constants file so tables can render them when filtered.

## Files to Create

```
src/routes/index.tsx                          # rewritten dashboard shell + tabs
src/components/buildpos/StatusBar.tsx
src/components/buildpos/DashboardHeader.tsx
src/components/buildpos/FilterBar.tsx
src/components/buildpos/KpiCard.tsx
src/components/buildpos/QuickActions.tsx
src/components/buildpos/SalesPerformance.tsx     # Recharts
src/components/buildpos/TopCategories.tsx
src/components/buildpos/InventoryHealth.tsx
src/components/buildpos/CashierActivity.tsx
src/components/buildpos/DeliveryQueue.tsx
src/components/buildpos/OperationalAlerts.tsx
src/components/buildpos/PaymentCollection.tsx    # Recharts donut
src/components/buildpos/ReturnsRefunds.tsx
src/components/buildpos/BranchPerformance.tsx
src/components/buildpos/DashboardFooter.tsx
src/components/buildpos/ConstructionBackdrop.tsx # SVG grid + shapes overlay
src/lib/buildpos/data.ts                         # all dummy datasets from FRD
src/lib/buildpos/format.ts                       # SAR formatter, badge helpers
```

## Files to Modify

- `src/routes/__root.tsx` — head metadata + Google Fonts link (Space Grotesk + Inter).
- `src/styles.css` — add purple theme tokens, severity tokens, glass utility, construction-grid `@utility`, `--font-display`.

## Technical Notes

- Recharts already available via shadcn `chart.tsx`. No new deps expected; if Recharts missing at build I'll `bun add recharts`.
- All money rendered via `formatSAR(n)` → `"48,920 ر.س"`.
- Status/severity → shadcn `Badge` variants keyed to tokens (`critical`, `warning`, `success`, `info`).
- Fully responsive: KPI grid 1→2→4 cols; tables scroll horizontally on mobile.
- No auth, no data fetching — static exports only. Tab switching via `useState`; filters are visual (non-functional) placeholders as spec is UI-focused.

## Out of Scope (this iteration)

- Real navigation on click actions (buttons render but don't route).
- Backend/Cloud, real ZATCA integration, live refresh.
- RTL/Arabic localization beyond the ر.س currency glyph.

Confirm to proceed and I'll build it in one pass.
