import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CurrencyText, Money, SARIcon, fmtAmount, hasCurrency } from "./currency";

// The contract the whole app leans on: formatters keep emitting the plain text token (so CSV,
// receipts and ZATCA payloads are unchanged), and the render layer swaps that token for the symbol.
describe("CurrencyText", () => {
  it("replaces every currency spelling with the SAR symbol", () => {
    for (const token of ["ر.س", "﷼", "SAR"]) {
      const { container, unmount } = render(<CurrencyText value={`1,250.00 ${token}`} />);
      expect(container.textContent).toBe("1,250.00 ");
      expect(container.querySelector("svg[aria-label='SAR']")).toBeInTheDocument();
      unmount();
    }
  });

  it("handles a currency token in the middle of a sentence", () => {
    const { container } = render(
      <CurrencyText value="Once a cart reaches 5000 ر.س, a discount applies." />,
    );
    expect(container.textContent).toBe("Once a cart reaches 5000 , a discount applies.");
    expect(container.querySelectorAll("svg")).toHaveLength(1);
  });

  it("replaces multiple tokens in one string", () => {
    const { container } = render(<CurrencyText value="100.00 ر.س / 250.00 ر.س" />);
    expect(container.querySelectorAll("svg")).toHaveLength(2);
  });

  it("leaves non-money text completely alone", () => {
    const { container } = render(<CurrencyText value="Riyadh Main Yard — Till 1" />);
    expect(container.textContent).toBe("Riyadh Main Yard — Till 1");
    expect(container.querySelector("svg")).toBeNull();
  });

  it("does not match SAR inside a longer word", () => {
    // "SARIcon" or a SKU like "SARAH-01" must not be mangled into a currency symbol.
    const { container } = render(<CurrencyText value="SARAH-01 pallet" />);
    expect(container.textContent).toBe("SARAH-01 pallet");
    expect(container.querySelector("svg")).toBeNull();
  });

  it("is a pure predicate — repeated calls agree", () => {
    // The token regex is module-level and global; a leaked lastIndex would make every other call lie.
    expect(hasCurrency("10 ر.س")).toBe(true);
    expect(hasCurrency("10 ر.س")).toBe(true);
    expect(hasCurrency("plain")).toBe(false);
    expect(hasCurrency("plain")).toBe(false);
  });
});

describe("Money / fmtAmount", () => {
  it("formats to two decimals with thousands separators by default", () => {
    expect(fmtAmount(1234.5)).toBe("1,234.50");
    expect(fmtAmount(1234.5, 0)).toBe("1,235");
  });

  it("renders the amount next to the symbol", () => {
    render(<Money amount={99} />);
    expect(screen.getByText("99.00")).toBeInTheDocument();
  });
});

describe("SARIcon", () => {
  it("is labelled for assistive tech", () => {
    const { container } = render(<SARIcon />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-label", "SAR");
    expect(svg).toHaveAttribute("role", "img");
  });
});
