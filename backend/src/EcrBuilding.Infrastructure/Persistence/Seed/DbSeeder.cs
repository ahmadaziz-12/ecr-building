using EcrBuilding.Application.Abstractions;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Infrastructure.Persistence.Seed;

// Demo credentials — all seeded users share this password; printed to console on first seed.
public static class DbSeeder
{
    public const string DemoPassword = "Passw0rd!";

    public static async Task SeedAsync(AppDbContext db, IPasswordHasher hasher)
    {
        await db.Database.MigrateAsync();

        if (!await db.Branches.AnyAsync())
        {
            await SeedBranchesTerminalsDevicesAsync(db);
        }

        if (!await db.Roles.AnyAsync())
        {
            await SeedRolesAsync(db);
        }

        if (!await db.Users.AnyAsync())
        {
            await SeedUsersAsync(db, hasher);
        }

        if (!await db.Plans.AnyAsync())
        {
            await SeedPlansAsync(db);
        }

        if (!await db.RuleDefinitions.AnyAsync())
        {
            await SeedRulesComplianceMaintenanceAsync(db);
        }

        if (!await db.Settings.AnyAsync())
        {
            await SeedSettingsAsync(db);
        }

        if (!await db.Categories.AnyAsync())
        {
            await SeedCatalogAndInventoryAsync(db);
        }

        if (!await db.Customers.AnyAsync())
        {
            await SeedPosDataAsync(db);
        }

        if (!await db.Drivers.AnyAsync())
        {
            await SeedDeliveryDataAsync(db);
        }

        if (!await db.Departments.AnyAsync())
        {
            await SeedHrDataAsync(db);
        }

        if (!await db.Accounts.AnyAsync())
        {
            await SeedFinanceDataAsync(db);
        }

        if (!await db.ZatcaSettingsList.AnyAsync())
        {
            await SeedZatcaAndPrintingAsync(db);
        }

        if (!await db.Kpis.AnyAsync())
        {
            await SeedInsightsDataAsync(db);
        }
    }

    private static async Task SeedBranchesTerminalsDevicesAsync(AppDbContext db)
    {
        var branches = new[]
        {
            new Branch
            {
                Code = "BR-RUH-01", NameEn = "Riyadh Main Yard", NameAr = "الرياض - الفرع الرئيسي",
                City = "Riyadh", Address = "Al Kharj Rd, Riyadh", BusinessHours = "07:00 - 22:00",
                VatRegistrationNumber = "300000000000003", ManagerName = "Faisal Al-Otaibi", Warehouse = "WH-RUH-01",
            },
            new Branch
            {
                Code = "BR-JED-01", NameEn = "Jeddah Industrial Branch", NameAr = "جدة - الفرع الصناعي",
                City = "Jeddah", Address = "Industrial City, Jeddah", BusinessHours = "07:00 - 22:00",
                VatRegistrationNumber = "300000000000004", ManagerName = "Mona Al-Harbi", Warehouse = "WH-JED-01",
            },
        };
        db.Branches.AddRange(branches);
        await db.SaveChangesAsync();

        foreach (var branch in branches)
        {
            var terminal = new Terminal
            {
                Code = $"TRM-{branch.Code}-01",
                Name = $"{branch.NameEn} - Till 1",
                BranchId = branch.Id,
                Type = TerminalType.Fixed,
                Status = TerminalStatus.Online,
                IpAddress = "192.168.1.10",
                MacAddress = "00:1B:44:11:3A:B7",
                LastSyncAt = DateTime.UtcNow,
            };
            db.Terminals.Add(terminal);
            await db.SaveChangesAsync();

            db.Devices.AddRange(
                new Device
                {
                    DeviceCode = $"{terminal.Code}-PRN", Type = DeviceType.ReceiptPrinter, Model = "Epson TM-T88VI",
                    Serial = $"SN-{terminal.Code}-PRN", TerminalId = terminal.Id, Connection = DeviceConnection.Usb,
                    Status = DeviceStatus.Healthy, LastTestAt = DateTime.UtcNow,
                },
                new Device
                {
                    DeviceCode = $"{terminal.Code}-SCN", Type = DeviceType.BarcodeScanner, Model = "Honeywell Voyager 1200g",
                    Serial = $"SN-{terminal.Code}-SCN", TerminalId = terminal.Id, Connection = DeviceConnection.Usb,
                    Status = DeviceStatus.Healthy, LastTestAt = DateTime.UtcNow,
                },
                new Device
                {
                    DeviceCode = $"{terminal.Code}-DRW", Type = DeviceType.CashDrawer, Model = "APG Vasario 1616",
                    Serial = $"SN-{terminal.Code}-DRW", TerminalId = terminal.Id, Connection = DeviceConnection.Usb,
                    Status = DeviceStatus.Healthy, LastTestAt = DateTime.UtcNow,
                });
        }
        await db.SaveChangesAsync();
    }

