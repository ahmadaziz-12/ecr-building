using EcrBuilding.Application.Abstractions;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Infrastructure.Services;

public class GlPostingService(AppDbContext db) : IGlPostingService
{
    public async Task PostAsync(string reference, string description, IEnumerable<GlLine> lines, CancellationToken cancellationToken = default)
    {
        var lineList = lines.ToList();
        var totalDebit = lineList.Sum(l => l.Debit);
        var totalCredit = lineList.Sum(l => l.Credit);
        if (Math.Round(totalDebit - totalCredit, 2) != 0)
        {
            throw new InvalidOperationException($"Journal entry for '{reference}' is not balanced: debit {totalDebit} != credit {totalCredit}.");
        }

        var codes = lineList.Select(l => l.AccountCode).Distinct().ToList();
        var accounts = await db.Accounts.Where(a => codes.Contains(a.Code)).ToDictionaryAsync(a => a.Code, cancellationToken);

        var entry = new JournalEntry { Reference = reference, Description = description };
        foreach (var line in lineList)
        {
            if (!accounts.TryGetValue(line.AccountCode, out var account))
            {
                throw new InvalidOperationException($"Unknown GL account code '{line.AccountCode}'.");
            }
            entry.Lines.Add(new JournalLine { AccountId = account.Id, Debit = line.Debit, Credit = line.Credit, Memo = line.Memo });
        }

        db.JournalEntries.Add(entry);
        await db.SaveChangesAsync(cancellationToken);
    }
}
