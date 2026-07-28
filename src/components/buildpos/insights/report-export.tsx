import { Download, FileSpreadsheet, FileText, Sheet as SheetIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportToCsv } from "@/components/buildpos/pos/shared";
import { exportToXlsx, type XlsxSheet } from "@/lib/buildpos/export-xlsx";
import { exportToPdfDoc, type PdfSection } from "@/lib/buildpos/export-pdf";
import { alignOf, formatCell, rawValue, xlsxCell, type ReportColumn } from "./report-columns";

// Export for BOTH report shapes. A list report is one panel; an aggregate report (Sales Summary, the
// VAT return, Discount Utilization) is several, and used to have no export at all because the export
// button lived inside the table component and those reports render KPI blocks instead. Panels are the
// common currency: one panel per table, and a KPI block becomes a two-column Metric/Value panel.

export type ReportPanel<T> = {
  /** Excel sheet tab name and PDF section heading. */
  name: string;
  /** One line under the PDF heading — what the panel is, or how to read it. */
  note?: string;
  columns: ReportColumn<T>[];
  rows: T[];
};

export type ExportFormat = "pdf" | "xlsx" | "csv";

function panelSheet<T>(panel: ReportPanel<T>): XlsxSheet {
  return {
    name: panel.name,
    columns: panel.columns.map((c) => c.label),
    rows: panel.rows.map((row) => panel.columns.map((c) => xlsxCell(rawValue(row, c), c.format))),
  };
}

function panelSection<T>(panel: ReportPanel<T>): PdfSection {
  return {
    heading: panel.name,
    note: panel.note,
    columns: panel.columns.map((c) => ({ label: c.label, align: alignOf(c) })),
    rows: panel.rows.map((row) => panel.columns.map((c) => formatCell(rawValue(row, c), c.format))),
  };
}

function panelCsvRows<T>(panel: ReportPanel<T>): string[][] {
  return panel.rows.map((row) => panel.columns.map((c) => formatCell(rawValue(row, c), c.format)));
}

export type ExportRequest = {
  /** Base filename, no extension. */
  exportName: string;
  title: string;
  subtitle?: string;
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- panels are heterogeneous by design:
     one report's panels have different row types (by-method vs by-day), so the array cannot be
     generic over a single T without forcing every caller to erase its own row types first. */
  panels: ReportPanel<any>[];
};

export function runExport(format: ExportFormat, request: ExportRequest) {
  const { exportName, title, subtitle, panels } = request;
  const rowCount = panels.reduce((n, p) => n + p.rows.length, 0);

  if (format === "xlsx") {
    exportToXlsx(exportName, panels.map(panelSheet));
    toast.success(`Exported ${rowCount} rows to Excel`);
    return;
  }
  if (format === "pdf") {
    exportToPdfDoc(exportName, { title, subtitle, footerLabel: title, sections: panels.map(panelSection) });
    toast.success(`Exported ${rowCount} rows to PDF`);
    return;
  }

  // CSV is one flat file with no sheet concept, so a multi-panel report is written as its panels in
  // sequence, each under its own name and header row. Emitting only the first panel would silently
  // drop most of an aggregate report.
  if (panels.length === 1) {
    exportToCsv(`${exportName}.csv`, panels[0].columns.map((c) => c.label), panelCsvRows(panels[0]));
  } else {
    const widest = Math.max(...panels.map((p) => p.columns.length));
    const pad = (row: string[]) => [...row, ...Array(Math.max(0, widest - row.length)).fill("")];
    const rows: string[][] = [];
    panels.forEach((panel, i) => {
      if (i > 0) rows.push(pad([]));
      rows.push(pad([panel.name]));
      rows.push(pad(panel.columns.map((c) => c.label)));
      for (const row of panelCsvRows(panel)) rows.push(pad(row));
    });
    exportToCsv(`${exportName}.csv`, pad([title]), rows);
  }
  toast.success(`Exported ${rowCount} rows to CSV`);
}

/** The Export split-button used by every report, its drill-down sheets, and the aggregate panels. */
export function ExportMenu({
  disabled,
  onExport,
  compact,
  label = "Export",
}: {
  disabled?: boolean;
  onExport: (format: ExportFormat) => void;
  compact?: boolean;
  label?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          className={compact ? "h-7 gap-1.5 text-xs" : "h-8 gap-1.5"}
        >
          <Download className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} /> {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={() => onExport("pdf")} className="gap-2 text-xs">
          <FileText className="h-3.5 w-3.5" /> PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onExport("xlsx")} className="gap-2 text-xs">
          <FileSpreadsheet className="h-3.5 w-3.5" /> Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onExport("csv")} className="gap-2 text-xs">
          <SheetIcon className="h-3.5 w-3.5" /> CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Turns a KPI block into an exportable panel — the only shape a metrics-only report has. */
export type KpiRow = { metric: string; value: string; detail?: string };

export const KPI_PANEL_COLUMNS: ReportColumn<KpiRow>[] = [
  { key: "metric", label: "Metric" },
  { key: "value", label: "Value", align: "right" },
  { key: "detail", label: "Basis" },
];