    private static async Task SeedRolesAsync(AppDbContext db)
    {
        var definitions = new (string Name, string Description, decimal ApprovalCap, Dictionary<ModuleArea, AccessLevel> Levels)[]
        {
            ("Owner", "Full access across every module.", 999_999m, AllModules(AccessLevel.Full)),
            ("Admin", "Manages users, settings, network and compliance.", 100_000m, AdminLevels()),
            ("Branch Manager", "Runs day-to-day branch operations.", 20_000m, new Dictionary<ModuleArea, AccessLevel>
            {
                [ModuleArea.Pos] = AccessLevel.Edit,
                [ModuleArea.Orders] = AccessLevel.Edit,
                [ModuleArea.Inventory] = AccessLevel.Edit,
                [ModuleArea.Delivery] = AccessLevel.Edit,
                [ModuleArea.Suppliers] = AccessLevel.Edit,
                [ModuleArea.Insights] = AccessLevel.View,
                [ModuleArea.Finance] = AccessLevel.View,
                [ModuleArea.Hr] = AccessLevel.View,
                [ModuleArea.Network] = AccessLevel.View,
                [ModuleArea.Admin] = AccessLevel.None,
            }),
            ("Cashier", "Runs the point-of-sale register.", 500m, new Dictionary<ModuleArea, AccessLevel>
            {
                [ModuleArea.Pos] = AccessLevel.Full,
                [ModuleArea.Orders] = AccessLevel.Edit,
                [ModuleArea.Inventory] = AccessLevel.View,
                [ModuleArea.Delivery] = AccessLevel.None,
                [ModuleArea.Suppliers] = AccessLevel.None,
                [ModuleArea.Insights] = AccessLevel.None,
                [ModuleArea.Finance] = AccessLevel.None,
                [ModuleArea.Hr] = AccessLevel.None,
                // View-only — needed to see the terminal's paired receipt printer in POS Checkout's
                // Printer Setup dialog; cashiers still can't manage branches/terminals/devices.
                [ModuleArea.Network] = AccessLevel.View,
                [ModuleArea.Admin] = AccessLevel.None,
            }),
            ("Warehouse Staff", "Manages stock, transfers and receiving.", 0m, new Dictionary<ModuleArea, AccessLevel>
            {
                [ModuleArea.Inventory] = AccessLevel.Edit,
                [ModuleArea.Suppliers] = AccessLevel.Edit,
                [ModuleArea.Orders] = AccessLevel.View,
                [ModuleArea.Pos] = AccessLevel.None,
                [ModuleArea.Delivery] = AccessLevel.View,
                [ModuleArea.Insights] = AccessLevel.None,
                [ModuleArea.Finance] = AccessLevel.None,
                [ModuleArea.Hr] = AccessLevel.None,
                [ModuleArea.Network] = AccessLevel.None,
                [ModuleArea.Admin] = AccessLevel.None,
            }),
            ("Delivery Driver", "Executes assigned delivery orders.", 0m, new Dictionary<ModuleArea, AccessLevel>
            {
                [ModuleArea.Delivery] = AccessLevel.Edit,
                [ModuleArea.Orders] = AccessLevel.View,
                [ModuleArea.Pos] = AccessLevel.None,
                [ModuleArea.Inventory] = AccessLevel.None,
                [ModuleArea.Suppliers] = AccessLevel.None,
                [ModuleArea.Insights] = AccessLevel.None,
                [ModuleArea.Finance] = AccessLevel.None,
                [ModuleArea.Hr] = AccessLevel.None,
                [ModuleArea.Network] = AccessLevel.None,
                [ModuleArea.Admin] = AccessLevel.None,
            }),
            ("HR Officer", "Manages employees, attendance and leave.", 5_000m, new Dictionary<ModuleArea, AccessLevel>
            {
                [ModuleArea.Hr] = AccessLevel.Full,
                [ModuleArea.Admin] = AccessLevel.View,
                [ModuleArea.Delivery] = AccessLevel.View,
                [ModuleArea.Pos] = AccessLevel.None,
                [ModuleArea.Orders] = AccessLevel.None,
                [ModuleArea.Inventory] = AccessLevel.None,
                [ModuleArea.Suppliers] = AccessLevel.None,
                [ModuleArea.Insights] = AccessLevel.None,
                [ModuleArea.Finance] = AccessLevel.None,
                [ModuleArea.Network] = AccessLevel.None,
            }),
            ("Accountant", "Owns finance, tax and reporting.", 50_000m, new Dictionary<ModuleArea, AccessLevel>
            {
                [ModuleArea.Finance] = AccessLevel.Full,
                [ModuleArea.Insights] = AccessLevel.View,
                [ModuleArea.Orders] = AccessLevel.View,
                [ModuleArea.Inventory] = AccessLevel.View,
                [ModuleArea.Pos] = AccessLevel.None,
                [ModuleArea.Delivery] = AccessLevel.None,
                [ModuleArea.Suppliers] = AccessLevel.View,
                [ModuleArea.Hr] = AccessLevel.None,
                [ModuleArea.Network] = AccessLevel.None,
                [ModuleArea.Admin] = AccessLevel.None,
            }),
        };

        foreach (var def in definitions)
        {
            var role = new Role
            {
                Name = def.Name,
                Description = def.Description,
                ApprovalCap = def.ApprovalCap,
                IsSystem = true,
            };
            role.Permissions = def.Levels.Select(kv => new RolePermission { Module = kv.Key, Level = kv.Value }).ToList();
            db.Roles.Add(role);
        }

        await db.SaveChangesAsync();
    }

    private static Dictionary<ModuleArea, AccessLevel> AllModules(AccessLevel level) =>
        Enum.GetValues<ModuleArea>().ToDictionary(m => m, _ => level);

    private static Dictionary<ModuleArea, AccessLevel> AdminLevels()
    {
        var levels = AllModules(AccessLevel.Edit);
        levels[ModuleArea.Admin] = AccessLevel.Full;
        levels[ModuleArea.Network] = AccessLevel.Full;
        return levels;
    }

    private static async Task SeedUsersAsync(AppDbContext db, IPasswordHasher hasher)
    {
        var riyadh = await db.Branches.FirstAsync(b => b.Code == "BR-RUH-01");
        var jeddah = await db.Branches.FirstAsync(b => b.Code == "BR-JED-01");
        var roles = await db.Roles.ToDictionaryAsync(r => r.Name);

        var users = new[]
        {
            new User { Name = "Omar Al-Qahtani", Email = "owner@ecr-building.local", RoleId = roles["Owner"].Id, BranchId = null },
            new User { Name = "Sara Al-Dossary", Email = "admin@ecr-building.local", RoleId = roles["Admin"].Id, BranchId = null },
            new User { Name = "Faisal Al-Otaibi", Email = "manager.ruh@ecr-building.local", RoleId = roles["Branch Manager"].Id, BranchId = riyadh.Id },
            new User { Name = "Yousef Al-Malki", Email = "cashier.ruh@ecr-building.local", RoleId = roles["Cashier"].Id, BranchId = riyadh.Id },
            new User { Name = "Khalid Al-Shehri", Email = "warehouse.jed@ecr-building.local", RoleId = roles["Warehouse Staff"].Id, BranchId = jeddah.Id },
            new User { Name = "Naif Al-Ghamdi", Email = "driver.ruh@ecr-building.local", RoleId = roles["Delivery Driver"].Id, BranchId = riyadh.Id },
            new User { Name = "Huda Al-Zahrani", Email = "hr@ecr-building.local", RoleId = roles["HR Officer"].Id, BranchId = null },
            new User { Name = "Abdullah Al-Rashid", Email = "accountant@ecr-building.local", RoleId = roles["Accountant"].Id, BranchId = null },
        };

        foreach (var user in users)
        {
            user.PasswordHash = hasher.Hash(DemoPassword);
        }

        db.Users.AddRange(users);
        await db.SaveChangesAsync();
    }

    private static async Task SeedPlansAsync(AppDbContext db)
    {
        var plans = new[]
        {
            new Plan
            {
                Name = "Starter", MonthlyPrice = 299, YearlyPrice = 2990, MaxBranches = 1, MaxTerminals = 2, MaxUsers = 5, MaxSkus = 500,
                FeaturesJson = System.Text.Json.JsonSerializer.Serialize(new[] { "POS", "Basic Inventory", "1 Branch" }),
            },
            new Plan
            {
                Name = "Growth", MonthlyPrice = 799, YearlyPrice = 7990, MaxBranches = 3, MaxTerminals = 8, MaxUsers = 20, MaxSkus = 5000,
                FeaturesJson = System.Text.Json.JsonSerializer.Serialize(new[] { "POS", "Delivery", "HR", "Multi-branch" }),
            },
            new Plan
            {
                Name = "Business", MonthlyPrice = 1999, YearlyPrice = 19990, MaxBranches = 10, MaxTerminals = 30, MaxUsers = 75, MaxSkus = 25000,
                FeaturesJson = System.Text.Json.JsonSerializer.Serialize(new[] { "POS", "Delivery", "HR", "Finance", "ZATCA Phase 2" }),
            },
            new Plan
            {
                Name = "Enterprise", MonthlyPrice = 4999, YearlyPrice = 49990, MaxBranches = 999, MaxTerminals = 999, MaxUsers = 999, MaxSkus = 999_999,
                FeaturesJson = System.Text.Json.JsonSerializer.Serialize(new[] { "Everything", "Priority Support", "Custom Integrations" }),
            },
        };
        db.Plans.AddRange(plans);
        await db.SaveChangesAsync();

        var subscription = new CompanySubscription
        {
            PlanId = plans[2].Id,
            BillingCycle = BillingCycle.Yearly,
            StartedAt = DateTime.UtcNow.AddMonths(-3),
            RenewsAt = DateTime.UtcNow.AddMonths(9),
        };
        db.CompanySubscriptions.Add(subscription);
        await db.SaveChangesAsync();

        db.PlanUsageEntitlements.AddRange(
            new PlanUsageEntitlement { SubscriptionId = subscription.Id, Feature = "Branches", Usage = 2, Limit = plans[2].MaxBranches, OverageRate = 500, NextResetAt = DateTime.UtcNow.AddMonths(9) },
            new PlanUsageEntitlement { SubscriptionId = subscription.Id, Feature = "Terminals", Usage = 2, Limit = plans[2].MaxTerminals, OverageRate = 150, NextResetAt = DateTime.UtcNow.AddMonths(9) },
            new PlanUsageEntitlement { SubscriptionId = subscription.Id, Feature = "Users", Usage = 8, Limit = plans[2].MaxUsers, OverageRate = 50, NextResetAt = DateTime.UtcNow.AddMonths(9) },
            new PlanUsageEntitlement { SubscriptionId = subscription.Id, Feature = "SKUs", Usage = 16, Limit = plans[2].MaxSkus, OverageRate = 1, NextResetAt = DateTime.UtcNow.AddMonths(9) });
        await db.SaveChangesAsync();
    }

