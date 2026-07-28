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
[Route("api/hr/departments")]
[Authorize]
[RequireModule("/hrms/departments", PermissionAction.View)]
public class DepartmentsController(AppDbContext db, IAuditService audit) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<DepartmentDto>>> List(CancellationToken ct)
    {
        var departments = await db.Departments.Include(d => d.ManagerEmployee).OrderBy(d => d.Code).ToListAsync(ct);
        var headCounts = await db.Employees.GroupBy(e => e.DepartmentId).Select(g => new { g.Key, Count = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.Count, ct);
        return Ok(departments.Select(d => Map(d, headCounts.GetValueOrDefault(d.Id))).ToList());
    }

    [HttpPost]
    [RequireModule("/hrms/departments", PermissionAction.Create)]
    public async Task<ActionResult<DepartmentDto>> Create(UpsertDepartmentRequest request, CancellationToken ct)
    {
        var dept = new Department
        {
            Name = request.Name, ArabicName = request.ArabicName, Code = request.Code,
            ManagerEmployeeId = request.ManagerEmployeeId, BranchScope = Enum.Parse<BranchScope>(request.BranchScope), ParentId = request.ParentId,
        };
        db.Departments.Add(dept);
        await db.SaveChangesAsync(ct);
        await db.Entry(dept).Reference(d => d.ManagerEmployee).LoadAsync(ct);
        await audit.LogAsync("hr", "DEPARTMENT_CREATED", dept.Id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(dept, 0));
    }

    private static DepartmentDto Map(Department d, int headCount) => new(
        d.Id, d.Name, d.ArabicName, d.Code, d.ManagerEmployeeId,
        d.ManagerEmployee is null ? null : $"{d.ManagerEmployee.FirstName} {d.ManagerEmployee.LastName}",
        d.BranchScope.ToString(), d.Status.ToString(), d.ParentId, headCount);
}

[ApiController]
[Route("api/hr/shifts")]
[Authorize]
[RequireModule("/hrms/attendance", PermissionAction.View)]
public class WorkShiftsController(AppDbContext db, IAuditService audit) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<ShiftDto>>> List(CancellationToken ct)
    {
        var shifts = await db.WorkShifts.OrderBy(s => s.Code).ToListAsync(ct);
        return Ok(shifts.Select(Map).ToList());
    }

    [HttpPost]
    [RequireModule("/hrms/attendance", PermissionAction.Create)]
    public async Task<ActionResult<ShiftDto>> Create(UpsertShiftRequest request, CancellationToken ct)
    {
        var shift = new WorkShift
        {
            Name = request.Name, Code = request.Code, Start = request.Start, End = request.End,
            BreakMin = request.BreakMin, WorkingHours = request.WorkingHours, GraceMin = request.GraceMin,
        };
        db.WorkShifts.Add(shift);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("hr", "SHIFT_TEMPLATE_CREATED", shift.Id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(shift));
    }

    private static ShiftDto Map(WorkShift s) => new(s.Id, s.Name, s.Code, s.Start, s.End, s.BreakMin, s.WorkingHours, s.GraceMin, s.OvertimeStartMin, s.CrossMidnight, s.Status.ToString());
}

