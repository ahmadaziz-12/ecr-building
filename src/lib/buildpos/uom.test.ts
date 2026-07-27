import { describe, expect, it } from "vitest";
import {
  areaOf, factorToStock, formatUomConversions, parseUomConversions, sellableUoms, toStockQty, unitPriceFor,
} from "./uom";

// Module 5 (docs/BRD-GAP-IMPLEMENTATION-PLAN.md) — client-side mirror of the backend's UomMath.cs.
// The two must agree: any value asserted here matches a corresponding backend Module5UomMathTests case.
describe("UOM conversion math", () => {
  const conversions = [
    { uom: "Pallet", factorToStock: 50 },
    { uom: "Kg", factorToStock: 0.02 },
  ];

  it("offers the stock UOM plus each configured conversion as sellable units", () => {
    const options = sellableUoms("Bag", conversions);
    expect(options.map((o) => o.uom)).toEqual(["Bag", "Pallet", "Kg"]);
    expect(options[0].factorToStock).toBe(1);
  });

  it("resolves factors case-insensitively and returns null for unconfigured units", () => {
    expect(factorToStock("pallet", "Bag", conversions)).toBe(50);
    expect(factorToStock("BAG", "Bag", conversions)).toBe(1);
    expect(factorToStock("Truckload", "Bag", conversions)).toBeNull();
  });

  it("scales price and stock deduction by the factor — 1 Pallet of 20-SAR bags is 1,000 SAR / 50 bags", () => {
    expect(unitPriceFor(20, 50)).toBe(1000);
    expect(toStockQty(2, 50)).toBe(100);
    expect(toStockQty(50, 0.02)).toBe(1);
  });

  it("computes cut-to-size area at 3dp away-from-zero, including non-square shapes", () => {
    expect(areaOf(2.5, 1.2)).toBe(3);
    expect(areaOf(0.5, 4)).toBe(2);
    expect(areaOf(0.75, 0.75)).toBe(0.563); // 0.5625 rounds away from zero, matching the backend
  });
});

describe("admin conversions field parsing", () => {
  it("parses 'Uom=Factor' pairs split on semicolons, commas, or newlines", () => {
    expect(parseUomConversions("Pallet=50; Ton=20")).toEqual([
      { uom: "Pallet", factorToStock: 50 },
      { uom: "Ton", factorToStock: 20 },
    ]);
    expect(parseUomConversions("Roll=100,Kg=0.02")).toEqual([
      { uom: "Roll", factorToStock: 100 },
      { uom: "Kg", factorToStock: 0.02 },
    ]);
  });

  it("drops invalid fragments instead of failing the whole save", () => {
    expect(parseUomConversions("Pallet=50; garbage; Ton=0; =5; Box=-2")).toEqual([
      { uom: "Pallet", factorToStock: 50 },
    ]);
    expect(parseUomConversions("")).toEqual([]);
    expect(parseUomConversions(undefined)).toEqual([]);
  });

  it("round-trips through formatUomConversions for the edit-form prefill", () => {
    const conversions = [{ uom: "Pallet", factorToStock: 50 }, { uom: "Ton", factorToStock: 20 }];
    expect(parseUomConversions(formatUomConversions(conversions))).toEqual(conversions);
  });
});