    private static async Task SeedRulesComplianceMaintenanceAsync(AppDbContext db)
    {
        db.RuleDefinitions.AddRange(
            new RuleDefinition
            {
                Name = "Contractor auto-discount", Domain = ModuleArea.Pos, Priority = 10,
                WhenTrigger = "Order.CustomerType = Contractor", Condition = "OrderTotal >= 0",
                Action = "Apply 5% discount", Active = true,
            },
            new RuleDefinition
            {
                Name = "High-value return approval", Domain = ModuleArea.Finance, Priority = 20,
                WhenTrigger = "Return.Amount > 2000", Condition = "Return.Type = Standard",
                Action = "Require Branch Manager approval", Active = true,
            });

        db.ComplianceControls.AddRange(
            new ComplianceControl
            {
                Control = "ZATCA Phase 2 e-invoicing", Framework = "ZATCA", Owner = "Finance",
                LastReview = DateTime.UtcNow.AddMonths(-1), NextDue = DateTime.UtcNow.AddMonths(5),
                Evidence = "Onboarding + sample cleared invoice", Status = ComplianceStatus.Compliant,
            },
            new ComplianceControl
            {
                Control = "VAT filing", Framework = "GAZT/ZATCA", Owner = "Accountant",
                LastReview = DateTime.UtcNow.AddMonths(-2), NextDue = DateTime.UtcNow.AddDays(-3),
                Evidence = "Q1 filing pending", Status = ComplianceStatus.Overdue,
            });

        db.MaintenanceTickets.Add(new MaintenanceTicket
        {
            TicketNo = "MNT-2026-0001", DeviceOrModule = "Riyadh Till 1 - Receipt Printer",
            Severity = AuditSeverity.Warning, Owner = "IT Support", SlaHours = 24, Status = MaintenanceStatus.Open,
        });

        await db.SaveChangesAsync();
    }

    private static async Task SeedSettingsAsync(AppDbContext db)
    {
        db.Settings.AddRange(
            new Setting { Category = "System", Group = "Localization", Key = "DefaultLocale", Value = "en", Scope = SettingScope.Global },
            new Setting { Category = "System", Group = "Localization", Key = "Currency", Value = "SAR", Scope = SettingScope.Global },
            new Setting { Category = "System", Group = "Security", Key = "SessionTimeoutMinutes", Value = "30", Scope = SettingScope.Global },
            new Setting { Category = "Pos", Group = "Receipts", Key = "ShowQrOnReceipt", Value = "true", Scope = SettingScope.Global },
            new Setting { Category = "Pos", Group = "Receipts", Key = "ReceiptFooterMessage", Value = "Thank you for your business", Scope = SettingScope.Global },
            new Setting { Category = "Pos", Group = "Discounts", Key = "MaxCashierDiscountPct", Value = "5", Scope = SettingScope.Global });
        await db.SaveChangesAsync();
    }

