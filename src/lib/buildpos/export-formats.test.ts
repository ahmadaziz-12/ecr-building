import { describe, expect, it } from "vitest";
import { buildXlsx } from "./export-xlsx";
import { buildPdf, buildPdfDoc, pdfSafeText } from "./export-pdf";

// Both exporters write their file formats by hand rather than through a library, so the structural
// invariants a reader depends on are pinned here: an .xlsx that is a valid ZIP whose sheet XML parses
// and types its numeric cells, and a PDF whose cross-reference offsets actually point at the objects
// they claim. A wrong xref offset produces a file that looks fine byte-for-byte and that no reader
// will open, which is exactly the kind of break no eyeball review catches.

const columns = ["SKU", "Product", "Qty", "Loss Value", "Reason"];
const rows: (string | number)[][] = [
  ["CEM-001", "Portland Cement 50kg", 12, 240.5, 'Crushed <pallet> & "corner"'],
  ["STL-001", "Rebar 12mm", 0, 0, "منتج تالف"],
];

const latin1 = (bytes: Uint8Array) => {
  let out = "";
  for (const byte of bytes) out += String.fromCharCode(byte);
  return out;
};

describe("xlsx export", () => {
  it("writes a ZIP whose local headers and central directory describe the same parts", async () => {
    const bytes = new Uint8Array(await buildXlsx([{ name: "Damaged Items", columns, rows }]).arrayBuffer());
    const text = latin1(bytes);

    // PK\x03\x04 opens a local file header; PK\x05\x06 is the end-of-central-directory record.
    expect(text.startsWith("PK\x03\x04")).toBe(true);
    const eocd = text.lastIndexOf("PK\x05\x06");
    expect(eocd).toBeGreaterThan(0);

    const entryCount = bytes[eocd + 10] | (bytes[eocd + 11] << 8);
    const localHeaders = text.split("PK\x03\x04").length - 1;
    const centralHeaders = text.split("PK\x01\x02").length - 1;
    expect(entryCount).toBe(localHeaders);
    expect(entryCount).toBe(centralHeaders);
    // The five package parts plus one worksheet.
    expect(entryCount).toBe(6);

    for (const part of [
      "[Content_Types].xml", "_rels/.rels", "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml",
    ]) {
      expect(text).toContain(part);
    }
  });

  it("types numeric cells as numbers, escapes XML and keeps non-Latin text intact", async () => {
    const bytes = new Uint8Array(await buildXlsx([{ name: "Damaged Items", columns, rows }]).arrayBuffer());
    // The sheet part is stored uncompressed, so its XML is readable straight out of the archive.
    const text = new TextDecoder().decode(bytes);

    expect(text).toContain('<c r="C2" t="n"><v>12</v></c>');
    // Zero is a value, not a blank: skipping it would silently drop "no loss on this line".
    expect(text).toContain('<c r="D3" t="n"><v>0</v></c>');
    expect(text).toContain("Crushed &lt;pallet&gt; &amp; &quot;corner&quot;");
    expect(text).toContain("منتج تالف");
    expect(text).toContain('<autoFilter ref="A1:E3"/>');
  });

  it("sanitises sheet names Excel rejects", async () => {
    const bytes = new Uint8Array(await buildXlsx([{ name: "Sales/2026 [Q1]", columns: ["A"], rows: [["x"]] }]).arrayBuffer());
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('<sheet name="Sales 2026  Q1"');
  });
});

