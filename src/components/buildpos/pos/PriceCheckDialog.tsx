import { useState } from "react";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProducts, type ProductDto } from "@/lib/api/catalog";

// BRD §7: which of Product's list prices to resolve — mirrors backend PriceListType (Customer.cs) /
// OrdersController.Checkout's switch. "Retail" always resolves to sellingPrice; the other three fall
// back to sellingPrice when the product has no override configured for that segment, same as checkout.
const PRICE_LISTS: { value: string; label: string; field: keyof Pick<ProductDto, "contractorPrice" | "wholesalePrice" | "projectPrice"> | null }[] = [
  { value: "Retail", label: "Retail", field: null },
  { value: "Contractor", label: "Contractor", field: "contractorPrice" },
  { value: "Wholesale", label: "Wholesale", field: "wholesalePrice" },
  { value: "Project", label: "Project", field: "projectPrice" },
];

function resolvePrice(p: ProductDto, listType: string): { price: number; isListPrice: boolean } {
  const list = PRICE_LISTS.find((l) => l.value === listType);
  const override = list?.field ? p[list.field] : null;
  return override != null ? { price: override, isListPrice: true } : { price: p.sellingPrice, isListPrice: false };
}

export function PriceCheckDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: products } = useProducts(open);
  const [search, setSearch] = useState("");
  const [priceList, setPriceList] = useState("Retail");

  const matches = search.trim().length > 0
    ? (products ?? []).filter((p) => p.sku.toLowerCase().includes(search.toLowerCase()) || p.nameEn.toLowerCase().includes(search.toLowerCase()) || p.barcode?.includes(search)).slice(0, 20)
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Price Check</DialogTitle></DialogHeader>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input autoFocus className="pl-8" placeholder="Scan barcode or search SKU / name…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex flex-none items-center gap-1.5">
            <Label className="text-xs text-muted-foreground">Price list</Label>
            <Select value={priceList} onValueChange={setPriceList}>
              <SelectTrigger className="h-9 w-32 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRICE_LISTS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto rounded-lg border border-black/5">
          {matches.map((p) => {
            const { price, isListPrice } = resolvePrice(p, priceList);
            return (
              <div key={p.id} className="flex items-center justify-between border-b border-black/5 px-3 py-2 text-sm last:border-0">
                <div>
                  <p className="font-medium">{p.nameEn}</p>
                  <p className="font-mono text-xs text-muted-foreground">{p.sku}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-foreground">{price.toFixed(2)} ر.س</p>
                  <p className="text-xs text-muted-foreground">
                    {priceList !== "Retail" && (isListPrice ? `${priceList} price` : "Retail — no list override")} · VAT {p.vatRate}% · {p.totalAvailable} available
                  </p>
                </div>
              </div>
            );
          })}
          {search.trim() && matches.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matching product.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