    private static async Task SeedCatalogAndInventoryAsync(AppDbContext db)
    {
        var riyadh = await db.Branches.FirstAsync(b => b.Code == "BR-RUH-01");
        var jeddah = await db.Branches.FirstAsync(b => b.Code == "BR-JED-01");

        var categories = new[]
        {
            new Category { Code = "CAT-CEM", NameEn = "Cement", NameAr = "الأسمنت", DefaultUom = "Bag", VatRate = 15, Returnable = false, ReturnRule = "Non-Returnable" },
            new Category { Code = "CAT-STL", NameEn = "Steel", NameAr = "الحديد", DefaultUom = "Bundle", VatRate = 15 },
            new Category { Code = "CAT-TIL", NameEn = "Tiles", NameAr = "البلاط", DefaultUom = "Box", VatRate = 15 },
            new Category { Code = "CAT-PNT", NameEn = "Paint", NameAr = "الطلاء", DefaultUom = "Can", VatRate = 15, Returnable = false, ReturnRule = "Non-Returnable" },
            new Category { Code = "CAT-PLM", NameEn = "Plumbing", NameAr = "السباكة", DefaultUom = "Piece", VatRate = 15 },
            new Category { Code = "CAT-ELC", NameEn = "Electrical", NameAr = "الكهرباء", DefaultUom = "Piece", VatRate = 15 },
            new Category { Code = "CAT-TLS", NameEn = "Tools", NameAr = "العدد اليدوية", DefaultUom = "Piece", VatRate = 15 },
        };
        db.Categories.AddRange(categories);
        await db.SaveChangesAsync();
        var catId = categories.ToDictionary(c => c.NameEn, c => c.Id);

        var products = new[]
        {
            new Product { Sku = "CEM-OPC-50KG", Barcode = "6281000100017", NameEn = "OPC Cement 50KG", CategoryId = catId["Cement"], Brand = "Yamama", CostPrice = 15.5m, SellingPrice = 22.5m, StockUom = "Bag", Weight = 50, Returnable = false, ReorderLevel = 30, ReorderQty = 200 },
            new Product { Sku = "CEM-WHT-40KG", Barcode = "6281000100024", NameEn = "White Cement 40KG", CategoryId = catId["Cement"], Brand = "Yamama", CostPrice = 26m, SellingPrice = 38m, StockUom = "Bag", Weight = 40, Returnable = false, ReorderLevel = 15, ReorderQty = 100 },
            new Product { Sku = "STEEL-RBR-12MM", Barcode = "6281000200013", NameEn = "Steel Rebar 12MM", CategoryId = catId["Steel"], Brand = "Hadeed", CostPrice = 1600m, SellingPrice = 1950m, StockUom = "Bundle", Weight = 500, ReorderLevel = 10, ReorderQty = 40 },
            new Product { Sku = "STEEL-RBR-16MM", Barcode = "6281000200020", NameEn = "Steel Rebar 16MM", CategoryId = catId["Steel"], Brand = "Hadeed", CostPrice = 2200m, SellingPrice = 2680m, StockUom = "Bundle", Weight = 620, ReorderLevel = 8, ReorderQty = 30 },
            new Product { Sku = "TILE-GRY-60X60", Barcode = "6281000300010", NameEn = "Grey Porcelain Tile 60x60", CategoryId = catId["Tiles"], Brand = "Saudi Ceramics", CostPrice = 32m, SellingPrice = 44m, StockUom = "Box", Weight = 22, ReorderLevel = 20, ReorderQty = 150 },
            new Product { Sku = "TILE-MRB-80X80", Barcode = "6281000300027", NameEn = "Marble Tile 80x80", CategoryId = catId["Tiles"], Brand = "Saudi Ceramics", CostPrice = 88m, SellingPrice = 120m, StockUom = "Box", Weight = 28, ReorderLevel = 10, ReorderQty = 60 },
            new Product { Sku = "PAINT-WHT-20L", Barcode = "6281000400014", NameEn = "White Emulsion Paint 20L", CategoryId = catId["Paint"], Brand = "Jotun", CostPrice = 165m, SellingPrice = 220m, StockUom = "Can", Weight = 22, Returnable = false, ReorderLevel = 10, ReorderQty = 40 },
            new Product { Sku = "PAINT-BEIGE-4L", Barcode = "6281000400021", NameEn = "Beige Emulsion Paint 4L", CategoryId = catId["Paint"], Brand = "Jotun", CostPrice = 50m, SellingPrice = 68m, StockUom = "Can", Weight = 5, Returnable = false, ReorderLevel = 15, ReorderQty = 60 },
            new Product { Sku = "PVC-PIPE-2IN", Barcode = "6281000500011", NameEn = "PVC Pipe 2 Inch", CategoryId = catId["Plumbing"], Brand = "Amanco", CostPrice = 22m, SellingPrice = 32m, StockUom = "Piece", Weight = 3, ReorderLevel = 25, ReorderQty = 150 },
            new Product { Sku = "PVC-ELB-2IN", Barcode = "6281000500028", NameEn = "PVC Elbow 2 Inch", CategoryId = catId["Plumbing"], Brand = "Amanco", CostPrice = 4m, SellingPrice = 6m, StockUom = "Piece", Weight = 0.3m, ReorderLevel = 100, ReorderQty = 500 },
            new Product { Sku = "ELEC-CBL-2.5MM", Barcode = "6281000600015", NameEn = "Electrical Cable 2.5MM (m)", CategoryId = catId["Electrical"], Brand = "Riyadh Cables", CostPrice = 2.9m, SellingPrice = 4.2m, StockUom = "Meter", Weight = 0.05m, ReorderLevel = 200, ReorderQty = 1000 },
            new Product { Sku = "ELEC-SW-1G", Barcode = "6281000600022", NameEn = "Wall Switch 1 Gang", CategoryId = catId["Electrical"], Brand = "Schneider", CostPrice = 12m, SellingPrice = 18m, StockUom = "Piece", Weight = 0.1m, ReorderLevel = 50, ReorderQty = 300 },
            new Product { Sku = "TOOL-DRL-18V", Barcode = "6281000700012", NameEn = "Cordless Drill 18V", CategoryId = catId["Tools"], Brand = "Bosch", CostPrice = 400m, SellingPrice = 540m, StockUom = "Piece", Weight = 1.8m, ReorderLevel = 10, ReorderQty = 25 },
            new Product { Sku = "TOOL-HMR-500", Barcode = "6281000700029", NameEn = "Claw Hammer 500g", CategoryId = catId["Tools"], Brand = "Stanley", CostPrice = 30m, SellingPrice = 42m, StockUom = "Piece", Weight = 0.6m, ReorderLevel = 20, ReorderQty = 60 },
            new Product { Sku = "GLASS-6MM-CLR", Barcode = "6281000300034", NameEn = "Clear Float Glass 6MM", CategoryId = catId["Tiles"], Brand = "Saudi Glass", CostPrice = 135m, SellingPrice = 180m, StockUom = "m²", Weight = 15, Returnable = false, ReorderLevel = 15, ReorderQty = 80 },
            new Product { Sku = "SEAL-SILC-300", Barcode = "6281000700036", NameEn = "Silicone Sealant 300ml", CategoryId = catId["Tools"], Brand = "Dow", CostPrice = 16m, SellingPrice = 22m, StockUom = "Tube", Weight = 0.4m, ReorderLevel = 40, ReorderQty = 200 },
        };
        db.Products.AddRange(products);
        await db.SaveChangesAsync();

        var warehouses = new[]
        {
            new Warehouse { Code = "WH-RUH-01", Name = "Riyadh Main Yard", BranchId = riyadh.Id, Type = WarehouseType.MainYard },
            new Warehouse { Code = "WH-JED-01", Name = "Jeddah Distribution Center", BranchId = jeddah.Id, Type = WarehouseType.Distribution },
        };
        db.Warehouses.AddRange(warehouses);
        await db.SaveChangesAsync();

        db.WarehouseBins.AddRange(
            new WarehouseBin { WarehouseId = warehouses[0].Id, BinCode = "A1", Label = "Cement Bay", CapacityTons = 80, FilledTons = 52 },
            new WarehouseBin { WarehouseId = warehouses[0].Id, BinCode = "A2", Label = "Steel Rack", CapacityTons = 120, FilledTons = 74 },
            new WarehouseBin { WarehouseId = warehouses[0].Id, BinCode = "B1", Label = "Tiles & Glass", CapacityTons = 60, FilledTons = 20 },
            new WarehouseBin { WarehouseId = warehouses[1].Id, BinCode = "A1", Label = "Paint & Chemicals", CapacityTons = 40, FilledTons = 18 },
            new WarehouseBin { WarehouseId = warehouses[1].Id, BinCode = "A2", Label = "Plumbing & Electrical", CapacityTons = 30, FilledTons = 12 });

        var rnd = new Random(42);
        foreach (var product in products)
        {
            db.StockLevels.Add(new StockLevel { ProductId = product.Id, WarehouseId = warehouses[0].Id, OnHand = 20 + rnd.Next(0, 200), Reserved = rnd.Next(0, 15) });
            db.StockLevels.Add(new StockLevel { ProductId = product.Id, WarehouseId = warehouses[1].Id, OnHand = 10 + rnd.Next(0, 100), Reserved = rnd.Next(0, 8) });
        }
        await db.SaveChangesAsync();

        db.StockBatches.AddRange(
            new StockBatch { ProductId = products[0].Id, WarehouseId = warehouses[0].Id, BatchNo = "B-2026-014", ReceivedDate = DateTime.UtcNow.AddDays(-60), ExpiryDate = DateTime.UtcNow.AddDays(20), Qty = 40 },
            new StockBatch { ProductId = products[6].Id, WarehouseId = warehouses[1].Id, BatchNo = "B-2026-021", ReceivedDate = DateTime.UtcNow.AddDays(-30), ExpiryDate = DateTime.UtcNow.AddDays(4), Qty = 12 },
            new StockBatch { ProductId = products[9].Id, WarehouseId = warehouses[0].Id, BatchNo = "B-2026-030", ReceivedDate = DateTime.UtcNow.AddDays(-10), ExpiryDate = DateTime.UtcNow.AddDays(200), Qty = 300 },
            new StockBatch { ProductId = products[7].Id, WarehouseId = warehouses[1].Id, BatchNo = "B-2026-041", ReceivedDate = DateTime.UtcNow.AddDays(-45), ExpiryDate = DateTime.UtcNow.AddDays(-2), Qty = 18, ManualStatus = StockBatchStatus.WrittenOff },
            new StockBatch { ProductId = products[15].Id, WarehouseId = warehouses[0].Id, BatchNo = "B-2026-052", ReceivedDate = DateTime.UtcNow.AddDays(-15), ExpiryDate = DateTime.UtcNow.AddDays(60), Qty = 24, ManualStatus = StockBatchStatus.Quarantine });
        await db.SaveChangesAsync();

        var prodBySku = products.ToDictionary(p => p.Sku, p => p);
        db.ProductBundles.AddRange(
            new ProductBundle
            {
                Code = "BND-TILE-01", NameEn = "Tiling Starter Kit", NameAr = "مجموعة التبليط الأساسية", BundlePrice = 480m,
                Lines = new List<BundleLine>
                {
                    new() { ProductId = prodBySku["TILE-GRY-60X60"].Id, Qty = 10 },
                    new() { ProductId = prodBySku["SEAL-SILC-300"].Id, Qty = 2 },
                },
            },
            new ProductBundle
            {
                Code = "BND-PLUMB-01", NameEn = "Basic Plumbing Kit", NameAr = "مجموعة سباكة أساسية", BundlePrice = 220m,
                Lines = new List<BundleLine>
                {
                    new() { ProductId = prodBySku["PVC-PIPE-2IN"].Id, Qty = 5 },
                    new() { ProductId = prodBySku["PVC-ELB-2IN"].Id, Qty = 10 },
                },
            });
        await db.SaveChangesAsync();

        var suppliers = new[]
        {
            new Supplier { Code = "SUP-001", NameEn = "Yamama Cement Co.", Type = "Manufacturer", VatNo = "310000111111", Phone = "+966114001100", Email = "sales@yamama.example", Terms = "Net 30", LeadTimeDays = 5, CategoriesJson = "[\"Cement\"]" },
            new Supplier { Code = "SUP-002", NameEn = "Hadeed Steel", Type = "Manufacturer", VatNo = "310000222222", Phone = "+966114002200", Email = "sales@hadeed.example", Terms = "Net 45", LeadTimeDays = 10, CategoriesJson = "[\"Steel\"]" },
            new Supplier { Code = "SUP-003", NameEn = "Saudi Ceramics Trading", Type = "Distributor", VatNo = "310000333333", Phone = "+966114003300", Email = "sales@saudiceramics.example", Terms = "Net 30", LeadTimeDays = 7, CategoriesJson = "[\"Tiles\"]" },
            new Supplier { Code = "SUP-004", NameEn = "Gulf Building Supplies", Type = "Distributor", VatNo = "310000444444", Phone = "+966114004400", Email = "sales@gulfbuild.example", Terms = "Net 15", LeadTimeDays = 3, CategoriesJson = "[\"Plumbing\",\"Electrical\",\"Tools\"]" },
        };
        db.Suppliers.AddRange(suppliers);
        await db.SaveChangesAsync();
    }

