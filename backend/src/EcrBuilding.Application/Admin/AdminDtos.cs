namespace EcrBuilding.Application.Admin;

public record UserDto(int Id, string Name, string Email, int RoleId, string RoleName, int? BranchId, string? BranchName, string Status, string PreferredLocale, DateTime? LastLoginAt, bool HasPin, bool BiometricEnabled);
public record CreateUserRequest(string Name, string Email, string Password, int RoleId, int? BranchId);
public record UpdateUserRequest(string Name, int RoleId, int? BranchId, string Status);
public record ResetPinResponse(string Pin);

public record ModulePermissionEntry(string Module, string Level);

// PosCeilings mirrors BRD §10.1's Cashier→Senior Cashier→Supervisor→Store Manager→System Admin ladder.
// Null on a decimal ceiling means "no cap" for that role (e.g. Store Manager's DiscountCeilingPercent).
public record PosCeilingsDto(
    decimal? DiscountCeilingPercent,
    decimal? SurplusReturnCeilingAmount,
    bool CanAuthorizeStandardReturnWithoutReceipt,
    bool CanOverrideItemPrice,
    bool CanAuthorizeDamagedReturns,
    bool CanVoidTransactions,
    bool CanViewXReport,
    bool CanViewZReport,
    bool CanConfigureReturnRulesAndFees,
    bool CanManagePriceListAndUsers,
    bool CanManageSystemConfiguration);

public record RoleDto(int Id, string Name, string? Description, decimal ApprovalCap, bool IsSystem, string Status, int UserCount, IReadOnlyList<ModulePermissionEntry> Permissions, PosCeilingsDto PosCeilings);
public record UpsertRoleRequest(string Name, string? Description, decimal ApprovalCap, Dictionary<string, string> Permissions, PosCeilingsDto PosCeilings);

public record BranchDto(int Id, string Code, string NameEn, string? NameAr, string City, string? Address, string? BusinessHours, string? VatRegistrationNumber, string? ManagerName, string? Warehouse, string Status, int TerminalCount, int OrdersCount);
public record UpsertBranchRequest(string Code, string NameEn, string? NameAr, string City, string? Address, string? BusinessHours, string? VatRegistrationNumber, string? ManagerName, string? Warehouse);
public record UpdateBranchRequest(string Code, string NameEn, string? NameAr, string City, string? Address, string? BusinessHours, string? VatRegistrationNumber, string? ManagerName, string? Warehouse, string Status);

public record TerminalDto(int Id, string Code, string Name, int BranchId, string BranchName, string Type, int? AssignedCashierId, string? AssignedCashierName, bool OfflineModeEnabled, string? IpAddress, string? MacAddress, string Status, DateTime? LastSyncAt, int DeviceCount, bool HasPairingSecret, bool HasLockdownPin, int? LockdownPinLength);
public record UpsertTerminalRequest(string Code, string Name, int BranchId, string Type, int? AssignedCashierId, bool OfflineModeEnabled, string? IpAddress, string? MacAddress);
public record GenerateKioskPairingResponse(string TerminalCode, string PairingSecret);
public record SetKioskLockdownPinRequest(string Pin);
public record AssignCashierRequest(int? CashierUserId);

public record DeviceDto(int Id, string DeviceCode, string Type, string Model, string? Serial, int TerminalId, string TerminalName, int BranchId, string BranchName, string Connection, string? IpAddress, string? Firmware, DateTime? LastTestAt, string Status, string SyncStatus, string? BehaviorProfile, string? QzPrinterName);
public record PairDeviceRequest(string Type, string Model, string? Serial, int TerminalId, string Connection, string? IpAddress, string? BehaviorProfile);
public record UpdateDeviceQzMappingRequest(string? QzPrinterName);
public record UpdateDeviceRequest(int TerminalId, string Model, string? Serial, string Connection, string? IpAddress, string? BehaviorProfile);
public record DeviceSetStatusRequest(string Status, string? SyncStatus);

// Shared by Terminal/Device row actions — mirrors CatalogController's SetStatusRequest pattern for
// master data that's FK-referenced by transactional records (Orders, CashierShifts), where a hard
// delete would orphan history, so "deactivate" is a status flip instead.
public record SetStatusRequest(string Status);

public record SettingDto(int Id, string Category, string Group, string Key, string Value, string Scope, int? BranchId, DateTime EffectiveFrom, string? ChangedByName, string Status);
public record UpsertSettingRequest(string Category, string Group, string Key, string Value, string Scope, int? BranchId, DateTime? EffectiveFrom);

public record RuleDto(int Id, string Name, string Domain, int Priority, string WhenTrigger, string Condition, string Action, string? ApproverName, bool Active, string? Notes, string Status);
public record UpsertRuleRequest(string Name, string Domain, int Priority, string WhenTrigger, string Condition, string Action, int? ApproverUserId, bool Active, string? Notes);
public record RuleTestResultDto(bool Passed, IReadOnlyList<string> Messages);

public record ComplianceDto(int Id, string Control, string Framework, string Owner, DateTime LastReview, DateTime NextDue, string? Evidence, string? Findings, string Status);
public record UpsertComplianceRequest(string Control, string Framework, string Owner, DateTime LastReview, DateTime NextDue, string? Evidence, string? Findings, string Status);
public record SignOffComplianceRequest(string? Note);

public record MaintenanceDto(int Id, string TicketNo, string DeviceOrModule, int? BranchId, string? BranchName, string Severity, string Owner, int SlaHours, string Status, DateTime CreatedAt, DateTime? ResolvedAt);
public record CreateMaintenanceRequest(string DeviceOrModule, int? BranchId, string Severity, string Owner, int SlaHours);
public record UpdateMaintenanceStatusRequest(string Status);
public record AssignMaintenanceRequest(string Owner);

public record PlanDto(int Id, string Name, decimal MonthlyPrice, decimal YearlyPrice, int MaxBranches, int MaxTerminals, int MaxUsers, int MaxSkus, IReadOnlyList<string> Features, string Status);
public record UsageEntitlementDto(string Feature, int Usage, int Limit, decimal OverageRate, DateTime NextResetAt);
public record SubscriptionDto(int Id, string PlanName, string BillingCycle, DateTime StartedAt, DateTime RenewsAt, string Status, IReadOnlyList<UsageEntitlementDto> Usage);
