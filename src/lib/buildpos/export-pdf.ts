// Real PDF export with no dependency: a landscape A4 table document, paginated, with a repeating
// header row and page numbers.
//
// The alternative — opening a print window and letting the browser's "Save as PDF" do it — produces
// a file whose margins, headers and page size depend on whatever the operator last printed to, and
// cannot be attached to an email straight out of the report. This writes the file itself, so the same
// report always exports the same document.
//
// TEXT ENCODING: the document uses the base-14 Helvetica faces, which every reader has built in and
// which cost no embedded font bytes. They are WinAnsi-encoded, so they cannot render Arabic script.
// Report data is sourced from the English name columns (NameEn) and the SAR symbol is transliterated
// to "SAR", but free-text fields (return reasons, delivery notes) typed in Arabic degrade to "?" in
// the PDF. Those fields survive intact in the CSV and Excel exports, which are UTF-8 — so the choice
// here is a self-contained PDF for Latin data rather than an embedded-font dependency for all of it.

export type PdfColumn = { label: string; align?: "left" | "right" | "center" };

export type PdfTable = {
  title: string;
  subtitle?: string;
  columns: PdfColumn[];
  rows: string[][];
  /** Shown bottom-left on every page; defaults to the title. */
  footerLabel?: string;
};

/** One table inside a multi-panel document — an aggregate report's KPI block, or one of its cuts. */
export type PdfSection = {
  heading?: string;
  /** One line under the heading: what the panel is, or how to read it. */
  note?: string;
  columns: PdfColumn[];
  rows: string[][];
};

/**
 * A report made of several panels (Sales Summary's five cuts, the VAT return's rate/branch/period
 * tables). Each section starts on a fresh page, so a reader can hand one panel to someone without
 * the previous one bleeding into it.
 */
export type PdfDoc = {
  title: string;
  subtitle?: string;
  footerLabel?: string;
  sections: PdfSection[];
};

// ————————————————————————— Text metrics —————————————————————————

// Helvetica advance widths (AFM, thousandths of an em) for ASCII 32–126. Real metrics rather than an
// average character width: with an average, a column of 20-character product names and a column of
// eight-digit amounts get the same estimate, and every numeric column ends up either clipped or
// swimming in whitespace.
const HELVETICA_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

/** Helvetica-Bold runs about 8% wider than the regular face; headers are truncated anyway. */
const BOLD_FACTOR = 1.08;

function textWidth(text: string, size: number, bold = false): number {
  let mils = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    mils += code >= 32 && code <= 126 ? HELVETICA_WIDTHS[code - 32] : 556;
  }
  return (mils / 1000) * size * (bold ? BOLD_FACTOR : 1);
}

// Characters the app produces that WinAnsi cannot carry, mapped to something a reader can set. The
// Riyal symbol appears in every money cell, so leaving it to the "?" fallback would put a question
// mark beside every figure in the document.
const TRANSLITERATIONS: [RegExp, string][] = [
  [/ر\.?س/g, "SAR"],
  [/[‘’‛]/g, "'"],
  [/[“”]/g, '"'],
  [/[–—―]/g, "-"],
  [/…/g, "..."],
  [/[\u00A0\u2007\u202F]/g, " "],
  [/[•·]/g, "-"],
  [/←/g, "<-"],
  [/→/g, "->"],
];

/** Reduces a string to what the base-14 WinAnsi faces can actually set. */
export function pdfSafeText(value: string): string {
  let out = value;
  for (const [pattern, replacement] of TRANSLITERATIONS) out = out.replace(pattern, replacement);
  // One "?" per unrenderable run, not per character: a wholly Arabic cell should read as a single
  // placeholder, not as a row of twelve question marks.
  return out.replace(/[^ -~¡-ÿ]+/g, "?");
}

function truncate(text: string, maxWidth: number, size: number, bold = false): string {
  if (textWidth(text, size, bold) <= maxWidth) return text;
  const ellipsis = "...";
  let end = text.length;
  while (end > 0 && textWidth(text.slice(0, end) + ellipsis, size, bold) > maxWidth) end--;
  return end <= 0 ? "" : text.slice(0, end) + ellipsis;
}

/** Escapes a string for a PDF literal and encodes it as Latin-1 bytes. */
function pdfString(text: string): string {
  return pdfSafeText(text).replace(/([\\()])/g, "\\$1");
}

// ————————————————————————— Layout —————————————————————————

const PAGE = { width: 842, height: 595, margin: 28 };
const FONT = { header: 7.5, body: 7, title: 15, subtitle: 8.5, footer: 7 };
const ROW_HEIGHT = 13;
const CELL_PAD = 4;

