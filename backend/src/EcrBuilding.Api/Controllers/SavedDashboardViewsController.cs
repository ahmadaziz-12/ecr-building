using System.Security.Claims;
using System.Text.Json;
using EcrBuilding.Application.Insights;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Api.Controllers;

// No [RequireModule] gate — every role that can open the dashboard (including Cashier/Senior
// Cashier, who have Insights = None) must still be able to save/load their own filter views.
[ApiController]
[Route("api/insights/saved-views")]
[Authorize]
public class SavedDashboardViewsController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<SavedDashboardViewDto>>> List(CancellationToken ct)
    {
        var userId = CurrentUserId();
        var rows = await db.SavedDashboardViews
            .Where(v => v.UserId == userId)
            .OrderByDescending(v => v.CreatedAt)
            .ToListAsync(ct);
        return Ok(rows.Select(Map).ToList());
    }

    [HttpPost]
    public async Task<ActionResult<SavedDashboardViewDto>> Create(CreateSavedDashboardViewRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Name)) return BadRequest(new { error = "Name is required." });

        var view = new SavedDashboardView
        {
            UserId = CurrentUserId(),
            Name = request.Name.Trim(),
            FiltersJson = JsonSerializer.Serialize(request.Filters),
        };
        db.SavedDashboardViews.Add(view);
        await db.SaveChangesAsync(ct);
        return Ok(Map(view));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        var view = await db.SavedDashboardViews.FirstOrDefaultAsync(v => v.Id == id && v.UserId == CurrentUserId(), ct);
        if (view is null) return NotFound();
        db.SavedDashboardViews.Remove(view);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private int CurrentUserId() => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    private static SavedDashboardViewDto Map(SavedDashboardView v) => new(v.Id, v.Name, v.FiltersJson, v.CreatedAt);
}
