namespace EcrBuilding.Application.Insights;

public record SalesSegmentDto(string Segment, decimal Value, decimal SharePct, int Tx, decimal AvgBasket, decimal ReturnsPct, string Trend);
public record KpiDto(int Id, string Name, string Category, string Owner, decimal Target, decimal Actual, decimal VariancePct, string Status, string Period);
public record UpdateKpiTargetRequest(decimal Target);
public record ReportDefinitionDto(int Id, string Code, string Name, string Category, string Owner, string Frequency, string Format, string Status);
public record BiFeedDto(int Id, string Name, string Source, string Destination, string Frequency, DateTime LastRun, int Rows, int Failed, string Latency, string Status);

public record OverviewAreaDto(string Area, string Status, string Owner, string Metric, string Value, string Sla);
public record AdminOverviewDto(int ActiveUsers, int PendingApprovals, int OpenMaintenanceTickets, int CriticalAuditEvents24h, int ComplianceOverdue, IReadOnlyList<OverviewAreaDto> Areas);

public record SavedDashboardViewDto(int Id, string Name, string FiltersJson, DateTime CreatedAt);
// FiltersJson is opaque to the server — the frontend owns its own filter-state shape (currently
// {values: Record<string,string[]>, dateRange}) and this just round-trips it verbatim, so a future
// frontend filter-shape change (already happened once) never needs a matching backend change.
public record CreateSavedDashboardViewRequest(string Name, string FiltersJson);