    private static async Task SeedPosDataAsync(AppDbContext db)
    {
        db.Customers.AddRange(
            new Customer { NameEn = "Al Noor Contracting", NameAr = "النور للمقاولات", Type = CustomerType.Contractor, Phone = "+966551112233", VatNo = "310000112233", CreditLimit = 500_000, Outstanding = 84_200, City = "Riyadh", LoyaltyEnrolled = true, LoyaltyPoints = 4820, LoyaltyLifetimePoints = 6120, LoyaltyTier = LoyaltyTier.Platinum, ProjectName = "Al Narjis Villas Phase 2", CreditTermDays = 30 },
            new Customer { NameEn = "Modern Villas Est.", NameAr = "الفلل الحديثة", Type = CustomerType.Contractor, Phone = "+966509987654", VatNo = "310000998765", CreditLimit = 250_000, Outstanding = 42_150, City = "Jeddah", LoyaltyEnrolled = false, ProjectName = "Al Shati Compound", CreditTermDays = 15 },
            new Customer { NameEn = "Gulf Build Co.", NameAr = "الخليج للبناء", Type = CustomerType.B2B, Phone = "+966552201010", VatNo = "310000220101", CreditLimit = 1_000_000, Outstanding = 312_400, City = "Riyadh", LoyaltyEnrolled = false, CreditTermDays = 60 },
            new Customer { NameEn = "Fahad Al-Qahtani", Type = CustomerType.Retail, Phone = "+966557806612", City = "Riyadh", LoyaltyEnrolled = true, LoyaltyPoints = 340, LoyaltyLifetimePoints = 340, LoyaltyTier = LoyaltyTier.Standard },
            new Customer { NameEn = "Walk-in Customer", Type = CustomerType.WalkIn, LoyaltyEnrolled = false });
        await db.SaveChangesAsync();

        var loyaltyAlNoor = await db.Customers.FirstAsync(c => c.NameEn == "Al Noor Contracting");
        var loyaltyFahad = await db.Customers.FirstAsync(c => c.NameEn == "Fahad Al-Qahtani");
        db.LoyaltyTransactions.AddRange(
            new LoyaltyTransaction { CustomerId = loyaltyAlNoor.Id, Type = LoyaltyTransactionType.Welcome, Points = 100, Description = "Enrolled in loyalty program" },
            new LoyaltyTransaction { CustomerId = loyaltyAlNoor.Id, Type = LoyaltyTransactionType.Earn, Points = 6020, Description = "Earned on prior purchases" },
            new LoyaltyTransaction { CustomerId = loyaltyAlNoor.Id, Type = LoyaltyTransactionType.Redeem, Points = -1300, Description = "Redeemed against invoice settlement" },
            new LoyaltyTransaction { CustomerId = loyaltyFahad.Id, Type = LoyaltyTransactionType.Welcome, Points = 100, Description = "Enrolled in loyalty program" },
            new LoyaltyTransaction { CustomerId = loyaltyFahad.Id, Type = LoyaltyTransactionType.Earn, Points = 240, Description = "Earned on prior purchases" });
        await db.SaveChangesAsync();

        db.PricingRules.AddRange(
            new PricingRule { Name = "Contractor Trade Price", Type = "Trade Tier", Scope = "Contractor customers", Condition = "Any", Action = "-5% list", Priority = 10 },
            new PricingRule { Name = "Cement Pallet Deal", Type = "Quantity", Scope = "SKU: CEM-OPC-50KG", Condition = ">= 50 bags", Action = "-8%", Priority = 20, ValidUntil = DateTime.UtcNow.AddMonths(6) },
            new PricingRule { Name = "Surplus Restocking Fee", Type = "Fee", Scope = "Surplus returns", Condition = ">15 days", Action = "+10% fee", Priority = 5 },
            new PricingRule { Name = "Welcome Discount", Type = "Coupon", Scope = "All branches", Condition = "Code: WELCOME10", Action = "10% off", Priority = 30, Code = "WELCOME10", DiscountType = RuleDiscountType.Percentage, Value = 10, ValidUntil = DateTime.UtcNow.AddYears(1) },
            new PricingRule { Name = "SAR 20 Off", Type = "Coupon", Scope = "All branches", Condition = "Code: SAVE20", Action = "20 ر.س off", Priority = 30, Code = "SAVE20", DiscountType = RuleDiscountType.Fixed, Value = 20, ValidUntil = DateTime.UtcNow.AddYears(1) });
        await db.SaveChangesAsync();

        var terminal = await db.Terminals.FirstAsync();
        var cashier = await db.Users.FirstAsync(u => u.Email == "cashier.ruh@ecr-building.local");
        db.CashierShifts.Add(new CashierShift
        {
            TerminalId = terminal.Id, CashierUserId = cashier.Id, OpeningFloat = 1000,
            OpenedAt = DateTime.UtcNow.AddHours(-6),
        });
        await db.SaveChangesAsync();

        var branch = await db.Branches.FirstAsync();
        var contractor = await db.Customers.FirstAsync(c => c.NameEn == "Al Noor Contracting");
        var products = await db.Products.Take(2).ToListAsync();
        if (products.Count > 0)
        {
            var lines = products.Select(p => new QuotationLine
            {
                ProductId = p.Id, Qty = 10, UnitPrice = p.SellingPrice, DiscountPct = 5, VatRate = p.VatRate,
                LineTotal = Math.Round(10 * p.SellingPrice * 0.95m, 2),
            }).ToList();
            var subTotal = lines.Sum(l => l.Qty * l.UnitPrice);
            var lineTotalsSum = lines.Sum(l => l.LineTotal);
            var vatTotal = lines.Sum(l => l.LineTotal * l.VatRate / 100);
            db.Quotations.Add(new Quotation
            {
                QuoteNo = "QT-2026-0001", BranchId = branch.Id, CustomerId = contractor.Id, CreatedByUserId = cashier.Id,
                Status = QuotationStatus.Sent, ValidUntil = DateTime.UtcNow.AddDays(10),
                SubTotal = subTotal, DiscountTotal = subTotal - lineTotalsSum, VatTotal = vatTotal,
                GrandTotal = Math.Round(lineTotalsSum + vatTotal, 2), Notes = "Bulk order for phase 2 groundworks.",
                Lines = lines,
            });
            await db.SaveChangesAsync();
        }

        db.ApprovalRequests.Add(new ApprovalRequest
        {
            Type = ApprovalType.Discount, BranchId = branch.Id, RequestedByUserId = cashier.Id,
            Amount = 150, Reason = "8% discount on contractor order above manager threshold",
        });
        await db.SaveChangesAsync();
    }

