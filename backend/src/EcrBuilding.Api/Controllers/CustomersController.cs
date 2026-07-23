using EcrBuilding.Api.Authorization;
using EcrBuilding.Application.Abstractions;
using EcrBuilding.Application.Pos;
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
[RequireModule(ModuleArea.Orders, AccessLevel.View)]
public class CustomersController(AppDbContext db, IAuditService audit) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<CustomerDto>>> List([FromQuery] string? type, [FromQuery] string? search, CancellationToken ct)
    {
        var query = db.Customers.AsQueryable();
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
        return Ok(customers.Select(Map).ToList());
    }

    [HttpGet("by-phone")]
    public async Task<ActionResult<CustomerDto>> ByPhone([FromQuery] string phone, CancellationToken ct)
    {
        var customer = await db.Customers.FirstOrDefaultAsync(c => c.Phone == phone, ct);
        return customer is null ? NotFound() : Ok(Map(customer));
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
            orders.Select(OrdersController.MapOrder).ToList()));
    }

    [HttpPost]
    [RequireModule(ModuleArea.Orders, AccessLevel.Edit)]
    public async Task<ActionResult<CustomerDto>> Create(UpsertCustomerRequest request, CancellationToken ct)
    {
        var customer = new Customer
        {
            NameEn = request.NameEn, NameAr = request.NameAr, Type = Enum.Parse<CustomerType>(request.Type),
            Phone = request.Phone, Email = request.Email, VatNo = request.VatNo, CreditLimit = request.CreditLimit,
            City = request.City, District = request.District, Address = request.Address, LoyaltyEnrolled = request.LoyaltyEnrolled,
            ProjectName = request.ProjectName, CreditTermDays = request.CreditTermDays,
        };
        db.Customers.Add(customer);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("orders", "CUSTOMER_CREATED", customer.Id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(customer));
    }

    [HttpPut("{id:int}")]
    [RequireModule(ModuleArea.Orders, AccessLevel.Edit)]
    public async Task<ActionResult<CustomerDto>> Update(int id, UpsertCustomerRequest request, CancellationToken ct)
    {
        var customer = await db.Customers.FindAsync([id], ct);
        if (customer is null) return NotFound();

        customer.NameEn = request.NameEn; customer.NameAr = request.NameAr; customer.Type = Enum.Parse<CustomerType>(request.Type);
        customer.Phone = request.Phone; customer.Email = request.Email; customer.VatNo = request.VatNo; customer.CreditLimit = request.CreditLimit;
        customer.City = request.City; customer.District = request.District; customer.Address = request.Address;
        customer.LoyaltyEnrolled = request.LoyaltyEnrolled; customer.ProjectName = request.ProjectName; customer.CreditTermDays = request.CreditTermDays;

        await db.SaveChangesAsync(ct);
        await audit.LogAsync("orders", "CUSTOMER_UPDATED", id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(customer));
    }

    [HttpPut("{id:int}/archive")]
    [RequireModule(ModuleArea.Orders, AccessLevel.Edit)]
    public async Task<ActionResult<CustomerDto>> Archive(int id, CancellationToken ct)
    {
        var customer = await db.Customers.FindAsync([id], ct);
        if (customer is null) return NotFound();

        customer.Status = customer.Status == EntityStatus.Active ? EntityStatus.Inactive : EntityStatus.Active;
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("orders", customer.Status == EntityStatus.Inactive ? "CUSTOMER_ARCHIVED" : "CUSTOMER_REACTIVATED", id.ToString(), cancellationToken: ct);
        return Ok(Map(customer));
    }

    private static CustomerDto Map(Customer c) => new(
        c.Id, c.NameEn, c.NameAr, c.Type.ToString(), c.Phone, c.Email, c.VatNo, c.CreditLimit, c.Outstanding,
        c.City, c.District, c.Address, c.LoyaltyEnrolled, c.LoyaltyPoints, c.LoyaltyLifetimePoints, c.LoyaltyTier.ToString(),
        c.Status.ToString(), c.LastPurchaseAt, c.ProjectName, c.CreditTermDays, c.CreatedAt);
}
