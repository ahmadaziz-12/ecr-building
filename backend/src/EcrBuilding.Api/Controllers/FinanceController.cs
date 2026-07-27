using EcrBuilding.Api.Authorization;
using EcrBuilding.Application.Abstractions;
using EcrBuilding.Application.Finance;
using EcrBuilding.Domain.Common;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Api.Controllers;

[ApiController]
[Route("api/finance/expenses")]
[Authorize]
[RequireModule("/finance/expenses", PermissionAction.View)]
public class ExpensesController(AppDbContext db, IAuditService audit, IGlPostingService gl) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<ExpenseDto>>> List(CancellationToken ct)
    {
        var rows = await db.Expenses.Include(e => e.Branch).OrderByDescending(e => e.Date).ToListAsync(ct);
        return Ok(rows.Select(Map).ToList());
    }

    [HttpPost]
    [RequireModule("/finance/expenses", PermissionAction.Create)]
    public async Task<ActionResult<ExpenseDto>> Create(CreateExpenseRequest request, CancellationToken ct)
    {
        var expense = new Expense
        {
            ExpenseNo = $"EXP-{DateTime.UtcNow:yyyy}-{await db.Expenses.CountAsync(ct) + 1:D4}",
            Date = request.Date, BranchId = request.BranchId, Category = request.Category, Description = request.Description,
            Vendor = request.Vendor, Amount = request.Amount, Vat = request.Vat, Method = request.Method,
        };
        db.Expenses.Add(expense);
        await db.SaveChangesAsync(ct);
        await db.Entry(expense).Reference(e => e.Branch).LoadAsync(ct);
        await audit.LogAsync("finance", "EXPENSE_CREATED", expense.Id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(expense));
    }

    [HttpPut("{id:int}/status")]
    [RequireModule("/finance/expenses", PermissionAction.Approve)]
    public async Task<ActionResult<ExpenseDto>> UpdateStatus(int id, UpdateExpenseStatusRequest request, CancellationToken ct)
    {
        var expense = await db.Expenses.Include(e => e.Branch).FirstOrDefaultAsync(e => e.Id == id, ct);
        if (expense is null) return NotFound();

        expense.Status = Enum.Parse<ExpenseStatus>(request.Status);
        expense.ApproverUserId = request.ApproverUserId;
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("finance", $"EXPENSE_{expense.Status.ToString().ToUpperInvariant()}", id.ToString(), cancellationToken: ct);

        if (expense.Status == ExpenseStatus.Approved)
        {
            await gl.PostAsync(expense.ExpenseNo, $"Expense: {expense.Description}",
                [new GlLine("5100", expense.Amount + expense.Vat, 0), new GlLine("1000", 0, expense.Amount + expense.Vat)], ct);
        }
        return Ok(Map(expense));
    }

    [HttpPut("{id:int}/reconcile")]
    [RequireModule("/finance/expenses", PermissionAction.Edit)]
    public async Task<ActionResult<ExpenseDto>> Reconcile(int id, CancellationToken ct)
    {
        var expense = await db.Expenses.Include(e => e.Branch).FirstOrDefaultAsync(e => e.Id == id, ct);
        if (expense is null) return NotFound();
        if (expense.Status != ExpenseStatus.Approved)
        {
            return BadRequest(new { error = "Only an approved expense can be reconciled." });
        }

        expense.Reconciled = true;
        expense.ReconciledAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("finance", "EXPENSE_RECONCILED", id.ToString(), cancellationToken: ct);
        return Ok(Map(expense));
    }

    private static ExpenseDto Map(Expense e) => new(
        e.Id, e.ExpenseNo, e.Date, e.BranchId, e.Branch?.NameEn ?? "", e.Category, e.Description, e.Vendor, e.Amount, e.Vat, e.Method, e.Status.ToString(), e.Reconciled);
}