describe("pdf export", () => {
  const table = {
    title: "Damaged Goods",
    subtitle: "2 rows",
    columns: columns.map((label, i) => ({ label, align: i === 2 || i === 3 ? ("right" as const) : ("left" as const) })),
    rows: rows.map((r) => r.map((c) => (typeof c === "number" ? `${c.toFixed(2)} ر.س` : String(c)))),
  };

  it("emits a cross-reference table whose every offset lands on the object it indexes", async () => {
    const text = latin1(new Uint8Array(await buildPdf(table, "28/07/2026").arrayBuffer()));

    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);

    const startxref = Number(text.slice(text.lastIndexOf("startxref") + 9).trim().split(/\s/)[0]);
    expect(text.slice(startxref, startxref + 4)).toBe("xref");

    const xrefLines = text.slice(startxref).split("\n");
    const size = Number(xrefLines[1].trim().split(/\s+/)[1]);
    for (let obj = 1; obj < size; obj++) {
      const offset = Number(xrefLines[obj + 2].slice(0, 10));
      expect(text.slice(offset, offset + `${obj} 0 obj`.length)).toBe(`${obj} 0 obj`);
    }

    // Every content stream must declare its own true length, or readers stop mid-page.
    const lengths = [...text.matchAll(/<< \/Length (\d+) >>\nstream\n/g)];
    expect(lengths.length).toBeGreaterThan(0);
    for (const match of lengths) {
      const streamStart = match.index! + match[0].length;
      expect(text.slice(streamStart + Number(match[1]), streamStart + Number(match[1]) + 10)).toBe("\nendstream");
    }
  });

  it("paginates and repeats the column header on every page", async () => {
    const many = { ...table, rows: Array.from({ length: 90 }, (_, i) => ["SKU", `Row ${i}`, "1", "1.00", "-"]) };
    const text = latin1(new Uint8Array(await buildPdf(many, "x").arrayBuffer()));

    const pageCount = Number(/\/Type \/Pages \/Count (\d+)/.exec(text)![1]);
    expect(pageCount).toBeGreaterThan(1);
    // One column-header draw per page — the header is re-emitted rather than left on page one.
    expect(text.split("(Product) Tj").length - 1).toBe(pageCount);
    // The title block belongs to the first page only: exactly one draw at the title size. (The title
    // string itself also appears once per page as the footer label, so counting it would not show this.)
    expect(text.split("/F2 15 Tf").length - 1).toBe(1);
    // …and the footer runs on all of them.
    expect(text.split("(Page ").length - 1).toBe(pageCount);
  });

  it("still produces one readable page when the report is empty", async () => {
    const text = latin1(new Uint8Array(await buildPdf({ ...table, rows: [] }, "x").arrayBuffer()));
    expect(/\/Type \/Pages \/Count 1/.test(text)).toBe(true);
    expect(text).toContain("No rows matched the selected filters.");
  });

  it("transliterates what WinAnsi cannot set instead of corrupting the page", () => {
    // The Riyal symbol is in every money cell, so it gets a real substitution rather than a "?".
    expect(pdfSafeText("1,234.00 ر.س")).toBe("1,234.00 SAR");
    expect(pdfSafeText("120 rows — 2026")).toBe("120 rows - 2026");
    expect(pdfSafeText("“quoted”")).toBe('"quoted"');
    // A wholly Arabic run collapses to a single placeholder, not one per character.
    expect(pdfSafeText("منتج تالف")).toBe("? ?");
  });

  it("escapes the characters that would end a PDF string literal early", async () => {
    const text = latin1(new Uint8Array(await buildPdf({ ...table, title: "A (B) \\ C", rows: [] }, "x").arrayBuffer()));
    expect(text).toContain("(A \\(B\\) \\\\ C) Tj");
  });

  it("starts each panel of a multi-section report on its own page", async () => {
    // The shape an aggregate report exports as: several panels, one of them a KPI block.
    const text = latin1(new Uint8Array(await buildPdfDoc({
      title: "Sales Summary",
      subtitle: "2026-07-01 -> 2026-07-28",
      sections: [
        { heading: "Summary", columns: [{ label: "Metric" }, { label: "Value" }], rows: [["Gross Sales", "1,000.00 SAR"]] },
        { heading: "By Payment Method", columns: [{ label: "Method" }, { label: "Net" }], rows: [["Cash", "600.00"], ["Mada", "400.00"]] },
        // An empty panel must still print, or a reader cannot tell "no rows" from "panel dropped".
        { heading: "By Category", columns: [{ label: "Category" }], rows: [] },
      ],
    }, "x").arrayBuffer()));

    expect(/\/Type \/Pages \/Count 3/.test(text)).toBe(true);
    for (const heading of ["Summary", "By Payment Method", "By Category"]) {
      expect(text.split(`(${heading}) Tj`).length - 1).toBe(1);
    }
    expect(text).toContain("No rows matched the selected filters.");
    // The document title block is drawn once, on the first page only.
    expect(text.split("/F2 15 Tf").length - 1).toBe(1);
  });

  it("keeps a long panel's overflow inside its own section", async () => {
    const text = latin1(new Uint8Array(await buildPdfDoc({
      title: "Long",
      sections: [
        { heading: "Big Panel", columns: [{ label: "A" }], rows: Array.from({ length: 80 }, (_, i) => [`r${i}`]) },
        { heading: "Small Panel", columns: [{ label: "B" }], rows: [["x"]] },
      ],
    }, "x").arrayBuffer()));

    const pageCount = Number(/\/Type \/Pages \/Count (\d+)/.exec(text)![1]);
    expect(pageCount).toBeGreaterThan(2);
    // Headings appear once each — a continuation page repeats the column header, not the heading.
    expect(text.split("(Big Panel) Tj").length - 1).toBe(1);
    expect(text.split("(Small Panel) Tj").length - 1).toBe(1);
    // The column header does repeat on every page of the panel it belongs to.
    expect(text.split("(A) Tj").length - 1).toBe(pageCount - 1);
  });
});
