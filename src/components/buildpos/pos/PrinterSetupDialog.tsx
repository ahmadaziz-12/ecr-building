import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Info, Loader2, Printer, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useDevices, useUpdateDeviceQzMapping } from "@/lib/api/admin";
import { useAuth } from "@/lib/api/auth";
import { useTestPrint } from "@/lib/api/print";
import { ApiError, API_BASE } from "@/lib/api/client";
import { qzConnect, qzIsConnected, qzListPrinters, qzPrintRaw } from "@/lib/qz";

type QzStatus = "checking" | "connected" | "unavailable";

const setupInstallerUrl = `${API_BASE}/api/printer/setup-installer`;
const qzTrustPs1Url = `${API_BASE}/api/printer/qz-trust-ps1`;
const trustCommand = `powershell -c "iex(irm '${qzTrustPs1Url}')"`;
const linuxRunCommand = "bash ~/Downloads/BuildPOS-Printer-Setup.sh";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

export function PrinterSetupDialog({ terminalId }: { terminalId: number | undefined }) {
  const [open, setOpen] = useState(false);
  const [trustOpen, setTrustOpen] = useState(false);
  const [qzStatus, setQzStatus] = useState<QzStatus>("checking");
  const [qzPrinters, setQzPrinters] = useState<string[]>([]);
  const [connecting, setConnecting] = useState(false);
  const { data: devices } = useDevices(open);
  const { hasAccess } = useAuth();
  const testPrint = useTestPrint();
  const updateMapping = useUpdateDeviceQzMapping();

  const terminalDevices = (devices ?? []).filter((d) => d.terminalId === terminalId);
  const printers = terminalDevices.filter((d) => d.type === "ReceiptPrinter");
  const canMap = hasAccess("Network", "Edit");

  async function tryConnect() {
    setConnecting(true);
    try {
      await withTimeout(qzConnect(), 3000);
      const names = await qzListPrinters();
      setQzPrinters(names);
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

  async function handleTestPrint(deviceId: number, qzPrinterName: string | null) {
    try {
      const job = await testPrint.mutateAsync(deviceId);
      if (qzStatus === "connected" && qzPrinterName) {
        await qzPrintRaw(job.escPosBase64, qzPrinterName);
        toast.success("Test print sent to physical printer", { description: `Via QZ Tray → ${qzPrinterName}` });
      } else {
        toast.success("Test print sent (virtual)", { description: job.previewText.split("\n")[2] ?? "Printer responding normally." });
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Test print failed");
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
    <>
      <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setOpen(true)}>
        <Printer className="h-4 w-4" /> Printer Setup
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Receipt Printer</DialogTitle>
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
                {qzStatus === "connected" && <>QZ Tray connected — <strong>{qzPrinters.length}</strong> printer(s) found</>}
                {qzStatus === "unavailable" && "QZ Tray not connected"}
              </span>
              {qzStatus !== "checking" && (
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={tryConnect} disabled={connecting}>
                  {connecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  {qzStatus === "connected" ? "Re-scan" : "Connect"}
                </Button>
              )}
            </div>

            {qzStatus === "unavailable" && (
              <div className="space-y-2.5 rounded-lg border border-dashed border-black/10 px-4 py-3 text-xs text-muted-foreground">
                <p className="text-sm font-medium text-foreground">Setup (one-time per machine, run as IT/Admin):</p>
                <a
                  href={setupInstallerUrl}
                  download
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-foreground transition hover:bg-brand/90"
                >
                  <Printer className="h-4 w-4" /> Download POS Setup Installer
                </a>
                <div className="space-y-1">
                  <p>
                    <span className="font-medium text-foreground">Windows:</span> Double-click{" "}
                    <code className="rounded bg-black/5 px-1">BuildPOS-Printer-Setup.bat</code> → click <strong>Run</strong> → click <strong>Yes</strong>
                  </p>
                  <p>
                    <span className="font-medium text-foreground">macOS:</span> Double-click{" "}
                    <code className="rounded bg-black/5 px-1">BuildPOS-Printer-Setup.command</code>
                  </p>
                  <p><span className="font-medium text-foreground">Linux:</span> Open Terminal → paste this command:</p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <code className="flex-1 select-all break-all rounded bg-black/5 px-2 py-1 text-[10px]">{linuxRunCommand}</code>
                    <button
                      type="button"
                      className="shrink-0 rounded bg-black/5 px-2 py-1 text-xs hover:bg-black/10"
                      onClick={() => { navigator.clipboard.writeText(linuxRunCommand); toast.success("Command copied"); }}
                    >
                      Copy
                    </button>
                  </div>
                </div>
                <p>Installs QZ Tray silently and trusts this server's certificate — no print dialogs will appear.</p>

                <div className="space-y-1 rounded-md bg-black/5 px-3 py-2">
                  <p className="font-medium text-foreground">After it installs:</p>
                  <ol className="list-inside list-decimal space-y-0.5">
                    <li>Close <strong>all</strong> browser windows so QZ Tray can attach.</li>
                    <li>Launch <strong>QZ Tray</strong> — look for its icon in the system tray.</li>
                    <li>Reopen this page, click <strong>Connect</strong> above, then map your printer below.</li>
                  </ol>
                </div>

                <Button size="sm" variant="outline" className="h-8 w-full gap-1.5 text-xs" onClick={() => setTrustOpen(true)}>
                  <Info className="h-3.5 w-3.5" /> Details — already have QZ Tray installed?
                </Button>
              </div>
            )}

            {printers.length === 0 && (
              <div className="rounded-lg border border-dashed border-black/10 p-4 text-center text-sm text-muted-foreground">
                No receipt printer paired to this terminal yet — pair one from Network → Devices.
              </div>
            )}
            {printers.map((d) => (
              <div key={d.id} className="space-y-2 rounded-lg border border-black/10 bg-canvas p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className={`grid h-9 w-9 place-items-center rounded-lg ${d.status === "Healthy" ? "bg-success/10 text-success" : "bg-critical/10 text-critical"}`}>
                      {d.status === "Healthy" ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-foreground">{d.model}</p>
                      <p className="text-[11px] text-muted-foreground">{d.deviceCode} · {d.status}</p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" disabled={testPrint.isPending} onClick={() => handleTestPrint(d.id, d.qzPrinterName)} className="gap-1.5">
                    {testPrint.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Test Print
                  </Button>
                </div>

                {canMap && qzStatus === "connected" && (
                  <select
                    value={d.qzPrinterName ?? ""}
                    onChange={(e) => handleMap(d.id, e.target.value)}
                    className="h-8 w-full rounded-md border border-black/10 bg-white px-2 text-xs outline-none focus:border-brand"
                  >
                    <option value="">Virtual (no physical printer)</option>
                    {qzPrinters.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                )}
                {!canMap && d.qzPrinterName && (
                  <p className="text-[11px] text-muted-foreground">Mapped to physical printer: {d.qzPrinterName}</p>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={trustOpen} onOpenChange={setTrustOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Printer className="h-5 w-5 text-brand" /> Windows: already have QZ Tray installed?</DialogTitle>
          </DialogHeader>
          <div className="space-y-2.5 text-sm text-muted-foreground">
            <p>If you get an "Action Required" / "Untrusted website" popup every time you print, run this once (as Admin) to make QZ Tray trust this server permanently:</p>
            <div className="flex items-center gap-1.5">
              <code className="flex-1 select-all break-all rounded bg-black/5 px-2 py-1.5 text-xs">{trustCommand}</code>
              <button
                type="button"
                className="shrink-0 rounded bg-black/5 px-2 py-1.5 text-xs hover:bg-black/10"
                onClick={() => { navigator.clipboard.writeText(trustCommand); toast.success("Command copied"); }}
              >
                Copy
              </button>
            </div>
            <p>Paste into Win+R or a terminal, press Enter, and accept the Admin prompt.</p>
          </div>
          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={() => setTrustOpen(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
