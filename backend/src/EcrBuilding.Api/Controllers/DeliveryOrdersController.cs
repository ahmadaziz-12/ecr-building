using System.Security.Claims;
using System.Text.Json;
using EcrBuilding.Api.Authorization;
using EcrBuilding.Application.Abstractions;
using EcrBuilding.Application.Auth;
using EcrBuilding.Application.Delivery;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Api.Controllers;

[ApiController]
[Route("api/delivery/orders")]
[Authorize]
[RequireModule("/delivery/orders", PermissionAction.View)]
public class DeliveryOrdersController(AppDbContext db, IAuditService audit, IPermissionResolver permissionResolver) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<DeliveryOrderDto>>> List(CancellationToken ct)
    {
        var orders = await Query().OrderByDescending(o => o.CreatedAt).ToListAsync(ct);
        return Ok(orders.Select(Map).ToList());
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<DeliveryOrderDto>> Get(int id, CancellationToken ct)
    {
        var order = await Query().FirstOrDefaultAsync(o => o.Id == id, ct);
        return order is null ? NotFound() : Ok(Map(order));
    }

    [HttpPost]
    [RequireModule("/delivery/orders", PermissionAction.Create)]
    public async Task<ActionResult<DeliveryOrderDto>> Create(CreateDeliveryOrderRequest request, CancellationToken ct)
    {
        var vat = Math.Round((request.Charges.Fee + request.Charges.Handling + request.Charges.Heavy - request.Charges.Discount) * 0.15m, 2);
        var deliveryOrder = new DeliveryOrder
        {
            DeliveryNo = $"DO-{DateTime.UtcNow:yyyy}-{await db.DeliveryOrders.CountAsync(ct) + 1:D4}",
            OrderId = request.OrderId, CustomerId = request.CustomerId, Project = request.Project, PoRef = request.PoRef,
            BranchId = request.BranchId, WeightTons = request.WeightTons, Area = request.Area,
            AddressType = request.Address.Type, ContactName = request.Address.ContactName, ContactMobile = request.Address.ContactMobile,
            City = request.Address.City, District = request.Address.District, Street = request.Address.Street,
            Landmark = request.Address.Landmark, Instructions = request.Address.Instructions,
            PromisedDate = request.PromisedDate, PromisedTime = request.PromisedTime, TimeSlot = request.TimeSlot,
            Priority = Enum.Parse<DeliveryPriority>(request.Priority), DriverId = request.DriverId, VehicleId = request.VehicleId,
            Amount = request.Amount, FeeCharge = request.Charges.Fee, HandlingCharge = request.Charges.Handling,
            HeavyCharge = request.Charges.Heavy, DiscountCharge = request.Charges.Discount, VatCharge = vat,
        };

        foreach (var line in request.Lines)
        {
            var product = await db.Products.FindAsync([line.ProductId], ct);
            if (product is null) return BadRequest(new { error = $"Unknown product {line.ProductId}." });
            deliveryOrder.Lines.Add(new DeliveryOrderLine
            {
                ProductId = line.ProductId, Ordered = line.DeliveryQty, Uom = product.StockUom,
                UnitWeight = product.Weight, DeliveryQty = line.DeliveryQty,
            });
        }

        var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        deliveryOrder.History.Add(new DeliveryHistory { FromStage = DeliveryStage.Pending, ToStage = DeliveryStage.Pending, ByUserId = userId, Note = "Delivery order created" });

        db.DeliveryOrders.Add(deliveryOrder);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("delivery", "DELIVERY_CREATED", deliveryOrder.Id.ToString(), userId: userId, branchId: deliveryOrder.BranchId, cancellationToken: ct);

        var created = await Query().FirstAsync(o => o.Id == deliveryOrder.Id, ct);
        return Ok(Map(created));
    }

    // Delivery:Edit can request a move; Delivery:Full moves directly (and is who approves an Edit
    // user's request — see ApproveMove below). A user with Full never enters the request/approve
    // pipeline at all, since they can just move the order themselves.
    [HttpPut("{id:int}/transition")]
    [RequireModule("/delivery/orders", PermissionAction.Edit)]
    public async Task<ActionResult<TransitionResponseDto>> Transition(int id, TransitionRequest request, CancellationToken ct)
    {
        var order = await db.DeliveryOrders.Include(o => o.Lines).Include(o => o.Driver).Include(o => o.Vehicle)
            .FirstOrDefaultAsync(o => o.Id == id, ct);
        if (order is null) return NotFound();

        if (!Enum.TryParse<DeliveryStage>(request.ToStage, out var toStage))
        {
            return BadRequest(new { error = $"Unknown stage '{request.ToStage}'." });
        }

        var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        if (!await permissionResolver.HasAsync(userId, "/delivery/orders", PermissionAction.Approve, ct))
        {
            var effectiveDriverId = request.DriverId ?? order.DriverId;
            var effectiveVehicleId = request.VehicleId ?? order.VehicleId;
            var effectiveLines = order.Lines.Select(l =>
            {
                var progress = request.Lines?.FirstOrDefault(p => p.ProductId == l.ProductId);
                return (LoadedQty: progress?.LoadedQty ?? l.LoadedQty, DeliveredQty: progress?.DeliveredQty ?? l.DeliveredQty);
            }).ToList();

            var validationError = DeliveryTransitionEngine.Validate(order.Stage, toStage, effectiveDriverId, effectiveVehicleId, order.StockReserved, effectiveLines);
            if (validationError is not null) return BadRequest(new { error = validationError });

            var approval = new ApprovalRequest
            {
                Type = ApprovalType.DeliveryStageChange,
                BranchId = order.BranchId,
                RequestedByUserId = userId,
                Reason = $"Move {order.DeliveryNo} from {order.Stage} to {toStage}.",
                RelatedDeliveryOrderId = order.Id,
                Payload = JsonSerializer.Serialize(request),
            };
            db.ApprovalRequests.Add(approval);
            await db.SaveChangesAsync(ct);
            await audit.LogAsync("delivery", "DELIVERY_STAGE_CHANGE_REQUESTED", approval.Id.ToString(), userId: userId, branchId: order.BranchId, cancellationToken: ct);

            var requester = await db.Users.FindAsync([userId], ct);
            var pending = new DeliveryApprovalDto(approval.Id, order.Id, order.DeliveryNo, requester?.Name ?? "", null, order.Stage.ToString(), toStage.ToString(), approval.Reason, approval.Status.ToString(), approval.CreatedAt, null);
            var unchanged = await Query().FirstAsync(o => o.Id == order.Id, ct);
            return Ok(new TransitionResponseDto(false, Map(unchanged), pending));
        }

        var (error, history) = DeliveryTransitionEngine.Apply(order, request, toStage, userId);
        if (error is not null) return BadRequest(new { error });

        db.DeliveryHistories.Add(history!);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("delivery", "DELIVERY_STAGE_CHANGED", order.Id.ToString(), userId: userId,
            oldValue: history!.FromStage.ToString(), newValue: toStage.ToString(), cancellationToken: ct);

        var updated = await Query().FirstAsync(o => o.Id == id, ct);
        return Ok(new TransitionResponseDto(true, Map(updated), null));
    }

    [HttpGet("approvals")]
    public async Task<ActionResult<List<DeliveryApprovalDto>>> ListApprovals([FromQuery] string? status, CancellationToken ct)
    {
        var query = ApprovalsQuery();
        if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<ApprovalStatus>(status, ignoreCase: true, out var parsed))
        {
            query = query.Where(a => a.Status == parsed);
        }
        var rows = await query.OrderByDescending(a => a.CreatedAt).ToListAsync(ct);
        return Ok(rows.Select(MapApproval).ToList());
    }

    [HttpPut("approvals/{approvalId:int}/approve")]
    [RequireModule("/delivery/orders", PermissionAction.Approve)]
    public async Task<ActionResult<TransitionResponseDto>> ApproveMove(int approvalId, CancellationToken ct)
    {
        var approval = await db.ApprovalRequests.FirstOrDefaultAsync(a => a.Id == approvalId && a.Type == ApprovalType.DeliveryStageChange, ct);
        if (approval is null) return NotFound();
        if (approval.Status != ApprovalStatus.Pending) return BadRequest(new { error = "This request has already been resolved." });

        var approverId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        if (approverId == approval.RequestedByUserId)
        {
            return BadRequest(new { error = "You cannot approve your own request — a different user with move authority must approve it." });
        }

        var order = await db.DeliveryOrders.Include(o => o.Lines).Include(o => o.Driver).Include(o => o.Vehicle)
            .FirstOrDefaultAsync(o => o.Id == approval.RelatedDeliveryOrderId, ct);
        if (order is null) return NotFound(new { error = "The delivery order for this request no longer exists." });

        var request = JsonSerializer.Deserialize<TransitionRequest>(approval.Payload!)!;
        if (!Enum.TryParse<DeliveryStage>(request.ToStage, out var toStage))
        {
            return BadRequest(new { error = $"Unknown stage '{request.ToStage}'." });
        }

        var (error, history) = DeliveryTransitionEngine.Apply(order, request, toStage, approval.RequestedByUserId);
        if (error is not null) return BadRequest(new { error = $"This request is no longer valid: {error}" });

        db.DeliveryHistories.Add(history!);
        approval.Status = ApprovalStatus.Approved;
        approval.ApproverUserId = approverId;
        approval.ResolvedAt = DateTime.UtcNow;

        await db.SaveChangesAsync(ct);
        await audit.LogAsync("delivery", "DELIVERY_STAGE_CHANGE_APPROVED", approval.Id.ToString(), userId: approverId,
            oldValue: history!.FromStage.ToString(), newValue: toStage.ToString(), cancellationToken: ct);

        var updated = await Query().FirstAsync(o => o.Id == order.Id, ct);
        return Ok(new TransitionResponseDto(true, Map(updated), null));
    }

    [HttpPut("approvals/{approvalId:int}/reject")]
    [RequireModule("/delivery/orders", PermissionAction.Approve)]
    public async Task<ActionResult<DeliveryApprovalDto>> RejectMove(int approvalId, CancellationToken ct)
    {
        var approval = await db.ApprovalRequests.FirstOrDefaultAsync(a => a.Id == approvalId && a.Type == ApprovalType.DeliveryStageChange, ct);
        if (approval is null) return NotFound();
        if (approval.Status != ApprovalStatus.Pending) return BadRequest(new { error = "This request has already been resolved." });

        var approverId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        if (approverId == approval.RequestedByUserId)
        {
            return BadRequest(new { error = "You cannot reject your own request." });
        }

        approval.Status = ApprovalStatus.Rejected;
        approval.ApproverUserId = approverId;
        approval.ResolvedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("delivery", "DELIVERY_STAGE_CHANGE_REJECTED", approval.Id.ToString(), userId: approverId, cancellationToken: ct);

        var resolved = await ApprovalsQuery().FirstAsync(a => a.Id == approvalId, ct);
        return Ok(MapApproval(resolved));
    }

    private IQueryable<ApprovalRequest> ApprovalsQuery() => db.ApprovalRequests
        .Where(a => a.Type == ApprovalType.DeliveryStageChange)
        .Include(a => a.RequestedBy).Include(a => a.Approver).Include(a => a.RelatedDeliveryOrder);

    private static DeliveryApprovalDto MapApproval(ApprovalRequest a)
    {
        var request = a.Payload is not null ? JsonSerializer.Deserialize<TransitionRequest>(a.Payload) : null;
        return new DeliveryApprovalDto(
            a.Id, a.RelatedDeliveryOrderId ?? 0, a.RelatedDeliveryOrder?.DeliveryNo ?? "",
            a.RequestedBy?.Name ?? "", a.Approver?.Name, a.RelatedDeliveryOrder?.Stage.ToString() ?? "", request?.ToStage ?? "",
            a.Reason, a.Status.ToString(), a.CreatedAt, a.ResolvedAt);
    }

    private IQueryable<DeliveryOrder> Query() => db.DeliveryOrders
        .Include(o => o.Customer).Include(o => o.Branch).Include(o => o.Driver).Include(o => o.Vehicle)
        .Include(o => o.Lines).ThenInclude(l => l.Product)
        .Include(o => o.History).ThenInclude(h => h.By);

    private static DeliveryOrderDto Map(DeliveryOrder o)
    {
        var overdue = o.PromisedDate.Date < DateTime.UtcNow.Date && o.Stage is not (DeliveryStage.Delivered or DeliveryStage.Cancelled);
        return new DeliveryOrderDto(
            o.Id, o.DeliveryNo, o.OrderId, o.CustomerId, o.Customer?.NameEn ?? "Walk-in Customer", o.Customer?.Type.ToString() ?? "WalkIn", o.Project, o.PoRef,
            o.BranchId, o.Branch?.NameEn ?? "", o.PaymentStatus.ToString(), o.WeightTons, o.Area,
            o.AddressType, o.ContactName, o.ContactMobile, o.City, o.District, o.Street, o.Landmark, o.Instructions,
            o.PromisedDate, o.PromisedTime, o.TimeSlot, o.Priority.ToString(),
            o.DriverId, o.Driver?.Name, o.VehicleId, o.Vehicle?.Registration,
            o.Amount, o.FeeCharge, o.HandlingCharge, o.HeavyCharge, o.DiscountCharge, o.VatCharge,
            o.StockReserved, o.Stage.ToString(), o.DispatchedAt, o.DeliveredAt, o.ReceivedBy, o.Proof,
            o.FailureReason, o.NextAction, o.Notes,
            o.Lines.Select(l => new DeliveryLineDto(l.ProductId, l.Product?.Sku ?? "", l.Product?.NameEn ?? "", l.Ordered, l.Uom, l.UnitWeight, l.DeliveryQty, l.LoadedQty, l.MissingQty, l.DamagedQty, l.DeliveredQty)).ToList(),
            o.History.OrderBy(h => h.At).Select(h => new DeliveryHistoryDto(h.At, h.FromStage.ToString(), h.ToStage.ToString(), h.By?.Name ?? "", h.Note)).ToList(),
            overdue);
    }

    [HttpPut("{id:int}/reserve-stock")]
    [RequireModule("/delivery/orders", PermissionAction.Edit)]
    public async Task<ActionResult<DeliveryOrderDto>> ReserveStock(int id, CancellationToken ct)
    {
        var order = await db.DeliveryOrders.Include(o => o.Lines).FirstOrDefaultAsync(o => o.Id == id, ct);
        if (order is null) return NotFound();

        foreach (var line in order.Lines)
        {
            var stock = await db.BranchStockLevels.FirstOrDefaultAsync(s => s.ProductId == line.ProductId && s.BranchId == order.BranchId, ct);
            if (stock is null || stock.Available < line.DeliveryQty)
            {
                return BadRequest(new { error = $"Insufficient stock to reserve for product {line.ProductId}." });
            }
            stock.Reserved += line.DeliveryQty;
        }

        order.StockReserved = true;
        await db.SaveChangesAsync(ct);

        var updated = await Query().FirstAsync(o => o.Id == id, ct);
        return Ok(Map(updated));
    }
}
