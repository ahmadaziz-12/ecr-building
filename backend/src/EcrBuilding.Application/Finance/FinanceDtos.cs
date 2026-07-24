namespace EcrBuilding.Application.Finance;

public record ExpenseDto(int Id, string ExpenseNo, DateTime Date, int BranchId, string BranchName, string Category, string Description, string? Vendor, decimal Amount, decimal Vat, string Method, string Status, bool Reconciled);
public record CreateExpenseRequest(DateTime Date, int BranchId, string Category, string Description, string? Vendor, decimal Amount, decimal Vat, string Method);
public record UpdateExpenseStatusRequest(string Status, int? ApproverUserId);

public record TaxCodeDto(int Id, string Code, string Name, string Type, decimal Rate, string AppliesTo, DateTime EffectiveFrom, string? GlAccountCode, string Status);
public record UpsertTaxCodeRequest(string Code, string Name, string Type, decimal Rate, string AppliesTo, DateTime EffectiveFrom, string? GlAccountCode);

public record ReturnLineDto(int ProductId, string Sku, string ProductName, decimal Qty, decimal Amount);
public record ReturnDto(int Id, string ReturnNo, int? OrderId, string? OrderNo, int? CustomerId, string CustomerName, string Type, string Reason, decimal TotalAmount, string? ApprovedByName, string Status, DateTime CreatedAt, IReadOnlyList<ReturnLineDto> Lines);
public record ReturnLineInput(int ProductId, decimal Qty, decimal Amount);
public record CreateReturnRequest(int? OrderId, int? CustomerId, string Type, string Reason, List<ReturnLineInput> Lines);
public record ApproveReturnRequest(int BranchId);

public record AccountDto(int Id, string Code, string Name, string Type, decimal Balance);
public record JournalLineDto(string AccountCode, string AccountName, decimal Debit, decimal Credit);
public record JournalEntryDto(int Id, DateTime Date, string Reference, string Description, IReadOnlyList<JournalLineDto> Lines);
