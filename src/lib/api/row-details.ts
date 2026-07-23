import { useCategories, useProducts } from "./catalog";
import { useBundles } from "./bundles";
import { fmtDate, useStockBatches, useStockLevels, useStockTransfers } from "./inventory";
import {
  usePurchaseOrderHistory,
  usePurchaseOrders,
  useReturnsToSupplier,
  useRtsHistory,
  useSupplierLedger,
  useSuppliers,
} from "./procurement";
import { useExpenses, useReturns, useTaxCodes } from "./finance";
import { usePricingRules } from "./pos";

export type DetailField = { label: string; value: string };
export type DetailSection = { heading: string; fields: DetailField[] };
export type DetailTable = { heading: string; columns: string[]; rows: (string | number)[][] };
export type RowDetail = {
  title: string;
  subtitle?: string;
  statusText?: string;
  sections: DetailSection[];
  tables?: DetailTable[];
};

/**
 * Real "view details" content for the Products & Stock and Suppliers pages, keyed by pathname —
 * same switch-on-pathname shape as useRowActions/useModuleLiveData so ModulePage stays generic.
 * Reuses the same live queries those hooks already fetch (react-query dedupes by key, no extra
 * network). `selectedId` is the currently open row's id — it drives the per-record history/ledger
 * sub-queries (PO history, RTS history, supplier ledger), which can't be fetched from inside the
 * returned closure since hooks can only run at this function's top level.
 */
