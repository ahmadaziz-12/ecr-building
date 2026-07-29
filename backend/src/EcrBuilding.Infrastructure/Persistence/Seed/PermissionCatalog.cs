namespace EcrBuilding.Infrastructure.Persistence.Seed;

// The canonical list of page-level permission modules — one entry per sidebar route. ModuleKey is
// the exact route string used as `to` in the frontend's AppLayout.tsx nav array (including the
// leading slash), so a RolePermission/UserPermissionOverride row keyed by ModuleKey maps 1:1 onto a
// real page with no separate enum to keep in sync. Section is the role ladder's pre-existing
// coarse-bucket name (the old ModuleArea values) — used only by DbSeeder to expand each of the 5
// BRD roles' per-section AccessLevel into a full per-page grid; it carries no meaning at runtime.
//
// Kept in sync BY HAND with AppLayout.tsx's `nav` array — same tradeoff as the existing POS_TIER_PRESETS
// frontend mirror of DbSeeder.PosTier. If a page is added/removed/renamed in AppLayout.tsx, mirror the
// change here too.
public static class PermissionCatalog
{
    public sealed record PageDef(string Key, string Section, string Label);

    public static readonly PageDef[] Pages =
    [
        new("/dashboard", "Dashboard", "Dashboard"),

        new("/operate/pos-checkout", "Pos", "POS Checkout"),
        new("/operate/orders", "Orders", "Orders & Quotations"),
        new("/operate/customers", "Orders", "Customers & Contractors"),
        new("/operate/cashier-workspace", "Pos", "Cashier Workspace"),
        new("/operate/cashier-shift", "Pos", "Cashier Shifts"),
        new("/operate/approval-center", "Pos", "Approval Center"),
        new("/operate/customer-display", "Pos", "Customer Display"),

        new("/stock/inventory", "Inventory", "Product Catalog"),
        new("/stock/variant-groups", "Inventory", "Variant Groups"),
        new("/admin/categories", "Inventory", "Categories & Attributes"),
        new("/stock/warehouses", "Inventory", "Warehouses"),
        new("/stock/stocks", "Inventory", "Warehouse Stock"),
        new("/stock/branch-stock", "Inventory", "Branch Stock"),
        new("/stock/stock-count", "Inventory", "Stock Count"),
        new("/stock/movements", "Inventory", "Stock Movements"),
        new("/stock/expiry", "Inventory", "Expiry"),
        new("/stock/transfers", "Inventory", "Stock Transfers"),
        new("/stock/bundles", "Inventory", "Bundles & Systems"),
        new("/stock/serial-tracking", "Inventory", "Serial Number Tracking"),

        new("/suppliers/suppliers", "Suppliers", "Suppliers"),
        new("/finance/purchase-orders", "Suppliers", "Purchase Orders"),
        new("/suppliers/rts", "Suppliers", "Supplier Returns"),

        new("/finance/expenses", "Finance", "Expenses"),
        new("/finance/general-ledger", "Finance", "General Ledger"),
        new("/finance/pricing", "Finance", "Pricing, Discounts & Coupons"),
        new("/finance/returns", "Finance", "Returns & Refunds"),
        new("/finance/loyalty", "Finance", "Loyalty Program"),
        new("/finance/tax-zatca", "Finance", "Invoices & Tax Compliance"),

        new("/delivery/dashboard", "Delivery", "Delivery Dashboard"),
        new("/delivery/pipeline", "Delivery", "Delivery Pipeline"),
        new("/delivery/orders", "Delivery", "Delivery Orders"),
        new("/delivery/drivers", "Delivery", "Driver Assignments"),
        new("/delivery/vehicles", "Delivery", "Vehicle Assignments"),
        new("/delivery/zones", "Delivery", "Delivery Zones"),
        new("/delivery/logs", "Delivery", "Delivery Activity Logs"),

        new("/hrms/dashboard", "Hr", "HR Dashboard"),
        new("/hrms/employees", "Hr", "Employees"),
        new("/hrms/departments", "Hr", "Departments"),
        new("/hrms/attendance", "Hr", "Shift & Attendance"),
        new("/hrms/leave", "Hr", "Leave Management"),
        new("/hrms/documents", "Hr", "Documents & Contracts"),
        new("/hrms/logs", "Hr", "HR Activity Logs"),

        new("/network/branches", "Network", "Branches"),
        new("/network/terminals", "Network", "Terminals"),
        new("/network/devices", "Network", "Devices"),

        new("/insights/reports", "Insights", "Reports"),
        new("/insights/bi", "Insights", "Analytics"),
        new("/insights/kpi", "Insights", "KPI Evaluation"),

        new("/admin/overview", "Admin", "Admin Overview"),
        new("/admin/users", "Admin", "Registered Users"),
        new("/admin/roles", "Admin", "Roles & Permissions"),
        new("/admin/rules", "Admin", "Rules Engine"),
        new("/admin/compliance", "Admin", "Compliance"),
        new("/admin/maintenance", "Admin", "Maintenance"),
        new("/admin/pos-settings", "Admin", "POS Settings"),
        new("/admin/zatca-invoices", "Finance", "ZATCA Invoices"),
        new("/admin/zatca-settings", "Finance", "ZATCA Phase 2 Settings"),
        new("/admin/audit-logs", "Admin", "Audit Logs"),
        new("/admin/plans", "Admin", "Subscriptions"),
        new("/admin/settings", "Admin", "General Settings"),
    ];

    public static readonly HashSet<string> ValidKeys = Pages.Select(p => p.Key).ToHashSet();
}
