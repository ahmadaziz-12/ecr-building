using EcrBuilding.Api.Authorization;
using EcrBuilding.Application.Abstractions;
using EcrBuilding.Application.Hr;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Api.Controllers;

[ApiController]
[Route("api/hr/attendance")]
[Authorize]
[RequireModule("/hrms/attendance", PermissionAction.View)]
public class AttendanceController(AppDbContext db, IAuditService audit) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<AttendanceDto>>> List(CancellationToken ct)
    {
        var rows = await db.Attendances.Include(a => a.Employee).OrderByDescending(a => a.Date).Take(500).ToListAsync(ct);
        return Ok(rows.Select(Map).ToList());
    }

    [HttpPost("check-in")]
    [RequireModule("/hrms/attendance", PermissionAction.Create)]
    public async Task<ActionResult<AttendanceDto>> CheckIn(CheckInRequest request, CancellationToken ct)
    {
        var employee = await db.Employees.Include(e => e.Shift).FirstOrDefaultAsync(e => e.Id == request.EmployeeId, ct);
        if (employee is null) return NotFound();
        if (employee.Status is EmploymentStatus.Inactive or EmploymentStatus.Terminated or EmploymentStatus.Resigned)
        {
            return BadRequest(new { error = $"Employee status is {employee.Status} — cannot check in." });
        }

        var today = DateTime.UtcNow.Date;
        var open = await db.Attendances.AnyAsync(a => a.EmployeeId == request.EmployeeId && a.Date == today && a.CheckIn != null && a.CheckOut == null, ct);
        if (open) return BadRequest(new { error = "An open check-in already exists for today." });

        if (request.Source.Equals("Manual", StringComparison.OrdinalIgnoreCase) && string.IsNullOrWhiteSpace(request.Reason))
        {
            return BadRequest(new { error = "A reason is required for manual check-in." });
        }

        var now = DateTime.UtcNow.ToString("HH:mm");
        var lateMin = 0;
        if (employee.Shift is not null)
        {
            var scheduled = TimeSpan.Parse(employee.Shift.Start);
            var actual = TimeSpan.Parse(now);
            lateMin = Math.Max(0, (int)(actual - scheduled).TotalMinutes - employee.Shift.GraceMin);
        }

        var record = new Attendance
        {
            EmployeeId = request.EmployeeId, Date = today, ShiftId = employee.ShiftId,
            ScheduledIn = employee.Shift?.Start, ScheduledOut = employee.Shift?.End, CheckIn = now,
            LateMin = lateMin, Status = lateMin > 0 ? AttendanceStatus.Late : AttendanceStatus.Present,
            Source = Enum.Parse<AttendanceSource>(request.Source, ignoreCase: true), Note = request.Reason,
        };
        db.Attendances.Add(record);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("hr", "EMPLOYEE_CHECKED_IN", record.Id.ToString(), employeeId: request.EmployeeId,
            severity: lateMin > 0 ? AuditSeverity.Warning : AuditSeverity.Info, newValue: now, cancellationToken: ct);

        await db.Entry(record).Reference(a => a.Employee).LoadAsync(ct);
        return Ok(Map(record));
    }

    [HttpPost("check-out")]
    [RequireModule("/hrms/attendance", PermissionAction.Edit)]
    public async Task<ActionResult<AttendanceDto>> CheckOut(CheckOutRequest request, CancellationToken ct)
    {
        var today = DateTime.UtcNow.Date;
        var record = await db.Attendances.Include(a => a.Employee).Include(a => a.Shift)
            .FirstOrDefaultAsync(a => a.EmployeeId == request.EmployeeId && a.Date == today && a.CheckIn != null && a.CheckOut == null, ct);
        if (record is null) return BadRequest(new { error = "No open check-in found for today." });

        var now = DateTime.UtcNow.ToString("HH:mm");
        var worked = (TimeSpan.Parse(now) - TimeSpan.Parse(record.CheckIn!)).TotalHours;
        var breakHours = (record.Shift?.BreakMin ?? 0) / 60.0;
        record.CheckOut = now;
        record.WorkedHours = (decimal)Math.Max(0, Math.Round(worked - breakHours, 2));
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("hr", "EMPLOYEE_CHECKED_OUT", record.Id.ToString(), employeeId: request.EmployeeId, newValue: now, cancellationToken: ct);
        return Ok(Map(record));
    }

    [HttpPut("{id:int}/adjust")]
    [RequireModule("/hrms/attendance", PermissionAction.Edit)]
    public async Task<ActionResult<AttendanceDto>> Adjust(int id, AdjustAttendanceRequest request, CancellationToken ct)
    {
        var record = await db.Attendances.Include(a => a.Employee).FirstOrDefaultAsync(a => a.Id == id, ct);
        if (record is null) return NotFound();

        if (request.CheckIn is not null) record.CheckIn = request.CheckIn;
        if (request.CheckOut is not null) record.CheckOut = request.CheckOut;
        record.Status = AttendanceStatus.ManualAdjustment;
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("hr", "ATTENDANCE_ADJUSTMENT_APPROVED", id.ToString(), reason: request.Reason, severity: AuditSeverity.Warning, cancellationToken: ct);
        return Ok(Map(record));
    }

    private static AttendanceDto Map(Attendance a) => new(
        a.Id, a.EmployeeId, a.Employee is null ? "" : $"{a.Employee.FirstName} {a.Employee.LastName}", a.Date, a.ShiftId,
        a.ScheduledIn, a.ScheduledOut, a.CheckIn, a.CheckOut, a.WorkedHours, a.LateMin, a.Status.ToString(), a.Source.ToString(), a.Note);
}

