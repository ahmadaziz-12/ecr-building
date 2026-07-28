using EcrBuilding.Api.Authorization;
using EcrBuilding.Application.Abstractions;
using EcrBuilding.Application.Admin;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Api.Controllers;

[ApiController]
[Route("api/admin/maintenance")]
[Authorize]
[RequireModule("/admin/maintenance", PermissionAction.View)]
public class MaintenanceController(AppDbContext db, IAuditService audit) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<MaintenanceDto>>> List(CancellationToken ct)
    {
        var rows = await db.MaintenanceTickets.Include(t => t.Branch).OrderByDescending(t => t.CreatedAt).ToListAsync(ct);
        return Ok(rows.Select(Map).ToList());
    }

    [HttpPost]
    [RequireModule("/admin/maintenance", PermissionAction.Create)]
    public async Task<ActionResult<MaintenanceDto>> Create(CreateMaintenanceRequest request, CancellationToken ct)
    {
        var ticketNo = $"MNT-{DateTime.UtcNow:yyyy}-{await db.MaintenanceTickets.CountAsync(ct) + 1:D4}";
        var ticket = new MaintenanceTicket
        {
            TicketNo = ticketNo, DeviceOrModule = request.DeviceOrModule, BranchId = request.BranchId,
            Severity = Enum.Parse<AuditSeverity>(request.Severity), Owner = request.Owner, SlaHours = request.SlaHours,
        };
        db.MaintenanceTickets.Add(ticket);
        await db.SaveChangesAsync(ct);
        if (ticket.BranchId is not null) await db.Entry(ticket).Reference(t => t.Branch).LoadAsync(ct);
        await audit.LogAsync("admin", "MAINTENANCE_TICKET_CREATED", ticket.Id.ToString(), newValue: request, severity: ticket.Severity, cancellationToken: ct);
        return Ok(Map(ticket));
    }

    [HttpPut("{id:int}/status")]
    [RequireModule("/admin/maintenance", PermissionAction.Edit)]
    public async Task<ActionResult<MaintenanceDto>> UpdateStatus(int id, UpdateMaintenanceStatusRequest request, CancellationToken ct)
    {
        var ticket = await db.MaintenanceTickets.Include(t => t.Branch).FirstOrDefaultAsync(t => t.Id == id, ct);
        if (ticket is null) return NotFound();

        ticket.Status = Enum.Parse<MaintenanceStatus>(request.Status);
        if (ticket.Status is MaintenanceStatus.Resolved or MaintenanceStatus.Closed) ticket.ResolvedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("admin", "MAINTENANCE_TICKET_STATUS_CHANGED", id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(ticket));
    }

    [HttpPut("{id:int}/assign")]
    [RequireModule("/admin/maintenance", PermissionAction.Edit)]
    public async Task<ActionResult<MaintenanceDto>> Assign(int id, AssignMaintenanceRequest request, CancellationToken ct)
    {
        var ticket = await db.MaintenanceTickets.Include(t => t.Branch).FirstOrDefaultAsync(t => t.Id == id, ct);
        if (ticket is null) return NotFound();

        ticket.Owner = request.Owner;
        if (ticket.Status == MaintenanceStatus.Open) ticket.Status = MaintenanceStatus.InProgress;
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("admin", "MAINTENANCE_TICKET_ASSIGNED", id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(ticket));
    }

    private static MaintenanceDto Map(MaintenanceTicket t) => new(
        t.Id, t.TicketNo, t.DeviceOrModule, t.BranchId, t.Branch?.NameEn, t.Severity.ToString(), t.Owner, t.SlaHours,
        t.Status.ToString(), t.CreatedAt, t.ResolvedAt);
}
