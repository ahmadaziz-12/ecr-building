import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import type { Field } from "@/lib/buildpos/flows";
import {
  formatUomConversions,
  parseUomConversions,
  formatCutToSizeMode,
  parseCutToSizeMode,
} from "@/lib/buildpos/uom";
import { formatAttributes, parseAttributes } from "@/lib/buildpos/attributes";
import {
  resolveParentCategory,
  resolveProductCategoryId,
  splitProductCategory,
  useCategories,
  useProducts,
  useSetCategoryStatus,
  useSetProductStatus,
  useUpdateCategory,
  useUpdateProduct,
} from "./catalog";
import { useBundles, useSetBundleStatus, type BundleDto } from "./bundles";
import {
  useApproveTransfer,
  useBranchStockBatches,
  useCancelTransfer,
  useCreateStockAdjustment,
  useCreateStockTransfer,
  useCreateWarehouseBin,
  useDispatchTransfer,
  usePromoBatch,
  usePromoBranchBatch,
  useQuarantineBatch,
  useQuarantineBranchBatch,
  useReceiveTransfer,
  useSetWarehouseStatus,
  useStockBatches,
  useStockTransfers,
  useSubmitTransfer,
  useUpdateWarehouse,
  useWarehouses,
  useWriteOffBatch,
  useWriteOffBranchBatch,
} from "./inventory";
import { usePrintLabel } from "./print";
import {
  useApprovePurchaseOrder,
  useCancelPurchaseOrder,
  useCancelRts,
  useCreditRts,
  useDispatchPurchaseOrder,
  useDispatchRts,
  useReceivePurchaseOrder,
  useRejectRts,
  useSetSupplierStatus,
  useSubmitPurchaseOrder,
  useSuppliers,
  usePurchaseOrders,
  useReturnsToSupplier,
  useUpdateSupplier,
} from "./procurement";
import {
  useApproveReturn,
  useExpenses,
  useReturns,
  useSetTaxCodeStatus,
  useTaxCodes,
  useUpdateExpenseStatus,
  useUpdateTaxCode,
  type ReturnDto,
} from "./finance";
import {
  usePricingRules,
  useUpdatePricingRuleStatus,
  useDeletePricingRule,
  type PricingRuleDto,
} from "./pos";
import { useSubmitZatcaInvoice, useZatcaInvoices } from "./zatca";
import {
  useInsightsReports,
  useSetReportStatus,
  useInsightsBi,
  useRetryBiFeed,
  useUpdateKpiTarget,
} from "./insights";
import {
  useUsers,
  useRoles,
  useBranches,
  useTerminals,
  useDevices,
  useUpdateUser,
  useUpdateBranch,
  useUpdateTerminal,
  useUpdateDevice,
  useSetTerminalStatus,
  useSetDeviceStatus,
  useRules,
  useCompliance,
  useMaintenance,
  useSettings,
  useCreateMaintenance,
  useUpdateRule,
  useUpdateCompliance,
  useUpdateMaintenanceStatus,
  useUpsertSetting,
  TERMINAL_TYPE_TO_BACKEND,
  TERMINAL_TYPE_TO_FRONTEND,
  CONNECTION_TO_BACKEND,
  CONNECTION_TO_FRONTEND,
  RULE_DOMAIN_TO_BACKEND,
  RULE_DOMAIN_TO_FRONTEND,
  RULE_PRIORITY_TO_NUMBER,
  rulePriorityLabel,
} from "./admin";