[ApiController]
[Route("api/finance/tax-codes")]
[Authorize]
[RequireModule("/finance/tax-zatca", PermissionAction.View)]
public class TaxCodesController(AppDbContext db, IAuditService audit) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<TaxCodeDto>>> List(CancellationToken ct)
    {
        var rows = await db.TaxCodes.Include(t => t.GlAccount).Include(t => t.Branch).OrderBy(t => t.Code).ToListAsync(ct);
        return Ok(rows.Select(Map).ToList());
    }

    [HttpPost]
    [RequireModule("/finance/tax-zatca", PermissionAction.Create)]
    public async Task<ActionResult<TaxCodeDto>> Create(UpsertTaxCodeRequest request, CancellationToken ct)
    {
        if (request.BranchId is not null && !await db.Branches.AnyAsync(b => b.Id == request.BranchId, ct))
        {
            return BadRequest(new { error = "Unknown branch." });
        }
        var glAccount = request.GlAccountCode is null ? null : await db.Accounts.FirstOrDefaultAsync(a => a.Code == request.GlAccountCode, ct);
        var taxCode = new TaxCode
        {
            Code = request.Code, Name = request.Name, Type = request.Type, Rate = request.Rate,
            AppliesTo = request.AppliesTo, EffectiveFrom = request.EffectiveFrom, GlAccountId = glAccount?.Id, BranchId = request.BranchId,
        };
        db.TaxCodes.Add(taxCode);
        await db.SaveChangesAsync(ct);
        await db.Entry(taxCode).Reference(t => t.GlAccount).LoadAsync(ct);
        if (taxCode.BranchId is not null) await db.Entry(taxCode).Reference(t => t.Branch).LoadAsync(ct);
        await audit.LogAsync("finance", "TAX_CODE_CREATED", taxCode.Id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(taxCode));
    }

    [HttpPut("{id:int}")]
    [RequireModule("/finance/tax-zatca", PermissionAction.Edit)]
    public async Task<ActionResult<TaxCodeDto>> Update(int id, UpsertTaxCodeRequest request, CancellationToken ct)
    {
        var taxCode = await db.TaxCodes.FindAsync([id], ct);
        if (taxCode is null) return NotFound();
        if (request.BranchId is not null && !await db.Branches.AnyAsync(b => b.Id == request.BranchId, ct))
        {
            return BadRequest(new { error = "Unknown branch." });
        }

        var glAccount = request.GlAccountCode is null ? null : await db.Accounts.FirstOrDefaultAsync(a => a.Code == request.GlAccountCode, ct);
        taxCode.Code = request.Code; taxCode.Name = request.Name; taxCode.Type = request.Type; taxCode.Rate = request.Rate;
        taxCode.AppliesTo = request.AppliesTo; taxCode.EffectiveFrom = request.EffectiveFrom; taxCode.GlAccountId = glAccount?.Id;
        taxCode.BranchId = request.BranchId;

        await db.SaveChangesAsync(ct);
        await db.Entry(taxCode).Reference(t => t.GlAccount).LoadAsync(ct);
        await db.Entry(taxCode).Reference(t => t.Branch).LoadAsync(ct);
        await audit.LogAsync("finance", "TAX_CODE_UPDATED", id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(taxCode));
    }

    [HttpPut("{id:int}/status")]
    [RequireModule("/finance/tax-zatca", PermissionAction.Delete)]
    public async Task<ActionResult<TaxCodeDto>> UpdateStatus(int id, EcrBuilding.Application.Catalog.SetStatusRequest request, CancellationToken ct)
    {
        var taxCode = await db.TaxCodes.Include(t => t.GlAccount).Include(t => t.Branch).FirstOrDefaultAsync(t => t.Id == id, ct);
        if (taxCode is null) return NotFound();

        taxCode.Status = Enum.Parse<EntityStatus>(request.Status);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("finance", $"TAX_CODE_{taxCode.Status.ToString().ToUpperInvariant()}", id.ToString(), cancellationToken: ct);
        return Ok(Map(taxCode));
    }

    private static TaxCodeDto Map(TaxCode t) => new(t.Id, t.Code, t.Name, t.Type, t.Rate, t.AppliesTo, t.EffectiveFrom, t.GlAccount?.Code, t.Status.ToString(), t.BranchId, t.Branch?.NameEn);
}

[ApiController]
[Route("api/finance/returns")]
[Authorize]
[RequireModule("/finance/returns", PermissionAction.View)]
public class ReturnsController(AppDbContext db, IAuditService audit, IStockMovementService stockMovements, IGlPostingService gl, IPaymentGateway paymentGateway, IPasswordHasher passwordHasher) : ControllerBase
{
    // BRD defaults, overridable per store via the Settings table (SettingsController) without a deploy.
    private const int DefaultStandardWindowDays = 15;
    private const int DefaultSurplusWindowDays = 90;
    private const decimal DefaultDualAuthCashThreshold = 500m;

    // Order.Branch/Cashier are needed on every ReturnDto response so the Return Ledger's Branch and
    // Cashier filters/columns have something real to read — every query producing a ReturnDto goes
    // through this so none of the 5 call sites can drift out of sync with what Map() actually needs.
    private IQueryable<Return> WithIncludes() => db.Returns
        .Include(r => r.Order).ThenInclude(o => o!.Branch)
        .Include(r => r.Order).ThenInclude(o => o!.Cashier)
        .Include(r => r.Customer).Include(r => r.ApprovedBy).Include(r => r.ExchangeOrder)
        .Include(r => r.Lines).ThenInclude(l => l.Product);

    // BRD §3.2.1/§3.2.4: the return window and dual-authorization cash threshold — configured from
    // this page directly, not a generic Admin Settings browser. Reads the exact same Setting keys
    // GetSettingDecimalAsync already looks up for Approve/ComputeReturnAsync, Global scope only.
    [HttpGet("policy-config")]
    public async Task<ActionResult<ReturnPolicyConfigDto>> GetPolicyConfig(CancellationToken ct)
    {
        var dualAuth = await GetGlobalSettingDecimalAsync("Refund.DualAuthCashThreshold", DefaultDualAuthCashThreshold, ct);
        var standardDays = await GetGlobalSettingDecimalAsync("ReturnWindow.StandardDays", DefaultStandardWindowDays, ct);
        var surplusDays = await GetGlobalSettingDecimalAsync("ReturnWindow.SurplusDays", DefaultSurplusWindowDays, ct);
        return Ok(new ReturnPolicyConfigDto(dualAuth, (int)standardDays, (int)surplusDays));
    }

    [HttpPut("policy-config")]
    [RequireModule("/finance/returns", PermissionAction.Edit)]
    public async Task<ActionResult<ReturnPolicyConfigDto>> UpdatePolicyConfig(ReturnPolicyConfigDto request, CancellationToken ct)
    {
        if (request.DualAuthCashThreshold < 0) return BadRequest(new { error = "The dual-authorization threshold can't be negative." });
        if (request.StandardWindowDays < 0 || request.SurplusWindowDays < 0) return BadRequest(new { error = "A return window can't be negative." });

        var userIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        var userId = userIdClaim is null ? (int?)null : int.Parse(userIdClaim);
        await UpsertGlobalSettingAsync("Refund.DualAuthCashThreshold", request.DualAuthCashThreshold.ToString(System.Globalization.CultureInfo.InvariantCulture), userId, ct);
        await UpsertGlobalSettingAsync("ReturnWindow.StandardDays", request.StandardWindowDays.ToString(System.Globalization.CultureInfo.InvariantCulture), userId, ct);
        await UpsertGlobalSettingAsync("ReturnWindow.SurplusDays", request.SurplusWindowDays.ToString(System.Globalization.CultureInfo.InvariantCulture), userId, ct);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("finance", "RETURN_POLICY_CHANGED", "return-policy", userId: userId, newValue: request, cancellationToken: ct);

        return Ok(request);
    }

