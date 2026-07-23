import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import type { Field } from "@/lib/buildpos/flows";
import {
  useCategories,
  useProducts,
  useSetCategoryStatus,
  useSetProductStatus,
  useUpdateCategory,
  useUpdateProduct,
} from "./catalog";
import { useBundles, useSetBundleStatus } from "./bundles";
import {
  useApproveTransfer,
  useCreateStockAdjustment,
  useCreateStockTransfer,
  useDispatchTransfer,
  usePromoBatch,
  useQuarantineBatch,
  useReceiveTransfer,
  useStockBatches,
  useWarehouses,
  useWriteOffBatch,
} from "./inventory";
import { parseSkuQtyLines } from "./flow-submit-handlers";
import { usePrintLabel } from "./print";
import {
  useApprovePurchaseOrder,
  useCancelPurchaseOrder,
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
} from "./procurement";
import {
  useApproveReturn,
  useExpenses,
  useReturns,
  useSetTaxCodeStatus,
  useTaxCodes,
  useUpdateExpenseStatus,
  useUpdateTaxCode,
} from "./finance";
import { usePricingRules, useUpdatePricingRuleStatus } from "./pos";
import { useSubmitZatcaInvoice, useZatcaInvoices } from "./zatca";

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
): (id: number | undefined, row: (string | number)[], statusText: string) => RowAction[] {
  const navigate = useNavigate();

  const { data: products } = useProducts(
    pathname === "/stock/inventory" || pathname === "/stock/stocks",
  );
  const setProductStatus = useSetProductStatus();
  const updateProduct = useUpdateProduct();
  const printLabel = usePrintLabel();

  const { data: categories } = useCategories(
    pathname === "/admin/categories" || pathname === "/stock/inventory",
  );
  const setCategoryStatus = useSetCategoryStatus();
  const updateCategory = useUpdateCategory();

  const { data: warehouses } = useWarehouses(pathname === "/stock/stocks");
  const createStockAdjustment = useCreateStockAdjustment();
  const createStockTransfer = useCreateStockTransfer();

  const { data: batches } = useStockBatches(pathname === "/stock/expiry");
  const quarantineBatch = useQuarantineBatch();
  const writeOffBatch = useWriteOffBatch();
  const promoBatch = usePromoBatch();

  const approveTransfer = useApproveTransfer();
  const dispatchTransfer = useDispatchTransfer();
  const receiveTransfer = useReceiveTransfer();

  const { data: bundles } = useBundles(pathname === "/stock/bundles");
  const setBundleStatus = useSetBundleStatus();

  const { data: suppliers } = useSuppliers(pathname === "/suppliers/suppliers");
  const setSupplierStatus = useSetSupplierStatus();

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

  const { data: expenses } = useExpenses(pathname === "/finance/expenses");
  const updateExpenseStatus = useUpdateExpenseStatus();

  const { data: pricingRules } = usePricingRules(pathname === "/finance/pricing");
  const updatePricingRuleStatus = useUpdatePricingRuleStatus();

  const { data: customerReturns } = useReturns(pathname === "/finance/returns");
  const approveReturn = useApproveReturn();

  const { data: taxCodes } = useTaxCodes(pathname === "/finance/tax-zatca");
  const updateTaxCode = useUpdateTaxCode();
  const setTaxCodeStatus = useSetTaxCodeStatus();

  const { data: zatcaInvoices } = useZatcaInvoices(undefined, pathname === "/admin/zatca-invoices");
  const submitZatcaInvoice = useSubmitZatcaInvoice();

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
                  category: product.categoryName,
                  brand: product.brand ?? "",
                  stockUom: product.stockUom,
                  sellUoms: product.sellUoms.join(", "),
                  weight: String(product.weight),
                  returnable: product.returnable ? "on" : "",
                  cost: String(product.costPrice),
                  price: String(product.sellingPrice),
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
                  const category = categories?.find(
                    (c) => c.nameEn.toLowerCase() === (values.category ?? "").toLowerCase(),
                  );
                  const categoryId = category?.id ?? product.categoryId;
                  const vatRate =
                    values.vat === "Exempt" ? 0 : values.vat?.startsWith("0%") ? 0 : 15;
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
                      vatRate,
                      stockUom: values.stockUom || "Piece",
                      sellUoms: values.sellUoms
                        ? values.sellUoms
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean)
                        : [],
                      weight: Number(values.weight || 0),
                      returnable: values.returnable === "on",
                      reorderLevel: Number(values.reorder || 0),
                      reorderQty: Number(values.reorderQty || 0),
                      imageUrl: product.imageUrl,
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
                  parent: category.parentName ?? "— None (top level) —",
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
                    values.parent && values.parent !== "— None (top level) —"
                      ? values.parent
                      : null;
                  const parent = parentName
                    ? categories?.find(
                        (c) =>
                          c.nameEn.toLowerCase() === parentName.toLowerCase() &&
                          c.id !== category.id,
                      )
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
          {
            label: "Transfer",
            onClick: () =>
              openFlow(
                "Create Transfer",
                { from: String(warehouseName), skus: `${sku} x 1` },
                async (values) => {
                  if (!values.from || !values.to)
                    throw new Error("From and To warehouse are required.");
                  const from = warehouses?.find(
                    (w) => w.name.toLowerCase() === values.from.toLowerCase(),
                  );
                  const to = warehouses?.find(
                    (w) => w.name.toLowerCase() === values.to.toLowerCase(),
                  );
                  if (!from) throw new Error(`Unknown warehouse "${values.from}".`);
                  if (!to) throw new Error(`Unknown warehouse "${values.to}".`);
                  if (from.id === to.id) throw new Error("From and To warehouse must differ.");
                  if (!values.skus) throw new Error("At least one SKU x Qty line is required.");
                  const lines = parseSkuQtyLines(values.skus).map(({ sku: lineSku, qty }) => {
                    const p = products?.find(
                      (pr) => pr.sku.toLowerCase() === lineSku.toLowerCase(),
                    );
                    if (!p) throw new Error(`Unknown SKU "${lineSku}".`);
                    return { productId: p.id, qty, unitCost: p.costPrice };
                  });
                  await createStockTransfer.mutateAsync({
                    fromWarehouseId: from.id,
                    toWarehouseId: to.id,
                    eta: values.eta || null,
                    carrier: values.carrier || null,
                    notes: values.notes || null,
                    lines,
                  });
                },
              ),
          },
          {
            label: "Reorder",
            onClick: () =>
              navigate({ to: "/finance/purchase-orders", search: { sku: String(sku) } }),
          },
        ];
      }

      case "/stock/expiry": {
        const batch = batches?.find((b) => b.id === id);
        if (!batch) return [];
        return [
          {
            label: "Quarantine",
            onClick: guarded(() => quarantineBatch.mutateAsync(batch.id), "Batch quarantined"),
            tone: "critical",
          },
          {
            label: "Write-Off",
            onClick: guarded(() => writeOffBatch.mutateAsync(batch.id), "Batch written off"),
            tone: "critical",
          },
          {
            label: "Move to Promo",
            onClick: guarded(() => promoBatch.mutateAsync(batch.id), "Batch moved to promo"),
          },
        ];
      }

      case "/stock/transfers": {
        if (!id) return [];
        const actions: RowAction[] = [];
        if (statusText === "Draft")
          actions.push({
            label: "Approve",
            onClick: guarded(() => approveTransfer.mutateAsync(id), "Transfer approved"),
          });
        if (statusText === "Approved")
          actions.push({
            label: "Dispatch",
            onClick: guarded(() => dispatchTransfer.mutateAsync(id), "Transfer dispatched"),
          });
        if (statusText === "InTransit")
          actions.push({
            label: "Receive",
            onClick: guarded(() => receiveTransfer.mutateAsync(id), "Transfer received"),
          });
        return actions;
      }

      case "/stock/bundles": {
        const bundle = bundles?.find((b) => b.id === id);
        if (!bundle) return [];
        return [
          bundle.status === "Active"
            ? {
                label: "Deactivate",
                onClick: guarded(
                  () => setBundleStatus.mutateAsync({ id: bundle.id, status: "Inactive" }),
                  "Bundle deactivated",
                ),
                tone: "critical",
              }
            : {
                label: "Activate",
                onClick: guarded(
                  () => setBundleStatus.mutateAsync({ id: bundle.id, status: "Active" }),
                  "Bundle activated",
                ),
              },
        ];
      }

      case "/suppliers/suppliers": {
        const supplier = suppliers?.find((s) => s.id === id);
        if (!supplier) return [];
        return [
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
                    outstanding.map((l) => ({ line: String(l.id), qty: String(l.qty - l.receivedQty) })),
                  ),
                },
                async (values) => {
                  if (!values.lines) throw new Error("At least one line to receive is required.");
                  const rows = JSON.parse(values.lines) as { line?: string; qty?: string; batchNo?: string; expiryDate?: string }[];
                  const lines = rows
                    .filter((r) => r.line && r.qty)
                    .map((r) => {
                      const lineId = Number(r.line);
                      if (!outstanding.some((l) => l.id === lineId)) throw new Error("Pick a PO line for every row.");
                      return { lineId, qty: Number(r.qty), batchNo: r.batchNo || null, expiryDate: r.expiryDate || null };
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
        }
        if (rts.status === "Dispatched" || rts.status === "AwaitingCredit") {
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
            onClick: guarded(() => rejectRts.mutateAsync(rts.id), "Return rejected"),
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
        const actions: RowAction[] = [];
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
        return actions;
      }

      case "/finance/returns": {
        const ret = customerReturns?.find((r) => r.id === id);
        if (!ret) return [];
        const actions: RowAction[] = [];
        if (ret.status === "PendingApproval" || ret.status === "Quarantine") {
          actions.push({
            label: "Approve & Refund",
            onClick: () =>
              openFlow("Approve Return", {}, async (values) => {
                if (!values.warehouse) throw new Error("Warehouse is required.");
                const warehouse = warehouses?.find(
                  (w) => w.name.toLowerCase() === values.warehouse.toLowerCase(),
                );
                if (!warehouse) throw new Error(`Unknown warehouse "${values.warehouse}".`);
                await approveReturn.mutateAsync({ id: ret.id, warehouseId: warehouse.id });
              }),
          });
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
                },
                async (values) => {
                  if (!values.code || !values.name || !values.rate || !values.appliesTo)
                    throw new Error("Code, name, rate and applies-to are required.");
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

      default:
        return [];
    }
  };
}
