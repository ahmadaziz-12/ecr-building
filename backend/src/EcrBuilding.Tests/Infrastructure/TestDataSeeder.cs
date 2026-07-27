using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Auth;
using EcrBuilding.Infrastructure.Persistence;

namespace EcrBuilding.Tests.Infrastructure;

/// <summary>
/// Minimal, fast, hand-authored fixtures for integration tests — deliberately not a reuse of
/// DbSeeder.cs, which seeds a full realistic production dataset that's overkill (and slower) for a
/// single test's needs. Each helper here is additive: call only the ones a given test actually needs.
/// </summary>
public static class TestDataSeeder
{
    public const string DefaultPassword = "Test1234!";

    public static Branch AddBranch(AppDbContext db, string code = "BR1", string name = "Main Branch")
    {
        var branch = new Branch { Code = code, NameEn = name, City = "Riyadh", Status = EntityStatus.Active };
        db.Branches.Add(branch);
        db.SaveChanges();
        return branch;
    }

    /// <summary>Creates a role with Full access on every module listed in <paramref name="fullAccessModules"/>.</summary>
    public static Role AddRole(AppDbContext db, string name, decimal approvalCap = 0, params ModuleArea[] fullAccessModules)
    {
        var role = new Role { Name = name, ApprovalCap = approvalCap, Status = EntityStatus.Active };
        foreach (var module in fullAccessModules)
        {
            role.Permissions.Add(new RolePermission { Module = module, Level = AccessLevel.Full });
        }
        db.Roles.Add(role);
        db.SaveChanges();
        return role;
    }

    /// <summary>Creates a role with an explicit AccessLevel per module — use when a test needs
    /// something other than Full (e.g. Delivery:Edit to exercise the request/approve split).</summary>
    public static Role AddRoleWithLevels(AppDbContext db, string name, params (ModuleArea Module, AccessLevel Level)[] permissions)
    {
        var role = new Role { Name = name, Status = EntityStatus.Active };
        foreach (var (module, level) in permissions)
        {
            role.Permissions.Add(new RolePermission { Module = module, Level = level });
        }
        db.Roles.Add(role);
        db.SaveChanges();
        return role;
    }

    public static User AddUser(AppDbContext db, Role role, string email, string name = "Test User", int? branchId = null, string password = DefaultPassword)
    {
        var user = new User
        {
            Name = name,
            Email = email,
            PasswordHash = new PasswordHasher().Hash(password),
            RoleId = role.Id,
            Role = role,
            BranchId = branchId,
            Status = UserStatus.Active,
        };
        db.Users.Add(user);
        db.SaveChanges();
        return user;
    }

    public static Category AddCategory(AppDbContext db, string code = "CEM", string nameEn = "Cement & Binders", string defaultUom = "Bag")
    {
        var category = new Category { Code = code, NameEn = nameEn, DefaultUom = defaultUom, Status = EntityStatus.Active };
        db.Categories.Add(category);
        db.SaveChanges();
        return category;
    }

    public static Product AddProduct(
        AppDbContext db,
        Category category,
        string sku = "CEM-001",
        string nameEn = "Portland Cement 50kg",
        decimal sellingPrice = 28.50m,
        decimal vatRate = 0.15m,
        string stockUom = "Bag",
        bool isCutToSize = false)
    {
        var product = new Product
        {
            Sku = sku,
            NameEn = nameEn,
            CategoryId = category.Id,
            SellingPrice = sellingPrice,
            VatRate = vatRate,
            StockUom = stockUom,
            IsCutToSize = isCutToSize,
            Status = EntityStatus.Active,
        };
        db.Products.Add(product);
        db.SaveChanges();
        return product;
    }

    /// <summary>"1 {uom} = {factorToStock} {product.StockUom}" — e.g. AddUomConversion(db, cement, "Pallet", 50).</summary>
    public static ProductUomConversion AddUomConversion(AppDbContext db, Product product, string uom, decimal factorToStock)
    {
        var conversion = new ProductUomConversion { ProductId = product.Id, Uom = uom, FactorToStock = factorToStock };
        db.ProductUomConversions.Add(conversion);
        db.SaveChanges();
        return conversion;
    }

    public static BranchStockLevel AddBranchStock(AppDbContext db, Product product, Branch branch, decimal onHand = 1_000m)
    {
        var stock = new BranchStockLevel { ProductId = product.Id, BranchId = branch.Id, OnHand = onHand };
        db.BranchStockLevels.Add(stock);
        db.SaveChanges();
        return stock;
    }

    public static Warehouse AddWarehouse(AppDbContext db, Branch branch, string code = "WH1", string name = "Main Yard")
    {
        var warehouse = new Warehouse { Code = code, Name = name, BranchId = branch.Id, Type = WarehouseType.MainYard };
        db.Warehouses.Add(warehouse);
        db.SaveChanges();
        return warehouse;
    }

    /// <summary>
    /// Seeds the 3 GL account codes OrdersController.Checkout always posts a completed sale to
    /// (1000 cash/AR, 4000 revenue, 2100 VAT payable) — any test that completes a real checkout needs
    /// these, or GlPostingService throws "Unknown GL account code" and the sale never becomes Completed.
    /// </summary>
    public static void AddStandardGlAccounts(AppDbContext db)
    {
        db.Accounts.AddRange(
            new Account { Code = "1000", Name = "Cash / Accounts Receivable", Type = AccountType.Asset },
            new Account { Code = "4000", Name = "Sales Revenue", Type = AccountType.Revenue },
            new Account { Code = "2100", Name = "VAT Payable", Type = AccountType.Liability });
        db.SaveChanges();
    }

    public static DeliveryZone AddDeliveryZone(AppDbContext db, string name = "Zone A", string city = "Riyadh", decimal distanceKm = 10m, decimal fee = 50m)
    {
        var zone = new DeliveryZone { Name = name, City = city, DistanceKm = distanceKm, Fee = fee };
        db.DeliveryZones.Add(zone);
        db.SaveChanges();
        return zone;
    }

    public static DeliveryOrder AddDeliveryOrder(AppDbContext db, Branch branch, string deliveryNo = "DO-TEST-0001", DeliveryStage stage = DeliveryStage.Pending)
    {
        var order = new DeliveryOrder
        {
            DeliveryNo = deliveryNo, BranchId = branch.Id, Stage = stage, Area = "Test Area",
            ContactName = "Test Contact", ContactMobile = "0500000000", City = "Riyadh", PromisedDate = DateTime.UtcNow.AddDays(1), PromisedTime = "09:00",
        };
        db.DeliveryOrders.Add(order);
        db.SaveChanges();
        return order;
    }

    public static Customer AddCustomer(
        AppDbContext db,
        string nameEn = "Al-Nasser Contracting Co.",
        CustomerType type = CustomerType.Contractor,
        decimal creditLimit = 50_000m,
        decimal outstanding = 0m)
    {
        var customer = new Customer
        {
            NameEn = nameEn,
            Type = type,
            CreditLimit = creditLimit,
            Outstanding = outstanding,
            Status = EntityStatus.Active,
        };
        db.Customers.Add(customer);
        db.SaveChanges();
        return customer;
    }
}
