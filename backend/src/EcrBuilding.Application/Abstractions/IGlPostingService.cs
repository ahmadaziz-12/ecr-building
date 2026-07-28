namespace EcrBuilding.Application.Abstractions;

// Memo is a plain-language reason for THIS line specifically (e.g. "VAT reversal") — optional, but
// every call site should set one wherever a line's purpose isn't obvious from the account name alone.
public record GlLine(string AccountCode, decimal Debit, decimal Credit, string? Memo = null);

// Every domain event that moves money (a sale, an approved expense, a received PO, a completed
// return) posts through here so the ledger always balances — debits must equal credits per entry.
public interface IGlPostingService
{
    Task PostAsync(string reference, string description, IEnumerable<GlLine> lines, CancellationToken cancellationToken = default);
}
