using System.Net.Http.Json;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using EcrBuilding.Tests.Infrastructure;

namespace EcrBuilding.Tests.Modules;

/// <summary>
/// The reports added to close out BRD §11's Reports &amp; Analytics list: delivery, driver
/// performance, shift/till reconciliation and surplus inventory returns.
///
/// Each test pins the one figure in its report that is derived rather than stored, because those are
/// the ones a refactor can silently break:
///   • punctuality is measured against the promised CALENDAR DAY, not a promised instant;
///   • a driver's on-time rate is scored over completed runs, not over everything assigned;
///   • an OPEN shift's cash sales must be derived live — the stored column is still 0 until close;
///   • a ticket-level restocking fee is apportioned across the ticket's lines, never repeated on each.
/// </summary>
public class DeliveryShiftAndSurplusReportTests : IAsyncLifetime
{
    private readonly CustomWebApplicationFactory _factory = new();

    public async Task InitializeAsync() => await _factory.InitializeDatabaseAsync();

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private HttpClient ReportsClient(AppDbContext db, Branch branch, string email = "insights@test.local")
    {
        var role = TestDataSeeder.AddRole(db, "Analyst", fullAccessModules: [ModuleArea.Insights]);
        var user = TestDataSeeder.AddUser(db, role, email, branchId: branch.Id);
        return _factory.CreateAuthenticatedClient(user);
    }

    private static string Day(int offsetDays = 0) => DateTime.UtcNow.Date.AddDays(offsetDays).ToString("yyyy-MM-dd");

    [Fact]
    public async Task Delivery_report_scores_punctuality_against_the_promised_day_and_totals_the_charges()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var category = TestDataSeeder.AddCategory(db);
        var product = TestDataSeeder.AddProduct(db, category);
        var today = DateTime.UtcNow.Date;

        // Delivered at 08:00 on the promised day. The promise is a calendar day with a free-text time
        // slot, so comparing timestamps would call this late against a midnight-stamped promise.
        var onTime = TestDataSeeder.AddDeliveryOrder(db, branch, "DO-ONTIME", DeliveryStage.Delivered);
        onTime.PromisedDate = today;
        onTime.DispatchedAt = today.AddHours(6);
        onTime.DeliveredAt = today.AddHours(8);
        onTime.Amount = 1_000m;
        onTime.FeeCharge = 50m;
        onTime.HandlingCharge = 20m;
        onTime.HeavyCharge = 30m;
        onTime.DiscountCharge = 10m;
        onTime.VatCharge = 13.5m;
        onTime.WeightTons = 4m;
        onTime.Lines.Add(new DeliveryOrderLine { ProductId = product.Id, Ordered = 100m, LoadedQty = 100m, DeliveredQty = 90m, MissingQty = 10m });

        var late = TestDataSeeder.AddDeliveryOrder(db, branch, "DO-LATE", DeliveryStage.Delivered);
        late.PromisedDate = today.AddDays(-3);
        late.DispatchedAt = today.AddDays(-1);
        late.DeliveredAt = today.AddDays(-1).AddHours(4);
        late.Lines.Add(new DeliveryOrderLine { ProductId = product.Id, Ordered = 10m, DeliveredQty = 10m });

        // Promised two days ago and still sitting there: overdue, but not a failure.
        var overdue = TestDataSeeder.AddDeliveryOrder(db, branch, "DO-OVERDUE", DeliveryStage.Assigned);
        overdue.PromisedDate = today.AddDays(-2);
        overdue.Lines.Add(new DeliveryOrderLine { ProductId = product.Id, Ordered = 5m });
        db.SaveChanges();

        var client = ReportsClient(db, branch);
        var rows = await client.GetFromJsonAsync<List<DeliveryTestRow>>(
            $"/api/insights/reports/delivery-orders?from={Day(-7)}&to={Day()}");

        Assert.NotNull(rows);
        Assert.Equal(3, rows!.Count);

        var good = Assert.Single(rows, r => r.DeliveryNo == "DO-ONTIME");
        Assert.Equal("On Time", good.Punctuality);
        Assert.Equal(0, good.DaysLate);
        Assert.Equal(2m, good.CycleHours);
        // 50 + 20 + 30 − 10 + 13.5: the charge discount comes off, VAT on the charges goes on.
        Assert.Equal(103.5m, good.TotalCharges);
        Assert.Equal(90m, good.QtyDelivered);
        Assert.Equal(10m, good.QtyMissing);
        Assert.Equal(90m, good.FulfilledPct);