export function useRowDetails(
  pathname: string,
  selectedId?: number,
): (id: number | undefined, row: (string | number)[]) => RowDetail | null {
  const detailPaths = ["/stock/inventory", "/stock/stocks", "/admin/categories"];
  const { data: products } = useProducts(detailPaths.includes(pathname));
  const { data: categories } = useCategories(
    pathname === "/admin/categories" || pathname === "/stock/inventory",
  );
  const { data: stockLevels } = useStockLevels(
    pathname === "/stock/stocks" || pathname === "/stock/inventory",
  );
  const { data: batches } = useStockBatches(pathname === "/stock/expiry");
  const { data: transfers } = useStockTransfers(pathname === "/stock/transfers");
  const { data: bundles } = useBundles(pathname === "/stock/bundles");

  const { data: suppliers } = useSuppliers(pathname === "/suppliers/suppliers");
  const { data: ledger } = useSupplierLedger(
    pathname === "/suppliers/suppliers" ? selectedId : undefined,
  );

  const { data: purchaseOrders } = usePurchaseOrders(pathname === "/finance/purchase-orders");
  const { data: poHistory } = usePurchaseOrderHistory(
    pathname === "/finance/purchase-orders" ? selectedId : undefined,
  );

  const { data: returns } = useReturnsToSupplier(pathname === "/suppliers/rts");
  const { data: rtsHistory } = useRtsHistory(
    pathname === "/suppliers/rts" ? selectedId : undefined,
  );

  const { data: expenses } = useExpenses(pathname === "/finance/expenses");
  const { data: pricingRules } = usePricingRules(pathname === "/finance/pricing");
  const { data: customerReturns } = useReturns(pathname === "/finance/returns");
  const { data: taxCodes } = useTaxCodes(pathname === "/finance/tax-zatca");

  return (id, row) => {
    switch (pathname) {
      case "/stock/inventory": {
        const product = products?.find((p) => p.id === id);
        if (!product) return null;
        const levels = stockLevels?.filter((s) => s.sku === product.sku) ?? [];
        return {
          title: `${product.nameEn}${product.nameAr ? ` / ${product.nameAr}` : ""}`,
          subtitle: product.sku,
          statusText: product.status,
          sections: [
            {
              heading: "Identity",
              fields: [
                { label: "SKU", value: product.sku },
                { label: "Barcode", value: product.barcode ?? "—" },
                { label: "Category", value: product.categoryName },
                { label: "Brand", value: product.brand ?? "—" },
              ],
            },
            {
              heading: "Pricing & Tax",
              fields: [
                { label: "Cost Price", value: `${product.costPrice.toFixed(2)} ر.س` },
                { label: "Selling Price", value: `${product.sellingPrice.toFixed(2)} ر.س` },
                { label: "VAT Rate", value: `${product.vatRate}%` },
              ],
            },
            {
              heading: "UOM & Logistics",
              fields: [
                { label: "Stock UOM", value: product.stockUom },
                {
                  label: "Selling UOMs",
                  value: product.sellUoms.length ? product.sellUoms.join(", ") : product.stockUom,
                },
                { label: "Weight", value: `${product.weight} kg` },
                { label: "Returnable", value: product.returnable ? "Yes" : "No" },
                { label: "Reorder Level", value: String(product.reorderLevel) },
                { label: "Reorder Qty", value: String(product.reorderQty) },
              ],
            },
          ],
          tables: levels.length
            ? [
                {
                  heading: "Stock by Warehouse",
                  columns: ["Warehouse", "On Hand", "Reserved", "Available", "Value (ر.س)"],
                  rows: levels.map((l) => [
                    l.warehouseName,
                    l.onHand,
                    l.reserved,
                    l.available,
                    l.value.toLocaleString("en-US", { maximumFractionDigits: 0 }),
                  ]),
                },
              ]
            : [],
        };
      }

      case "/admin/categories": {
        const category = categories?.find((c) => c.id === id);
        if (!category) return null;
        const skus = products?.filter((p) => p.categoryId === category.id) ?? [];
        return {
          title: `${category.nameEn}${category.nameAr ? ` / ${category.nameAr}` : ""}`,
          subtitle: category.code,
          statusText: category.status,
          sections: [
            {
              heading: "Overview",
              fields: [
                { label: "Parent", value: category.parentName ?? "— Top level —" },
                { label: "Default UOM", value: category.defaultUom },
                { label: "Return Rule", value: category.returnRule },
                { label: "VAT Rate", value: `${category.vatRate}%` },
                { label: "Returnable", value: category.returnable ? "Yes" : "No" },
                {
                  label: "Attributes",
                  value: category.attributes.length ? category.attributes.join(", ") : "—",
                },
              ],
            },
          ],
          tables: skus.length
            ? [
                {
                  heading: `SKUs in this Category (${skus.length})`,
                  columns: ["SKU", "Name", "Stock", "Status"],
                  rows: skus.slice(0, 50).map((p) => [p.sku, p.nameEn, p.totalOnHand, p.status]),
                },
              ]
            : [],
        };
      }

      case "/stock/stocks": {
        const [
          sku,
          productName,
          category,
          warehouseName,
          onHand,
          reserved,
          available,
          reorder,
          value,
          status,
        ] = row;
        const product = products?.find((p) => p.sku === sku);
        return {
          title: String(productName),
          subtitle: `${sku} · ${warehouseName}`,
          statusText: String(status),
          sections: [
            {
              heading: "Stock",
              fields: [
                { label: "On Hand", value: String(onHand) },
                { label: "Reserved", value: String(reserved) },
                { label: "Available", value: String(available) },
                { label: "Reorder Level", value: String(reorder) },
                { label: "Value", value: `${value} ر.س` },
                { label: "Category", value: String(category) },
                { label: "Warehouse", value: String(warehouseName) },
              ],
            },
            ...(product
              ? [
                  {
                    heading: "Product",
                    fields: [
                      { label: "Brand", value: product.brand ?? "—" },
                      { label: "Barcode", value: product.barcode ?? "—" },
                      { label: "Selling Price", value: `${product.sellingPrice.toFixed(2)} ر.س` },
                    ],
                  },
                ]
              : []),
          ],
        };
      }

      case "/stock/expiry": {
        const batch = batches?.find((b) => b.id === id);
        if (!batch) return null;
        return {
          title: batch.productName,
          subtitle: `Batch ${batch.batchNo} · ${batch.sku}`,
          statusText: batch.status,
          sections: [
            {
              heading: "Batch",
              fields: [
                { label: "Received", value: fmtDate(batch.receivedDate) },
                { label: "Expires", value: fmtDate(batch.expiryDate) },
                { label: "Days Left", value: String(batch.daysLeft) },
                { label: "Quantity", value: String(batch.qty) },
                { label: "Warehouse", value: batch.warehouseName },
              ],
            },
          ],
        };
      }

      case "/stock/transfers": {
        const transfer = transfers?.find((t) => t.id === id);
        if (!transfer) return null;
        return {
          title: `Transfer ${transfer.transferNo}`,
          subtitle: `${transfer.fromWarehouseName} → ${transfer.toWarehouseName}`,
          statusText: transfer.status,
          sections: [
            {
              heading: "Route",
              fields: [
                { label: "ETA", value: transfer.eta ? fmtDate(transfer.eta) : "—" },
                { label: "Carrier", value: transfer.carrier ?? "—" },
                { label: "Notes", value: transfer.notes ?? "—" },
                {
                  label: "Total Value",
                  value: `${transfer.totalValue.toLocaleString("en-US", { maximumFractionDigits: 0 })} ر.س`,
                },
              ],
            },
          ],
          tables: [
            {
              heading: "Lines",
              columns: ["SKU", "Product", "Qty", "Unit Cost", "Line Total"],
              rows: transfer.lines.map((l) => [
                l.sku,
                l.productName,
                l.qty,
                l.unitCost.toFixed(2),
                (l.qty * l.unitCost).toFixed(2),
              ]),
            },
          ],
        };
      }

      case "/stock/bundles": {
        const bundle = bundles?.find((b) => b.id === id);
        if (!bundle) return null;
        const margin =
          bundle.bundlePrice > 0
            ? `${Math.round(((bundle.bundlePrice - bundle.componentCost) / bundle.bundlePrice) * 100)}%`
            : "—";
        return {
          title: `${bundle.nameEn}${bundle.nameAr ? ` / ${bundle.nameAr}` : ""}`,
          subtitle: bundle.code,
          statusText: bundle.status,
          sections: [
            {
              heading: "Overview",
              fields: [
                { label: "Bundle Price", value: `${bundle.bundlePrice.toFixed(2)} ر.س` },
                { label: "Component Cost", value: `${bundle.componentCost.toFixed(2)} ر.س` },
                { label: "Margin", value: margin },
              ],
            },
          ],
          tables: [
            {
              heading: "Components",
              columns: ["SKU", "Product", "Qty", "Unit Cost", "Line Total"],
              rows: bundle.lines.map((l) => [
                l.sku,
                l.productName,
                l.qty,
                l.unitCost.toFixed(2),
                (l.qty * l.unitCost).toFixed(2),
              ]),
            },
          ],
        };
      }

      case "/suppliers/suppliers": {
        const supplier = suppliers?.find((s) => s.id === id);
        if (!supplier) return null;
        return {
          title: supplier.nameEn,
          subtitle: supplier.code,
          statusText: supplier.status,
          sections: [
            {
              heading: "Contact",
              fields: [
                { label: "Type", value: supplier.type },
                { label: "VAT No.", value: supplier.vatNo ?? "—" },
                { label: "Phone", value: supplier.phone ?? "—" },
                { label: "Email", value: supplier.email ?? "—" },
                { label: "Categories", value: supplier.categories.join(", ") || "—" },
              ],
            },
            {
              heading: "Commercial",
              fields: [
                { label: "Payment Terms", value: supplier.terms },
                { label: "Currency", value: supplier.currency },
                { label: "Lead Time", value: `${supplier.leadTimeDays} days` },
                { label: "IBAN", value: supplier.iban ?? "—" },
              ],
            },
          ],
          tables: ledger?.length
            ? [
                {
                  heading: "Ledger (GL Activity)",
                  columns: [
                    "Date",
                    "Reference",
                    "Description",
                    "Account",
                    "Debit (ر.س)",
                    "Credit (ر.س)",
                  ],
                  rows: ledger.map((l) => [
                    fmtDate(l.date),
                    l.reference,
                    l.description,
                    `${l.accountCode} · ${l.accountName}`,
                    l.debit.toFixed(2),
                    l.credit.toFixed(2),
                  ]),
                },
              ]
            : [],
        };
      }

      case "/finance/purchase-orders": {
        const po = purchaseOrders?.find((p) => p.id === id);
        if (!po) return null;
        return {
          title: `PO ${po.poNo}`,
          subtitle: po.supplierName,
          statusText: po.status,
          sections: [
            {
              heading: "Order",
              fields: [
                { label: "Branch(es)", value: po.branches.join(", ") || "—" },
                { label: "Currency", value: po.currency },
                { label: "Expected Date", value: fmtDate(po.expectedDate) },
                { label: "Shipping", value: `${po.shipping.toFixed(2)} ر.س` },
                { label: "Incoterm", value: po.incoterm ?? "—" },
                { label: "Carrier", value: po.carrier ?? "—" },
                { label: "Tracking Ref", value: po.trackingRef ?? "—" },
                {
                  label: "Total Value",
                  value: `${po.totalValue.toLocaleString("en-US", { maximumFractionDigits: 0 })} ر.س`,
                },
                { label: "Received", value: `${po.receivedPct}%` },
              ],
            },
          ],
          tables: [
            {
              heading: "Lines",
              columns: [
                "SKU",
                "Product",
                "Branch",
                "Warehouse",
                "Qty",
                "Received",
                "Unit Cost",
                "Batch",
                "Expiry",
              ],
              rows: po.lines.map((l) => [
                l.sku,
                l.productName,
                l.branchName,
                l.warehouseName,
                l.qty,
                l.receivedQty,
                l.unitCost.toFixed(2),
                l.batchNo ?? "—",
                l.expiryDate ? fmtDate(l.expiryDate) : "—",
              ]),
            },
            ...(poHistory?.length
              ? [
                  {
                    heading: "History",
                    columns: ["Date", "Event", "By"],
                    rows: poHistory.map((h) => [fmtDate(h.createdAt), h.event, h.userName ?? "—"]),
                  },
                ]
              : []),
          ],
        };
      }

      case "/suppliers/rts": {
        const rts = returns?.find((r) => r.id === id);
        if (!rts) return null;
        return {
          title: `RTS ${rts.rtsNo}`,
          subtitle: rts.supplierName,
          statusText: rts.status,
          sections: [
            {
              heading: "Return",
              fields: [
                { label: "Branch", value: rts.branchName },
                { label: "Linked PO", value: rts.purchaseOrderNo ?? "—" },
                { label: "Reason", value: rts.reason },
                { label: "Date", value: fmtDate(rts.date) },
                { label: "Carrier", value: rts.carrier ?? "—" },
                { label: "Credit Note", value: rts.creditNoteRef ?? "—" },
              ],
            },
          ],
          tables: [
            {
              heading: "Lines",
              columns: ["SKU", "Batch", "Qty", "Unit Cost", "Line Total"],
              rows: rts.lines.map((l) => [
                l.sku,
                l.batchNo ?? "—",
                l.qty,
                l.unitCost.toFixed(2),
                (l.qty * l.unitCost).toFixed(2),
              ]),
            },
            ...(rtsHistory?.length
              ? [
                  {
                    heading: "History",
                    columns: ["Date", "Event", "By"],
                    rows: rtsHistory.map((h) => [fmtDate(h.createdAt), h.event, h.userName ?? "—"]),
                  },
                ]
              : []),
          ],
        };
      }

      case "/finance/expenses": {
        const expense = expenses?.find((e) => e.id === id);
        if (!expense) return null;
        return {
          title: expense.expenseNo,
          subtitle: `${expense.category} · ${expense.branchName}`,
          statusText: expense.status,
          sections: [
            {
              heading: "Details",
              fields: [
                { label: "Date", value: fmtDate(expense.date) },
                { label: "Branch", value: expense.branchName },
                { label: "Category", value: expense.category },
                { label: "Vendor", value: expense.vendor ?? "—" },
                { label: "Method", value: expense.method },
                { label: "Description", value: expense.description },
              ],
            },
            {
              heading: "Amounts",
              fields: [
                { label: "Amount", value: `${expense.amount.toFixed(2)} ر.س` },
                { label: "VAT", value: `${expense.vat.toFixed(2)} ر.س` },
                { label: "Total", value: `${(expense.amount + expense.vat).toFixed(2)} ر.س` },
              ],
            },
          ],
        };
      }

      case "/finance/pricing": {
        const rule = pricingRules?.find((r) => r.id === id);
        if (!rule) return null;
        return {
          title: rule.name,
          subtitle: `PR-${String(rule.id).padStart(3, "0")} · ${rule.type}`,
          statusText: rule.status,
          sections: [
            {
              heading: "Rule",
              fields: [
                { label: "Scope", value: rule.scope },
                { label: "Condition", value: rule.condition },
                { label: "Action", value: rule.action },
                { label: "Priority", value: String(rule.priority) },
                {
                  label: "Valid Until",
                  value: rule.validUntil ? fmtDate(rule.validUntil) : "Ongoing",
                },
              ],
            },
            ...(rule.type === "Coupon"
              ? [
                  {
                    heading: "Coupon",
                    fields: [
                      { label: "Code", value: rule.code ?? "—" },
                      { label: "Discount Type", value: rule.discountType },
                      {
                        label: "Value",
                        value:
                          rule.discountType === "Percentage"
                            ? `${rule.value}%`
                            : `${rule.value} ر.س`,
                      },
                    ],
                  },
                ]
              : []),
          ],
        };
      }

      case "/finance/returns": {
        const ret = customerReturns?.find((r) => r.id === id);
        if (!ret) return null;
        return {
          title: `Return ${ret.returnNo}`,
          subtitle: ret.customerName,
          statusText: ret.status,
          sections: [
            {
              heading: "Return",
              fields: [
                { label: "Order", value: ret.orderNo ?? "—" },
                { label: "Type", value: ret.type },
                { label: "Reason", value: ret.reason },
                { label: "Approved By", value: ret.approvedByName ?? "—" },
                { label: "Total Refund", value: `${ret.totalAmount.toFixed(2)} ر.س` },
                { label: "Created", value: fmtDate(ret.createdAt) },
              ],
            },
          ],
          tables: [
            {
              heading: "Lines",
              columns: ["SKU", "Product", "Qty", "Refund Amount"],
              rows: ret.lines.map((l) => [l.sku, l.productName, l.qty, l.amount.toFixed(2)]),
            },
          ],
        };
      }

      case "/finance/tax-zatca": {
        const taxCode = taxCodes?.find((t) => t.id === id);
        if (!taxCode) return null;
        return {
          title: taxCode.name,
          subtitle: taxCode.code,
          statusText: taxCode.status,
          sections: [
            {
              heading: "Configuration",
              fields: [
                { label: "Type", value: taxCode.type },
                {
                  label: "Rate",
                  value:
                    taxCode.type === "Fee" ? `${taxCode.rate.toFixed(2)} ر.س` : `${taxCode.rate}%`,
                },
                { label: "Applies To", value: taxCode.appliesTo },
                { label: "Effective From", value: fmtDate(taxCode.effectiveFrom) },
                { label: "GL Account", value: taxCode.glAccountCode ?? "—" },
              ],
            },
          ],
        };
      }

      default:
        return null;
    }
  };
}
