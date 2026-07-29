import type { ReactNode } from "react";

// The Saudi Riyal has an official glyph, but no font we can rely on ships it (U+20C0 renders as
// tofu on Windows and most Android builds), and the legacy ﷼ / "ر.س" / "SAR" spellings are text,
// not a symbol. So the symbol is an inline SVG that inherits `currentColor` and scales with the
// surrounding font-size — the same approach the Mimony Mart app uses.

export function SARIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 28 26"
      fill="currentColor"
      className={className ?? "inline-block h-[0.85em] w-auto align-[-0.05em] mx-[0.1em]"}
      role="img"
      aria-label="SAR"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Left vertical stroke with Arabic-style curved base */}
      <path d="M4.5 1 L3.5 15 Q3 19.5 7 20 L11 20 L11 18.5 L7.5 18.5 Q5.5 18.2 5.5 15.5 L6.5 1 Z" />
      {/* Right vertical stroke */}
      <path d="M10.5 1 L9.5 18.5 L11 18.5 L12 1 Z" />
      {/* Top diagonal bar */}
      <path d="M3 9 L26 3 L26 4.8 L3 10.8 Z" />
      {/* Middle diagonal bar */}
      <path d="M3 12.5 L26 6.5 L26 8.3 L3 14.3 Z" />
      {/* Bottom diagonal bar */}
      <path d="M6 16 L26 10 L26 11.8 L6 17.8 Z" />
    </svg>
  );
}

/** The text token every formatter still emits. Kept as text so CSV/print/receipt output and the
 *  existing formatter tests stay byte-identical — only the on-screen render swaps in the symbol. */
export const SAR_TEXT = "ر.س";

// Every spelling of the currency that has ever been written into a formatted string anywhere in the
// app. `CurrencyText` swaps any of them for the symbol, so a value built in a .ts mapper (a table
// cell, a KPI value, a row-detail field) renders the same as one written directly in JSX.
const CURRENCY_TOKEN = /(ر\.س|﷼|⃀|\bSAR\b)/g;

/** True when a string contains any currency spelling — cheap guard so non-money cells skip the split. */
export function hasCurrency(value: string): boolean {
  CURRENCY_TOKEN.lastIndex = 0;
  return CURRENCY_TOKEN.test(value);
}

/**
 * Renders an already-formatted string, substituting the SAR symbol for whatever currency text it
 * contains. Use this wherever a money value arrives as a plain string (table cells, KPI values,
 * detail fields) — it is a no-op for strings with no currency in them.
 *
 * "1,250.00 ر.س" -> "1,250.00 <SARIcon/>"
 */
export function CurrencyText({ value }: { value: string }): ReactNode {
  if (!hasCurrency(value)) return value;
  const parts = value.split(CURRENCY_TOKEN);
  return parts.map((part, i) =>
    // split() with a capturing group puts the delimiters at the odd indices.
    i % 2 === 1 ? <SARIcon key={i} /> : part,
  );
}

/** Amount only — no currency at all. Pair with <SARIcon /> when composing in JSX. */
export function fmtAmount(n: number, decimals = 2): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Inline money value: 1,234.56 <SARIcon /> */
export function Money({
  amount,
  decimals = 2,
  className,
}: {
  amount: number;
  decimals?: number;
  className?: string;
}) {
  return (
    <span className={className}>
      {fmtAmount(amount, decimals)}
      <SARIcon />
    </span>
  );
}
