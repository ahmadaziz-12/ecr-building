using System.Security.Claims;
using EcrBuilding.Api.Authorization;
using EcrBuilding.Application.Abstractions;
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
[RequireModule(ModuleArea.Delivery, AccessLevel.View)]
public class DeliveryOrdersController(AppDbContext db, IAuditService audit) : ControllerBase
{
    // Ported verbatim from the previous client-only ALLOWED_TRANSITIONS state machine.
    private static readonly Dictionary<DeliveryStage, DeliveryStage[]> AllowedTransitions = new()
    {
        [DeliveryStage.Pending] = [DeliveryStage.Assigned, DeliveryStage.Cancelled],
        [DeliveryStage.Assigned] = [DeliveryStage.Loading, DeliveryStage.Pending, DeliveryStage.Cancelled],
        [DeliveryStage.Loading] = [DeliveryStage.ReadyToDispatch, DeliveryStage.Assigned],
        [DeliveryStage.ReadyToDispatch] = [DeliveryStage.Dispatched, DeliveryStage.Loading],
        [DeliveryStage.Dispatched] = [DeliveryStage.Delivered, DeliveryStage.PartiallyDelivered, DeliveryStage.Failed, DeliveryStage.ReturnedToBranch],
        [DeliveryStage.PartiallyDelivered] = [DeliveryStage.Delivered, DeliveryStage.Rescheduled, DeliveryStage.ReturnedToBranch],
        [DeliveryStage.Delivered] = [],
        [DeliveryStage.Failed] = [DeliveryStage.Rescheduled, DeliveryStage.ReturnedToBranch, DeliveryStage.Cancelled],
        [DeliveryStage.ReturnedToBranch] = [DeliveryStage.Rescheduled, DeliveryStage.Cancelled],
        [DeliveryStage.Cancelled] = [],
        [DeliveryStage.Rescheduled] = [DeliveryStage.Pending, DeliveryStage.Assigned],
    };

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
    [RequireModule(ModuleArea.Delivery, AccessLevel.Edit)]
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

    [HttpPut("{id:int}/transition")]
    [RequireModule(ModuleArea.Delivery, AccessLevel.Edit)]
    public async Task<ActionResult<DeliveryOrderDto>> Transition(int id, TransitionRequest request, CancellationToken ct)
    {
        var order = await db.DeliveryOrders.Include(o => o.Lines).Include(o => o.Driver).Include(o => o.Vehicle)
            .FirstOrDefaultAsync(o => o.Id == id, ct);
        if (order is null) return NotFound();

        if (!Enum.TryParse<DeliveryStage>(request.ToStage, out var toStage))
        {
            return BadRequest(new { error = $"Unknown stage '{request.ToStage}'." });
        }

        if (!AllowedTransitions.TryGetValue(order.Stage, out var allowed) || !allowed.Contains(toStage))
        {
            return BadRequest(new { error = $"Cannot move from {order.Stage} to {toStage}." });
        }

        if (request.DriverId is not null) order.DriverId = request.DriverId;
        if (request.VehicleId is not null) order.VehicleId = request.VehicleId;

        if (request.Lines is not null)
        {
            foreach (var progress in request.Lines)
            {
                var line = order.Lines.FirstOrDefault(l => l.ProductId == progress.ProductId);
                if (line is null) continue;
                if (progress.LoadedQty is not null) line.LoadedQty = progress.LoadedQty.Value;
                if (progress.DeliveredQty is not null) line.DeliveredQty = progress.DeliveredQty.Value;
                if (progress.MissingQty is not null) line.MissingQty = progress.MissingQty.Value;
                if (progress.DamagedQty is not null) line.DamagedQty = progress.DamagedQty.Value;
            }
        }

        // Guards ported from the previous client-only validate() function.
        switch (toStage)
        {
            case DeliveryStage.Assigned:
                if (order.DriverId is null || order.VehicleId is null)
                    return BadRequest(new { error = "Assigning requires a driver and a vehicle." });
                break;
            case DeliveryStage.Loading:
                if (!order.StockReserved)
                    return BadRequest(new { error = "Stock must be reserved before loading." });
                break;
            case DeliveryStage.ReadyToDispatch:
                if (!order.Lines.Any(l => l.LoadedQty > 0))
                    return BadRequest(new { error = "At least one line must have a loaded quantity." });
                break;
            case DeliveryStage.Dispatched:
                if (order.DriverId is null || order.VehicleId is null)
                    return BadRequest(new { error = "Dispatch requires a driver and a vehicle." });
                break;
            case DeliveryStage.Delivered:
            case DeliveryStage.PartiallyDelivered:
                if (!order.Lines.Any(l => l.DeliveredQty > 0))
                    return BadRequest(new { error = "At least one line must have a delivered quantity." });
                break;
        }

        var fromStage = order.Stage;
        order.Stage = toStage;
        if (request.ReceivedBy is not null) order.ReceivedBy = request.ReceivedBy;
        if (request.Proof is not null) order.Proof = request.Proof;
        if (request.FailureReason is not null) order.FailureReason = request.FailureReason;
        if (request.NextAction is not null) order.NextAction = request.NextAction;

        if (toStage == DeliveryStage.Dispatched)
        {
            order.DispatchedAt = DateTime.UtcNow;
            if (order.Driver is not null) order.Driver.Status = DriverStatus.OnDelivery;
            if (order.Vehicle is not null) order.Vehicle.Status = VehicleStatus.OnDelivery;
        }
        else if (toStage is DeliveryStage.Delivered or DeliveryStage.Failed or DeliveryStage.ReturnedToBranch or DeliveryStage.PartiallyDelivered)
        {
            if (toStage == DeliveryStage.Delivered) order.DeliveredAt = DateTime.UtcNow;
            if (order.Driver is not null) { order.Driver.Status = DriverStatus.Available; order.Driver.DeliveriesToday += 1; }
            if (order.Vehicle is not null) order.Vehicle.Status = VehicleStatus.Available;
        }
        else if (toStage == DeliveryStage.Loading)
        {
            if (order.Driver is not null) order.Driver.Status = DriverStatus.Loading;
            if (order.Vehicle is not null) order.Vehicle.Status = VehicleStatus.Loading;
        }

        var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        db.DeliveryHistories.Add(new DeliveryHistory { DeliveryOrderId = order.Id, FromStage = fromStage, ToStage = toStage, ByUserId = userId, Note = request.Note });

        await db.SaveChangesAsync(ct);
        await audit.LogAsync("delivery", "DELIVERY_STAGE_CHANGED", order.Id.ToString(), userId: userId,
            oldValue: fromStage.ToString(), newValue: toStage.ToString(), cancellationToken: ct);

        var updated = await Query().FirstAsync(o => o.Id == id, ct);
        return Ok(Map(updated));
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
    [RequireModule(ModuleArea.Delivery, AccessLevel.Edit)]
    public async Task<ActionResult<DeliveryOrderDto>> ReserveStock(int id, CancellationToken ct)
    {
        var order = await db.DeliveryOrders.Include(o => o.Lines).FirstOrDefaultAsync(o => o.Id == id, ct);
        if (order is null) return NotFound();

        var warehouse = await db.Warehouses.FirstOrDefaultAsync(w => w.BranchId == order.BranchId, ct);
        if (warehouse is null) return BadRequest(new { error = "No warehouse configured for this branch." });

        foreach (var line in order.Lines)
        {
            var stock = await db.StockLevels.FirstOrDefaultAsync(s => s.ProductId == line.ProductId && s.WarehouseId == warehouse.Id, ct);
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
