using EcrBuilding.Domain.Common;

namespace EcrBuilding.Domain.Entities;

// A cashier's "Hold" — parked in the database (not sessionStorage) so it survives across
// terminals/tabs and shows up for any cashier at the branch, per the plan's "no localStorage" rule.
public class ParkedSale : BaseEntity
{
    public string TicketNo { get; set; } = string.Empty;
    public int BranchId { get; set; }
    public Branch? Branch { get; set; }
    public int? TerminalId { get; set; }
    public Terminal? Terminal { get; set; }
    public int CashierUserId { get; set; }
    public User? Cashier { get; set; }
    public int? CustomerId { get; set; }
    public Customer? Customer { get; set; }
    public string? Notes { get; set; }

    public ICollection<ParkedSaleLine> Lines { get; set; } = new List<ParkedSaleLine>();
}

public class ParkedSaleLine
{
    public int Id { get; set; }
    public int ParkedSaleId { get; set; }
    public ParkedSale? ParkedSale { get; set; }
    public int ProductId { get; set; }
    public Product? Product { get; set; }
    public decimal Qty { get; set; }
}
