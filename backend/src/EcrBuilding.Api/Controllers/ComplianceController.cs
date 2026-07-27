using System.Security.Claims;
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
[Route("api/admin/compliance")]
[Authorize]
[RequireModule(ModuleArea.Admin, AccessLevel.View)]
public class ComplianceController(AppDbContext db, IAuditService audit) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<ComplianceDto>>> List(CancellationToken ct)
    {
        var rows = await db.ComplianceControls.OrderBy(c => c.NextDue).ToListAsync(ct);
        return Ok(rows.Select(Map).ToList());
    }

    [HttpPost]
    [RequireModule(ModuleArea.Admin, AccessLevel.Edit)]
    public async Task<ActionResult<ComplianceDto>> Create(UpsertComplianceRequest request, CancellationToken ct)
    {
        var row = new ComplianceControl
        {
            Control = request.Control, Framework = request.Framework, Owner = request.Owner,
            LastReview = request.LastReview, NextDue = request.NextDue, Evidence = request.Evidence,
            Findings = request.Findings, Status = Enum.Parse<ComplianceStatus>(request.Status),
        };
        db.ComplianceControls.Add(row);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("admin", "COMPLIANCE_CONTROL_CREATED", row.Id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(row));
    }

    [HttpPut("{id:int}")]
    [RequireModule(ModuleArea.Admin, AccessLevel.Edit)]
    public async Task<ActionResult<ComplianceDto>> Update(int id, UpsertComplianceRequest request, CancellationToken ct)
    {
        var row = await db.ComplianceControls.FirstOrDefaultAsync(c => c.Id == id, ct);
        if (row is null) return NotFound();

        row.Control = request.Control;
        row.Framework = request.Framework;
        row.Owner = request.Owner;
        row.LastReview = request.LastReview;
        row.NextDue = request.NextDue;
        row.Evidence = request.Evidence;
        row.Findings = request.Findings;
        row.Status = Enum.Parse<ComplianceStatus>(request.Status);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("admin", "COMPLIANCE_CONTROL_UPDATED", id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(row));
    }

    [HttpPut("{id:int}/sign-off")]
    [RequireModule(ModuleArea.Admin, AccessLevel.Edit)]
    public async Task<ActionResult<ComplianceDto>> SignOff(int id, SignOffComplianceRequest request, CancellationToken ct)
    {
        var row = await db.ComplianceControls.FirstOrDefaultAsync(c => c.Id == id, ct);
        if (row is null) return NotFound();

        var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var signer = (await db.Users.FindAsync([userId], ct))?.Name ?? "Unknown";
        row.Status = ComplianceStatus.Compliant;
        row.LastReview = DateTime.UtcNow;
        var note = $"Signed off by {signer} on {DateTime.UtcNow:yyyy-MM-dd}.{(string.IsNullOrWhiteSpace(request.Note) ? "" : $" {request.Note}")}";
        row.Evidence = string.IsNullOrWhiteSpace(row.Evidence) ? note : $"{row.Evidence}\n{note}";
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("admin", "COMPLIANCE_SIGNED_OFF", id.ToString(), userId: userId, cancellationToken: ct);
        return Ok(Map(row));
    }

    private static ComplianceDto Map(ComplianceControl c) => new(
        c.Id, c.Control, c.Framework, c.Owner, c.LastReview, c.NextDue, c.Evidence, c.Findings, c.Status.ToString());
}
