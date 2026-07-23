using EcrBuilding.Domain.Common;
using EcrBuilding.Domain.Enums;

namespace EcrBuilding.Domain.Entities;

public class Terminal : BaseEntity
{
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public int BranchId { get; set; }
    public Branch? Branch { get; set; }
    public TerminalType Type { get; set; } = TerminalType.Fixed;
    public int? OperatorUserId { get; set; }
    public bool OfflineModeEnabled { get; set; }
    public string? IpAddress { get; set; }
    public string? MacAddress { get; set; }
    public TerminalStatus Status { get; set; } = TerminalStatus.Offline;
    public DateTime? LastSyncAt { get; set; }

    public ICollection<Device> Devices { get; set; } = new List<Device>();
}
