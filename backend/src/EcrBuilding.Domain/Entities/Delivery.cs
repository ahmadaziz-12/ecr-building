using EcrBuilding.Domain.Common;

namespace EcrBuilding.Domain.Entities;

public enum DeliveryStage
{
    Pending, Assigned, Loading, ReadyToDispatch, Dispatched, PartiallyDelivered,
    Delivered, Failed, ReturnedToBranch, Cancelled, Rescheduled
}

public enum DeliveryPriority { Urgent, High, Standard, Low }

public enum DriverStatus { Available, Assigned, Loading, OnDelivery, OnBreak, OffShift, OnLeave, LicenceExpired, Inactive }

public enum VehicleType { FlatbedTruck, BoxTruck, Pickup, DeliveryVan, HeavyTruck }
public enum VehicleStatus { Available, Assigned, Loading, OnDelivery, Maintenance, Inactive }
public enum DeviceLinkStatus { Online, Offline, Idle }

public class Driver : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public int BranchId { get; set; }
    public Branch? Branch { get; set; }
    public string Mobile { get; set; } = string.Empty;
    public string License { get; set; } = string.Empty;
    public DateTime LicenseExpiry { get; set; }
    public int? VehicleId { get; set; }
    public Vehicle? Vehicle { get; set; }
    public int? UserId { get; set; }
    public DriverStatus Status { get; set; } = DriverStatus.Available;
    public int DeliveriesToday { get; set; }
}

public class Vehicle : BaseEntity
{
    public string Registration { get; set; } = string.Empty;
    public VehicleType Type { get; set; }
    public int BranchId { get; set; }
    public Branch? Branch { get; set; }
    public decimal CapacityTons { get; set; }
    public decimal CurrentLoad { get; set; }
    public VehicleStatus Status { get; set; } = VehicleStatus.Available;
    public DeviceLinkStatus DeviceStatus { get; set; } = DeviceLinkStatus.Online;
}

public class DeliveryZone : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string City { get; set; } = string.Empty;
    public decimal DistanceKm { get; set; }
    public decimal Fee { get; set; }
}

public class DeliveryOrder : BaseEntity
{
    public string DeliveryNo { get; set; } = string.Empty;
    public int? OrderId { get; set; }
    public Order? Order { get; set; }
    public int? CustomerId { get; set; }
    public Customer? Customer { get; set; }
    public string? Project { get; set; }
    public string? PoRef { get; set; }
    public int BranchId { get; set; }
    public Branch? Branch { get; set; }
    public Domain.Entities.PaymentStatus PaymentStatus { get; set; } = Domain.Entities.PaymentStatus.Unpaid;
    public decimal WeightTons { get; set; }
    public string Area { get; set; } = string.Empty;

    public string AddressType { get; set; } = "Customer Address";
    public string ContactName { get; set; } = string.Empty;
    public string ContactMobile { get; set; } = string.Empty;
    public string City { get; set; } = string.Empty;
    public string? District { get; set; }
    public string? Street { get; set; }
    public string? Landmark { get; set; }
    public string? Instructions { get; set; }

    public DateTime PromisedDate { get; set; }
    public string PromisedTime { get; set; } = string.Empty;
    public string? TimeSlot { get; set; }
    public DeliveryPriority Priority { get; set; } = DeliveryPriority.Standard;

    public int? DriverId { get; set; }
    public Driver? Driver { get; set; }
    public int? VehicleId { get; set; }
    public Vehicle? Vehicle { get; set; }

    public decimal Amount { get; set; }
    public decimal FeeCharge { get; set; }
    public decimal HandlingCharge { get; set; }
    public decimal HeavyCharge { get; set; }
    public decimal DiscountCharge { get; set; }
    public decimal VatCharge { get; set; }

    public bool StockReserved { get; set; }
    public DeliveryStage Stage { get; set; } = DeliveryStage.Pending;
    public DateTime? DispatchedAt { get; set; }
    public DateTime? DeliveredAt { get; set; }
    public string? ReceivedBy { get; set; }
    public string? Proof { get; set; }
    public string? FailureReason { get; set; }
    public string? NextAction { get; set; }
    public string? Notes { get; set; }

    public ICollection<DeliveryOrderLine> Lines { get; set; } = new List<DeliveryOrderLine>();
    public ICollection<DeliveryHistory> History { get; set; } = new List<DeliveryHistory>();
}

public class DeliveryOrderLine
{
    public int Id { get; set; }
    public int DeliveryOrderId { get; set; }
    public DeliveryOrder? DeliveryOrder { get; set; }
    public int ProductId { get; set; }
    public Product? Product { get; set; }
    public decimal Ordered { get; set; }
    public string Uom { get; set; } = "Piece";
    public decimal UnitWeight { get; set; }
    public decimal DeliveryQty { get; set; }
    public decimal LoadedQty { get; set; }
    public decimal MissingQty { get; set; }
    public decimal DamagedQty { get; set; }
    public decimal DeliveredQty { get; set; }
}

public class DeliveryHistory
{
    public int Id { get; set; }
    public int DeliveryOrderId { get; set; }
    public DeliveryOrder? DeliveryOrder { get; set; }
    public DateTime At { get; set; } = DateTime.UtcNow;
    public DeliveryStage FromStage { get; set; }
    public DeliveryStage ToStage { get; set; }
    public int ByUserId { get; set; }
    public User? By { get; set; }
    public string? Note { get; set; }
}
