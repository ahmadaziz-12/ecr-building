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

    [HttpPut("{id:int}")]
    [RequireModule(ModuleArea.Delivery, AccessLevel.Edit)]
    public async Task<ActionResult<DriverDto>> Update(int id, UpdateDriverRequest request, CancellationToken ct)
    {
        var driver = await db.Drivers.Include(d => d.Branch).FirstOrDefaultAsync(d => d.Id == id, ct);
        if (driver is null) return NotFound();

        if (request.VehicleId is not null && !await db.Vehicles.AnyAsync(v => v.Id == request.VehicleId, ct))
        {
            return BadRequest(new { error = $"Unknown vehicle {request.VehicleId}." });
        }

        var old = Map(driver);
        driver.Name = request.Name;
        driver.BranchId = request.BranchId;
        driver.Mobile = request.Mobile;
        driver.License = request.License;
        driver.LicenseExpiry = request.LicenseExpiry;
        driver.VehicleId = request.VehicleId;
        driver.Status = Enum.Parse<DriverStatus>(request.Status);
        await db.SaveChangesAsync(ct);
        await db.Entry(driver).Reference(d => d.Branch).LoadAsync(ct);

        await audit.LogAsync("delivery", "DRIVER_UPDATED", id.ToString(), oldValue: old, newValue: Map(driver), cancellationToken: ct);
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

    [HttpPut("{id:int}")]
    [RequireModule(ModuleArea.Delivery, AccessLevel.Edit)]
    public async Task<ActionResult<VehicleDto>> Update(int id, UpdateVehicleRequest request, CancellationToken ct)
    {
        var vehicle = await db.Vehicles.Include(v => v.Branch).FirstOrDefaultAsync(v => v.Id == id, ct);
        if (vehicle is null) return NotFound();

        var old = Map(vehicle);
        vehicle.Registration = request.Registration;
        vehicle.Type = Enum.Parse<VehicleType>(request.Type);
        vehicle.BranchId = request.BranchId;
        vehicle.CapacityTons = request.CapacityTons;
        vehicle.Status = Enum.Parse<VehicleStatus>(request.Status);
        await db.SaveChangesAsync(ct);
        await db.Entry(vehicle).Reference(v => v.Branch).LoadAsync(ct);

        await audit.LogAsync("delivery", "VEHICLE_UPDATED", id.ToString(), oldValue: old, newValue: Map(vehicle), cancellationToken: ct);
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
