using EcrBuilding.Domain.Entities;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace EcrBuilding.Infrastructure.Persistence;

/// <summary>
/// Every enum in this database is stored as its member NAME (see AppDbContext.OnModelCreating), which
/// means renaming an enum member strands the old string in existing rows and the stock
/// EnumToStringConverter then throws on read — taking every endpoint that touches the table down with
/// it (this exact failure shipped once: LoyaltyTier.Standard → Bronze in Module 7).
///
/// This converter reads tolerantly: exact member name first, then the central legacy-alias map, and
/// only then a CLEAR error naming the enum and the offending value. Writing always uses current names.
/// RULE: whenever a database-stored enum member is renamed, add the old name to
/// <see cref="EnumLegacyAliases"/> AND ship a data migration normalizing stored rows (aliases keep
/// reads alive; the migration keeps WHERE-clause comparisons against the new name correct).
/// </summary>
public class LegacyTolerantEnumConverter<TEnum>() : ValueConverter<TEnum, string>(
    v => v.ToString()!,
    s => Parse(s))
    where TEnum : struct, Enum
{
    private static TEnum Parse(string stored)
    {
        // Empty cells exist wherever an enum column was ALTERed onto a table that already had rows
        // (MySQL backfills NOT NULL text columns with '') — "never set" maps to the enum's default
        // member, exactly what a freshly-constructed entity would have carried.
        if (string.IsNullOrWhiteSpace(stored)) return default;
        if (Enum.TryParse<TEnum>(stored, ignoreCase: true, out var parsed)) return parsed;
        if (EnumLegacyAliases.TryResolve(typeof(TEnum), stored, out var currentName)
            && Enum.TryParse<TEnum>(currentName, ignoreCase: true, out var aliased))
        {
            return aliased;
        }
        throw new InvalidOperationException(
            $"Database value \"{stored}\" is not a member of {typeof(TEnum).Name}. If this member was renamed, add \"{stored}\" to EnumLegacyAliases and ship a data migration normalizing the stored rows.");
    }
}

/// <summary>One central map of every database-stored enum member that has ever been renamed.</summary>
public static class EnumLegacyAliases
{
    private static readonly Dictionary<(Type EnumType, string LegacyName), string> Map = new()
    {
        // Module 7 (2026-07-25): the BRD's tier ladder calls the base tier "Bronze"; it was "Standard".
        [(typeof(LoyaltyTier), "Standard")] = nameof(LoyaltyTier.Bronze),
    };

    public static bool TryResolve(Type enumType, string legacyName, out string currentName)
    {
        if (Map.TryGetValue((enumType, legacyName), out var resolved))
        {
            currentName = resolved;
            return true;
        }
        currentName = string.Empty;
        return false;
    }
}
