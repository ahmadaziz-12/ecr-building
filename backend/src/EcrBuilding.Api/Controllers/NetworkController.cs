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
[Route("api/network/branches")]
[Authorize]
[RequireModule(ModuleArea.Network, AccessLevel.View)]
public class BranchesController(AppDbContext db, IAuditService audit) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<BranchDto>>> List(CancellationToken ct)
    {
        var branches = await db.Branches.Include(b => b.Terminals).OrderBy(b => b.Code).ToListAsync(ct);
        return Ok(branches.Select(Map).ToList());
    }

    [HttpPost]
    [RequireModule(ModuleArea.Network, AccessLevel.Edit)]
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
        return Ok(Map(branch));
    }

    private static BranchDto Map(Branch b) => new(
        b.Id, b.Code, b.NameEn, b.NameAr, b.City, b.Address, b.BusinessHours, b.VatRegistrationNumber, b.ManagerName, b.Warehouse,
        b.Status.ToString(), b.Terminals.Count);
}

[ApiController]
[Route("api/network/terminals")]
[Authorize]
[RequireModule(ModuleArea.Network, AccessLevel.View)]
public class TerminalsController(AppDbContext db, IAuditService audit) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<TerminalDto>>> List(CancellationToken ct)
    {
        var terminals = await db.Terminals.Include(t => t.Branch).Include(t => t.Devices).OrderBy(t => t.Code).ToListAsync(ct);
        return Ok(terminals.Select(Map).ToList());
    }

    [HttpPost]
    [RequireModule(ModuleArea.Network, AccessLevel.Edit)]
    public async Task<ActionResult<TerminalDto>> Create(UpsertTerminalRequest request, CancellationToken ct)
    {
        var terminal = new Terminal
        {
            Code = request.Code, Name = request.Name, BranchId = request.BranchId,
            Type = Enum.Parse<TerminalType>(request.Type), OfflineModeEnabled = request.OfflineModeEnabled,
            IpAddress = request.IpAddress, MacAddress = request.MacAddress,
        };
        db.Terminals.Add(terminal);
        await db.SaveChangesAsync(ct);
        await db.Entry(terminal).Reference(t => t.Branch).LoadAsync(ct);
        await audit.LogAsync("network", "TERMINAL_CREATED", terminal.Id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(terminal));
    }

    private static TerminalDto Map(Terminal t) => new(
        t.Id, t.Code, t.Name, t.BranchId, t.Branch?.NameEn ?? "", t.Type.ToString(), t.OfflineModeEnabled, t.IpAddress, t.MacAddress,
        t.Status.ToString(), t.LastSyncAt, t.Devices.Count);
}

[ApiController]
[Route("api/network/devices")]
[Authorize]
[RequireModule(ModuleArea.Network, AccessLevel.View)]
public class DevicesController(AppDbContext db, IAuditService audit) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<DeviceDto>>> List(CancellationToken ct)
    {
        var devices = await db.Devices.Include(d => d.Terminal).OrderBy(d => d.DeviceCode).ToListAsync(ct);
        return Ok(devices.Select(Map).ToList());
    }

    [HttpPost("pair")]
    [RequireModule(ModuleArea.Network, AccessLevel.Edit)]
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
            Connection = Enum.Parse<DeviceConnection>(request.Connection),
            IpAddress = request.IpAddress,
            Status = DeviceStatus.Healthy,
            LastTestAt = DateTime.UtcNow,
        };
        db.Devices.Add(device);
        await db.SaveChangesAsync(ct);
        device.Terminal = terminal;
        await audit.LogAsync("network", "DEVICE_PAIRED", device.Id.ToString(), newValue: request, deviceId: device.Id, cancellationToken: ct);
        return Ok(Map(device));
    }

    [HttpPut("{id:int}/qz-mapping")]
    [RequireModule(ModuleArea.Network, AccessLevel.Edit)]
    public async Task<ActionResult<DeviceDto>> UpdateQzMapping(int id, UpdateDeviceQzMappingRequest request, CancellationToken ct)
    {
        var device = await db.Devices.Include(d => d.Terminal).FirstOrDefaultAsync(d => d.Id == id, ct);
        if (device is null) return NotFound();
        device.QzPrinterName = string.IsNullOrWhiteSpace(request.QzPrinterName) ? null : request.QzPrinterName.Trim();
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("network", "DEVICE_QZ_MAPPED", device.Id.ToString(), newValue: request, deviceId: device.Id, cancellationToken: ct);
        return Ok(Map(device));
    }

    private static DeviceDto Map(Device d) => new(
        d.Id, d.DeviceCode, d.Type.ToString(), d.Model, d.Serial, d.TerminalId, d.Terminal?.Name ?? "", d.Connection.ToString(),
        d.IpAddress, d.Firmware, d.LastTestAt, d.Status.ToString(), d.QzPrinterName);
}