function confirmed(message: string, fn: () => Promise<unknown>, okMsg: string): () => void {
  return () => {
    if (!window.confirm(message)) return;
    guarded(fn, okMsg)();
  };
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export type RowAction = { label: string; onClick: () => void; tone?: "default" | "critical" };

function guarded(fn: () => Promise<unknown>, okMsg: string): () => void {
  return () => {
    fn()
      .then(() => toast.success(okMsg))
      .catch((err) => toast.error(err instanceof Error ? err.message : "Action failed."));
  };
}

/**
 * Real per-row menu actions for the six Products & Stock pages, keyed by pathname — mirrors the
 * useModuleLiveData / useFlowSubmitHandlers pattern of switching on pathname inside one hook so
 * ModulePage stays generic and modules.ts stays pure data.
 */
export function useRowActions(
  pathname: string,
  openFlow: (
    title: string,
    initialValues: Record<string, string>,
    onSubmit: (values: Record<string, string>) => Promise<void>,
    fieldOverrides?: Record<string, Partial<Field>>,
  ) => void,
  openKioskPairing?: (terminalId: number) => void,
  openPricingRuleEditor?: (rule: PricingRuleDto) => void,
  // BRD §3.2.1 exchange workflow: Exchange-type returns need a real payment step at approval (the
  // net difference between the return's credit and the replacement item(s)), not the generic
  // text-field "Approve Return" flow every other return type uses.
  openApproveExchange?: (ret: ReturnDto) => void,
  openBundleEditor?: (bundle: BundleDto) => void,
): (id: number | undefined, row: (string | number)[], statusText: string) => RowAction[] {
  const navigate = useNavigate();

  const { data: products } = useProducts(
    pathname === "/stock/inventory" ||
      pathname === "/stock/stocks" ||
      pathname === "/stock/branch-stock",
  );
  const setProductStatus = useSetProductStatus();
  const updateProduct = useUpdateProduct();
  const printLabel = usePrintLabel();

  const { data: categories } = useCategories(
    pathname === "/admin/categories" || pathname === "/stock/inventory",
  );
  const setCategoryStatus = useSetCategoryStatus();
  const updateCategory = useUpdateCategory();

  const { data: warehouses } = useWarehouses(
    pathname === "/stock/stocks" ||
      pathname === "/stock/warehouses" ||
      pathname === "/stock/branch-stock",
  );
  const createStockAdjustment = useCreateStockAdjustment();
  const createStockTransfer = useCreateStockTransfer();
  const { data: transfers } = useStockTransfers(pathname === "/stock/transfers");
  const updateWarehouse = useUpdateWarehouse();
  const setWarehouseStatus = useSetWarehouseStatus();
  const createWarehouseBin = useCreateWarehouseBin();

  const { data: batches } = useStockBatches(pathname === "/stock/expiry");
  const { data: branchBatches } = useBranchStockBatches(pathname === "/stock/expiry");
  const quarantineBatch = useQuarantineBatch();
  const writeOffBatch = useWriteOffBatch();
  const promoBatch = usePromoBatch();
  const quarantineBranchBatch = useQuarantineBranchBatch();
  const writeOffBranchBatch = useWriteOffBranchBatch();
  const promoBranchBatch = usePromoBranchBatch();

  const submitTransfer = useSubmitTransfer();
  const approveTransfer = useApproveTransfer();
  const dispatchTransfer = useDispatchTransfer();
  const receiveTransfer = useReceiveTransfer();
  const cancelTransfer = useCancelTransfer();

  const { data: bundles } = useBundles(pathname === "/stock/bundles");
  const setBundleStatus = useSetBundleStatus();

  const { data: suppliers } = useSuppliers(pathname === "/suppliers/suppliers");
  const setSupplierStatus = useSetSupplierStatus();
  const updateSupplier = useUpdateSupplier();

  const { data: purchaseOrders } = usePurchaseOrders(pathname === "/finance/purchase-orders");
  const submitPo = useSubmitPurchaseOrder();
  const approvePo = useApprovePurchaseOrder();
  const dispatchPo = useDispatchPurchaseOrder();
  const receivePo = useReceivePurchaseOrder();
  const cancelPo = useCancelPurchaseOrder();

  const { data: returns } = useReturnsToSupplier(pathname === "/suppliers/rts");
  const dispatchRts = useDispatchRts();
  const creditRts = useCreditRts();
  const rejectRts = useRejectRts();
  const cancelRts = useCancelRts();

  const { data: expenses } = useExpenses(pathname === "/finance/expenses");
  const updateExpenseStatus = useUpdateExpenseStatus();

  const { data: pricingRules } = usePricingRules(pathname === "/finance/pricing");
  const updatePricingRuleStatus = useUpdatePricingRuleStatus();
  const deletePricingRule = useDeletePricingRule();

  const { data: customerReturns } = useReturns(pathname === "/finance/returns");
  const approveReturn = useApproveReturn();

  const { data: taxCodes } = useTaxCodes(pathname === "/finance/tax-zatca");
  const updateTaxCode = useUpdateTaxCode();
  const setTaxCodeStatus = useSetTaxCodeStatus();

  const { data: zatcaInvoices } = useZatcaInvoices(undefined, pathname === "/admin/zatca-invoices");
  const submitZatcaInvoice = useSubmitZatcaInvoice();

  const { data: users } = useUsers(
    pathname === "/admin/users" ||
      pathname === "/admin/rules" ||
      pathname === "/network/terminals" ||
      pathname === "/admin/overview",
  );
  const { data: roles } = useRoles(pathname === "/admin/users");
  const { data: branches } = useBranches(
    pathname === "/admin/users" ||
      pathname === "/network/branches" ||
      pathname === "/network/terminals" ||
      pathname === "/stock/warehouses" ||
      pathname === "/stock/stocks" ||
      pathname === "/stock/branch-stock" ||
      pathname === "/finance/returns" ||
      pathname === "/finance/tax-zatca",
  );
  const { data: terminals } = useTerminals(
    pathname === "/network/terminals" || pathname === "/network/devices",
  );
  const { data: devices } = useDevices(pathname === "/network/devices");
  const updateUser = useUpdateUser();
  const updateBranch = useUpdateBranch();
  const updateTerminal = useUpdateTerminal();
  const updateDevice = useUpdateDevice();
  const setTerminalStatus = useSetTerminalStatus();
  const setDeviceStatus = useSetDeviceStatus();

  const { data: rules } = useRules(pathname === "/admin/rules");
  const { data: compliance } = useCompliance(pathname === "/admin/compliance");
  const { data: maintenance } = useMaintenance(pathname === "/admin/maintenance");
  const { data: systemSettings } = useSettings("System", pathname === "/admin/settings");
  const { data: posSettings } = useSettings("Pos", pathname === "/admin/pos-settings");
  const updateRule = useUpdateRule();
  const updateCompliance = useUpdateCompliance();
  const updateMaintenanceStatus = useUpdateMaintenanceStatus();
  const upsertSetting = useUpsertSetting();
  const createMaintenance = useCreateMaintenance();
  const updateKpiTarget = useUpdateKpiTarget();
  const { data: reports } = useInsightsReports(pathname === "/insights/reports");
  const setReportStatus = useSetReportStatus();
  const { data: biFeeds } = useInsightsBi(pathname === "/insights/bi");
  const retryBiFeed = useRetryBiFeed();

  // Shared by /stock/stocks and /stock/branch-stock: a transfer's source/destination can each be
  // either a warehouse or a branch (mirrors the backend's WithIncludes/Debit/Credit "either-or" model).
  const createTransferAction = (fromLabel: string, sku: string): RowAction => ({
    label: "Transfer",
    onClick: () =>
      openFlow(
        "Create Transfer",
        { from: fromLabel, items: JSON.stringify([{ sku, qty: "1" }]) },
        async (values) => {
          if (!values.from || !values.to) throw new Error("From and To location are required.");
          const resolve = (value: string) => {
            if (value.toLowerCase().startsWith("warehouse:")) {
              const name = value.slice("warehouse:".length).trim();
              const w = warehouses?.find((x) => x.name.toLowerCase() === name.toLowerCase());
              if (!w) throw new Error(`Unknown warehouse "${name}".`);
              return { warehouseId: w.id as number | null, branchId: null as number | null };
            }
            if (value.toLowerCase().startsWith("branch:")) {
              const name = value.slice("branch:".length).trim();
              const b = branches?.find((x) => x.nameEn.toLowerCase() === name.toLowerCase());
              if (!b) throw new Error(`Unknown branch "${name}".`);
              return { warehouseId: null as number | null, branchId: b.id as number | null };
            }
            throw new Error(`"${value}" must be prefixed "Warehouse:" or "Branch:".`);
          };
          const from = resolve(values.from);
          const to = resolve(values.to);
          if (from.warehouseId !== null && from.warehouseId === to.warehouseId)
            throw new Error("Source and destination warehouse must differ.");
          if (from.branchId !== null && from.branchId === to.branchId)
            throw new Error("Source and destination branch must differ.");
          if (!values.items) throw new Error("At least one line item is required.");
          const rows = JSON.parse(values.items) as {
            sku?: string;
            qty?: string;
            unitCost?: string;
            batchNo?: string;
            expiryDate?: string;
          }[];
          const lines = rows.map((row) => {
            if (!row.sku || !(Number(row.qty) > 0))
              throw new Error("Every line needs an item and a quantity greater than 0.");
            const p = products?.find((pr) => pr.sku.toLowerCase() === row.sku!.toLowerCase());
            if (!p) throw new Error(`Unknown SKU "${row.sku}".`);
            return {
              productId: p.id,
              qty: Number(row.qty),
              unitCost: Number(row.unitCost || p.costPrice),
              batchNo: row.batchNo || null,
              expiryDate: row.expiryDate || null,
            };
          });
          await createStockTransfer.mutateAsync({
            fromWarehouseId: from.warehouseId,
            fromBranchId: from.branchId,
            toWarehouseId: to.warehouseId,
            toBranchId: to.branchId,
            eta: values.eta || null,
            carrier: values.carrier || null,
            notes: values.notes || null,
            lines,
          });
        },
      ),
  });

  return (id, row, statusText) => {
    switch (pathname) {
      case "/stock/inventory": {
        const product = products?.find((p) => p.id === id);
        if (!product) return [];
        return [
          {
            label: "Edit",
            onClick: () =>
              openFlow(
                "Edit SKU",
                {
                  sku: product.sku,
                  barcode: product.barcode ?? "",
                  nameEn: product.nameEn,
                  nameAr: product.nameAr ?? "",
                  ...splitProductCategory(categories, product.categoryId),
                  brand: product.brand ?? "",
                  imageUrl: product.imageUrl ?? "",
                  attributes: formatAttributes(product.attributes ?? []),
                  stockUom: product.stockUom,
                  uomConversions: formatUomConversions(product.uomConversions),
                  cutToSizeMode: formatCutToSizeMode(product.isCutToSize, product.cutToSizeUnit),
                  weight: String(product.weight),
                  returnable: product.returnable ? "on" : "",
                  cost: String(product.costPrice),
                  price: String(product.sellingPrice),
                  contractorPrice:
                    product.contractorPrice != null ? String(product.contractorPrice) : "",
                  wholesalePrice:
                    product.wholesalePrice != null ? String(product.wholesalePrice) : "",
                  projectPrice: product.projectPrice != null ? String(product.projectPrice) : "",
                  vat:
                    product.vatRate === 0
                      ? "0% (Export)"
                      : product.vatRate === 15
                        ? "15%"
                        : "Exempt",
                  reorder: String(product.reorderLevel),
                  reorderQty: String(product.reorderQty),
                },
                async (values) => {
                  if (!values.sku || !values.nameEn)
                    throw new Error("SKU and Name (English) are required.");
                  const categoryId =
                    resolveProductCategoryId(
                      categories,
                      values.category ?? "",
                      values.subcategory,
                    ) ?? product.categoryId;
                  const vatRate =
                    values.vat === "Exempt" ? 0 : values.vat?.startsWith("0%") ? 0 : 15;
                  const conversions = parseUomConversions(values.uomConversions);
                  const { isCutToSize, cutToSizeUnit } = parseCutToSizeMode(values.cutToSizeMode);
                  await updateProduct.mutateAsync({
                    id: product.id,
                    request: {
                      sku: values.sku,
                      barcode: values.barcode || null,
                      nameEn: values.nameEn,
                      nameAr: values.nameAr || null,
                      categoryId,
                      brand: values.brand || null,
                      costPrice: Number(values.cost || 0),
                      sellingPrice: Number(values.price || 0),
                      contractorPrice: values.contractorPrice
                        ? Number(values.contractorPrice)
                        : null,
                      wholesalePrice: values.wholesalePrice ? Number(values.wholesalePrice) : null,
                      projectPrice: values.projectPrice ? Number(values.projectPrice) : null,
                      vatRate,
                      stockUom: values.stockUom || "Piece",
                      // Display-label list, derived from the same conversions the cashier can
                      // actually sell in — no separate "Selling UOMs" input to keep in sync with it.
                      sellUoms: conversions.map((c) => c.uom),
                      weight: Number(values.weight || 0),
                      returnable: values.returnable === "on",
                      reorderLevel: Number(values.reorder || 0),
                      reorderQty: Number(values.reorderQty || 0),
                      imageUrl: values.imageUrl || null,
                      uomConversions: conversions,
                      isCutToSize,
                      cutToSizeUnit,
                      attributes: parseAttributes(values.attributes),
                    },
                  });
                },
              ),
          },
          product.status === "Active"
            ? {
                label: "Deactivate",
                onClick: guarded(
                  () => setProductStatus.mutateAsync({ id: product.id, status: "Inactive" }),
                  "Product deactivated",
                ),
                tone: "critical",
              }
            : {
                label: "Activate",
                onClick: guarded(
                  () => setProductStatus.mutateAsync({ id: product.id, status: "Active" }),
                  "Product activated",
                ),
              },
          {
            label: "Print Label",
            onClick: guarded(
              () => printLabel.mutateAsync({ productId: product.id, terminalId: null }),
              "Label sent to print queue",
            ),
          },
          {
            label: "View Category",
            onClick: () =>
              navigate({ to: "/admin/categories", search: { category: product.categoryName } }),
          },
        ];
      }

      case "/admin/categories": {
        const category = categories?.find((c) => c.id === id);
        if (!category) return [];
        return [
          {
            label: "Edit",
            onClick: () =>
              openFlow(
                "Edit Category",
                {
                  code: category.code,
                  nameEn: category.nameEn,
                  nameAr: category.nameAr ?? "",
                  parent: category.parentName ?? "— This is a Main Category —",
                  attributes: category.attributes.join(", "),
                  returnRule: category.returnRule,
                  defaultUom: category.defaultUom,
                  vat: category.vatRate === 0 ? "0%" : category.vatRate === 15 ? "15%" : "Exempt",
                  returnable: category.returnable ? "on" : "",
                },
                async (values) => {
                  if (!values.code || !values.nameEn)
                    throw new Error("Code and Name (English) are required.");
                  const parentName =
                    values.parent && values.parent !== "— This is a Main Category —"
                      ? values.parent
                      : null;
                  const parent = parentName
                    ? resolveParentCategory(categories, parentName, category.id)
                    : undefined;
                  const vatRate =
                    values.vat === "Exempt" ? 0 : values.vat?.startsWith("0%") ? 0 : 15;
                  await updateCategory.mutateAsync({
                    id: category.id,
                    request: {
                      code: values.code,
                      nameEn: values.nameEn,
                      nameAr: values.nameAr || null,
                      parentId: parent?.id ?? null,
                      attributes: values.attributes
                        ? values.attributes
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean)
                        : [],
                      returnRule: values.returnRule || category.returnRule,
                      defaultUom: values.defaultUom || category.defaultUom,
                      vatRate,
                      returnable: values.returnable === "on",
                    },
                  });
                },
              ),
          },
          {
            label: "View SKUs",
            onClick: () =>
              navigate({ to: "/stock/inventory", search: { category: category.nameEn } }),
          },
          category.status === "Active"
            ? {
                label: "Deactivate",
                onClick: guarded(
                  () => setCategoryStatus.mutateAsync({ id: category.id, status: "Inactive" }),
                  "Category deactivated",
                ),
                tone: "critical",
              }
            : {
                label: "Activate",
                onClick: guarded(
                  () => setCategoryStatus.mutateAsync({ id: category.id, status: "Active" }),
                  "Category activated",
                ),
              },
        ];
      }

      case "/stock/stocks": {
        const [sku, , , warehouseName, onHand] = row;
        const product = products?.find((p) => p.sku === sku);
        return [
          {
            label: "Adjust",
            onClick: () =>
              openFlow(
                "New Adjustment",
                {
                  reason: "Cycle Count Correction",
                  warehouse: String(warehouseName),
                  sku: String(sku),
                  system: String(onHand),
                  counted: String(onHand),
                },
                async (values) => {
                  if (!values.reason || !values.sku || !values.counted)
                    throw new Error("Reason, SKU and Counted Qty are required.");
                  const warehouse = warehouses?.find(
                    (w) => w.name.toLowerCase() === values.warehouse.toLowerCase(),
                  );
                  if (!warehouse) throw new Error(`Unknown warehouse "${values.warehouse}".`);
                  if (!product) throw new Error(`Unknown SKU "${values.sku}".`);
                  await createStockAdjustment.mutateAsync({
                    reason: values.reason,
                    warehouseId: warehouse.id,
                    date: values.date || new Date().toISOString().slice(0, 10),
                    approverUserId: null,
                    evidenceAttached: values.attachEvidence === "on",
                    lines: [
                      {
                        productId: product.id,
                        systemQty: Number(values.system || 0),
                        countedQty: Number(values.counted || 0),
                        note: values.note || null,
                      },
                    ],
                  });
                },
              ),
          },
          createTransferAction(`Warehouse: ${String(warehouseName)}`, String(sku)),
          {
            label: "Reorder",
            // No sku search param: PO rows carry no SKU text, so seeding the list's free-text
            // search with it always filtered every record out.
            onClick: () => navigate({ to: "/finance/purchase-orders" }),
          },
        ];
      }

      case "/stock/branch-stock": {
        const [sku, , categoryName, branchName] = row;
        return [
          createTransferAction(`Branch: ${String(branchName)}`, String(sku)),
          {
            label: "View in Catalog",
            onClick: () =>
              navigate({ to: "/stock/inventory", search: { category: String(categoryName) } }),
          },
          {
            label: "Reorder",
            onClick: () => navigate({ to: "/finance/purchase-orders" }),
          },
        ];
      }

      case "/stock/expiry": {
        // Merged list (see mapStockBatches): a negative id is a branch batch stored with its real
        // id negated, since BranchStockBatch and StockBatch are separate tables with overlapping
        // id sequences — each needs its own pair of action endpoints.
        if (id === undefined) return [];
        const isBranch = id < 0;
        const batch = isBranch
          ? branchBatches?.find((b) => b.id === -id)
          : batches?.find((b) => b.id === id);
        if (!batch) return [];
        return [
          {
            label: "Quarantine",
            onClick: guarded(
              () =>
                isBranch
                  ? quarantineBranchBatch.mutateAsync(batch.id)
                  : quarantineBatch.mutateAsync(batch.id),
              "Batch quarantined",
            ),
            tone: "critical",
          },
          {
            label: "Write-Off",
            onClick: guarded(
              () =>
                isBranch
                  ? writeOffBranchBatch.mutateAsync(batch.id)
                  : writeOffBatch.mutateAsync(batch.id),
              "Batch written off",
            ),
            tone: "critical",
          },
          {
            label: "Move to Promo",
            onClick: guarded(
              () =>
                isBranch
                  ? promoBranchBatch.mutateAsync(batch.id)
                  : promoBatch.mutateAsync(batch.id),
              "Batch moved to promo",
            ),
          },
        ];
      }

      case "/stock/transfers": {
        if (!id) return [];
        const actions: RowAction[] = [];
        if (statusText === "Draft") {
          actions.push({
            label: "Submit for Approval",
            onClick: guarded(
              () => submitTransfer.mutateAsync(id),
              "Transfer submitted for approval",
            ),
          });
          actions.push({
            label: "Cancel",
            onClick: guarded(() => cancelTransfer.mutateAsync(id), "Transfer cancelled"),
            tone: "critical",
          });
        }
        if (statusText === "PendingApproval") {
          actions.push({
            label: "Approve",
            onClick: guarded(
              () => approveTransfer.mutateAsync({ id, approverUserId: null }),
              "Transfer approved",
            ),
          });
          actions.push({
            label: "Cancel",
            onClick: guarded(() => cancelTransfer.mutateAsync(id), "Transfer cancelled"),
            tone: "critical",
          });
        }
        if (statusText === "Approved") {
          actions.push({
            label: "Dispatch",
            onClick: guarded(() => dispatchTransfer.mutateAsync(id), "Transfer dispatched"),
          });
          actions.push({
            label: "Cancel",
            onClick: guarded(() => cancelTransfer.mutateAsync(id), "Transfer cancelled"),
            tone: "critical",
          });
        }
        if (statusText === "InTransit") {
          const transfer = transfers?.find((t) => t.id === id);
          actions.push({
            label: "Receive",
            onClick: () =>
              openFlow(
                "Receive Transfer",
                {
                  lines: JSON.stringify(
                    (transfer?.lines ?? []).map((l) => ({
                      line: String(l.id),
                      qty: String(l.qty),
                    })),
                  ),
                },
                async (values) => {
                  if (!values.lines) throw new Error("At least one line to receive is required.");
                  const rows = JSON.parse(values.lines) as { line?: string; qty?: string }[];
                  const lines = rows
                    .filter((r) => r.line && r.qty)
                    .map((r) => ({ lineId: Number(r.line), receivedQty: Number(r.qty) }));
                  if (!lines.length) throw new Error("At least one line to receive is required.");
                  await receiveTransfer.mutateAsync({ id, lines });
                },
                {
                  lines: {
                    lineItemColumns: [
                      {
                        key: "line",
                        label: "Transfer Line",
                        type: "select",
                        options: (transfer?.lines ?? []).map((l) => ({
                          value: String(l.id),
                          label: `${l.sku} (planned ${l.qty})`,
                        })),
                      },
                      { key: "qty", label: "Qty Received", type: "number", placeholder: "0" },
                    ],
                  },
                },
              ),
          });
          actions.push({
            label: "Cancel (Recall)",
            onClick: guarded(
              () => cancelTransfer.mutateAsync(id),
              "Transfer cancelled — stock restored",
            ),
            tone: "critical",
          });
        }
        return actions;
      }

      case "/stock/warehouses": {
        const warehouse = warehouses?.find((w) => w.id === id);
        if (!warehouse) return [];
        const actions: RowAction[] = [
          {
            label: "Edit",
            onClick: () =>
              openFlow(
                "Add Warehouse",
                {
                  code: warehouse.code,
                  name: warehouse.name,
                  branch: warehouse.branchName,
                  type: warehouse.type,
                },
                async (values) => {
                  if (!values.code || !values.name) throw new Error("Code and Name are required.");
                  if (!values.branch) throw new Error("Branch is required.");
                  const branch = branches?.find(
                    (b) => b.nameEn.toLowerCase() === values.branch.toLowerCase(),
                  );
                  if (!branch) throw new Error(`Unknown branch "${values.branch}".`);
                  if (!values.type) throw new Error("Type is required.");
                  await updateWarehouse.mutateAsync({
                    id: warehouse.id,
                    request: {
                      code: values.code,
                      name: values.name,
                      branchId: branch.id,
                      type: values.type,
                      status: warehouse.status,
                    },
                  });
                },
              ),
          },
          {
            label: "Add Bin",
            onClick: () =>
              openFlow("Bin Setup", { warehouse: warehouse.name }, async (values) => {
                if (!values.binCode || !values.label)
                  throw new Error("Bin Code and Label are required.");
                await createWarehouseBin.mutateAsync({
                  warehouseId: warehouse.id,
                  request: {
                    binCode: values.binCode,
                    label: values.label,
                    capacityTons: Number(values.capacity || 0),
                  },
                });
              }),
          },
          warehouse.status === "Active"
            ? {
                label: "Deactivate",
                onClick: guarded(
                  () => setWarehouseStatus.mutateAsync({ id: warehouse.id, status: "Inactive" }),
                  "Warehouse deactivated",
                ),
                tone: "critical",
              }
            : {
                label: "Activate",
                onClick: guarded(
                  () => setWarehouseStatus.mutateAsync({ id: warehouse.id, status: "Active" }),
                  "Warehouse activated",
                ),
              },
        ];
        return actions;
      }

      // Phase 4 (BRD §5.7): Draft -> PendingApproval -> Active <-> Inactive, Archived terminal from
      // any of the first four — mirrors PricingRulesController's PendingApproval/Active/Expired/
      // Inactive row actions above, one status tier richer for the extra Draft/Archived states.
      case "/stock/bundles": {
        const bundle = bundles?.find((b) => b.id === id);
        if (!bundle) return [];
        const actions: RowAction[] = [];
        if (bundle.status !== "Archived") {
          actions.push({ label: "Edit", onClick: () => openBundleEditor?.(bundle) });
        }
        if (bundle.status === "Draft") {
          actions.push({
            label: "Submit for Approval",
            onClick: guarded(
              () => setBundleStatus.mutateAsync({ id: bundle.id, status: "PendingApproval" }),
              "Submitted for approval",
            ),
          });
        }
        if (bundle.status === "PendingApproval") {
          actions.push(
            {
              label: "Approve",
              onClick: guarded(
                () => setBundleStatus.mutateAsync({ id: bundle.id, status: "Active" }),
                "Bundle approved",
              ),
            },
            {
              label: "Send back to Draft",
              onClick: guarded(
                () => setBundleStatus.mutateAsync({ id: bundle.id, status: "Draft" }),
                "Sent back to Draft",
              ),
            },
          );
        }
        if (bundle.status === "Active") {
          actions.push({
            label: "Disable",
            onClick: guarded(
              () => setBundleStatus.mutateAsync({ id: bundle.id, status: "Inactive" }),
              "Bundle disabled",
            ),
            tone: "critical",
          });
        }
        if (bundle.status === "Inactive") {
          actions.push({
            label: "Re-enable",
            onClick: guarded(
              () => setBundleStatus.mutateAsync({ id: bundle.id, status: "Active" }),
              "Bundle re-enabled",
            ),
          });
        }
        if (bundle.status !== "Archived") {
          actions.push({
            label: "Archive",
            onClick: confirmed(
              `Archive bundle "${bundle.nameEn}"? It'll no longer be editable or sellable.`,
              () => setBundleStatus.mutateAsync({ id: bundle.id, status: "Archived" }),
              "Bundle archived",
            ),
            tone: "critical",
          });
        }
        return actions;
      }

      case "/suppliers/suppliers": {
        const supplier = suppliers?.find((s) => s.id === id);
        if (!supplier) return [];
        return [
          {
            label: "Edit",
            onClick: () =>
              openFlow(
                "Edit Supplier",
                {
                  code: supplier.code,
                  nameEn: supplier.nameEn,
                  nameAr: supplier.nameAr ?? "",
                  type: supplier.type,
                  vat: supplier.vatNo ?? "",
                  phone: supplier.phone ?? "",
                  email: supplier.email ?? "",
                  categories: supplier.categories.join(", "),
                  terms: supplier.terms,
                  currency: supplier.currency,
                  leadTime: String(supplier.leadTimeDays),
                  iban: supplier.iban ?? "",
                },
                async (values) => {
                  if (!values.code || !values.nameEn)
                    throw new Error("Supplier code and legal name are required.");
                  await updateSupplier.mutateAsync({
                    id: supplier.id,
                    request: {
                      code: values.code,
                      nameEn: values.nameEn,
                      nameAr: values.nameAr || null,
                      type: values.type || supplier.type,
                      vatNo: values.vat || null,
                      phone: values.phone || null,
                      email: values.email || null,
                      categories: values.categories
                        ? values.categories
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean)
                        : [],
                      terms: values.terms || supplier.terms,
                      currency: values.currency || supplier.currency,
                      leadTimeDays: Number(values.leadTime || supplier.leadTimeDays),
                      iban: values.iban || null,
                    },
                  });
                },
              ),
          },
          supplier.status === "Active"
            ? {
                label: "Deactivate",
                onClick: guarded(
                  () => setSupplierStatus.mutateAsync({ id: supplier.id, status: "Inactive" }),
                  "Supplier deactivated",
                ),
                tone: "critical",
              }
            : {
                label: "Activate",
                onClick: guarded(
                  () => setSupplierStatus.mutateAsync({ id: supplier.id, status: "Active" }),
                  "Supplier activated",
                ),
              },
        ];
      }

      case "/finance/purchase-orders": {
        const po = purchaseOrders?.find((p) => p.id === id);
        if (!po) return [];
        const actions: RowAction[] = [];

        if (po.status === "Draft" || po.status === "PendingApproval" || po.status === "Sent") {
          actions.push({
            label: "Cancel",
            onClick: guarded(() => cancelPo.mutateAsync(po.id), "PO cancelled"),
            tone: "critical",
          });
        }
        if (po.status === "Draft") {
          actions.push({
            label: "Submit for Approval",
            onClick: guarded(() => submitPo.mutateAsync(po.id), "PO submitted for approval"),
          });
        }
        if (po.status === "PendingApproval") {
          actions.push({
            label: "Approve",
            onClick: guarded(
              () => approvePo.mutateAsync({ id: po.id, approverUserId: null }),
              "PO approved",
            ),
          });
        }
        if (po.status === "Sent" || po.status === "Delayed") {
          actions.push({
            label: "Mark In Transit",
            onClick: guarded(
              () => dispatchPo.mutateAsync({ id: po.id, carrier: null, trackingRef: null }),
              "PO marked in transit",
            ),
          });
        }
        if (
          po.status === "Sent" ||
          po.status === "InTransit" ||
          po.status === "PartialReceive" ||
          po.status === "Delayed"
        ) {
          const outstanding = po.lines.filter((l) => l.receivedQty < l.qty);
          actions.push({
            label: "Receive",
            onClick: () =>
              openFlow(
                "Receive PO",
                {
                  lines: JSON.stringify(
                    outstanding.map((l) => ({
                      line: String(l.id),
                      qty: String(l.qty - l.receivedQty),
                    })),
                  ),
                },
                async (values) => {
                  if (!values.lines) throw new Error("At least one line to receive is required.");
                  const rows = JSON.parse(values.lines) as {
                    line?: string;
                    qty?: string;
                    batchNo?: string;
                    expiryDate?: string;
                  }[];
                  const lines = rows
                    .filter((r) => r.line && r.qty)
                    .map((r) => {
                      const lineId = Number(r.line);
                      if (!outstanding.some((l) => l.id === lineId))
                        throw new Error("Pick a PO line for every row.");
                      return {
                        lineId,
                        qty: Number(r.qty),
                        batchNo: r.batchNo || null,
                        expiryDate: r.expiryDate || null,
                      };
                    });
                  if (!lines.length) throw new Error("At least one line to receive is required.");
                  await receivePo.mutateAsync({ id: po.id, lines });
                },
                {
                  lines: {
                    lineItemColumns: [
                      {
                        key: "line",
                        label: "PO Line",
                        type: "select",
                        options: outstanding.map((l) => ({
                          value: String(l.id),
                          label: `${l.sku} · ${l.branchName} (${l.qty - l.receivedQty} remaining)`,
                        })),
                      },
                      { key: "qty", label: "Qty Received", type: "number", placeholder: "0" },
                      { key: "batchNo", label: "Batch (optional)", type: "text" },
                      { key: "expiryDate", label: "Expiry (optional)", type: "date" },
                    ],
                  },
                },
              ),
          });
        }
        return actions;
      }

      case "/suppliers/rts": {
        const rts = returns?.find((r) => r.id === id);
        if (!rts) return [];
        const actions: RowAction[] = [];
        if (rts.status === "Draft") {
          actions.push({
            label: "Dispatch",
            onClick: guarded(
              () => dispatchRts.mutateAsync(rts.id),
              "Return dispatched to supplier",
            ),
          });
          actions.push({
            label: "Cancel",
            onClick: guarded(() => cancelRts.mutateAsync(rts.id), "Return cancelled"),
            tone: "critical",
          });
        }
        if (rts.status === "Dispatched") {
          actions.push({
            label: "Record Credit Note",
            onClick: () =>
              openFlow("Record Credit Note", {}, async (values) => {
                if (!values.creditNoteRef) throw new Error("Credit note reference is required.");
                await creditRts.mutateAsync({ id: rts.id, creditNoteRef: values.creditNoteRef });
              }),
          });
          actions.push({
            label: "Reject",
            onClick: guarded(
              () => rejectRts.mutateAsync(rts.id),
              "Return rejected — stock restored",
            ),
            tone: "critical",
          });
        }
        return actions;
      }

      case "/finance/expenses": {
        const expense = expenses?.find((e) => e.id === id);
        if (!expense) return [];
        const actions: RowAction[] = [];
        if (expense.status === "Pending") {
          actions.push({
            label: "Approve",
            onClick: guarded(
              () =>
                updateExpenseStatus.mutateAsync({
                  id: expense.id,
                  status: "Approved",
                  approverUserId: null,
                }),
              "Expense approved",
            ),
          });
          actions.push({
            label: "Reject",
            onClick: guarded(
              () =>
                updateExpenseStatus.mutateAsync({
                  id: expense.id,
                  status: "Rejected",
                  approverUserId: null,
                }),
              "Expense rejected",
            ),
            tone: "critical",
          });
        }
        return actions;
      }

      case "/finance/pricing": {
        const rule = pricingRules?.find((r) => r.id === id);
        if (!rule) return [];
        const actions: RowAction[] = [
          {
            label: "Edit",
            onClick: () => openPricingRuleEditor?.(rule),
          },
        ];
        if (rule.status === "PendingApproval") {
          actions.push({
            label: "Approve",
            onClick: guarded(
              () => updatePricingRuleStatus.mutateAsync({ id: rule.id, status: "Active" }),
              "Rule approved",
            ),
          });
        }
        if (rule.status === "Active") {
          actions.push({
            label: "Expire",
            onClick: guarded(
              () => updatePricingRuleStatus.mutateAsync({ id: rule.id, status: "Expired" }),
              "Rule expired",
            ),
            tone: "critical",
          });
        }
        if (rule.status === "Expired" || rule.status === "Inactive") {
          actions.push({
            label: "Reactivate",
            onClick: guarded(
              () => updatePricingRuleStatus.mutateAsync({ id: rule.id, status: "Active" }),
              "Rule reactivated",
            ),
          });
        }
        actions.push({
          label: "Delete",
          onClick: confirmed(
            `Delete pricing rule "${rule.name}"? This can't be undone.`,
            () => deletePricingRule.mutateAsync(rule.id),
            "Rule deleted",
          ),
          tone: "critical",
        });
        return actions;
      }

      case "/finance/returns": {
        const ret = customerReturns?.find((r) => r.id === id);
        if (!ret) return [];
        const actions: RowAction[] = [];
        if (ret.status === "PendingApproval" || ret.status === "Quarantine") {
          // BRD §3.2.1: an Exchange needs a real payment step (the net difference between the
          // return's credit and the replacement item(s)) — a dedicated dialog, not the generic
          // text-field flow every other return type uses.
          if (ret.type === "Exchange" && openApproveExchange) {
            actions.push({ label: "Complete Exchange", onClick: () => openApproveExchange(ret) });
          } else {
            actions.push({
              label: "Approve & Refund",
              onClick: () =>
                openFlow("Approve Return", {}, async (values) => {
                  if (!values.branch) throw new Error("Branch is required.");
                  const branch = branches?.find(
                    (b) => b.nameEn.toLowerCase() === values.branch.toLowerCase(),
                  );
                  if (!branch) throw new Error(`Unknown branch "${values.branch}".`);
                  await approveReturn.mutateAsync({
                    id: ret.id,
                    branchId: branch.id,
                    refundMethod: values.refundMethod || undefined,
                    secondAuthEmail: values.secondAuthEmail || undefined,
                    secondAuthPin: values.secondAuthPin || undefined,
                  });
                }),
            });
          }
        }
        return actions;
      }

      case "/finance/tax-zatca": {
        const taxCode = taxCodes?.find((t) => t.id === id);
        if (!taxCode) return [];
        return [
          {
            label: "Edit",
            onClick: () =>
              openFlow(
                "Edit Tax/Fee Code",
                {
                  code: taxCode.code,
                  name: taxCode.name,
                  type: taxCode.type,
                  rate: String(taxCode.rate),
                  appliesTo: taxCode.appliesTo,
                  effectiveFrom: taxCode.effectiveFrom.slice(0, 10),
                  glAccount: taxCode.glAccountCode ?? "",
                  branch: taxCode.branchName ?? "All Branches",
                },
                async (values) => {
                  if (!values.code || !values.name || !values.rate || !values.appliesTo)
                    throw new Error("Code, name, rate and applies-to are required.");
                  const branch =
                    values.branch && values.branch !== "All Branches"
                      ? branches?.find(
                          (b) => b.nameEn.toLowerCase() === values.branch.toLowerCase(),
                        )
                      : undefined;
                  await updateTaxCode.mutateAsync({
                    id: taxCode.id,
                    request: {
                      code: values.code,
                      name: values.name,
                      type: values.type || taxCode.type,
                      rate: Number(values.rate || 0),
                      appliesTo: values.appliesTo,
                      effectiveFrom: values.effectiveFrom || taxCode.effectiveFrom,
                      glAccountCode: values.glAccount || null,
                      branchId: branch?.id ?? null,
                    },
                  });
                },
              ),
          },
          taxCode.status === "Active"
            ? {
                label: "Deactivate",
                onClick: guarded(
                  () => setTaxCodeStatus.mutateAsync({ id: taxCode.id, status: "Inactive" }),
                  "Code deactivated",
                ),
                tone: "critical",
              }
            : {
                label: "Activate",
                onClick: guarded(
                  () => setTaxCodeStatus.mutateAsync({ id: taxCode.id, status: "Active" }),
                  "Code activated",
                ),
              },
        ];
      }

      case "/admin/zatca-invoices": {
        const invoice = zatcaInvoices?.find((i) => i.id === id);
        if (!invoice) return [];
        if (invoice.status === "Pending" || invoice.status === "Failed") {
          return [
            {
              label: "Retry Submission",
              onClick: guarded(
                () => submitZatcaInvoice.mutateAsync(invoice.orderId),
                "Invoice resubmitted to ZATCA",
              ),
            },
          ];
        }
        return [];
      }

      case "/admin/users": {
        const user = users?.find((u) => u.id === id);
        if (!user) return [];
        return [
          {
            label: "Edit",
            onClick: () =>
              openFlow(
                "Edit User",
                {
                  name: user.name,
                  role: user.roleName,
                  branch: user.branchName ?? "All Branches",
                  status: user.status,
                },
                async (values) => {
                  if (!values.name) throw new Error("Name is required.");
                  const role = roles?.find(
                    (r) => r.name.toLowerCase() === (values.role ?? "").toLowerCase(),
                  );
                  if (!role) throw new Error(`Unknown role "${values.role}".`);
                  const branch =
                    values.branch && values.branch !== "All Branches"
                      ? branches?.find(
                          (b) => b.nameEn.toLowerCase() === values.branch.toLowerCase(),
                        )
                      : undefined;
                  await updateUser.mutateAsync({
                    id: user.id,
                    request: {
                      name: values.name,
                      roleId: role.id,
                      branchId: branch?.id ?? null,
                      status: values.status || user.status,
                    },
                  });
                },
              ),
          },
          user.status === "Active"
            ? {
                label: "Suspend",
                onClick: guarded(
                  () =>
                    updateUser.mutateAsync({
                      id: user.id,
                      request: {
                        name: user.name,
                        roleId: user.roleId,
                        branchId: user.branchId,
                        status: "Suspended",
                      },
                    }),
                  "User suspended",
                ),
                tone: "critical",
              }
            : {
                label: "Reactivate",
                onClick: guarded(
                  () =>
                    updateUser.mutateAsync({
                      id: user.id,
                      request: {
                        name: user.name,
                        roleId: user.roleId,
                        branchId: user.branchId,
                        status: "Active",
                      },
                    }),
                  "User reactivated",
                ),
              },
        ];
      }

      case "/network/branches": {
        const branch = branches?.find((b) => b.id === id);
        if (!branch) return [];
        return [
          {
            label: "Edit",
            onClick: () =>
              openFlow(
                "Edit Branch",
                {
                  code: branch.code,
                  nameEn: branch.nameEn,
                  nameAr: branch.nameAr ?? "",
                  city: branch.city,
                  address: branch.address ?? "",
                  manager: branch.managerName ?? "",
                  warehouse: branch.warehouse ?? "",
                  hours: branch.businessHours ?? "",
                  zatca: branch.vatRegistrationNumber ?? "",
                },
                async (values) => {
                  if (!values.code || !values.nameEn)
                    throw new Error("Branch code and name are required.");
                  await updateBranch.mutateAsync({
                    id: branch.id,
                    request: {
                      code: values.code,
                      nameEn: values.nameEn,
                      nameAr: values.nameAr || null,
                      city: values.city || branch.city,
                      address: values.address || null,
                      businessHours: values.hours || null,
                      vatRegistrationNumber: values.zatca || null,
                      managerName: values.manager || null,
                      warehouse: values.warehouse || null,
                      status: branch.status,
                    },
                  });
                },
              ),
          },
          branch.status === "Active"
            ? {
                label: "Delete",
                onClick: confirmed(
                  `Deactivate branch "${branch.nameEn}"? It can be reactivated later.`,
                  () =>
                    updateBranch.mutateAsync({
                      id: branch.id,
                      request: {
                        code: branch.code,
                        nameEn: branch.nameEn,
                        nameAr: branch.nameAr,
                        city: branch.city,
                        address: branch.address,
                        businessHours: branch.businessHours,
                        vatRegistrationNumber: branch.vatRegistrationNumber,
                        managerName: branch.managerName,
                        warehouse: branch.warehouse,
                        status: "Inactive",
                      },
                    }),
                  "Branch deactivated",
                ),
                tone: "critical",
              }
            : {
                label: "Activate",
                onClick: guarded(
                  () =>
                    updateBranch.mutateAsync({
                      id: branch.id,
                      request: {
                        code: branch.code,
                        nameEn: branch.nameEn,
                        nameAr: branch.nameAr,
                        city: branch.city,
                        address: branch.address,
                        businessHours: branch.businessHours,
                        vatRegistrationNumber: branch.vatRegistrationNumber,
                        managerName: branch.managerName,
                        warehouse: branch.warehouse,
                        status: "Active",
                      },
                    }),
                  "Branch activated",
                ),
              },
        ];
      }

      case "/network/terminals": {
        const terminal = terminals?.find((t) => t.id === id);
        if (!terminal) return [];
        return [
          {
            label: "Edit",
            onClick: () =>
              openFlow(
                "Edit Terminal",
                {
                  id: terminal.code,
                  name: terminal.name,
                  branch: terminal.branchName,
                  type: TERMINAL_TYPE_TO_FRONTEND[terminal.type] ?? "Fixed POS",
                  operator: terminal.assignedCashierName ?? "Unassigned",
                  offline: terminal.offlineModeEnabled ? "on" : "",
                },
                async (values) => {
                  if (!values.id || !values.branch)
                    throw new Error("Terminal ID and branch are required.");
                  const branch = branches?.find(
                    (b) => b.nameEn.toLowerCase() === values.branch.toLowerCase(),
                  );
                  if (!branch) throw new Error(`Unknown branch "${values.branch}".`);
                  // "Unassigned" (or empty) explicitly clears the cashier; an unknown name is an
                  // error rather than silently keeping the previous assignment.
                  const operatorName = (values.operator ?? "").trim();
                  let assignedCashierId: number | null = null;
                  if (operatorName && operatorName !== "Unassigned") {
                    const assignedCashier = users?.find(
                      (u) => u.name.toLowerCase() === operatorName.toLowerCase(),
                    );
                    if (!assignedCashier)
                      throw new Error(
                        `Unknown cashier "${operatorName}" — pick a user that exists.`,
                      );
                    assignedCashierId = assignedCashier.id;
                  }
                  await updateTerminal.mutateAsync({
                    id: terminal.id,
                    request: {
                      code: values.id,
                      name: values.name || values.id,
                      branchId: branch.id,
                      type: TERMINAL_TYPE_TO_BACKEND[values.type] ?? terminal.type,
                      assignedCashierId,
                      offlineModeEnabled: values.offline === "on",
                      ipAddress: terminal.ipAddress,
                      macAddress: terminal.macAddress,
                    },
                  });
                },
              ),
          },
          ...(terminal.type === "Kiosk" && openKioskPairing
            ? [{ label: "Kiosk Pairing", onClick: () => openKioskPairing(terminal.id) }]
            : []),
          terminal.status === "Offline"
            ? {
                label: "Activate",
                onClick: guarded(
                  () => setTerminalStatus.mutateAsync({ id: terminal.id, status: "Online" }),
                  "Terminal activated",
                ),
              }
            : {
                label: "Deactivate",
                onClick: guarded(
                  () => setTerminalStatus.mutateAsync({ id: terminal.id, status: "Offline" }),
                  "Terminal deactivated",
                ),
                tone: "critical",
              },
        ];
      }

      case "/network/devices": {
        const device = devices?.find((d) => d.id === id);
        if (!device) return [];
        return [
          {
            label: "Edit",
            onClick: () =>
              openFlow(
                "Edit Device",
                {
                  model: device.model,
                  serial: device.serial ?? "",
                  connection: CONNECTION_TO_FRONTEND[device.connection] ?? "USB",
                  ip: device.ipAddress ?? "",
                  behaviorProfile: device.behaviorProfile ?? "",
                },
                async (values) => {
                  await updateDevice.mutateAsync({
                    id: device.id,
                    request: {
                      terminalId: device.terminalId,
                      model: values.model || device.model,
                      serial: values.serial || null,
                      connection: CONNECTION_TO_BACKEND[values.connection] ?? device.connection,
                      ipAddress: values.ip || null,
                      behaviorProfile: values.behaviorProfile || null,
                    },
                  });
                },
              ),
          },
          ...(device.status !== "Healthy"
            ? [
                {
                  label: "Mark Healthy",
                  onClick: guarded(
                    () => setDeviceStatus.mutateAsync({ id: device.id, status: "Healthy" }),
                    "Device marked healthy",
                  ),
                },
              ]
            : [
                {
                  label: "Mark Faulty",
                  onClick: guarded(
                    () => setDeviceStatus.mutateAsync({ id: device.id, status: "Faulty" }),
                    "Device flagged faulty",
                  ),
                  tone: "critical" as const,
                },
              ]),
          device.status !== "Disconnected"
            ? {
                label: "Disconnect",
                onClick: guarded(
                  () => setDeviceStatus.mutateAsync({ id: device.id, status: "Disconnected" }),
                  "Device disconnected",
                ),
                tone: "critical",
              }
            : {
                label: "Reconnect",
                onClick: guarded(
                  () => setDeviceStatus.mutateAsync({ id: device.id, status: "Healthy" }),
                  "Device reconnected",
                ),
              },
        ];
      }

      case "/admin/rules": {
        const rule = rules?.find((r) => r.id === id);
        if (!rule) return [];
        const resolveApprover = (name: string) =>
          name
            ? (users?.find((u) => u.name.toLowerCase() === name.toLowerCase())?.id ?? null)
            : null;
        const requestFor = (overrides: Partial<{ active: boolean }>) => ({
          name: rule.name,
          domain: rule.domain,
          priority: rule.priority,
          whenTrigger: rule.whenTrigger,
          condition: rule.condition,
          action: rule.action,
          approverUserId: resolveApprover(rule.approverName ?? ""),
          active: overrides.active ?? rule.active,
          notes: rule.notes,
        });
        return [
          {
            label: "Edit",
            onClick: () =>
              openFlow(
                "Edit Rule",
                {
                  name: rule.name,
                  domain: RULE_DOMAIN_TO_FRONTEND[rule.domain] ?? "Approvals",
                  priority: rulePriorityLabel(rule.priority),
                  when: rule.whenTrigger,
                  if: rule.condition,
                  action: rule.action,
                  approver: rule.approverName ?? "",
                  active: rule.active ? "on" : "",
                  notes: rule.notes ?? "",
                },
                async (values) => {
                  if (!values.name) throw new Error("Rule name is required.");
                  await updateRule.mutateAsync({
                    id: rule.id,
                    request: {
                      name: values.name,
                      domain: RULE_DOMAIN_TO_BACKEND[values.domain] ?? rule.domain,
                      priority: RULE_PRIORITY_TO_NUMBER[values.priority] ?? rule.priority,
                      whenTrigger: values.when || rule.whenTrigger,
                      condition: values.if || rule.condition,
                      action: values.action || rule.action,
                      approverUserId: resolveApprover(values.approver ?? ""),
                      active: values.active === "on",
                      notes: values.notes || null,
                    },
                  });
                },
              ),
          },
          rule.active
            ? {
                label: "Deactivate",
                onClick: guarded(
                  () =>
                    updateRule.mutateAsync({ id: rule.id, request: requestFor({ active: false }) }),
                  "Rule deactivated",
                ),
                tone: "critical",
              }
            : {
                label: "Activate",
                onClick: guarded(
                  () =>
                    updateRule.mutateAsync({ id: rule.id, request: requestFor({ active: true }) }),
                  "Rule activated",
                ),
              },
        ];
      }

      case "/admin/compliance": {
        const control = compliance?.find((c) => c.id === id);
        if (!control) return [];
        return [
          {
            label: "Edit",
            onClick: () =>
              openFlow(
                "Edit Control",
                {
                  control: control.control,
                  framework: control.framework,
                  owner: control.owner,
                  lastReview: control.lastReview.slice(0, 10),
                  nextDue: control.nextDue.slice(0, 10),
                  evidence: control.evidence ?? "",
                  findings: control.findings ?? "",
                  status: control.status,
                },
                async (values) => {
                  if (!values.control || !values.owner || !values.nextDue)
                    throw new Error("Control name, owner and next-due date are required.");
                  await updateCompliance.mutateAsync({
                    id: control.id,
                    request: {
                      control: values.control,
                      framework: values.framework || control.framework,
                      owner: values.owner,
                      lastReview: values.lastReview || control.lastReview,
                      nextDue: values.nextDue,
                      evidence: values.evidence || null,
                      findings: values.findings || null,
                      status: values.status || control.status,
                    },
                  });
                },
              ),
          },
        ];
      }

      case "/admin/maintenance": {
        const ticket = maintenance?.find((t) => t.id === id);
        if (!ticket) return [];
        const actions: RowAction[] = [];
        if (ticket.status === "Open") {
          actions.push({
            label: "Start Progress",
            onClick: guarded(
              () => updateMaintenanceStatus.mutateAsync({ id: ticket.id, status: "InProgress" }),
              "Ticket in progress",
            ),
          });
        }
        if (ticket.status === "InProgress") {
          actions.push({
            label: "Resolve",
            onClick: guarded(
              () => updateMaintenanceStatus.mutateAsync({ id: ticket.id, status: "Resolved" }),
              "Ticket resolved",
            ),
          });
        }
        if (ticket.status === "Resolved") {
          actions.push({
            label: "Close",
            onClick: guarded(
              () => updateMaintenanceStatus.mutateAsync({ id: ticket.id, status: "Closed" }),
              "Ticket closed",
            ),
          });
        }
        return actions;
      }

      case "/admin/settings":
      case "/admin/pos-settings": {
        const list = pathname === "/admin/settings" ? systemSettings : posSettings;
        const setting = list?.find((s) => s.id === id);
        if (!setting) return [];
        return [
          {
            label: "Edit",
            onClick: () =>
              openFlow("Edit Setting", { value: setting.value }, async (values) => {
                if (!values.value) throw new Error("Value is required.");
                await upsertSetting.mutateAsync({
                  category: setting.category,
                  group: setting.group,
                  key: setting.key,
                  value: values.value,
                  scope: setting.scope,
                  branchId: setting.branchId,
                  effectiveFrom: new Date().toISOString().slice(0, 10),
                });
              }),
          },
        ];
      }

      case "/insights/kpi": {
        if (id === undefined) return [];
        return [
          {
            label: "Edit Target",
            onClick: () => {
              const currentTarget = row[3];
              const next = window.prompt(
                `New target for "${row[0]}" (current: ${currentTarget}):`,
                String(currentTarget),
              );
              if (next === null) return;
              const target = Number(next);
              if (Number.isNaN(target)) {
                toast.error("Target must be a number.");
                return;
              }
              guarded(() => updateKpiTarget.mutateAsync({ id, target }), "KPI target updated")();
            },
          },
        ];
      }

      case "/insights/reports": {
        const report = reports?.find((r) => r.id === id);
        if (!report) return [];
        return [
          {
            label: "Download",
            onClick: () =>
              downloadCsv(`report-${report.code}.csv`, [
                ["Code", "Name", "Category", "Owner", "Frequency", "Format", "Status"],
                [
                  report.code,
                  report.name,
                  report.category,
                  report.owner,
                  report.frequency,
                  report.format,
                  report.status,
                ],
              ]),
          },
          {
            label: report.status === "Active" ? "Pause Schedule" : "Resume Schedule",
            onClick: guarded(
              () =>
                setReportStatus.mutateAsync({
                  id: report.id,
                  status: report.status === "Active" ? "Inactive" : "Active",
                }),
              report.status === "Active" ? "Report schedule paused" : "Report schedule resumed",
            ),
          },
        ];
      }

      case "/insights/bi": {
        const feed = biFeeds?.find((f) => f.id === id);
        if (!feed) return [];
        const actions: RowAction[] = [
          {
            label: "View Schema",
            onClick: () =>
              window.alert(
                `${feed.name}\n\n${feed.source} → ${feed.destination}\nFrequency: ${feed.frequency}\nLast run: ${new Date(feed.lastRun).toLocaleString("en-GB")}\nRows: ${feed.rows} · Failed: ${feed.failed}\nLatency: ${feed.latency}\nStatus: ${feed.status}`,
              ),
          },
        ];
        if (feed.failed > 0 || feed.status !== "Healthy") {
          actions.push({
            label: "Retry",
            onClick: guarded(() => retryBiFeed.mutateAsync(feed.id), "Feed retried"),
          });
        }
        return actions;
      }

      case "/insights/sales": {
        const segment = String(row[0] ?? "");
        if (!segment) return [];
        return [
          {
            label: "Drill Down",
            onClick: () => navigate({ to: "/stock/inventory", search: { category: segment } }),
          },
        ];
      }

      case "/admin/overview": {
        const area = String(row[0] ?? "");
        if (!area) return [];
        const routeFor = (name: string): string =>
          /zatca/i.test(name)
            ? "/admin/zatca-invoices"
            : /compliance/i.test(name)
              ? "/admin/compliance"
              : "/admin/audit-logs";
        return [
          {
            label: "Investigate",
            onClick: () => navigate({ to: routeFor(area) }),
          },
          {
            label: "Assign",
            onClick: () => {
              const owner = window.prompt(`Assign "${area}" to (enter a user name):`, "");
              if (owner === null) return;
              if (!owner.trim()) {
                toast.error("Pick who to assign.");
                return;
              }
              guarded(
                () =>
                  createMaintenance.mutateAsync({
                    deviceOrModule: area,
                    branchId: null,
                    severity: "Warning",
                    owner: owner.trim(),
                    slaHours: 24,
                  }),
                "Ticket created and assigned",
              )();
            },
          },
          {
            label: "Escalate",
            onClick: guarded(
              () =>
                createMaintenance.mutateAsync({
                  deviceOrModule: area,
                  branchId: null,
                  severity: "Critical",
                  owner: "IT Support",
                  slaHours: 4,
                }),
              "Critical maintenance ticket created",
            ),
            tone: "critical",
          },
        ];
      }

      default:
        return [];
    }
  };
}
