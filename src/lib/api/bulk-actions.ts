import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  useBranches, useSetBranchStatus, useUpdateBranch, useTerminals, useAssignCashier, useForceSyncTerminal, mapTerminals,
  useDevices, useOpenDrawer, mapDevices, useRules, useTestRule, useUpdateRule, useUsers, useUpdateUser, useResetPin,
  useMaintenance, useAssignMaintenance, useUpdateMaintenanceStatus, useCreateMaintenance, useCompliance, useUpdateCompliance, useSignOffCompliance,
  useSettings, useUpsertSetting,
} from "./admin";
import type { Field } from "@/lib/buildpos/flows";
import type { BulkActionConfig } from "@/components/buildpos/BulkActionSheet";
import {
  useExpenses, useUpdateExpenseStatus, useReconcileExpense, useReturns, useApproveReturn, useQuarantineReturn,
} from "./finance";
import {
  usePurchaseOrders, useSubmitPurchaseOrder, useApprovePurchaseOrder, useDispatchPurchaseOrder,
  useReceivePurchaseOrder, useCancelPurchaseOrder, useReturnsToSupplier, useDispatchRts, useRejectRts,
  useSuppliers, mapSuppliers, useRecordSupplierPayment,
} from "./procurement";
import { useWarehouses, useCreateStockTransfer, useCreateStockAdjustment } from "./inventory";
import { useProducts } from "./catalog";
import { usePricingRules, useUpdatePricingRuleStatus } from "./pos";
import { useTestPrint } from "./print";
import { useZatcaInvoices, useSubmitZatcaInvoice } from "./zatca";
import {
  useInsightsSales, useInsightsReports, useSetReportStatus, useInsightsKpi, useUpdateKpiTarget, mapKpis,
  useInsightsBi, useRetryBiFeed, mapBiFeeds, useAdminOverview,
} from "./insights";

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Real bulk/global versions of toolbar buttons whose underlying action is inherently row-scoped
 * (Approve, Dispatch, Cancel…) — the per-row 3-dot menu already exposes the single-record version
 * (see row-actions.ts); this hook lets the SAME real mutations run from the page-level toolbar by
 * picking one or more eligible records from a live list, instead of the button silently no-opping.
 */
