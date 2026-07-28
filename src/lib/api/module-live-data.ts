import {
  useUsers,
  useBranches,
  useTerminals,
  useDevices,
  useSettings,
  useRules,
  useCompliance,
  useMaintenance,
  useSubscription,
  useAuditLogs,
  mapUsers,
  mapBranches,
  mapTerminals,
  mapDevices,
  mapSystemSettings,
  mapPosSettings,
  mapRules,
  mapCompliance,
  mapMaintenance,
  mapPlans,
  mapAuditLogs,
  type LiveTable,
} from "./admin";
import { useCategories, useProducts, mapCategories, mapProducts } from "./catalog";
import { useBundles, mapBundles } from "./bundles";
import {
  useWarehouses,
  useStockLevels,
  useBranchStockLevels,
  useStockBatches,
  useBranchStockBatches,
  useStockTransfers,
  useStockMovements,
  mapWarehouses,
  mapStockLevels,
  mapBranchStockLevels,
  mapStockBatches,
  mapStockTransfers,
  mapStockMovements,
} from "./inventory";
import {
  useSuppliers,
  usePurchaseOrders,
  useReturnsToSupplier,
  mapSuppliers,
  mapPurchaseOrders,
  mapRts,
} from "./procurement";
import { usePricingRules, mapPricingRules } from "./pos";
import {
  useExpenses,
  useTaxCodes,
  useReturns,
  mapExpenses,
  mapTaxCodes,
  mapReturns,
} from "./finance";
import {
  useZatcaInvoices,
  useZatcaIdentities,
  useZatcaSettings,
  mapZatcaInvoices,
  mapZatcaConfiguration,
} from "./zatca";
import {
  useInsightsSales,
  useInsightsKpi,
  useInsightsReports,
  useInsightsBi,
  useAdminOverview,
  mapSales,
  mapKpis,
  mapReports,
  mapBiFeeds,
  mapOverview,
} from "./insights";

