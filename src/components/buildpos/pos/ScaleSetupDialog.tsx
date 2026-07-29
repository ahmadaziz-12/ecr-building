import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Scale as ScaleIcon, Wifi, WifiOff } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useDevices, useUpdateDeviceQzMapping } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/client";
import { qzConnect, qzIsConnected } from "@/lib/qz";
import { scaleFindPorts } from "@/lib/scaleBridge";

type QzStatus = "checking" | "connected" | "unavailable";

// Pairing/mapping UI for WeighingScale devices — mirrors PrinterSetupDialog's QZ-connect flow, but
// maps a Device to a serial COM port (via QZ Tray's Serial Port API, src/lib/scaleBridge.ts) instead
// of an OS printer name. The port is stored in the same Device.qzPrinterName field a printer uses,
// repurposed as a generic "QZ target identifier" string rather than adding a parallel schema column.
export function ScaleSetupDialog({ terminalId }: { terminalId: number | undefined }) {
  const [open, setOpen] = useState(false);
  const [qzStatus, setQzStatus] = useState<QzStatus>("checking");
  const [ports, setPorts] = useState<string[]>([]);
  const [connecting, setConnecting] = useState(false);
  const { data: devices } = useDevices(open);
  const updateMapping = useUpdateDeviceQzMapping();

  const scales = (devices ?? []).filter((d) => d.terminalId === terminalId && d.type === "WeighingScale");

  async function tryConnect() {
    setConnecting(true);
    try {
      await qzConnect();
      setPorts(await scaleFindPorts());
      setQzStatus("connected");
    } catch {
      setQzStatus("unavailable");
    } finally {
      setConnecting(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    setQzStatus(qzIsConnected() ? "connected" : "checking");
    tryConnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleMap(deviceId: number, portName: string) {
    try {
      await updateMapping.mutateAsync({ deviceId, qzPrinterName: portName || null });
      toast.success(portName ? `Mapped to "${portName}"` : "Mapping cleared");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save the port mapping");
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setOpen(true)}>
        <ScaleIcon className="h-4 w-4" /> Scale Setup
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Weighing Scale</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div
              className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm ${
                qzStatus === "connected"
                  ? "border-success/30 bg-success/10 text-[oklch(0.35_0.1_155)]"
                  : qzStatus === "checking"
                    ? "border-black/10 bg-canvas text-muted-foreground"
                    : "border-warning/30 bg-warning/10 text-[oklch(0.4_0.13_70)]"
              }`}
            >
              {qzStatus === "checking" && <Loader2 className="h-4 w-4 flex-none animate-spin" />}
              {qzStatus === "connected" && <CheckCircle2 className="h-4 w-4 flex-none" />}
              {qzStatus === "unavailable" && <AlertCircle className="h-4 w-4 flex-none" />}
              <span className="flex-1">
                {qzStatus === "checking" && "Looking for QZ Tray…"}
                {qzStatus === "connected" && <>QZ Tray connected — <strong>{ports.length}</strong> serial port(s) found</>}
                {qzStatus === "unavailable" && "QZ Tray not connected — the same bridge used for printers also reads scales."}
              </span>
              {qzStatus !== "checking" && (
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={tryConnect} disabled={connecting}>
                  {connecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  {qzStatus === "connected" ? "Re-scan" : "Connect"}
                </Button>
              )}
            </div>

            {scales.length === 0 && (
              <div className="rounded-lg border border-dashed border-black/10 p-4 text-center text-sm text-muted-foreground">
                No weighing scale paired to this terminal yet — pair one (device type "Weighing Scale") from Network → Devices.
              </div>
            )}
            {scales.map((d) => (
              <div key={d.id} className="space-y-2 rounded-lg border border-black/10 bg-canvas p-3">
                <div className="flex items-center gap-3">
                  <span className={`grid h-9 w-9 place-items-center rounded-lg ${d.status === "Healthy" ? "bg-success/10 text-success" : "bg-critical/10 text-critical"}`}>
                    {d.status === "Healthy" ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-foreground">{d.model}</p>
                    <p className="text-[11px] text-muted-foreground">{d.deviceCode} · {d.status}</p>
                  </div>
                </div>

                {qzStatus === "connected" && (
                  <select
                    value={d.qzPrinterName ?? ""}
                    onChange={(e) => handleMap(d.id, e.target.value)}
                    className="h-8 w-full rounded-md border border-black/10 bg-white px-2 text-xs outline-none focus:border-brand"
                  >
                    <option value="">Not connected</option>
                    {ports.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                )}
                {qzStatus !== "connected" && d.qzPrinterName && (
                  <p className="text-[11px] text-muted-foreground">Mapped to serial port: {d.qzPrinterName}</p>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