[ApiController]
[Route("api/hr/leaves")]
[Authorize]
[RequireModule("/hrms/leave", PermissionAction.View)]
public class LeavesController(AppDbContext db, IAuditService audit) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<LeaveDto>>> List(CancellationToken ct)
    {
        var rows = await db.Leaves.Include(l => l.Employee).Include(l => l.HandoverTo).Include(l => l.Approver)
            .OrderByDescending(l => l.Start).ToListAsync(ct);
        return Ok(rows.Select(Map).ToList());
    }

    [HttpPost]
    [RequireModule("/hrms/leave", PermissionAction.Create)]
    public async Task<ActionResult<LeaveDto>> Create(CreateLeaveRequest request, CancellationToken ct)
    {
        var leave = new Leave
        {
            EmployeeId = request.EmployeeId, Type = Enum.Parse<LeaveType>(request.Type), Start = request.Start,
            End = request.End, Days = request.Days, HalfDay = request.HalfDay, Reason = request.Reason,
            HandoverToEmployeeId = request.HandoverToEmployeeId, Attachment = request.Attachment,
        };
        db.Leaves.Add(leave);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("hr", "LEAVE_CREATED", leave.Id.ToString(), employeeId: request.EmployeeId, newValue: request.Type, cancellationToken: ct);

        var created = await db.Leaves.Include(l => l.Employee).Include(l => l.HandoverTo).Include(l => l.Approver).FirstAsync(l => l.Id == leave.Id, ct);
        return Ok(Map(created));
    }

    [HttpPut("{id:int}/status")]
    [RequireModule("/hrms/leave", PermissionAction.Approve)]
    public async Task<ActionResult<LeaveDto>> UpdateStatus(int id, UpdateLeaveStatusRequest request, CancellationToken ct)
    {
        var leave = await db.Leaves.Include(l => l.Employee).Include(l => l.HandoverTo).Include(l => l.Approver).FirstOrDefaultAsync(l => l.Id == id, ct);
        if (leave is null) return NotFound();

        leave.Status = Enum.Parse<LeaveStatus>(request.Status);
        if (request.ApproverEmployeeId is not null) leave.ApproverEmployeeId = request.ApproverEmployeeId;

        if (leave.Status == LeaveStatus.Approved)
        {
            var today = DateTime.UtcNow.Date;
            if (today >= leave.Start.Date && today <= leave.End.Date)
            {
                var employee = await db.Employees.FindAsync([leave.EmployeeId], ct);
                if (employee is not null) employee.Status = EmploymentStatus.OnLeave;

                var existing = await db.Attendances.FirstOrDefaultAsync(a => a.EmployeeId == leave.EmployeeId && a.Date == today, ct);
                if (existing is not null) db.Attendances.Remove(existing);
                db.Attendances.Add(new Attendance { EmployeeId = leave.EmployeeId, Date = today, Status = AttendanceStatus.OnLeave, Source = AttendanceSource.Manual });
            }
        }

        await db.SaveChangesAsync(ct);
        await audit.LogAsync("hr", $"LEAVE_{leave.Status.ToString().ToUpperInvariant()}", id.ToString(), employeeId: leave.EmployeeId,
            severity: leave.Status == LeaveStatus.Rejected ? AuditSeverity.Warning : AuditSeverity.Info, newValue: leave.Status.ToString(), cancellationToken: ct);
        return Ok(Map(leave));
    }

    private static LeaveDto Map(Leave l) => new(
        l.Id, l.EmployeeId, l.Employee is null ? "" : $"{l.Employee.FirstName} {l.Employee.LastName}", l.Type.ToString(),
        l.Start, l.End, l.Days, l.HalfDay, l.Reason, l.HandoverToEmployeeId,
        l.HandoverTo is null ? null : $"{l.HandoverTo.FirstName} {l.HandoverTo.LastName}", l.Attachment,
        l.Approver is null ? null : $"{l.Approver.FirstName} {l.Approver.LastName}", l.Status.ToString());
}

