import { useCategories, useCreateCategory, useCreateProduct, useProducts } from "./catalog";
import { parseUomConversions } from "@/lib/buildpos/uom";
import { useCreateBundle } from "./bundles";
import {
  useCreateStockAdjustment,
  useCreateStockBatch,
  useCreateStockTransfer,
  useCreateWarehouse,
  useCreateWarehouseBin,
  useWarehouses,
} from "./inventory";
import {
  useUsers, useBranches, useRoles, useTerminals,
  useCreateUser, useCreateRole, useCreateBranch, useCreateTerminal, useCreateDevice,
  useCreateRule, useCreateCompliance, useCreateMaintenance,
  TERMINAL_TYPE_TO_BACKEND, DEVICE_TYPE_TO_BACKEND, CONNECTION_TO_BACKEND,
  RULE_DOMAIN_TO_BACKEND, RULE_PRIORITY_TO_NUMBER, posCeilingsFromTier,
} from "./admin";
import {
  useCreatePurchaseOrder,
  useCreateRts,
  useCreateSupplier,
  usePurchaseOrders,
  useSuppliers,
} from "./procurement";
import { useCreateExpense, useCreateReturn, useCreateTaxCode } from "./finance";
import { useCustomers, useOrders } from "./pos";

export function parseSkuQtyLines(raw: string): { sku: string; qty: number }[] {
  return raw.split(",").map((token) => {
    const trimmed = token.trim();
    const m = trimmed.match(/^(.+?)\s*[x×]\s*(\d+(?:\.\d+)?)$/i);
    if (!m) throw new Error(`Could not parse "${trimmed}" — use the format "SKU x Qty".`);
    return { sku: m[1].trim(), qty: Number(m[2]) };
  });
}

