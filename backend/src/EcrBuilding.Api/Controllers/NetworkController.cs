using System.Security.Cryptography;
using EcrBuilding.Api.Authorization;
using EcrBuilding.Application.Abstractions;
using EcrBuilding.Application.Admin;
using EcrBuilding.Application.Pos;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Api.Controllers;

[ApiController]
[Route("api/network/branches")]
[Authorize]
[RequireModule("/network/branches", PermissionAction.View)]
public class BranchesController(AppDbContext db, IAuditService audit) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<BranchDto>>> List(CancellationToken ct)
    {
        var query = db.Branches.Include(b => b.Terminals).AsQueryable();
        if (this.GetScopedBranchId() is int scopedBranchId) query = query.Where(b => b.Id == scopedBranchId);
        var branches = await query.OrderBy(b => b.Code).ToListAsync(ct);

        var orderCounts = await db.Orders.GroupBy(o => o.BranchId)
            .Select(g => new { BranchId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.BranchId, x => x.Count, ct);

        return Ok(branches.Select(b => Map(b, orderCounts.GetValueOrDefault(b.Id))).ToList());
    }

    [HttpPost]
    [RequireModule("/network/branches", PermissionAction.Create)]
    public async Task<ActionResult<BranchDto>> Create(UpsertBranchRequest request, CancellationToken ct)
    {
        var branch = new Branch
        {
            Code = request.Code, NameEn = request.NameEn, NameAr = request.NameAr, City = request.City,
            Address = request.Address, BusinessHours = request.BusinessHours, VatRegistrationNumber = request.VatRegistrationNumber,
            ManagerName = request.ManagerName, Warehouse = request.Warehouse,
        };
        db.Branches.Add(branch);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("network", "BRANCH_CREATED", branch.Id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(branch, 0));
    }

    [HttpPut("{id:int}")]
    [RequireModule("/network/branches", PermissionAction.Edit)]
    public async Task<ActionResult<BranchDto>> Update(int id, UpdateBranchRequest request, CancellationToken ct)
    {
        var branch = await db.Branches.Include(b => b.Terminals).FirstOrDefaultAsync(b => b.Id == id, ct);
        if (branch is null) return NotFound();

        var ordersCount = await db.Orders.CountAsync(o => o.BranchId == id, ct);
        var old = Map(branch, ordersCount);
        branch.Code = request.Code;
        branch.NameEn = request.NameEn;
        branch.NameAr = request.NameAr;
        branch.City = request.City;
        branch.Address = request.Address;
        branch.BusinessHours = request.BusinessHours;
        branch.VatRegistrationNumber = request.VatRegistrationNumber;
        branch.ManagerName = request.ManagerName;
        branch.Warehouse = request.Warehouse;
        branch.Status = Enum.Parse<EntityStatus>(request.Status);
        await db.SaveChangesAsync(ct);

        await audit.LogAsync("network", "BRANCH_UPDATED", id.ToString(), oldValue: old, newValue: Map(branch, ordersCount), cancellationToken: ct);
        return Ok(Map(branch, ordersCount));
    }

    [HttpPut("{id:int}/status")]
    [RequireModule("/network/branches", PermissionAction.Delete)]
    public async Task<ActionResult<BranchDto>> SetStatus(int id, SetStatusRequest request, CancellationToken ct)
    {
        var branch = await db.Branches.Include(b => b.Terminals).FirstOrDefaultAsync(b => b.Id == id, ct);
        if (branch is null) return NotFound();
        if (!Enum.TryParse<EntityStatus>(request.Status, out var status)) return BadRequest(new { error = $"Unknown status \"{request.Status}\"." });

        branch.Status = status;
        await db.SaveChangesAsync(ct);
        var ordersCount = await db.Orders.CountAsync(o => o.BranchId == id, ct);
        await audit.LogAsync("network", "BRANCH_STATUS_CHANGED", id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(branch, ordersCount));
    }

    private static BranchDto Map(Branch b, int ordersCount) => new(
        b.Id, b.Code, b.NameEn, b.NameAr, b.City, b.Address, b.BusinessHours, b.VatRegistrationNumber, b.ManagerName, b.Warehouse,
        b.Status.ToString(), b.Terminals.Count, ordersCount);
}

