using EcrBuilding.Domain.Common;

namespace EcrBuilding.Domain.Entities;

public enum CashierShiftStatus { Open = 0, NeedsReview = 1, Closed = 2 }

public class CashierShift : BaseEntity
{
    public int TerminalId { get; set; }
    public Terminal? Terminal { get; set; }
    public int CashierUserId { get; set; }
    public User? Cashier { get; set; }
    public DateTime OpenedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ClosedAt { get; set; }
    public decimal OpeningFloat { get; set; }
    public decimal CashSales { get; set; }
    public decimal CashIn { get; set; }
    public decimal CashOut { get; set; }
    public decimal ExpectedCash => OpeningFloat + CashSales + CashIn - CashOut;
    public decimal? CountedCash { get; set; }
    public decimal? Variance => CountedCash is null ? null : CountedCash - ExpectedCash;
    public CashierShiftStatus Status { get; set; } = CashierShiftStatus.Open;
}