        var slow = Assert.Single(rows, r => r.DeliveryNo == "DO-LATE");
        Assert.Equal("Late", slow.Punctuality);
        Assert.Equal(2, slow.DaysLate);

        var waiting = Assert.Single(rows, r => r.DeliveryNo == "DO-OVERDUE");
        Assert.Equal("Overdue", waiting.Punctuality);
        Assert.Equal(2, waiting.DaysLate);

        // A stage filter is a real constraint, and repeated params widen rather than intersect.
        var delivered = await client.GetFromJsonAsync<List<DeliveryTestRow>>(
            $"/api/insights/reports/delivery-orders?from={Day(-7)}&to={Day()}&stage=Delivered");
        Assert.Equal(2, delivered!.Count);
        var both = await client.GetFromJsonAsync<List<DeliveryTestRow>>(
            $"/api/insights/reports/delivery-orders?from={Day(-7)}&to={Day()}&stage=Delivered&stage=Assigned");
        Assert.Equal(3, both!.Count);
        var noMatch = await client.GetFromJsonAsync<List<DeliveryTestRow>>(
            $"/api/insights/reports/delivery-orders?from={Day(-7)}&to={Day()}&branchId=9999");
        Assert.Empty(noMatch!);
    }

    [Fact]
    public async Task Driver_performance_scores_punctuality_over_completed_runs_only()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var category = TestDataSeeder.AddCategory(db);
        var product = TestDataSeeder.AddProduct(db, category);
        var today = DateTime.UtcNow.Date;

        var vehicle = new Vehicle { Registration = "ABC-1234", Type = VehicleType.FlatbedTruck, BranchId = branch.Id, CapacityTons = 10m };
        db.Vehicles.Add(vehicle);
        db.SaveChanges();
        var driver = new Driver
        {
            Name = "Khalid", BranchId = branch.Id, Mobile = "0500000000", License = "L-1",
            LicenseExpiry = today.AddYears(1), VehicleId = vehicle.Id,
        };
        db.Drivers.Add(driver);
        db.SaveChanges();

        // Two delivered (one on time, one late) and two still in flight. Scoring on-time over all
        // four would report 25% for a driver who has actually hit half their completed runs.
        var d1 = TestDataSeeder.AddDeliveryOrder(db, branch, "DO-1", DeliveryStage.Delivered);
        d1.DriverId = driver.Id;
        d1.VehicleId = vehicle.Id;
        d1.PromisedDate = today;
        d1.DispatchedAt = today.AddHours(7);
        d1.DeliveredAt = today.AddHours(10);
        d1.WeightTons = 3m;
        d1.Amount = 500m;
        d1.Lines.Add(new DeliveryOrderLine { ProductId = product.Id, Ordered = 20m, DeliveredQty = 20m });

        var d2 = TestDataSeeder.AddDeliveryOrder(db, branch, "DO-2", DeliveryStage.Delivered);
        d2.DriverId = driver.Id;
        d2.VehicleId = vehicle.Id;
        d2.PromisedDate = today.AddDays(-2);
        d2.DispatchedAt = today.AddDays(-1).AddHours(8);
        d2.DeliveredAt = today.AddDays(-1).AddHours(9);
        d2.WeightTons = 2m;
        d2.Amount = 300m;
        d2.Lines.Add(new DeliveryOrderLine { ProductId = product.Id, Ordered = 20m, DeliveredQty = 10m, MissingQty = 10m });

        foreach (var no in new[] { "DO-3", "DO-4" })
        {
            var pending = TestDataSeeder.AddDeliveryOrder(db, branch, no, DeliveryStage.Dispatched);
            pending.DriverId = driver.Id;
            pending.VehicleId = vehicle.Id;
            pending.PromisedDate = today.AddDays(1);
        }
        db.SaveChanges();

        var client = ReportsClient(db, branch);
        var rows = await client.GetFromJsonAsync<List<DriverPerformanceTestRow>>(
            $"/api/insights/reports/driver-performance?from={Day(-7)}&to={Day()}");

        var row = Assert.Single(rows!);
        Assert.Equal("Khalid", row.Driver);
        Assert.Equal(4, row.Deliveries);
        Assert.Equal(2, row.Delivered);
        Assert.Equal(2, row.InFlight);
        Assert.Equal(50m, row.OnTimePct);
        Assert.Equal(2m, row.AvgCycleHours);
        // Averaged over both completed runs: 0 days on the punctual one, 1 on the late one.
        Assert.Equal(0.5m, row.AvgDaysLate);
        // Tonnage, value and fulfilment count the completed runs, not the ones still on the truck.
        Assert.Equal(5m, row.TonnageDelivered);
        Assert.Equal(800m, row.DeliveredValue);
        Assert.Equal(30m, row.QtyDelivered);
        Assert.Equal(10m, row.QtyMissing);
        Assert.Equal(75m, row.FulfilmentPct);
    }

    [Fact]
    public async Task Shift_report_derives_open_shift_cash_sales_and_never_calls_an_uncounted_drawer_balanced()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var category = TestDataSeeder.AddCategory(db);
        var product = TestDataSeeder.AddProduct(db, category);
        var role = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos]);
        var cashier = TestDataSeeder.AddUser(db, role, "till@test.local", "Sara Ali", branch.Id);
        var terminal = new Terminal { Code = "T1", Name = "Till 1", BranchId = branch.Id };
        db.Terminals.Add(terminal);
        db.SaveChanges();

        var openedAt = DateTime.UtcNow.AddHours(-4);
        var openShift = new CashierShift
        {
            TerminalId = terminal.Id, CashierUserId = cashier.Id, OpenedAt = openedAt,
            OpeningFloat = 500m, CashIn = 100m, CashOut = 40m, Status = CashierShiftStatus.Open,
        };
        db.CashierShifts.Add(openShift);
        db.SaveChanges();

        db.CashMovements.AddRange(
            new CashMovement { CashierShiftId = openShift.Id, Direction = CashMovementDirection.In, Amount = 100m, Reason = "Change fund" },
            new CashMovement { CashierShiftId = openShift.Id, Direction = CashMovementDirection.Out, Amount = 40m, Reason = "Safe drop" });

        // Cash and card on the same till inside the shift window. CashierShift.CashSales is still 0
        // on an open shift, so the expected drawer has to be derived from the paid cash payments —
        // reading the stored column understates it by the whole shift's takings.
        db.Orders.AddRange(
            new Order
            {
                OrderNo = "SO-CASH", BranchId = branch.Id, TerminalId = terminal.Id, CashierUserId = cashier.Id,
                Status = OrderStatus.Completed, PaymentStatus = Domain.Entities.PaymentStatus.Paid,
                SubTotal = 1_000m, DiscountTotal = 0m, VatTotal = 150m, GrandTotal = 1_150m,
                Lines = [new OrderLine { ProductId = product.Id, Qty = 10, StockQty = 10, UnitPrice = 100m, LineTotal = 1_000m }],
                Payments = [new OrderPayment { Method = Domain.Entities.PaymentMethod.Cash, Amount = 1_150m }],
            },
            new Order
            {
                OrderNo = "SO-CARD", BranchId = branch.Id, TerminalId = terminal.Id, CashierUserId = cashier.Id,
                Status = OrderStatus.Completed, PaymentStatus = Domain.Entities.PaymentStatus.Paid,
                SubTotal = 200m, VatTotal = 30m, GrandTotal = 230m,
                Lines = [new OrderLine { ProductId = product.Id, Qty = 2, StockQty = 2, UnitPrice = 100m, LineTotal = 200m }],
                Payments = [new OrderPayment { Method = Domain.Entities.PaymentMethod.Mada, Amount = 230m }],
            },
            // Voided: counted and priced separately, never in a takings figure.
            new Order
            {
                OrderNo = "SO-VOID", BranchId = branch.Id, TerminalId = terminal.Id, CashierUserId = cashier.Id,
                Status = OrderStatus.Voided, SubTotal = 100m, VatTotal = 15m, GrandTotal = 115m,
            });
        db.SaveChanges();

        // BaseEntity stamps CreatedAt on insert; place the sales inside the shift's own window rather
        // than relying on "now" happening to fall there.
        var minutes = 30;
        foreach (var seeded in db.Orders.Where(o => o.TerminalId == terminal.Id).ToList())
        {
            seeded.CreatedAt = openedAt.AddMinutes(minutes);
            minutes += 5;
        }
        db.SaveChanges();

        var client = ReportsClient(db, branch);
        var rows = await client.GetFromJsonAsync<List<ShiftReportTestRow>>(
            $"/api/insights/reports/shift-report?from={Day(-1)}&to={Day()}");

        var row = Assert.Single(rows!);
        Assert.Equal("Till 1", row.Terminal);
        Assert.Equal("Sara Ali", row.Cashier);
        Assert.Equal("Open", row.Status);
        Assert.Equal(1_150m, row.CashSales);
        Assert.Equal(230m, row.NonCashTakings);
        // 500 float + 1150 cash + 100 in − 40 out.
        Assert.Equal(1_710m, row.ExpectedCash);
        Assert.Null(row.CountedCash);
        Assert.Equal("Uncounted", row.CashResult);
        Assert.Equal(0m, row.Variance);
        Assert.Equal(2, row.Orders);
        Assert.Equal(1_380m, row.NetTakings);
        Assert.Equal(1, row.VoidedOrders);
        Assert.Equal(115m, row.VoidedValue);
        Assert.Equal(2, row.CashMovements);
        Assert.Equal(2, row.Items.Count);

        // Close it short and the drawer is reported as a shortage against the frozen CashSales.
        openShift.CashSales = 1_150m;
        openShift.CountedCash = 1_700m;
        openShift.ClosedAt = DateTime.UtcNow;
        openShift.Status = CashierShiftStatus.Closed;
        db.SaveChanges();

        var closed = await client.GetFromJsonAsync<List<ShiftReportTestRow>>(
            $"/api/insights/reports/shift-report?from={Day(-1)}&to={Day()}");
        var closedRow = Assert.Single(closed!);
        Assert.Equal(-10m, closedRow.Variance);
        Assert.Equal("Shortage", closedRow.CashResult);

        var noMatch = await client.GetFromJsonAsync<List<ShiftReportTestRow>>(
            $"/api/insights/reports/shift-report?from={Day(-1)}&to={Day()}&terminalId=9999");
        Assert.Empty(noMatch!);
    }

    [Fact]
    public async Task Surplus_returns_apportion_the_ticket_restocking_fee_across_its_lines()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var category = TestDataSeeder.AddCategory(db);
        var cement = TestDataSeeder.AddProduct(db, category, sku: "CEM-001", nameEn: "Portland Cement 50kg");
        var rebar = TestDataSeeder.AddProduct(db, category, sku: "STL-001", nameEn: "Rebar 12mm");
        cement.CostPrice = 20m;
        rebar.CostPrice = 40m;
        var role = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos]);
        var cashier = TestDataSeeder.AddUser(db, role, "sales@test.local", "Sara Ali", branch.Id);
        var customer = TestDataSeeder.AddCustomer(db);
        db.SaveChanges();

        var order = new Order
        {
            OrderNo = "SO-100", BranchId = branch.Id, CashierUserId = cashier.Id, CustomerId = customer.Id,
            Status = OrderStatus.Completed, SubTotal = 900m, VatTotal = 135m, GrandTotal = 1_035m,
        };
        db.Orders.Add(order);
        db.SaveChanges();
        // BaseEntity stamps CreatedAt on insert, so the sale has to be backdated in a second save —
        // Days Held is the gap between the sale and the return, and both would otherwise be "now".
        order.CreatedAt = DateTime.UtcNow.AddDays(-10);
        db.SaveChanges();

        // One ticket, two lines, a 10% ticket-level restocking fee of 90. Repeating the whole 90 on
        // each row would make the report claim 180 was recovered.
        db.Returns.Add(new Return
        {
            ReturnNo = "RT-SUR-1", OrderId = order.Id, CustomerId = customer.Id, Type = ReturnType.Surplus,
            Status = ReturnStatus.Completed, Reason = "Project finished early", RefundMethod = "Cash",
            GrossRefund = 900m, VatReversal = 135m, RestockingFeePct = 10m, RestockingFeeAmount = 90m,
            NetCashback = 945m,
            Lines =
            [
                new ReturnLine { ProductId = cement.Id, Qty = 20, StockQty = 20, UnitPricePaid = 30m, VatRate = 15m, Amount = 600m },
                new ReturnLine { ProductId = rebar.Id, Qty = 5, StockQty = 5, UnitPricePaid = 60m, VatRate = 15m, Amount = 300m },
            ],
        });
        // A damaged return in the same window must not leak into a surplus report.
        db.Returns.Add(new Return
        {
            ReturnNo = "RT-DMG-1", OrderId = order.Id, Type = ReturnType.Damaged, Status = ReturnStatus.Completed,
            Reason = "Crushed pallet", RefundMethod = "Cash", DamageReason = DamageReasonCode.TransitDamage,
            Lines = [new ReturnLine { ProductId = cement.Id, Qty = 2, StockQty = 2, UnitPricePaid = 30m, Amount = 60m }],
        });
        db.SaveChanges();

        var client = ReportsClient(db, branch);
        var rows = await client.GetFromJsonAsync<List<SurplusReturnTestRow>>(
            $"/api/insights/reports/surplus-returns?from={Day(-30)}&to={Day()}");

        Assert.NotNull(rows);
        Assert.Equal(2, rows!.Count);
        Assert.DoesNotContain(rows, r => r.ReturnNo == "RT-DMG-1");
        Assert.Equal(90m, rows.Sum(r => r.RestockingFee));
        Assert.Equal(945m, rows.Sum(r => r.NetCashback));

        var cementRow = Assert.Single(rows, r => r.Sku == "CEM-001");
        Assert.Equal(20m, cementRow.Qty);
        Assert.Equal(600m, cementRow.RefundAmount);
        // 20 units back on the shelf at the 20.00 cost price.
        Assert.Equal(400m, cementRow.RestockValue);
        Assert.Equal(60m, cementRow.RestockingFee);
        Assert.Equal(10, cementRow.DaysHeld);

        var rebarRow = Assert.Single(rows, r => r.Sku == "STL-001");
        Assert.Equal(200m, rebarRow.RestockValue);
        Assert.Equal(30m, rebarRow.RestockingFee);

        // A product filter narrows to the lines that carried it, not to whole tickets.
        var cementOnly = await client.GetFromJsonAsync<List<SurplusReturnTestRow>>(
            $"/api/insights/reports/surplus-returns?from={Day(-30)}&to={Day()}&productId={cement.Id}");
        Assert.Equal("CEM-001", Assert.Single(cementOnly!).Sku);
    }

    [Fact]
    public async Task Vat_report_declares_zero_rated_turnover_and_nets_every_cut_to_the_same_total()
    {
        using var db = _factory.CreateDbContext();
        var riyadh = TestDataSeeder.AddBranch(db, "BR1", "Riyadh Main");
        var jeddah = TestDataSeeder.AddBranch(db, "BR2", "Jeddah");
        var category = TestDataSeeder.AddCategory(db);
        // 15% standard-rated, and an exported/zero-rated line that a VAT return still has to declare.
        var standard = TestDataSeeder.AddProduct(db, category, sku: "CEM-001", vatRate: 15m);
        var zeroRated = TestDataSeeder.AddProduct(db, category, sku: "EXP-001", vatRate: 0m);
        var role = TestDataSeeder.AddRole(db, "Cashier", fullAccessModules: [ModuleArea.Pos]);
        var cashier = TestDataSeeder.AddUser(db, role, "vat@test.local", "Sara Ali", riyadh.Id);
        var customer = TestDataSeeder.AddCustomer(db);

        var retail = new Order
        {
            OrderNo = "SO-R1", BranchId = riyadh.Id, CashierUserId = cashier.Id, Type = OrderType.Retail,
            Status = OrderStatus.Completed, SubTotal = 1_000m, VatTotal = 150m, GrandTotal = 1_150m,
            Lines =
            [
                new OrderLine { ProductId = standard.Id, Qty = 10, StockQty = 10, UnitPrice = 100m, VatRate = 15m, LineTotal = 1_000m },
            ],
        };
        var contractor = new Order
        {
            OrderNo = "SO-C1", BranchId = jeddah.Id, CashierUserId = cashier.Id, CustomerId = customer.Id,
            Type = OrderType.Contractor, Status = OrderStatus.Completed,
            SubTotal = 700m, VatTotal = 30m, GrandTotal = 730m,
            Lines =
            [
                new OrderLine { ProductId = standard.Id, Qty = 2, StockQty = 2, UnitPrice = 100m, VatRate = 15m, LineTotal = 200m },
                new OrderLine { ProductId = zeroRated.Id, Qty = 5, StockQty = 5, UnitPrice = 100m, VatRate = 0m, LineTotal = 500m },
            ],
        };
        // Voided sales never reach a VAT figure.
        var voided = new Order
        {
            OrderNo = "SO-V1", BranchId = riyadh.Id, CashierUserId = cashier.Id, Status = OrderStatus.Voided,
            SubTotal = 400m, VatTotal = 60m, GrandTotal = 460m,
            Lines = [new OrderLine { ProductId = standard.Id, Qty = 4, StockQty = 4, UnitPrice = 100m, VatRate = 15m, LineTotal = 400m }],
        };
        db.Orders.AddRange(retail, contractor, voided);
        db.SaveChanges();

        // A credit note reversing 30.00 of the retail sale's output VAT.
        db.Returns.Add(new Return
        {
            ReturnNo = "RT-1", OrderId = retail.Id, Type = ReturnType.Standard, Status = ReturnStatus.Completed,
            Reason = "Wrong item", RefundMethod = "Cash", GrossRefund = 200m, VatReversal = 30m, NetCashback = 230m,
            Lines = [new ReturnLine { ProductId = standard.Id, Qty = 2, StockQty = 2, UnitPricePaid = 100m, VatRate = 15m, Amount = 200m }],
        });
        db.SaveChanges();

        var client = ReportsClient(db, riyadh);
        var report = await client.GetFromJsonAsync<VatTestDto>(
            $"/api/insights/reports/vat?from={Day(-7)}&to={Day()}");

        Assert.NotNull(report);
        // 1000 + 200 + 500 taxable; the voided 400 is excluded.
        Assert.Equal(1_700m, report!.TaxableSales);
        Assert.Equal(180m, report.TotalCollected);
        Assert.Equal(30m, report.TotalReversed);
        Assert.Equal(150m, report.NetVat);

        // Zero-rated turnover gets its own declared row rather than being dropped for collecting nothing.
        var zero = Assert.Single(report.Collected, r => r.Rate == 0);
        Assert.Equal("Zero-rated", zero.RateLabel);
        Assert.Equal(500m, zero.TaxableAmount);
        Assert.Equal(0m, zero.VatCollected);

        var fifteen = Assert.Single(report.Collected, r => r.Rate == 15m);
        Assert.Equal(180m, fifteen.VatCollected);
        Assert.Equal(30m, fifteen.VatReversed);
        Assert.Equal(150m, fifteen.NetVat);

        // The rate rows are the report — they must sum back to the headline figures rather than to a
        // separately recomputed total.
        Assert.Equal(180m, report.Collected.Sum(r => r.VatCollected));
        Assert.Equal(30m, report.Collected.Sum(r => r.VatReversed));
        Assert.Equal(1_700m, report.Collected.Sum(r => r.TaxableAmount));

        // A branch filter narrows to that branch's own sales.
        var jeddahOnly = await client.GetFromJsonAsync<VatTestDto>(
            $"/api/insights/reports/vat?from={Day(-7)}&to={Day()}&branchId={jeddah.Id}");
        Assert.Equal(30m, jeddahOnly!.TotalCollected);
        Assert.Equal(0m, jeddahOnly.TotalReversed);
    }

    // BRD §11.2/§3.2.1: the order-wise VAT trace — every sale and every return/exchange credit note
    // as its own row, cross-referenced back to the order or return that produced it. An Exchange must
    // show as a LINKED PAIR (the return that reverses VAT on the returned item, and the "Exchange
    // Sale" that collects VAT on the replacement item) rather than as one blended, unexplained figure.
    [Fact]
    public async Task VatTransactions_report_traces_a_standard_return_and_an_exchange_back_to_their_orders()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        var category = TestDataSeeder.AddCategory(db);
        var product = TestDataSeeder.AddProduct(db, category, sellingPrice: 100m, vatRate: 15m);
        var replacement = TestDataSeeder.AddProduct(db, category, sku: "REPL-1", sellingPrice: 50m, vatRate: 15m);
        var cashier = TestDataSeeder.AddUser(db, TestDataSeeder.AddRole(db, "Cashier"), "vat-txn-cashier@test.local", branchId: branch.Id);
        var customer = TestDataSeeder.AddCustomer(db);

        // Order A: a plain sale, later given a Standard return on part of it.
        var orderA = new Order
        {
            OrderNo = "SO-VTX-A", BranchId = branch.Id, CashierUserId = cashier.Id, CustomerId = customer.Id,
            Status = OrderStatus.Completed, SubTotal = 1_000m, VatTotal = 150m, GrandTotal = 1_150m,
            Lines = [new OrderLine { ProductId = product.Id, Qty = 10, StockQty = 10, UnitPrice = 100m, VatRate = 15m, LineTotal = 1_000m }],
        };
        // Order B: the sale later exchanged.
        var orderB = new Order
        {
            OrderNo = "SO-VTX-B", BranchId = branch.Id, CashierUserId = cashier.Id, CustomerId = customer.Id,
            Status = OrderStatus.Completed, SubTotal = 100m, VatTotal = 15m, GrandTotal = 115m,
            Lines = [new OrderLine { ProductId = product.Id, Qty = 1, StockQty = 1, UnitPrice = 100m, VatRate = 15m, LineTotal = 100m }],
        };
        db.Orders.AddRange(orderA, orderB);
        db.SaveChanges();

        // The Exchange's replacement item — a real new Order, exactly as FinanceController.
        // ReturnsController.Approve creates one, linked back to the Return via ExchangeOrderId.
        var exchangeOrder = new Order
        {
            OrderNo = "SO-VTX-EXC", BranchId = branch.Id, CashierUserId = cashier.Id, CustomerId = customer.Id,
            Status = OrderStatus.Completed, SubTotal = 50m, VatTotal = 7.5m, GrandTotal = 57.5m,
            Lines = [new OrderLine { ProductId = replacement.Id, Qty = 1, StockQty = 1, UnitPrice = 50m, VatRate = 15m, LineTotal = 50m }],
        };
        db.Orders.Add(exchangeOrder);
        db.SaveChanges();

        db.Returns.AddRange(
            new Return
            {
                ReturnNo = "RT-VTX-STD", OrderId = orderA.Id, CustomerId = customer.Id, Type = ReturnType.Standard,
                Status = ReturnStatus.Completed, Reason = "wrong item", RefundMethod = "Cash",
                GrossRefund = 200m, VatReversal = 30m, NetCashback = 230m,
                Lines = [new ReturnLine { ProductId = product.Id, Qty = 2, StockQty = 2, UnitPricePaid = 100m, VatRate = 15m, Amount = 200m }],
            },
            new Return
            {
                ReturnNo = "RT-VTX-EXC", OrderId = orderB.Id, CustomerId = customer.Id, Type = ReturnType.Exchange,
                Status = ReturnStatus.Completed, Reason = "swap for cheaper item", RefundMethod = "Cash",
                GrossRefund = 100m, VatReversal = 15m, NetCashback = 115m, ExchangeOrderId = exchangeOrder.Id,
                Lines = [new ReturnLine { ProductId = product.Id, Qty = 1, StockQty = 1, UnitPricePaid = 100m, VatRate = 15m, Amount = 100m }],
            });
        db.SaveChanges();

        var client = ReportsClient(db, branch);
        var rows = await client.GetFromJsonAsync<List<VatTransactionTestRow>>(
            $"/api/insights/reports/vat/transactions?from={Day(-7)}&to={Day()}");
        Assert.NotNull(rows);

        var saleA = Assert.Single(rows!, r => r.DocNo == "SO-VTX-A");
        Assert.Equal("Sale", saleA.DocType);
        Assert.Null(saleA.LinkedDocNo);
        Assert.Equal(150m, saleA.VatCollected);
        Assert.Equal(0m, saleA.VatReversed);

        var stdReturn = Assert.Single(rows!, r => r.DocNo == "RT-VTX-STD");
        Assert.Equal("Standard Return", stdReturn.DocType);
        Assert.Equal("SO-VTX-A", stdReturn.LinkedDocNo);
        Assert.Equal(0m, stdReturn.VatCollected);
        Assert.Equal(30m, stdReturn.VatReversed);
        Assert.Equal(-30m, stdReturn.NetVat);

        // The Exchange's two halves must both appear and cross-reference each other — neither side
        // is an orphaned figure.
        var excReturn = Assert.Single(rows!, r => r.DocNo == "RT-VTX-EXC");
        Assert.Equal("Exchange Return", excReturn.DocType);
        Assert.Equal("SO-VTX-B", excReturn.LinkedDocNo);
        Assert.Equal(15m, excReturn.VatReversed);

        var excSale = Assert.Single(rows!, r => r.DocNo == "SO-VTX-EXC");
        Assert.Equal("Exchange Sale", excSale.DocType);
        Assert.Equal("RT-VTX-EXC", excSale.LinkedDocNo);
        Assert.Equal(7.5m, excSale.VatCollected);
        Assert.Equal(0m, excSale.VatReversed);

        // Net VAT reconciles: 150 + 15 + 7.5 collected − 30 − 15 reversed = 127.5.
        Assert.Equal(127.5m, rows!.Sum(r => r.NetVat));
    }

    [Fact]
    public async Task Filter_options_expose_the_fleet_and_till_dimensions_the_new_reports_filter_on()
    {
        using var db = _factory.CreateDbContext();
        var branch = TestDataSeeder.AddBranch(db);
        TestDataSeeder.AddDeliveryZone(db, "Zone A", "Riyadh");
        var vehicle = new Vehicle { Registration = "ABC-1234", Type = VehicleType.BoxTruck, BranchId = branch.Id };
        db.Vehicles.Add(vehicle);
        db.Terminals.Add(new Terminal { Code = "T1", Name = "Till 1", BranchId = branch.Id });
        db.SaveChanges();
        db.Drivers.Add(new Driver { Name = "Khalid", BranchId = branch.Id, Mobile = "0500000000", License = "L-1", LicenseExpiry = DateTime.UtcNow.AddYears(1) });
        db.SaveChanges();

        var client = ReportsClient(db, branch);
        var options = await client.GetFromJsonAsync<FilterOptionsTestDto>("/api/insights/reports/filter-options");

        Assert.NotNull(options);
        Assert.Contains(options!.Terminals, o => o.Label == "Till 1");
        Assert.Contains(options.Drivers, o => o.Label == "Khalid");
        Assert.Contains(options.Vehicles, o => o.Label == "ABC-1234");
        // Zone options are keyed by NAME, because DeliveryOrder.Area stores the name — ids match nothing.
        Assert.Contains(options.DeliveryZones, o => o.Id == "Zone A");
        Assert.Contains("Delivered", options.DeliveryStages);
        Assert.Contains("Urgent", options.DeliveryPriorities);
        Assert.Contains("Open", options.ShiftStatuses);
    }

    private record DeliveryTestRow(
        string DeliveryNo, string Punctuality, int DaysLate, decimal? CycleHours, decimal TotalCharges,
        decimal QtyDelivered, decimal QtyMissing, decimal FulfilledPct);

    private record DriverPerformanceTestRow(
        string Driver, int Deliveries, int Delivered, int InFlight, int Failed, decimal OnTimePct,
        decimal AvgCycleHours, decimal AvgDaysLate, decimal TonnageDelivered, decimal DeliveredValue,
        decimal QtyDelivered, decimal QtyMissing, decimal FulfilmentPct);

    private record ShiftCashMovementTestRow(string Direction, decimal Amount, string Reason);

    private record ShiftReportTestRow(
        string Terminal, string Cashier, string Status, decimal CashSales, decimal NonCashTakings,
        decimal ExpectedCash, decimal? CountedCash, decimal Variance, string CashResult, int Orders,
        decimal NetTakings, int VoidedOrders, decimal VoidedValue, int CashMovements,
        IReadOnlyList<ShiftCashMovementTestRow> Items);

    private record SurplusReturnTestRow(
        string ReturnNo, string Sku, decimal Qty, decimal RefundAmount, decimal RestockValue,
        decimal RestockingFee, decimal NetCashback, int? DaysHeld);

    private record VatByRateTestRow(
        decimal Rate, string RateLabel, int Orders, decimal TaxableAmount, decimal VatCollected,
        decimal VatReversed, decimal NetVat, decimal SharePct);

    private record VatTestDto(
        decimal TaxableSales, decimal TotalCollected, decimal TotalReversed, decimal NetVat,
        IReadOnlyList<VatByRateTestRow> Collected);

    private record VatTransactionTestRow(
        DateTime Date, string DocNo, string DocType, string? LinkedDocNo, string Customer,
        decimal TaxableAmount, decimal VatCollected, decimal VatReversed, decimal NetVat);

    private record FilterOptionTestRow(string Id, string Label, string? Sub);

    private record FilterOptionsTestDto(
        IReadOnlyList<FilterOptionTestRow> Terminals, IReadOnlyList<FilterOptionTestRow> Drivers,
        IReadOnlyList<FilterOptionTestRow> Vehicles, IReadOnlyList<FilterOptionTestRow> DeliveryZones,
        IReadOnlyList<string> DeliveryStages, IReadOnlyList<string> DeliveryPriorities,
        IReadOnlyList<string> ShiftStatuses);
}
