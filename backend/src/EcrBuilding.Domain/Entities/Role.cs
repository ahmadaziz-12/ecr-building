using EcrBuilding.Domain.Common;
using EcrBuilding.Domain.Enums;

namespace EcrBuilding.Domain.Entities;

public class Role : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool IsSystem { get; set; }
    public decimal ApprovalCap { get; set; }
    public EntityStatus Status { get; set; } = EntityStatus.Active;

    // POS operational authorization ceilings (BRD §10.1's Cashier/Senior Cashier/Supervisor/Store
    // Manager/System Admin ladder). Null on a decimal ceiling means "no cap" (e.g. a Store Manager's
    // DiscountCeilingPercent is null because the BRD gives Manager an unlimited discount tier above
    // Supervisor's 15%). These are read by checkout (discounts), returns, and void authorization —
    // not tied to a specific role name, so any role (including the pre-existing Owner/Admin/Branch
    // Manager/etc. roster) can carry them.
    public decimal? DiscountCeilingPercent { get; set; }
    public decimal? SurplusReturnCeilingAmount { get; set; }
    public bool CanAuthorizeStandardReturnWithoutReceipt { get; set; }
    public bool CanOverrideItemPrice { get; set; }
    public bool CanAuthorizeDamagedReturns { get; set; }
    public bool CanVoidTransactions { get; set; }
    public bool CanViewXReport { get; set; }
    public bool CanViewZReport { get; set; }
    public bool CanConfigureReturnRulesAndFees { get; set; }
    public bool CanManagePriceListAndUsers { get; set; }
    public bool CanManageSystemConfiguration { get; set; }

    public ICollection<RolePermission> Permissions { get; set; } = new List<RolePermission>();
    public ICollection<User> Users { get; set; } = new List<User>();
}
