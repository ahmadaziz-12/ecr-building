using System.Security.Claims;
using EcrBuilding.Api.Authorization;
using EcrBuilding.Application.Abstractions;
using EcrBuilding.Application.Auth;
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
[RequireModule("/operate/orders", PermissionAction.View)]
public class OrdersController(AppDbContext db, IAuditService audit, IStockMovementService stockMovements, IPaymentGateway paymentGateway, IGlPostingService gl, IZatcaService zatca, ILogger<OrdersController> logger, IPasswordHasher passwordHasher, IPermissionResolver permissionResolver) : ControllerBase
{
    // BRD §3.6: voids are logged with a REASON CODE, not free text.
    private static readonly string[] VoidReasonCodes =
        ["CustomerChangedMind", "PricingError", "DuplicateEntry", "StockIssue", "TrainingError", "Other"];

    // BRD §3.6/§10.1: a user whose role carries CanVoidTransactions may void alone; anyone else needs
    // a distinct authorizing manager confirming with their own PIN, captured separately in the audit.
    private async Task<(string? Error, int? AuthorizerId)> ValidateVoidAuthorizationAsync(
        string? reasonCode, string? authorizerEmail, string? authorizerPin, int currentUserId, CancellationToken ct)
    {
        if (reasonCode is null || !VoidReasonCodes.Contains(reasonCode))
        {
            return ($"A valid void reason code is required ({string.Join(", ", VoidReasonCodes)}).", null);
        }

        var canVoidAlone = string.Equals(User.FindFirst("posCeiling:canVoidTransactions")?.Value, "True", StringComparison.OrdinalIgnoreCase);
        if (canVoidAlone) return (null, currentUserId);

        if (string.IsNullOrWhiteSpace(authorizerEmail) || string.IsNullOrWhiteSpace(authorizerPin))
        {
            return ("Voiding requires authorization from a supervisor — provide the authorizing manager's email and PIN.", null);
        }
        var authorizer = await db.Users.Include(u => u.Role).FirstOrDefaultAsync(u => u.Email == authorizerEmail, ct);
        if (authorizer is null || authorizer.PinHash is null || !passwordHasher.Verify(authorizerPin, authorizer.PinHash))
        {
            return ("Authorizing manager email or PIN is incorrect.", null);
        }
        if (authorizer.Id == currentUserId)
        {
            return ("The authorizing manager must be a different person from the voiding cashier.", null);
        }
        if (authorizer.Role is not { CanVoidTransactions: true })
        {
            return ("The authorizing manager's role does not carry void authorization.", null);
        }
        return (null, authorizer.Id);
    }