// "PVC-PIPE-2IN x 4 @ 180" per customer-return line — amount is the refund amount for that line,
// not a unit cost (a customer return refunds what was charged, not what the item cost the store).
export function parseReturnLines(raw: string): { sku: string; qty: number; amount: number }[] {
  return raw.split(",").map((token) => {
    const trimmed = token.trim();
    const m = trimmed.match(/^(.+?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*@\s*(\d+(?:\.\d+)?)$/i);
    if (!m) throw new Error(`Could not parse "${trimmed}" — use the format "SKU x Qty @ Amount".`);
    const [, sku, qty, amount] = m;
    return { sku: sku.trim(), qty: Number(qty), amount: Number(amount) };
  });
}

// Both create-po and create-rts's line items are now a lineItems field (see flows.ts /
// FlowDialog's LineItemsField) — its value is a JSON array of row objects, not an encoded string.
function parseLineItemRows(raw: string | undefined): Record<string, string>[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Real backend submit handlers for FlowDialog, keyed by Flow.key (src/lib/buildpos/flows.ts).
// A flow with no entry here just keeps the old "toast only, not persisted" mock behavior —
// see AGENTS/README for which flows are wired vs. still mock.
export function useFlowSubmitHandlers(): Record<
  string,
  (values: Record<string, string>) => Promise<void>
> {
  const { data: categories } = useCategories();
  const createCategory = useCreateCategory();
  const createProduct = useCreateProduct();
  const { data: products } = useProducts();
  const { data: warehouses } = useWarehouses();
  const { data: users } = useUsers();
  const createStockAdjustment = useCreateStockAdjustment();
  const createStockBatch = useCreateStockBatch();
  const createTransfer = useCreateStockTransfer();
  const createWarehouse = useCreateWarehouse();
  const createWarehouseBin = useCreateWarehouseBin();
  const createBundle = useCreateBundle();
  const { data: branches } = useBranches();
  const { data: roles } = useRoles();
  const { data: terminals } = useTerminals();
  const createUser = useCreateUser();
  const createRole = useCreateRole();
  const createBranch = useCreateBranch();
  const createTerminal = useCreateTerminal();
  const createDevice = useCreateDevice();
  const createRule = useCreateRule();
  const createCompliance = useCreateCompliance();
  const createMaintenance = useCreateMaintenance();
  const { data: suppliers } = useSuppliers();
  const { data: purchaseOrders } = usePurchaseOrders();
  const createSupplier = useCreateSupplier();
  const createPurchaseOrder = useCreatePurchaseOrder();
  const createRts = useCreateRts();
  const createExpense = useCreateExpense();
  const createTaxCode = useCreateTaxCode();
  const createReturn = useCreateReturn();
  const { data: orders } = useOrders();
  const { data: customers } = useCustomers();

  // A Stock Transfer's source/destination is either a warehouse (bulk stock) or a branch (shop-floor
  // stock) — the picker's options are prefixed "Warehouse: <name>" / "Branch: <name>" so one field
  // can pick either kind of location.
  function resolveTransferLocation(value: string): { warehouseId: number | null; branchId: number | null } {
    if (value.toLowerCase().startsWith("warehouse:")) {
      const name = value.slice("warehouse:".length).trim();
      const warehouse = warehouses?.find((w) => w.name.toLowerCase() === name.toLowerCase());
      if (!warehouse) throw new Error(`Unknown warehouse "${name}".`);
      return { warehouseId: warehouse.id, branchId: null };
    }
    if (value.toLowerCase().startsWith("branch:")) {
      const name = value.slice("branch:".length).trim();
      const branch = branches?.find((b) => b.nameEn.toLowerCase() === name.toLowerCase());
      if (!branch) throw new Error(`Unknown branch "${name}".`);
      return { warehouseId: null, branchId: branch.id };
    }
    throw new Error(`"${value}" must be prefixed "Warehouse:" or "Branch:".`);
  }

  function findWarehouseForBranch(branchName: string) {
    const branch = branches?.find((b) => b.nameEn.toLowerCase() === branchName.toLowerCase());
    if (!branch) throw new Error(`Unknown branch "${branchName}".`);
    const warehouse = warehouses?.find((w) => w.branchId === branch.id);
    if (!warehouse) throw new Error(`No warehouse configured for branch "${branchName}".`);
    return { branch, warehouse };
  }

  // A branch without a linked warehouse can still be ordered for on a PO — goods land straight on the
  // branch's sellable stock at Receive time, the warehouse-side bin/batch/expiry tracking is just
  // skipped for that line. Unlike findWarehouseForBranch, this never throws for a missing warehouse.
  function resolveBranchAndOptionalWarehouse(branchName: string) {
    const branch = branches?.find((b) => b.nameEn.toLowerCase() === branchName.toLowerCase());
    if (!branch) throw new Error(`Unknown branch "${branchName}".`);
    const warehouse = warehouses?.find((w) => w.branchId === branch.id) ?? null;
    return { branch, warehouse };
  }

  return {
    "add-sku": async (values) => {
      const category = categories?.find(
        (c) => c.nameEn.toLowerCase() === (values.category ?? "").toLowerCase(),
      );
      if (!values.sku || !values.nameEn) throw new Error("SKU and Name (English) are required.");
      if (!category)
        throw new Error(
          `Unknown category "${values.category}" — pick one that exists in Categories & Attributes.`,
        );

      const vatRate = values.vat === "Exempt" ? 0 : values.vat?.startsWith("0%") ? 0 : 15;
      await createProduct.mutateAsync({
        sku: values.sku,
        barcode: values.barcode || null,
        nameEn: values.nameEn,
        nameAr: values.nameAr || null,
        categoryId: category.id,
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
        imageUrl: null,
        uomConversions: parseUomConversions(values.uomConversions),
        isCutToSize: values.cutToSize === "on",
      });
    },

    "create-category": async (values) => {
      if (!values.code || !values.nameEn) throw new Error("Code and Name (English) are required.");
      // Parent is optional — an unrecognized name just creates a top-level category instead of
      // blocking the whole form, unlike category-on-product which is required.
      const parentName =
        values.parent && values.parent !== "— None (top level) —" ? values.parent : null;
      const parent = parentName
        ? categories?.find((c) => c.nameEn.toLowerCase() === parentName.toLowerCase())
        : undefined;
      const vatRate = values.vat === "Exempt" ? 0 : values.vat?.startsWith("0%") ? 0 : 15;

      await createCategory.mutateAsync({
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
        returnRule: values.returnRule || "Standard 15 days",
        defaultUom: values.defaultUom || "Piece",
        vatRate,
        returnable: values.returnable === "on",
      });
    },

    "new-adjustment": async (values) => {
      if (!values.reason) throw new Error("Reason is required.");
      if (!values.sku) throw new Error("SKU is required.");
      if (!values.counted) throw new Error("Counted Qty is required.");

      const warehouse = warehouses?.find(
        (w) => w.name.toLowerCase() === (values.warehouse ?? "").toLowerCase(),
      );
      if (!warehouse)
        throw new Error(
          `Unknown warehouse "${values.warehouse}" — pick one that exists in Warehouses.`,
        );

      const product = products?.find((p) => p.sku.toLowerCase() === values.sku.toLowerCase());
      if (!product) throw new Error(`Unknown SKU "${values.sku}" — check Product Catalog.`);

      const approver = values.approver
        ? users?.find((u) => u.name.toLowerCase() === values.approver.toLowerCase())
        : undefined;

      await createStockAdjustment.mutateAsync({
        reason: values.reason,
        warehouseId: warehouse.id,
        date: values.date || new Date().toISOString().slice(0, 10),
        approverUserId: approver?.id ?? null,
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

    "add-warehouse": async (values) => {
      if (!values.code || !values.name) throw new Error("Code and Name are required.");
      if (!values.branch) throw new Error("Branch is required.");
      const branch = branches?.find((b) => b.nameEn.toLowerCase() === values.branch.toLowerCase());
      if (!branch) throw new Error(`Unknown branch "${values.branch}".`);
      if (!values.type) throw new Error("Type is required.");

      await createWarehouse.mutateAsync({
        code: values.code,
        name: values.name,
        branchId: branch.id,
        type: values.type,
      });
    },

    "bin-setup": async (values) => {
      if (!values.warehouse) throw new Error("Warehouse is required.");
      const warehouse = warehouses?.find((w) => w.name.toLowerCase() === values.warehouse.toLowerCase());
      if (!warehouse) throw new Error(`Unknown warehouse "${values.warehouse}".`);
      if (!values.binCode || !values.label) throw new Error("Bin Code and Label are required.");

      await createWarehouseBin.mutateAsync({
        warehouseId: warehouse.id,
        request: { binCode: values.binCode, label: values.label, capacityTons: Number(values.capacity || 0) },
      });
    },

    "create-transfer": async (values) => {
      if (!values.from || !values.to) throw new Error("From and To location are required.");
      const from = resolveTransferLocation(values.from);
      const to = resolveTransferLocation(values.to);
      if (from.warehouseId !== null && from.warehouseId === to.warehouseId) throw new Error("Source and destination warehouse must differ.");
      if (from.branchId !== null && from.branchId === to.branchId) throw new Error("Source and destination branch must differ.");

      const rows = parseLineItemRows(values.items);
      if (!rows.length) throw new Error("At least one line item is required.");

      const lines = rows.map((row) => {
        if (!row.sku || !(Number(row.qty) > 0)) throw new Error("Every line needs an item and a quantity greater than 0.");
        const product = products?.find((p) => p.sku.toLowerCase() === row.sku.toLowerCase());
        if (!product) throw new Error(`Unknown SKU "${row.sku}".`);
        return {
          productId: product.id,
          qty: Number(row.qty),
          unitCost: Number(row.unitCost || product.costPrice),
          batchNo: row.batchNo || null,
          expiryDate: row.expiryDate || null,
        };
      });

      await createTransfer.mutateAsync({
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

    "add-batch": async (values) => {
      if (!values.sku || !values.warehouse || !values.batchNo)
        throw new Error("SKU, warehouse and batch number are required.");
      const product = products?.find((p) => p.sku.toLowerCase() === values.sku.toLowerCase());
      if (!product) throw new Error(`Unknown SKU "${values.sku}" — check Product Catalog.`);
      const warehouse = warehouses?.find(
        (w) => w.name.toLowerCase() === values.warehouse.toLowerCase(),
      );
      if (!warehouse) throw new Error(`Unknown warehouse "${values.warehouse}".`);
      if (!values.received || !values.expiry)
        throw new Error("Received and Expiry dates are required.");

      await createStockBatch.mutateAsync({
        productId: product.id,
        warehouseId: warehouse.id,
        batchNo: values.batchNo,
        receivedDate: values.received,
        expiryDate: values.expiry,
        qty: Number(values.qty || 0),
      });
    },

    "create-bundle": async (values) => {
      if (!values.code || !values.nameEn) throw new Error("Bundle code and name are required.");
      if (!values.lines) throw new Error("At least one component (SKU x Qty) is required.");

      const lines = parseSkuQtyLines(values.lines).map(({ sku, qty }) => {
        const product = products?.find((p) => p.sku.toLowerCase() === sku.toLowerCase());
        if (!product) throw new Error(`Unknown SKU "${sku}".`);
        return { productId: product.id, qty };
      });

      await createBundle.mutateAsync({
        code: values.code,
        nameEn: values.nameEn,
        nameAr: values.nameAr || null,
        bundlePrice: Number(values.price || 0),
        lines,
      });
    },

    "add-supplier": async (values) => {
      if (!values.code || !values.nameEn)
        throw new Error("Supplier code and legal name are required.");
      await createSupplier.mutateAsync({
        code: values.code,
        nameEn: values.nameEn,
        nameAr: values.nameAr || null,
        type: values.type || "Distributor",
        vatNo: values.vat || null,
        phone: values.phone || null,
        email: values.email || null,
        categories: values.categories
          ? values.categories
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
        terms: values.terms || "Net 30",
        currency: values.currency || "SAR",
        leadTimeDays: Number(values.leadTime || 7),
        iban: values.iban || null,
      });
    },

    "create-po": async (values) => {
      const supplier = suppliers?.find(
        (s) => s.nameEn.toLowerCase() === (values.supplier ?? "").toLowerCase(),
      );
      if (!supplier) throw new Error(`Unknown supplier "${values.supplier}".`);
      const rows = parseLineItemRows(values.items);
      if (!rows.length) throw new Error("At least one PO line is required.");

      // Each row can target several branches at once (the multi-select branch pills) — that
      // fans out into one PO line per branch, all carrying the same qty/cost/batch/expiry.
      const lines = rows.flatMap((row) => {
        if (!row.sku || !row.branch || !(Number(row.qty) > 0)) throw new Error("Every PO line needs an item, at least one branch and a quantity greater than 0.");
        const product = products?.find((p) => p.sku === row.sku);
        if (!product) throw new Error(`Unknown SKU "${row.sku}".`);
        const branchNames = row.branch.split(",").map((s) => s.trim()).filter(Boolean);
        return branchNames.map((branchName) => {
          const { branch, warehouse } = resolveBranchAndOptionalWarehouse(branchName);
          return {
            productId: product.id,
            branchId: branch.id,
            warehouseId: warehouse?.id ?? null,
            // "" / unset → the server orders in the product's own stock UOM; a picked UOM (e.g.
            // "Pallet") is validated server-side against the product's configured conversions.
            uom: row.uom || null,
            qty: Number(row.qty),
            unitCost: Number(row.unitCost || product.costPrice),
            batchNo: row.batchNo || null,
            expiryDate: row.expiryDate || null,
          };
        });
      });

      const approver = values.approver
        ? users?.find((u) => u.name.toLowerCase() === values.approver.toLowerCase())
        : undefined;

      await createPurchaseOrder.mutateAsync({
        supplierId: supplier.id,
        currency: values.currency || supplier.currency,
        expectedDate: values.expected || new Date().toISOString().slice(0, 10),
        shipping: Number(values.shipping || 0),
        incoterm: values.incoterm || null,
        approverUserId: approver?.id ?? null,
        lines,
      });
    },

    "create-rts": async (values) => {
      const supplier = suppliers?.find(
        (s) => s.nameEn.toLowerCase() === (values.supplier ?? "").toLowerCase(),
      );
      if (!supplier) throw new Error(`Unknown supplier "${values.supplier}".`);
      if (!values.branch) throw new Error("Branch is required.");
      const { branch, warehouse } = findWarehouseForBranch(values.branch);
      const rows = parseLineItemRows(values.items);
      if (!rows.length) throw new Error("At least one return line is required.");

      const linkedPo = values.poNo
        ? purchaseOrders?.find((p) => p.poNo.toLowerCase() === values.poNo.toLowerCase())
        : undefined;

      const lines = rows.map((row) => {
        if (!row.sku || !(Number(row.qty) > 0)) throw new Error("Every return line needs an item and a quantity greater than 0.");
        const product = products?.find((p) => p.sku === row.sku);
        if (!product) throw new Error(`Unknown SKU "${row.sku}".`);
        return { productId: product.id, batchNo: row.batchNo || null, qty: Number(row.qty), unitCost: Number(row.unitCost || product.costPrice) };
      });

      await createRts.mutateAsync({
        supplierId: supplier.id,
        purchaseOrderId: linkedPo?.id ?? null,
        branchId: branch.id,
        warehouseId: warehouse.id,
        reason: values.reason || "Other",
        date: values.date || new Date().toISOString().slice(0, 10),
        carrier: values.carrier || null,
        lines,
      });
    },

    "add-expense": async (values) => {
      if (!values.branch) throw new Error("Branch is required.");
      if (!values.category || !values.description)
        throw new Error("Category and description are required.");
      if (!values.amount) throw new Error("Amount is required.");
      const branch = branches?.find((b) => b.nameEn.toLowerCase() === values.branch.toLowerCase());
      if (!branch) throw new Error(`Unknown branch "${values.branch}".`);

      await createExpense.mutateAsync({
        date: values.date || new Date().toISOString().slice(0, 10),
        branchId: branch.id,
        category: values.category,
        description: values.description,
        vendor: values.vendor || null,
        amount: Number(values.amount || 0),
        vat: Number(values.vat || 0),
        method: values.method || "Petty Cash",
      });
    },

    "new-return": async (values) => {
      if (!values.type || !values.reason) throw new Error("Return type and reason are required.");
      if (!values.items)
        throw new Error("At least one return line (SKU x Qty) is required.");
      if (!values.invoice) throw new Error("The original order number is required — returns always reference the original transaction.");

      // Module 6: returns are anchored to the ORIGINAL ORDER's lines, so the SKUs entered here are
      // resolved against that order and quantities validated/priced server-side.
      const order = orders?.find((o) => o.orderNo.toLowerCase() === values.invoice.toLowerCase());
      if (!order) throw new Error(`Unknown order "${values.invoice}".`);

      const lines = parseReturnLines(values.items).map(({ sku, qty }) => {
        const orderLine = order.lines.find((l) => l.sku.toLowerCase() === sku.toLowerCase());
        if (!orderLine) throw new Error(`"${sku}" was not sold on ${order.orderNo}.`);
        return { orderLineId: orderLine.id, qty };
      });

      await createReturn.mutateAsync({
        orderId: order.id,
        type: values.type,
        reason: values.reason,
        lines,
        // The generic admin flow has no damage-code field; the POS CreateReturnDialog captures the
        // specific code — here damaged entries default to Other with the detail in the reason text.
        damageReasonCode: values.type === "Damaged" ? "Other" : undefined,
      });
    },

    "add-user": async (values) => {
      if (!values.name || !values.email || !values.password)
        throw new Error("Name, email and password are required.");
      const role = roles?.find((r) => r.name.toLowerCase() === (values.role ?? "").toLowerCase());
      if (!role) throw new Error(`Unknown role "${values.role}" — pick one that exists in Roles & Permissions.`);
      const branch =
        values.branch && values.branch !== "All Branches"
          ? branches?.find((b) => b.nameEn.toLowerCase() === values.branch.toLowerCase())
          : undefined;

      await createUser.mutateAsync({
        name: values.name,
        email: values.email,
        password: values.password,
        roleId: role.id,
        branchId: branch?.id ?? null,
      });
    },

    "create-role": async (values) => {
      if (!values.name) throw new Error("Role name is required.");
      const permMap: Record<string, string | undefined> = {
        Pos: values.permPos, Orders: values.permOrders, Inventory: values.permInventory, Finance: values.permFinance,
        Admin: values.permAdmin, Delivery: values.permDelivery, Hr: values.permHr, Insights: values.permInsights,
        Suppliers: values.permSuppliers, Network: values.permNetwork,
      };
      const permissions = Object.fromEntries(
        Object.entries(permMap).filter((entry): entry is [string, string] => Boolean(entry[1]) && entry[1] !== "None"),
      );

      await createRole.mutateAsync({
        name: values.name,
        description: values.description || null,
        approvalCap: Number(values.approvalCap || 0),
        permissions,
        posCeilings: posCeilingsFromTier(values.posTier),
      });
    },

    "add-branch": async (values) => {
      if (!values.code || !values.nameEn) throw new Error("Branch code and name are required.");
      await createBranch.mutateAsync({
        code: values.code,
        nameEn: values.nameEn,
        nameAr: values.nameAr || null,
        city: values.city || "Riyadh",
        address: values.address || null,
        businessHours: values.hours || null,
        vatRegistrationNumber: values.zatca || null,
        managerName: values.manager && values.manager !== "Assign later" ? values.manager : null,
        warehouse: values.warehouse && values.warehouse !== "Create new" ? values.warehouse : null,
      });
    },

    "add-terminal": async (values) => {
      if (!values.id || !values.branch) throw new Error("Terminal ID and branch are required.");
      const branch = branches?.find((b) => b.nameEn.toLowerCase() === values.branch.toLowerCase());
      if (!branch) throw new Error(`Unknown branch "${values.branch}".`);
      const assignedCashier = values.operator && values.operator !== "Unassigned"
        ? users?.find((u) => u.name.toLowerCase() === values.operator.toLowerCase())
        : undefined;

      await createTerminal.mutateAsync({
        code: values.id,
        name: values.name || values.id,
        branchId: branch.id,
        type: TERMINAL_TYPE_TO_BACKEND[values.type] ?? "Fixed",
        assignedCashierId: assignedCashier?.id ?? null,
        offlineModeEnabled: values.offline === "on",
        ipAddress: null,
        macAddress: null,
      });
    },

    "pair-device": async (values) => {
      if (!values.type) throw new Error("Device type is required.");
      const terminal = terminals?.find((t) => t.code === values.terminal);
      if (!terminal) throw new Error(`Unknown terminal "${values.terminal}" — pick one that exists in Terminals.`);

      await createDevice.mutateAsync({
        type: DEVICE_TYPE_TO_BACKEND[values.type] ?? "ReceiptPrinter",
        model: values.model || "Unknown",
        serial: values.serial || null,
        terminalId: terminal.id,
        connection: CONNECTION_TO_BACKEND[values.connection] ?? "Usb",
        ipAddress: values.ip || null,
        behaviorProfile: values.behaviorProfile || null,
      });
    },

    "add-tax-code": async (values) => {
      if (!values.code || !values.name || !values.rate || !values.appliesTo) {
        throw new Error("Code, name, rate and applies-to are required.");
      }
      const branch =
        values.branch && values.branch !== "All Branches"
          ? branches?.find((b) => b.nameEn.toLowerCase() === values.branch.toLowerCase())
          : undefined;
      await createTaxCode.mutateAsync({
        code: values.code,
        name: values.name,
        type: values.type || "VAT",
        rate: Number(values.rate || 0),
        appliesTo: values.appliesTo,
        effectiveFrom: values.effectiveFrom || new Date().toISOString().slice(0, 10),
        glAccountCode: values.glAccount || null,
        branchId: branch?.id ?? null,
      });
    },

    "create-rule": async (values) => {
      if (!values.name) throw new Error("Rule name is required.");
      const approver = values.approver ? users?.find((u) => u.name.toLowerCase() === values.approver.toLowerCase()) : undefined;
      await createRule.mutateAsync({
        name: values.name,
        domain: RULE_DOMAIN_TO_BACKEND[values.domain] ?? "Admin",
        priority: RULE_PRIORITY_TO_NUMBER[values.priority] ?? 20,
        whenTrigger: values.when || "On Sale Add Line",
        condition: values.if || "Any",
        action: values.action || "Warn & Log",
        approverUserId: approver?.id ?? null,
        active: values.active === "on",
        notes: values.notes || null,
      });
    },

    "add-control": async (values) => {
      if (!values.control || !values.owner || !values.nextDue) throw new Error("Control name, owner and next-due date are required.");
      await createCompliance.mutateAsync({
        control: values.control,
        framework: values.framework || "Internal Policy",
        owner: values.owner,
        lastReview: values.lastReview || new Date().toISOString().slice(0, 10),
        nextDue: values.nextDue,
        evidence: values.evidence || null,
        findings: values.findings || null,
        status: values.status || "Compliant",
      });
    },

    "create-ticket": async (values) => {
      if (!values.deviceOrModule || !values.owner) throw new Error("Device/module and assignee are required.");
      const branch = values.branch && values.branch !== "All Branches" ? branches?.find((b) => b.nameEn.toLowerCase() === values.branch.toLowerCase()) : undefined;
      await createMaintenance.mutateAsync({
        deviceOrModule: values.deviceOrModule,
        branchId: branch?.id ?? null,
        severity: values.severity || "Warning",
        owner: values.owner,
        slaHours: Number(values.slaHours || 24),
      });
    },
  };
}
