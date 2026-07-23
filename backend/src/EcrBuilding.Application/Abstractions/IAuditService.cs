using EcrBuilding.Domain.Enums;

namespace EcrBuilding.Application.Abstractions;

public interface IAuditService
{
    Task LogAsync(
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
        CancellationToken cancellationToken = default);
}
