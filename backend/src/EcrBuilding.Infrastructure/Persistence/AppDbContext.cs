using EcrBuilding.Domain.Common;
using EcrBuilding.Domain.Entities;
using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace EcrBuilding.Infrastructure.Persistence;

// IDataProtectionKeyContext: persists the ZATCA secret-encryption key ring into this same
// database instead of the local filesystem — a file-based ring gets silently destroyed on every
// redeploy that re-clones the app directory, permanently bricking every onboarded branch's
// decrypted ZATCA credentials. The database survives redeploys by construction.
public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options), IDataProtectionKeyContext
{
    public DbSet<Microsoft.AspNetCore.DataProtection.EntityFrameworkCore.DataProtectionKey> DataProtectionKeys => Set<Microsoft.AspNetCore.DataProtection.EntityFrameworkCore.DataProtectionKey>();

    public DbSet<Branch> Branches => Set<Branch>();
    public DbSet<Terminal> Terminals => Set<Terminal>();
    public DbSet<Device> Devices => Set<Device>();
    public DbSet<Role> Roles => Set<Role>();
    public DbSet<RolePermission> RolePermissions => Set<RolePermission>();
    public DbSet<UserPermissionOverride> UserPermissionOverrides => Set<UserPermissionOverride>();
    public DbSet<PermissionsEpoch> PermissionsEpochs => Set<PermissionsEpoch>();
    public DbSet<User> Users => Set<User>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<Setting> Settings => Set<Setting>();
    public DbSet<RuleDefinition> RuleDefinitions => Set<RuleDefinition>();
    public DbSet<ComplianceControl> ComplianceControls => Set<ComplianceControl>();
    public DbSet<MaintenanceTicket> MaintenanceTickets => Set<MaintenanceTicket>();
    public DbSet<Plan> Plans => Set<Plan>();
    public DbSet<CompanySubscription> CompanySubscriptions => Set<CompanySubscription>();
    public DbSet<PlanUsageEntitlement> PlanUsageEntitlements => Set<PlanUsageEntitlement>();

    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<ProductVariantGroup> ProductVariantGroups => Set<ProductVariantGroup>();
    public DbSet<ProductUomConversion> ProductUomConversions => Set<ProductUomConversion>();
    public DbSet<ProductAttribute> ProductAttributes => Set<ProductAttribute>();
    public DbSet<ProductBundle> ProductBundles => Set<ProductBundle>();
    public DbSet<BundleLine> BundleLines => Set<BundleLine>();
    public DbSet<BundleSuggestionEvent> BundleSuggestionEvents => Set<BundleSuggestionEvent>();
    public DbSet<Warehouse> Warehouses => Set<Warehouse>();
    public DbSet<WarehouseBin> WarehouseBins => Set<WarehouseBin>();
    public DbSet<StockLevel> StockLevels => Set<StockLevel>();
    public DbSet<BranchStockLevel> BranchStockLevels => Set<BranchStockLevel>();
    public DbSet<StockBatch> StockBatches => Set<StockBatch>();
    public DbSet<BranchStockBatch> BranchStockBatches => Set<BranchStockBatch>();
    public DbSet<SerializedUnit> SerializedUnits => Set<SerializedUnit>();
    public DbSet<StockTransfer> StockTransfers => Set<StockTransfer>();
    public DbSet<StockTransferLine> StockTransferLines => Set<StockTransferLine>();
    public DbSet<StockAdjustment> StockAdjustments => Set<StockAdjustment>();
    public DbSet<StockAdjustmentLine> StockAdjustmentLines => Set<StockAdjustmentLine>();
    public DbSet<StockMovement> StockMovements => Set<StockMovement>();
    public DbSet<StockCount> StockCounts => Set<StockCount>();
    public DbSet<StockCountLine> StockCountLines => Set<StockCountLine>();
    public DbSet<Supplier> Suppliers => Set<Supplier>();
    public DbSet<PurchaseOrder> PurchaseOrders => Set<PurchaseOrder>();
    public DbSet<PurchaseOrderLine> PurchaseOrderLines => Set<PurchaseOrderLine>();
    public DbSet<ReturnToSupplier> ReturnToSuppliers => Set<ReturnToSupplier>();
    public DbSet<ReturnToSupplierLine> ReturnToSupplierLines => Set<ReturnToSupplierLine>();

    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<CustomerPayment> CustomerPayments => Set<CustomerPayment>();
    public DbSet<SupplierPayment> SupplierPayments => Set<SupplierPayment>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderLine> OrderLines => Set<OrderLine>();
    public DbSet<Remnant> Remnants => Set<Remnant>();
    public DbSet<OrderPayment> OrderPayments => Set<OrderPayment>();
    public DbSet<CashierShift> CashierShifts => Set<CashierShift>();
    public DbSet<CashMovement> CashMovements => Set<CashMovement>();
    public DbSet<PricingRule> PricingRules => Set<PricingRule>();
    public DbSet<OrderFee> OrderFees => Set<OrderFee>();
    public DbSet<ParkedSale> ParkedSales => Set<ParkedSale>();
    public DbSet<ParkedSaleLine> ParkedSaleLines => Set<ParkedSaleLine>();
    public DbSet<Quotation> Quotations => Set<Quotation>();
    public DbSet<QuotationLine> QuotationLines => Set<QuotationLine>();
    public DbSet<ApprovalRequest> ApprovalRequests => Set<ApprovalRequest>();

    public DbSet<Driver> Drivers => Set<Driver>();
    public DbSet<Vehicle> Vehicles => Set<Vehicle>();
    public DbSet<DeliveryZone> DeliveryZones => Set<DeliveryZone>();
    public DbSet<DeliveryOrder> DeliveryOrders => Set<DeliveryOrder>();
    public DbSet<DeliveryOrderLine> DeliveryOrderLines => Set<DeliveryOrderLine>();
    public DbSet<DeliveryHistory> DeliveryHistories => Set<DeliveryHistory>();

    public DbSet<Department> Departments => Set<Department>();
    public DbSet<WorkShift> WorkShifts => Set<WorkShift>();
    public DbSet<Employee> Employees => Set<Employee>();
    public DbSet<Attendance> Attendances => Set<Attendance>();
    public DbSet<Leave> Leaves => Set<Leave>();
    public DbSet<EmployeeDoc> EmployeeDocs => Set<EmployeeDoc>();
    public DbSet<Contract> Contracts => Set<Contract>();

    public DbSet<Account> Accounts => Set<Account>();
    public DbSet<JournalEntry> JournalEntries => Set<JournalEntry>();
    public DbSet<JournalLine> JournalLines => Set<JournalLine>();
    public DbSet<Expense> Expenses => Set<Expense>();
    public DbSet<TaxCode> TaxCodes => Set<TaxCode>();
    public DbSet<Return> Returns => Set<Return>();
    public DbSet<ReturnLine> ReturnLines => Set<ReturnLine>();
    public DbSet<ReturnExchangeLine> ReturnExchangeLines => Set<ReturnExchangeLine>();
    public DbSet<LoyaltyTransaction> LoyaltyTransactions => Set<LoyaltyTransaction>();

    public DbSet<ZatcaIdentity> ZatcaIdentities => Set<ZatcaIdentity>();
    public DbSet<ZatcaSettings> ZatcaSettingsList => Set<ZatcaSettings>();
    public DbSet<ZatcaInvoice> ZatcaInvoices => Set<ZatcaInvoice>();
    public DbSet<PrintJob> PrintJobs => Set<PrintJob>();
    public DbSet<QzCertificate> QzCertificates => Set<QzCertificate>();

    public DbSet<Kpi> Kpis => Set<Kpi>();
    public DbSet<ReportDefinition> ReportDefinitions => Set<ReportDefinition>();
    public DbSet<BiFeed> BiFeeds => Set<BiFeed>();
    public DbSet<SavedDashboardView> SavedDashboardViews => Set<SavedDashboardView>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        foreach (var entityType in modelBuilder.Model.GetEntityTypes())
        {
            foreach (var property in entityType.GetProperties())
            {
                if (property.ClrType.IsEnum || (Nullable.GetUnderlyingType(property.ClrType)?.IsEnum ?? false))
                {
                    // LegacyTolerantEnumConverter, NOT the stock EnumToStringConverter: enum members
                    // stored by an older build must keep deserializing after a rename (via
                    // EnumLegacyAliases) instead of 500-ing every endpoint that touches the table.
                    var converterType = typeof(LegacyTolerantEnumConverter<>).MakeGenericType(
                        Nullable.GetUnderlyingType(property.ClrType) ?? property.ClrType);
                    property.SetValueConverter((ValueConverter?)Activator.CreateInstance(converterType));
                    property.SetMaxLength(64);
                }
                else if (property.ClrType == typeof(decimal) || property.ClrType == typeof(decimal?))
                {
                    property.SetPrecision(18);
                    property.SetScale(4);
                }
            }
        }

        modelBuilder.Entity<Branch>(b =>
        {
            b.HasIndex(x => x.Code).IsUnique();
        });

        modelBuilder.Entity<Terminal>(b =>
        {
            b.HasIndex(x => x.Code).IsUnique();
            b.HasOne(x => x.Branch).WithMany(x => x.Terminals).HasForeignKey(x => x.BranchId);
            b.HasOne(x => x.Operator).WithMany().HasForeignKey(x => x.OperatorUserId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<Device>(b =>
        {
            b.HasIndex(x => x.DeviceCode).IsUnique();
            b.HasOne(x => x.Terminal).WithMany(x => x.Devices).HasForeignKey(x => x.TerminalId);
            b.HasOne(x => x.Branch).WithMany().HasForeignKey(x => x.BranchId);
        });

        modelBuilder.Entity<Role>(b =>
        {
            b.HasIndex(x => x.Name).IsUnique();
            b.Property(x => x.ApprovalCap).HasPrecision(18, 2);
        });

        modelBuilder.Entity<RolePermission>(b =>
        {
            b.Property(x => x.ModuleKey).HasMaxLength(100).IsRequired();
            b.HasIndex(x => new { x.RoleId, x.ModuleKey }).IsUnique();
            b.HasOne(x => x.Role).WithMany(x => x.Permissions).HasForeignKey(x => x.RoleId);
        });

        modelBuilder.Entity<UserPermissionOverride>(b =>
        {
            b.Property(x => x.ModuleKey).HasMaxLength(100).IsRequired();
            b.HasIndex(x => new { x.UserId, x.ModuleKey }).IsUnique();
            b.HasOne(x => x.User).WithMany(x => x.PermissionOverrides).HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<User>(b =>
        {
            b.HasIndex(x => x.Email).IsUnique();
            b.HasOne(x => x.Role).WithMany(x => x.Users).HasForeignKey(x => x.RoleId);
            b.HasOne(x => x.Branch).WithMany().HasForeignKey(x => x.BranchId);
        });

        modelBuilder.Entity<RefreshToken>(b =>
        {
            b.HasOne(x => x.User).WithMany(x => x.RefreshTokens).HasForeignKey(x => x.UserId);
        });

        modelBuilder.Entity<MaintenanceTicket>(b =>
        {
            b.HasIndex(x => x.TicketNo).IsUnique();
            b.HasOne(x => x.Branch).WithMany().HasForeignKey(x => x.BranchId);
        });

        modelBuilder.Entity<Plan>(b =>
        {
            b.Property(x => x.MonthlyPrice).HasPrecision(18, 2);
            b.Property(x => x.YearlyPrice).HasPrecision(18, 2);
        });

        modelBuilder.Entity<CompanySubscription>(b =>
        {
            b.HasOne(x => x.Plan).WithMany().HasForeignKey(x => x.PlanId);
        });

        modelBuilder.Entity<PlanUsageEntitlement>(b =>
        {
            b.Property(x => x.OverageRate).HasPrecision(18, 2);
            b.HasOne(x => x.Subscription).WithMany().HasForeignKey(x => x.SubscriptionId);
        });

        modelBuilder.Entity<Category>(b =>
        {
            b.HasIndex(x => x.Code).IsUnique();
            b.HasOne(x => x.Parent).WithMany().HasForeignKey(x => x.ParentId);
        });

        modelBuilder.Entity<Product>(b =>
        {
            b.HasIndex(x => x.Sku).IsUnique();
            b.HasOne(x => x.Category).WithMany(x => x.Products).HasForeignKey(x => x.CategoryId);
            // SetNull: deleting/archiving a variant group must never touch its variant SKUs.
            b.HasOne(x => x.VariantGroup).WithMany(x => x.Variants).HasForeignKey(x => x.VariantGroupId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<ProductVariantGroup>(b =>
        {
            b.HasIndex(x => x.Code).IsUnique();
            b.HasOne(x => x.Category).WithMany().HasForeignKey(x => x.CategoryId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<ProductUomConversion>(b =>
        {
            b.HasOne(x => x.Product).WithMany(x => x.UomConversions).HasForeignKey(x => x.ProductId);
            // One factor per (product, UOM) — a second "Pallet" row for the same product would make
            // FactorToStock resolution ambiguous.
            b.HasIndex(x => new { x.ProductId, x.Uom }).IsUnique();
        });

        modelBuilder.Entity<ProductAttribute>(b =>
        {
            b.HasOne(x => x.Product).WithMany(x => x.Attributes).HasForeignKey(x => x.ProductId);
            b.HasIndex(x => new { x.ProductId, x.Name }).IsUnique();
        });

        modelBuilder.Entity<ProductBundle>(b =>
        {
            b.HasIndex(x => x.Code).IsUnique();
        });

        modelBuilder.Entity<BundleLine>(b =>
        {
            b.HasOne(x => x.Bundle).WithMany(x => x.Lines).HasForeignKey(x => x.BundleId);
            b.HasOne(x => x.Product).WithMany().HasForeignKey(x => x.ProductId);
        });

        modelBuilder.Entity<BundleSuggestionEvent>(b =>
        {
            b.HasOne(x => x.Bundle).WithMany().HasForeignKey(x => x.BundleId);
            // The Suggestion Report groups by BundleId + EventType within a date window — this is
            // the query shape the index needs to actually support (unlike AuditLogs, which has none).
            b.HasIndex(x => new { x.BundleId, x.EventType, x.CreatedAt });
        });

        modelBuilder.Entity<Warehouse>(b =>
        {
            b.HasIndex(x => x.Code).IsUnique();
            b.HasOne(x => x.Branch).WithMany().HasForeignKey(x => x.BranchId);
        });

        modelBuilder.Entity<WarehouseBin>(b =>
        {
            b.HasOne(x => x.Warehouse).WithMany(x => x.Bins).HasForeignKey(x => x.WarehouseId);
        });

        modelBuilder.Entity<StockLevel>(b =>
        {
            b.HasIndex(x => new { x.ProductId, x.WarehouseId }).IsUnique();
            b.HasOne(x => x.Product).WithMany(x => x.StockLevels).HasForeignKey(x => x.ProductId);
            b.HasOne(x => x.Warehouse).WithMany().HasForeignKey(x => x.WarehouseId);
            b.Ignore(x => x.Available);
        });

        modelBuilder.Entity<BranchStockLevel>(b =>
        {
            b.HasIndex(x => new { x.ProductId, x.BranchId }).IsUnique();
            b.HasOne(x => x.Product).WithMany(x => x.BranchStockLevels).HasForeignKey(x => x.ProductId);
            b.HasOne(x => x.Branch).WithMany(x => x.StockLevels).HasForeignKey(x => x.BranchId);
            b.Ignore(x => x.Available);
        });

        modelBuilder.Entity<StockBatch>(b =>
        {
            b.HasOne(x => x.Product).WithMany().HasForeignKey(x => x.ProductId);
            b.HasOne(x => x.Warehouse).WithMany().HasForeignKey(x => x.WarehouseId);
        });

        modelBuilder.Entity<StockTransfer>(b =>
        {
            b.HasIndex(x => x.TransferNo).IsUnique();
            b.HasOne(x => x.FromWarehouse).WithMany().HasForeignKey(x => x.FromWarehouseId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.ToWarehouse).WithMany().HasForeignKey(x => x.ToWarehouseId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.FromBranch).WithMany().HasForeignKey(x => x.FromBranchId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.ToBranch).WithMany().HasForeignKey(x => x.ToBranchId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<StockTransferLine>(b =>
        {
            b.HasOne(x => x.Transfer).WithMany(x => x.Lines).HasForeignKey(x => x.TransferId);
            b.HasOne(x => x.Product).WithMany().HasForeignKey(x => x.ProductId);
        });

        modelBuilder.Entity<StockAdjustment>(b =>
        {
            b.HasOne(x => x.Warehouse).WithMany().HasForeignKey(x => x.WarehouseId);
        });

        modelBuilder.Entity<StockAdjustmentLine>(b =>
        {
            b.HasOne(x => x.Adjustment).WithMany(x => x.Lines).HasForeignKey(x => x.AdjustmentId);
            b.HasOne(x => x.Product).WithMany().HasForeignKey(x => x.ProductId);
            b.Ignore(x => x.Variance);
        });

        modelBuilder.Entity<StockCount>(b =>
        {
            b.HasIndex(x => x.CountNo).IsUnique();
            b.HasOne(x => x.Warehouse).WithMany().HasForeignKey(x => x.WarehouseId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.Category).WithMany().HasForeignKey(x => x.CategoryId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.CountedBy).WithMany().HasForeignKey(x => x.CountedByUserId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.ReviewedBy).WithMany().HasForeignKey(x => x.ReviewedByUserId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.ApprovedBy).WithMany().HasForeignKey(x => x.ApprovedByUserId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.RejectedBy).WithMany().HasForeignKey(x => x.RejectedByUserId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.StockAdjustment).WithMany().HasForeignKey(x => x.StockAdjustmentId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<StockCountLine>(b =>
        {
            b.HasOne(x => x.StockCount).WithMany(x => x.Lines).HasForeignKey(x => x.StockCountId);
            b.HasOne(x => x.Product).WithMany().HasForeignKey(x => x.ProductId);
            b.Ignore(x => x.Variance);
            b.Ignore(x => x.VarianceValue);
        });

        modelBuilder.Entity<Supplier>(b =>
        {
            b.HasIndex(x => x.Code).IsUnique();
        });

        modelBuilder.Entity<PurchaseOrder>(b =>
        {
            b.HasIndex(x => x.PoNo).IsUnique();
            b.HasOne(x => x.Supplier).WithMany().HasForeignKey(x => x.SupplierId);
        });

        modelBuilder.Entity<PurchaseOrderLine>(b =>
        {
            b.HasOne(x => x.PurchaseOrder).WithMany(x => x.Lines).HasForeignKey(x => x.PurchaseOrderId);
            b.HasOne(x => x.Product).WithMany().HasForeignKey(x => x.ProductId);
            b.HasOne(x => x.Branch).WithMany().HasForeignKey(x => x.BranchId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.Warehouse).WithMany().HasForeignKey(x => x.WarehouseId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<ReturnToSupplier>(b =>
        {
            b.HasIndex(x => x.RtsNo).IsUnique();
            b.HasOne(x => x.Supplier).WithMany().HasForeignKey(x => x.SupplierId);
            b.HasOne(x => x.PurchaseOrder).WithMany().HasForeignKey(x => x.PurchaseOrderId);
            b.HasOne(x => x.Branch).WithMany().HasForeignKey(x => x.BranchId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.Warehouse).WithMany().HasForeignKey(x => x.WarehouseId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<ReturnToSupplierLine>(b =>
        {
            b.HasOne(x => x.ReturnToSupplier).WithMany(x => x.Lines).HasForeignKey(x => x.ReturnToSupplierId);
            b.HasOne(x => x.Product).WithMany().HasForeignKey(x => x.ProductId);
        });

        modelBuilder.Entity<Order>(b =>
        {
            b.HasIndex(x => x.OrderNo).IsUnique();
            b.HasOne(x => x.Branch).WithMany().HasForeignKey(x => x.BranchId);
            b.HasOne(x => x.Terminal).WithMany().HasForeignKey(x => x.TerminalId);
            b.HasOne(x => x.Cashier).WithMany().HasForeignKey(x => x.CashierUserId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.Customer).WithMany().HasForeignKey(x => x.CustomerId);
            // Module 10 offline replay: one order per client idempotency key. Length-capped so the
            // unique index fits MySQL's key limit; nulls (online sales) are exempt from uniqueness.
            b.Property(x => x.ClientRequestId).HasMaxLength(64);
            b.HasIndex(x => x.ClientRequestId).IsUnique();
        });

        modelBuilder.Entity<OrderLine>(b =>
        {
            b.HasOne(x => x.Order).WithMany(x => x.Lines).HasForeignKey(x => x.OrderId);
            b.HasOne(x => x.Product).WithMany().HasForeignKey(x => x.ProductId);
            b.HasOne(x => x.ConsumedRemnant).WithMany().HasForeignKey(x => x.ConsumedRemnantId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Remnant>(b =>
        {
            b.HasOne(x => x.Product).WithMany().HasForeignKey(x => x.ProductId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.Branch).WithMany().HasForeignKey(x => x.BranchId).OnDelete(DeleteBehavior.Restrict);
            // Restrict, not Cascade: VoidLine deletes a still-untouched remnant itself before removing
            // its source OrderLine (see OrdersController.VoidLine) rather than relying on cascade.
            b.HasOne(x => x.SourceOrderLine).WithMany().HasForeignKey(x => x.SourceOrderLineId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<OrderPayment>(b =>
        {
            b.HasOne(x => x.Order).WithMany(x => x.Payments).HasForeignKey(x => x.OrderId);
        });

        modelBuilder.Entity<OrderFee>(b =>
        {
            b.HasOne(x => x.Order).WithMany(x => x.Fees).HasForeignKey(x => x.OrderId);
        });

        modelBuilder.Entity<ParkedSale>(b =>
        {
            b.HasIndex(x => x.TicketNo).IsUnique();
            b.HasOne(x => x.Branch).WithMany().HasForeignKey(x => x.BranchId);
            b.HasOne(x => x.Terminal).WithMany().HasForeignKey(x => x.TerminalId);
            b.HasOne(x => x.Cashier).WithMany().HasForeignKey(x => x.CashierUserId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.Customer).WithMany().HasForeignKey(x => x.CustomerId);
        });

        modelBuilder.Entity<ParkedSaleLine>(b =>
        {
            b.HasOne(x => x.ParkedSale).WithMany(x => x.Lines).HasForeignKey(x => x.ParkedSaleId);
            b.HasOne(x => x.Product).WithMany().HasForeignKey(x => x.ProductId);
        });

        modelBuilder.Entity<Quotation>(b =>
        {
            b.HasIndex(x => x.QuoteNo).IsUnique();
            b.HasOne(x => x.Branch).WithMany().HasForeignKey(x => x.BranchId);
            b.HasOne(x => x.Customer).WithMany().HasForeignKey(x => x.CustomerId);
            b.HasOne(x => x.CreatedBy).WithMany().HasForeignKey(x => x.CreatedByUserId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.ConvertedOrder).WithMany().HasForeignKey(x => x.ConvertedOrderId);
        });

        modelBuilder.Entity<QuotationLine>(b =>
        {
            b.HasOne(x => x.Quotation).WithMany(x => x.Lines).HasForeignKey(x => x.QuotationId);
            b.HasOne(x => x.Product).WithMany().HasForeignKey(x => x.ProductId);
        });

        modelBuilder.Entity<ApprovalRequest>(b =>
        {
            b.HasOne(x => x.Branch).WithMany().HasForeignKey(x => x.BranchId);
            b.HasOne(x => x.RequestedBy).WithMany().HasForeignKey(x => x.RequestedByUserId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.Approver).WithMany().HasForeignKey(x => x.ApproverUserId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.RelatedOrder).WithMany().HasForeignKey(x => x.RelatedOrderId);
            b.HasOne(x => x.RelatedDeliveryOrder).WithMany().HasForeignKey(x => x.RelatedDeliveryOrderId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.RelatedOrderLine).WithMany().HasForeignKey(x => x.RelatedOrderLineId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<SerializedUnit>(b =>
        {
            b.HasIndex(x => new { x.ProductId, x.SerialNo }).IsUnique();
            b.HasOne(x => x.Product).WithMany().HasForeignKey(x => x.ProductId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.Branch).WithMany().HasForeignKey(x => x.BranchId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.SoldOrder).WithMany().HasForeignKey(x => x.SoldOrderId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.SoldOrderLine).WithMany().HasForeignKey(x => x.SoldOrderLineId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<CashierShift>(b =>
        {
            b.HasOne(x => x.Terminal).WithMany().HasForeignKey(x => x.TerminalId);
            b.HasOne(x => x.Cashier).WithMany().HasForeignKey(x => x.CashierUserId).OnDelete(DeleteBehavior.Restrict);
            b.Ignore(x => x.ExpectedCash);
            b.Ignore(x => x.Variance);
        });

        modelBuilder.Entity<Driver>(b =>
        {
            b.HasOne(x => x.Branch).WithMany().HasForeignKey(x => x.BranchId);
            b.HasOne(x => x.Vehicle).WithMany().HasForeignKey(x => x.VehicleId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<Vehicle>(b =>
        {
            b.HasIndex(x => x.Registration).IsUnique();
            b.HasOne(x => x.Branch).WithMany().HasForeignKey(x => x.BranchId);
        });

        modelBuilder.Entity<DeliveryOrder>(b =>
        {
            b.HasIndex(x => x.DeliveryNo).IsUnique();
            b.HasOne(x => x.Order).WithMany().HasForeignKey(x => x.OrderId);
            b.HasOne(x => x.Customer).WithMany().HasForeignKey(x => x.CustomerId);
            b.HasOne(x => x.Branch).WithMany().HasForeignKey(x => x.BranchId);
            b.HasOne(x => x.Driver).WithMany().HasForeignKey(x => x.DriverId);
            b.HasOne(x => x.Vehicle).WithMany().HasForeignKey(x => x.VehicleId);
            b.HasOne(x => x.SourceDeliveryOrder).WithMany().HasForeignKey(x => x.SourceDeliveryOrderId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<DeliveryOrderLine>(b =>
        {
            b.HasOne(x => x.DeliveryOrder).WithMany(x => x.Lines).HasForeignKey(x => x.DeliveryOrderId);
            b.HasOne(x => x.Product).WithMany().HasForeignKey(x => x.ProductId);
        });

        modelBuilder.Entity<DeliveryHistory>(b =>
        {
            b.HasOne(x => x.DeliveryOrder).WithMany(x => x.History).HasForeignKey(x => x.DeliveryOrderId);
            b.HasOne(x => x.By).WithMany().HasForeignKey(x => x.ByUserId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Department>(b =>
        {
            b.HasIndex(x => x.Code).IsUnique();
            b.HasOne(x => x.ManagerEmployee).WithMany().HasForeignKey(x => x.ManagerEmployeeId).OnDelete(DeleteBehavior.SetNull);
            b.HasOne(x => x.Parent).WithMany().HasForeignKey(x => x.ParentId);
        });

        modelBuilder.Entity<Employee>(b =>
        {
            b.HasOne(x => x.Department).WithMany().HasForeignKey(x => x.DepartmentId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.Branch).WithMany().HasForeignKey(x => x.BranchId);
            b.HasOne(x => x.Shift).WithMany().HasForeignKey(x => x.ShiftId);
            b.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId);
            b.HasOne(x => x.ReportingManager).WithMany().HasForeignKey(x => x.ReportingManagerId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Attendance>(b =>
        {
            b.HasOne(x => x.Employee).WithMany().HasForeignKey(x => x.EmployeeId);
            b.HasOne(x => x.Shift).WithMany().HasForeignKey(x => x.ShiftId);
        });

        modelBuilder.Entity<Leave>(b =>
        {
            b.HasOne(x => x.Employee).WithMany().HasForeignKey(x => x.EmployeeId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.HandoverTo).WithMany().HasForeignKey(x => x.HandoverToEmployeeId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.Approver).WithMany().HasForeignKey(x => x.ApproverEmployeeId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<EmployeeDoc>(b =>
        {
            b.HasOne(x => x.Employee).WithMany().HasForeignKey(x => x.EmployeeId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.VerifiedBy).WithMany().HasForeignKey(x => x.VerifiedByEmployeeId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Contract>(b =>
        {
            b.HasOne(x => x.Employee).WithMany().HasForeignKey(x => x.EmployeeId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.Department).WithMany().HasForeignKey(x => x.DepartmentId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.Branch).WithMany().HasForeignKey(x => x.BranchId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.SupersededBy).WithMany().HasForeignKey(x => x.SupersededByContractId);
        });

        modelBuilder.Entity<Account>(b =>
        {
            b.HasIndex(x => x.Code).IsUnique();
            b.HasOne(x => x.Parent).WithMany().HasForeignKey(x => x.ParentId);
        });

        modelBuilder.Entity<JournalLine>(b =>
        {
            b.HasOne(x => x.JournalEntry).WithMany(x => x.Lines).HasForeignKey(x => x.JournalEntryId);
            b.HasOne(x => x.Account).WithMany().HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Expense>(b =>
        {
            b.HasIndex(x => x.ExpenseNo).IsUnique();
            b.HasOne(x => x.Branch).WithMany().HasForeignKey(x => x.BranchId);
        });

        modelBuilder.Entity<TaxCode>(b =>
        {
            b.HasIndex(x => x.Code).IsUnique();
            b.HasOne(x => x.GlAccount).WithMany().HasForeignKey(x => x.GlAccountId);
        });

        modelBuilder.Entity<Customer>(b =>
        {
            // FK name doesn't follow the {Navigation}Id convention (navigation is AccountManager,
            // column is AccountManagerUserId) — mapped explicitly. Restrict: deleting a staff user
            // must never cascade-delete the customers they managed.
            b.HasOne(x => x.AccountManager).WithMany().HasForeignKey(x => x.AccountManagerUserId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Return>(b =>
        {
            b.HasIndex(x => x.ReturnNo).IsUnique();
            b.HasOne(x => x.Order).WithMany().HasForeignKey(x => x.OrderId);
            b.HasOne(x => x.Customer).WithMany().HasForeignKey(x => x.CustomerId);
            b.HasOne(x => x.ApprovedBy).WithMany().HasForeignKey(x => x.ApprovedByUserId);
            // Exchange workflow (BRD §3.2.1): the replacement sale this return nets against.
            b.HasOne(x => x.ExchangeOrder).WithMany().HasForeignKey(x => x.ExchangeOrderId);
        });

        modelBuilder.Entity<ReturnLine>(b =>
        {
            b.HasOne(x => x.Return).WithMany(x => x.Lines).HasForeignKey(x => x.ReturnId);
            b.HasOne(x => x.Product).WithMany().HasForeignKey(x => x.ProductId);
            // Per-original-order-line drawdown accounting (BRD §3.2.1 partial returns) — indexed
            // because every preview/create sums prior returns grouped by this column.
            b.HasIndex(x => x.OrderLineId);
        });

        modelBuilder.Entity<LoyaltyTransaction>(b =>
        {
            b.HasOne(x => x.Customer).WithMany().HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.Order).WithMany().HasForeignKey(x => x.OrderId);
            b.HasOne(x => x.Branch).WithMany().HasForeignKey(x => x.BranchId);
            b.HasOne(x => x.CreatedByUser).WithMany().HasForeignKey(x => x.CreatedByUserId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<ZatcaSettings>(b =>
        {
            b.HasIndex(x => x.BranchId).IsUnique();
            b.HasOne(x => x.Branch).WithMany().HasForeignKey(x => x.BranchId);
        });

        modelBuilder.Entity<ZatcaIdentity>(b =>
        {
            b.HasIndex(x => x.BranchId).IsUnique();
            b.HasOne(x => x.Branch).WithMany().HasForeignKey(x => x.BranchId);
        });

        modelBuilder.Entity<ZatcaInvoice>(b =>
        {
            b.HasIndex(x => x.InvoiceNumber).IsUnique();
            b.HasOne(x => x.Order).WithMany().HasForeignKey(x => x.OrderId);
        });

        modelBuilder.Entity<PrintJob>(b =>
        {
            b.HasOne(x => x.Terminal).WithMany().HasForeignKey(x => x.TerminalId);
            b.HasOne(x => x.Order).WithMany().HasForeignKey(x => x.OrderId);
        });

        base.OnModelCreating(modelBuilder);
    }

    public override int SaveChanges()
    {
        TouchTimestamps();
        return base.SaveChanges();
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        TouchTimestamps();
        return base.SaveChangesAsync(cancellationToken);
    }

    private void TouchTimestamps()
    {
        foreach (var entry in ChangeTracker.Entries<BaseEntity>())
        {
            if (entry.State == EntityState.Added)
            {
                entry.Entity.CreatedAt = DateTime.UtcNow;
                entry.Entity.UpdatedAt = DateTime.UtcNow;
            }
            else if (entry.State == EntityState.Modified)
            {
                entry.Entity.UpdatedAt = DateTime.UtcNow;
            }
        }
    }
}