    private static async Task SeedDeliveryDataAsync(AppDbContext db)
    {
        var riyadh = await db.Branches.FirstAsync(b => b.Code == "BR-RUH-01");
        var jeddah = await db.Branches.FirstAsync(b => b.Code == "BR-JED-01");
        var driverUser = await db.Users.FirstAsync(u => u.Email == "driver.ruh@ecr-building.local");

        var vehicles = new[]
        {
            new Vehicle { Registration = "RUH-4471", Type = VehicleType.FlatbedTruck, BranchId = riyadh.Id, CapacityTons = 8 },
            new Vehicle { Registration = "RUH-2290", Type = VehicleType.BoxTruck, BranchId = riyadh.Id, CapacityTons = 4 },
            new Vehicle { Registration = "JED-1187", Type = VehicleType.DeliveryVan, BranchId = jeddah.Id, CapacityTons = 1.5m },
        };
        db.Vehicles.AddRange(vehicles);
        await db.SaveChangesAsync();

        var drivers = new[]
        {
            new Driver { Name = "Naif Al-Ghamdi", BranchId = riyadh.Id, Mobile = "+966553001100", License = "DL-778812", LicenseExpiry = DateTime.UtcNow.AddYears(2), UserId = driverUser.Id, VehicleId = vehicles[0].Id },
            new Driver { Name = "Turki Al-Dosari", BranchId = riyadh.Id, Mobile = "+966553002200", License = "DL-778813", LicenseExpiry = DateTime.UtcNow.AddYears(1) },
            new Driver { Name = "Saeed Al-Amri", BranchId = jeddah.Id, Mobile = "+966553003300", License = "DL-778814", LicenseExpiry = DateTime.UtcNow.AddMonths(3), VehicleId = vehicles[2].Id },
        };
        db.Drivers.AddRange(drivers);
        await db.SaveChangesAsync();

        db.DeliveryZones.AddRange(
            new DeliveryZone { Name = "Riyadh North", City = "Riyadh", DistanceKm = 12, Fee = 80 },
            new DeliveryZone { Name = "Riyadh South", City = "Riyadh", DistanceKm = 22, Fee = 120 },
            new DeliveryZone { Name = "Jeddah Industrial", City = "Jeddah", DistanceKm = 15, Fee = 90 });
        await db.SaveChangesAsync();

        var contractor = await db.Customers.FirstAsync(c => c.NameEn == "Al Noor Contracting");
        var cement = await db.Products.FirstAsync(p => p.Sku == "CEM-OPC-50KG");
        var steel = await db.Products.FirstAsync(p => p.Sku == "STEEL-RBR-12MM");

        var delivery = new DeliveryOrder
        {
            DeliveryNo = "DO-2026-0001", CustomerId = contractor.Id, BranchId = riyadh.Id, WeightTons = 3.2m,
            Area = "Riyadh North", AddressType = "Project Site", ContactName = "Al Noor Site Office",
            ContactMobile = "+966551112233", City = "Riyadh", District = "Al Nakheel", Street = "King Fahd Rd",
            PromisedDate = DateTime.UtcNow.AddDays(1), PromisedTime = "16:00", Priority = DeliveryPriority.High,
            Amount = 2380, FeeCharge = 80, HandlingCharge = 40, VatCharge = 18,
        };
        delivery.Lines.Add(new DeliveryOrderLine { ProductId = cement.Id, Ordered = 40, Uom = cement.StockUom, UnitWeight = cement.Weight, DeliveryQty = 40 });
        delivery.Lines.Add(new DeliveryOrderLine { ProductId = steel.Id, Ordered = 2, Uom = steel.StockUom, UnitWeight = steel.Weight, DeliveryQty = 2 });
        delivery.History.Add(new DeliveryHistory { FromStage = DeliveryStage.Pending, ToStage = DeliveryStage.Pending, ByUserId = driverUser.Id, Note = "Delivery order created" });
        db.DeliveryOrders.Add(delivery);
        await db.SaveChangesAsync();
    }

