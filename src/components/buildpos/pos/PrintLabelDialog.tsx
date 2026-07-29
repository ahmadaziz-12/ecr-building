import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Loader2, Printer } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDevices, useUpdateDeviceQzMapping } from "@/lib/api/admin";
import { usePrintLabelsBatch } from "@/lib/api/print";
import { ApiError } from "@/lib/api/client";
import { qzConnect, qzIsConnected, qzListPrinters, qzPrintRaw } from "@/lib/qz";
import { getLabelFeedLines, setLabelFeedLines } from "@/lib/buildpos/label-print-settings";

type LabelProduct = { id: number; sku: string; name: string; sellingPrice: number };

// Print a full shelf/price-tag label — name, SKU, price + VAT-inclusive price, AND the barcode
// symbol + digits underneath (a standard retail price-tag layout). Deliberately a separate action
// from "Print Barcode" (PrintBarcodeDialog), which prints just the barcode alone with no product
// info — for a minimal re-labeling/scanning sticker. Lets the cashier override the printed price for
// just this run (e.g. a temporary markdown) without touching the product's actual stored
// SellingPrice. Same printer-selection mechanism as PrintBarcodeDialog — reuses whichever printer is
// already mapped (usually the till's receipt printer).
export function PrintLabelDialog({
  open, onOpenChange, product,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: LabelProduct | null;
}) {
  const [priceOverride, setPriceOverride] = useState("");
  const [copies, setCopies] = useState("1");
  const [feedLines, setFeedLines] = useState(() => getLabelFeedLines());
  const [qzStatus, setQzStatus] = useState<"checking" | "connected" | "unavailable">("checking");
  const [qzPrinters, setQzPrinters] = useState<string[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);
  const { data: devices } = useDevices(open);
  const printLabelsBatch = usePrintLabelsBatch();
  const updateMapping = useUpdateDeviceQzMapping();

  const printers = (devices ?? [])
    .filter((d) => d.type === "LabelPrinter" || d.type === "ReceiptPrinter")
    .sort((a, b) => (b.qzPrinterName ? 1 : 0) - (a.qzPrinterName ? 1 : 0));

  useEffect(() => {
    if (!open) return;
    setCopies("1");
    setPriceOverride(product ? String(product.sellingPrice) : "");
    setQzStatus(qzIsConnected() ? "connected" : "checking");
    (async () => {
      try {
        await qzConnect();
        setQzPrinters(await qzListPrinters());
        setQzStatus("connected");
      } catch {
        setQzStatus("unavailable");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product?.id]);

  useEffect(() => {
    if (!open) return;
    setSelectedDeviceId((current) => {
      if (current != null && printers.some((d) => d.id === current)) return current;
      return printers.find((d) => d.qzPrinterName)?.id ?? printers[0]?.id ?? null;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, devices]);

  const selectedDevice = printers.find((d) => d.id === selectedDeviceId) ?? null;
  const overrideValid = Number.isFinite(Number(priceOverride)) && Number(priceOverride) > 0;
  const priceChanged = product != null && overrideValid && Number(priceOverride) !== product.sellingPrice;

  async function handlePrint() {
    if (!product || !overrideValid) return;
    const n = Math.max(1, Math.min(200, Number(copies) || 1));
    const overridePrice = Number(priceOverride) !== product.sellingPrice ? Number(priceOverride) : undefined;
    setLabelFeedLines(feedLines);
    try {
      const jobs = await printLabelsBatch.mutateAsync({
        items: [{ productId: product.id, copies: n, overridePrice }], terminalId: null, template: "Label", extraFeedLines: feedLines,
      });
      const job = jobs[0];
      if (job && qzStatus === "connected" && selectedDevice?.qzPrinterName) {
        await qzPrintRaw(job.escPosBase64, selectedDevice.qzPrinterName);
        toast.success(`${n} label(s) sent to ${selectedDevice.qzPrinterName}`);
      } else {
        toast.success(`${n} label(s) queued (virtual print)`, { description: "Map a printer below to print physically." });
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not print label.");
    }
  }

  async function handleMap(deviceId: number, qzPrinterName: string) {
    try {
      await updateMapping.mutateAsync({ deviceId, qzPrinterName: qzPrinterName || null });
      toast.success(qzPrinterName ? `Mapped to "${qzPrinterName}"` : "Mapping cleared — back to virtual mode");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save printer mapping");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Print Label{product ? ` — ${product.name}` : ""}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Price on Label (ر.س) <span className="text-critical">*</span>
            </label>
            <Input
              type="number" min={0.01} step="0.01" value={priceOverride}
              onChange={(e) => setPriceOverride(e.target.value)}
              className={priceChanged ? "border-warning" : undefined}
            />
            {priceChanged && (
              <p className="mt-1 text-[11px] font-medium text-warning">
                Prints at {Number(priceOverride).toFixed(2)} ر.س instead of the product's actual price
                ({product?.sellingPrice.toFixed(2)} ر.س) — the stored product price is not changed.
              </p>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Copies</label>
            <Input type="number" min={1} max={200} value={copies} onChange={(e) => setCopies(e.target.value)} />
          </div>

          <div
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
              qzStatus === "connected" ? "border-success/30 bg-success/10" : "border-black/10 bg-canvas text-muted-foreground"
            }`}
          >
            {qzStatus === "checking" && <Loader2 className="h-3.5 w-3.5 flex-none animate-spin" />}
            {qzStatus === "connected" && <CheckCircle2 className="h-3.5 w-3.5 flex-none text-success" />}
            {qzStatus === "unavailable" && <AlertCircle className="h-3.5 w-3.5 flex-none" />}
            <span className="flex-1">
              {qzStatus === "checking" && "Looking for QZ Tray…"}
              {qzStatus === "connected" && <>QZ Tray connected — <strong>{qzPrinters.length}</strong> printer(s) found</>}
              {qzStatus === "unavailable" && "QZ Tray not connected — will be queued virtually"}
            </span>
          </div>

          {printers.length === 0 && (
            <p className="rounded-lg border border-dashed border-black/10 p-3 text-center text-xs text-muted-foreground">
              No printer paired yet — pair one from Network → Devices (Receipt Printer or Label Printer both work) to print physically.
            </p>
          )}
          {qzStatus === "connected" && printers.length > 0 && (
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Feed Before Cut (lines)
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="number" min={0} max={40} value={feedLines}
                  onChange={(e) => setFeedLines(Math.max(0, Number(e.target.value) || 0))}
                  className="w-24"
                />
                <p className="text-[11px] text-muted-foreground">
                  Too low cuts through the label; too high leaves a big blank gap. Tune this until it looks right on your printer — it's remembered for next time.
                </p>
              </div>
            </div>
          )}
          {printers.length > 1 && (
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Printer</label>
              <select
                value={selectedDeviceId ?? ""}
                onChange={(e) => setSelectedDeviceId(Number(e.target.value))}
                className="h-9 w-full rounded-md border border-black/10 bg-white px-2 text-xs outline-none focus:border-brand"
              >
                {printers.map((d) => (
                  <option key={d.id} value={d.id}>{d.model} · {d.deviceCode} ({d.type === "ReceiptPrinter" ? "Receipt Printer" : "Label Printer"})</option>
                ))}
              </select>
            </div>
          )}
          {qzStatus === "connected" && selectedDevice && (
            <div className="space-y-1.5 rounded-lg border border-black/10 bg-canvas p-2.5">
              <p className="text-xs font-medium text-foreground">{selectedDevice.model} · {selectedDevice.deviceCode}</p>
              <select
                value={selectedDevice.qzPrinterName ?? ""}
                onChange={(e) => handleMap(selectedDevice.id, e.target.value)}
                className="h-8 w-full rounded-md border border-black/10 bg-white px-2 text-xs outline-none focus:border-brand"
              >
                <option value="">Virtual (no physical printer)</option>
                {qzPrinters.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" disabled={printLabelsBatch.isPending || !overrideValid} onClick={handlePrint} className="gap-1.5 bg-brand text-brand-foreground hover:bg-brand/90">
            {printLabelsBatch.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />} Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
