using EcrBuilding.Domain.Entities;

namespace EcrBuilding.Application.Delivery;

// Shared by DeliveryOrdersController's direct-transition path (caller has Delivery:Full) and its
// approve-a-pending-request path (a Full-access approver replays a stored TransitionRequest). Kept
// as a single source of truth so the two paths can never validate a move differently.
public static class DeliveryTransitionEngine
{
    public static readonly IReadOnlyDictionary<DeliveryStage, DeliveryStage[]> AllowedTransitions = new Dictionary<DeliveryStage, DeliveryStage[]>
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

    // Read-only pre-check used for the "must request approval" path — evaluates the same guards as
    // Apply() but against plain values instead of mutating the tracked DeliveryOrder, so a request
    // that will never be approvable is rejected up front without touching the entity (touching it
    // here would risk a later unrelated SaveChangesAsync silently persisting a half-applied move).
    public static string? Validate(DeliveryStage fromStage, DeliveryStage toStage, int? effectiveDriverId, int? effectiveVehicleId, bool stockReserved, IReadOnlyList<(decimal LoadedQty, decimal DeliveredQty)> effectiveLines)
    {
        if (!AllowedTransitions.TryGetValue(fromStage, out var allowed) || !allowed.Contains(toStage))
        {
            return $"Cannot move from {fromStage} to {toStage}.";
        }

        switch (toStage)
        {
            case DeliveryStage.Assigned:
                if (effectiveDriverId is null || effectiveVehicleId is null) return "Assigning requires a driver and a vehicle.";
                break;
            case DeliveryStage.Loading:
                if (!stockReserved) return "Stock must be reserved before loading.";
                break;
            case DeliveryStage.ReadyToDispatch:
                if (!effectiveLines.Any(l => l.LoadedQty > 0)) return "At least one line must have a loaded quantity.";
                break;
            case DeliveryStage.Dispatched:
                if (effectiveDriverId is null || effectiveVehicleId is null) return "Dispatch requires a driver and a vehicle.";
                break;
            case DeliveryStage.Delivered:
            case DeliveryStage.PartiallyDelivered:
                if (!effectiveLines.Any(l => l.DeliveredQty > 0)) return "At least one line must have a delivered quantity.";
                break;
        }

        return null;
    }

    // Mutates the tracked order in place (fields + driver/vehicle status + stage). Caller is
    // responsible for SaveChangesAsync — on error nothing should be saved, so only call this
    // immediately before a SaveChangesAsync you're prepared to run unconditionally on success.
    public static (string? Error, DeliveryHistory? History) Apply(DeliveryOrder order, TransitionRequest request, DeliveryStage toStage, int userId)
    {
        if (!AllowedTransitions.TryGetValue(order.Stage, out var allowed) || !allowed.Contains(toStage))
        {
            return ($"Cannot move from {order.Stage} to {toStage}.", null);
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

        switch (toStage)
        {
            case DeliveryStage.Assigned:
                if (order.DriverId is null || order.VehicleId is null)
                    return ("Assigning requires a driver and a vehicle.", null);
                break;
            case DeliveryStage.Loading:
                if (!order.StockReserved)
                    return ("Stock must be reserved before loading.", null);
                break;
            case DeliveryStage.ReadyToDispatch:
                if (!order.Lines.Any(l => l.LoadedQty > 0))
                    return ("At least one line must have a loaded quantity.", null);
                break;
            case DeliveryStage.Dispatched:
                if (order.DriverId is null || order.VehicleId is null)
                    return ("Dispatch requires a driver and a vehicle.", null);
                break;
            case DeliveryStage.Delivered:
            case DeliveryStage.PartiallyDelivered:
                if (!order.Lines.Any(l => l.DeliveredQty > 0))
                    return ("At least one line must have a delivered quantity.", null);
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

        var history = new DeliveryHistory { DeliveryOrderId = order.Id, FromStage = fromStage, ToStage = toStage, ByUserId = userId, Note = request.Note };
        return (null, history);
    }
}
