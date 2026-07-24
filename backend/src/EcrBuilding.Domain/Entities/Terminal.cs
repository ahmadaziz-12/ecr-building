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
    public User? Operator { get; set; }
    public bool OfflineModeEnabled { get; set; }
    public string? IpAddress { get; set; }
    public string? MacAddress { get; set; }
    public TerminalStatus Status { get; set; } = TerminalStatus.Offline;
    public DateTime? LastSyncAt { get; set; }

    // One-time-reveal secret a self-checkout kiosk uses to pair itself to this terminal record.
    public string? PairingSecretHash { get; set; }
    public DateTime? PairingSecretSetAt { get; set; }

    // PIN that unlocks a kiosk's fullscreen lockdown mode for staff intervention.
    public string? KioskLockdownPinHash { get; set; }
    public DateTime? KioskLockdownPinSetAt { get; set; }
    public int? KioskLockdownPinLength { get; set; }

    public ICollection<Device> Devices { get; set; } = new List<Device>();
}
