namespace EcrBuilding.Application.Hr;

public record DepartmentDto(int Id, string Name, string? ArabicName, string Code, int? ManagerEmployeeId, string? ManagerName, string BranchScope, string Status, int? ParentId, int HeadCount);
public record UpsertDepartmentRequest(string Name, string? ArabicName, string Code, int? ManagerEmployeeId, string BranchScope, int? ParentId);

public record ShiftDto(int Id, string Name, string Code, string Start, string End, int BreakMin, decimal WorkingHours, int GraceMin, int? OvertimeStartMin, bool CrossMidnight, string Status);
public record UpsertShiftRequest(string Name, string Code, string Start, string End, int BreakMin, decimal WorkingHours, int GraceMin);

public record EmployeeDto(
    int Id, string FirstName, string LastName, string? ArabicName, string Mobile, string? Email,
    DateTime JoiningDate, string EmploymentType, int DepartmentId, string DepartmentName, string Designation,
    int? ReportingManagerId, string? ReportingManagerName, int BranchId, string BranchName, string Status,
    int? ShiftId, string? ShiftName, int? UserId, string? Role, string? DrivingLicense, DateTime? LicenseExpiry, string? ProfileImage);
public record UpsertEmployeeRequest(
    string FirstName, string LastName, string? ArabicName, string Mobile, string? Email, DateTime JoiningDate,
    string EmploymentType, int DepartmentId, string Designation, int? ReportingManagerId, int BranchId,
    int? ShiftId, int? UserId, string? DrivingLicense, DateTime? LicenseExpiry, bool CreateUserAccount, string? Password);

public record AttendanceDto(int Id, int EmployeeId, string EmployeeName, DateTime Date, int? ShiftId, string? ScheduledIn, string? ScheduledOut, string? CheckIn, string? CheckOut, decimal? WorkedHours, int? LateMin, string Status, string Source, string? Note);
public record CheckInRequest(int EmployeeId, string Source, string? Reason);
public record CheckOutRequest(int EmployeeId);
public record AdjustAttendanceRequest(string? CheckIn, string? CheckOut, string? Status, string Reason);

public record LeaveDto(int Id, int EmployeeId, string EmployeeName, string Type, DateTime Start, DateTime End, int Days, bool HalfDay, string? Reason, int? HandoverToEmployeeId, string? HandoverToName, string? Attachment, string? ApproverName, string Status);
public record CreateLeaveRequest(int EmployeeId, string Type, DateTime Start, DateTime End, int Days, bool HalfDay, string? Reason, int? HandoverToEmployeeId, string? Attachment);
public record UpdateLeaveStatusRequest(string Status, int? ApproverEmployeeId);

public record EmployeeDocDto(int Id, int EmployeeId, string EmployeeName, string Type, string? Number, DateTime? IssueDate, DateTime? ExpiryDate, string? Issuer, string Status, string? VerifiedByName, string? Notes, string? FileName);
public record CreateEmployeeDocRequest(int EmployeeId, string Type, string? Number, DateTime? IssueDate, DateTime? ExpiryDate, string? Issuer, string? FileName);
public record VerifyDocRequest(int VerifiedByEmployeeId);

public record ContractDto(int Id, int EmployeeId, string EmployeeName, string Type, string? Number, DateTime Start, DateTime End, DateTime? ProbationEnd, string JobTitle, int DepartmentId, string DepartmentName, int BranchId, string BranchName, string Status, int? SupersededByContractId);
public record CreateContractRequest(int EmployeeId, string Type, string? Number, DateTime Start, DateTime End, DateTime? ProbationEnd, string JobTitle, int DepartmentId, int BranchId);
