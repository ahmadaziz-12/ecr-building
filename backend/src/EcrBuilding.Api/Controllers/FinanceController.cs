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
[RequireModule(ModuleArea.Finance, AccessLevel.View)]
public class ExpensesController(AppDbContext db, IAuditService audit, IGlPostingService gl) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<ExpenseDto>>> List(CancellationToken ct)
    {
        var rows = await db.Expenses.Include(e => e.Branch).OrderByDescending(e => e.Date).ToListAsync(ct);
        return Ok(rows.Select(Map).ToList());
    }

    [HttpPost]
    [RequireModule(ModuleArea.Finance, AccessLevel.Edit)]
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
    [RequireModule(ModuleArea.Finance, AccessLevel.Edit)]
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

    private static ExpenseDto Map(Expense e) => new(e.Id, e.ExpenseNo, e.Date, e.BranchId, e.Branch?.NameEn ?? "", e.Category, e.Description, e.Vendor, e.Amount, e.Vat, e.Method, e.Status.ToString());
}

[ApiController]
[Route("api/finance/tax-codes")]
[Authorize]
[RequireModule(ModuleArea.Finance, AccessLevel.View)]
public class TaxCodesController(AppDbContext db, IAuditService audit) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<TaxCodeDto>>> List(CancellationToken ct)
    {
        var rows = await db.TaxCodes.Include(t => t.GlAccount).OrderBy(t => t.Code).ToListAsync(ct);
        return Ok(rows.Select(Map).ToList());
    }

    [HttpPost]
    [RequireModule(ModuleArea.Finance, AccessLevel.Edit)]
    public async Task<ActionResult<TaxCodeDto>> Create(UpsertTaxCodeRequest request, CancellationToken ct)
    {
        var glAccount = request.GlAccountCode is null ? null : await db.Accounts.FirstOrDefaultAsync(a => a.Code == request.GlAccountCode, ct);
        var taxCode = new TaxCode
        {
            Code = request.Code, Name = request.Name, Type = request.Type, Rate = request.Rate,
            AppliesTo = request.AppliesTo, EffectiveFrom = request.EffectiveFrom, GlAccountId = glAccount?.Id,
        };
        db.TaxCodes.Add(taxCode);
        await db.SaveChangesAsync(ct);
        await db.Entry(taxCode).Reference(t => t.GlAccount).LoadAsync(ct);
        await audit.LogAsync("finance", "TAX_CODE_CREATED", taxCode.Id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(taxCode));
    }

    [HttpPut("{id:int}")]
    [RequireModule(ModuleArea.Finance, AccessLevel.Edit)]
    public async Task<ActionResult<TaxCodeDto>> Update(int id, UpsertTaxCodeRequest request, CancellationToken ct)
    {
        var taxCode = await db.TaxCodes.FindAsync([id], ct);
        if (taxCode is null) return NotFound();

        var glAccount = request.GlAccountCode is null ? null : await db.Accounts.FirstOrDefaultAsync(a => a.Code == request.GlAccountCode, ct);
        taxCode.Code = request.Code; taxCode.Name = request.Name; taxCode.Type = request.Type; taxCode.Rate = request.Rate;
        taxCode.AppliesTo = request.AppliesTo; taxCode.EffectiveFrom = request.EffectiveFrom; taxCode.GlAccountId = glAccount?.Id;

        await db.SaveChangesAsync(ct);
        await db.Entry(taxCode).Reference(t => t.GlAccount).LoadAsync(ct);
        await audit.LogAsync("finance", "TAX_CODE_UPDATED", id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(taxCode));
    }

    [HttpPut("{id:int}/status")]
    [RequireModule(ModuleArea.Finance, AccessLevel.Edit)]
    public async Task<ActionResult<TaxCodeDto>> UpdateStatus(int id, EcrBuilding.Application.Catalog.SetStatusRequest request, CancellationToken ct)
    {
        var taxCode = await db.TaxCodes.Include(t => t.GlAccount).FirstOrDefaultAsync(t => t.Id == id, ct);
        if (taxCode is null) return NotFound();

        taxCode.Status = Enum.Parse<EntityStatus>(request.Status);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("finance", $"TAX_CODE_{taxCode.Status.ToString().ToUpperInvariant()}", id.ToString(), cancellationToken: ct);
        return Ok(Map(taxCode));
    }

    private static TaxCodeDto Map(TaxCode t) => new(t.Id, t.Code, t.Name, t.Type, t.Rate, t.AppliesTo, t.EffectiveFrom, t.GlAccount?.Code, t.Status.ToString());
}

