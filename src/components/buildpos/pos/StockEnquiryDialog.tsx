import { useState } from "react";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pill } from "@/components/buildpos/sections";
import { Input } from "@/components/ui/input";
import { statusTone } from "./shared";
import { useStockLevels } from "@/lib/api/inventory";

export function StockEnquiryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: stockLevels } = useStockLevels(open);
  const [search, setSearch] = useState("");

  const matches = search.trim().length > 0
    ? (stockLevels ?? []).filter((s) => s.sku.toLowerCase().includes(search.toLowerCase()) || s.productName.toLowerCase().includes(search.toLowerCase()))
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Stock Enquiry</DialogTitle></DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus className="pl-8" placeholder="Search SKU or product name…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="max-h-80 overflow-y-auto rounded-lg border border-black/5">
          {matches.map((s) => (
            <div key={`${s.productId}-${s.warehouseId}`} className="flex items-center justify-between border-b border-black/5 px-3 py-2 text-sm last:border-0">
              <div>
                <p className="font-medium">{s.productName}</p>
                <p className="text-xs text-muted-foreground">{s.sku} · {s.warehouseName}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-foreground">{s.available} available</p>
                <Pill tone={statusTone(s.status)}>{s.status}</Pill>
              </div>
            </div>
          ))}
          {search.trim() && matches.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matching product.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
