using EcrBuilding.Domain.Common;
using EcrBuilding.Domain.Enums;

namespace EcrBuilding.Domain.Entities;

public class Kpi : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string Owner { get; set; } = string.Empty;
    // Maps to a formula computed live in InsightsController (e.g. "NetSalesMtd", "GrossMarginPct").
    public string MetricKey { get; set; } = string.Empty;
    public decimal Target { get; set; }
    public string Period { get; set; } = "MTD";
}

public class ReportDefinition : BaseEntity
{
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string Owner { get; set; } = string.Empty;
    public string Frequency { get; set; } = "Daily";
    public string Format { get; set; } = "PDF/XLSX";
    public EntityStatus Status { get; set; } = EntityStatus.Active;
}

public class BiFeed : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Source { get; set; } = string.Empty;
    public string Destination { get; set; } = string.Empty;
    public string Frequency { get; set; } = "Every 30 min";
    public DateTime LastRun { get; set; } = DateTime.UtcNow;
    public int Rows { get; set; }
    public int Failed { get; set; }
    public string Latency { get; set; } = "5s";
    public string Status { get; set; } = "Healthy";
}