type PageLayout = {
  sectionIndex: number;
  rows: string[][];
  /** Row offset within the section, so zebra striping stays continuous across a page break. */
  startIndex: number;
  withTitleBlock: boolean;
  withHeading: boolean;
};
type Layout = { widths: number[][]; pages: PageLayout[] };

function titleBlockHeight(doc: PdfDoc): number {
  return FONT.title + 14 + (doc.subtitle ? 11 : 0) + 16;
}

function headingHeight(section: PdfSection): number {
  return (section.heading ? 15 : 0) + (section.note ? 11 : 0);
}

function columnWidths(section: PdfSection): number[] {
  const available = PAGE.width - PAGE.margin * 2;

  // Natural width per column from the header and a sample of rows, then scaled to the page. Sampling
  // rather than measuring all of them keeps a 50k-row export from spending its time on metrics.
  const sample = section.rows.slice(0, 300);
  const natural = section.columns.map((col, i) => {
    const header = textWidth(pdfSafeText(col.label), FONT.header, true);
    const widest = sample.reduce(
      (w, row) => Math.max(w, textWidth(pdfSafeText(row[i] ?? ""), FONT.body)),
      header,
    );
    return Math.min(widest, 160) + CELL_PAD * 2;
  });

  const total = natural.reduce((s, w) => s + w, 0) || 1;
  // Never below a legible minimum: a 30-column report scaled purely proportionally gives the short
  // columns four points each, which renders as a vertical smear of ellipses.
  const minWidth = 26;
  let widths = natural.map((w) => Math.max(minWidth, (w / total) * available));
  const scaled = widths.reduce((s, w) => s + w, 0);
  if (scaled > available) {
    // The minimums pushed it over the page: take the excess back off the columns that have slack.
    const slack = widths.map((w) => Math.max(0, w - minWidth));
    const slackTotal = slack.reduce((s, w) => s + w, 0);
    const excess = scaled - available;
    if (slackTotal > 0) {
      widths = widths.map((w, i) => w - (slack[i] / slackTotal) * excess);
    } else {
      widths = widths.map((w) => (w / scaled) * available);
    }
  }
  return widths;
}

function layout(doc: PdfDoc): Layout {
  const widths = doc.sections.map(columnWidths);
  const pages: PageLayout[] = [];

  doc.sections.forEach((section, sectionIndex) => {
    let index = 0;
    // Every section gets at least one page, so an empty panel prints as "no rows" rather than
    // vanishing and leaving the reader to wonder whether it was filtered out or never ran.
    do {
      const withTitleBlock = pages.length === 0;
      const withHeading = index === 0;
      const reserved =
        (withTitleBlock ? titleBlockHeight(doc) : 0) + (withHeading ? headingHeight(section) : 0);
      const capacity = Math.max(
        1,
        Math.floor((PAGE.height - PAGE.margin * 2 - reserved - ROW_HEIGHT - 14) / ROW_HEIGHT),
      );
      pages.push({
        sectionIndex,
        rows: section.rows.slice(index, index + capacity),
        startIndex: index,
        withTitleBlock,
        withHeading,
      });
      index += capacity;
    } while (index < section.rows.length);
  });

  return { widths, pages };
}

// ————————————————————————— Content streams —————————————————————————

