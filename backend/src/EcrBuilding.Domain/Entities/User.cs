using EcrBuilding.Domain.Common;
using EcrBuilding.Domain.Enums;

namespace EcrBuilding.Domain.Entities;

public class User : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string? PinHash { get; set; }
    public bool BiometricEnabled { get; set; }
    public int RoleId { get; set; }
    public Role? Role { get; set; }
    public int? BranchId { get; set; }
    public Branch? Branch { get; set; }
    public int? EmployeeId { get; set; }
    public UserStatus Status { get; set; } = UserStatus.Active;
    public string PreferredLocale { get; set; } = "en";
    public DateTime? LastLoginAt { get; set; }

    public ICollection<RefreshToken> RefreshTokens { get; set; } = new List<RefreshToken>();
    public ICollection<UserPermissionOverride> PermissionOverrides { get; set; } = new List<UserPermissionOverride>();
}
