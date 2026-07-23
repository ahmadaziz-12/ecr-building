import { useState } from "react";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useProducts } from "@/lib/api/catalog";

export function PriceCheckDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: products } = useProducts(open);
  const [search, setSearch] = useState("");

  const matches = search.trim().length > 0
    ? (products ?? []).filter((p) => p.sku.toLowerCase().includes(search.toLowerCase()) || p.nameEn.toLowerCase().includes(search.toLowerCase()) || p.barcode?.includes(search)).slice(0, 20)
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Price Check</DialogTitle></DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus className="pl-8" placeholder="Scan barcode or search SKU / name…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="max-h-80 overflow-y-auto rounded-lg border border-black/5">
          {matches.map((p) => (
            <div key={p.id} className="flex items-center justify-between border-b border-black/5 px-3 py-2 text-sm last:border-0">
              <div>
                <p className="font-medium">{p.nameEn}</p>
                <p className="font-mono text-xs text-muted-foreground">{p.sku}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-foreground">{p.sellingPrice.toFixed(2)} ر.س</p>
                <p className="text-xs text-muted-foreground">VAT {p.vatRate}% · {p.totalAvailable} available</p>
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
