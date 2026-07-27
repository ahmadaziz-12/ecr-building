using System.Text.Json;
using System.Text.Json.Serialization;

namespace EcrBuilding.Api.Json;

// Every DateTime this API ever writes is UTC — set via DateTime.UtcNow throughout the codebase — but
// MySQL/Pomelo reads columns back with DateTimeKind.Unspecified (it has no per-column TZ concept), so
// System.Text.Json's default writer omits the "Z" suffix. A client Date parser then reads the string
// as LOCAL time, silently shifting every timestamp by the reader's UTC offset (proven live: a Riyadh
// check-in at 11:47 local, correctly stored as 08:47 UTC, displayed as "08:47" — 3 hours short of
// reality — and a BI feed's "last run" showed 5 hours stale in a UTC+5 client). SpecifyKind relabels
// the value as UTC without shifting the underlying instant (it's already numerically correct — only
// the Kind tag was lost), so the serializer correctly appends "Z" and every client parses it right.
public sealed class UtcDateTimeConverter : JsonConverter<DateTime>
{
    public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
        reader.GetDateTime();

    public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options) =>
        writer.WriteStringValue(DateTime.SpecifyKind(value, DateTimeKind.Utc));
}

public sealed class UtcNullableDateTimeConverter : JsonConverter<DateTime?>
{
    public override DateTime? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
        reader.TokenType == JsonTokenType.Null ? null : reader.GetDateTime();

    public override void Write(Utf8JsonWriter writer, DateTime? value, JsonSerializerOptions options)
    {
        if (value is null) writer.WriteNullValue();
        else writer.WriteStringValue(DateTime.SpecifyKind(value.Value, DateTimeKind.Utc));
    }
}
