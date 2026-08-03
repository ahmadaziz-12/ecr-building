// The canonical list of page-level permission modules — one entry per sidebar route, mirrors the
// backend's PermissionCatalog.cs exactly (same keys, same order). Kept as an independent, hand-synced
// list rather than derived from AppLayout.tsx's nav array on purpose: nav visibility changes for
// reasons unrelated to permissioning (e.g. a module temporarily hidden while broken) and must not
// silently drop that module's ability to have its access managed here — same tradeoff the backend
// comment on PermissionCatalog.cs documents for its own POS_TIER_PRESETS-style mirror.
export type PermissionPage = { key: string; label: string; section: string };

export const PERMISSION_PAGES: PermissionPage[] = [
  { key: "/dashboard", label: "Dashboard", section: "Dashboard" },

  { key: "/operate/pos-checkout", label: "POS Checkout", section: "Operate" },
  { key: "/operate/orders", label: "Orders & Quotations", section: "Operate" },
  { key: "/operate/customers", label: "Customers & Contractors", section: "Operate" },
  { key: "/operate/cashier-workspace", label: "Cashier Workspace", section: "Operate" },
  { key: "/operate/cashier-shift", label: "Cashier Shifts", section: "Operate" },
  { key: "/operate/customer-display", label: "Customer Display", section: "Operate" },

  { key: "/stock/inventory", label: "Product Catalog", section: "Products & Stock" },
  { key: "/admin/categories", label: "Categories & Attributes", section: "Products & Stock" },
  { key: "/stock/warehouses", label: "Warehouses", section: "Products & Stock" },
  { key: "/stock/locations", label: "Stock Locations", section: "Products & Stock" },
  { key: "/stock/stocks", label: "Warehouse Stock", section: "Products & Stock" },
  { key: "/stock/branch-stock", label: "Branch Stock", section: "Products & Stock" },
  { key: "/stock/stock-count", label: "Stock Taking", section: "Products & Stock" },
  { key: "/stock/movements", label: "Stock Movements", section: "Products & Stock" },
  { key: "/stock/expiry", label: "Expiry", section: "Products & Stock" },
  { key: "/stock/transfers", label: "Stock Transfers", section: "Products & Stock" },
  { key: "/stock/bundles", label: "Bundles & Systems", section: "Products & Stock" },

  { key: "/suppliers/suppliers", label: "Suppliers", section: "Procurement" },
  { key: "/finance/purchase-orders", label: "Purchase Orders", section: "Procurement" },
  { key: "/suppliers/rts", label: "Supplier Returns", section: "Procurement" },

  { key: "/finance/expenses", label: "Expenses", section: "Finance & Customers" },
  { key: "/finance/general-ledger", label: "General Ledger", section: "Finance & Customers" },
  { key: "/finance/pricing", label: "Pricing, Discounts & Coupons", section: "Finance & Customers" },
  { key: "/finance/custom-pricing", label: "Custom Material Pricing", section: "Finance & Customers" },
  { key: "/finance/returns", label: "Returns & Refunds", section: "Finance & Customers" },
  { key: "/finance/loyalty", label: "Loyalty Program", section: "Finance & Customers" },
  { key: "/finance/tax-zatca", label: "Invoices & Tax Compliance", section: "Finance & Customers" },

  { key: "/delivery/dashboard", label: "Delivery Dashboard", section: "Delivery" },
  { key: "/delivery/pipeline", label: "Delivery Pipeline", section: "Delivery" },
  { key: "/delivery/orders", label: "Delivery Orders", section: "Delivery" },
  { key: "/delivery/drivers", label: "Driver Assignments", section: "Delivery" },
  { key: "/delivery/vehicles", label: "Vehicle Assignments", section: "Delivery" },
  { key: "/delivery/routes", label: "Delivery Coverage & Routes", section: "Delivery" },
  { key: "/delivery/charges", label: "Delivery Charges", section: "Delivery" },
  { key: "/delivery/movements", label: "Internal Stock Movements", section: "Delivery" },
  { key: "/delivery/logs", label: "Delivery Activity Logs", section: "Delivery" },

  { key: "/hrms/dashboard", label: "HR Dashboard", section: "HRMS" },
  { key: "/hrms/employees", label: "Employees", section: "HRMS" },
  { key: "/hrms/departments", label: "Departments", section: "HRMS" },
  { key: "/hrms/attendance", label: "Shift & Attendance", section: "HRMS" },
  { key: "/hrms/leave", label: "Leave Management", section: "HRMS" },
  { key: "/hrms/documents", label: "Documents & Contracts", section: "HRMS" },
  { key: "/hrms/logs", label: "HR Activity Logs", section: "HRMS" },

  { key: "/network/branches", label: "Branches", section: "Network" },
  { key: "/network/terminals", label: "Terminals", section: "Network" },
  { key: "/network/devices", label: "Devices", section: "Network" },

  { key: "/insights/reports", label: "Reports", section: "Insights" },
  { key: "/insights/bi", label: "Analytics", section: "Insights" },
  { key: "/insights/kpi", label: "KPI Evaluation", section: "Insights" },

  { key: "/admin/overview", label: "Admin Overview", section: "Admin" },
  { key: "/admin/users", label: "Registered Users", section: "Admin" },
  { key: "/admin/roles", label: "Roles & Permissions", section: "Admin" },
  { key: "/admin/rules", label: "Rules Engine", section: "Admin" },
  { key: "/admin/compliance", label: "Compliance", section: "Admin" },
  { key: "/admin/maintenance", label: "Maintenance", section: "Admin" },
  { key: "/admin/pos-settings", label: "POS Settings", section: "Admin" },
  { key: "/admin/zatca-invoices", label: "ZATCA Invoices", section: "Admin" },
  { key: "/admin/zatca-settings", label: "ZATCA Phase 2 Settings", section: "Admin" },
  { key: "/admin/audit-logs", label: "Audit Logs", section: "Admin" },
  { key: "/admin/plans", label: "Subscriptions", section: "Admin" },
  { key: "/admin/settings", label: "General Settings", section: "Admin" },
];
