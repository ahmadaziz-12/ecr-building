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
[Route("api/pos/orders")]
[Authorize]
[RequireModule(ModuleArea.Orders, AccessLevel.View)]
public class OrdersController(AppDbContext db, IAuditService audit, IPaymentGateway paymentGateway, IGlPostingService gl, IZatcaService zatca, ILogger<OrdersController> logger) : ControllerBase
{
    // Cashier's own contractor-discount rule, ported from the previous client-only PosCheckout.tsx.
    private const decimal ContractorDiscountPct = 5m;

    [HttpGet]
    public async Task<ActionResult<List<OrderDto>>> List(
        [FromQuery] string? status, [FromQuery] string? type, [FromQuery] DateTime? from, [FromQuery] DateTime? to,
        [FromQuery] string? search, [FromQuery] int page = 1, [FromQuery] int pageSize = 200, CancellationToken ct = default)
    {
        var query = Query();
        if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<OrderStatus>(status, ignoreCase: true, out var parsedStatus))
        {
            query = query.Where(o => o.Status == parsedStatus);
        }
        if (!string.IsNullOrWhiteSpace(type) && Enum.TryParse<OrderType>(type, ignoreCase: true, out var parsedType))
        {
            query = query.Where(o => o.Type == parsedType);
        }
        if (from is not null) query = query.Where(o => o.CreatedAt >= from);
        if (to is not null) query = query.Where(o => o.CreatedAt <= to);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(o => o.OrderNo.Contains(term) || (o.Customer != null && o.Customer.NameEn.Contains(term)));
        }

        var orders = await query.OrderByDescending(o => o.CreatedAt)
            .Skip(Math.Max(0, page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        return Ok(orders.Select(MapOrder).ToList());
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<OrderDto>> Get(int id, CancellationToken ct)
    {
        var order = await Query().FirstOrDefaultAsync(o => o.Id == id, ct);
        return order is null ? NotFound() : Ok(MapOrder(order));
    }

    [HttpPut("{id:int}/void")]
    [RequireModule(ModuleArea.Pos, AccessLevel.Edit)]
    public async Task<ActionResult<OrderDto>> Void(int id, VoidOrderRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Reason)) return BadRequest(new { error = "A reason is required to void an order." });

        var order = await Query().FirstOrDefaultAsync(o => o.Id == id, ct);
        if (order is null) return NotFound();
        if (order.Status == OrderStatus.Voided) return BadRequest(new { error = "Order is already voided." });

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        foreach (var line in order.Lines)
        {
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE BranchStockLevels SET OnHand = OnHand + {line.Qty} WHERE ProductId = {line.ProductId} AND BranchId = {order.BranchId}", ct);
        }

        order.Status = OrderStatus.Voided;
        order.PaymentStatus = PaymentStatus.Cancelled;
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        var cashierId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        await audit.LogAsync("pos", "ORDER_VOIDED", id.ToString(), userId: cashierId, branchId: order.BranchId, reason: request.Reason, cancellationToken: ct);

        var updated = await Query().FirstAsync(o => o.Id == id, ct);
        return Ok(MapOrder(updated));
    }

    [HttpPost]
    [RequireModule(ModuleArea.Pos, AccessLevel.Edit)]
    public async Task<ActionResult<OrderDto>> Checkout(CreateOrderRequest request, CancellationToken ct)
    {
        if (request.Lines.Count == 0)
        {
            return BadRequest(new { error = "Cart is empty." });
        }
        if (request.Payments.Count == 0)
        {
            return BadRequest(new { error = "At least one payment is required." });
        }

        var cashierId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var customer = request.CustomerId is null ? null : await db.Customers.FindAsync([request.CustomerId], ct);

        // Terminal.BranchId is the authoritative source — a raw client-supplied BranchId with no
        // cross-check would let a misconfigured/compromised terminal claim any branch's stock.
        if (request.TerminalId is not null)
        {
            var terminal = await db.Terminals.FindAsync([request.TerminalId], ct);
            if (terminal is null) return BadRequest(new { error = "Unknown terminal." });
            if (terminal.BranchId != request.BranchId) return BadRequest(new { error = "Terminal does not belong to the specified branch." });
        }

        // Loyalty points tendered as payment — validated up front, before stock is touched, same
        // as every other "can this checkout even proceed" check below.
        var loyaltyAmount = request.Payments
            .Where(p => p.Method.Equals("Loyalty", StringComparison.OrdinalIgnoreCase)).Sum(p => p.Amount);
        var pointsToRedeem = LoyaltyRules.PointsNeededForSar(loyaltyAmount);
        if (loyaltyAmount > 0)
        {
            if (customer is null || !customer.LoyaltyEnrolled)
            {
                return BadRequest(new { error = "This customer is not enrolled in the loyalty program." });
            }
            if (customer.LoyaltyPoints < pointsToRedeem)
            {
                return BadRequest(new { error = $"{customer.NameEn} only has {customer.LoyaltyPoints} loyalty points ({LoyaltyRules.SarForPoints(customer.LoyaltyPoints):F2} ر.س) — {pointsToRedeem} needed." });
            }
        }

        var discountPct = customer?.Type == CustomerType.Contractor ? ContractorDiscountPct : 0m;
        var order = new Order
        {
            OrderNo = $"ORD-{DateTime.UtcNow:yyyy}-{await db.Orders.CountAsync(ct) + 1:D4}",
            BranchId = request.BranchId,
            TerminalId = request.TerminalId,
            CashierUserId = cashierId,
            CustomerId = request.CustomerId,
            Type = Enum.Parse<OrderType>(request.Type),
            Notes = request.Notes,
        };

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        foreach (var line in request.Lines)
        {
            var product = await db.Products.FindAsync([line.ProductId], ct);
            if (product is null) return BadRequest(new { error = $"Unknown product {line.ProductId}." });

            // Atomic conditional decrement, not check-then-write: the WHERE clause is re-evaluated
            // against whatever is currently committed at UPDATE time, not a stale value read
            // earlier in this request. Two concurrent checkouts racing for the last unit can never
            // both succeed — the second one affects 0 rows and is rejected, instead of both
            // computing "OnHand - qty" off the same stale snapshot and quietly going negative.
            var rowsAffected = await db.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE BranchStockLevels SET OnHand = OnHand - {line.Qty} WHERE ProductId = {line.ProductId} AND BranchId = {request.BranchId} AND (OnHand - Reserved) >= {line.Qty}",
                ct);
            if (rowsAffected == 0)
            {
                return BadRequest(new { error = $"Insufficient stock for {product.Sku}." });
            }

            var lineTotal = Math.Round(line.Qty * product.SellingPrice * (1 - discountPct / 100), 2);
            order.Lines.Add(new OrderLine
            {
                ProductId = product.Id, Qty = line.Qty, UnitPrice = product.SellingPrice,
                DiscountPct = discountPct, VatRate = product.VatRate, LineTotal = lineTotal,
            });
        }

        order.SubTotal = order.Lines.Sum(l => l.Qty * l.UnitPrice);
        var lineTotalsSum = order.Lines.Sum(l => l.LineTotal);
        var contractorDiscount = order.SubTotal - lineTotalsSum;

        // Order-level discount layer (coupon + manual) — applied on top of the per-line contractor
        // discount, proportionally reducing VAT the same way a real tax engine would.
        decimal couponDiscount = 0;
        string? couponLabel = null;
        if (!string.IsNullOrWhiteSpace(request.CouponCode))
        {
            var coupon = await db.PricingRules.FirstOrDefaultAsync(r =>
                r.Code != null && r.Code.ToUpper() == request.CouponCode.ToUpper() && r.Status == PricingRuleStatus.Active, ct);
            if (coupon is null || (coupon.ValidUntil is not null && coupon.ValidUntil < DateTime.UtcNow))
            {
                return BadRequest(new { error = $"Coupon \"{request.CouponCode}\" is invalid or expired." });
            }
            couponDiscount = coupon.DiscountType == RuleDiscountType.Percentage ? lineTotalsSum * coupon.Value / 100 : coupon.Value;
            couponLabel = coupon.Code;
        }

        var manualDiscount = request.ManualDiscount is null ? 0
            : request.ManualDiscount.Type.Equals("Percentage", StringComparison.OrdinalIgnoreCase)
                ? lineTotalsSum * request.ManualDiscount.Value / 100
                : request.ManualDiscount.Value;

        var orderDiscount = Math.Min(lineTotalsSum, couponDiscount + manualDiscount);
        var discountRatio = lineTotalsSum == 0 ? 0 : orderDiscount / lineTotalsSum;

        order.VatTotal = order.Lines.Sum(l => l.LineTotal * (1 - discountRatio) * l.VatRate / 100);
        order.DiscountTotal = contractorDiscount + orderDiscount;
        var taxableTotal = lineTotalsSum - orderDiscount;

        foreach (var fee in request.CustomFees ?? [])
        {
            order.Fees.Add(new OrderFee { Label = fee.Label, Amount = fee.Amount });
        }
        var feesTotal = order.Fees.Sum(f => f.Amount);

        order.GrandTotal = Math.Round(taxableTotal + order.VatTotal + feesTotal, 2);

        var paymentsTotal = request.Payments.Sum(p => p.Amount);
        if (Math.Abs(paymentsTotal - order.GrandTotal) > 0.05m)
        {
            return BadRequest(new { error = $"Payments total {paymentsTotal:F2} does not match order total {order.GrandTotal:F2}." });
        }

        var allSucceeded = true;
        foreach (var payment in request.Payments)
        {
            var charge = await paymentGateway.ChargeAsync(payment.Method, payment.Amount, ct);
            order.Payments.Add(new OrderPayment
            {
                Method = Enum.Parse<PaymentMethod>(payment.Method, ignoreCase: true), Amount = payment.Amount,
                ReferenceNumber = charge.ReferenceNumber, Status = charge.Success ? PaymentRecordStatus.Completed : PaymentRecordStatus.Failed,
            });
            allSucceeded &= charge.Success;
        }
        order.PaymentStatus = allSucceeded ? PaymentStatus.Paid : PaymentStatus.PartiallyPaid;
        order.Status = allSucceeded ? OrderStatus.Completed : OrderStatus.Pending;

        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);

        if (customer is not null)
        {
            customer.LastPurchaseAt = DateTime.UtcNow;

            // Points redeemed always settle exactly as validated above; points earned accrue only
            // on the non-loyalty portion of the tender, so a fully-points-paid order can't mint
            // more points than it just spent.
            if (allSucceeded && customer.LoyaltyEnrolled)
            {
                if (pointsToRedeem > 0)
                {
                    customer.LoyaltyPoints -= pointsToRedeem;
                    db.LoyaltyTransactions.Add(new LoyaltyTransaction
                    {
                        CustomerId = customer.Id, OrderId = order.Id, BranchId = order.BranchId,
                        Type = LoyaltyTransactionType.Redeem, Points = -pointsToRedeem,
                        Description = $"Redeemed at checkout {order.OrderNo}", CreatedByUserId = cashierId,
                    });
                }

                var earnedPoints = LoyaltyRules.PointsForSar(order.GrandTotal - loyaltyAmount);
                if (earnedPoints > 0)
                {
                    customer.LoyaltyPoints += earnedPoints;
                    customer.LoyaltyLifetimePoints += earnedPoints;
                    customer.LoyaltyTier = LoyaltyRules.TierForLifetimePoints(customer.LoyaltyLifetimePoints);
                    db.LoyaltyTransactions.Add(new LoyaltyTransaction
                    {
                        CustomerId = customer.Id, OrderId = order.Id, BranchId = order.BranchId,
                        Type = LoyaltyTransactionType.Earn, Points = earnedPoints,
                        Description = $"Earned on {order.OrderNo}", CreatedByUserId = cashierId,
                    });
                }
            }

            await db.SaveChangesAsync(ct);
        }

        await tx.CommitAsync(ct);
        await audit.LogAsync("pos", "ORDER_COMPLETED", order.Id.ToString(), userId: cashierId, branchId: order.BranchId,
            newValue: new { order.OrderNo, order.GrandTotal, couponLabel }, cancellationToken: ct);

        if (allSucceeded)
        {
            var revenue = taxableTotal + feesTotal;
            await gl.PostAsync(order.OrderNo, $"POS sale to {(customer?.NameEn ?? "Walk-in Customer")}",
                [
                    new GlLine("1000", order.GrandTotal, 0),
                    new GlLine("4000", 0, revenue),
                    new GlLine("2100", 0, order.VatTotal),
                ], ct);

            // ZATCA failures must never fail the sale — left "Pending" for retry via /api/zatca/invoices/{orderId}/submit.
            try
            {
                await zatca.SubmitInvoiceForOrderAsync(order.Id, ct);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "ZATCA submission failed for order {OrderId}", order.Id);
            }
        }

        var created = await Query().FirstAsync(o => o.Id == order.Id, ct);
        return Ok(MapOrder(created));
    }

    private IQueryable<Order> Query() => db.Orders
        .Include(o => o.Branch).Include(o => o.Cashier).Include(o => o.Customer)
        .Include(o => o.Lines).ThenInclude(l => l.Product)
        .Include(o => o.Payments).Include(o => o.Fees);

    public static OrderDto MapOrder(Order o) => new(
        o.Id, o.OrderNo, o.BranchId, o.Branch?.NameEn ?? "", o.TerminalId, o.Cashier?.Name ?? "", o.CustomerId,
        o.Customer?.NameEn ?? "Walk-in Customer", o.Type.ToString(), o.Status.ToString(), o.PaymentStatus.ToString(),
        o.SubTotal, o.DiscountTotal, o.VatTotal, o.Fees.Sum(f => f.Amount), o.GrandTotal, o.CreatedAt,
        o.Lines.Select(l => new OrderLineDto(l.ProductId, l.Product?.Sku ?? "", l.Product?.NameEn ?? "", l.Qty, l.UnitPrice, l.DiscountPct, l.VatRate, l.LineTotal)).ToList(),
        o.Payments.Select(p => new OrderPaymentDto(p.Method.ToString(), p.Amount, p.ReferenceNumber, p.Status.ToString(), p.CreatedAt)).ToList(),
        o.Fees.Select(f => new OrderFeeDto(f.Label, f.Amount)).ToList());
}