[ApiController]
[Route("api/hr/documents")]
[Authorize]
[RequireModule("/hrms/documents", PermissionAction.View)]
public class EmployeeDocsController(AppDbContext db, IAuditService audit) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<EmployeeDocDto>>> List(CancellationToken ct)
    {
        var rows = await db.EmployeeDocs.Include(d => d.Employee).Include(d => d.VerifiedBy).OrderByDescending(d => d.ExpiryDate).ToListAsync(ct);
        return Ok(rows.Select(Map).ToList());
    }

    [HttpPost]
    [RequireModule("/hrms/documents", PermissionAction.Create)]
    public async Task<ActionResult<EmployeeDocDto>> Create(CreateEmployeeDocRequest request, CancellationToken ct)
    {
        var doc = new EmployeeDoc
        {
            EmployeeId = request.EmployeeId, Type = Enum.Parse<DocType>(request.Type), Number = request.Number,
            IssueDate = request.IssueDate, ExpiryDate = request.ExpiryDate, Issuer = request.Issuer, FileName = request.FileName,
        };
        db.EmployeeDocs.Add(doc);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("hr", "DOCUMENT_UPLOADED", doc.Id.ToString(), employeeId: request.EmployeeId, newValue: request.Type, cancellationToken: ct);

        var created = await db.EmployeeDocs.Include(d => d.Employee).Include(d => d.VerifiedBy).FirstAsync(d => d.Id == doc.Id, ct);
        return Ok(Map(created));
    }

    [HttpPut("{id:int}/verify")]
    [RequireModule("/hrms/documents", PermissionAction.Approve)]
    public async Task<ActionResult<EmployeeDocDto>> Verify(int id, VerifyDocRequest request, CancellationToken ct)
    {
        var doc = await db.EmployeeDocs.Include(d => d.Employee).Include(d => d.VerifiedBy).FirstOrDefaultAsync(d => d.Id == id, ct);
        if (doc is null) return NotFound();
        doc.Status = DocStatus.Valid;
        doc.VerifiedByEmployeeId = request.VerifiedByEmployeeId;
        await db.SaveChangesAsync(ct);
        await db.Entry(doc).Reference(d => d.VerifiedBy).LoadAsync(ct);
        await audit.LogAsync("hr", "DOCUMENT_VERIFIED", id.ToString(), cancellationToken: ct);
        return Ok(Map(doc));
    }

    private static EmployeeDocDto Map(EmployeeDoc d) => new(
        d.Id, d.EmployeeId, d.Employee is null ? "" : $"{d.Employee.FirstName} {d.Employee.LastName}", d.Type.ToString(),
        d.Number, d.IssueDate, d.ExpiryDate, d.Issuer, d.Status.ToString(),
        d.VerifiedBy is null ? null : $"{d.VerifiedBy.FirstName} {d.VerifiedBy.LastName}", d.Notes, d.FileName);
}