// Registry of routes that are wired to the real backend — everything else keeps using the static
// src/lib/buildpos/modules.ts mock rows until its phase is wired.
export function useModuleLiveData(pathname: string): LiveTable | undefined {
  const users = useUsers(pathname === "/admin/users");
  const branches = useBranches(pathname === "/network/branches");
  const terminals = useTerminals(pathname === "/network/terminals");
  const devices = useDevices(pathname === "/network/devices");
  const systemSettings = useSettings("System", pathname === "/admin/settings");
  const posSettings = useSettings("Pos", pathname === "/admin/pos-settings");
  const rules = useRules(pathname === "/admin/rules");
  const compliance = useCompliance(pathname === "/admin/compliance");
  const maintenance = useMaintenance(pathname === "/admin/maintenance");
  const subscription = useSubscription(pathname === "/admin/plans");
  const auditLogs = useAuditLogs(undefined, pathname === "/admin/audit-logs");

  const categories = useCategories(pathname === "/admin/categories");
  const products = useProducts(pathname === "/stock/inventory");
  const warehouses = useWarehouses(pathname === "/stock/warehouses");
  const stockLevels = useStockLevels(pathname === "/stock/stocks");
  const branchStockLevels = useBranchStockLevels(pathname === "/stock/branch-stock");
  const stockBatches = useStockBatches(pathname === "/stock/expiry");
  const branchStockBatches = useBranchStockBatches(pathname === "/stock/expiry");
  const transfers = useStockTransfers(pathname === "/stock/transfers");
  const movements = useStockMovements(pathname === "/stock/movements");
  const bundles = useBundles(pathname === "/stock/bundles");
  const suppliers = useSuppliers(pathname === "/suppliers/suppliers");
  const purchaseOrders = usePurchaseOrders(pathname === "/finance/purchase-orders");
  const rts = useReturnsToSupplier(pathname === "/suppliers/rts");

  const pricingRules = usePricingRules(pathname === "/finance/pricing");
  const expenses = useExpenses(pathname === "/finance/expenses");
  const taxCodes = useTaxCodes(pathname === "/finance/tax-zatca");
  const returns = useReturns(pathname === "/finance/returns");
  const zatcaInvoices = useZatcaInvoices(undefined, pathname === "/admin/zatca-invoices");
  const zatcaIdentities = useZatcaIdentities(pathname === "/admin/zatca-settings");
  const zatcaSettingsList = useZatcaSettings(pathname === "/admin/zatca-settings");
  const sales = useInsightsSales(pathname === "/insights/sales");
  const kpi = useInsightsKpi(pathname === "/insights/kpi");
  const reports = useInsightsReports(pathname === "/insights/reports");
  const bi = useInsightsBi(pathname === "/insights/bi");
  const overview = useAdminOverview(pathname === "/admin/overview");

  switch (pathname) {
    case "/admin/users":
      return users.data ? mapUsers(users.data) : undefined;
    case "/network/branches":
      return branches.data ? mapBranches(branches.data) : undefined;
    case "/network/terminals":
      return terminals.data ? mapTerminals(terminals.data) : undefined;
    case "/network/devices":
      return devices.data ? mapDevices(devices.data) : undefined;
    case "/admin/settings":
      return systemSettings.data ? mapSystemSettings(systemSettings.data) : undefined;
    case "/admin/pos-settings":
      return posSettings.data ? mapPosSettings(posSettings.data) : undefined;
    case "/admin/rules":
      return rules.data ? mapRules(rules.data) : undefined;
    case "/admin/compliance":
      return compliance.data ? mapCompliance(compliance.data) : undefined;
    case "/admin/maintenance":
      return maintenance.data ? mapMaintenance(maintenance.data) : undefined;
    case "/admin/plans":
      return subscription.data ? mapPlans(subscription.data) : undefined;
    case "/admin/audit-logs":
      return auditLogs.data ? mapAuditLogs(auditLogs.data) : undefined;
    case "/admin/categories":
      return categories.data ? mapCategories(categories.data) : undefined;
    case "/stock/inventory":
      return products.data ? mapProducts(products.data) : undefined;
    case "/stock/warehouses":
      return warehouses.data ? mapWarehouses(warehouses.data) : undefined;
    case "/stock/stocks":
      return stockLevels.data ? mapStockLevels(stockLevels.data) : undefined;
    case "/stock/branch-stock":
      return branchStockLevels.data ? mapBranchStockLevels(branchStockLevels.data) : undefined;
    case "/stock/expiry":
      return stockBatches.data
        ? mapStockBatches(stockBatches.data, branchStockBatches.data ?? [])
        : undefined;
    case "/stock/transfers":
      return transfers.data ? mapStockTransfers(transfers.data) : undefined;
    case "/stock/movements":
      return movements.data ? mapStockMovements(movements.data) : undefined;
    case "/stock/bundles":
      return bundles.data ? mapBundles(bundles.data) : undefined;
    case "/suppliers/suppliers":
      return suppliers.data ? mapSuppliers(suppliers.data) : undefined;
    case "/finance/purchase-orders":
      return purchaseOrders.data ? mapPurchaseOrders(purchaseOrders.data) : undefined;
    case "/suppliers/rts":
      return rts.data ? mapRts(rts.data) : undefined;
    case "/finance/pricing":
      return pricingRules.data ? mapPricingRules(pricingRules.data) : undefined;
    case "/finance/expenses":
      return expenses.data ? mapExpenses(expenses.data) : undefined;
    case "/finance/tax-zatca":
      return taxCodes.data ? mapTaxCodes(taxCodes.data) : undefined;
    case "/finance/returns":
      return returns.data ? mapReturns(returns.data) : undefined;
    case "/admin/zatca-invoices":
      return zatcaInvoices.data ? mapZatcaInvoices(zatcaInvoices.data) : undefined;
    case "/admin/zatca-settings":
      return zatcaIdentities.data && zatcaSettingsList.data
        ? mapZatcaConfiguration(zatcaIdentities.data, zatcaSettingsList.data)
        : undefined;
    case "/insights/sales":
      return sales.data ? mapSales(sales.data) : undefined;
    case "/insights/kpi":
      return kpi.data ? mapKpis(kpi.data) : undefined;
    case "/insights/reports":
      return reports.data ? mapReports(reports.data) : undefined;
    case "/insights/bi":
      return bi.data ? mapBiFeeds(bi.data) : undefined;
    case "/admin/overview":
      return overview.data ? mapOverview(overview.data) : undefined;
    default:
      return undefined;
  }
}
