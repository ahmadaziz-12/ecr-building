import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Loader2, Barcode as BarcodeIcon } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDevices, useUpdateDeviceQzMapping } from "@/lib/api/admin";
import { usePrintLabelsBatch } from "@/lib/api/print";
import { ApiError } from "@/lib/api/client";
import { qzConnect, qzIsConnected, qzListPrinters, qzPrintRaw } from "@/lib/qz";
import { getLabelFeedLines, setLabelFeedLines } from "@/lib/buildpos/label-print-settings";

type BarcodeProduct = { id: number; sku: string; name: string; barcode: string | null };

// Print a minimal Code128 barcode sticker — just the symbol and its digits underneath, no product
// info. Deliberately a separate action from "Print Label" (PrintLabelDialog), which prints the full
// shelf/price tag (name, SKU, price) plus this same barcode. Same QZ-connect + printer-selection
// mechanism PrinterSetupDialog uses for receipts — reuses whichever printer is already mapped
// (usually the till's receipt printer) instead of requiring a second device pairing.
export function PrintBarcodeDialog({
  open, onOpenChange, product,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: BarcodeProduct | null;
}) {
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
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setSelectedDeviceId((current) => {
      if (current != null && printers.some((d) => d.id === current)) return current;
      return printers.find((d) => d.qzPrinterName)?.id ?? printers[0]?.id ?? null;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, devices]);

  const selectedDevice = printers.find((d) => d.id === selectedDeviceId) ?? null;

  async function handlePrint() {
    if (!product) return;
    const n = Math.max(1, Math.min(200, Number(copies) || 1));
    setLabelFeedLines(feedLines);
    try {
      const jobs = await printLabelsBatch.mutateAsync({
        items: [{ productId: product.id, copies: n }], terminalId: null, template: "Barcode", extraFeedLines: feedLines,
      });
      const job = jobs[0];
      if (job && qzStatus === "connected" && selectedDevice?.qzPrinterName) {
        await qzPrintRaw(job.escPosBase64, selectedDevice.qzPrinterName);
        toast.success(`${n} barcode label(s) sent to ${selectedDevice.qzPrinterName}`);
      } else {
        toast.success(`${n} barcode label(s) queued (virtual print)`, { description: "Map a printer below to print physically." });
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not print barcode.");
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
        <DialogHeader><DialogTitle>Print Barcode{product ? ` — ${product.name}` : ""}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {product && (
            <div className="rounded-lg border border-black/10 bg-canvas p-3 text-center">
              <p className="text-xs text-muted-foreground">SKU: {product.sku}</p>
              {product.barcode ? (
                <p className="mt-1 font-mono text-lg font-semibold tracking-widest text-foreground">{product.barcode}</p>
              ) : (
                <p className="mt-1 text-xs font-medium text-warning">No barcode value set on this product — only SKU/price will print.</p>
              )}
            </div>
          )}
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
                  Too low cuts through the barcode; too high leaves a big blank gap. Tune this until it looks right on your printer — it's remembered for next time.
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
          <Button size="sm" disabled={printLabelsBatch.isPending} onClick={handlePrint} className="gap-1.5 bg-brand text-brand-foreground hover:bg-brand/90">
            {printLabelsBatch.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BarcodeIcon className="h-3.5 w-3.5" />} Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
