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

public enum CashMovementDirection { In = 0, Out = 1 }

// One row per cash-in/cash-out event on a shift — CashierShift.CashIn/CashOut are just the running
// totals used by ExpectedCash; this is the itemized trail that lets a till reconciliation drill down
// into WHICH events made up that total (till-safe drop, change fund top-up, petty cash, etc.), the
// same way StockMovement itemizes what only used to be an aggregate stock count.
public class CashMovement : BaseEntity
{
    public int CashierShiftId { get; set; }
    public CashierShift? CashierShift { get; set; }
    public CashMovementDirection Direction { get; set; }
    public decimal Amount { get; set; }
    public string Reason { get; set; } = string.Empty;
    public int? CreatedByUserId { get; set; }
    public User? CreatedByUser { get; set; }
}