    // Phase 4 (BRD §5.7 Business Controls) "Supervisor overrides": a bundle that's outside its
    // schedule, restricted to other branches, or restricted to other customer groups can still be
    // sold if a DIFFERENT user holding Approve permission on /stock/bundles re-authenticates inline
    // — same synchronous re-auth shape as ValidateVoidAuthorizationAsync above, deliberately not the
    // async ApprovalRequest queue (that would stall the sale waiting on a second login elsewhere).
    private async Task<(string? Error, int? AuthorizerId)> ValidateBundleOverrideAuthorizationAsync(
        string? supervisorEmail, string? supervisorPin, int currentUserId, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(supervisorEmail) || string.IsNullOrWhiteSpace(supervisorPin))
        {
            return ("provide a supervisor's email and PIN to override.", null);
        }
        var authorizer = await db.Users.FirstOrDefaultAsync(u => u.Email == supervisorEmail, ct);
        if (authorizer is null || authorizer.PinHash is null || !passwordHasher.Verify(supervisorPin, authorizer.PinHash))
        {
            return ("the supervisor's email or PIN is incorrect.", null);
        }
        if (authorizer.Id == currentUserId)
        {
            return ("the authorizing supervisor must be a different person from the cashier.", null);
        }
        if (!await permissionResolver.HasAsync(authorizer.Id, "/stock/bundles", PermissionAction.Approve, ct))
        {
            return ("the supervisor's role does not carry bundle approval authority.", null);
        }
        return (null, authorizer.Id);
    }

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
        var deliveryStatuses = await LoadDeliveryStatusesAsync(orders.Select(o => o.Id), ct);
        return Ok(orders.Select(o =>
        {
            var found = deliveryStatuses.TryGetValue(o.Id, out var d);
            return MapOrder(o, deliveryOrderId: found ? d.Id : null, deliveryOrderNo: found ? d.DeliveryNo : null, deliveryStage: found ? d.Stage.ToString() : null);
        }).ToList());
    }

    // BRD §4.3.3: the checkout screen needs the current redemption rate/min/max to show the
    // customer's SAR-equivalent balance and gate the redeem control — no Admin access required.
    [HttpGet("loyalty-config")]
    public async Task<ActionResult<LoyaltyConfigDto>> GetLoyaltyConfig(CancellationToken ct)
    {
        var config = await db.GetLoyaltyConfigAsync(ct);
        return Ok(new LoyaltyConfigDto(
            config.PointsPerSarEarned, config.PointsPerSarRedeemed, config.MinRedeemPoints, config.MaxRedeemPctOfTotal,
            config.SilverThreshold, config.GoldThreshold, config.PlatinumThreshold,
            config.SilverMultiplier, config.GoldMultiplier, config.PlatinumMultiplier,
            config.SilverDiscountPct, config.GoldDiscountPct, config.PlatinumDiscountPct,
            config.FreeDeliveryMinOrderSar));
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<OrderDto>> Get(int id, CancellationToken ct)
    {
        var order = await Query().FirstOrDefaultAsync(o => o.Id == id, ct);
        if (order is null) return NotFound();
        var deliveryStatuses = await LoadDeliveryStatusesAsync([id], ct);
        var found = deliveryStatuses.TryGetValue(id, out var d);
        return Ok(MapOrder(order, deliveryOrderId: found ? d.Id : null, deliveryOrderNo: found ? d.DeliveryNo : null, deliveryStage: found ? d.Stage.ToString() : null));
    }

    // Settles a Pending/Unpaid order — the missing back half of the quotation flow: Convert reserves
    // the stock and freezes the totals but creates the order unpaid, and checkout's own payment path
    // only runs for carts. Loyalty/AccountCredit tenders are checkout-only concerns (points math and
    // credit-limit overrides are validated against the cart there), so this accepts real rails only.
    [HttpPut("{id:int}/pay")]
    [RequireModule("/operate/pos-checkout", PermissionAction.Edit)]
    public async Task<ActionResult<OrderDto>> Pay(int id, PayOrderRequest request, CancellationToken ct)
    {
        var order = await Query().FirstOrDefaultAsync(o => o.Id == id, ct);
        if (order is null) return NotFound();
        if (order.Status == OrderStatus.Voided) return BadRequest(new { error = "This order has been voided." });
        if (order.PaymentStatus == PaymentStatus.Paid) return BadRequest(new { error = "This order is already fully paid." });
        if (request.Payments is not { Count: > 0 }) return BadRequest(new { error = "At least one payment is required." });
        foreach (var payment in request.Payments)
        {
            if (!Enum.TryParse<PaymentMethod>(payment.Method, ignoreCase: true, out var method))
            {
                return BadRequest(new { error = $"Unknown payment method \"{payment.Method}\"." });
            }
            if (method is PaymentMethod.Loyalty or PaymentMethod.AccountCredit)
            {
                return BadRequest(new { error = $"{method} can only be used at checkout, not to settle a pending order." });
            }
        }

        var alreadyPaid = order.Payments.Where(p => p.Status == PaymentRecordStatus.Completed).Sum(p => p.Amount);
        var paymentsTotal = request.Payments.Sum(p => p.Amount);
        var outstanding = order.GrandTotal - alreadyPaid;
        if (Math.Abs(paymentsTotal - outstanding) > 0.05m)
        {
            return BadRequest(new { error = $"Payments total {paymentsTotal:F2} does not match the outstanding amount {outstanding:F2}." });
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

        var cashierId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        int? loyaltyPointsEarnedForReceipt = null;
        int? loyaltyPointsBalanceForReceipt = null;
        int? loyaltyNextTierThresholdForReceipt = null;
        var loyaltyConfig = await db.GetLoyaltyConfigAsync(ct);

        if (allSucceeded)
        {
            order.PaymentStatus = PaymentStatus.Paid;
            order.Status = OrderStatus.Completed;
            if (order.TerminalId is null) order.TerminalId = request.TerminalId;

            // Mirrors Checkout's post-payment side effects (GL posting, ZATCA invoice, loyalty
            // accrual) — a converted-quotation order settled here is a real completed sale and must
            // get the same bookkeeping a cart checkout does, not just a payment-status flip.
            if (order.Customer is not null)
            {
                order.Customer.LastPurchaseAt = DateTime.UtcNow;

                if (order.Customer.LoyaltyEnrolled)
                {
                    // The order's totals are already frozen (from the quotation it was converted
                    // from) — no cart-time discount ratio to reconstruct, so accrual runs on each
                    // line's own LineTotal (the price actually agreed/charged), weighted only by the
                    // category multiplier and the customer's current tier, same as Checkout's formula
                    // minus the order-level-discount adjustment that doesn't apply to a fixed-price
                    // converted quotation.
                    var categoryIds = order.Lines.Select(l => l.Product?.CategoryId ?? 0).Distinct().ToList();
                    var accrualMultipliers = await db.Categories
                        .Where(c => categoryIds.Contains(c.Id))
                        .ToDictionaryAsync(c => c.Id, c => c.LoyaltyAccrualMultiplier, ct);
                    var weightedEligibleSar = order.Lines.Sum(l =>
                        l.LineTotal * (l.Product is not null && accrualMultipliers.TryGetValue(l.Product.CategoryId, out var m) ? m : 1m));

                    var tierMultiplier = LoyaltyRules.TierPointsMultiplier(order.Customer.LoyaltyTier, loyaltyConfig);
                    if (LoyaltyRules.IsBirthdayMonth(order.Customer.DateOfBirth, DateTime.UtcNow))
                    {
                        tierMultiplier *= loyaltyConfig.BirthdayBonusMultiplier;
                    }
                    var earnedPoints = LoyaltyRules.PointsForSar(weightedEligibleSar * tierMultiplier, loyaltyConfig.PointsPerSarEarned);
                    if (earnedPoints > 0)
                    {
                        order.Customer.LoyaltyPoints += earnedPoints;
                        order.Customer.LoyaltyLifetimePoints += earnedPoints;
                        db.LoyaltyTransactions.Add(new LoyaltyTransaction
                        {
                            CustomerId = order.Customer.Id, OrderId = order.Id, BranchId = order.BranchId,
                            Type = LoyaltyTransactionType.Earn, Points = earnedPoints,
                            Description = $"Earned on {order.OrderNo} ({tierMultiplier}x {order.Customer.LoyaltyTier})", CreatedByUserId = cashierId,
                        });
                    }

                    order.Customer.LoyaltyLifetimeSpend += weightedEligibleSar;
                    order.Customer.LoyaltyTier = LoyaltyRules.TierForLifetimeSpend(order.Customer.LoyaltyLifetimeSpend, loyaltyConfig);

                    loyaltyPointsEarnedForReceipt = earnedPoints;
                    loyaltyPointsBalanceForReceipt = order.Customer.LoyaltyPoints;
                    loyaltyNextTierThresholdForReceipt = (int?)LoyaltyRules.NextTierSpendThreshold(order.Customer.LoyaltyLifetimeSpend, loyaltyConfig);
                }
            }
        }
        else
        {
            order.PaymentStatus = PaymentStatus.PartiallyPaid;
        }

        await db.SaveChangesAsync(ct);
        await audit.LogAsync("orders", "ORDER_PAID", id.ToString(), userId: cashierId, branchId: order.BranchId,
            newValue: new { order.OrderNo, paymentsTotal, order.PaymentStatus }, cancellationToken: ct);

        if (allSucceeded)
        {
            var feesTotal = order.Fees.Sum(f => f.Amount);
            var revenue = (order.SubTotal - order.DiscountTotal) + feesTotal;
            await gl.PostAsync(order.OrderNo, $"Payment settled for {(order.Customer?.NameEn ?? "Walk-in Customer")}",
                [
                    new GlLine("1000", order.GrandTotal, 0, "Payment received"),
                    new GlLine("4000", 0, revenue, "Sales revenue, ex-VAT"),
                    new GlLine("2100", 0, order.VatTotal, "VAT collected"),
                ], ct);

            try
            {
                await zatca.SubmitInvoiceForOrderAsync(order.Id, ct);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "ZATCA submission failed for order {OrderId}", order.Id);
            }
        }

        var updated = await Query().FirstAsync(o => o.Id == order.Id, ct);
        return Ok(MapOrder(updated, loyaltyPointsEarnedForReceipt, loyaltyPointsBalanceForReceipt, loyaltyNextTierThresholdForReceipt));
    }

    [HttpPut("{id:int}/void")]
    [RequireModule("/operate/pos-checkout", PermissionAction.Delete)]
    public async Task<ActionResult<OrderDto>> Void(int id, VoidOrderRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Reason)) return BadRequest(new { error = "A reason is required to void an order." });

        var order = await Query().FirstOrDefaultAsync(o => o.Id == id, ct);
        if (order is null) return NotFound();
        if (order.Status == OrderStatus.Voided) return BadRequest(new { error = "Order is already voided." });

        var cashierId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var (authError, authorizerId) = await ValidateVoidAuthorizationAsync(request.ReasonCode, request.AuthorizerEmail, request.AuthorizerPin, cashierId, ct);
        if (authError is not null) return BadRequest(new { error = authError });

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // Restore what was actually deducted — StockQty in stock UOM, not the selling-UOM Qty
        // (voiding a 1-Pallet line must put 50 Bags back, not 1). StockQty=0 marks either a legacy
        // line written before the UOM engine, or a line that consumed a Remnant instead of
        // BranchStockLevel (see RemnantReversal) — both fall back to Qty/the remnant math below
        // rather than restoring nothing.
        var restoreQtyByLine = new Dictionary<int, decimal>();
        foreach (var line in order.Lines)
        {
            var restoreQty = await RemnantReversal.ReverseAsync(db, line, ct);
            restoreQtyByLine[line.Id] = restoreQty;
            if (restoreQty > 0)
            {
                await db.Database.ExecuteSqlInterpolatedAsync(
                    $"UPDATE BranchStockLevels SET OnHand = OnHand + {restoreQty} WHERE ProductId = {line.ProductId} AND BranchId = {order.BranchId}", ct);
            }
        }

        order.Status = OrderStatus.Voided;
        order.PaymentStatus = PaymentStatus.Cancelled;
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        await audit.LogAsync("pos", "ORDER_VOIDED", id.ToString(), userId: cashierId, branchId: order.BranchId,
            reason: $"{request.ReasonCode}: {request.Reason}",
            newValue: new { request.ReasonCode, AuthorizingManagerId = authorizerId, VoidedBy = cashierId },
            cancellationToken: ct);
        foreach (var line in order.Lines)
        {
            var restoreQty = restoreQtyByLine[line.Id];
            if (restoreQty > 0)
            {
                await stockMovements.RecordAsync(line.ProductId, order.BranchId, StockMovementType.Void, restoreQty,
                    refTable: "Order", refId: id.ToString(), userId: cashierId, cancellationToken: ct);
            }
        }

        var updated = await Query().FirstAsync(o => o.Id == id, ct);
        return Ok(MapOrder(updated));
    }

    // BRD §3.6 line-item void: removes ONE line, restores only that line's stock, and re-derives the
    // order totals from the discount ratio frozen at sale time. Bundle-tagged lines are excluded —
    // removing one constituent would silently break the bundle deal's pricing (void the whole order,
    // or process a return, instead).
    [HttpPut("{id:int}/void-line")]
    [RequireModule("/operate/pos-checkout", PermissionAction.Delete)]
    public async Task<ActionResult<OrderDto>> VoidLine(int id, VoidLineRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Reason)) return BadRequest(new { error = "A reason is required to void a line." });

        var order = await Query().FirstOrDefaultAsync(o => o.Id == id, ct);
        if (order is null) return NotFound();
        if (order.Status == OrderStatus.Voided) return BadRequest(new { error = "Order is already voided." });

        var line = order.Lines.FirstOrDefault(l => l.Id == request.OrderLineId);
        if (line is null) return BadRequest(new { error = "That line does not belong to this order." });
        if (line.BundleId is not null) return BadRequest(new { error = "Bundle items can't be voided individually — void the whole order or process a return." });
        if (order.Lines.Count == 1) return BadRequest(new { error = "This is the order's only line — void the whole order instead." });

        var cashierId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var (authError, authorizerId) = await ValidateVoidAuthorizationAsync(request.ReasonCode, request.AuthorizerEmail, request.AuthorizerPin, cashierId, ct);
        if (authError is not null) return BadRequest(new { error = authError });

        // Recover the order-level discount ratio the sale was priced with, so the removed line's VAT
        // and total shares come out exactly as they went in.
        var lineTotalsSum = order.Lines.Sum(l => l.LineTotal);
        var perLineDiscounts = order.SubTotal - lineTotalsSum;
        var orderDiscount = Math.Max(0, order.DiscountTotal - perLineDiscounts);
        var discountRatio = lineTotalsSum == 0 ? 0 : orderDiscount / lineTotalsSum;

        var lineNet = line.LineTotal * (1 - discountRatio);
        var lineVat = lineNet * line.VatRate / 100;

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // See Void's own comment — RemnantReversal handles a line that consumed or created a Remnant
        // instead of a plain BranchStockLevel deduction. Must run before the line itself is removed
        // below (it looks the line's Id up to find any Remnant it created).
        var restoreQty = await RemnantReversal.ReverseAsync(db, line, ct);
        if (restoreQty > 0)
        {
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE BranchStockLevels SET OnHand = OnHand + {restoreQty} WHERE ProductId = {line.ProductId} AND BranchId = {order.BranchId}", ct);
        }

        order.SubTotal = Math.Round(order.SubTotal - line.Qty * line.UnitPrice, 2);
        order.DiscountTotal = Math.Round(order.DiscountTotal - (line.Qty * line.UnitPrice - line.LineTotal) - line.LineTotal * discountRatio, 2);
        order.VatTotal = Math.Round(order.VatTotal - lineVat, 2);
        order.GrandTotal = Math.Round(order.GrandTotal - lineNet - lineVat, 2);
        order.Lines.Remove(line);
        db.OrderLines.Remove(line);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        await audit.LogAsync("pos", "ORDER_LINE_VOIDED", id.ToString(), userId: cashierId, branchId: order.BranchId,
            reason: $"{request.ReasonCode}: {request.Reason}",
            newValue: new { request.ReasonCode, LineId = request.OrderLineId, line.ProductId, line.Qty, RefundDue = Math.Round(lineNet + lineVat, 2), AuthorizingManagerId = authorizerId, VoidedBy = cashierId },
            cancellationToken: ct);
        if (restoreQty > 0)
        {
            await stockMovements.RecordAsync(line.ProductId, order.BranchId, StockMovementType.Void, restoreQty,
                refTable: "Order", refId: id.ToString(), userId: cashierId, cancellationToken: ct);
        }

        var updated = await Query().FirstAsync(o => o.Id == id, ct);
        return Ok(MapOrder(updated));
    }

    // A cart line as the pricing loop consumes it: plain product lines price at Product.SellingPrice;
    // bundle-expanded constituents carry a proportional-share price override and their BundleId tag.
    private sealed record PricedLine(CartLineInput Input, int? BundleId = null, decimal? UnitPriceOverride = null);

    [HttpPost]
    [RequireModule("/operate/pos-checkout", PermissionAction.Create)]
    public async Task<ActionResult<OrderDto>> Checkout(CreateOrderRequest request, CancellationToken ct)
    {
        if (request.Lines.Count == 0 && (request.Bundles is null || request.Bundles.Count == 0))
        {
            return BadRequest(new { error = "Cart is empty." });
        }
        if (request.Payments.Count == 0)
        {
            return BadRequest(new { error = "At least one payment is required." });
        }

        // Module 10 (offline replay): the same client request id always maps to the same order — a
        // queued checkout replayed twice after reconnection must never sell the stock twice.
        if (!string.IsNullOrWhiteSpace(request.ClientRequestId))
        {
            var existing = await Query().FirstOrDefaultAsync(o => o.ClientRequestId == request.ClientRequestId, ct);
            if (existing is not null) return Ok(MapOrder(existing));
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
        // as every other "can this checkout even proceed" check below. The min-points / max-%-of-
        // total checks need the order's GrandTotal, which isn't known yet, so those run later
        // (right after GrandTotal is computed) — this block only covers enrollment/balance.
        var loyaltyConfig = await db.GetLoyaltyConfigAsync(ct);
        var loyaltyAmount = request.Payments
            .Where(p => p.Method.Equals("Loyalty", StringComparison.OrdinalIgnoreCase)).Sum(p => p.Amount);
        var pointsToRedeem = LoyaltyRules.PointsNeededForSar(loyaltyAmount, loyaltyConfig.PointsPerSarRedeemed);
        if (loyaltyAmount > 0)
        {
            if (customer is null || !customer.LoyaltyEnrolled)
            {
                return BadRequest(new { error = "This customer is not enrolled in the loyalty program." });
            }
            if (customer.LoyaltyPoints < pointsToRedeem)
            {
                return BadRequest(new { error = $"{customer.NameEn} only has {customer.LoyaltyPoints} loyalty points ({LoyaltyRules.SarForPoints(customer.LoyaltyPoints, loyaltyConfig.PointsPerSarRedeemed):F2} ر.س) — {pointsToRedeem} needed." });
            }
        }

        // BRD §4.2 credit limit enforcement: AccountCredit is an internal ledger charge against a B2B
        // customer's credit line, not a real payment gateway rail — validated up front like every
        // other "can this checkout even proceed" check, before stock is touched.
        var accountCreditAmount = request.Payments
            .Where(p => p.Method.Equals("AccountCredit", StringComparison.OrdinalIgnoreCase)).Sum(p => p.Amount);
        if (accountCreditAmount > 0)
        {
            if (customer is null || (customer.Type != CustomerType.Contractor && customer.Type != CustomerType.B2B))
            {
                return BadRequest(new { error = "Account credit is only available for B2B / contractor customers." });
            }

            var projectedOutstanding = customer.Outstanding + accountCreditAmount;
            if (projectedOutstanding > customer.CreditLimit)
            {
                var hasOverride = request.CreditOverrideApprovalRequestId is int overrideId && await db.ApprovalRequests.AnyAsync(a =>
                    a.Id == overrideId && a.Type == ApprovalType.CreditOverride && a.Status == ApprovalStatus.Approved
                    && a.BranchId == request.BranchId, ct);

                if (!hasOverride)
                {
                    return BadRequest(new
                    {
                        error = $"This sale would take {customer.NameEn}'s outstanding balance to {projectedOutstanding:F2} ر.س, over their {customer.CreditLimit:F2} ر.س credit limit. Request supervisor approval before checkout.",
                    });
                }
            }
        }

        // BRD §7 (CR-039): an absolute per-line price override is a distinct authorization from a
        // discount — gated by Role.CanOverrideItemPrice (already issued as the posCeiling:canOverrideItemPrice
        // claim, previously unconsumed anywhere) or a PriceOverride approval, checked up front like
        // every other "can this checkout even proceed" gate above.
        if (request.Lines.Any(l => l.ManualUnitPrice is not null))
        {
            var canOverridePrice = string.Equals(User.FindFirst("posCeiling:canOverrideItemPrice")?.Value, "True", StringComparison.OrdinalIgnoreCase);
            if (!canOverridePrice)
            {
                var hasPriceApproval = request.PriceOverrideApprovalRequestId is int priceApprovalId && await db.ApprovalRequests.AnyAsync(a =>
                    a.Id == priceApprovalId && a.Type == ApprovalType.PriceOverride && a.Status == ApprovalStatus.Approved
                    && a.BranchId == request.BranchId, ct);

                if (!hasPriceApproval)
                {
                    return BadRequest(new { error = "Overriding an item's price requires supervisor approval. Request approval before checkout." });
                }
            }
        }

        // BRD §5.1/§6.2: Trade Tier and Quantity pricing rules configured on the Finance > Pricing
        // page (PricingRulesController) actually drive checkout math here — not just decorative rows
        // in that grid. Branch-scoped rules win over company-wide ones of the same type; among ties,
        // higher Priority wins.
        var activePricingRules = await db.PricingRules
            .Where(r => r.Status == PricingRuleStatus.Active
                && (r.BranchId == null || r.BranchId == request.BranchId)
                && (r.ValidFrom == null || r.ValidFrom <= DateTime.UtcNow)
                && (r.ValidUntil == null || r.ValidUntil >= DateTime.UtcNow))
            .ToListAsync(ct);

        // Per-line discount: the LARGER of the contractor trade discount and the customer's loyalty
        // tier discount (BRD §4.3.2: Silver 5% / Gold 10% / Platinum 15%, applied automatically) —
        // the two don't stack; a Gold contractor gets 10%, not 15%. The contractor rate comes only
        // from an actual active "Trade Tier" pricing rule configured on the Finance > Pricing page —
        // no rule means no automatic contractor discount (a manager must create one).
        var tierDiscountPct = customer is { LoyaltyEnrolled: true } ? LoyaltyRules.TierDiscountPct(customer.LoyaltyTier, loyaltyConfig) : 0m;
        var tradeTierRule = customer?.Type == CustomerType.Contractor
            ? activePricingRules.Where(r => r.Type == "Trade Tier")
                .OrderByDescending(r => r.BranchId != null).ThenByDescending(r => r.Priority).FirstOrDefault()
            : null;
        var contractorPct = tradeTierRule?.Value ?? 0m;
        var discountPct = Math.Max(contractorPct, tierDiscountPct);

        // BRD §6.2 Quantity Discount (Tiered): auto-applied per line once its quantity reaches the
        // rule's threshold — Sku null means the rule applies to any product.
        var quantityRules = activePricingRules.Where(r => r.Type == "Quantity" && r.MinQuantity is not null).ToList();
        // BRD §7 (CR-040): Promotional rules auto-apply within their ValidFrom/ValidUntil window —
        // no coupon code needed, unlike Type="Coupon". Sku null means "any product."
        var promoRules = activePricingRules.Where(r => r.Type == "Promotional").ToList();
        // Phase 2 (BRD §5.1) — pallet-tier pricing is a Quantity rule with PalletQty set (excluded
        // from quantityRules above, see PricingEngine.ResolveQuantityPct); Buy-X-Get-Y and Trade
        // Value are their own Types. See PricingEngine (Domain/Common) for the math.
        var palletRules = activePricingRules.Where(r => r.Type == "Quantity" && r.PalletQty is not null).ToList();
        var buyXGetYRules = activePricingRules.Where(r => r.Type == "Buy X Get Y" && r.BuyQty is not null && r.FreeQty is not null).ToList();
        var tradeValueRules = activePricingRules.Where(r => r.Type == "Trade Value" && r.MinCartTotal is not null).ToList();
        var order = new Order
        {
            OrderNo = $"ORD-{DateTime.UtcNow:yyyy}-{await db.Orders.CountAsync(ct) + 1:D4}",
            BranchId = request.BranchId,
            TerminalId = request.TerminalId,
            CashierUserId = cashierId,
            CustomerId = request.CustomerId,
            Type = Enum.Parse<OrderType>(request.Type),
            Notes = request.Notes,
            PoReference = request.PoReference,
            ProjectCode = request.ProjectCode,
            ClientRequestId = string.IsNullOrWhiteSpace(request.ClientRequestId) ? null : request.ClientRequestId,
        };

        // BRD §5.2: expand each bundle into its constituent lines BEFORE the pricing/stock loop.
        // Each constituent is priced at its proportional share of the bundle price (individual price ×
        // bundlePrice/individualTotal), so per-item VAT rates apply naturally (BRD §5.4) and the sum
        // of shares reproduces the bundle price. The individual-vs-bundle difference lands in
        // DiscountTotal as the combined bundle discount.
        var pricedLines = request.Lines.Select(l => new PricedLine(l)).ToList();
        decimal bundleDiscountTotal = 0;
        // Phase 4 (BRD §5.7): true if ANY bundle in this order has StackableDiscount == false —
        // gates the order-level coupon/manual/Trade-Value layer below.
        var nonStackableBundleInCart = false;
        foreach (var bundleInput in request.Bundles ?? [])
        {
            if (bundleInput.Qty <= 0) return BadRequest(new { error = "Bundle quantity must be positive." });
            var bundle = await db.ProductBundles.Include(b => b.Lines).ThenInclude(l => l.Product)
                .FirstOrDefaultAsync(b => b.Id == bundleInput.BundleId, ct);
            if (bundle is null) return BadRequest(new { error = $"Bundle {bundleInput.BundleId} does not exist." });

            // Phase 4 (BRD §5.7): scheduling/status, branch, and customer-group eligibility gates.
            // A supervisor can override any of them for this one sale by re-authenticating inline
            // (mirrors ValidateVoidAuthorizationAsync) instead of queuing an async approval that
            // would stall the sale at the register.
            var usable = BundleLifecycle.IsUsableNow(bundle.Status, bundle.StartDate, bundle.EndDate, DateTime.UtcNow);
            var branchOk = BundleLifecycle.IsBranchEligible(bundle.EligibleBranchIdsJson, request.BranchId);
            var customerOk = BundleLifecycle.IsCustomerTypeEligible(bundle.EligibleCustomerTypesJson, customer?.Type);
            if (!usable || !branchOk || !customerOk)
            {
                var (overrideError, _) = await ValidateBundleOverrideAuthorizationAsync(
                    bundleInput.SupervisorEmail, bundleInput.SupervisorPin, cashierId, ct);
                if (overrideError is not null)
                {
                    var reason = !usable ? "is not currently active" : !branchOk ? "is not available at this branch" : "is not available for this customer";
                    return BadRequest(new { error = $"Bundle {bundle.Code} {reason} — {overrideError}" });
                }
            }
            if (!bundle.StackableDiscount) nonStackableBundleInCart = true;

            var individualTotal = bundle.Lines.Sum(l => l.Qty * (l.Product?.SellingPrice ?? 0));
            if (individualTotal <= 0) return BadRequest(new { error = $"Bundle {bundle.Code} has no priced constituents." });
            var priceFactor = bundle.BundlePrice / individualTotal;
            bundleDiscountTotal += Math.Max(0, (individualTotal - bundle.BundlePrice) * bundleInput.Qty);

            foreach (var constituent in bundle.Lines)
            {
                var constituentPrice = (constituent.Product?.SellingPrice ?? 0) * priceFactor;
                pricedLines.Add(new PricedLine(
                    new CartLineInput(constituent.ProductId, constituent.Qty * bundleInput.Qty),
                    bundle.Id, constituentPrice));
            }
        }

        // Captured per line for the loyalty-points calculation below (BRD §4.3.1: accrual rate is
        // configurable per product category) — cheaper than re-querying products after the fact.
        var lineCategoryTotals = new List<(int CategoryId, decimal LineTotal)>();
        // BRD §3.5: lines the cashier flagged RequiresDelivery=true, captured in stock UOM (the same
        // unit DeliveryOrderLine.DeliveryQty uses everywhere else) so the auto-created DeliveryOrder
        // below never has to re-resolve the UOM conversion.
        var deliveryCandidateLines = new List<(int ProductId, string StockUom, decimal Weight, decimal StockQty, decimal LineTotal)>();

        // Batch-fetch every product referenced by the cart in one round trip instead of one
        // SELECT per line — matters once an invoice reaches the hundreds of line items (BRD "200+
        // line items"); the per-line atomic stock UPDATE below still runs per line since each one
        // needs its own live conditional check against concurrently-committed stock.
        var productIds = pricedLines.Select(p => p.Input.ProductId).Distinct().ToList();
        var productsById = await db.Products.Include(p => p.UomConversions)
            .Where(p => productIds.Contains(p.Id)).ToDictionaryAsync(p => p.Id, ct);

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        foreach (var priced in pricedLines)
        {
            var line = priced.Input;
            if (line.ManualDiscountPct is < 0 or > 100)
            {
                return BadRequest(new { error = $"Per-line discount for product {line.ProductId} must be between 0 and 100%." });
            }
            if (!productsById.TryGetValue(line.ProductId, out var product))
            {
                return BadRequest(new { error = $"Unknown product {line.ProductId}." });
            }

            // BRD §2.3 UOM engine: resolve the selling UOM the cashier chose into (entered qty,
            // selling-UOM unit price, stock-UOM deduction qty). Three cases:
            //  - cut-to-size with dimensions: qty = length × width area, priced per stock-UOM m²;
            //  - alternate selling UOM: qty stays as entered, price and deduction scale by the
            //    configured factor (1 Pallet = 50 Bag → price ×50, deduct ×50);
            //  - default: stock UOM, factor 1 — identical to pre-engine behavior.
            // An unconfigured selling UOM is a hard error, never a silent 1:1 assumption.
            decimal enteredQty = line.Qty;
            var sellUom = string.IsNullOrWhiteSpace(line.Uom) ? product.StockUom : line.Uom!;
            decimal factor;
            decimal? lengthM = null, widthM = null, heightM = null;
            // Cut-to-size enhancement: measuredQty/sourceQty/remnantQty/remnantAction stay null for
            // every non-cut-to-size line and for a cut-to-size line that doesn't use them — identical
            // to pre-existing behavior in both cases.
            decimal? measuredQty = null, sourceQty = null, remnantQty = null;
            string? remnantAction = null;
            // Cut Optimization: set when the cashier picked an existing offcut to cut from instead of
            // fresh bulk stock — see the ConsumeRemnantId branch below.
            Remnant? consumedRemnant = null;
            decimal remnantDiscountPct = 0m;

            // BRD §2.3 items 5-6: which dimensions a cut-to-size line needs depends on the product's
            // configured CutToSizeUnit — Length (cable/pipe, no width), Area (glass, length × width,
            // the original/default behavior), or Volume (sand/timber, length × width × height).
            if (product.IsCutToSize && line.LengthM is not null)
            {
                if (line.LengthM <= 0)
                {
                    return BadRequest(new { error = $"Cut-to-size length for {product.Sku} must be positive (got {line.LengthM})." });
                }
                if (product.CutToSizeUnit == "Length")
                {
                    enteredQty = UomMath.LengthOf(line.LengthM.Value);
                    lengthM = line.LengthM;
                }
                else if (product.CutToSizeUnit == "Volume")
                {
                    if (line.WidthM is null || line.HeightM is null || line.WidthM <= 0 || line.HeightM <= 0)
                    {
                        return BadRequest(new { error = $"Cut-to-size dimensions for {product.Sku} must be positive (got {line.LengthM} × {line.WidthM} × {line.HeightM})." });
                    }
                    enteredQty = UomMath.VolumeOf(line.LengthM.Value, line.WidthM.Value, line.HeightM.Value);
                    lengthM = line.LengthM; widthM = line.WidthM; heightM = line.HeightM;
                }
                else // "Area" — the original behavior, unchanged.
                {
                    if (line.WidthM is null || line.WidthM <= 0)
                    {
                        return BadRequest(new { error = $"Cut-to-size dimensions for {product.Sku} must be positive (got {line.LengthM} × {line.WidthM})." });
                    }
                    enteredQty = UomMath.AreaOf(line.LengthM.Value, line.WidthM.Value);
                    lengthM = line.LengthM; widthM = line.WidthM;
                }
                sellUom = product.StockUom;
                factor = 1m;

                // Cut Optimization: the cashier picked an existing offcut (Remnant) to cut this piece
                // from instead of fresh bulk stock. Reuses every bit of the "source piece / measured
                // cut / leftover" math below — the remnant's own Qty just stands in for a hand-typed
                // SourceQty, and a leftover from cutting an offcut still needs its own Restock/Scrap
                // call (a big enough remnant can itself leave a smaller remnant behind).
                if (line.ConsumeRemnantId is int remnantId)
                {
                    consumedRemnant = await db.Remnants.FirstOrDefaultAsync(r =>
                        r.Id == remnantId && r.ProductId == product.Id && r.BranchId == request.BranchId && r.Status == RemnantStatus.Available, ct);
                    if (consumedRemnant is null)
                    {
                        return BadRequest(new { error = $"The selected remnant for {product.Sku} is no longer available." });
                    }
                    if (consumedRemnant.Qty < enteredQty)
                    {
                        return BadRequest(new { error = $"That remnant ({consumedRemnant.Qty} {product.StockUom}) is smaller than the {enteredQty} being cut for {product.Sku}." });
                    }
                    sourceQty = consumedRemnant.Qty;
                    var leftoverFromRemnant = Math.Round(consumedRemnant.Qty - enteredQty, 3, MidpointRounding.AwayFromZero);
                    if (leftoverFromRemnant > 0)
                    {
                        if (line.RemnantAction is not "Restock" and not "Scrap")
                        {
                            return BadRequest(new { error = $"Specify how to handle the {leftoverFromRemnant} {product.StockUom} left from that piece for {product.Sku}: Restock or Scrap." });
                        }
                        remnantQty = leftoverFromRemnant;
                        remnantAction = line.RemnantAction;
                    }
                    remnantDiscountPct = consumedRemnant.DiscountPct;
                }
                // Remnant tracking: the cashier optionally records the source piece/roll size this
                // was cut from — omitted entirely, this is a no-op (deducts exactly the measured cut,
                // same as before this feature existed).
                else if (line.SourceQty is decimal src)
                {
                    if (src < enteredQty)
                    {
                        return BadRequest(new { error = $"Source size for {product.Sku} ({src} {product.StockUom}) can't be smaller than the {enteredQty} being cut." });
                    }
                    sourceQty = src;
                    var remnant = Math.Round(src - enteredQty, 3, MidpointRounding.AwayFromZero);
                    if (remnant > 0)
                    {
                        if (line.RemnantAction is not "Restock" and not "Scrap")
                        {
                            return BadRequest(new { error = $"Specify how to handle the {remnant} {product.StockUom} remnant for {product.Sku}: Restock or Scrap." });
                        }
                        remnantQty = remnant;
                        remnantAction = line.RemnantAction;
                    }
                }

                // BRD §2.3 enhancement: a minimum billable quantity keeps a tiny cut from being
                // charged less than the handling/setup cost of making it. Only the billed Qty/price
                // move — the actual measured cut (and what leaves stock) stays the real dimension.
                if (product.MinCutQty is decimal minQty && enteredQty < minQty)
                {
                    measuredQty = enteredQty;
                    enteredQty = minQty;
                }
            }
            else
            {
                var resolved = UomMath.FactorToStock(sellUom, product.StockUom,
                    product.UomConversions.Select(c => (c.Uom, c.FactorToStock)));
                if (resolved is null)
                {
                    return BadRequest(new { error = $"No conversion factor is configured for {product.Sku} in UOM \"{sellUom}\". Configure it in the product catalog before selling in this unit." });
                }
                factor = resolved.Value;
            }

            if (enteredQty <= 0) return BadRequest(new { error = $"Quantity for {product.Sku} must be positive." });
            // The customer's own actual physical demand, in stock UOM — the measured cut (or minimum
            // charge floor) for a cut-to-size line, the selling-UOM×factor conversion otherwise.
            // Unaffected by remnant scrapping: that's material that never reaches the customer.
            var stockQty = UomMath.ToStockQty(measuredQty ?? enteredQty, factor);
            // What actually leaves BranchStockLevel.OnHand. Consuming an existing Remnant touches
            // OnHand not at all — the Remnant's own Qty carries the deduction instead (below). Cutting
            // from bulk stock always removes the FULL source piece (Restock or Scrap alike) — a
            // Restocked leftover becomes its own tracked Remnant rather than silently reappearing in
            // OnHand "for free", so there is no more Restock/Scrap asymmetry here like there used to be.
            var deductQty = consumedRemnant is not null ? 0m
                : sourceQty is decimal src2 ? UomMath.ToStockQty(src2, factor) : stockQty;

            // BRD §7 (CR-038): resolve the list price for the customer's assigned price list — a
            // genuinely distinct price per segment, not a discount off SellingPrice. Null on Product
            // means "no override configured for this SKU," so it falls back to SellingPrice (Retail).
            var listPrice = product.SellingPrice;
            var listPriceApplied = false;
            if (customer is not null)
            {
                var segmentPrice = customer.PriceListType switch
                {
                    PriceListType.Contractor => product.ContractorPrice,
                    PriceListType.Wholesale => product.WholesalePrice,
                    PriceListType.Project => product.ProjectPrice,
                    _ => null,
                };
                if (segmentPrice is not null)
                {
                    listPrice = segmentPrice.Value;
                    listPriceApplied = true;
                }
            }

            // BRD §7 (CR-039): an absolute manual price override (gated above) replaces the resolved
            // list price entirely — no discount stacks on top of a price a manager already typed in.
            if (line.ManualUnitPrice is <= 0) return BadRequest(new { error = $"Manual price override for {product.Sku} must be positive." });
            var manualPriceOverride = line.ManualUnitPrice is not null;
            // Bundle constituents carry their proportional share of the bundle price (BRD §5.2) —
            // never re-priced from SellingPrice/list price, or the bundle discount would evaporate.
            var unitPrice = manualPriceOverride ? line.ManualUnitPrice!.Value : priced.UnitPriceOverride ?? listPrice * factor;

            // Atomic conditional decrement, not check-then-write: the WHERE clause is re-evaluated
            // against whatever is currently committed at UPDATE time, not a stale value read
            // earlier in this request. Two concurrent checkouts racing for the last unit can never
            // both succeed — the second one affects 0 rows and is rejected, instead of both
            // computing "OnHand - qty" off the same stale snapshot and quietly going negative.
            //
            // qty is cast to double for this parameter specifically because it appears in a WHERE
            // comparison, not just arithmetic: Microsoft.Data.Sqlite binds `decimal` parameters as
            // TEXT, and SQLite ranks NUMERIC storage class below TEXT for comparisons regardless of
            // content, so "(OnHand - Reserved) >= @decimalQty" silently matches zero rows under the
            // Sqlite test provider even when the quantity is available. A double-bound parameter gets
            // Sqlite's native REAL binding, sidestepping that entirely; MySQL compares DECIMAL vs
            // DOUBLE natively so production behavior is unchanged.
            if (consumedRemnant is not null)
            {
                // Same atomic-conditional-update shape as the BranchStockLevel decrement below, just
                // against the Remnant's own Qty — two cashiers racing for the same offcut can never
                // both win it. stockQty (not enteredQty) is what actually leaves the piece: a
                // MinCutQty floor bumps the BILLED qty, never the real material consumed.
                var remnantConsumeParam = (double)stockQty;
                var remnantRows = await db.Database.ExecuteSqlInterpolatedAsync(
                    $"UPDATE Remnants SET Qty = 0, Status = {nameof(RemnantStatus.Sold)} WHERE Id = {consumedRemnant.Id} AND Status = {nameof(RemnantStatus.Available)} AND Qty >= {remnantConsumeParam}",
                    ct);
                if (remnantRows == 0)
                {
                    return BadRequest(new { error = $"The selected remnant for {product.Sku} was just taken by another sale." });
                }
            }
            else
            {
                var deductQtyParam = (double)deductQty;
                var rowsAffected = await db.Database.ExecuteSqlInterpolatedAsync(
                    $"UPDATE BranchStockLevels SET OnHand = OnHand - {deductQtyParam} WHERE ProductId = {line.ProductId} AND BranchId = {request.BranchId} AND (OnHand - Reserved) >= {deductQtyParam}",
                    ct);
                if (rowsAffected == 0)
                {
                    return BadRequest(new { error = $"Insufficient stock for {product.Sku} ({deductQty} {product.StockUom} needed)." });
                }
            }

            // BRD §5.2: bundle items can't take a further per-line discount on top of the bundle
            // price without supervisor override — the contractor/tier % applies to plain lines only.
            // BRD §6.2 Quantity Discount: doesn't stack with the contractor/tier % either — this
            // line gets whichever is larger, same "larger of" rule used above for contractor vs loyalty.
            // Sku is uppercased at rule creation (PricingRulesController.Create) but a product's own
            // Sku is stored exactly as entered in the catalog — an ordinal match would silently never
            // fire for any product whose real SKU isn't already all-caps (e.g. catalog SKU "Net12"
            // vs. rule SKU "NET12"), so the comparison must ignore case.
            var quantityPct = PricingEngine.ResolveQuantityPct(quantityRules, product.Sku, stockQty);
            // BRD §7 (CR-040): Promotional rules stack into the same "larger of" group as everything
            // else below — a time-boxed promo doesn't add on top of an already-larger discount.
            var promoPct = PricingEngine.ResolvePromoPct(promoRules, product.Sku);
            // BRD §2.3/§6.2: a cashier-entered per-line discount doesn't stack with the auto contractor/
            // tier/quantity discount either — same "larger of" rule as those three, gated above like the
            // order-level ManualDiscount. Bundle constituents stay exempt (see comment above).
            var manualLinePct = line.ManualDiscountPct ?? 0m;
            // BRD §7 (CR-038): once a real Contractor list price was actually used for this line, the
            // legacy automatic contractor trade % would double-dip on top of an already-negotiated
            // price — suppressed in that case, but the customer's own loyalty-tier % still applies
            // (that's independent of which price list the line was charged from).
            var effectiveDiscountPct = listPriceApplied ? tierDiscountPct : discountPct;
            var lineDiscountPct = priced.BundleId is null && !manualPriceOverride
                ? PricingEngine.ResolveLineDiscountPct(effectiveDiscountPct, quantityPct, promoPct, manualLinePct, remnantDiscountPct)
                : 0m;

            // Phase 2 (BRD §5.1): Buy-X-Get-Y and pallet-tier pricing both split what the cashier
            // entered as ONE line into TWO OrderLine rows for the same product — stock is already
            // deducted above as one combined quantity, so this only changes how the sale is priced/
            // represented, not inventory. Scoped to plain stock-UOM, non-cut-to-size lines (every
            // example in the spec is whole units of the product's own stock UOM — a cut-to-size
            // glass panel or an alternate-UOM pallet line never has a sensible "N free units").
            var eligibleForSplit = priced.BundleId is null && !manualPriceOverride && lengthM is null && sellUom == product.StockUom;
            var buyXGetYRule = eligibleForSplit
                ? buyXGetYRules.Where(r => r.Sku == null || string.Equals(r.Sku, product.Sku, StringComparison.OrdinalIgnoreCase))
                    .OrderByDescending(r => r.BranchId != null).ThenByDescending(r => r.Priority).FirstOrDefault()
                : null;
            var (paidUnits, freeUnits) = buyXGetYRule is not null ? PricingEngine.ResolveBuyXGetYSplit(buyXGetYRule, stockQty) : (stockQty, 0m);

            if (freeUnits > 0)
            {
                var paidLineTotal = Math.Round(paidUnits * unitPrice * (1 - lineDiscountPct / 100), 2);
                order.Lines.Add(new OrderLine
                {
                    ProductId = product.Id, Qty = paidUnits, Uom = sellUom, StockQty = paidUnits, UnitPrice = unitPrice,
                    DiscountPct = lineDiscountPct, VatRate = product.VatRate, LineTotal = paidLineTotal, Notes = line.Notes,
                });
                order.Lines.Add(new OrderLine
                {
                    ProductId = product.Id, Qty = freeUnits, Uom = sellUom, StockQty = freeUnits, UnitPrice = unitPrice,
                    DiscountPct = 100, VatRate = product.VatRate, LineTotal = 0,
                    Notes = $"Buy {buyXGetYRule!.BuyQty:0.##} Get {buyXGetYRule.FreeQty:0.##} Free",
                });
                lineCategoryTotals.Add((product.CategoryId, paidLineTotal));
                lineCategoryTotals.Add((product.CategoryId, 0m));
                if (line.RequiresDelivery) deliveryCandidateLines.Add((product.Id, product.StockUom, product.Weight, stockQty, paidLineTotal));
                continue;
            }

            var palletRule = eligibleForSplit
                ? palletRules.Where(r => r.Sku == null || string.Equals(r.Sku, product.Sku, StringComparison.OrdinalIgnoreCase))
                    .OrderByDescending(r => r.BranchId != null).ThenByDescending(r => r.Priority).FirstOrDefault()
                : null;
            var (palletUnits, remainderUnits) = palletRule is not null ? PricingEngine.ResolvePalletSplit(palletRule, stockQty) : (0m, stockQty);

            if (palletUnits > 0)
            {
                var palletLineTotal = Math.Round(palletUnits * palletRule!.Value, 2);
                order.Lines.Add(new OrderLine
                {
                    ProductId = product.Id, Qty = palletUnits, Uom = sellUom, StockQty = palletUnits, UnitPrice = palletRule.Value,
                    DiscountPct = 0, VatRate = product.VatRate, LineTotal = palletLineTotal,
                    Notes = $"Pallet price ({palletRule.PalletQty:0.##}+)",
                });
                lineCategoryTotals.Add((product.CategoryId, palletLineTotal));
                var remainderLineTotal = 0m;
                if (remainderUnits > 0)
                {
                    remainderLineTotal = Math.Round(remainderUnits * unitPrice * (1 - lineDiscountPct / 100), 2);
                    order.Lines.Add(new OrderLine
                    {
                        ProductId = product.Id, Qty = remainderUnits, Uom = sellUom, StockQty = remainderUnits, UnitPrice = unitPrice,
                        DiscountPct = lineDiscountPct, VatRate = product.VatRate, LineTotal = remainderLineTotal, Notes = line.Notes,
                    });
                    lineCategoryTotals.Add((product.CategoryId, remainderLineTotal));
                }
                if (line.RequiresDelivery) deliveryCandidateLines.Add((product.Id, product.StockUom, product.Weight, stockQty, palletLineTotal + remainderLineTotal));
                continue;
            }

            var lineTotal = Math.Round(enteredQty * unitPrice * (1 - lineDiscountPct / 100), 2);
            order.Lines.Add(new OrderLine
            {
                // StockQty is deductQty (not stockQty) — the true net amount removed from
                // BranchStockLevel, including any permanently-scrapped remnant, so Void/VoidLine
                // restore exactly what was actually taken off the shelf (see their own restoreQty).
                // 0 for a remnant-consumed line: correctly, nothing left BranchStockLevel for it.
                ProductId = product.Id, Qty = enteredQty, Uom = sellUom, StockQty = deductQty,
                LengthM = lengthM, WidthM = widthM, HeightM = heightM, UnitPrice = unitPrice, BundleId = priced.BundleId,
                DiscountPct = lineDiscountPct, VatRate = product.VatRate, LineTotal = lineTotal, Notes = line.Notes,
                MeasuredQty = measuredQty, SourceQty = sourceQty, RemnantQty = remnantQty, RemnantAction = remnantAction,
                ConsumedRemnantId = consumedRemnant?.Id,
            });
            lineCategoryTotals.Add((product.CategoryId, lineTotal));
            if (line.RequiresDelivery)
            {
                deliveryCandidateLines.Add((product.Id, product.StockUom, product.Weight, stockQty, lineTotal));
            }
        }

        // SubTotal reflects what the items would cost individually — for bundle constituents that's
        // the full individual price, so the bundle saving shows up in DiscountTotal, not silently.
        order.SubTotal = order.Lines.Sum(l => l.Qty * l.UnitPrice) + bundleDiscountTotal;
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

        // BRD §6.2 discount authorization tiers: Cashier ≤5%, Supervisor 5–15%, Manager >15% for
        // percentage discounts; Fixed Amount discounts always require Supervisor-tier (or above)
        // approval regardless of size. Coupon and trade-account (contractor) discounts are exempt —
        // those are pre-validated/auto-applied per BRD and never gated here. A cashier-entered
        // per-line discount (BRD §2.3) is gated the same way as the order-level one — the highest
        // percentage requested anywhere in the cart decides whether approval is needed, and a single
        // DiscountApprovalRequestId covers the whole checkout either way.
        var maxLineManualPct = request.Lines.Where(l => l.ManualDiscountPct is not null)
            .Select(l => l.ManualDiscountPct!.Value).DefaultIfEmpty(0m).Max();
        if ((request.ManualDiscount is not null && request.ManualDiscount.Value > 0) || maxLineManualPct > 0)
        {
            var isFixed = request.ManualDiscount?.Type.Equals("Fixed", StringComparison.OrdinalIgnoreCase) ?? false;
            var orderImpliedPct = request.ManualDiscount is null ? 0m
                : isFixed
                    ? (lineTotalsSum == 0 ? 0 : request.ManualDiscount.Value / lineTotalsSum * 100)
                    : request.ManualDiscount.Value;
            var impliedPct = Math.Max(orderImpliedPct, maxLineManualPct);

            var discountCeilingClaim = User.FindFirst("posCeiling:discountPercent")?.Value;
            // Claim absent = "no cap" (Store Manager/System Admin tier) — see AuthService.IssueTokensAsync.
            decimal? discountCeiling = discountCeilingClaim is null ? null : decimal.Parse(discountCeilingClaim, System.Globalization.CultureInfo.InvariantCulture);

            var requiresApproval = isFixed
                ? !(discountCeiling is null || discountCeiling >= 15m) // Fixed always needs Supervisor+ (15% ceiling or unlimited)
                : discountCeiling is not null && impliedPct > discountCeiling;

            if (requiresApproval)
            {
                var hasApproval = request.DiscountApprovalRequestId is int approvalId && await db.ApprovalRequests.AnyAsync(a =>
                    a.Id == approvalId && a.Type == ApprovalType.Discount && a.Status == ApprovalStatus.Approved
                    && a.BranchId == request.BranchId, ct);

                if (!hasApproval)
                {
                    return BadRequest(new
                    {
                        error = isFixed
                            ? "Fixed-amount discounts require supervisor approval. Request approval before checkout."
                            : $"A {impliedPct:F1}% discount exceeds your authorization limit of {discountCeiling}%. Request supervisor approval before checkout.",
                    });
                }
            }
        }

        var manualDiscount = request.ManualDiscount is null ? 0
            : request.ManualDiscount.Type.Equals("Percentage", StringComparison.OrdinalIgnoreCase)
                ? lineTotalsSum * request.ManualDiscount.Value / 100
                : request.ManualDiscount.Value;

        // Phase 2 (BRD §5.1) Trade Value: a Contractor whose cart crosses the rule's SAR threshold
        // gets % off the whole order — an order-level discount like coupon/manual, not a per-line
        // one, so it shares their VAT-proration treatment via discountRatio below automatically.
        var tradeValuePct = customer?.Type == CustomerType.Contractor
            ? PricingEngine.ResolveTradeValuePct(tradeValueRules, lineTotalsSum)
            : 0m;
        var tradeValueDiscount = lineTotalsSum * tradeValuePct / 100;

        // Phase 4 (BRD §5.7) "Allow Stack Discounts": a non-stackable bundle's price is already the
        // deal — no coupon/manual/Trade-Value discount rides on top of it. Rejected outright rather
        // than silently zeroed, so the cashier sees exactly why the coupon they scanned didn't take.
        if (nonStackableBundleInCart && couponDiscount + manualDiscount + tradeValueDiscount > 0)
        {
            return BadRequest(new
            {
                error = "This order contains a bundle that doesn't allow stacking with other discounts — remove the coupon/manual discount, or the bundle, to continue.",
            });
        }

        var orderDiscount = Math.Min(lineTotalsSum, couponDiscount + manualDiscount + tradeValueDiscount);
        var discountRatio = lineTotalsSum == 0 ? 0 : orderDiscount / lineTotalsSum;

        order.VatTotal = order.Lines.Sum(l => l.LineTotal * (1 - discountRatio) * l.VatRate / 100);
        order.DiscountTotal = contractorDiscount + orderDiscount;
        order.BundleDiscountTotal = bundleDiscountTotal;
        var taxableTotal = lineTotalsSum - orderDiscount;

        // BRD §4.3.2: Silver+ loyalty customers get free delivery on orders above SAR 500 — any
        // delivery-labeled fee is waived (kept as a 0-amount line so the receipt shows the benefit).
        var freeDelivery = customer is { LoyaltyEnrolled: true }
            && LoyaltyRules.QualifiesForFreeDelivery(customer.LoyaltyTier, taxableTotal, loyaltyConfig);
        foreach (var fee in request.CustomFees ?? [])
        {
            var isDeliveryFee = fee.Label.Contains("delivery", StringComparison.OrdinalIgnoreCase);
            order.Fees.Add(freeDelivery && isDeliveryFee
                ? new OrderFee { Label = $"{fee.Label} (waived — {customer!.LoyaltyTier} tier)", Amount = 0 }
                : new OrderFee { Label = fee.Label, Amount = fee.Amount });
        }
        var feesTotal = order.Fees.Sum(f => f.Amount);

        order.GrandTotal = Math.Round(taxableTotal + order.VatTotal + feesTotal, 2);

        // BRD §4.3.3: minimum redemption threshold and maximum redemption as a % of the order
        // total — both need GrandTotal, so this can only run now, after it's computed above.
        var redemptionError = LoyaltyRules.ValidateRedemption(pointsToRedeem, loyaltyAmount, order.GrandTotal, loyaltyConfig);
        if (redemptionError is not null) return BadRequest(new { error = redemptionError });

        var paymentsTotal = request.Payments.Sum(p => p.Amount);
        if (Math.Abs(paymentsTotal - order.GrandTotal) > 0.05m)
        {
            return BadRequest(new { error = $"Payments total {paymentsTotal:F2} does not match order total {order.GrandTotal:F2}." });
        }

        var allSucceeded = true;
        foreach (var payment in request.Payments)
        {
            // AccountCredit is a ledger entry against the customer's own credit line (checked above),
            // not a real payment rail — it never goes through IPaymentGateway.
            var isAccountCredit = payment.Method.Equals("AccountCredit", StringComparison.OrdinalIgnoreCase);
            var success = true;
            string? referenceNumber = null;
            if (!isAccountCredit)
            {
                var charge = await paymentGateway.ChargeAsync(payment.Method, payment.Amount, ct);
                success = charge.Success;
                referenceNumber = charge.ReferenceNumber;
            }

            order.Payments.Add(new OrderPayment
            {
                Method = Enum.Parse<PaymentMethod>(payment.Method, ignoreCase: true), Amount = payment.Amount,
                ReferenceNumber = referenceNumber, Status = success ? PaymentRecordStatus.Completed : PaymentRecordStatus.Failed,
            });
            allSucceeded &= success;
        }
        order.PaymentStatus = allSucceeded ? PaymentStatus.Paid : PaymentStatus.PartiallyPaid;
        order.Status = allSucceeded ? OrderStatus.Completed : OrderStatus.Pending;

        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);

        // Cut Optimization: a line that tracked a source piece (bulk stock or a bigger remnant) and
        // chose to Restock its leftover becomes its own new sellable Remnant — created only now that
        // the line has a real Id to record as SourceOrderLineId. Scrap leaves no row (see the
        // informational StockMovement logged for it below); nothing to do here for those.
        foreach (var line in order.Lines.Where(l => l.RemnantQty is > 0 && l.RemnantAction == "Restock"))
        {
            var cutUnit = productsById.TryGetValue(line.ProductId, out var remnantProduct) ? remnantProduct.CutToSizeUnit : "Area";
            db.Remnants.Add(new Remnant
            {
                ProductId = line.ProductId, BranchId = order.BranchId, Qty = line.RemnantQty!.Value,
                // Only Length mode leaves an unambiguous single dimension for the new piece — Area/
                // Volume mode only knows the resulting m²/m³ value, not the new piece's own length ×
                // width (or × height), so those stay null (Qty is still exact and sellable either way).
                LengthM = cutUnit == "Length" ? line.RemnantQty : null,
                SourceOrderLineId = line.Id,
            });
        }
        await db.SaveChangesAsync(ct);

        int? loyaltyPointsEarnedForReceipt = null;
        int? loyaltyPointsBalanceForReceipt = null;
        int? loyaltyNextTierThresholdForReceipt = null;
        int? loyaltyPointsRedeemedForReceipt = allSucceeded && pointsToRedeem > 0 ? pointsToRedeem : null;

        if (customer is not null)
        {
            customer.LastPurchaseAt = DateTime.UtcNow;

            if (allSucceeded && accountCreditAmount > 0)
            {
                customer.Outstanding += accountCreditAmount;
            }

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

                // BRD §4.3.1: points are earned on the taxable merchandise total only — never on VAT,
                // delivery/custom fees, or the portion paid via redeemed loyalty points — and at a rate
                // configurable per product category (default 1x). order.GrandTotal includes VAT and
                // fees, so it must never be used here directly.
                var categoryIds = lineCategoryTotals.Select(l => l.CategoryId).Distinct().ToList();
                var accrualMultipliers = await db.Categories
                    .Where(c => categoryIds.Contains(c.Id))
                    .ToDictionaryAsync(c => c.Id, c => c.LoyaltyAccrualMultiplier, ct);
                var weightedEligibleSar = lineCategoryTotals.Sum(l =>
                    l.LineTotal * (1 - discountRatio) * (accrualMultipliers.TryGetValue(l.CategoryId, out var m) ? m : 1m));
                // BRD §4.3.2: the tier multiplier (Bronze 1x / Silver 1.5x / Gold 2x / Platinum 3x)
                // uses the tier the customer held WHEN PAYING — this sale's spend may promote them,
                // but the promotion benefits the next purchase, not retroactively this one.
                // BRD §4.3.4: the birthday-month bonus stacks on top automatically.
                var tierMultiplier = LoyaltyRules.TierPointsMultiplier(customer.LoyaltyTier, loyaltyConfig);
                if (LoyaltyRules.IsBirthdayMonth(customer.DateOfBirth, DateTime.UtcNow))
                {
                    tierMultiplier *= loyaltyConfig.BirthdayBonusMultiplier;
                }
                var eligibleSar = Math.Max(0, weightedEligibleSar - loyaltyAmount);
                var earnedPoints = LoyaltyRules.PointsForSar(eligibleSar * tierMultiplier, loyaltyConfig.PointsPerSarEarned);
                if (earnedPoints > 0)
                {
                    customer.LoyaltyPoints += earnedPoints;
                    customer.LoyaltyLifetimePoints += earnedPoints;
                    db.LoyaltyTransactions.Add(new LoyaltyTransaction
                    {
                        CustomerId = customer.Id, OrderId = order.Id, BranchId = order.BranchId,
                        Type = LoyaltyTransactionType.Earn, Points = earnedPoints,
                        Description = $"Earned on {order.OrderNo} ({tierMultiplier}x {customer.LoyaltyTier})", CreatedByUserId = cashierId,
                    });
                }

                // BRD §4.3.2: tier qualification is cumulative ex-VAT merchandise SPEND (unweighted —
                // category promo multipliers boost points, not tier progress).
                var spendSar = Math.Max(0, lineTotalsSum * (1 - discountRatio) - loyaltyAmount);
                customer.LoyaltyLifetimeSpend += spendSar;
                customer.LoyaltyTier = LoyaltyRules.TierForLifetimeSpend(customer.LoyaltyLifetimeSpend, loyaltyConfig);

                loyaltyPointsEarnedForReceipt = earnedPoints;
                loyaltyPointsBalanceForReceipt = customer.LoyaltyPoints;
                loyaltyNextTierThresholdForReceipt = (int?)LoyaltyRules.NextTierSpendThreshold(customer.LoyaltyLifetimeSpend, loyaltyConfig);
            }

            await db.SaveChangesAsync(ct);
        }

        // BRD §3.5: a paid sale with at least one delivery-flagged line auto-generates a delivery
        // order and forwards it to dispatch — no separate manual step in the Delivery module.
        // Unflagged lines stay with the customer as counter pickup, so a single sale can split
        // (partial delivery) without creating more than one DeliveryOrder document.
        DeliveryOrder? createdDeliveryOrder = null;
        if (allSucceeded && request.Delivery is not null && deliveryCandidateLines.Count > 0)
        {
            var d = request.Delivery;
            var zone = d.ZoneId is int zoneId ? await db.DeliveryZones.FindAsync([zoneId], ct) : null;
            var feeCharge = zone?.Fee ?? 0m;
            var vatCharge = Math.Round(feeCharge * 0.15m, 2);

            createdDeliveryOrder = new DeliveryOrder
            {
                DeliveryNo = $"DO-{DateTime.UtcNow:yyyy}-{await db.DeliveryOrders.CountAsync(ct) + 1:D4}",
                OrderId = order.Id, CustomerId = order.CustomerId, BranchId = order.BranchId,
                WeightTons = d.WeightTons ?? deliveryCandidateLines.Sum(l => l.StockQty * l.Weight) / 1000m,
                Area = d.City,
                AddressType = d.AddressType, ContactName = d.ContactName, ContactMobile = d.ContactMobile,
                City = d.City, District = d.District, Street = d.Street, Landmark = d.Landmark, Instructions = d.Instructions,
                PromisedDate = d.PromisedDate, PromisedTime = d.PromisedTime, TimeSlot = d.TimeSlot,
                Priority = Enum.TryParse<DeliveryPriority>(d.Priority, out var priority) ? priority : DeliveryPriority.Standard,
                DriverId = d.DriverId, VehicleId = d.VehicleId,
                Amount = deliveryCandidateLines.Sum(l => l.LineTotal), FeeCharge = feeCharge, VatCharge = vatCharge,
            };
            foreach (var l in deliveryCandidateLines)
            {
                createdDeliveryOrder.Lines.Add(new DeliveryOrderLine
                {
                    ProductId = l.ProductId, Ordered = l.StockQty, Uom = l.StockUom, UnitWeight = l.Weight, DeliveryQty = l.StockQty,
                });
            }
            createdDeliveryOrder.History.Add(new DeliveryHistory
            {
                FromStage = DeliveryStage.Pending, ToStage = DeliveryStage.Pending, ByUserId = cashierId,
                Note = $"Created from POS checkout {order.OrderNo}",
            });
            db.DeliveryOrders.Add(createdDeliveryOrder);
            await db.SaveChangesAsync(ct);
        }

        await tx.CommitAsync(ct);
        await audit.LogAsync("pos", "ORDER_COMPLETED", order.Id.ToString(), userId: cashierId, branchId: order.BranchId,
            newValue: new { order.OrderNo, order.GrandTotal, couponLabel }, cancellationToken: ct);
        foreach (var line in order.Lines)
        {
            // 0 for a remnant-consumed line — nothing left BranchStockLevel, so no Sale movement
            // against it (see RemnantConsumed below instead).
            if (line.StockQty > 0)
            {
                await stockMovements.RecordAsync(line.ProductId, order.BranchId, StockMovementType.Sale, -line.StockQty,
                    refTable: "Order", refId: order.Id.ToString(), userId: cashierId, cancellationToken: ct);
            }
            // Cut Optimization: informational only, never touches BranchStockLevel — the atomic
            // Remnants UPDATE above already carried the real deduction against that offcut's own Qty.
            if (line.ConsumedRemnantId is int consumedId)
            {
                await stockMovements.RecordAsync(line.ProductId, order.BranchId, StockMovementType.RemnantConsumed, -(line.MeasuredQty ?? line.Qty),
                    refTable: "Remnant", refId: consumedId.ToString(), userId: cashierId, cancellationToken: ct);
            }
            // Informational only — line.StockQty already carries the full net deduction (including a
            // scrapped remnant), these just explain, for reporting, why it differs from the plain
            // measured cut.
            if (line.RemnantQty is > 0)
            {
                var remnantType = line.RemnantAction == "Scrap" ? StockMovementType.WriteOff : StockMovementType.CutRemnantRestock;
                var remnantMoveQty = line.RemnantAction == "Scrap" ? -line.RemnantQty.Value : line.RemnantQty.Value;
                await stockMovements.RecordAsync(line.ProductId, order.BranchId, remnantType, remnantMoveQty,
                    refTable: "OrderLine", refId: line.Id.ToString(), userId: cashierId, cancellationToken: ct);
            }
        }
        if (createdDeliveryOrder is not null)
        {
            await audit.LogAsync("delivery", "DELIVERY_CREATED", createdDeliveryOrder.Id.ToString(), userId: cashierId,
                branchId: createdDeliveryOrder.BranchId, cancellationToken: ct);
        }

        if (allSucceeded)
        {
            var revenue = taxableTotal + feesTotal;
            // AccountCredit tenders never touch Cash & Bank — that portion is money the customer
            // still owes, so it debits Accounts Receivable (1100) instead, keeping 1000 an accurate
            // cash/card figure and making the customer's Outstanding balance traceable in the GL
            // (CustomersController.Ledger reads exactly this account for exactly this reason).
            var cashPortion = order.GrandTotal - accountCreditAmount;
            var saleLines = new List<GlLine>
            {
                new("4000", 0, revenue, "Sales revenue, ex-VAT"),
                new("2100", 0, order.VatTotal, "VAT collected"),
            };
            if (cashPortion > 0) saleLines.Add(new GlLine("1000", cashPortion, 0, "Payment received"));
            if (accountCreditAmount > 0) saleLines.Add(new GlLine("1100", accountCreditAmount, 0, $"Charged to {(customer?.NameEn ?? "customer")}'s account balance"));
            await gl.PostAsync(order.OrderNo, $"POS sale to {(customer?.NameEn ?? "Walk-in Customer")}", saleLines, ct);

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
        return Ok(MapOrder(created, loyaltyPointsEarnedForReceipt, loyaltyPointsBalanceForReceipt, loyaltyNextTierThresholdForReceipt, loyaltyPointsRedeemedForReceipt,
            createdDeliveryOrder?.Id, createdDeliveryOrder?.DeliveryNo, createdDeliveryOrder?.Stage.ToString()));
    }

    private IQueryable<Order> Query() => db.Orders
        .Include(o => o.Branch).Include(o => o.Cashier).Include(o => o.Customer)
        .Include(o => o.Lines).ThenInclude(l => l.Product)
        .Include(o => o.Lines).ThenInclude(l => l.Bundle)
        .Include(o => o.Payments).Include(o => o.Fees);

    // BRD §3.5 ("Delivery status ... viewable from POS for active orders"): batches one lookup for
    // however many orders are being mapped, instead of a per-order round trip.
    private async Task<Dictionary<int, (int Id, string DeliveryNo, DeliveryStage Stage)>> LoadDeliveryStatusesAsync(IEnumerable<int> orderIds, CancellationToken ct)
    {
        var ids = orderIds.ToList();
        var rows = await db.DeliveryOrders.Where(d => d.OrderId != null && ids.Contains(d.OrderId.Value))
            .Select(d => new { d.OrderId, d.Id, d.DeliveryNo, d.Stage }).ToListAsync(ct);
        return rows.GroupBy(r => r.OrderId!.Value).ToDictionary(g => g.Key, g => (g.First().Id, g.First().DeliveryNo, g.First().Stage));
    }

    public static OrderDto MapOrder(Order o, int? loyaltyPointsEarned = null, int? loyaltyPointsBalance = null, int? loyaltyNextTierThreshold = null, int? loyaltyPointsRedeemed = null,
        int? deliveryOrderId = null, string? deliveryOrderNo = null, string? deliveryStage = null) => new(
        o.Id, o.OrderNo, o.BranchId, o.Branch?.NameEn ?? "", o.TerminalId, o.Cashier?.Name ?? "", o.CustomerId,
        o.Customer?.NameEn ?? "Walk-in Customer", o.Type.ToString(), o.Status.ToString(), o.PaymentStatus.ToString(),
        o.SubTotal, o.DiscountTotal, o.BundleDiscountTotal, o.VatTotal, o.Fees.Sum(f => f.Amount), o.GrandTotal, o.CreatedAt,
        // Legacy lines predating the UOM engine have StockQty=0 — fall back to Qty, same rule the
        // Uom/StockQty doc comment on OrderLineDto already applies to every other stock-UOM reader.
        o.Lines.Select(l => new OrderLineDto(l.ProductId, l.Product?.Sku ?? "", l.Product?.NameEn ?? "", l.Qty, l.UnitPrice, l.DiscountPct, l.VatRate, l.LineTotal, l.Uom, l.StockQty, l.LengthM, l.WidthM, l.Id, l.BundleId, l.Bundle?.NameEn,
            (l.Product?.Weight ?? 0) * (l.StockQty > 0 ? l.StockQty : l.Qty), l.HeightM, l.Notes,
            l.MeasuredQty, l.SourceQty, l.RemnantQty, l.RemnantAction, l.ConsumedRemnantId)).ToList(),
        o.Payments.Select(p => new OrderPaymentDto(p.Method.ToString(), p.Amount, p.ReferenceNumber, p.Status.ToString(), p.CreatedAt)).ToList(),
        o.Fees.Select(f => new OrderFeeDto(f.Label, f.Amount)).ToList(),
        loyaltyPointsEarned, loyaltyPointsBalance, loyaltyNextTierThreshold, loyaltyPointsRedeemed,
        deliveryOrderId, deliveryOrderNo, deliveryStage, o.PoReference, o.ProjectCode);
}