    private static async Task SeedHrDataAsync(AppDbContext db)
    {
        var riyadh = await db.Branches.FirstAsync(b => b.Code == "BR-RUH-01");
        var jeddah = await db.Branches.FirstAsync(b => b.Code == "BR-JED-01");
        var users = await db.Users.ToDictionaryAsync(u => u.Email);

        var departments = new[]
        {
            new Department { Name = "Store Operations", ArabicName = "عمليات المتجر", Code = "STO" },
            new Department { Name = "Cashier Operations", ArabicName = "عمليات الصندوق", Code = "CSH" },
            new Department { Name = "Inventory", ArabicName = "إدارة المخزون", Code = "INV" },
            new Department { Name = "Procurement", ArabicName = "المشتريات", Code = "PRO" },
            new Department { Name = "Delivery & Dispatch", ArabicName = "التوصيل والتوزيع", Code = "DEL" },
            new Department { Name = "Finance", ArabicName = "المالية", Code = "FIN" },
            new Department { Name = "HR & Administration", ArabicName = "الموارد البشرية والإدارة", Code = "HR" },
        };
        db.Departments.AddRange(departments);
        await db.SaveChangesAsync();
        var deptId = departments.ToDictionary(d => d.Code, d => d.Id);

        var shifts = new[]
        {
            new WorkShift { Name = "Morning Shift", Code = "MOR-01", Start = "08:00", End = "16:00", BreakMin = 60, WorkingHours = 7, GraceMin = 5 },
            new WorkShift { Name = "Mid Shift", Code = "MID-01", Start = "10:00", End = "18:00", BreakMin = 60, WorkingHours = 7, GraceMin = 5 },
            new WorkShift { Name = "Driver Early Shift", Code = "DRV-01", Start = "07:00", End = "15:00", BreakMin = 45, WorkingHours = 7.25m, GraceMin = 10 },
        };
        db.WorkShifts.AddRange(shifts);
        await db.SaveChangesAsync();
        var shiftId = shifts.ToDictionary(s => s.Code, s => s.Id);

        var employees = new[]
        {
            new Employee { FirstName = "Naif", LastName = "Al-Ghamdi", Mobile = "+966553001100", JoiningDate = DateTime.UtcNow.AddYears(-2), DepartmentId = deptId["DEL"], Designation = "Driver", BranchId = riyadh.Id, ShiftId = shiftId["DRV-01"], UserId = users["driver.ruh@ecr-building.local"].Id, DrivingLicense = "DL-778812", LicenseExpiry = DateTime.UtcNow.AddYears(2) },
            new Employee { FirstName = "Turki", LastName = "Al-Dosari", Mobile = "+966553002200", JoiningDate = DateTime.UtcNow.AddMonths(-14), DepartmentId = deptId["DEL"], Designation = "Driver", BranchId = riyadh.Id, ShiftId = shiftId["DRV-01"], DrivingLicense = "DL-778813", LicenseExpiry = DateTime.UtcNow.AddYears(1) },
            new Employee { FirstName = "Saeed", LastName = "Al-Amri", Mobile = "+966553003300", JoiningDate = DateTime.UtcNow.AddMonths(-13), DepartmentId = deptId["DEL"], Designation = "Driver", BranchId = jeddah.Id, ShiftId = shiftId["DRV-01"], DrivingLicense = "DL-778814", LicenseExpiry = DateTime.UtcNow.AddMonths(3) },
            new Employee { FirstName = "Faisal", LastName = "Al-Otaibi", Mobile = "+966500000003", JoiningDate = DateTime.UtcNow.AddYears(-3), DepartmentId = deptId["STO"], Designation = "Branch Manager", BranchId = riyadh.Id, ShiftId = shiftId["MOR-01"], UserId = users["manager.ruh@ecr-building.local"].Id },
            new Employee { FirstName = "Yousef", LastName = "Al-Malki", Mobile = "+966500000004", JoiningDate = DateTime.UtcNow.AddYears(-1), DepartmentId = deptId["CSH"], Designation = "Cashier", BranchId = riyadh.Id, ShiftId = shiftId["MOR-01"], UserId = users["cashier.ruh@ecr-building.local"].Id },
            new Employee { FirstName = "Khalid", LastName = "Al-Shehri", Mobile = "+966500000005", JoiningDate = DateTime.UtcNow.AddYears(-2), DepartmentId = deptId["INV"], Designation = "Warehouse Officer", BranchId = jeddah.Id, ShiftId = shiftId["MOR-01"], UserId = users["warehouse.jed@ecr-building.local"].Id },
            new Employee { FirstName = "Huda", LastName = "Al-Zahrani", Mobile = "+966500000007", JoiningDate = DateTime.UtcNow.AddYears(-4), DepartmentId = deptId["HR"], Designation = "HR Officer", BranchId = riyadh.Id, ShiftId = shiftId["MOR-01"], UserId = users["hr@ecr-building.local"].Id },
            new Employee { FirstName = "Abdullah", LastName = "Al-Rashid", Mobile = "+966500000008", JoiningDate = DateTime.UtcNow.AddYears(-2), DepartmentId = deptId["FIN"], Designation = "Accountant", BranchId = riyadh.Id, ShiftId = shiftId["MOR-01"], UserId = users["accountant@ecr-building.local"].Id },
            new Employee { FirstName = "Omar", LastName = "Al-Ghamdi", Mobile = "+966500000009", JoiningDate = DateTime.UtcNow.AddYears(-3), DepartmentId = deptId["DEL"], Designation = "Dispatch Supervisor", BranchId = riyadh.Id, ShiftId = shiftId["MOR-01"], Status = EmploymentStatus.OnLeave },
            new Employee { FirstName = "Sara", LastName = "Al-Otaibi", Mobile = "+966500000010", JoiningDate = DateTime.UtcNow.AddMonths(-10), DepartmentId = deptId["CSH"], Designation = "Cashier", BranchId = riyadh.Id, ShiftId = shiftId["MOR-01"] },
        };
        db.Employees.AddRange(employees);
        await db.SaveChangesAsync();

        departments.First(d => d.Code == "DEL").ManagerEmployeeId = employees[8].Id;
        departments.First(d => d.Code == "STO").ManagerEmployeeId = employees[3].Id;
        departments.First(d => d.Code == "CSH").ManagerEmployeeId = employees[4].Id;
        departments.First(d => d.Code == "INV").ManagerEmployeeId = employees[5].Id;
        departments.First(d => d.Code == "HR").ManagerEmployeeId = employees[6].Id;
        departments.First(d => d.Code == "FIN").ManagerEmployeeId = employees[7].Id;
        await db.SaveChangesAsync();

        var today = DateTime.UtcNow.Date;
        db.Attendances.AddRange(
            new Attendance { EmployeeId = employees[3].Id, Date = today, ShiftId = shiftId["MOR-01"], ScheduledIn = "08:00", ScheduledOut = "16:00", CheckIn = "07:52", Status = AttendanceStatus.Present, Source = AttendanceSource.Biometric },
            new Attendance { EmployeeId = employees[4].Id, Date = today, ShiftId = shiftId["MOR-01"], ScheduledIn = "08:00", ScheduledOut = "16:00", CheckIn = "08:06", LateMin = 6, Status = AttendanceStatus.Late, Source = AttendanceSource.Pin },
            new Attendance { EmployeeId = employees[0].Id, Date = today, ShiftId = shiftId["DRV-01"], ScheduledIn = "07:00", ScheduledOut = "15:00", CheckIn = "06:55", Status = AttendanceStatus.Present, Source = AttendanceSource.Mobile },
            new Attendance { EmployeeId = employees[8].Id, Date = today, Status = AttendanceStatus.OnLeave, Source = AttendanceSource.Manual });
        await db.SaveChangesAsync();

        db.Leaves.AddRange(
            new Leave { EmployeeId = employees[8].Id, Type = LeaveType.AnnualLeave, Start = today.AddDays(-1), End = today.AddDays(2), Days = 4, HandoverToEmployeeId = employees[0].Id, Status = LeaveStatus.Approved, ApproverEmployeeId = employees[3].Id },
            new Leave { EmployeeId = employees[9].Id, Type = LeaveType.SickLeave, Start = today.AddDays(1), End = today.AddDays(2), Days = 2, Attachment = "medical-certificate.pdf", Status = LeaveStatus.PendingManager });
        await db.SaveChangesAsync();

        db.EmployeeDocs.AddRange(
            new EmployeeDoc { EmployeeId = employees[0].Id, Type = DocType.DrivingLicence, Number = "DL-778812", IssueDate = DateTime.UtcNow.AddYears(-2), ExpiryDate = DateTime.UtcNow.AddYears(2), Status = DocStatus.Valid, VerifiedByEmployeeId = employees[6].Id, FileName = "naif-license.pdf" },
            new EmployeeDoc { EmployeeId = employees[9].Id, Type = DocType.NationalIdIqama, Number = "2456789123", ExpiryDate = DateTime.UtcNow.AddDays(45), Status = DocStatus.ExpiringSoon, FileName = "sara-iqama.pdf" });
        await db.SaveChangesAsync();

        db.Contracts.AddRange(
            new Contract { EmployeeId = employees[3].Id, Type = ContractType.FullTime, Start = DateTime.UtcNow.AddYears(-3), End = DateTime.UtcNow.AddYears(1), JobTitle = "Branch Manager", DepartmentId = deptId["STO"], BranchId = riyadh.Id, Status = ContractStatus.Active },
            new Contract { EmployeeId = employees[0].Id, Type = ContractType.FullTime, Start = DateTime.UtcNow.AddYears(-2), End = DateTime.UtcNow.AddYears(1), JobTitle = "Driver", DepartmentId = deptId["DEL"], BranchId = riyadh.Id, Status = ContractStatus.Active },
            new Contract { EmployeeId = employees[9].Id, Type = ContractType.FixedTerm, Start = DateTime.UtcNow.AddMonths(-10), End = DateTime.UtcNow.AddMonths(2), JobTitle = "Cashier", DepartmentId = deptId["CSH"], BranchId = riyadh.Id, Status = ContractStatus.ExpiringSoon });
        await db.SaveChangesAsync();
    }