[ApiController]
[Route("api/hr/contracts")]
[Authorize]
[RequireModule("/hrms/documents", PermissionAction.View)]
public class ContractsController(AppDbContext db, IAuditService audit) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<ContractDto>>> List(CancellationToken ct)
    {
        var rows = await db.Contracts.Include(c => c.Employee).Include(c => c.Department).Include(c => c.Branch)
            .OrderByDescending(c => c.Start).ToListAsync(ct);
        return Ok(rows.Select(Map).ToList());
    }

    [HttpPost]
    [RequireModule("/hrms/documents", PermissionAction.Create)]
    public async Task<ActionResult<ContractDto>> Create(CreateContractRequest request, CancellationToken ct)
    {
        var contract = new Contract
        {
            EmployeeId = request.EmployeeId, Type = Enum.Parse<ContractType>(request.Type), Number = request.Number,
            Start = request.Start, End = request.End, ProbationEnd = request.ProbationEnd, JobTitle = request.JobTitle,
            DepartmentId = request.DepartmentId, BranchId = request.BranchId,
        };
        db.Contracts.Add(contract);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("hr", "CONTRACT_CREATED", contract.Id.ToString(), employeeId: request.EmployeeId, cancellationToken: ct);

        var created = await db.Contracts.Include(c => c.Employee).Include(c => c.Department).Include(c => c.Branch).FirstAsync(c => c.Id == contract.Id, ct);
        return Ok(Map(created));
    }

    [HttpPut("{id:int}/renew")]
    [RequireModule("/hrms/documents", PermissionAction.Edit)]
    public async Task<ActionResult<ContractDto>> Renew(int id, CreateContractRequest request, CancellationToken ct)
    {
        var old = await db.Contracts.FindAsync([id], ct);
        if (old is null) return NotFound();

        var next = new Contract
        {
            EmployeeId = request.EmployeeId, Type = Enum.Parse<ContractType>(request.Type), Number = request.Number,
            Start = request.Start, End = request.End, ProbationEnd = request.ProbationEnd, JobTitle = request.JobTitle,
            DepartmentId = request.DepartmentId, BranchId = request.BranchId,
        };
        db.Contracts.Add(next);
        old.Status = ContractStatus.Renewed;
        await db.SaveChangesAsync(ct);
        old.SupersededByContractId = next.Id;
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("hr", "CONTRACT_RENEWED", next.Id.ToString(), employeeId: request.EmployeeId, oldValue: id.ToString(), cancellationToken: ct);

        var created = await db.Contracts.Include(c => c.Employee).Include(c => c.Department).Include(c => c.Branch).FirstAsync(c => c.Id == next.Id, ct);
        return Ok(Map(created));
    }

    private static ContractDto Map(Contract c) => new(
        c.Id, c.EmployeeId, c.Employee is null ? "" : $"{c.Employee.FirstName} {c.Employee.LastName}", c.Type.ToString(),
        c.Number, c.Start, c.End, c.ProbationEnd, c.JobTitle, c.DepartmentId, c.Department?.Name ?? "",
        c.BranchId, c.Branch?.NameEn ?? "", c.Status.ToString(), c.SupersededByContractId);
}