[ApiController]
[Route("api/finance/returns")]
[Authorize]
[RequireModule(ModuleArea.Finance, AccessLevel.View)]
public class ReturnsController(AppDbContext db, IAuditService audit, IGlPostingService gl, IPaymentGateway paymentGateway) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<ReturnDto>>> List(CancellationToken ct)
    {
        var rows = await db.Returns.Include(r => r.Order).Include(r => r.Customer).Include(r => r.ApprovedBy)
            .Include(r => r.Lines).ThenInclude(l => l.Product).OrderByDescending(r => r.CreatedAt).ToListAsync(ct);
        return Ok(rows.Select(Map).ToList());
    }

    [HttpPost]
    [RequireModule(ModuleArea.Finance, AccessLevel.Edit)]
    public async Task<ActionResult<ReturnDto>> Create(CreateReturnRequest request, CancellationToken ct)
    {
        var ret = new Return
        {
            ReturnNo = $"RET-{DateTime.UtcNow:yyyy}-{await db.Returns.CountAsync(ct) + 1:D4}",
            OrderId = request.OrderId, CustomerId = request.CustomerId, Type = Enum.Parse<ReturnType>(request.Type), Reason = request.Reason,
            Status = request.Type == "Damaged" ? ReturnStatus.Quarantine : ReturnStatus.PendingApproval,
            Lines = request.Lines.Select(l => new ReturnLine { ProductId = l.ProductId, Qty = l.Qty, Amount = l.Amount }).ToList(),
        };
        db.Returns.Add(ret);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("finance", "RETURN_CREATED", ret.Id.ToString(), newValue: request, cancellationToken: ct);

        var created = await db.Returns.Include(r => r.Order).Include(r => r.Customer).Include(r => r.ApprovedBy)
            .Include(r => r.Lines).ThenInclude(l => l.Product).FirstAsync(r => r.Id == ret.Id, ct);
        return Ok(Map(created));
    }

    [HttpPut("{id:int}/approve")]
    [RequireModule(ModuleArea.Finance, AccessLevel.Edit)]
    public async Task<ActionResult<ReturnDto>> Approve(int id, ApproveReturnRequest request, CancellationToken ct)
    {
        var ret = await db.Returns.Include(r => r.Customer).Include(r => r.Order).Include(r => r.ApprovedBy).Include(r => r.Lines).ThenInclude(l => l.Product)
            .FirstOrDefaultAsync(r => r.Id == id, ct);
        if (ret is null) return NotFound();

        var userIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        var userId = userIdClaim is null ? (int?)null : int.Parse(userIdClaim);

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        if (ret.Type != ReturnType.Damaged)
        {
            foreach (var line in ret.Lines)
            {
                var level = await db.StockLevels.FirstOrDefaultAsync(s => s.ProductId == line.ProductId && s.WarehouseId == request.WarehouseId, ct);
                if (level is null)
                {
                    level = new StockLevel { ProductId = line.ProductId, WarehouseId = request.WarehouseId };
                    db.StockLevels.Add(level);
                }
                level.OnHand += line.Qty;
            }
        }

        ret.Status = ReturnStatus.Completed;
        ret.ApprovedByUserId = userId;
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        await audit.LogAsync("finance", "RETURN_APPROVED", id.ToString(), userId: userId, cancellationToken: ct);

        var totalAmount = ret.Lines.Sum(l => l.Amount);
        if (totalAmount > 0)
        {
            var vatPortion = Math.Round(totalAmount - totalAmount / 1.15m, 2);
            var revenuePortion = totalAmount - vatPortion;
            await gl.PostAsync(ret.ReturnNo, $"Return refund to {ret.Customer?.NameEn ?? "Walk-in Customer"}",
                [new GlLine("4000", revenuePortion, 0), new GlLine("2100", vatPortion, 0), new GlLine("1000", 0, totalAmount)], ct);
            await paymentGateway.ChargeAsync("Refund", -totalAmount, ct);
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
            var pointsToReverse = Math.Min(reversible, Math.Min(LoyaltyRules.PointsForSar(totalAmount), ret.Customer.LoyaltyPoints));
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

        await db.Entry(ret).Reference(r => r.ApprovedBy).LoadAsync(ct);
        return Ok(Map(ret));
    }

    private static ReturnDto Map(Return r) => new(
        r.Id, r.ReturnNo, r.OrderId, r.Order?.OrderNo, r.CustomerId, r.Customer?.NameEn ?? "Walk-in Customer", r.Type.ToString(),
        r.Reason, r.Lines.Sum(l => l.Amount), r.ApprovedBy?.Name, r.Status.ToString(), r.CreatedAt,
        r.Lines.Select(l => new ReturnLineDto(l.ProductId, l.Product?.Sku ?? "", l.Product?.NameEn ?? "", l.Qty, l.Amount)).ToList());
}

[ApiController]
[Route("api/finance/accounts")]
[Authorize]
[RequireModule(ModuleArea.Finance, AccessLevel.View)]
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
[RequireModule(ModuleArea.Finance, AccessLevel.View)]
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
