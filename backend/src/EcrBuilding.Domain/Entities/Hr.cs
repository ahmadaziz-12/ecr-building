using EcrBuilding.Domain.Common;

namespace EcrBuilding.Domain.Entities;

public enum EmploymentStatus { Active, Probation, OnLeave, Suspended, Resigned, Terminated, Inactive }
public enum EmploymentType { FullTime, PartTime, Contract, Temporary }
public enum Gender { Male, Female }
public enum BranchScope { AllBranches, SelectedBranches, SingleBranch }
public enum AttendanceStatus { Present, Late, Absent, OnLeave, HalfDay, OffDay, Holiday, MissingCheckIn, MissingCheckOut, ManualAdjustment }
public enum AttendanceSource { Biometric, Pin, Terminal, Manual, Mobile }
public enum LeaveType { AnnualLeave, SickLeave, EmergencyLeave, UnpaidLeave, OtherApprovedLeave }
public enum LeaveStatus { Draft, Submitted, PendingManager, PendingHr, Approved, Rejected, Cancelled, Completed }
public enum DocType { NationalIdIqama, EmploymentContract, DrivingLicence, ProfessionalCertification, BranchAssignmentLetter, WarningLetter, MedicalCertificate, TrainingCertificate, Other }
public enum DocStatus { Valid, ExpiringSoon, Expired, PendingVerification, Rejected, Replaced }
public enum ContractType { FullTime, PartTime, FixedTerm, Temporary }
public enum ContractStatus { Draft, Active, ExpiringSoon, Expired, Renewed, Closed, Terminated }

public class Department : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string? ArabicName { get; set; }
    public string Code { get; set; } = string.Empty;
    public int? ManagerEmployeeId { get; set; }
    public Employee? ManagerEmployee { get; set; }
    public BranchScope BranchScope { get; set; } = BranchScope.AllBranches;
    public int? ParentId { get; set; }
    public Department? Parent { get; set; }
    public Enums.EntityStatus Status { get; set; } = Enums.EntityStatus.Active;
}

public class WorkShift : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string Start { get; set; } = "08:00";
    public string End { get; set; } = "16:00";
    public int BreakMin { get; set; } = 60;
    public decimal WorkingHours { get; set; } = 7;
    public int GraceMin { get; set; } = 5;
    public int? OvertimeStartMin { get; set; }
    public bool CrossMidnight { get; set; }
    public Enums.EntityStatus Status { get; set; } = Enums.EntityStatus.Active;
}

public class Employee : BaseEntity
{
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string? ArabicName { get; set; }
    public string? Nationality { get; set; }
    public DateTime? Dob { get; set; }
    public Gender? Gender { get; set; }
    public string Mobile { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string? NationalId { get; set; }
    public DateTime? IqamaExpiry { get; set; }
    public string? Address { get; set; }
    public string? EmergencyContact { get; set; }
    public DateTime JoiningDate { get; set; } = DateTime.UtcNow;
    public EmploymentType EmploymentType { get; set; } = EmploymentType.FullTime;
    public int DepartmentId { get; set; }
    public Department? Department { get; set; }
    public string Designation { get; set; } = string.Empty;
    public int? ReportingManagerId { get; set; }
    public Employee? ReportingManager { get; set; }
    public int BranchId { get; set; }
    public Branch? Branch { get; set; }
    public EmploymentStatus Status { get; set; } = EmploymentStatus.Active;
    public int? ShiftId { get; set; }
    public WorkShift? Shift { get; set; }
    public string? WeeklyOff { get; set; }
    public int? UserId { get; set; }
    public User? User { get; set; }
    public string? DrivingLicense { get; set; }
    public DateTime? LicenseExpiry { get; set; }
    public string? ProfileImage { get; set; }
}

public class Attendance : BaseEntity
{
    public int EmployeeId { get; set; }
    public Employee? Employee { get; set; }
    public DateTime Date { get; set; }
    public int? ShiftId { get; set; }
    public WorkShift? Shift { get; set; }
    public string? ScheduledIn { get; set; }
    public string? ScheduledOut { get; set; }
    public string? CheckIn { get; set; }
    public string? CheckOut { get; set; }
    public decimal? WorkedHours { get; set; }
    public int? LateMin { get; set; }
    public int? OvertimeMin { get; set; }
    public AttendanceStatus Status { get; set; } = AttendanceStatus.Present;
    public AttendanceSource Source { get; set; } = AttendanceSource.Manual;
    public string? Note { get; set; }
}

public class Leave : BaseEntity
{
    public int EmployeeId { get; set; }
    public Employee? Employee { get; set; }
    public LeaveType Type { get; set; }
    public DateTime Start { get; set; }
    public DateTime End { get; set; }
    public int Days { get; set; }
    public bool HalfDay { get; set; }
    public string? Reason { get; set; }
    public int? HandoverToEmployeeId { get; set; }
    public Employee? HandoverTo { get; set; }
    public string? Attachment { get; set; }
    public int? ApproverEmployeeId { get; set; }
    public Employee? Approver { get; set; }
    public LeaveStatus Status { get; set; } = LeaveStatus.Submitted;
}

public class EmployeeDoc : BaseEntity
{
    public int EmployeeId { get; set; }
    public Employee? Employee { get; set; }
    public DocType Type { get; set; }
    public string? Number { get; set; }
    public DateTime? IssueDate { get; set; }
    public DateTime? ExpiryDate { get; set; }
    public string? Issuer { get; set; }
    public DocStatus Status { get; set; } = DocStatus.PendingVerification;
    public int? VerifiedByEmployeeId { get; set; }
    public Employee? VerifiedBy { get; set; }
    public string? Notes { get; set; }
    public string? FileName { get; set; }
}

public class Contract : BaseEntity
{
    public int EmployeeId { get; set; }
    public Employee? Employee { get; set; }
    public ContractType Type { get; set; }
    public string? Number { get; set; }
    public DateTime Start { get; set; }
    public DateTime End { get; set; }
    public DateTime? ProbationEnd { get; set; }
    public string JobTitle { get; set; } = string.Empty;
    public int DepartmentId { get; set; }
    public Department? Department { get; set; }
    public int BranchId { get; set; }
    public Branch? Branch { get; set; }
    public string? WorkingHours { get; set; }
    public string? WorkingDays { get; set; }
    public string? NoticePeriod { get; set; }
    public ContractStatus Status { get; set; } = ContractStatus.Active;
    public int? SupersededByContractId { get; set; }
    public Contract? SupersededBy { get; set; }
    public string? Attachment { get; set; }
}
