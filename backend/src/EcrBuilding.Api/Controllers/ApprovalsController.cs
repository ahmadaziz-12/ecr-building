using System.Security.Claims;
using EcrBuilding.Api.Authorization;
using EcrBuilding.Application.Abstractions;
using EcrBuilding.Application.Pos;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Api.Controllers;

[ApiController]
[Route("api/pos/approvals")]
[Authorize]
[RequireModule("/operate/pos-checkout", PermissionAction.View)]
public class ApprovalsController(AppDbContext db, IAuditService audit) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<ApprovalRequestDto>>> List([FromQuery] string? status, CancellationToken ct)
    {
        var query = Query();
        if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<ApprovalStatus>(status, ignoreCase: true, out var parsed))
        {
            query = query.Where(a => a.Status == parsed);
        }
        var rows = await query.OrderByDescending(a => a.CreatedAt).ToListAsync(ct);
        return Ok(rows.Select(Map).ToList());
    }

    [HttpPost]
    [RequireModule("/operate/pos-checkout", PermissionAction.Create)]
    public async Task<ActionResult<ApprovalRequestDto>> Create(CreateApprovalRequestInput request, CancellationToken ct)
    {
        var cashierId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var approval = new ApprovalRequest
        {
            Type = Enum.Parse<ApprovalType>(request.Type), BranchId = request.BranchId, RequestedByUserId = cashierId,
            Amount = request.Amount, Reason = request.Reason, RelatedOrderId = request.RelatedOrderId,
        };
        db.ApprovalRequests.Add(approval);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("pos", "APPROVAL_REQUESTED", approval.Id.ToString(), userId: cashierId, branchId: request.BranchId, cancellationToken: ct);

        var created = await Query().FirstAsync(a => a.Id == approval.Id, ct);
        return Ok(Map(created));
    }

    [HttpPut("{id:int}/approve")]
    [RequireModule("/operate/pos-checkout", PermissionAction.Approve)]
    public Task<ActionResult<ApprovalRequestDto>> Approve(int id, CancellationToken ct) => Resolve(id, ApprovalStatus.Approved, "APPROVAL_GRANTED", ct);

    [HttpPut("{id:int}/reject")]
    [RequireModule("/operate/pos-checkout", PermissionAction.Approve)]
    public Task<ActionResult<ApprovalRequestDto>> Reject(int id, CancellationToken ct) => Resolve(id, ApprovalStatus.Rejected, "APPROVAL_REJECTED", ct);

    private async Task<ActionResult<ApprovalRequestDto>> Resolve(int id, ApprovalStatus to, string auditEvent, CancellationToken ct)
    {
        var approval = await Query().FirstOrDefaultAsync(a => a.Id == id, ct);
        if (approval is null) return NotFound();
        if (approval.Status != ApprovalStatus.Pending) return BadRequest(new { error = "This request has already been resolved." });

        var approverId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        if (approverId == approval.RequestedByUserId)
        {
            return BadRequest(new { error = "You cannot approve your own request — a different, higher-tier user must authorize it." });
        }
        approval.Status = to;
        approval.ApproverUserId = approverId;
        approval.ResolvedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("pos", auditEvent, id.ToString(), userId: approverId, cancellationToken: ct);

        await db.Entry(approval).Reference(a => a.Approver).LoadAsync(ct);
        return Ok(Map(approval));
    }

    private IQueryable<ApprovalRequest> Query() => db.ApprovalRequests
        .Include(a => a.RequestedBy).Include(a => a.Approver).Include(a => a.RelatedOrder);

    private static ApprovalRequestDto Map(ApprovalRequest a) => new(
        a.Id, a.Type.ToString(), a.BranchId, a.RequestedBy?.Name ?? "", a.Approver?.Name, a.Amount, a.Reason,
        a.Status.ToString(), a.RelatedOrderId, a.RelatedOrder?.OrderNo, a.CreatedAt, a.ResolvedAt);
}
