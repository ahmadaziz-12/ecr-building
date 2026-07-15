import { useState } from "react";
import { toast } from "sonner";
import { LogIn, LogOut } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useHrStore, employeeName } from "@/lib/hr/store";

export function CheckInDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const employees = useHrStore((s) => s.employees);
  const attendance = useHrStore((s) => s.attendance);
  const checkIn = useHrStore((s) => s.checkIn);
  const checkOut = useHrStore((s) => s.checkOut);
  const [emp, setEmp] = useState("");
  const [source, setSource] = useState<"Biometric" | "PIN" | "Terminal" | "Manual" | "Mobile">("Biometric");
  const [reason, setReason] = useState("");

  const today = new Date().toISOString().slice(0, 10);
  const active = emp ? attendance.find((a) => a.empId === emp && a.date === today && a.checkIn && !a.checkOut) : undefined;

  function doCheckIn() {
    if (!emp) { toast.error("Pick an employee"); return; }
    const chosen = employees.find((e) => e.id === emp);
    if (!chosen) return;
    if (chosen.status === "Inactive") { toast.error("Inactive employee cannot check in."); return; }
    if (source === "Manual" && !reason) { toast.error("Manual attendance requires a reason."); return; }
    const existing = attendance.find((a) => a.empId === emp && a.date === today && a.checkIn && !a.checkOut);
    if (existing) { toast.error("Employee already checked in without check-out."); return; }
    const rec = checkIn(emp, source);
    toast.success(`${employeeName(chosen)} checked in`, { description: `${rec.checkIn} · ${rec.status}${rec.lateMin ? ` · late ${rec.lateMin} min` : ""}` });
    onOpenChange(false);
  }
  function doCheckOut() {
    if (!emp) return;
    if (!active) { toast.error("No active check-in for this employee."); return; }
    checkOut(emp);
    toast.success("Checked out", { description: "Worked hours calculated." });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Attendance · Check-in / Check-out</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Employee</label>
            <select value={emp} onChange={(e) => setEmp(e.target.value)} className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm">
              <option value="">Select…</option>
              {employees.filter((e) => e.status !== "Inactive").map((e) => <option key={e.id} value={e.id}>{e.id} · {employeeName(e)} · {e.department}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Source</label>
            <select value={source} onChange={(e) => setSource(e.target.value as typeof source)} className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm">
              {["Biometric", "PIN", "Terminal", "Manual", "Mobile"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {source === "Manual" && (
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Reason</label>
              <input value={reason} onChange={(e) => setReason(e.target.value)} className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm" />
            </div>
          )}
          {active && (
            <div className="rounded-lg border border-info/20 bg-info/5 p-2 text-xs">
              Active session — check-in at <strong>{active.checkIn}</strong>. Click Check-out to close.
            </div>
          )}
          <div className="flex gap-2">
            <Button onClick={doCheckIn} disabled={!emp || !!active} className="flex-1 gap-1 bg-brand text-brand-foreground hover:bg-brand/90">
              <LogIn className="h-4 w-4" /> Check-in
            </Button>
            <Button onClick={doCheckOut} disabled={!active} variant="outline" className="flex-1 gap-1">
              <LogOut className="h-4 w-4" /> Check-out
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}