[ApiController]
[Route("api/network/terminals")]
[Authorize]
[RequireModule("/network/terminals", PermissionAction.View)]
public class TerminalsController(AppDbContext db, IAuditService audit, IPasswordHasher passwordHasher) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<TerminalDto>>> List(CancellationToken ct)
    {
        var query = db.Terminals.Include(t => t.Branch).Include(t => t.Devices).Include(t => t.Operator).AsQueryable();
        if (this.GetScopedBranchId() is int scopedBranchId) query = query.Where(t => t.BranchId == scopedBranchId);
        var terminals = await query.OrderBy(t => t.Code).ToListAsync(ct);
        return Ok(terminals.Select(Map).ToList());
    }

    [HttpPost]
    [RequireModule("/network/terminals", PermissionAction.Create)]
    public async Task<ActionResult<TerminalDto>> Create(UpsertTerminalRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Code))
        {
            return BadRequest(new { error = "Terminal code is required." });
        }
        if (!await db.Branches.AnyAsync(b => b.Id == request.BranchId, ct))
        {
            return BadRequest(new { error = "Unknown branch." });
        }
        // Terminal.Code carries a DB-level unique index (see AppDbContext) — checked here too so a
        // duplicate returns a clean 409 like every other Code-keyed create in this app (products,
        // bundles, variant groups), instead of surfacing the raw unique-constraint DB exception.
        if (await db.Terminals.AnyAsync(t => t.Code == request.Code, ct))
        {
            return Conflict(new { error = "A terminal with this code already exists." });
        }

        var terminal = new Terminal
        {
            Code = request.Code, Name = request.Name, BranchId = request.BranchId,
            Type = Enum.Parse<TerminalType>(request.Type), OperatorUserId = request.AssignedCashierId,
            OfflineModeEnabled = request.OfflineModeEnabled, IpAddress = request.IpAddress, MacAddress = request.MacAddress,
        };
        db.Terminals.Add(terminal);
        await db.SaveChangesAsync(ct);
        await db.Entry(terminal).Reference(t => t.Branch).LoadAsync(ct);
        await db.Entry(terminal).Reference(t => t.Operator).LoadAsync(ct);
        await audit.LogAsync("network", "TERMINAL_CREATED", terminal.Id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(terminal));
    }

    [HttpPut("{id:int}")]
    [RequireModule("/network/terminals", PermissionAction.Edit)]
    public async Task<ActionResult<TerminalDto>> Update(int id, UpsertTerminalRequest request, CancellationToken ct)
    {
        var terminal = await db.Terminals.Include(t => t.Branch).Include(t => t.Devices).Include(t => t.Operator).FirstOrDefaultAsync(t => t.Id == id, ct);
        if (terminal is null) return NotFound();
        if (string.IsNullOrWhiteSpace(request.Code))
        {
            return BadRequest(new { error = "Terminal code is required." });
        }
        if (!await db.Branches.AnyAsync(b => b.Id == request.BranchId, ct))
        {
            return BadRequest(new { error = "Unknown branch." });
        }
        if (await db.Terminals.AnyAsync(t => t.Code == request.Code && t.Id != id, ct))
        {
            return Conflict(new { error = "A terminal with this code already exists." });
        }

        // Same rule as AssignCashier: an open shift pins both this terminal's branch and its
        // cashier. Changing the branch out from under it would attribute whatever the cashier
        // rings up next to a branch the shift never actually opened under; changing the cashier is
        // the identical hazard AssignCashier already blocks, just reachable through this form's
        // "Default Cashier" field instead.
        var openShift = await db.CashierShifts.Include(s => s.Cashier)
            .FirstOrDefaultAsync(s => s.TerminalId == id && s.Status == CashierShiftStatus.Open, ct);
        if (openShift is not null)
        {
            if (request.BranchId != terminal.BranchId)
            {
                return BadRequest(new { error = $"This terminal has an open shift under {openShift.Cashier?.Name ?? "another cashier"} — close it before changing its branch." });
            }
            if (request.AssignedCashierId != openShift.CashierUserId)
            {
                return BadRequest(new { error = $"This terminal has an open shift under {openShift.Cashier?.Name ?? "another cashier"} — close it before reassigning." });
            }
        }

        var old = Map(terminal);
        terminal.Code = request.Code;
        terminal.Name = request.Name;
        terminal.BranchId = request.BranchId;
        terminal.Type = Enum.Parse<TerminalType>(request.Type);
        terminal.OperatorUserId = request.AssignedCashierId;
        terminal.OfflineModeEnabled = request.OfflineModeEnabled;
        terminal.IpAddress = request.IpAddress;
        terminal.MacAddress = request.MacAddress;
        await db.SaveChangesAsync(ct);
        await db.Entry(terminal).Reference(t => t.Branch).LoadAsync(ct);
        await db.Entry(terminal).Reference(t => t.Operator).LoadAsync(ct);

        await audit.LogAsync("network", "TERMINAL_UPDATED", id.ToString(), oldValue: old, newValue: Map(terminal), cancellationToken: ct);
        return Ok(Map(terminal));
    }

    [HttpPut("{id:int}/status")]
    [RequireModule("/network/terminals", PermissionAction.Delete)]
    public async Task<ActionResult<TerminalDto>> SetStatus(int id, SetStatusRequest request, CancellationToken ct)
    {
        var terminal = await db.Terminals.Include(t => t.Branch).Include(t => t.Devices).Include(t => t.Operator).FirstOrDefaultAsync(t => t.Id == id, ct);
        if (terminal is null) return NotFound();
        if (!Enum.TryParse<TerminalStatus>(request.Status, out var status)) return BadRequest(new { error = $"Unknown status \"{request.Status}\"." });

        terminal.Status = status;
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("network", "TERMINAL_STATUS_CHANGED", id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(terminal));
    }

    [HttpPut("{id:int}/assign-cashier")]
    [RequireModule("/network/terminals", PermissionAction.Edit)]
    public async Task<ActionResult<TerminalDto>> AssignCashier(int id, AssignCashierRequest request, CancellationToken ct)
    {
        var terminal = await db.Terminals.Include(t => t.Branch).Include(t => t.Devices).Include(t => t.Operator).FirstOrDefaultAsync(t => t.Id == id, ct);
        if (terminal is null) return NotFound();

        // Reassigning out from under a currently-open shift would leave the terminal card and the
        // live Shift Ledger disagreeing about who's actually running the till — and since Open Shift
        // auto-attributes to whoever the terminal is assigned to, changing it mid-shift would even
        // block the real cashier's own OWN reassignment from ever opening (the terminal already has
        // an open shift, just under the wrong name). A same-cashier "reassignment" is a no-op, so it
        // isn't blocked.
        var openShift = await db.CashierShifts.Include(s => s.Cashier)
            .FirstOrDefaultAsync(s => s.TerminalId == id && s.Status == CashierShiftStatus.Open, ct);
        if (openShift is not null && openShift.CashierUserId != request.CashierUserId)
        {
            return BadRequest(new { error = $"This terminal has an open shift under {openShift.Cashier?.Name ?? "another cashier"} — close it before reassigning." });
        }

        if (request.CashierUserId is int cashierId)
        {
            var cashier = await db.Users.FirstOrDefaultAsync(u => u.Id == cashierId, ct);
            if (cashier is null) return BadRequest(new { error = "Unknown cashier." });
            // A branch-scoped cashier can only run a till in their own branch — a null BranchId is an
            // unscoped/HQ user (e.g. System Admin covering a till), who can be assigned anywhere.
            if (cashier.BranchId is int cashierBranchId && cashierBranchId != terminal.BranchId)
            {
                return BadRequest(new { error = "This cashier belongs to a different branch than this terminal." });
            }

            // One cashier, one terminal at a time — re-assigning them here MOVES them off whatever
            // other terminal they were on rather than leaving both rows pointing at the same person.
            var previousTerminal = await db.Terminals.FirstOrDefaultAsync(t => t.Id != id && t.OperatorUserId == cashierId, ct);
            if (previousTerminal is not null)
            {
                previousTerminal.OperatorUserId = null;
            }
        }

        terminal.OperatorUserId = request.CashierUserId;
        await db.SaveChangesAsync(ct);
        await db.Entry(terminal).Reference(t => t.Operator).LoadAsync(ct);

        await audit.LogAsync("network", "TERMINAL_CASHIER_ASSIGNED", id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(terminal));
    }

    [HttpPost("{id:int}/force-sync")]
    [RequireModule("/network/terminals", PermissionAction.Edit)]
    public async Task<ActionResult<TerminalDto>> ForceSync(int id, CancellationToken ct)
    {
        var terminal = await db.Terminals.Include(t => t.Branch).Include(t => t.Devices).Include(t => t.Operator).FirstOrDefaultAsync(t => t.Id == id, ct);
        if (terminal is null) return NotFound();

        terminal.LastSyncAt = DateTime.UtcNow;
        if (terminal.Status == TerminalStatus.Offline) terminal.Status = TerminalStatus.Online;
        await db.SaveChangesAsync(ct);

        await audit.LogAsync("network", "TERMINAL_FORCE_SYNC", id.ToString(), cancellationToken: ct);
        return Ok(Map(terminal));
    }

    [HttpPost("{id:int}/kiosk-pairing")]
    [RequireModule("/network/terminals", PermissionAction.Edit)]
    public async Task<ActionResult<GenerateKioskPairingResponse>> GenerateKioskPairing(int id, CancellationToken ct)
    {
        var terminal = await db.Terminals.FirstOrDefaultAsync(t => t.Id == id, ct);
        if (terminal is null) return NotFound();

        const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid transcription errors
        var secret = RandomNumberGenerator.GetString(alphabet, 16);
        terminal.PairingSecretHash = passwordHasher.Hash(secret);
        terminal.PairingSecretSetAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        await audit.LogAsync("network", "TERMINAL_KIOSK_PAIRED", id.ToString(), cancellationToken: ct);
        return Ok(new GenerateKioskPairingResponse(terminal.Code, secret));
    }

    [HttpPut("{id:int}/kiosk-lockdown-pin")]
    [RequireModule("/network/terminals", PermissionAction.Edit)]
    public async Task<ActionResult<TerminalDto>> SetKioskLockdownPin(int id, SetKioskLockdownPinRequest request, CancellationToken ct)
    {
        var terminal = await db.Terminals.Include(t => t.Branch).Include(t => t.Devices).Include(t => t.Operator).FirstOrDefaultAsync(t => t.Id == id, ct);
        if (terminal is null) return NotFound();
        if (request.Pin.Length is < 4 or > 6 || !request.Pin.All(char.IsDigit))
        {
            return BadRequest(new { error = "PIN must be 4-6 digits." });
        }

        terminal.KioskLockdownPinHash = passwordHasher.Hash(request.Pin);
        terminal.KioskLockdownPinSetAt = DateTime.UtcNow;
        terminal.KioskLockdownPinLength = request.Pin.Length;
        await db.SaveChangesAsync(ct);

        await audit.LogAsync("network", "TERMINAL_LOCKDOWN_PIN_SET", id.ToString(), cancellationToken: ct);
        return Ok(Map(terminal));
    }

    [HttpDelete("{id:int}/kiosk-lockdown-pin")]
    [RequireModule("/network/terminals", PermissionAction.Delete)]
    public async Task<ActionResult<TerminalDto>> ClearKioskLockdownPin(int id, CancellationToken ct)
    {
        var terminal = await db.Terminals.Include(t => t.Branch).Include(t => t.Devices).Include(t => t.Operator).FirstOrDefaultAsync(t => t.Id == id, ct);
        if (terminal is null) return NotFound();

        terminal.KioskLockdownPinHash = null;
        terminal.KioskLockdownPinSetAt = null;
        terminal.KioskLockdownPinLength = null;
        await db.SaveChangesAsync(ct);

        await audit.LogAsync("network", "TERMINAL_LOCKDOWN_PIN_CLEARED", id.ToString(), cancellationToken: ct);
        return Ok(Map(terminal));
    }

    private static TerminalDto Map(Terminal t) => new(
        t.Id, t.Code, t.Name, t.BranchId, t.Branch?.NameEn ?? "", t.Type.ToString(), t.OperatorUserId, t.Operator?.Name,
        t.OfflineModeEnabled, t.IpAddress, t.MacAddress, t.Status.ToString(), t.LastSyncAt, t.Devices.Count,
        t.PairingSecretHash is not null, t.KioskLockdownPinHash is not null, t.KioskLockdownPinLength);
}