    private async Task<decimal> GetGlobalSettingDecimalAsync(string key, decimal fallback, CancellationToken ct)
    {
        var setting = await db.Settings.Where(s => s.Key == key && s.Scope == SettingScope.Global).OrderByDescending(s => s.Id).FirstOrDefaultAsync(ct);
        return setting is not null && decimal.TryParse(setting.Value, System.Globalization.CultureInfo.InvariantCulture, out var value) ? value : fallback;
    }

    private async Task UpsertGlobalSettingAsync(string key, string value, int? userId, CancellationToken ct)
    {
        var setting = await db.Settings.FirstOrDefaultAsync(s => s.Key == key && s.Scope == SettingScope.Global, ct);
        if (setting is null)
        {
            setting = new Setting { Category = "Pos", Group = "Returns", Key = key, Scope = SettingScope.Global };
            db.Settings.Add(setting);
        }
        setting.Value = value;
        setting.EffectiveFrom = DateTime.UtcNow;
        setting.ChangedByUserId = userId;
    }

    [HttpGet]
    public async Task<ActionResult<List<ReturnDto>>> List([FromQuery] string? type, CancellationToken ct)
    {
        var query = WithIncludes();
        // BRD §3.2.3: Standard/Surplus/Damaged must be separable in every report.
        if (!string.IsNullOrWhiteSpace(type) && Enum.TryParse<ReturnType>(type, ignoreCase: true, out var parsed))
        {
            query = query.Where(r => r.Type == parsed);
        }
        var rows = await query.OrderByDescending(r => r.CreatedAt).ToListAsync(ct);
        return Ok(rows.Select(Map).ToList());
    }

    // BRD §3.2.2: daily exception feed of damaged returns for the purchasing/QA team — every DGRN
    // with its damage code, quantity, and authorizing manager. Module 12's reporting engine will
    // wrap this in scheduled delivery; the data contract starts here.
    [HttpGet("damaged-exceptions")]
    public async Task<ActionResult<List<ReturnDto>>> DamagedExceptions([FromQuery] DateTime? from, CancellationToken ct)
    {
        var since = from ?? DateTime.UtcNow.Date;
        var rows = await WithIncludes()
            .Where(r => r.Type == ReturnType.Damaged && r.CreatedAt >= since)
            .OrderByDescending(r => r.CreatedAt).ToListAsync(ct);
        return Ok(rows.Select(Map).ToList());
    }

    // BRD §3.2.3/§3.2.4: the Return Value Calculation shown BEFORE the cashier confirms. With an
    // empty Lines list it enumerates the order's lines with each line's max returnable quantity and
    // returnable flag, so the dialog can render the picker; with quantities it prices the refund.
    [HttpPost("preview")]
    public async Task<ActionResult<ReturnPreviewDto>> Preview(ReturnPreviewRequest request, CancellationToken ct)
    {
        var order = await db.Orders.Include(o => o.Lines).ThenInclude(l => l.Product).ThenInclude(p => p!.Category)
            .FirstOrDefaultAsync(o => o.Id == request.OrderId, ct);
        if (order is null) return NotFound(new { error = "Order not found." });
        if (!Enum.TryParse<ReturnType>(request.Type, ignoreCase: true, out var type))
        {
            return BadRequest(new { error = $"Unknown return type \"{request.Type}\"." });
        }

        var computed = await ComputeReturnAsync(order, type, request.Lines, ct);
        return Ok(computed.Preview);
    }

