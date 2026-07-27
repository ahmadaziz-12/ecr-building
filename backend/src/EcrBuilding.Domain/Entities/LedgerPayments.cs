using EcrBuilding.Domain.Common;

namespace EcrBuilding.Domain.Entities;

// A direct settlement against a customer's AR balance (Outstanding) that isn't tied to a sale or a
// return — e.g. a B2B/contractor customer wiring in against their running account. Posts GL debit
// 1000 (Cash & Bank) / credit 1100 (Accounts Receivable) under PaymentNo, which the customer ledger
// (CustomersController.Ledger) picks up as a reference alongside their Orders/Returns.
public class CustomerPayment : BaseEntity
{
    public int CustomerId { get; set; }
    public Customer? Customer { get; set; }
    public string PaymentNo { get; set; } = string.Empty;
    public DateTime Date { get; set; } = DateTime.UtcNow;
    public decimal Amount { get; set; }
    public string Method { get; set; } = "Cash";
    public string? ReferenceNo { get; set; }
    public string? Notes { get; set; }
    public int? CreatedByUserId { get; set; }
    public User? CreatedByUser { get; set; }
}

// The mirror-image settlement against a supplier's AP balance — paying down what a PO receipt/RTS
// credit note built up. Posts GL debit 2000 (Accounts Payable) / credit 1000 (Cash & Bank) under
// PaymentNo, picked up by the existing SuppliersController.Ledger the same way PO/RTS numbers are.
public class SupplierPayment : BaseEntity
{
    public int SupplierId { get; set; }
    public Supplier? Supplier { get; set; }
    public string PaymentNo { get; set; } = string.Empty;
    public DateTime Date { get; set; } = DateTime.UtcNow;
    public decimal Amount { get; set; }
    public string Method { get; set; } = "Cash";
    public string? ReferenceNo { get; set; }
    public string? Notes { get; set; }
    public int? CreatedByUserId { get; set; }
    public User? CreatedByUser { get; set; }
}
