// Real .xlsx export with no dependency.
//
// An .xlsx file is a ZIP of a handful of XML parts, so the whole format is reachable from a browser
// with a ZIP writer and some string building. The alternative — renaming a CSV or an HTML table to
// .xls — makes Excel show a "the file format doesn't match the extension" warning on every open and
// loses number/date typing, which is the entire reason to export to Excel rather than CSV.
//
// Numbers are written as typed cells (`t="n"`), so totals, sorting and pivot tables work on the
// result; everything else goes out as an inline string. Entries are STORED (uncompressed) rather
// than deflated: browsers have no synchronous deflate primitive, and a report of a few thousand rows
// is small enough that compression buys nothing worth pulling in a library for.

export type XlsxCell = string | number | null | undefined;

export type XlsxSheet = {
  /** Sheet tab name. Excel forbids : \ / ? * [ ] and caps the name at 31 characters. */
  name: string;
  columns: string[];
  rows: XlsxCell[][];
};

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
};

function xml(value: string): string {
  return value
    // XML 1.0 forbids most control characters outright — a stray 0x00 from a text column would make
    // the whole workbook unreadable rather than just that cell.
    // Matching control characters is the point here, so no-control-regex is backwards for this line.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);
}

/** Excel column label: 0 → A, 25 → Z, 26 → AA. */
function colName(index: number): string {
  let name = "";
  for (let n = index; n >= 0; n = Math.floor(n / 26) - 1) name = String.fromCharCode(65 + (n % 26)) + name;
  return name;
}

function safeSheetName(name: string, fallback: string): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31);
  return cleaned || fallback;
}

function cellXml(cell: XlsxCell, ref: string): string {
  if (cell === null || cell === undefined || cell === "") return "";
  if (typeof cell === "number") {
    // NaN/Infinity have no numeric representation in the format; fall through to text so the export
    // shows what went wrong instead of producing a workbook Excel refuses to open.
    if (Number.isFinite(cell)) return `<c r="${ref}" t="n"><v>${cell}</v></c>`;
    return `<c r="${ref}" t="inlineStr"><is><t>${xml(String(cell))}</t></is></c>`;
  }
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(cell)}</t></is></c>`;
}

function sheetXml(sheet: XlsxSheet): string {
  const header = sheet.columns
    .map((label, i) => `<c r="${colName(i)}1" t="inlineStr" s="1"><is><t>${xml(label)}</t></is></c>`)
    .join("");
  const body = sheet.rows
    .map((row, r) => {
      const cells = row.map((cell, i) => cellXml(cell, `${colName(i)}${r + 2}`)).join("");
      return `<row r="${r + 2}">${cells}</row>`;
    })
    .join("");
  // Column widths are estimated from the header and the first 200 rows: measuring every row of a
  // 50k-row export costs more than the tidier columns are worth, and 200 rows is enough to catch the
  // long product names.
  const sample = sheet.rows.slice(0, 200);
  const cols = sheet.columns
    .map((label, i) => {
      const widest = sample.reduce((w, row) => Math.max(w, String(row[i] ?? "").length), label.length);
      return `<col min="${i + 1}" max="${i + 1}" width="${Math.min(60, Math.max(9, widest + 2))}" customWidth="1"/>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${cols}</cols><sheetData><row r="1">${header}</row>${body}</sheetData><autoFilter ref="A1:${colName(Math.max(0, sheet.columns.length - 1))}${sheet.rows.length + 1}"/></worksheet>`;
}

// ————————————————————————— ZIP writer —————————————————————————

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

type ZipEntry = { name: string; bytes: Uint8Array };

/**
 * Minimal ZIP (STORE method, no data descriptors, no Zip64). Writes local headers, then the central
 * directory, then the end-of-central-directory record — the three structures every unzip
 * implementation needs and the only ones a small archive requires.
 */
function zip(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  const u16 = (n: number) => [n & 0xff, (n >>> 8) & 0xff];
  const u32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.bytes);
    const size = entry.bytes.length;

    // Local file header. Version 20, no flags, method 0 (stored), zeroed DOS timestamp — the
    // archive is generated on the fly and has no meaningful mtime to record.
    const local = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(size), ...u32(size), ...u16(name.length), ...u16(0),
    ]);
    chunks.push(local, name, entry.bytes);

    central.push(new Uint8Array([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(size), ...u32(size), ...u16(name.length),
      ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset),
    ]), name);

    offset += local.length + name.length + size;
  }

  const centralSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(entries.length), ...u16(entries.length),
    ...u32(centralSize), ...u32(offset), ...u16(0),
  ]);

  return new Blob([...chunks, ...central, end] as BlobPart[], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Builds the workbook blob. Split out from the download so it can be asserted on in tests. */
export function buildXlsx(sheets: XlsxSheet[]): Blob {
  const encoder = new TextEncoder();
  const used = sheets.length > 0 ? sheets : [{ name: "Sheet1", columns: [], rows: [] }];
  const names = used.map((s, i) => safeSheetName(s.name, `Sheet${i + 1}`));

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${used
    .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
    .join("")}</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names
    .map((name, i) => `<sheet name="${xml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join("")}</sheets></workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${used
    .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
    .join("")}<Relationship Id="rId${used.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

  // Two styles only: the default, and style index 1 (bold on a light fill) for the header row.
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F7"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`;

  const parts: ZipEntry[] = [
    { name: "[Content_Types].xml", bytes: encoder.encode(contentTypes) },
    { name: "_rels/.rels", bytes: encoder.encode(rootRels) },
    { name: "xl/workbook.xml", bytes: encoder.encode(workbook) },
    { name: "xl/_rels/workbook.xml.rels", bytes: encoder.encode(workbookRels) },
    { name: "xl/styles.xml", bytes: encoder.encode(styles) },
    ...used.map((sheet, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      bytes: encoder.encode(sheetXml({ ...sheet, name: names[i] })),
    })),
  ];

  return zip(parts);
}

/** Downloads `sheets` as a single .xlsx workbook, one tab per sheet. */
export function exportToXlsx(filename: string, sheets: XlsxSheet[]) {
  download(buildXlsx(sheets), filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}
