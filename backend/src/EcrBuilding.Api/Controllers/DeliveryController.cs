using EcrBuilding.Api.Authorization;
using EcrBuilding.Application.Abstractions;
using EcrBuilding.Application.Delivery;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Api.Controllers;

[ApiController]
[Route("api/delivery/drivers")]
[Authorize]
[RequireModule(ModuleArea.Delivery, AccessLevel.View)]
public class DriversController(AppDbContext db, IAuditService audit) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<DriverDto>>> List(CancellationToken ct)
    {
        var drivers = await db.Drivers.Include(d => d.Branch).OrderBy(d => d.Name).ToListAsync(ct);
        return Ok(drivers.Select(Map).ToList());
    }

    [HttpPost]
    [RequireModule(ModuleArea.Delivery, AccessLevel.Edit)]
    public async Task<ActionResult<DriverDto>> Create(UpsertDriverRequest request, CancellationToken ct)
    {
        var driver = new Driver { Name = request.Name, BranchId = request.BranchId, Mobile = request.Mobile, License = request.License, LicenseExpiry = request.LicenseExpiry };
        db.Drivers.Add(driver);
        await db.SaveChangesAsync(ct);
        await db.Entry(driver).Reference(d => d.Branch).LoadAsync(ct);
        await audit.LogAsync("delivery", "DRIVER_CREATED", driver.Id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(driver));
    }

    private static DriverDto Map(Driver d) => new(
        d.Id, d.Name, d.BranchId, d.Branch?.NameEn ?? "", d.Mobile, d.License, d.LicenseExpiry, d.VehicleId, d.Status.ToString(),
        d.DeliveriesToday, d.Status == DriverStatus.Available && d.LicenseExpiry > DateTime.UtcNow);
}

[ApiController]
[Route("api/delivery/vehicles")]
[Authorize]
[RequireModule(ModuleArea.Delivery, AccessLevel.View)]
public class VehiclesController(AppDbContext db, IAuditService audit) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<VehicleDto>>> List(CancellationToken ct)
    {
        var vehicles = await db.Vehicles.Include(v => v.Branch).OrderBy(v => v.Registration).ToListAsync(ct);
        return Ok(vehicles.Select(Map).ToList());
    }

    [HttpPost]
    [RequireModule(ModuleArea.Delivery, AccessLevel.Edit)]
    public async Task<ActionResult<VehicleDto>> Create(UpsertVehicleRequest request, CancellationToken ct)
    {
        var vehicle = new Vehicle { Registration = request.Registration, Type = Enum.Parse<VehicleType>(request.Type), BranchId = request.BranchId, CapacityTons = request.CapacityTons };
        db.Vehicles.Add(vehicle);
        await db.SaveChangesAsync(ct);
        await db.Entry(vehicle).Reference(v => v.Branch).LoadAsync(ct);
        await audit.LogAsync("delivery", "VEHICLE_CREATED", vehicle.Id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(Map(vehicle));
    }

    private static VehicleDto Map(Vehicle v) => new(v.Id, v.Registration, v.Type.ToString(), v.BranchId, v.Branch?.NameEn ?? "", v.CapacityTons, v.CurrentLoad, v.Status.ToString(), v.DeviceStatus.ToString());
}

[ApiController]
[Route("api/delivery/zones")]
[Authorize]
[RequireModule(ModuleArea.Delivery, AccessLevel.View)]
public class DeliveryZonesController(AppDbContext db, IAuditService audit) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<ZoneDto>>> List(CancellationToken ct)
    {
        var zones = await db.DeliveryZones.OrderBy(z => z.City).ToListAsync(ct);
        return Ok(zones.Select(z => new ZoneDto(z.Id, z.Name, z.City, z.DistanceKm, z.Fee)).ToList());
    }

    [HttpPost]
    [RequireModule(ModuleArea.Delivery, AccessLevel.Edit)]
    public async Task<ActionResult<ZoneDto>> Create(UpsertZoneRequest request, CancellationToken ct)
    {
        var zone = new DeliveryZone { Name = request.Name, City = request.City, DistanceKm = request.DistanceKm, Fee = request.Fee };
        db.DeliveryZones.Add(zone);
        await db.SaveChangesAsync(ct);
        await audit.LogAsync("delivery", "ZONE_CREATED", zone.Id.ToString(), newValue: request, cancellationToken: ct);
        return Ok(new ZoneDto(zone.Id, zone.Name, zone.City, zone.DistanceKm, zone.Fee));
    }

    [HttpDelete("{id:int}")]
    [RequireModule(ModuleArea.Delivery, AccessLevel.Edit)]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        var zone = await db.DeliveryZones.FindAsync([id], ct);
        if (zone is null) return NotFound();
        db.DeliveryZones.Remove(zone);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }
}