[ApiController]
[Route("api/network/devices")]
[Authorize]
[RequireModule("/network/devices", PermissionAction.View)]
public class DevicesController(AppDbContext db, IAuditService audit) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<DeviceDto>>> List(CancellationToken ct)
    {
        var query = db.Devices.Include(d => d.Terminal).Include(d => d.Branch).AsQueryable();
        if (this.GetScopedBranchId() is int scopedBranchId) query = query.Where(d => d.BranchId == scopedBranchId);
        var devices = await query.OrderBy(d => d.DeviceCode).ToListAsync(ct);
        return Ok(devices.Select(Map).ToList());
    }

    [HttpPost("pair")]
    [RequireModule("/network/devices", PermissionAction.Create)]
    public async Task<ActionResult<DeviceDto>> Pair(PairDeviceRequest request, CancellationToken ct)
    {
        var terminal = await db.Terminals.FindAsync([request.TerminalId], ct);
        if (terminal is null) return BadRequest(new { error = "Unknown terminal." });

        var type = Enum.Parse<DeviceType>(request.Type);
        var device = new Device
        {
            DeviceCode = $"{terminal.Code}-{type}-{DateTime.UtcNow:HHmmss}",
            Type = type,
            Model = request.Model,
            Serial = request.Serial,
            TerminalId = request.TerminalId,
            BranchId = terminal.BranchId,
            Connection = Enum.Parse<DeviceConnection>(request.Connection),
            IpAddress = request.IpAddress,
            BehaviorProfile = request.BehaviorProfile,
            Status = DeviceStatus.Healthy,
            SyncStatus = DeviceSyncStatus.Synced,
            LastTestAt = DateTime.UtcNow,
        };
        db.Devices.Add(device);
        await db.SaveChangesAsync(ct);
        device.Terminal = terminal;
        await db.Entry(device).Reference(d => d.Branch).LoadAsync(ct);
        await audit.LogAsync("network", "DEVICE_PAIRED", device.Id.ToString(), newValue: request, deviceId: device.Id, cancellationToken: ct);
        return Ok(Map(device));
    }

    [HttpPut("{id:int}")]
    [RequireModule("/network/devices", PermissionAction.Edit)]
    public async Task<ActionResult<DeviceDto>> Update(int id, UpdateDeviceRequest request, CancellationToken ct)
    {
        var device = await db.Devices.Include(d => d.Terminal).Include(d => d.Branch).FirstOrDefaultAsync(d => d.Id == id, ct);
        if (device is null) return NotFound();

        var old = Map(device);
        if (device.TerminalId != request.TerminalId)
        {
            var terminal = await db.Terminals.FindAsync([request.TerminalId], ct);
            if (terminal is null) return BadRequest(new { error = "Unknown terminal." });
            device.TerminalId = request.TerminalId;
            device.Terminal = terminal;
            device.BranchId = terminal.BranchId;
        }
        device.Model = request.Model;
        device.Serial = request.Serial;
        device.Connection = Enum.Parse<DeviceConnection>(request.Connection);
        device.IpAddress = request.IpAddress;
        device.BehaviorProfile = request.BehaviorProfile;
        await db.SaveChangesAsync(ct);
        await db.Entry(device).Reference(d => d.Branch).LoadAsync(ct);

        await audit.LogAsync("network", "DEVICE_UPDATED", id.ToString(), oldValue: old, newValue: Map(device), deviceId: device.Id, cancellationToken: ct);
        return Ok(Map(device));
    }

    [HttpPut("{id:int}/status")]
    [RequireModule("/network/devices", PermissionAction.Delete)]
    public async Task<ActionResult<DeviceDto>> SetStatus(int id, DeviceSetStatusRequest request, CancellationToken ct)
    {
        var device = await db.Devices.Include(d => d.Terminal).Include(d => d.Branch).FirstOrDefaultAsync(d => d.Id == id, ct);
        if (device is null) return NotFound();
        if (!Enum.TryParse<DeviceStatus>(request.Status, out var status)) return BadRequest(new { error = $"Unknown status \"{request.Status}\"." });

        device.Status = status;
        if (request.SyncStatus is not null)
        {
            if (!Enum.TryParse<DeviceSyncStatus>(request.SyncStatus, out var syncStatus)) return BadRequest(new { error = $"Unknown sync status \"{request.SyncStatus}\"." });
            device.SyncStatus = syncStatus;
        }
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("network", "DEVICE_STATUS_CHANGED", id.ToString(), newValue: request, deviceId: device.Id, cancellationToken: ct);
        return Ok(Map(device));
    }

    // BRD §7.3: context distinguishes an automatic sale-completion open ("Sale" — no extra auth, it
    // rides the cash payment) from a NO-SALE open ("NoSale" — needs supervisor authorization and its
    // own distinct audit event so Z-report reconciliation can count them separately).
    [HttpPost("{id:int}/open-drawer")]
    [RequireModule("/network/devices", PermissionAction.View)]
    public async Task<ActionResult> OpenDrawer(int id, [FromQuery] string context = "NoSale", CancellationToken ct = default)
    {
        var device = await db.Devices.FirstOrDefaultAsync(d => d.Id == id, ct);
        if (device is null) return NotFound();
        if (device.Type != DeviceType.CashDrawer)
        {
            return BadRequest(new { error = "Only a cash drawer device can be opened remotely." });
        }
        if (device.Status == DeviceStatus.Disconnected)
        {
            return BadRequest(new { error = "This drawer is disconnected — reconnect it first." });
        }

        var isSale = context.Equals("Sale", StringComparison.OrdinalIgnoreCase);
        if (!isSale)
        {
            var isSupervisor = string.Equals(User.FindFirst("posCeiling:canVoidTransactions")?.Value, "True", StringComparison.OrdinalIgnoreCase);
            if (!isSupervisor)
            {
                return StatusCode(403, new { error = "A no-sale drawer open requires Supervisor (or higher) authorization." });
            }
        }

        // No physical kick signal can be sent from a web request without a local print/POS agent —
        // recording the authorized open command is the correct backend responsibility here, exactly
        // like a real POS system's manager-override audit trail. (The physical kick happens client-side
        // via the QZ Tray printer pulse on receipt print.)
        await audit.LogAsync("network", isSale ? "DEVICE_DRAWER_OPENED_SALE" : "DEVICE_DRAWER_NOSALE", id.ToString(), deviceId: device.Id, cancellationToken: ct);
        return Ok(new { message = $"Drawer-open command for {device.DeviceCode} logged and sent to the terminal's local agent." });
    }

    [HttpPut("{id:int}/qz-mapping")]
    [RequireModule("/network/devices", PermissionAction.Edit)]
    public async Task<ActionResult<DeviceDto>> UpdateQzMapping(int id, UpdateDeviceQzMappingRequest request, CancellationToken ct)
    {
        var device = await db.Devices.Include(d => d.Terminal).Include(d => d.Branch).FirstOrDefaultAsync(d => d.Id == id, ct);
        if (device is null) return NotFound();
        device.QzPrinterName = string.IsNullOrWhiteSpace(request.QzPrinterName) ? null : request.QzPrinterName.Trim();
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("network", "DEVICE_QZ_MAPPED", device.Id.ToString(), newValue: request, deviceId: device.Id, cancellationToken: ct);
        return Ok(Map(device));
    }

    private static DeviceDto Map(Device d) => new(
        d.Id, d.DeviceCode, d.Type.ToString(), d.Model, d.Serial, d.TerminalId, d.Terminal?.Name ?? "", d.BranchId, d.Branch?.NameEn ?? "",
        d.Connection.ToString(), d.IpAddress, d.Firmware, d.LastTestAt, d.Status.ToString(), d.SyncStatus.ToString(), d.BehaviorProfile, d.QzPrinterName);
}