export function useBulkActions(
  pathname: string,
  openFlow: (
    title: string,
    initialValues: Record<string, string>,
    onSubmit: (values: Record<string, string>) => Promise<void>,
    fieldOverrides?: Record<string, Partial<Field>>,
  ) => void,
  showDetail: (id: number, row: (string | number)[]) => void,
): Record<string, BulkActionConfig> | undefined {
  const navigate = useNavigate();
  const { data: expenses } = useExpenses(pathname === "/finance/expenses");
  const updateExpenseStatus = useUpdateExpenseStatus();
  const reconcileExpense = useReconcileExpense();

  const { data: purchaseOrders } = usePurchaseOrders(pathname === "/finance/purchase-orders");
  const submitPo = useSubmitPurchaseOrder();
  const approvePo = useApprovePurchaseOrder();
  const dispatchPo = useDispatchPurchaseOrder();
  const receivePo = useReceivePurchaseOrder();
  const cancelPo = useCancelPurchaseOrder();

  const { data: pricingRules } = usePricingRules(pathname === "/finance/pricing");
  const updatePricingRuleStatus = useUpdatePricingRuleStatus();

  const { data: customerReturns } = useReturns(pathname === "/finance/returns");
  const approveReturn = useApproveReturn();
  const quarantineReturn = useQuarantineReturn();

  const { data: rts } = useReturnsToSupplier(pathname === "/suppliers/rts");
  const dispatchRts = useDispatchRts();
  const rejectRts = useRejectRts();

  const { data: branches } = useBranches(pathname === "/finance/returns" || pathname === "/network/branches" || pathname === "/admin/users");
  const updateBranch = useUpdateBranch();
  const setBranchStatus = useSetBranchStatus();

  const { data: terminals } = useTerminals(pathname === "/network/terminals");
  const assignCashier = useAssignCashier();
  const forceSyncTerminal = useForceSyncTerminal();
  const { data: users } = useUsers(pathname === "/admin/users" || pathname === "/network/terminals" || pathname === "/admin/maintenance");

  const { data: devices } = useDevices(pathname === "/network/devices");
  const openDrawer = useOpenDrawer();
  const testPrint = useTestPrint();

  const { data: rules } = useRules(pathname === "/admin/rules");
  const testRule = useTestRule();
  const updateRule = useUpdateRule();

  const updateUser = useUpdateUser();
  const resetPin = useResetPin();

  const { data: maintenance } = useMaintenance(pathname === "/admin/maintenance");
  const assignMaintenance = useAssignMaintenance();
  const updateMaintenanceStatus = useUpdateMaintenanceStatus();

  const { data: compliance } = useCompliance(pathname === "/admin/compliance");
  const signOffCompliance = useSignOffCompliance();
  const updateCompliance = useUpdateCompliance();

  const { data: zatcaInvoices } = useZatcaInvoices(undefined, pathname === "/admin/zatca-invoices");
  const submitZatcaInvoice = useSubmitZatcaInvoice();

  const { data: warehouses } = useWarehouses(pathname === "/stock/warehouses");
  const createStockTransfer = useCreateStockTransfer();
  const createStockAdjustment = useCreateStockAdjustment();
  const { data: products } = useProducts(pathname === "/stock/warehouses");

  const { data: suppliers } = useSuppliers(pathname === "/suppliers/suppliers");
  const recordSupplierPayment = useRecordSupplierPayment();
  const { data: systemSettings } = useSettings("System", pathname === "/admin/settings");
  const { data: posSettings } = useSettings("Pos", pathname === "/admin/pos-settings");
  const upsertSetting = useUpsertSetting();

  const { data: salesSegments } = useInsightsSales(pathname === "/insights/sales");
  const { data: reports } = useInsightsReports(pathname === "/insights/reports");
  const setReportStatus = useSetReportStatus();
  const { data: kpis } = useInsightsKpi(pathname === "/insights/kpi");
  const updateKpiTarget = useUpdateKpiTarget();
  const { data: biFeeds } = useInsightsBi(pathname === "/insights/bi");
  const retryBiFeed = useRetryBiFeed();
  const { data: overview } = useAdminOverview(pathname === "/admin/overview");
  const createMaintenance = useCreateMaintenance();

  switch (pathname) {
    case "/stock/warehouses": {
      const list = warehouses ?? [];
      const rowFor = (w: (typeof list)[number]) => ({ id: w.id, primary: w.name, secondary: w.branchName, status: w.status });
      return {
        Transfer: {
          title: "Transfer From Warehouse", mode: "single", confirmLabel: "Open Transfer Form",
          rows: list.map(rowFor), emptyMessage: "No warehouses found.",
          run: async (id) => {
            const w = list.find((x) => x.id === id);
            if (!w) throw new Error("Warehouse not found.");
            openFlow("Create Transfer", { from: `Warehouse: ${w.name}` }, async (values) => {
              if (!values.from || !values.to) throw new Error("From and To location are required.");
              const resolve = (value: string) => {
                if (value.toLowerCase().startsWith("warehouse:")) {
                  const name = value.slice("warehouse:".length).trim();
                  const wh = list.find((x) => x.name.toLowerCase() === name.toLowerCase());
                  if (!wh) throw new Error(`Unknown warehouse "${name}".`);
                  return { warehouseId: wh.id as number | null, branchId: null as number | null };
                }
                if (value.toLowerCase().startsWith("branch:")) {
                  const name = value.slice("branch:".length).trim();
                  const b = (branches ?? []).find((x) => x.nameEn.toLowerCase() === name.toLowerCase());
                  if (!b) throw new Error(`Unknown branch "${name}".`);
                  return { warehouseId: null as number | null, branchId: b.id as number | null };
                }
                throw new Error(`"${value}" must be prefixed "Warehouse:" or "Branch:".`);
              };
              const from = resolve(values.from);
              const to = resolve(values.to);
              if (!values.items) throw new Error("At least one line item is required.");
              const rows = JSON.parse(values.items) as { sku?: string; qty?: string; unitCost?: string }[];
              const lines = rows.map((row) => {
                if (!row.sku || !row.qty) throw new Error("Every line needs an item and a quantity.");
                const p = products?.find((pr) => pr.sku.toLowerCase() === row.sku!.toLowerCase());
                if (!p) throw new Error(`Unknown SKU "${row.sku}".`);
                return { productId: p.id, qty: Number(row.qty), unitCost: Number(row.unitCost || p.costPrice), batchNo: null, expiryDate: null };
              });
              await createStockTransfer.mutateAsync({
                fromWarehouseId: from.warehouseId, fromBranchId: from.branchId, toWarehouseId: to.warehouseId, toBranchId: to.branchId,
                eta: values.eta || null, carrier: values.carrier || null, notes: values.notes || null, lines,
              });
            });
          },
        },
        "Cycle Count": {
          title: "Start Cycle Count", mode: "single", confirmLabel: "Open Count Sheet",
          rows: list.map(rowFor), emptyMessage: "No warehouses found.",
          run: async (id) => {
            const w = list.find((x) => x.id === id);
            if (!w) throw new Error("Warehouse not found.");
            openFlow("New Adjustment", { reason: "Cycle Count Correction", warehouse: w.name }, async (values) => {
              if (!values.reason || !values.sku || !values.counted) throw new Error("Reason, SKU and Counted Qty are required.");
              const wh = list.find((x) => x.name.toLowerCase() === values.warehouse.toLowerCase());
              if (!wh) throw new Error(`Unknown warehouse "${values.warehouse}".`);
              const p = products?.find((pr) => pr.sku.toLowerCase() === values.sku.toLowerCase());
              if (!p) throw new Error(`Unknown SKU "${values.sku}".`);
              await createStockAdjustment.mutateAsync({
                reason: values.reason, warehouseId: wh.id, date: values.date || new Date().toISOString().slice(0, 10),
                approverUserId: null, evidenceAttached: values.attachEvidence === "on",
                lines: [{ productId: p.id, systemQty: Number(values.system || 0), countedQty: Number(values.counted || 0), note: values.note || null }],
              });
            });
          },
        },
      };
    }

    case "/network/branches": {
      const list = branches ?? [];
      const rowFor = (b: (typeof list)[number]) => ({ id: b.id, primary: b.nameEn, secondary: b.city, status: b.status });
      return {
        Activate: {
          title: "Activate Branches", confirmLabel: "Activate",
          rows: list.filter((b) => b.status !== "Active").map(rowFor), emptyMessage: "All branches are already active.",
          run: (id) => setBranchStatus.mutateAsync({ id, status: "Active" }),
        },
        Deactivate: {
          title: "Deactivate Branches", confirmLabel: "Deactivate", destructive: true,
          rows: list.filter((b) => b.status === "Active").map(rowFor), emptyMessage: "No active branches.",
          run: (id) => setBranchStatus.mutateAsync({ id, status: "Inactive" }),
        },
        Configure: {
          title: "Configure Branch", mode: "single", confirmLabel: "Open Editor",
          rows: list.map(rowFor), emptyMessage: "No branches found.",
          run: async (id) => {
            const b = list.find((x) => x.id === id);
            if (!b) throw new Error("Branch not found.");
            openFlow(
              "Edit Branch",
              {
                code: b.code, nameEn: b.nameEn, nameAr: b.nameAr ?? "", city: b.city, address: b.address ?? "",
                manager: b.managerName ?? "", warehouse: b.warehouse ?? "", hours: b.businessHours ?? "", zatca: b.vatRegistrationNumber ?? "",
              },
              async (values) => {
                if (!values.code || !values.nameEn) throw new Error("Branch code and name are required.");
                await updateBranch.mutateAsync({
                  id: b.id,
                  request: {
                    code: values.code, nameEn: values.nameEn, nameAr: values.nameAr || null, city: values.city || b.city,
                    address: values.address || null, businessHours: values.hours || null, vatRegistrationNumber: values.zatca || null,
                    managerName: values.manager || null, warehouse: values.warehouse || null, status: b.status,
                  },
                });
              },
            );
          },
        },
      };
    }

    case "/network/terminals": {
      const list = terminals ?? [];
      const rowFor = (t: (typeof list)[number]) => ({ id: t.id, primary: `${t.code} · ${t.name}`, secondary: t.branchName, status: t.status });
      return {
        "Assign Cashier": {
          title: "Assign Cashier", description: "Assign the selected terminals to one cashier.",
          confirmLabel: "Assign", rows: list.map(rowFor), emptyMessage: "No terminals found.",
          extraField: { label: "Cashier", options: (users ?? []).map((u) => ({ value: String(u.id), label: u.name })) },
          run: (id, cashierUserId) => assignCashier.mutateAsync({ id, cashierUserId: cashierUserId ? Number(cashierUserId) : null }),
        },
        "Force Sync": {
          title: "Force Sync Terminals", confirmLabel: "Force Sync",
          rows: list.map(rowFor), emptyMessage: "No terminals found.",
          run: (id) => forceSyncTerminal.mutateAsync(id),
        },
        Monitor: {
          title: "Monitor Terminal", mode: "single", confirmLabel: "View Status",
          rows: list.map(rowFor), emptyMessage: "No terminals found.",
          run: async (id) => {
            const table = mapTerminals(list);
            const idx = table.ids?.indexOf(id) ?? -1;
            if (idx < 0) throw new Error("Terminal not found.");
            showDetail(id, table.rows[idx]);
          },
        },
      };
    }

    case "/network/devices": {
      const list = devices ?? [];
      const drawers = list.filter((d) => d.type === "CashDrawer" && d.status !== "Disconnected");
      const printers = list.filter((d) => d.type === "ReceiptPrinter");
      return {
        "Open Drawer": {
          title: "Open Cash Drawer", mode: "single", confirmLabel: "Open Drawer",
          rows: drawers.map((d) => ({ id: d.id, primary: d.deviceCode, secondary: `${d.terminalName} · ${d.branchName}`, status: d.status })),
          emptyMessage: "No connected cash drawers.",
          run: (id) => openDrawer.mutateAsync(id),
        },
        "Test Print": {
          title: "Test Print", mode: "single", confirmLabel: "Send Test Print",
          rows: printers.map((d) => ({ id: d.id, primary: d.deviceCode, secondary: `${d.terminalName} · ${d.branchName}`, status: d.status })),
          emptyMessage: "No receipt printers registered.",
          run: (id) => testPrint.mutateAsync(id),
        },
        Troubleshoot: {
          title: "Troubleshoot Device", mode: "single", confirmLabel: "View Diagnostics",
          rows: list.map((d) => ({ id: d.id, primary: d.deviceCode, secondary: `${d.type} · ${d.terminalName}`, status: d.status })),
          emptyMessage: "No devices found.",
          run: async (id) => {
            const table = mapDevices(list);
            const idx = table.ids?.indexOf(id) ?? -1;
            if (idx < 0) throw new Error("Device not found.");
            showDetail(id, table.rows[idx]);
          },
        },
      };
    }

    case "/admin/rules": {
      const list = rules ?? [];
      const rowFor = (r: (typeof list)[number]) => ({ id: r.id, primary: r.name, secondary: r.domain, status: r.active ? "Active" : "Inactive" });
      const requestFor = (r: (typeof list)[number], active: boolean) => ({
        name: r.name, domain: r.domain, priority: r.priority, whenTrigger: r.whenTrigger, condition: r.condition,
        action: r.action, approverUserId: null, active, notes: r.notes,
      });
      return {
        Activate: {
          title: "Activate Rules", confirmLabel: "Activate",
          rows: list.filter((r) => !r.active).map(rowFor), emptyMessage: "All rules are already active.",
          run: (id) => { const r = list.find((x) => x.id === id); if (!r) throw new Error("Rule not found."); return updateRule.mutateAsync({ id, request: requestFor(r, true) }); },
        },
        Deactivate: {
          title: "Deactivate Rules", confirmLabel: "Deactivate", destructive: true,
          rows: list.filter((r) => r.active).map(rowFor), emptyMessage: "No active rules.",
          run: (id) => { const r = list.find((x) => x.id === id); if (!r) throw new Error("Rule not found."); return updateRule.mutateAsync({ id, request: requestFor(r, false) }); },
        },
        Test: {
          title: "Test Rule", mode: "single", confirmLabel: "Run Test",
          rows: list.map(rowFor), emptyMessage: "No rules to test.",
          run: async (id) => {
            const result = await testRule.mutateAsync(id);
            const rule = list.find((r) => r.id === id);
            if (result.passed) toast.success(`"${rule?.name}" passed: ${result.messages.join(" ")}`);
            else toast.warning(`"${rule?.name}" has issues: ${result.messages.join(" ")}`);
          },
        },
      };
    }

    case "/admin/users": {
      const list = users ?? [];
      const rowFor = (u: (typeof list)[number]) => ({ id: u.id, primary: u.name, secondary: u.email, status: u.status });
      return {
        Disable: {
          title: "Disable Users", confirmLabel: "Disable", destructive: true,
          rows: list.filter((u) => u.status === "Active").map(rowFor), emptyMessage: "No active users.",
          run: (id) => {
            const u = list.find((x) => x.id === id);
            if (!u) throw new Error("User not found.");
            return updateUser.mutateAsync({ id, request: { name: u.name, roleId: u.roleId, branchId: u.branchId, status: "Suspended" } });
          },
        },
        "Assign Branch": {
          title: "Reassign Branch", description: "Move the selected users to a different branch.",
          confirmLabel: "Reassign", rows: list.map(rowFor), emptyMessage: "No users found.",
          extraField: { label: "Branch", options: [{ value: "none", label: "All Branches" }, ...(branches ?? []).map((b) => ({ value: String(b.id), label: b.nameEn }))] },
          run: (id, branchId) => {
            const u = list.find((x) => x.id === id);
            if (!u) throw new Error("User not found.");
            return updateUser.mutateAsync({ id, request: { name: u.name, roleId: u.roleId, branchId: branchId && branchId !== "none" ? Number(branchId) : null, status: u.status } });
          },
        },
        "Reset PIN": {
          title: "Reset Cashier PIN", mode: "single", confirmLabel: "Reset PIN",
          rows: list.map(rowFor), emptyMessage: "No users found.",
          run: async (id) => {
            const u = list.find((x) => x.id === id);
            const { pin } = await resetPin.mutateAsync(id);
            toast.success(`New PIN for ${u?.name}: ${pin}`, { duration: 20000 });
          },
        },
      };
    }

    case "/admin/maintenance": {
      const list = maintenance ?? [];
      const rowFor = (t: (typeof list)[number]) => ({ id: t.id, primary: `${t.ticketNo} · ${t.deviceOrModule}`, secondary: t.owner, status: t.status });
      const nextStatus: Record<string, string | undefined> = { Open: "InProgress", InProgress: "Resolved" };
      return {
        Assign: {
          title: "Assign Tickets", description: "Set the owner/technician for the selected tickets.",
          confirmLabel: "Assign", rows: list.filter((t) => t.status !== "Closed").map(rowFor), emptyMessage: "No open tickets.",
          extraField: { label: "Assign to", options: (users ?? []).map((u) => ({ value: u.name, label: u.name })) },
          run: (id, owner) => { if (!owner) throw new Error("Pick who to assign."); return assignMaintenance.mutateAsync({ id, owner }); },
        },
        Update: {
          title: "Advance Ticket Status", description: "Moves each ticket to its next status (Open → In Progress → Resolved).",
          confirmLabel: "Advance", rows: list.filter((t) => nextStatus[t.status]).map(rowFor), emptyMessage: "No tickets can advance further.",
          run: (id) => {
            const t = list.find((x) => x.id === id);
            const next = t ? nextStatus[t.status] : undefined;
            if (!next) throw new Error("Ticket cannot advance further.");
            return updateMaintenanceStatus.mutateAsync({ id, status: next });
          },
        },
        Close: {
          title: "Close Tickets", confirmLabel: "Close",
          rows: list.filter((t) => t.status === "Resolved").map(rowFor), emptyMessage: "No resolved tickets awaiting close.",
          run: (id) => updateMaintenanceStatus.mutateAsync({ id, status: "Closed" }),
        },
      };
    }

    case "/admin/compliance": {
      const list = compliance ?? [];
      return {
        "Sign Off": {
          title: "Sign Off Controls", description: "Marks each control compliant as of today and records who signed it off.",
          confirmLabel: "Sign Off",
          rows: list.filter((c) => c.status !== "Compliant").map((c) => ({ id: c.id, primary: c.control, secondary: c.framework, status: c.status })),
          emptyMessage: "Every control is already compliant.",
          run: (id) => signOffCompliance.mutateAsync({ id }),
        },
        Review: {
          title: "Review Control", mode: "single", confirmLabel: "Open Editor",
          rows: list.map((c) => ({ id: c.id, primary: c.control, secondary: c.framework, status: c.status })),
          emptyMessage: "No controls found.",
          run: async (id) => {
            const c = list.find((x) => x.id === id);
            if (!c) throw new Error("Control not found.");
            openFlow(
              "Edit Control",
              {
                control: c.control, framework: c.framework, owner: c.owner, lastReview: c.lastReview.slice(0, 10),
                nextDue: c.nextDue.slice(0, 10), evidence: c.evidence ?? "", findings: c.findings ?? "", status: c.status,
              },
              async (values) => {
                if (!values.control || !values.owner || !values.nextDue) throw new Error("Control name, owner and next-due date are required.");
                await updateCompliance.mutateAsync({
                  id: c.id,
                  request: {
                    control: values.control, framework: values.framework || c.framework, owner: values.owner,
                    lastReview: values.lastReview || c.lastReview, nextDue: values.nextDue,
                    evidence: values.evidence || null, findings: values.findings || null, status: values.status || c.status,
                  },
                });
              },
            );
          },
        },
      };
    }

    case "/suppliers/suppliers": {
      const list = suppliers ?? [];
      return {
        Ledger: {
          title: "View Supplier Ledger", mode: "single", confirmLabel: "View Ledger",
          rows: list.map((s) => ({ id: s.id, primary: s.nameEn, secondary: s.code, status: s.status })),
          emptyMessage: "No suppliers found.",
          run: async (id) => {
            const table = mapSuppliers(list);
            const idx = table.ids?.indexOf(id) ?? -1;
            if (idx < 0) throw new Error("Supplier not found.");
            showDetail(id, table.rows[idx]);
          },
        },
        "Pay Supplier": {
          title: "Pay Supplier", mode: "single", confirmLabel: "Record Payment",
          rows: list.map((s) => ({ id: s.id, primary: s.nameEn, secondary: s.code, status: s.status })),
          emptyMessage: "No suppliers found.",
          run: async (id) => {
            const s = list.find((x) => x.id === id);
            if (!s) throw new Error("Supplier not found.");
            openFlow("Pay Supplier", { method: "BankTransfer" }, async (values) => {
              const amount = Number(values.amount);
              if (!amount || amount <= 0) throw new Error("Enter a payment amount greater than zero.");
              await recordSupplierPayment.mutateAsync({
                supplierId: s.id, amount, method: values.method || "BankTransfer",
                referenceNo: values.referenceNo || null, notes: values.notes || null,
              });
            });
          },
        },
      };
    }

    case "/admin/settings":
    case "/admin/pos-settings": {
      const list = pathname === "/admin/settings" ? (systemSettings ?? []) : (posSettings ?? []);
      const rowFor = (s: (typeof list)[number]) => ({ id: s.id, primary: `${s.group} · ${s.key}`, secondary: s.value, status: s.status });
      return {
        Configure: {
          title: "Configure Setting", mode: "single", confirmLabel: "Open Editor",
          rows: list.map(rowFor), emptyMessage: "No settings found.",
          run: async (id) => {
            const s = list.find((x) => x.id === id);
            if (!s) throw new Error("Setting not found.");
            openFlow("Edit Setting", { value: s.value }, async (values) => {
              if (!values.value) throw new Error("Value is required.");
              await upsertSetting.mutateAsync({
                category: s.category, group: s.group, key: s.key, value: values.value, scope: s.scope,
                branchId: s.branchId, effectiveFrom: new Date().toISOString().slice(0, 10),
              });
            });
          },
        },
        Validate: {
          title: "Validate Settings", description: "Checks every selected setting has a non-empty, well-formed value.",
          confirmLabel: "Validate",
          rows: list.map(rowFor), emptyMessage: "No settings found.",
          run: async (id) => {
            const s = list.find((x) => x.id === id);
            if (!s) throw new Error("Setting not found.");
            const looksNumeric = /rate|percent|limit|count|hours|days|cap|amount/i.test(s.key);
            if (!s.value.trim()) throw new Error(`"${s.key}" has an empty value.`);
            if (looksNumeric && Number.isNaN(Number(s.value.replace(/[^0-9.-]/g, "")))) {
              throw new Error(`"${s.key}" looks numeric but isn't: "${s.value}".`);
            }
            toast.success(`"${s.key}" is valid.`);
          },
        },
      };
    }

    case "/admin/zatca-invoices": {
      const list = zatcaInvoices ?? [];
      const eligible = list.filter((i) => i.status === "Failed" || i.status === "Pending");
      return {
        Retry: {
          title: "Retry ZATCA Submission", confirmLabel: "Retry",
          rows: eligible.map((i) => ({ id: i.id, primary: i.invoiceNumber, secondary: i.orderNo, status: i.status })),
          emptyMessage: "No failed or pending invoices.",
          run: (id) => {
            const invoice = list.find((i) => i.id === id);
            if (!invoice) throw new Error("Invoice not found.");
            return submitZatcaInvoice.mutateAsync(invoice.orderId);
          },
        },
      };
    }

    case "/finance/expenses": {
      const pending = (expenses ?? []).filter((e) => e.status === "Pending");
      const rows = pending.map((e) => ({
        id: e.id, primary: `${e.expenseNo} · ${e.category}`, secondary: `${e.branchName} · ${e.amount.toFixed(2)} ر.س`,
      }));
      return {
        Approve: {
          title: "Bulk Approve Expenses", description: "Select pending expenses to approve.",
          confirmLabel: "Approve", rows, emptyMessage: "No expenses awaiting approval.",
          run: (id) => updateExpenseStatus.mutateAsync({ id, status: "Approved", approverUserId: null }),
        },
        Reject: {
          title: "Bulk Reject Expenses", description: "Select pending expenses to reject.",
          confirmLabel: "Reject", destructive: true, rows, emptyMessage: "No expenses awaiting approval.",
          run: (id) => updateExpenseStatus.mutateAsync({ id, status: "Rejected", approverUserId: null }),
        },
        Reconcile: {
          title: "Reconcile Expenses", description: "Marks approved expenses as matched against the bank statement.",
          confirmLabel: "Reconcile",
          rows: (expenses ?? []).filter((e) => e.status === "Approved" && !e.reconciled)
            .map((e) => ({ id: e.id, primary: `${e.expenseNo} · ${e.category}`, secondary: `${e.branchName} · ${e.amount.toFixed(2)} ر.س` })),
          emptyMessage: "No approved expenses awaiting reconciliation.",
          run: (id) => reconcileExpense.mutateAsync(id),
        },
      };
    }

    case "/finance/purchase-orders": {
      const pos = purchaseOrders ?? [];
      const rowFor = (p: (typeof pos)[number]) => ({
        id: p.id, primary: `${p.poNo} · ${p.supplierName}`, secondary: `${p.branches.join(", ") || "—"} · ${p.totalValue.toLocaleString("en-US")} ر.س`, status: p.status,
      });
      const draft = pos.filter((p) => p.status === "Draft");
      const pendingApproval = pos.filter((p) => p.status === "PendingApproval");
      const readyToDispatch = pos.filter((p) => p.status === "Sent" || p.status === "Delayed");
      const receivable = pos.filter((p) => ["Sent", "InTransit", "PartialReceive", "Delayed"].includes(p.status) && p.lines.some((l) => l.receivedQty < l.qty));
      const cancellable = pos.filter((p) => ["Draft", "PendingApproval", "Sent"].includes(p.status));
      return {
        Submit: {
          title: "Submit POs for Approval", confirmLabel: "Submit", rows: draft.map(rowFor),
          emptyMessage: "No draft purchase orders.", run: (id) => submitPo.mutateAsync(id),
        },
        Approve: {
          title: "Bulk Approve POs", confirmLabel: "Approve", rows: pendingApproval.map(rowFor),
          emptyMessage: "No purchase orders awaiting approval.",
          run: (id) => approvePo.mutateAsync({ id, approverUserId: null }),
        },
        Dispatch: {
          title: "Mark POs In Transit", description: "Marks the purchase order as dispatched by the supplier.",
          confirmLabel: "Dispatch", rows: readyToDispatch.map(rowFor),
          emptyMessage: "No purchase orders ready to dispatch.",
          run: (id) => dispatchPo.mutateAsync({ id, carrier: null, trackingRef: null }),
        },
        Receive: {
          title: "Quick-Receive POs", description: "Receives every outstanding line in full. For a partial or batch-tracked receive, use the row menu's Receive instead.",
          confirmLabel: "Receive in Full", rows: receivable.map(rowFor),
          emptyMessage: "No purchase orders have outstanding lines to receive.",
          run: (id) => {
            const po = pos.find((p) => p.id === id);
            if (!po) throw new Error("Purchase order not found.");
            const lines = po.lines.filter((l) => l.receivedQty < l.qty).map((l) => ({ lineId: l.id, qty: l.qty - l.receivedQty }));
            if (!lines.length) throw new Error("Nothing outstanding to receive.");
            return receivePo.mutateAsync({ id, lines });
          },
        },
        Cancel: {
          title: "Cancel Purchase Orders", confirmLabel: "Cancel Selected", destructive: true,
          rows: cancellable.map(rowFor), emptyMessage: "No cancellable purchase orders.",
          run: (id) => cancelPo.mutateAsync(id),
        },
      };
    }

    case "/finance/pricing": {
      const rules = pricingRules ?? [];
      const rowFor = (r: (typeof rules)[number]) => ({
        id: r.id, primary: r.name, secondary: `${r.type} · ${r.scope}`, status: r.status,
      });
      return {
        Approve: {
          title: "Bulk Approve Pricing Rules", confirmLabel: "Approve",
          rows: rules.filter((r) => r.status === "PendingApproval").map(rowFor),
          emptyMessage: "No pricing rules awaiting approval.",
          run: (id) => updatePricingRuleStatus.mutateAsync({ id, status: "Active" }),
        },
        Activate: {
          title: "Reactivate Pricing Rules", confirmLabel: "Activate",
          rows: rules.filter((r) => r.status === "Expired" || r.status === "Inactive").map(rowFor),
          emptyMessage: "No expired or inactive pricing rules.",
          run: (id) => updatePricingRuleStatus.mutateAsync({ id, status: "Active" }),
        },
        Expire: {
          title: "Expire Pricing Rules", confirmLabel: "Expire", destructive: true,
          rows: rules.filter((r) => r.status === "Active").map(rowFor),
          emptyMessage: "No active pricing rules.",
          run: (id) => updatePricingRuleStatus.mutateAsync({ id, status: "Expired" }),
        },
      };
    }

    case "/finance/returns": {
      const eligible = (customerReturns ?? []).filter((r) => r.status === "PendingApproval" || r.status === "Quarantine");
      const rows = eligible.map((r) => ({
        id: r.id, primary: `${r.returnNo} · ${r.customerName}`, secondary: `${r.type} · ${r.totalAmount.toFixed(2)} ر.س`, status: r.status,
      }));
      const branchOptions = (branches ?? []).map((b) => ({ value: String(b.id), label: b.nameEn }));
      const config: BulkActionConfig = {
        title: "Approve & Refund Returns", description: "Restocks (unless damaged), posts the refund and reverses loyalty points.",
        mode: "single", confirmLabel: "Approve & Refund", rows, emptyMessage: "No returns awaiting approval.",
        extraField: { label: "Refund to branch", options: branchOptions },
        run: (id, branchId) => approveReturn.mutateAsync({ id, branchId: Number(branchId) }),
      };
      // "Process Return", "Approve" and "Refund" are three menu entry points into the same real
      // approve-and-refund workflow — this backend only models it as a single atomic operation.
      return {
        "Process Return": config, Approve: config, Refund: config,
        Quarantine: {
          title: "Quarantine Returns", description: "Holds the physical goods for inspection instead of approving them yet.",
          confirmLabel: "Quarantine", destructive: true,
          rows: (customerReturns ?? []).filter((r) => r.status === "PendingApproval")
            .map((r) => ({ id: r.id, primary: `${r.returnNo} · ${r.customerName}`, secondary: r.reason })),
          emptyMessage: "No pending returns to quarantine.",
          run: (id) => quarantineReturn.mutateAsync(id),
        },
        DGRN: {
          title: "Generate Debit / Goods Return Note", mode: "single", confirmLabel: "Download DGRN",
          rows: (customerReturns ?? []).filter((r) => r.status === "Completed")
            .map((r) => ({ id: r.id, primary: `${r.returnNo} · ${r.customerName}`, secondary: `${r.totalAmount.toFixed(2)} ر.س` })),
          emptyMessage: "No completed returns to document.",
          run: async (id) => {
            const r = (customerReturns ?? []).find((x) => x.id === id);
            if (!r) throw new Error("Return not found.");
            downloadCsv(`dgrn-${r.returnNo}.csv`, [
              ["Debit / Goods Return Note"],
              ["Return #", r.returnNo],
              ["Date", new Date(r.createdAt).toLocaleDateString("en-GB")],
              ["Customer", r.customerName],
              ["Order", r.orderNo ?? "—"],
              ["Type", r.type],
              ["Reason", r.reason],
              ["Approved By", r.approvedByName ?? "—"],
              [],
              ["SKU", "Product", "Qty", "Amount (SAR)"],
              ...r.lines.map((l) => [l.sku, l.productName, String(l.qty), l.amount.toFixed(2)]),
              [],
              ["Total Refund (SAR)", r.totalAmount.toFixed(2)],
            ]);
          },
        },
      };
    }

    case "/suppliers/rts": {
      const list = rts ?? [];
      const rowFor = (r: (typeof list)[number]) => ({
        id: r.id, primary: `${r.rtsNo} · ${r.supplierName}`, secondary: r.reason, status: r.status,
      });
      return {
        Dispatch: {
          title: "Dispatch Returns to Supplier", confirmLabel: "Dispatch",
          rows: list.filter((r) => r.status === "Draft").map(rowFor),
          emptyMessage: "No draft returns to supplier.",
          run: (id) => dispatchRts.mutateAsync(id),
        },
        Reject: {
          title: "Reject Returns to Supplier", confirmLabel: "Reject", destructive: true,
          rows: list.filter((r) => r.status === "Dispatched").map(rowFor),
          emptyMessage: "No dispatched returns awaiting a supplier decision.",
          run: (id) => rejectRts.mutateAsync(id),
        },
      };
    }

    case "/insights/sales": {
      const list = salesSegments ?? [];
      return {
        "Drill Down": {
          title: "Drill Down by Segment", mode: "single", confirmLabel: "View SKUs",
          rows: list.map((s, i) => ({ id: i, primary: s.segment, secondary: `${s.value.toLocaleString("en-US")} ر.س · ${s.tx} tx` })),
          emptyMessage: "No sales segments found.",
          run: async (id) => {
            const s = list[id];
            if (!s) throw new Error("Segment not found.");
            navigate({ to: "/stock/inventory", search: { category: s.segment } });
          },
        },
      };
    }

    case "/insights/reports": {
      const list = reports ?? [];
      const rowFor = (r: (typeof list)[number]) => ({ id: r.id, primary: r.name, secondary: `${r.frequency} · ${r.format}`, status: r.status });
      return {
        Open: {
          title: "Open Report", mode: "single", confirmLabel: "Download",
          rows: list.map(rowFor), emptyMessage: "No reports found.",
          run: async (id) => {
            const r = list.find((x) => x.id === id);
            if (!r) throw new Error("Report not found.");
            downloadCsv(`report-${r.code}.csv`, [["Code", "Name", "Category", "Owner", "Frequency", "Format", "Status"], [r.code, r.name, r.category, r.owner, r.frequency, r.format, r.status]]);
          },
        },
        Download: {
          title: "Download Report", mode: "single", confirmLabel: "Download",
          rows: list.map(rowFor), emptyMessage: "No reports found.",
          run: async (id) => {
            const r = list.find((x) => x.id === id);
            if (!r) throw new Error("Report not found.");
            downloadCsv(`report-${r.code}.csv`, [["Code", "Name", "Category", "Owner", "Frequency", "Format", "Status"], [r.code, r.name, r.category, r.owner, r.frequency, r.format, r.status]]);
          },
        },
        Schedule: {
          title: "Toggle Report Schedule", description: "Active reports generate on their frequency; paused ones don't.",
          confirmLabel: "Toggle",
          rows: list.map(rowFor), emptyMessage: "No reports found.",
          run: (id) => {
            const r = list.find((x) => x.id === id);
            if (!r) throw new Error("Report not found.");
            return setReportStatus.mutateAsync({ id, status: r.status === "Active" ? "Inactive" : "Active" });
          },
        },
      };
    }

    case "/insights/kpi": {
      const list = kpis ?? [];
      const rowFor = (k: (typeof list)[number]) => ({ id: k.id, primary: k.name, secondary: `${k.category} · ${k.owner}`, status: k.status });
      return {
        "Edit Target": {
          title: "Edit KPI Target", mode: "single", confirmLabel: "Edit",
          rows: list.map(rowFor), emptyMessage: "No KPIs found.",
          run: async (id) => {
            const k = list.find((x) => x.id === id);
            if (!k) throw new Error("KPI not found.");
            const next = window.prompt(`New target for "${k.name}" (current: ${k.target}):`, String(k.target));
            if (next === null) return;
            const target = Number(next);
            if (Number.isNaN(target)) throw new Error("Target must be a number.");
            await updateKpiTarget.mutateAsync({ id, target });
          },
        },
        "View Trend": {
          title: "View KPI Trend", mode: "single", confirmLabel: "View",
          rows: list.map(rowFor), emptyMessage: "No KPIs found.",
          run: async (id) => {
            const table = mapKpis(list);
            const idx = table.ids?.indexOf(id) ?? -1;
            if (idx < 0) throw new Error("KPI not found.");
            showDetail(id, table.rows[idx]);
          },
        },
      };
    }

    case "/insights/bi": {
      const list = biFeeds ?? [];
      const rowFor = (f: (typeof list)[number]) => ({ id: f.id, primary: f.name, secondary: `${f.source} → ${f.destination}`, status: f.status });
      return {
        "Retry Failed": {
          title: "Retry Failed Feeds", confirmLabel: "Retry",
          rows: list.filter((f) => f.failed > 0 || f.status !== "Healthy").map(rowFor),
          emptyMessage: "No feeds have failures.",
          run: (id) => retryBiFeed.mutateAsync(id),
        },
        "View Schema": {
          title: "View Feed Schema", mode: "single", confirmLabel: "View",
          rows: list.map(rowFor), emptyMessage: "No BI feeds found.",
          run: async (id) => {
            const table = mapBiFeeds(list);
            const idx = table.ids?.indexOf(id) ?? -1;
            if (idx < 0) throw new Error("Feed not found.");
            showDetail(id, table.rows[idx]);
          },
        },
      };
    }

    case "/admin/overview": {
      const areas = overview?.areas ?? [];
      const rowFor = (a: (typeof areas)[number], i: number) => ({ id: i, primary: a.area, secondary: `${a.metric}: ${a.value}`, status: a.status });
      const routeFor = (area: string): string =>
        /zatca/i.test(area) ? "/admin/zatca-invoices" : /compliance/i.test(area) ? "/admin/compliance" : "/admin/audit-logs";
      return {
        Investigate: {
          title: "Investigate Area", mode: "single", confirmLabel: "Open",
          rows: areas.map(rowFor), emptyMessage: "No areas reported.",
          run: async (id) => { navigate({ to: routeFor(areas[id]?.area ?? "") }); },
        },
        Assign: {
          title: "Assign to a Ticket", description: "Opens a maintenance ticket for this area and assigns it.",
          mode: "single", confirmLabel: "Create & Assign",
          rows: areas.map(rowFor), emptyMessage: "No areas reported.",
          extraField: { label: "Assign to", options: (users ?? []).map((u) => ({ value: u.name, label: u.name })) },
          run: async (id, owner) => {
            const a = areas[id];
            if (!a) throw new Error("Area not found.");
            if (!owner) throw new Error("Pick who to assign.");
            await createMaintenance.mutateAsync({ deviceOrModule: a.area, branchId: null, severity: "Warning", owner, slaHours: 24 });
          },
        },
        Escalate: {
          title: "Escalate Area", description: "Opens a critical maintenance ticket for this area.",
          mode: "single", confirmLabel: "Escalate",
          rows: areas.map(rowFor), emptyMessage: "No areas reported.",
          run: async (id) => {
            const a = areas[id];
            if (!a) throw new Error("Area not found.");
            await createMaintenance.mutateAsync({ deviceOrModule: a.area, branchId: null, severity: "Critical", owner: "IT Support", slaHours: 4 });
          },
        },
      };
    }

    default:
      return undefined;
  }
}
