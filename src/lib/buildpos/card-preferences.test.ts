import { describe, expect, it } from "vitest";
import { applyCardPreference } from "./card-preferences";

type Card = { key: string; title: string };
const cards: Card[] = [
  { key: "sales", title: "Net Takings" },
  { key: "tx", title: "Transactions" },
  { key: "low", title: "Low Stock" },
];
const keyOf = (c: Card) => c.key;

describe("applyCardPreference", () => {
  it("keeps the natural order when nothing is customised", () => {
    const out = applyCardPreference(cards, keyOf, ["sales", "tx", "low"], new Set());
    expect(out.map(keyOf)).toEqual(["sales", "tx", "low"]);
  });

  it("reorders to match the stored order", () => {
    const out = applyCardPreference(cards, keyOf, ["low", "sales", "tx"], new Set());
    expect(out.map(keyOf)).toEqual(["low", "sales", "tx"]);
  });

  it("drops hidden cards", () => {
    const out = applyCardPreference(cards, keyOf, ["sales", "tx", "low"], new Set(["tx"]));
    expect(out.map(keyOf)).toEqual(["sales", "low"]);
  });

  it("ignores an order entry whose card no longer exists", () => {
    // A card removed by a later release must not leave a hole (or an undefined) in the row.
    const out = applyCardPreference(cards, keyOf, ["sales", "retired", "low"], new Set());
    expect(out.map(keyOf)).toEqual(["sales", "low"]);
  });

  it("returns nothing when every card is hidden", () => {
    const out = applyCardPreference(
      cards,
      keyOf,
      ["sales", "tx", "low"],
      new Set(["sales", "tx", "low"]),
    );
    expect(out).toEqual([]);
  });
});
