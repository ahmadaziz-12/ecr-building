using EcrBuilding.Domain.Common;
using EcrBuilding.Domain.Enums;

namespace EcrBuilding.Domain.Entities;

public class Branch : BaseEntity
{
    public string Code { get; set; } = string.Empty;
    public string NameEn { get; set; } = string.Empty;
    public string? NameAr { get; set; }
    public string City { get; set; } = string.Empty;
    public string? Address { get; set; }
    public string? BusinessHours { get; set; }
    public string? VatRegistrationNumber { get; set; }
    public string? ManagerName { get; set; }
    public string? Warehouse { get; set; }
    public EntityStatus Status { get; set; } = EntityStatus.Active;

    public ICollection<Terminal> Terminals { get; set; } = new List<Terminal>();
    public ICollection<BranchStockLevel> StockLevels { get; set; } = new List<BranchStockLevel>();
}