    [HttpPost]
    [RequireModule("/finance/returns", PermissionAction.Create)]
    public async Task<ActionResult<ReturnDto>> Create(CreateReturnRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Reason))
        {
            return BadRequest(new { error = "A reason is required for every return." });
        }
        if (!Enum.TryParse<ReturnType>(request.Type, ignoreCase: true, out var type))
        {
            return BadRequest(new { error = $"Unknown return type \"{request.Type}\"." });
        }
        if (request.Lines.Count == 0 || request.Lines.All(l => l.Qty <= 0))
        {
            return BadRequest(new { error = "Select at least one line and quantity to return." });
        }

        var order = await db.Orders.Include(o => o.Lines).ThenInclude(l => l.Product).ThenInclude(p => p!.Category)
            .FirstOrDefaultAsync(o => o.Id == request.OrderId, ct);
        if (order is null) return NotFound(new { error = "Order not found." });

        // BRD §3.2.2: damage reason code is MANDATORY on damaged returns — free text is supplementary.
        DamageReasonCode? damageReason = null;
        if (type == ReturnType.Damaged)
        {
            if (!Enum.TryParse<DamageReasonCode>(request.DamageReasonCode, ignoreCase: true, out var parsedCode))
            {
                return BadRequest(new { error = "A damage reason code is required for damaged returns (ManufacturingDefect, TransitDamage, IncorrectProductSupplied, QualityBelowSpecification, Other)." });
            }
            damageReason = parsedCode;
        }

        var computed = await ComputeReturnAsync(order, type, request.Lines, ct);
        if (computed.Error is not null) return BadRequest(new { error = computed.Error });

        // BRD §3.2.1: past the configured window, supervisor authorization is required — expressed
        // through the same ApprovalRequest queue every other override in this system uses.
        if (computed.Preview.RequiresWindowOverride)
        {
            var hasOverride = request.WindowOverrideApprovalRequestId is int overrideId && await db.ApprovalRequests.AnyAsync(a =>
                a.Id == overrideId && a.Type == ApprovalType.Refund && a.Status == ApprovalStatus.Approved, ct);
            if (!hasOverride)
            {
                return BadRequest(new { error = $"This order is outside the {computed.Preview.WindowDays}-day return window for {type} returns. Supervisor approval (a granted Refund approval request) is required." });
            }
        }

        Order? exchangeOrder = null;
        if (type == ReturnType.Exchange && request.ExchangeOrderId is not null)
        {
            exchangeOrder = await db.Orders.FindAsync([request.ExchangeOrderId], ct);
            if (exchangeOrder is null) return BadRequest(new { error = "The linked exchange order does not exist." });
        }

        var ret = new Return
        {
            ReturnNo = $"RET-{DateTime.UtcNow:yyyy}-{await db.Returns.CountAsync(ct) + 1:D4}",
            OrderId = order.Id, CustomerId = order.CustomerId, Type = type, Reason = request.Reason,
            DamageReason = damageReason, PhotoReference = request.PhotoReference,
            // BRD §3.2.2: the DGRN is generated for every damaged return, numbered independently.
            DgrnNo = type == ReturnType.Damaged
                ? $"DGRN-{DateTime.UtcNow:yyyy}-{await db.Returns.CountAsync(r => r.DgrnNo != null, ct) + 1:D4}"
                : null,
            Status = type == ReturnType.Damaged ? ReturnStatus.Quarantine : ReturnStatus.PendingApproval,
            GrossRefund = computed.Preview.GrossRefund,
            VatReversal = computed.Preview.VatReversal,
            RestockingFeePct = computed.Preview.RestockingFeePct,
            RestockingFeeAmount = computed.Preview.RestockingFeeAmount,
            NetCashback = computed.Preview.NetCashback,
            ExchangeOrderId = exchangeOrder?.Id,
            Lines = computed.Lines,
        };
        db.Returns.Add(ret);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("finance", "RETURN_CREATED", ret.Id.ToString(),
            newValue: new { ret.ReturnNo, ret.DgrnNo, Type = type.ToString(), order.OrderNo, ret.NetCashback, DamageReason = damageReason?.ToString() },
            cancellationToken: ct);

        var created = await WithIncludes().FirstAsync(r => r.Id == ret.Id, ct);
        return Ok(Map(created));
    }

    [HttpPut("{id:int}/approve")]
    [RequireModule("/finance/returns", PermissionAction.Approve)]
    public async Task<ActionResult<ReturnDto>> Approve(int id, ApproveReturnRequest request, CancellationToken ct)
    {
        var ret = await db.Returns.Include(r => r.Customer)
            .Include(r => r.Order).ThenInclude(o => o!.Payments)
            .Include(r => r.Order).ThenInclude(o => o!.Branch)
            .Include(r => r.Order).ThenInclude(o => o!.Cashier)
            .Include(r => r.ApprovedBy).Include(r => r.ExchangeOrder).Include(r => r.Lines).ThenInclude(l => l.Product)
            .FirstOrDefaultAsync(r => r.Id == id, ct);
        if (ret is null) return NotFound();
        if (ret.Status == ReturnStatus.Completed) return BadRequest(new { error = "This return has already been completed." });

        var userIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        var userId = userIdClaim is null ? (int?)null : int.Parse(userIdClaim);

        // BRD §10.1 role gates. Damaged returns need explicit damaged-return authorization
        // (Supervisor tier and up); other types are capped by the approver's surplus-return value
        // ceiling (Cashier SAR 500, Senior Cashier SAR 1,000, Supervisor+ uncapped).
        if (ret.Type == ReturnType.Damaged)
        {
            var canAuthorizeDamaged = string.Equals(User.FindFirst("posCeiling:canAuthorizeDamagedReturns")?.Value, "True", StringComparison.OrdinalIgnoreCase);
            if (!canAuthorizeDamaged)
            {
                return StatusCode(403, new { error = "Damaged returns require Supervisor (or higher) authorization." });
            }
        }
        else
        {
            var ceilingClaim = User.FindFirst("posCeiling:surplusReturnAmount")?.Value;
            if (ceilingClaim is not null
                && decimal.TryParse(ceilingClaim, System.Globalization.CultureInfo.InvariantCulture, out var ceiling)
                && EffectiveCashback(ret) > ceiling)
            {
                return StatusCode(403, new { error = $"A {EffectiveCashback(ret):F2} ر.س refund exceeds your return authorization limit of {ceiling:F2} ر.س. A supervisor must approve this return." });
            }
        }

        var refundMethod = string.IsNullOrWhiteSpace(request.RefundMethod) ? ret.RefundMethod : request.RefundMethod!;
        if (refundMethod is not ("Original" or "Cash" or "StoreCredit" or "AccountCredit"))
        {
            return BadRequest(new { error = $"Unknown refund method \"{refundMethod}\"." });
        }
        if (refundMethod == "AccountCredit" && (ret.Customer is null || (ret.Customer.Type != CustomerType.Contractor && ret.Customer.Type != CustomerType.B2B)))
        {
            return BadRequest(new { error = "Account credit refunds are only available for B2B / contractor customers." });
        }

        // BRD §3.2.4: cash refunds above the threshold need TWO people — the approver plus a second
        // supervisor-tier user confirming with their own PIN in the same request. (Module 15 upgrades
        // this to the full PIN-login infrastructure; the check itself is real today.)
        var cashThreshold = await GetSettingDecimalAsync("Refund.DualAuthCashThreshold", DefaultDualAuthCashThreshold, request.BranchId, ct);
        var effectiveCashback = EffectiveCashback(ret);
        var isCashRefund = refundMethod == "Cash"
            || (refundMethod == "Original" && (ret.Order?.Payments.Any(p => p.Method == PaymentMethod.Cash) ?? false));
        if (isCashRefund && effectiveCashback > cashThreshold)
        {
            var failure = await ValidateSecondAuthorizerAsync(request.SecondAuthEmail, request.SecondAuthPin, userId, ct);
            if (failure is not null) return BadRequest(new { error = failure });
        }

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        if (ret.Type != ReturnType.Damaged)
        {
            // BRD §3.2.3: surplus/standard stock reintegrates to sellable inventory — in STOCK UOM
            // (a returned Pallet line puts 50 Bags back). The restocking fee never reduces this.
            foreach (var line in ret.Lines)
            {
                var restockQty = line.StockQty > 0 ? line.StockQty : line.Qty;
                var level = await db.BranchStockLevels.FirstOrDefaultAsync(s => s.ProductId == line.ProductId && s.BranchId == request.BranchId, ct);
                if (level is null)
                {
                    level = new BranchStockLevel { ProductId = line.ProductId, BranchId = request.BranchId };
                    db.BranchStockLevels.Add(level);
                }
                level.OnHand += restockQty;
            }
        }
        else
        {
            // BRD §3.2.2: damaged stock goes to a QUARANTINE holding, never back to sellable OnHand —
            // recorded as a quarantined stock batch under the DGRN number so the warehouse/QA team can
            // find, assess, and eventually write off or restore each one.
            var warehouse = await db.Warehouses.FirstOrDefaultAsync(w => w.BranchId == request.BranchId, ct)
                ?? await db.Warehouses.FirstOrDefaultAsync(ct);
            if (warehouse is not null)
            {
                foreach (var line in ret.Lines)
                {
                    db.StockBatches.Add(new StockBatch
                    {
                        ProductId = line.ProductId, WarehouseId = warehouse.Id,
                        BatchNo = ret.DgrnNo ?? ret.ReturnNo, ReceivedDate = DateTime.UtcNow,
                        ExpiryDate = DateTime.UtcNow.AddYears(1),
                        Qty = line.StockQty > 0 ? line.StockQty : line.Qty,
                        ManualStatus = StockBatchStatus.Quarantine,
                    });
                }
            }
        }

        // BRD §3.2.4: refund routing. "Original" splits proportionally across the original payment
        // methods; explicit Cash/StoreCredit/AccountCredit is the supervisor override of that split.
        ret.RefundMethod = refundMethod;
        if (refundMethod == "Original" && ret.Order is not null && ret.Order.Payments.Count > 0)
        {
            var split = ReturnMath.ProportionalSplit(
                ret.Order.Payments.Select(p => (p.Method.ToString(), p.Amount)).ToList(), effectiveCashback);
            ret.RefundSplitJson = System.Text.Json.JsonSerializer.Serialize(split.Select(s => new { method = s.Method, amount = s.Amount }));
        }
        // BRD §3.2.2: B2B return credit posts to the account and reduces the outstanding balance.
        // Restricted to B2B/Contractor — same restriction checkout's AccountCredit tender already
        // enforces — because Outstanding is an AR field with no matching debit path for a Retail/
        // Walk-in customer (they can never pay via AccountCredit to bring it back to zero), so
        // letting a non-B2B StoreCredit refund touch it would drive an unrecoverable negative balance.
        var isAccountLedgerCustomer = ret.Customer?.Type is CustomerType.B2B or CustomerType.Contractor;
        if (refundMethod is "StoreCredit" or "AccountCredit" && isAccountLedgerCustomer)
        {
            ret.Customer!.Outstanding -= effectiveCashback;
        }

        ret.Status = ReturnStatus.Completed;
        ret.ApprovedByUserId = userId;
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        await audit.LogAsync("finance", "RETURN_APPROVED", id.ToString(), userId: userId,
            newValue: new { ret.ReturnNo, ret.DgrnNo, Type = ret.Type.ToString(), RefundMethod = refundMethod, ret.NetCashback, OriginalOrder = ret.Order?.OrderNo },
            cancellationToken: ct);
        foreach (var line in ret.Lines)
        {
            var qty = line.StockQty > 0 ? line.StockQty : line.Qty;
            var movementType = ret.Type != ReturnType.Damaged ? StockMovementType.ReturnRestock : StockMovementType.ReturnDamage;
            await stockMovements.RecordAsync(line.ProductId, request.BranchId, movementType,
                movementType == StockMovementType.ReturnRestock ? qty : -qty,
                refTable: "Return", refId: id.ToString(), userId: userId, cancellationToken: ct);
        }

        var totalAmount = EffectiveCashback(ret);
        if (totalAmount > 0)
        {
            // Legacy rows created before Module 6 have no frozen calculation — extract VAT at the
            // standard rate the way the old code did, so their GL posting still balances.
            var vatPortion = ret.VatReversal > 0 || ret.GrossRefund > 0 ? ret.VatReversal : Math.Round(totalAmount - totalAmount / 1.15m, 2);
            var revenuePortion = ret.GrossRefund > 0 ? ret.GrossRefund : totalAmount - vatPortion;
            // AccountCredit/StoreCredit refunds to a B2B/Contractor account never pay cash out — they
            // reduce what the customer owes, so the credit side lands on Accounts Receivable (1100),
            // not Cash & Bank (1000). Every other refund is a real payout, still 1000.
            var creditAccount = refundMethod is "StoreCredit" or "AccountCredit" && isAccountLedgerCustomer ? "1100" : "1000";
            var lines = new List<GlLine> { new("4000", revenuePortion, 0), new("2100", vatPortion, 0), new(creditAccount, 0, totalAmount) };
            if (ret.RestockingFeeAmount > 0)
            {
                // The fee stays with the store: cash out = revenue + VAT − fee, so credit it back to revenue.
                lines.Add(new GlLine("4000", 0, ret.RestockingFeeAmount));
            }
            await gl.PostAsync(ret.ReturnNo, $"{ret.Type} return refund to {ret.Customer?.NameEn ?? "Walk-in Customer"}", lines, ct);
            if (refundMethod is "Original" or "Cash")
            {
                await paymentGateway.ChargeAsync("Refund", -totalAmount, ct);
            }
        }

        // Claw back whatever loyalty points this order's returned amount had earned — capped to
        // what's still reversible on THIS order (so two partial returns against the same order
        // can't jointly reverse more points than the order ever earned) and to the customer's
        // current balance (so a since-redeemed customer never goes negative).
        if (totalAmount > 0 && ret.CustomerId is not null && ret.OrderId is not null && ret.Customer is not null && ret.Customer.LoyaltyEnrolled)
        {
            var earnedOnOrder = await db.LoyaltyTransactions
                .Where(t => t.OrderId == ret.OrderId && t.Type == LoyaltyTransactionType.Earn).SumAsync(t => t.Points, ct);
            var alreadyReversed = await db.LoyaltyTransactions
                .Where(t => t.OrderId == ret.OrderId && t.Type == LoyaltyTransactionType.Reversal).SumAsync(t => -t.Points, ct);
            var reversible = Math.Max(0, earnedOnOrder - alreadyReversed);
            // Points were earned on the ex-VAT merchandise value (Module 2), so the clawback basis is
            // GrossRefund, not the VAT-inclusive cashback — legacy rows fall back to the old behavior.
            var clawbackBasis = ret.GrossRefund > 0 ? ret.GrossRefund : totalAmount;
            var loyaltyConfig = await db.GetLoyaltyConfigAsync(ct);
            var pointsToReverse = Math.Min(reversible, Math.Min(LoyaltyRules.PointsForSar(clawbackBasis, loyaltyConfig.PointsPerSarEarned), ret.Customer.LoyaltyPoints));
            if (pointsToReverse > 0)
            {
                ret.Customer.LoyaltyPoints -= pointsToReverse;
                db.LoyaltyTransactions.Add(new LoyaltyTransaction
                {
                    CustomerId = ret.Customer.Id, OrderId = ret.OrderId, Type = LoyaltyTransactionType.Reversal,
                    Points = -pointsToReverse, Description = $"Reversed for return {ret.ReturnNo}",
                });
                await db.SaveChangesAsync(ct);
            }
        }

        // Symmetric case: whatever share of this refund traces back to points the customer redeemed
        // at the original sale must come back as POINTS — points aren't cash, so the chosen refund
        // method (Cash/StoreCredit/AccountCredit/Original) never applies to this portion. Uses the
        // same proportional-split math as the "Original" refund routing above, computed independently
        // so it still runs even when the supervisor picked an explicit override method.
        if (totalAmount > 0 && ret.OrderId is not null && ret.Customer is not null && ret.Order is not null && ret.Order.Payments.Any(p => p.Method == PaymentMethod.Loyalty))
        {
            var loyaltySplit = ReturnMath.ProportionalSplit(
                ret.Order.Payments.Select(p => (p.Method.ToString(), p.Amount)).ToList(), totalAmount);
            var loyaltySar = loyaltySplit.FirstOrDefault(s => s.Method == nameof(PaymentMethod.Loyalty)).Amount;
            if (loyaltySar > 0)
            {
                var loyaltyConfig = await db.GetLoyaltyConfigAsync(ct);
                var pointsToRestore = LoyaltyRules.PointsNeededForSar(loyaltySar, loyaltyConfig.PointsPerSarRedeemed);
                if (pointsToRestore > 0)
                {
                    ret.Customer.LoyaltyPoints += pointsToRestore;
                    db.LoyaltyTransactions.Add(new LoyaltyTransaction
                    {
                        CustomerId = ret.Customer.Id, OrderId = ret.OrderId, Type = LoyaltyTransactionType.RedeemReversal,
                        Points = pointsToRestore, Description = $"Points restored for return {ret.ReturnNo}",
                    });
                    await db.SaveChangesAsync(ct);
                }
            }
        }

        // BRD: once every line of the original order has been returned (across this and any prior
        // Completed returns on it), the order itself is done — Returned/Refunded, not still shown as
        // a live "Completed" sale. Partial returns leave the order's own status untouched; the Return
        // Ledger's orderNo cross-reference is how a partially-returned order stays traceable.
        if (ret.OrderId is not null)
        {
            var orderLines = await db.OrderLines.Where(l => l.OrderId == ret.OrderId).ToListAsync(ct);
            if (orderLines.Count > 0)
            {
                var orderLineIds = orderLines.Select(l => l.Id).ToList();
                var returnedByLine = await db.ReturnLines
                    .Where(rl => rl.OrderLineId != null && orderLineIds.Contains(rl.OrderLineId.Value) && rl.Return!.Status == ReturnStatus.Completed)
                    .GroupBy(rl => rl.OrderLineId!.Value)
                    .Select(g => new { OrderLineId = g.Key, Qty = g.Sum(x => x.Qty) })
                    .ToListAsync(ct);
                var fullyReturned = orderLines.All(l => returnedByLine.FirstOrDefault(r => r.OrderLineId == l.Id)?.Qty >= l.Qty);
                if (fullyReturned)
                {
                    var order = await db.Orders.FindAsync([ret.OrderId], ct);
                    if (order is not null && order.Status != OrderStatus.Voided)
                    {
                        order.Status = OrderStatus.Returned;
                        order.PaymentStatus = PaymentStatus.Refunded;
                        await db.SaveChangesAsync(ct);
                    }
                }
            }
        }

        await db.Entry(ret).Reference(r => r.ApprovedBy).LoadAsync(ct);
        return Ok(Map(ret));
    }

    [HttpPut("{id:int}/quarantine")]
    [RequireModule("/finance/returns", PermissionAction.Edit)]
    public async Task<ActionResult<ReturnDto>> Quarantine(int id, CancellationToken ct)
    {
        var ret = await WithIncludes().FirstOrDefaultAsync(r => r.Id == id, ct);
        if (ret is null) return NotFound();
        if (ret.Status != ReturnStatus.PendingApproval)
        {
            return BadRequest(new { error = $"Only a pending return can be quarantined (current status: {ret.Status})." });
        }

        ret.Status = ReturnStatus.Quarantine;
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("finance", "RETURN_QUARANTINED", id.ToString(), cancellationToken: ct);
        return Ok(Map(ret));
    }

    private sealed record ComputedReturn(ReturnPreviewDto Preview, List<ReturnLine> Lines, string? Error);

    // The single source of the Return Value Calculation — Preview and Create both run through here so
    // what the cashier reviewed is exactly what gets frozen onto the Return row.
    private async Task<ComputedReturn> ComputeReturnAsync(Order order, ReturnType type, List<ReturnLineInput> inputs, CancellationToken ct)
    {
        // Per-line prior-return drawdown: qty already returned against each original order line
        // across ALL earlier returns of this order (BRD §3.2.3 "original quantity minus any prior
        // returns on the same transaction").
        var orderLineIds = order.Lines.Select(l => l.Id).ToList();
        var priorReturned = await db.ReturnLines
            .Where(l => l.OrderLineId != null && orderLineIds.Contains(l.OrderLineId.Value))
            .GroupBy(l => l.OrderLineId!.Value)
            .Select(g => new { OrderLineId = g.Key, Qty = g.Sum(x => x.Qty) })
            .ToDictionaryAsync(g => g.OrderLineId, g => g.Qty, ct);

        var windowDays = type switch
        {
            ReturnType.Surplus => (int)await GetSettingDecimalAsync("ReturnWindow.SurplusDays", DefaultSurplusWindowDays, order.BranchId, ct),
            ReturnType.Damaged => int.MaxValue, // quality claims aren't window-limited
            _ => (int)await GetSettingDecimalAsync("ReturnWindow.StandardDays", DefaultStandardWindowDays, order.BranchId, ct),
        };
        var requiresWindowOverride = windowDays != int.MaxValue && order.CreatedAt < DateTime.UtcNow.AddDays(-windowDays);

        var inputByLineId = inputs.Where(i => i.Qty > 0).ToDictionary(i => i.OrderLineId, i => i.Qty);
        var previewLines = new List<ReturnPreviewLineDto>();
        var returnLines = new List<ReturnLine>();
        decimal grossRefund = 0, vatReversal = 0, restockingFee = 0;
        string? error = null;

        foreach (var line in order.Lines)
        {
            var product = line.Product;
            var maxReturnable = Math.Max(0, line.Qty - (priorReturned.TryGetValue(line.Id, out var prior) ? prior : 0));
            // BRD §3.2.3 eligibility: category/product non-returnable flags and cut-to-size products
            // (custom-cut glass etc.) are blocked for SURPLUS returns; damaged claims are always
            // accepted (they go to quarantine, not back to the shelf).
            var (returnable, blockedReason) = type switch
            {
                ReturnType.Damaged => (true, (string?)null),
                _ when product?.IsCutToSize == true => (false, "Cut-to-size items are non-returnable."),
                _ when product is { Returnable: false } => (false, "This product is flagged non-returnable."),
                _ when product?.Category is { Returnable: false } => (false, $"The {product.Category.NameEn} category is non-returnable."),
                _ => (true, (string?)null),
            };

            var requestedQty = inputByLineId.TryGetValue(line.Id, out var q) ? q : 0;
            var unitPricePaid = line.Qty > 0 ? Math.Round(line.LineTotal / line.Qty, 2, MidpointRounding.AwayFromZero) : 0;
            var refund = ReturnMath.RefundForLine(requestedQty, line.Qty, line.LineTotal, line.VatRate);

            previewLines.Add(new ReturnPreviewLineDto(
                line.Id, line.ProductId, product?.Sku ?? "", product?.NameEn ?? "", line.Uom, line.Qty, maxReturnable,
                requestedQty, unitPricePaid, refund.BaseRefund, refund.VatReversal, returnable, blockedReason));

            if (requestedQty <= 0) continue;
            if (!returnable)
            {
                error ??= $"{product?.Sku}: {blockedReason}";
                continue;
            }
            if (requestedQty > maxReturnable)
            {
                error ??= $"{product?.Sku}: only {maxReturnable} of {line.Qty} {line.Uom} can still be returned on this order.";
                continue;
            }

            // BRD §3.2.3: restocking fee applies to SURPLUS returns only, per the product's category.
            var feePct = type == ReturnType.Surplus ? product?.Category?.SurplusRestockingFeePct ?? 0 : 0;
            var lineFee = ReturnMath.RestockingFee(refund.BaseRefund, feePct);

            grossRefund += refund.BaseRefund;
            vatReversal += refund.VatReversal;
            restockingFee += lineFee;

            // Stock quantity converts through the original line's UOM factor (BRD §2.3): returning
            // 1 of a Pallet line puts 50 Bags back (or into quarantine).
            var stockFactor = line.Qty > 0 && line.StockQty > 0 ? line.StockQty / line.Qty : 1;
            returnLines.Add(new ReturnLine
            {
                ProductId = line.ProductId, OrderLineId = line.Id, Qty = requestedQty,
                StockQty = Math.Round(requestedQty * stockFactor, 3, MidpointRounding.AwayFromZero),
                UnitPricePaid = unitPricePaid, VatRate = line.VatRate,
                Amount = ReturnMath.NetCashback(refund.BaseRefund, refund.VatReversal, lineFee),
            });
        }

        // Requested lines that don't belong to this order at all.
        foreach (var input in inputByLineId.Keys.Where(id => order.Lines.All(l => l.Id != id)))
        {
            error ??= $"Order line {input} does not belong to order {order.OrderNo}.";
        }

        var feePctOverall = grossRefund > 0 ? Math.Round(restockingFee / grossRefund * 100, 2) : 0;
        var preview = new ReturnPreviewDto(
            Math.Round(grossRefund, 2), Math.Round(vatReversal, 2), feePctOverall, Math.Round(restockingFee, 2),
            ReturnMath.NetCashback(grossRefund, vatReversal, restockingFee),
            requiresWindowOverride, windowDays == int.MaxValue ? 0 : windowDays, previewLines);
        return new ComputedReturn(preview, returnLines, error);
    }

    // Net cashback for rows created by Module 6; legacy rows sum their line amounts as before.
    private static decimal EffectiveCashback(Return r) =>
        r.NetCashback > 0 ? r.NetCashback : r.Lines.Sum(l => l.Amount);

    // Ignoring Category/Group/BranchId and taking "whichever row with this Key has the highest Id"
    // meant whichever branch's override was saved MOST RECENTLY silently became every branch's
    // return-window/dual-auth policy. A branch-scoped row (Setting.Scope=Branch, BranchId=branchId)
    // now wins when one exists for this exact branch; otherwise the Global row for this key applies.
    private async Task<decimal> GetSettingDecimalAsync(string key, decimal fallback, int branchId, CancellationToken ct)
    {
        var candidates = await db.Settings.Where(s => s.Key == key && (s.Scope == SettingScope.Global || s.BranchId == branchId)).ToListAsync(ct);
        var setting = candidates.Where(s => s.BranchId == branchId).OrderByDescending(s => s.Id).FirstOrDefault()
            ?? candidates.Where(s => s.Scope == SettingScope.Global).OrderByDescending(s => s.Id).FirstOrDefault();
        return setting is not null && decimal.TryParse(setting.Value, System.Globalization.CultureInfo.InvariantCulture, out var value) ? value : fallback;
    }

    // BRD §3.2.4 / §10.2 dual authorization: the second authorizer is a DIFFERENT user, identified by
    // email, confirming with their own PIN (User.PinHash — set via admin reset-pin), holding
    // supervisor-tier return authority (uncapped surplus ceiling or damaged-return authorization).
    private async Task<string?> ValidateSecondAuthorizerAsync(string? email, string? pin, int? approverUserId, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(pin))
        {
            return "Cash refunds above the dual-authorization threshold require a second supervisor's email and PIN.";
        }
        var second = await db.Users.Include(u => u.Role).FirstOrDefaultAsync(u => u.Email == email, ct);
        if (second is null || second.PinHash is null || !passwordHasher.Verify(pin, second.PinHash))
        {
            return "Second authorizer email or PIN is incorrect.";
        }
        if (second.Id == approverUserId)
        {
            return "The second authorizer must be a different person from the approver.";
        }
        var supervisorTier = second.Role is not null
            && (second.Role.CanAuthorizeDamagedReturns || second.Role.SurplusReturnCeilingAmount is null);
        return supervisorTier ? null : "The second authorizer must hold supervisor-tier return authority.";
    }

    private static ReturnDto Map(Return r) => new(
        r.Id, r.ReturnNo, r.OrderId, r.Order?.OrderNo, r.CustomerId, r.Customer?.NameEn ?? "Walk-in Customer", r.Type.ToString(),
        r.Reason, EffectiveCashback(r), r.ApprovedBy?.Name, r.Status.ToString(), r.CreatedAt,
        r.Lines.Select(l => new ReturnLineDto(l.ProductId, l.Product?.Sku ?? "", l.Product?.NameEn ?? "", l.Qty, l.Amount, l.OrderLineId, l.StockQty, l.UnitPricePaid, l.VatRate)).ToList(),
        r.DgrnNo, r.DamageReason?.ToString(), r.PhotoReference,
        r.GrossRefund, r.VatReversal, r.RestockingFeePct, r.RestockingFeeAmount, r.NetCashback,
        r.RefundMethod, r.RefundSplitJson, r.ExchangeOrderId, r.ExchangeOrder?.OrderNo,
        r.ExchangeOrderId is not null && r.ExchangeOrder is not null ? Math.Round(r.ExchangeOrder.GrandTotal - EffectiveCashback(r), 2) : null,
        r.Order?.BranchId, r.Order?.Branch?.NameEn, r.Order?.Cashier?.Name);
}

