using System.Security.Claims;
using EcrBuilding.Application.Auth;
using EcrBuilding.Application.Pos;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Api.Hubs;

// Mirrors a cashier's in-progress cart to a paired customer-facing display in real time. Purely a
// relay keyed by terminal id — it holds no state of its own and never re-prices anything, so
// PosCheckout's own totals (already the ones OrdersController.Checkout validates at charge time)
// are exactly what the display shows. Either side (the cashier pushing, or the display listening)
// is allowed in with View on POS Checkout OR the Customer Display page, since a cashier's role may
// not otherwise have the display page granted — AND (see CanAccessAsync) the terminal itself must be
// in the caller's own branch AND either unassigned or assigned to the caller (Supervisor+ excepted).
// Without those checks, a valid ?terminal= key for ANY branch/till would let a cashier peek at (or
// even push fake data into) another cashier's till just by editing the URL — the whole point of
// keying the display by terminal is defeated if that key isn't itself access-controlled.
[Authorize]
public class PosSessionHub(IPermissionResolver permissions, AppDbContext db) : Hub
{
    private static string GroupName(int terminalId) => $"terminal-{terminalId}";

    public async Task JoinTerminal(int terminalId)
    {
        if (!await CanAccessAsync(terminalId))
        {
            throw new HubException("Not authorized for this terminal's customer display.");
        }
        await Groups.AddToGroupAsync(Context.ConnectionId, GroupName(terminalId));
    }

    public async Task LeaveTerminal(int terminalId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, GroupName(terminalId));
    }

    public async Task PushCartSnapshot(int terminalId, CustomerDisplaySnapshotDto snapshot)
    {
        if (!await CanAccessAsync(terminalId))
        {
            throw new HubException("Not authorized for this terminal's customer display.");
        }
        await Clients.OthersInGroup(GroupName(terminalId)).SendAsync("CartUpdated", snapshot);
    }

    private async Task<bool> CanAccessAsync(int terminalId)
    {
        var userIdClaim = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!int.TryParse(userIdClaim, out var userId)) return false;

        var hasPagePermission =
            await permissions.HasAsync(userId, "/operate/pos-checkout", PermissionAction.View, Context.ConnectionAborted)
            || await permissions.HasAsync(userId, "/operate/customer-display", PermissionAction.View, Context.ConnectionAborted);
        if (!hasPagePermission) return false;

        var terminal = await db.Terminals
            .Where(t => t.Id == terminalId)
            .Select(t => new { t.BranchId, t.OperatorUserId })
            .FirstOrDefaultAsync(Context.ConnectionAborted);
        if (terminal is null) return false;

        // Same scoping semantics as ControllerBaseExtensions.GetScopedBranchId: a branch-level user
        // (Cashier/Manager tied to one location) carries a "branchId" claim and is confined to it; an
        // HQ role (no claim) sees/joins every terminal, same as their REST endpoints already do.
        var branchClaim = Context.User?.FindFirst("branchId")?.Value;
        if (int.TryParse(branchClaim, out var callerBranchId) && terminal.BranchId != callerBranchId)
        {
            return false;
        }

        // Same boundary as the Open Shift terminal picker (CashierShiftsController.Terminals): a
        // till assigned to a DIFFERENT cashier is off-limits — a valid ?terminal= key must not let a
        // cashier peek at (or push fake data into) another cashier's live sale just because they're
        // both in the same branch. Supervisor+ (the void-transaction authority ceiling) can view any
        // terminal's display, the same tier that can open a shift on another cashier's behalf.
        if (terminal.OperatorUserId is int assignedTo && assignedTo != userId)
        {
            var caller = await db.Users.Include(u => u.Role).FirstOrDefaultAsync(u => u.Id == userId, Context.ConnectionAborted);
            if (caller?.Role is not { CanVoidTransactions: true }) return false;
        }

        return true;
    }
}
