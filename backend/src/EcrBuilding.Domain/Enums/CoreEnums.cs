namespace EcrBuilding.Domain.Enums;

public enum AccessLevel
{
    None = 0,
    View = 1,
    Edit = 2,
    Full = 3
}

public enum AuditSeverity
{
    Info = 0,
    Warning = 1,
    Critical = 2
}

public enum EntityStatus
{
    Active = 0,
    Inactive = 1
}

public enum UserStatus
{
    Active = 0,
    Suspended = 1,
    Inactive = 2
}

public enum SettingScope
{
    Global = 0,
    Branch = 1,
    Terminal = 2
}

public enum TerminalType
{
    Fixed = 0,
    Mobile = 1,
    Kiosk = 2,
    BackOffice = 3
}

public enum TerminalStatus
{
    Online = 0,
    Offline = 1,
    Idle = 2
}

public enum DeviceType
{
    ReceiptPrinter = 0,
    LabelPrinter = 1,
    BarcodeScanner = 2,
    CashDrawer = 3,
    WeighingScale = 4,
    CardReader = 5,
    CustomerDisplay = 6
}

public enum DeviceConnection
{
    Usb = 0,
    Bluetooth = 1,
    Lan = 2,
    WiFi = 3
}

public enum DeviceStatus
{
    Healthy = 0,
    Disconnected = 1,
    Faulty = 2
}

public enum DeviceSyncStatus
{
    Synced = 0,
    Pending = 1,
    Failed = 2
}
