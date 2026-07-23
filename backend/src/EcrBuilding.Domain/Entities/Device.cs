using EcrBuilding.Domain.Common;
using EcrBuilding.Domain.Enums;

namespace EcrBuilding.Domain.Entities;

public class Device : BaseEntity
{
    public string DeviceCode { get; set; } = string.Empty;
    public DeviceType Type { get; set; }
    public string Model { get; set; } = string.Empty;
    public string? Serial { get; set; }
    public int TerminalId { get; set; }
    public Terminal? Terminal { get; set; }
    public DeviceConnection Connection { get; set; } = DeviceConnection.Usb;
    public string? IpAddress { get; set; }
    public string? Firmware { get; set; }
    public DateTime? LastTestAt { get; set; }
    public DeviceStatus Status { get; set; } = DeviceStatus.Healthy;

    // Name QZ Tray reports for the physical OS printer this device maps to (e.g. "Epson TM-T88VI"
    // from qz.printers.find()). Null means no physical printer is mapped yet — printing for this
    // device stays virtual (DB-only ESC/POS preview) until an operator maps one via Printer Setup.
    public string? QzPrinterName { get; set; }
}
