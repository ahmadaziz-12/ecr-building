namespace EcrBuilding.Application.Insights;

public record SalesSegmentDto(string Segment, decimal Value, decimal SharePct, int Tx, decimal AvgBasket, decimal ReturnsPct, string Trend);
public record KpiDto(int Id, string Name, string Category, string Owner, decimal Target, decimal Actual, decimal VariancePct, string Status, string Period);
public record ReportDefinitionDto(int Id, string Code, string Name, string Category, string Owner, string Frequency, string Format, string Status);
public record BiFeedDto(int Id, string Name, string Source, string Destination, string Frequency, DateTime LastRun, int Rows, int Failed, string Latency, string Status);

public record OverviewAreaDto(string Area, string Status, string Owner, string Metric, string Value, string Sla);
public record AdminOverviewDto(int ActiveUsers, int PendingApprovals, int OpenMaintenanceTickets, int CriticalAuditEvents24h, int ComplianceOverdue, IReadOnlyList<OverviewAreaDto> Areas);