function contentStream(doc: PdfDoc, l: Layout, pageIndex: number, pageCount: number, generatedAt: string): string {
  const page = l.pages[pageIndex];
  const section = doc.sections[page.sectionIndex];
  const widths = l.widths[page.sectionIndex];
  const ops: string[] = [];
  const left = PAGE.margin;
  const right = PAGE.width - PAGE.margin;
  let y = PAGE.height - PAGE.margin;

  const show = (text: string, x: number, baseline: number, size: number, bold: boolean, gray = 0) => {
    ops.push(
      `BT ${gray} g /${bold ? "F2" : "F1"} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${baseline.toFixed(2)} Tm (${pdfString(text)}) Tj ET`,
    );
  };

  if (page.withTitleBlock) {
    y -= FONT.title;
    show(doc.title, left, y, FONT.title, true);
    y -= 14;
    if (doc.subtitle) {
      show(doc.subtitle, left, y, FONT.subtitle, false, 0.35);
      y -= 11;
    }
    show(`Generated ${generatedAt}`, left, y, FONT.subtitle, false, 0.45);
    y -= 16;
  }

  if (page.withHeading) {
    if (section.heading) {
      y -= 11;
      show(section.heading, left, y, 10, true, 0.1);
      y -= 4;
    }
    if (section.note) {
      y -= 8;
      show(section.note, left, y, FONT.footer, false, 0.45);
      y -= 3;
    }
  }

  const cellX = (align: PdfColumn["align"], x: number, w: number, width: number) => {
    if (align === "right") return x + w - CELL_PAD - width;
    if (align === "center") return x + (w - width) / 2;
    return x + CELL_PAD;
  };

  // Header band.
  const headerTop = y;
  ops.push(`0.94 0.94 0.96 rg ${left} ${(headerTop - ROW_HEIGHT).toFixed(2)} ${(right - left).toFixed(2)} ${ROW_HEIGHT} re f`);
  let x = left;
  section.columns.forEach((col, i) => {
    const w = widths[i];
    const label = truncate(pdfSafeText(col.label), w - CELL_PAD * 2, FONT.header, true);
    const baseline = headerTop - ROW_HEIGHT + 4;
    show(label, cellX(col.align, x, w, textWidth(label, FONT.header, true)), baseline, FONT.header, true, 0.15);
    x += w;
  });
  y = headerTop - ROW_HEIGHT;

  page.rows.forEach((row, r) => {
    const rowTop = y;
    if ((page.startIndex + r) % 2 === 1) {
      ops.push(`0.975 0.975 0.985 rg ${left} ${(rowTop - ROW_HEIGHT).toFixed(2)} ${(right - left).toFixed(2)} ${ROW_HEIGHT} re f`);
    }
    let cx = left;
    section.columns.forEach((col, i) => {
      const w = widths[i];
      const raw = pdfSafeText(row[i] ?? "");
      const text = truncate(raw, w - CELL_PAD * 2, FONT.body);
      const baseline = rowTop - ROW_HEIGHT + 4;
      show(text, cellX(col.align, cx, w, textWidth(text, FONT.body)), baseline, FONT.body, false, 0.1);
      cx += w;
    });
    y = rowTop - ROW_HEIGHT;
  });

  if (page.rows.length === 0) {
    show("No rows matched the selected filters.", left + CELL_PAD, y - ROW_HEIGHT + 4, FONT.body, false, 0.45);
    y -= ROW_HEIGHT;
  }

  // Rule under the table, then the footer.
  ops.push(`0.85 G 0.5 w ${left} ${y.toFixed(2)} m ${right} ${y.toFixed(2)} l S`);
  const footerY = PAGE.margin - 8;
  show(doc.footerLabel ?? doc.title, left, footerY, FONT.footer, false, 0.5);
  const pageLabel = `Page ${pageIndex + 1} of ${pageCount}`;
  show(pageLabel, right - textWidth(pageLabel, FONT.footer), footerY, FONT.footer, false, 0.5);

  return ops.join("\n");
}

// ————————————————————————— Document assembly —————————————————————————

/** Builds the PDF bytes. Split out from the download so it can be asserted on in tests. */
export function buildPdfDoc(doc: PdfDoc, generatedAt = new Date().toLocaleString("en-GB")): Blob {
  const l = layout(doc);
  const pageCount = l.pages.length;

  // Object numbering, fixed so the page tree can reference kids before they are written:
  //   1 Catalog · 2 Pages · 3 Helvetica · 4 Helvetica-Bold · then (page, content) per page.
  const firstPageObj = 5;
  const objects: string[] = [];
  const pageRefs = l.pages.map((_, i) => `${firstPageObj + i * 2} 0 R`);

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Count ${pageCount} /Kids [${pageRefs.join(" ")}] >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";

  l.pages.forEach((_, i) => {
    const pageObj = firstPageObj + i * 2;
    const contentObj = pageObj + 1;
    const stream = contentStream(doc, l, i, pageCount, generatedAt);
    objects[pageObj] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObj} 0 R >>`;
    objects[contentObj] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });

  // Serialise, recording byte offsets for the cross-reference table. Offsets are BYTE offsets, and
  // the body is Latin-1 (one byte per character by construction of pdfSafeText), so string length is
  // the byte length here.
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = body.length;
    body += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefStart = body.length;
  let xref = `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objects.length; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  const text = body + xref + trailer;
  // Latin-1, not UTF-8: a multi-byte encoding would shift every byte offset past the first non-ASCII
  // character and invalidate the xref table.
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
  return new Blob([bytes], { type: "application/pdf" });
}

/** The single-table case: one report, one table, no section heading needed. */
export function buildPdf(table: PdfTable, generatedAt?: string): Blob {
  return buildPdfDoc(
    {
      title: table.title,
      subtitle: table.subtitle,
      footerLabel: table.footerLabel,
      sections: [{ columns: table.columns, rows: table.rows }],
    },
    generatedAt,
  );
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportToPdf(filename: string, table: PdfTable) {
  download(buildPdf(table), filename);
}

/** Multi-panel export: aggregate reports whose shape is several tables rather than one row list. */
export function exportToPdfDoc(filename: string, doc: PdfDoc) {
  download(buildPdfDoc(doc), filename);
}