[ApiController]
[Route("api/hr/employees")]
[Authorize]
[RequireModule("/hrms/employees", PermissionAction.View)]
public class EmployeesController(AppDbContext db, IAuditService audit, IPasswordHasher hasher) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<EmployeeDto>>> List(CancellationToken ct)
    {
        var employees = await Query().OrderBy(e => e.Id).ToListAsync(ct);
        return Ok(employees.Select(Map).ToList());
    }

    [HttpPost]
    [RequireModule("/hrms/employees", PermissionAction.Create)]
    public async Task<ActionResult<EmployeeDto>> Create(UpsertEmployeeRequest request, CancellationToken ct)
    {
        var employee = new Employee
        {
            FirstName = request.FirstName, LastName = request.LastName, ArabicName = request.ArabicName,
            Mobile = request.Mobile, Email = request.Email, JoiningDate = request.JoiningDate,
            EmploymentType = Enum.Parse<EmploymentType>(request.EmploymentType), DepartmentId = request.DepartmentId,
            Designation = request.Designation, ReportingManagerId = request.ReportingManagerId, BranchId = request.BranchId,
            ShiftId = request.ShiftId, DrivingLicense = request.DrivingLicense, LicenseExpiry = request.LicenseExpiry,
        };

        if (request.CreateUserAccount && !string.IsNullOrWhiteSpace(request.Password))
        {
            var cashierRole = await db.Roles.FirstAsync(r => r.Name == "Cashier", ct);
            var user = new User
            {
                Name = $"{request.FirstName} {request.LastName}",
                Email = request.Email ?? $"{request.FirstName}.{request.LastName}@ecr-building.local".ToLowerInvariant(),
                PasswordHash = hasher.Hash(request.Password), RoleId = cashierRole.Id, BranchId = request.BranchId,
            };
            db.Users.Add(user);
            await db.SaveChangesAsync(ct);
            employee.UserId = user.Id;
        }
        else if (request.UserId is not null)
        {
            employee.UserId = request.UserId;
        }

        db.Employees.Add(employee);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("hr", "EMPLOYEE_CREATED", employee.Id.ToString(), newValue: request, cancellationToken: ct);

        var created = await Query().FirstAsync(e => e.Id == employee.Id, ct);
        return Ok(Map(created));
    }

    [HttpPut("{id:int}")]
    [RequireModule("/hrms/employees", PermissionAction.Edit)]
    public async Task<ActionResult<EmployeeDto>> Update(int id, UpsertEmployeeRequest request, CancellationToken ct)
    {
        var employee = await db.Employees.FindAsync([id], ct);
        if (employee is null) return NotFound();

        employee.FirstName = request.FirstName; employee.LastName = request.LastName; employee.ArabicName = request.ArabicName;
        employee.Mobile = request.Mobile; employee.Email = request.Email;
        employee.EmploymentType = Enum.Parse<EmploymentType>(request.EmploymentType);
        employee.DepartmentId = request.DepartmentId; employee.Designation = request.Designation;
        employee.ReportingManagerId = request.ReportingManagerId; employee.BranchId = request.BranchId; employee.ShiftId = request.ShiftId;
        employee.DrivingLicense = request.DrivingLicense; employee.LicenseExpiry = request.LicenseExpiry;
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("hr", "EMPLOYEE_UPDATED", id.ToString(), newValue: request, cancellationToken: ct);

        var updated = await Query().FirstAsync(e => e.Id == id, ct);
        return Ok(Map(updated));
    }

    [HttpPut("{id:int}/deactivate")]
    [RequireModule("/hrms/employees", PermissionAction.Delete)]
    public async Task<ActionResult<EmployeeDto>> Deactivate(int id, CancellationToken ct)
    {
        var employee = await db.Employees.FindAsync([id], ct);
        if (employee is null) return NotFound();
        employee.Status = EmploymentStatus.Inactive;
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("hr", "EMPLOYEE_DEACTIVATED", id.ToString(), severity: Domain.Enums.AuditSeverity.Warning, cancellationToken: ct);

        var updated = await Query().FirstAsync(e => e.Id == id, ct);
        return Ok(Map(updated));
    }

    private IQueryable<Employee> Query() => db.Employees
        .Include(e => e.Department).Include(e => e.Branch).Include(e => e.Shift).Include(e => e.ReportingManager).Include(e => e.User).ThenInclude(u => u!.Role);

    private static EmployeeDto Map(Employee e) => new(
        e.Id, e.FirstName, e.LastName, e.ArabicName, e.Mobile, e.Email, e.JoiningDate, e.EmploymentType.ToString(),
        e.DepartmentId, e.Department?.Name ?? "", e.Designation, e.ReportingManagerId,
        e.ReportingManager is null ? null : $"{e.ReportingManager.FirstName} {e.ReportingManager.LastName}",
        e.BranchId, e.Branch?.NameEn ?? "", e.Status.ToString(), e.ShiftId, e.Shift?.Name, e.UserId, e.User?.Role?.Name,
        e.DrivingLicense, e.LicenseExpiry, e.ProfileImage);
}
