namespace EcrBuilding.Application.Abstractions;

public record GlLine(string AccountCode, decimal Debit, decimal Credit);

// Every domain event that moves money (a sale, an approved expense, a received PO, a completed
// return) posts through here so the ledger always balances — debits must equal credits per entry.
public interface IGlPostingService
{
    Task PostAsync(string reference, string description, IEnumerable<GlLine> lines, CancellationToken cancellationToken = default);
}
