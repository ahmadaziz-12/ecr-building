using System.Text.Json;
using EcrBuilding.Application.Abstractions;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Domain.Enums;
using EcrBuilding.Infrastructure.Persistence;

namespace EcrBuilding.Infrastructure.Services;

public class AuditService(AppDbContext db) : IAuditService
{
    public async Task LogAsync(
        string module,
        string @event,
        string? recordId = null,
        int? userId = null,
        string? userName = null,
        int? employeeId = null,
        int? branchId = null,
        int? deviceId = null,
        object? oldValue = null,
        object? newValue = null,
        string? reason = null,
        AuditSeverity severity = AuditSeverity.Info,
        CancellationToken cancellationToken = default)
    {
        db.AuditLogs.Add(new AuditLog
        {
            Module = module,
            Event = @event,
            RecordId = recordId,
            UserId = userId,
            UserName = userName,
            EmployeeId = employeeId,
            BranchId = branchId,
            DeviceId = deviceId,
            OldValue = oldValue is null ? null : JsonSerializer.Serialize(oldValue),
            NewValue = newValue is null ? null : JsonSerializer.Serialize(newValue),
            Reason = reason,
            Severity = severity,
        });
        await db.SaveChangesAsync(cancellationToken);
    }
}