    private static async Task SeedFinanceDataAsync(AppDbContext db)
    {
        var accounts = new[]
        {
            new Account { Code = "1000", Name = "Cash & Bank", Type = AccountType.Asset },
            new Account { Code = "1100", Name = "Accounts Receivable", Type = AccountType.Asset },
            new Account { Code = "1200", Name = "Inventory", Type = AccountType.Asset },
            new Account { Code = "2000", Name = "Accounts Payable", Type = AccountType.Liability },
            new Account { Code = "2100", Name = "VAT Payable", Type = AccountType.Liability },
            new Account { Code = "3000", Name = "Owner's Equity", Type = AccountType.Equity },
            new Account { Code = "4000", Name = "Sales Revenue", Type = AccountType.Revenue },
            new Account { Code = "5000", Name = "Cost of Goods Sold", Type = AccountType.Expense },
            new Account { Code = "5100", Name = "Operating Expenses", Type = AccountType.Expense },
        };
        db.Accounts.AddRange(accounts);
        await db.SaveChangesAsync();

        db.TaxCodes.AddRange(
            new TaxCode { Code = "VAT-STD", Name = "Standard VAT", Type = "VAT", Rate = 15, AppliesTo = "Most goods & services", GlAccountId = accounts[4].Id },
            new TaxCode { Code = "VAT-ZERO", Name = "Zero-Rated", Type = "VAT", Rate = 0, AppliesTo = "Exports, medical, education", GlAccountId = accounts[4].Id },
            new TaxCode { Code = "VAT-EXEMPT", Name = "Exempt", Type = "VAT", Rate = 0, AppliesTo = "Residential rent, financial services", GlAccountId = accounts[4].Id });
        await db.SaveChangesAsync();

        var riyadh = await db.Branches.FirstAsync(b => b.Code == "BR-RUH-01");
        db.Expenses.AddRange(
            new Expense { ExpenseNo = "EXP-2026-0001", Date = DateTime.UtcNow.AddDays(-3), BranchId = riyadh.Id, Category = "Logistics", Description = "Fuel for delivery fleet", Vendor = "Aramco Fuel Station", Amount = 850, Vat = 127.5m, Method = "Cash", Status = ExpenseStatus.Approved, ApproverUserId = null },
            new Expense { ExpenseNo = "EXP-2026-0002", Date = DateTime.UtcNow.AddDays(-1), BranchId = riyadh.Id, Category = "Utilities", Description = "Warehouse electricity bill", Vendor = "SEC", Amount = 1200, Vat = 180, Method = "Transfer", Status = ExpenseStatus.Pending });
        await db.SaveChangesAsync();
    }

    private static async Task SeedZatcaAndPrintingAsync(AppDbContext db)
    {
        var riyadh = await db.Branches.FirstAsync(b => b.Code == "BR-RUH-01");
        var jeddah = await db.Branches.FirstAsync(b => b.Code == "BR-JED-01");

        db.ZatcaSettingsList.AddRange(
            new ZatcaSettings { BranchId = riyadh.Id, VatRegistrationNumber = riyadh.VatRegistrationNumber ?? "300000000000003", SellerName = "Al Binaa Building Materials Trading", CrNumber = "1010010000", Street = "Al Kharj Rd", City = "Riyadh", PostalCode = "12345", BuildingNumber = "1234" },
            new ZatcaSettings { BranchId = jeddah.Id, VatRegistrationNumber = jeddah.VatRegistrationNumber ?? "300000000000004", SellerName = "Al Binaa Building Materials Trading", CrNumber = "1010010001", Street = "Industrial City", City = "Jeddah", PostalCode = "23456", BuildingNumber = "5678" });
        await db.SaveChangesAsync();

        // ZatcaService now calls ZATCA's real e-invoicing gateway — unlike the old local
        // simulator, it can't be auto-onboarded here with made-up demo VAT numbers (ZATCA would
        // just reject them). Onboarding is a real, one-time admin action against a genuinely
        // registered CR/VAT — run it from the ZATCA Phase 2 Settings page instead.
    }

    private static async Task SeedInsightsDataAsync(AppDbContext db)
    {
        db.Kpis.AddRange(
            new Kpi { Name = "Net Sales", Category = "Sales", Owner = "Store Manager", MetricKey = "NetSalesMtd", Target = 50, Period = "MTD" },
            new Kpi { Name = "Gross Margin", Category = "Finance", Owner = "Finance Mgr", MetricKey = "GrossMarginPct", Target = 20, Period = "MTD" },
            new Kpi { Name = "Return Rate", Category = "Returns", Owner = "Store Manager", MetricKey = "ReturnRatePct", Target = 5, Period = "MTD" },
            new Kpi { Name = "ZATCA Success", Category = "Compliance", Owner = "Finance Mgr", MetricKey = "ZatcaSuccessPct", Target = 99.5m, Period = "MTD" });

        db.ReportDefinitions.AddRange(
            new ReportDefinition { Code = "RPT-01", Name = "Daily Sales by Hour", Category = "Sales", Owner = "Store Manager", Frequency = "Every 15 min", Format = "PDF/XLSX" },
            new ReportDefinition { Code = "RPT-05", Name = "Low Stock Report", Category = "Inventory", Owner = "Inventory Mgr", Frequency = "Every 30 min", Format = "XLSX" },
            new ReportDefinition { Code = "RPT-06", Name = "Returns Report", Category = "Returns", Owner = "Finance Mgr", Frequency = "Daily", Format = "PDF/XLSX" },
            new ReportDefinition { Code = "RPT-08", Name = "VAT / ZATCA Report", Category = "Compliance", Owner = "Finance Mgr", Frequency = "Daily", Format = "XLSX" },
            new ReportDefinition { Code = "RPT-12", Name = "Audit Trail", Category = "Admin", Owner = "Auditor", Frequency = "Weekly", Format = "CSV" });

        db.BiFeeds.AddRange(
            new BiFeed { Name = "Sales Feed", Source = "POS Transactions", Destination = "BI Warehouse", Frequency = "Every 30 min", Rows = 0, Failed = 0, Latency = "12s", Status = "Healthy" },
            new BiFeed { Name = "Inventory Feed", Source = "Stocks", Destination = "BI Warehouse", Frequency = "Every 30 min", Rows = 0, Failed = 0, Latency = "18s", Status = "Healthy" },
            new BiFeed { Name = "ZATCA Feed", Source = "Invoices", Destination = "Compliance DW", Frequency = "Every 15 min", Rows = 0, Failed = 0, Latency = "8s", Status = "Healthy" },
            new BiFeed { Name = "Delivery Feed", Source = "Dispatch", Destination = "Ops DW", Frequency = "Every 15 min", Rows = 0, Failed = 0, Latency = "6s", Status = "Healthy" });

        await db.SaveChangesAsync();
    }
}
