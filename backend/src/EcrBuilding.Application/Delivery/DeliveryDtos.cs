namespace EcrBuilding.Application.Delivery;

public record DriverDto(int Id, string Name, int BranchId, string BranchName, string Mobile, string License, DateTime LicenseExpiry, int? VehicleId, string Status, int DeliveriesToday, bool Available);
public record UpsertDriverRequest(string Name, int BranchId, string Mobile, string License, DateTime LicenseExpiry);
public record UpdateDriverRequest(string Name, int BranchId, string Mobile, string License, DateTime LicenseExpiry, int? VehicleId, string Status);

public record VehicleDto(int Id, string Registration, string Type, int BranchId, string BranchName, decimal CapacityTons, decimal CurrentLoad, string Status, string DeviceStatus);
public record UpsertVehicleRequest(string Registration, string Type, int BranchId, decimal CapacityTons);
public record UpdateVehicleRequest(string Registration, string Type, int BranchId, decimal CapacityTons, string Status);

public record ZoneDto(int Id, string Name, string City, decimal DistanceKm, decimal Fee);
public record UpsertZoneRequest(string Name, string City, decimal DistanceKm, decimal Fee);

public record DeliveryLineDto(int ProductId, string Sku, string ProductName, decimal Ordered, string Uom, decimal UnitWeight, decimal DeliveryQty, decimal LoadedQty, decimal MissingQty, decimal DamagedQty, decimal DeliveredQty);
public record DeliveryHistoryDto(DateTime At, string FromStage, string ToStage, string ByName, string? Note);

public record DeliveryOrderDto(
    int Id, string DeliveryNo, int? OrderId, int? CustomerId, string CustomerName, string CustomerType, string? Project, string? PoRef,
    int BranchId, string BranchName, string PaymentStatus, decimal WeightTons, string Area,
    string AddressType, string ContactName, string ContactMobile, string City, string? District, string? Street, string? Landmark, string? Instructions,
    DateTime PromisedDate, string PromisedTime, string? TimeSlot, string Priority,
    int? DriverId, string? DriverName, int? VehicleId, string? VehicleRegistration,
    decimal Amount, decimal FeeCharge, decimal HandlingCharge, decimal HeavyCharge, decimal DiscountCharge, decimal VatCharge,
    bool StockReserved, string Stage, DateTime? DispatchedAt, DateTime? DeliveredAt, string? ReceivedBy, string? Proof,
    string? FailureReason, string? NextAction, string? Notes, IReadOnlyList<DeliveryLineDto> Lines, IReadOnlyList<DeliveryHistoryDto> History, bool Overdue);

public record DeliveryLineInput(int ProductId, decimal DeliveryQty);
public record AddressInput(string Type, string ContactName, string ContactMobile, string City, string? District, string? Street, string? Landmark, string? Instructions);
public record ChargesInput(decimal Fee, decimal Handling, decimal Heavy, decimal Discount);

public record CreateDeliveryOrderRequest(
    int? OrderId, int? CustomerId, string? Project, string? PoRef, int BranchId, decimal WeightTons, string Area,
    AddressInput Address, DateTime PromisedDate, string PromisedTime, string? TimeSlot, string Priority,
    int? DriverId, int? VehicleId, decimal Amount, ChargesInput Charges, List<DeliveryLineInput> Lines);

public record LineProgressInput(int ProductId, decimal? LoadedQty, decimal? DeliveredQty, decimal? MissingQty, decimal? DamagedQty);
public record TransitionRequest(string ToStage, int? DriverId, int? VehicleId, List<LineProgressInput>? Lines, string? ReceivedBy, string? Proof, string? FailureReason, string? NextAction, string? Note);

// Permission model: Delivery:Edit can only file a move request (Applied=false, PendingApproval set);
// Delivery:Full moves the order directly (Applied=true) and is also who can approve/reject someone
// else's pending request — so a user holding both never has to wait on themselves.
public record DeliveryApprovalDto(int Id, int DeliveryOrderId, string DeliveryNo, string RequestedByName, string? ApproverName, string FromStage, string ToStage, string Reason, string Status, DateTime CreatedAt, DateTime? ResolvedAt);
public record TransitionResponseDto(bool Applied, DeliveryOrderDto Order, DeliveryApprovalDto? PendingApproval);
