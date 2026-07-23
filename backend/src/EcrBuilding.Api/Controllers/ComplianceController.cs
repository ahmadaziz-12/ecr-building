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

    private static ComplianceDto Map(ComplianceControl c) => new(
        c.Id, c.Control, c.Framework, c.Owner, c.LastReview, c.NextDue, c.Evidence, c.Findings, c.Status.ToString());
}
