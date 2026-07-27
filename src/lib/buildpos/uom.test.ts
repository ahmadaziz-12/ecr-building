import { describe, expect, it } from "vitest";
import {
  areaOf, factorToStock, formatCutToSizeMode, formatUomConversions, lengthOf, parseCutToSizeMode,
  parseUomConversions, sellableUoms, toStockQty, unitPriceFor, volumeOf,
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

  it("computes cut-to-size length and volume the same way as the backend", () => {
    expect(lengthOf(4.5)).toBe(4.5);
    expect(lengthOf(0.5625)).toBe(0.563);
    expect(volumeOf(2, 1.5, 2)).toBe(6);
    expect(volumeOf(0.75, 0.75, 1)).toBe(0.563);
  });
});

describe("cut-to-size mode select", () => {
  it("maps each option to the flag + unit the backend expects", () => {
    expect(parseCutToSizeMode("Not cut-to-size")).toEqual({ isCutToSize: false, cutToSizeUnit: "Area" });
    expect(parseCutToSizeMode(undefined)).toEqual({ isCutToSize: false, cutToSizeUnit: "Area" });
    expect(parseCutToSizeMode("Length (linear m)")).toEqual({ isCutToSize: true, cutToSizeUnit: "Length" });
    expect(parseCutToSizeMode("Area (m²)")).toEqual({ isCutToSize: true, cutToSizeUnit: "Area" });
    expect(parseCutToSizeMode("Volume (m³)")).toEqual({ isCutToSize: true, cutToSizeUnit: "Volume" });
  });

  it("round-trips through formatCutToSizeMode for the edit-form prefill", () => {
    expect(formatCutToSizeMode(false, "Area")).toBe("Not cut-to-size");
    expect(formatCutToSizeMode(true, "Length")).toBe("Length (linear m)");
    expect(formatCutToSizeMode(true, "Area")).toBe("Area (m²)");
    expect(formatCutToSizeMode(true, "Volume")).toBe("Volume (m³)");
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