[ApiController]
[Route("api/finance/accounts")]
[Authorize]
[RequireModule("/finance/general-ledger", PermissionAction.View)]
public class AccountsController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<AccountDto>>> List(CancellationToken ct)
    {
        var accounts = await db.Accounts.OrderBy(a => a.Code).ToListAsync(ct);
        var balances = await db.JournalLines.GroupBy(l => l.AccountId).Select(g => new { g.Key, Debit = g.Sum(l => l.Debit), Credit = g.Sum(l => l.Credit) })
            .ToDictionaryAsync(x => x.Key, ct);
        return Ok(accounts.Select(a =>
        {
            var b = balances.GetValueOrDefault(a.Id);
            var balance = a.Type is AccountType.Asset or AccountType.Expense ? (b?.Debit ?? 0) - (b?.Credit ?? 0) : (b?.Credit ?? 0) - (b?.Debit ?? 0);
            return new AccountDto(a.Id, a.Code, a.Name, a.Type.ToString(), balance);
        }).ToList());
    }
}

[ApiController]
[Route("api/finance/journal")]
[Authorize]
[RequireModule("/finance/general-ledger", PermissionAction.View)]
public class JournalController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<JournalEntryDto>>> List(CancellationToken ct)
    {
        var entries = await db.JournalEntries.Include(e => e.Lines).ThenInclude(l => l.Account).OrderByDescending(e => e.Date).Take(200).ToListAsync(ct);
        return Ok(entries.Select(e => new JournalEntryDto(
            e.Id, e.Date, e.Reference, e.Description,
            e.Lines.Select(l => new JournalLineDto(l.Account?.Code ?? "", l.Account?.Name ?? "", l.Debit, l.Credit)).ToList())).ToList());
    }
}
