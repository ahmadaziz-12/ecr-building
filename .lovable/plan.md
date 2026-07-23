This is a very large ask — two full modules with a working pipeline, drag-and-drop, cross-module linkage, persistence-after-refresh (item 34), and RTL. Building it as a *real* multi-user backend in a single turn would blow way past what fits here, so I'm proposing a **fully functional UI-only implementation backed by client-side persisted state (localStorage / Zustand)**. Every button, form, validation, status transition, and cross-module link works and survives refresh — but data lives in the browser (no server/auth). If you later want it moved onto Lovable Cloud, that becomes an additive step.

If that trade-off is fine, here's what I'll build.

---

## Scope

### 1. Delivery & Dispatch (7 screens)
```
Sidebar → Delivery
  ├─ Delivery Dashboard          /delivery/dashboard
  ├─ Delivery Pipeline           /delivery/pipeline
  ├─ Delivery Orders             /delivery/orders
  ├─ Driver Assignments          /delivery/drivers
  ├─ Vehicle Assignments         /delivery/vehicles
  ├─ Delivery Zones              /delivery/zones
  └─ Delivery Activity Logs      /delivery/logs
```
- **Dashboard**: 8 KPI cards + 7 sections (Pipeline snapshot, Due Today, Driver Availability, Vehicle Availability, Failed/Rescheduled, Recent Activity, Performance).
- **Pipeline**: 8-stage horizontal Kanban with drag-and-drop between allowed stages. Per-stage: count, value, weight, overdue. Validation gates block illegal moves (e.g. Pending→Assigned needs driver+vehicle).
- **Delivery Orders**: table + full 7-section create/edit wizard (Source Order, Items, Address, Schedule, Driver/Vehicle, Charges, Documents), partial-delivery support, remaining-delivery auto-record.
- **Drivers / Vehicles**: assignment tables with all statuses, capacity warnings, availability derived from HR attendance + leave + license expiry.
- **Zones**: simple CRUD of delivery areas.
- **Activity Logs**: full audit trail of all `DELIVERY_*` events.
- **Loading flow**: per-line loaded/missing/damaged with validations.
- **Completion flow**: proof capture (signature-pad canvas, photo placeholder), delivery result dropdown, partial handling.
- **Entry points**: "Create Delivery Order" also wired into POS Checkout, Orders detail, Contractor detail.

### 2. HRMS (7 screens)
```
Sidebar → HRMS
  ├─ HR Dashboard                /hrms/dashboard
  ├─ Employees                   /hrms/employees
  ├─ Departments                 /hrms/departments
  ├─ Shift & Attendance          /hrms/attendance     (7 tabs)
  ├─ Leave Management            /hrms/leave          (6 tabs)
  ├─ Documents & Contracts       /hrms/documents      (6 tabs)
  └─ HR Activity Logs            /hrms/logs
```
- **HR Dashboard**: 8 KPIs, 8 sections.
- **Employees**: list, 9-tab profile, add/edit wizard (5 sections), link-to-user, deactivate.
- **Departments**: CRUD + manager assignment + branch scope.
- **Shift & Attendance**: tabs — Overview, Employee Shifts, Templates, Check-In/Out, Adjustments, Overtime, Logs. PIN / biometric / terminal / manual check-in simulation.
- **Leave**: 6 tabs incl. team calendar. Full approval workflow.
- **Documents & Contracts**: uploads (stored as base64 preview stubs), expiry alerts, contract renewal keeping history.
- **HR Activity Logs**: KPIs + filterable audit table.

### 3. Cross-module wiring
- Approved leave → attendance auto-set to "On Leave" → driver marked unavailable → blocked in Delivery driver picker.
- Expired driving licence → driver blocked, red alert on HR dashboard.
- Employee → User link creates entry in Registered Users list.
- Cashier designation → appears in Cashier filters.
- Every state-changing action writes to both the module's activity log and the global Audit Logs.

