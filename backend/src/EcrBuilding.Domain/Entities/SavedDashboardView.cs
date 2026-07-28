using EcrBuilding.Domain.Common;

namespace EcrBuilding.Domain.Entities;

// A user's saved dashboard filter combination — server-persisted so it follows them across
// devices/browsers, unlike the per-pathname localStorage "views" ModulePage.tsx uses elsewhere.
public class SavedDashboardView : BaseEntity
{
    public int UserId { get; set; }
    public User? User { get; set; }
    public string Name { get; set; } = string.Empty;
    public string FiltersJson { get; set; } = "{}";
}
