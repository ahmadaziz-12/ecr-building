import { describe, expect, it } from "vitest";
import { formatAttributes, parseAttributes } from "./attributes";

describe("product attribute field parsing", () => {
  it("parses 'Name=Value' pairs split on semicolons, commas, or newlines", () => {
    expect(parseAttributes("Grade=A36; Diameter=12mm")).toEqual([
      { name: "Grade", value: "A36" },
      { name: "Diameter", value: "12mm" },
    ]);
    expect(parseAttributes("Color=Grey,Size=Large")).toEqual([
      { name: "Color", value: "Grey" },
      { name: "Size", value: "Large" },
    ]);
  });

  it("drops blank or malformed fragments instead of failing the whole save", () => {
    expect(parseAttributes("Grade=A36; garbage; =NoName; Size=")).toEqual([
      { name: "Grade", value: "A36" },
    ]);
    expect(parseAttributes("")).toEqual([]);
    expect(parseAttributes(undefined)).toEqual([]);
  });

  it("round-trips through formatAttributes for the edit-form prefill", () => {
    const attributes = [{ name: "Grade", value: "A36" }, { name: "Diameter", value: "12mm" }];
    expect(parseAttributes(formatAttributes(attributes))).toEqual(attributes);
  });
});