### 4. Persistence & state
- Single Zustand store per domain (`useDeliveryStore`, `useHrStore`) with `persist` middleware → localStorage. All new records survive refresh.
- Seeded on first load with the exact dummy data from the spec.
- "Reset demo data" action in Admin → Settings for clean demos.

### 5. Theme, i18n, RTL
- Mi Money Industrial Blueprint tokens already in place — reused throughout.
- Add `useLocale()` hook + `dir="rtl"` toggle wired to the existing "AR" button in the header. English/Arabic labels for module titles, statuses, and headings (form-field labels partially translated where dummy data provides Arabic).
- Full RTL sweep on the two new modules (mirrored padding, chevrons, pipeline direction).

### 6. What I am NOT building (matches spec exclusions)
- No payroll, no salary, no benefits, no route optimization, no full fleet management, no recruitment/appraisal.
- No real GPS/mapping (address fields captured, lat/long free-text).
- No real biometric/PIN device — the flows simulate them.
- No backend / no Lovable Cloud (see trade-off at top).

---

## Technical shape

```text
src/lib/delivery/
  types.ts          domain types + status enums
  data.ts           seed dummy data (DO-2026-1021..1025, drivers, vehicles, zones)
  store.ts          Zustand + persist; transitions, validations, audit hooks
  validations.ts    stage-transition + form rules
  audit.ts          DELIVERY_* event emitter → global audit store

src/lib/hr/
  types.ts, data.ts, store.ts, validations.ts, audit.ts
  attendance.ts     late/overtime calculators, availability derivation
  leave.ts          approval workflow + attendance sync

src/lib/audit/store.ts   shared audit ledger

src/components/delivery/
  DeliveryDashboard.tsx, DeliveryPipeline.tsx, PipelineCard.tsx,
  CreateDeliveryDialog.tsx (7-section wizard), LoadingDialog.tsx,
  CompletionDialog.tsx, DriverTable.tsx, VehicleTable.tsx,
  DeliveryTimeline.tsx, DeliveryFilters.tsx

src/components/hr/
  HrDashboard.tsx, EmployeeTable.tsx, EmployeeProfile.tsx (9 tabs),
  AddEmployeeDialog.tsx (5 sections), DepartmentTable.tsx,
  ShiftTemplatesTab.tsx, AttendanceTab.tsx, CheckInDialog.tsx,
  AttendanceAdjustmentDialog.tsx, LeaveDashboard.tsx,
  LeaveRequestDialog.tsx, LeaveCalendar.tsx, DocumentsTab.tsx,
  ContractsTab.tsx, HrActivityLogs.tsx

src/routes/delivery.*.tsx      (7 route files)
src/routes/hrms.*.tsx          (7 route files)
```

Sidebar in `AppLayout.tsx` — the existing Delivery group (currently one "Coming soon") and HRMS group (all "Coming soon") get real routes pointing to the new pages.

Reused: `FlowDialog` pattern from the last turn where forms fit; complex ones (Create Delivery, Add Employee, Loading, Completion) get purpose-built dialogs because they need conditional fields, live totals, and per-line grids.

Persistence uses `zustand` (small, already common; I'll add it via `bun add zustand`).

---

## Execution order (single build, but staged internally)

1. Foundation: types, seed data, Zustand stores, audit ledger, RTL/i18n hook.
2. Delivery: dashboard → orders list → create-delivery wizard → pipeline w/ DnD → drivers/vehicles → zones → logs → loading + completion dialogs.
3. HRMS: dashboard → employees list + wizard → departments → shift & attendance tabs → check-in flow → leave → documents & contracts → HR logs.
4. Cross-module wiring: approved-leave → driver unavailable; licence-expiry blocker; employee↔user link.
5. Sidebar wiring + routes gen; RTL sweep on the two modules; polish + reduced-motion checks.

---

## Confirm

If yes, I'll proceed with the whole thing in the next turn. If you want a smaller first slice (e.g. Delivery only, or Delivery + Employees + Attendance, ship HR the turn after), tell me and I'll cut accordingly.