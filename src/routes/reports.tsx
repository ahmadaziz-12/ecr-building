import { createFileRoute } from "@tanstack/react-router";
import { FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/buildpos/sections";

const reports = [
  { title: "Daily Sales", desc: "Hour-wise sales and payment split", value: "48,920 ر.س" },
  { title: "Cashier Sales", desc: "Sales by cashier and shift", value: "6 Cashiers" },
  { title: "Product Sales", desc: "SKU-wise sales and movement", value: "1,240 Units Sold" },
  { title: "Category Performance", desc: "Sales by material category", value: "Cement Top" },
  { title: "Low Stock Report", desc: "Items below reorder level", value: "34 SKUs" },
  { title: "Returns Report", desc: "Standard, damaged, surplus returns", value: "3,240 ر.س" },
  { title: "Payment Report", desc: "Cash, card, wallet, credit split", value: "49,540 ر.س" },
  { title: "VAT / ZATCA Report", desc: "Tax and invoice sync status", value: "3 Alerts" },
  { title: "Stock Transfer Report", desc: "Branch and warehouse transfers", value: "9 Pending" },
  { title: "Supplier Performance", desc: "PO status and supplier fill rate", value: "4 Delayed POs" },
  { title: "Profit Margin Report", desc: "Margin by product/category", value: "22.5% Avg" },
  { title: "Audit Trail", desc: "Sensitive activity logs", value: "68 Events" },
];

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "Reports — BuildPOS" }, { name: "description", content: "Sales, inventory, compliance, and audit reports." }] }),
  component: ReportsPage,
});

function ReportsPage() {
  return (
    <SectionCard title="Reports" desc="Download or open detailed reports across every module.">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {reports.map((r) => (
          <div key={r.title} className="group flex items-start gap-3 rounded-xl border border-black/5 bg-canvas p-4 transition hover:border-brand/30 hover:bg-white">
            <span className="grid h-10 w-10 flex-none place-items-center rounded-lg bg-brand/10 text-brand">
              <FileText className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground">{r.title}</p>
              <p className="text-xs text-muted-foreground">{r.desc}</p>
              <p className="mt-2 font-display text-sm font-bold text-brand">{r.value}</p>
            </div>
            <Button size="sm" variant="ghost" className="text-brand hover:bg-brand/10 hover:text-brand">
              <Download className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}