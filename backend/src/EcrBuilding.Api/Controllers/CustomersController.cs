using System.Security.Claims;
using EcrBuilding.Api.Authorization;
using EcrBuilding.Application.Abstractions;
using EcrBuilding.Application.Pos;
using EcrBuilding.Domain.Common;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Api.Controllers;

[ApiController]
[Route("api/pos/customers")]
[Authorize]
[RequireModule("/operate/customers", PermissionAction.View)]
public class CustomersController(AppDbContext db, IAuditService audit, IGlPostingService gl) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<CustomerDto>>> List([FromQuery] string? type, [FromQuery] string? search, CancellationToken ct)
    {
        var query = db.Customers.Include(c => c.AccountManager).AsQueryable();
        if (!string.IsNullOrWhiteSpace(type) && Enum.TryParse<CustomerType>(type, ignoreCase: true, out var parsedType))
        {
            query = query.Where(c => c.Type == parsedType);
        }
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(c => c.NameEn.Contains(term) || (c.NameAr != null && c.NameAr.Contains(term)) ||
                (c.Phone != null && c.Phone.Contains(term)) || (c.VatNo != null && c.VatNo.Contains(term)));
        }
        var customers = await query.OrderByDescending(c => c.LastPurchaseAt).ToListAsync(ct);
        var expiryMonths = (await db.GetLoyaltyConfigAsync(ct)).PointsExpiryMonths;
        return Ok(customers.Select(c => Map(c, expiryMonths)).ToList());
    }

    [HttpGet("by-phone")]
    public async Task<ActionResult<CustomerDto>> ByPhone([FromQuery] string phone, CancellationToken ct)
    {
        var customer = await db.Customers.FirstOrDefaultAsync(c => c.Phone == phone, ct);
        if (customer is null) return NotFound();
        var expiryMonths = (await db.GetLoyaltyConfigAsync(ct)).PointsExpiryMonths;
        return Ok(Map(customer, expiryMonths));
    }

    [HttpGet("{id:int}/statement")]
    public async Task<ActionResult<CustomerStatementDto>> Statement(int id, CancellationToken ct)
    {
        var customer = await db.Customers.FindAsync([id], ct);
        if (customer is null) return NotFound();

        var orders = await db.Orders
            .Include(o => o.Branch).Include(o => o.Cashier).Include(o => o.Customer)
            .Include(o => o.Lines).ThenInclude(l => l.Product).Include(o => o.Payments).Include(o => o.Fees)
            .Where(o => o.CustomerId == id).OrderByDescending(o => o.CreatedAt).ToListAsync(ct);

        return Ok(new CustomerStatementDto(customer.Id, customer.NameEn, customer.CreditLimit, customer.Outstanding,
            orders.Select(o => OrdersController.MapOrder(o)).ToList()));
    }

    // Every event that ever moves Outstanding — checkout AccountCredit, a StoreCredit/AccountCredit
    // return, or a direct RecordPayment below — posts to GL account 1100 (Accounts Receivable) under
    // the order/return/payment's own reference number. Reconstructing from those postings (same
    // pattern as SuppliersController.Ledger) means the ledger and Outstanding can never drift apart —
    // there is only ever one source of truth, unlike the old order-only "statement" view.
    [HttpGet("{id:int}/ledger")]
    public async Task<ActionResult<List<CustomerLedgerLineDto>>> Ledger(int id, CancellationToken ct)
    {
        var orderNos = await db.Orders.Where(o => o.CustomerId == id).Select(o => o.OrderNo).ToListAsync(ct);
        var returnNos = await db.Returns.Where(r => r.CustomerId == id).Select(r => r.ReturnNo).ToListAsync(ct);
        var paymentNos = await db.CustomerPayments.Where(p => p.CustomerId == id).Select(p => p.PaymentNo).ToListAsync(ct);
        var references = orderNos.Concat(returnNos).Concat(paymentNos).ToList();
        if (references.Count == 0) return Ok(new List<CustomerLedgerLineDto>());

        var entries = await db.JournalEntries.Include(e => e.Lines).ThenInclude(l => l.Account)
            .Where(e => references.Contains(e.Reference)).OrderBy(e => e.Date).ToListAsync(ct);

        var rows = entries.SelectMany(e => e.Lines.Where(l => l.Account?.Code == "1100")
            .Select(l => new CustomerLedgerLineDto(e.Date, e.Reference, e.Description, l.Debit, l.Credit))).ToList();
        return Ok(rows);
    }

    // A direct settlement against Outstanding that isn't tied to a sale or a return — e.g. a B2B
    // customer wiring in against their running account. Restricted to B2B/Contractor for the same
    // reason checkout's AccountCredit tender is: Outstanding is only ever built up for those types,
    // so it's the only case a payment against it is meaningful.
    [HttpPost("{id:int}/payments")]
    [RequireModule("/operate/customers", PermissionAction.Create)]
    public async Task<ActionResult<CustomerDto>> RecordPayment(int id, RecordCustomerPaymentRequest request, CancellationToken ct)
    {
        var customer = await db.Customers.FindAsync([id], ct);
        if (customer is null) return NotFound();
        if (customer.Type is not (CustomerType.B2B or CustomerType.Contractor))
        {
            return BadRequest(new { error = "Only B2B / Contractor accounts carry an outstanding balance to pay down." });
        }
        if (request.Amount <= 0) return BadRequest(new { error = "Payment amount must be greater than zero." });

        var paymentNo = $"PAY-C{id}-{DateTime.UtcNow:yyyy}-{await db.CustomerPayments.CountAsync(p => p.CustomerId == id, ct) + 1:D4}";
        var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        db.CustomerPayments.Add(new CustomerPayment
        {
            CustomerId = id, PaymentNo = paymentNo, Amount = request.Amount, Method = request.Method,
            ReferenceNo = request.ReferenceNo, Notes = request.Notes, CreatedByUserId = userId,
        });
        customer.Outstanding -= request.Amount;
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("orders", "CUSTOMER_PAYMENT_RECORDED", id.ToString(), userId: userId, newValue: request, cancellationToken: ct);

        await gl.PostAsync(paymentNo, $"Payment received from {customer.NameEn}",
            [
                new GlLine("1000", request.Amount, 0, $"{request.Method} payment received"),
                new GlLine("1100", 0, request.Amount, $"Reduces {customer.NameEn}'s outstanding balance"),
            ], ct);

        var expiryMonths = (await db.GetLoyaltyConfigAsync(ct)).PointsExpiryMonths;
        return Ok(Map(customer, expiryMonths));
    }

    [HttpPost]
    [RequireModule("/operate/customers", PermissionAction.Create)]
    public async Task<ActionResult<CustomerDto>> Create(UpsertCustomerRequest request, CancellationToken ct)
    {
        var customer = new Customer
        {
            NameEn = request.NameEn, NameAr = request.NameAr, Type = Enum.Parse<CustomerType>(request.Type),
            Phone = request.Phone, Email = request.Email, VatNo = request.VatNo, CreditLimit = request.CreditLimit,
            City = request.City, District = request.District, Address = request.Address, LoyaltyEnrolled = request.LoyaltyEnrolled,
            ProjectName = request.ProjectName, CreditTermDays = request.CreditTermDays,
            AccountManagerUserId = request.AccountManagerUserId, PriorityBilling = request.PriorityBilling,
            DateOfBirth = request.DateOfBirth, PriceListType = Enum.Parse<PriceListType>(request.PriceListType),
        };
        db.Customers.Add(customer);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("orders", "CUSTOMER_CREATED", customer.Id.ToString(), newValue: request, cancellationToken: ct);
        var expiryMonths = (await db.GetLoyaltyConfigAsync(ct)).PointsExpiryMonths;
        return Ok(Map(customer, expiryMonths));
    }

    [HttpPut("{id:int}")]
    [RequireModule("/operate/customers", PermissionAction.Edit)]
    public async Task<ActionResult<CustomerDto>> Update(int id, UpsertCustomerRequest request, CancellationToken ct)
    {
        var customer = await db.Customers.FindAsync([id], ct);
        if (customer is null) return NotFound();

        customer.NameEn = request.NameEn; customer.NameAr = request.NameAr; customer.Type = Enum.Parse<CustomerType>(request.Type);
        customer.Phone = request.Phone; customer.Email = request.Email; customer.VatNo = request.VatNo; customer.CreditLimit = request.CreditLimit;
        customer.City = request.City; customer.District = request.District; customer.Address = request.Address;
        customer.LoyaltyEnrolled = request.LoyaltyEnrolled; customer.ProjectName = request.ProjectName; customer.CreditTermDays = request.CreditTermDays;
        customer.AccountManagerUserId = request.AccountManagerUserId; customer.PriorityBilling = request.PriorityBilling;
        customer.DateOfBirth = request.DateOfBirth; customer.PriceListType = Enum.Parse<PriceListType>(request.PriceListType);

        await db.SaveChangesAsync(ct);
        await audit.LogAsync("orders", "CUSTOMER_UPDATED", id.ToString(), newValue: request, cancellationToken: ct);
        var expiryMonths = (await db.GetLoyaltyConfigAsync(ct)).PointsExpiryMonths;
        return Ok(Map(customer, expiryMonths));
    }

    [HttpPut("{id:int}/archive")]
    [RequireModule("/operate/customers", PermissionAction.Delete)]
    public async Task<ActionResult<CustomerDto>> Archive(int id, CancellationToken ct)
    {
        var customer = await db.Customers.FindAsync([id], ct);
        if (customer is null) return NotFound();

        customer.Status = customer.Status == EntityStatus.Active ? EntityStatus.Inactive : EntityStatus.Active;
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("orders", customer.Status == EntityStatus.Inactive ? "CUSTOMER_ARCHIVED" : "CUSTOMER_REACTIVATED", id.ToString(), cancellationToken: ct);
        var expiryMonths = (await db.GetLoyaltyConfigAsync(ct)).PointsExpiryMonths;
        return Ok(Map(customer, expiryMonths));
    }

    private static CustomerDto Map(Customer c, int expiryMonths) => new(
        c.Id, c.NameEn, c.NameAr, c.Type.ToString(), c.Phone, c.Email, c.VatNo, c.CreditLimit, c.Outstanding,
        c.City, c.District, c.Address, c.LoyaltyEnrolled, c.LoyaltyPoints, c.LoyaltyLifetimePoints, c.LoyaltyTier.ToString(),
        c.Status.ToString(), c.LastPurchaseAt, c.ProjectName, c.CreditTermDays, c.CreatedAt,
        c.LoyaltyLifetimeSpend, c.AccountManagerUserId, c.AccountManager?.Name, c.PriorityBilling,
        c.DateOfBirth, LoyaltyRules.PointsExpiringSoon(c.LastPurchaseAt, DateTime.UtcNow, expiryMonths), c.PriceListType.ToString());
}