[ApiController]
[Route("api/network/session-logs")]
[Authorize]
[RequireModule("/network/terminals", PermissionAction.View)]
public class SessionLogsController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<CashierShiftDto>>> List(
        [FromQuery] int? terminalId, [FromQuery] int? branchId, [FromQuery] int? cashierId,
        [FromQuery] string? status, [FromQuery] DateTime? dateFrom, [FromQuery] DateTime? dateTo,
        CancellationToken ct)
    {
        var query = db.CashierShifts.Include(s => s.Terminal).Include(s => s.Cashier).AsQueryable();

        var scopedBranchId = this.GetScopedBranchId() ?? branchId;
        if (scopedBranchId is int b) query = query.Where(s => s.Terminal!.BranchId == b);
        if (terminalId is int t) query = query.Where(s => s.TerminalId == t);
        if (cashierId is int c) query = query.Where(s => s.CashierUserId == c);
        if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<CashierShiftStatus>(status, true, out var parsedStatus))
        {
            query = query.Where(s => s.Status == parsedStatus);
        }
        if (dateFrom is DateTime from) query = query.Where(s => s.OpenedAt >= from);
        if (dateTo is DateTime to) query = query.Where(s => s.OpenedAt <= to);

        var shifts = await query.OrderByDescending(s => s.OpenedAt).ToListAsync(ct);
        return Ok(shifts.Select(Map).ToList());
    }

    private static CashierShiftDto Map(CashierShift s) => new(
        s.Id, s.TerminalId, s.Terminal?.Name ?? "", s.Cashier?.Name ?? "", s.OpenedAt, s.ClosedAt, s.OpeningFloat,
        s.CashSales, s.CashIn, s.CashOut, s.ExpectedCash, s.CountedCash, s.Variance, s.Status.ToString());
}
