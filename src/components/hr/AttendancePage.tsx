import { useState } from "react";
import { PageHeader } from "@/components/buildpos/PageHeader";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import { Button } from "@/components/ui/button";
import { useHrStore, employeeName } from "@/lib/hr/store";
import { CheckInDialog } from "./CheckInDialog";

const TABS = ["Overview", "Employee Shifts", "Shift Templates", "Check-In / Out", "Adjustments", "Overtime", "Logs"];

export function AttendancePage() {
  const attendance = useHrStore((s) => s.attendance);
  const employees = useHrStore((s) => s.employees);
  const shifts = useHrStore((s) => s.shifts);
  const addShift = useHrStore((s) => s.addShift);
  const adjust = useHrStore((s) => s.adjustAttendance);
  const [tab, setTab] = useState(0);
  const [chk, setChk] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const todaysAtt = attendance.filter((a) => a.date === today);

  return (
    <div className="space-y-4">
      <PageHeader group="HRMS" title="Shift & Attendance" desc="Working schedules and attendance ledger. Distinct from cashier register shifts — those live under Operate → Cashier Shifts." primary="Check-In / Out" onPrimary={() => setChk(true)} />
      <div className="flex flex-wrap gap-1 border-b border-black/5">
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)} className={`relative px-3 py-2 text-sm font-medium ${i === tab ? "text-brand" : "text-muted-foreground hover:text-foreground"}`}>
            {t}
            {i === tab && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand" />}
          </button>
        ))}
      </div>

      {tab === 0 && (
        <SectionCard title="Attendance Ledger — Today" desc={`${todaysAtt.length} entries`}>
          <AttendanceTable rows={todaysAtt} onAdjust={(id, patch) => adjust(id, patch, "Manual correction")} />
        </SectionCard>
      )}

      {tab === 1 && (
        <SectionCard title="Employee Shifts" desc={`${employees.filter((e) => e.shiftId).length} assigned`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase text-muted-foreground">
                <tr><th className="px-2 py-2 text-left">EMP</th><th className="px-2 py-2 text-left">Name</th><th className="px-2 py-2 text-left">Department</th><th className="px-2 py-2 text-left">Assigned Shift</th></tr>
              </thead>
              <tbody>
                {employees.map((e) => {
                  const s = shifts.find((sh) => sh.id === e.shiftId);
                  return (
                    <tr key={e.id} className="border-t border-black/5">
                      <td className="px-2 py-2 font-mono text-xs">{e.id}</td>
                      <td className="px-2 py-2">{employeeName(e)}</td>
                      <td className="px-2 py-2 text-muted-foreground">{e.department}</td>
                      <td className="px-2 py-2">{s ? `${s.name} · ${s.start}–${s.end}` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {tab === 2 && (
        <ShiftTemplatesTab shifts={shifts} onAdd={(sh) => addShift(sh)} />
      )}

      {tab === 3 && (
        <SectionCard title="Check-In / Check-Out" desc="Use PIN, biometric or manual entry.">
          <p className="text-sm text-muted-foreground">Use the button in the header to open the check-in dialog. The dialog validates active sessions, calculates late minutes vs the shift grace period, and closes worked-hours on check-out.</p>
          <div className="mt-3"><Button onClick={() => setChk(true)} className="bg-brand text-brand-foreground hover:bg-brand/90">Open dialog</Button></div>
        </SectionCard>
      )}

      {tab === 4 && (
        <SectionCard title="Attendance Adjustments" desc="Correct missed check-ins/outs with a reason. Applied changes mark status as Manual Adjustment.">
          <AttendanceTable rows={attendance.slice(0, 20)} onAdjust={(id, patch) => adjust(id, patch, "Supervisor correction")} />
        </SectionCard>
      )}

      {tab === 5 && (
        <SectionCard title="Overtime" desc="Overtime is calculated from worked-hours vs shift working-hours.">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase text-muted-foreground">
                <tr><th className="px-2 py-2 text-left">Employee</th><th className="px-2 py-2 text-left">Shift</th><th className="px-2 py-2 text-right">Worked</th><th className="px-2 py-2 text-right">Overtime</th></tr>
              </thead>
              <tbody>
                {attendance.filter((a) => a.workedHours).map((a) => {
                  const emp = employees.find((e) => e.id === a.empId);
                  const s = shifts.find((sh) => sh.id === a.shiftId);
                  const ot = Math.max(0, (a.workedHours ?? 0) - (s?.workingHours ?? 8));
                  return (
                    <tr key={a.id} className="border-t border-black/5">
                      <td className="px-2 py-2">{employeeName(emp)}</td>
                      <td className="px-2 py-2 text-muted-foreground">{s?.name ?? "—"}</td>
                      <td className="px-2 py-2 text-right">{a.workedHours}h</td>
                      <td className="px-2 py-2 text-right">{ot > 0 ? `+${ot.toFixed(1)}h` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {tab === 6 && (
        <SectionCard title="Attendance Logs" desc="Every check-in / check-out / adjustment.">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase text-muted-foreground">
                <tr><th className="px-2 py-2 text-left">ATT #</th><th className="px-2 py-2 text-left">Employee</th><th className="px-2 py-2 text-left">Date</th><th className="px-2 py-2 text-left">In</th><th className="px-2 py-2 text-left">Out</th><th className="px-2 py-2 text-right">Late</th><th className="px-2 py-2 text-left">Source</th><th className="px-2 py-2 text-left">Status</th></tr>
              </thead>
              <tbody>
                {attendance.map((a) => (
                  <tr key={a.id} className="border-t border-black/5">
                    <td className="px-2 py-2 font-mono text-xs">{a.id}</td>
                    <td className="px-2 py-2">{employeeName(employees.find((e) => e.id === a.empId))}</td>
                    <td className="px-2 py-2">{a.date}</td>
                    <td className="px-2 py-2 font-mono text-xs">{a.checkIn ?? "—"}</td>
                    <td className="px-2 py-2 font-mono text-xs">{a.checkOut ?? "—"}</td>
                    <td className="px-2 py-2 text-right">{a.lateMin ?? 0}</td>
                    <td className="px-2 py-2 text-muted-foreground">{a.source}</td>
                    <td className="px-2 py-2"><Pill tone={a.status === "Present" ? "success" : a.status === "Late" ? "warning" : a.status === "On Leave" ? "info" : "critical"}>{a.status}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      <CheckInDialog open={chk} onOpenChange={setChk} />
    </div>
  );
}

function AttendanceTable({ rows, onAdjust }: { rows: ReturnType<typeof useHrStore.getState>["attendance"]; onAdjust: (id: string, patch: Partial<ReturnType<typeof useHrStore.getState>["attendance"][number]>) => void }) {
  const employees = useHrStore((s) => s.employees);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-[10px] uppercase text-muted-foreground">
          <tr><th className="px-2 py-2 text-left">Employee</th><th className="px-2 py-2 text-left">Scheduled</th><th className="px-2 py-2 text-left">Check-In</th><th className="px-2 py-2 text-left">Check-Out</th><th className="px-2 py-2 text-right">Late</th><th className="px-2 py-2 text-left">Status</th><th className="px-2 py-2 text-left">Source</th><th /></tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id} className="border-t border-black/5">
              <td className="px-2 py-2">{employeeName(employees.find((e) => e.id === a.empId))}</td>
              <td className="px-2 py-2 font-mono text-xs">{a.scheduledIn ? `${a.scheduledIn}–${a.scheduledOut}` : "—"}</td>
              <td className="px-2 py-2 font-mono text-xs">{a.checkIn ?? "—"}</td>
              <td className="px-2 py-2 font-mono text-xs">{a.checkOut ?? "—"}</td>
              <td className="px-2 py-2 text-right">{a.lateMin ?? 0}</td>
              <td className="px-2 py-2"><Pill tone={a.status === "Present" ? "success" : a.status === "Late" ? "warning" : a.status === "On Leave" ? "info" : "critical"}>{a.status}</Pill></td>
              <td className="px-2 py-2 text-muted-foreground">{a.source}</td>
              <td className="px-2 py-2 text-right">
                <button onClick={() => onAdjust(a.id, { checkOut: a.checkOut ?? "17:30" })} className="rounded-md border border-black/10 bg-white px-2 py-1 text-[11px] hover:border-brand/40 hover:text-brand">
                  Adjust
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ShiftTemplatesTab({ shifts, onAdd }: { shifts: ReturnType<typeof useHrStore.getState>["shifts"]; onAdd: (s: Omit<ReturnType<typeof useHrStore.getState>["shifts"][number], "id">) => void }) {
  const [f, setF] = useState({ name: "", code: "", start: "09:00", end: "17:00", breakMin: 60, workingHours: 7, graceMin: 5 });
  return (
    <div className="space-y-3">
      <SectionCard title="Create Shift Template">
        <div className="ui-card-grid">
          <input placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="h-9 rounded-lg border border-black/10 bg-white px-3 text-sm" />
          <input placeholder="Code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} className="h-9 rounded-lg border border-black/10 bg-white px-3 text-sm font-mono" />
          <input type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} className="h-9 rounded-lg border border-black/10 bg-white px-3 text-sm" />
          <input type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} className="h-9 rounded-lg border border-black/10 bg-white px-3 text-sm" />
          <input type="number" placeholder="Break (min)" value={f.breakMin} onChange={(e) => setF({ ...f, breakMin: Number(e.target.value) })} className="h-9 rounded-lg border border-black/10 bg-white px-3 text-sm" />
          <input type="number" placeholder="Working hours" value={f.workingHours} onChange={(e) => setF({ ...f, workingHours: Number(e.target.value) })} className="h-9 rounded-lg border border-black/10 bg-white px-3 text-sm" />
          <input type="number" placeholder="Grace (min)" value={f.graceMin} onChange={(e) => setF({ ...f, graceMin: Number(e.target.value) })} className="h-9 rounded-lg border border-black/10 bg-white px-3 text-sm" />
          <Button
            className="bg-brand text-brand-foreground hover:bg-brand/90"
            onClick={() => {
              if (!f.name || !f.code) return;
              onAdd({ ...f, status: "Active" });
              setF({ name: "", code: "", start: "09:00", end: "17:00", breakMin: 60, workingHours: 7, graceMin: 5 });
            }}
          >
            Add template
          </Button>
        </div>
      </SectionCard>
      <SectionCard title="Templates" desc={`${shifts.length} templates`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase text-muted-foreground">
              <tr><th className="px-2 py-2 text-left">ID</th><th className="px-2 py-2 text-left">Name</th><th className="px-2 py-2 text-left">Code</th><th className="px-2 py-2 text-left">Hours</th><th className="px-2 py-2 text-right">Break</th><th className="px-2 py-2 text-right">Grace</th><th className="px-2 py-2 text-left">Departments</th><th className="px-2 py-2 text-left">Status</th></tr>
            </thead>
            <tbody>
              {shifts.map((s) => (
                <tr key={s.id} className="border-t border-black/5">
                  <td className="px-2 py-2 font-mono text-xs">{s.id}</td>
                  <td className="px-2 py-2 font-medium">{s.name}</td>
                  <td className="px-2 py-2 font-mono text-xs">{s.code}</td>
                  <td className="px-2 py-2">{s.start} – {s.end}</td>
                  <td className="px-2 py-2 text-right">{s.breakMin}m</td>
                  <td className="px-2 py-2 text-right">{s.graceMin}m</td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">{s.departments?.join(", ") ?? "All"}</td>
                  <td className="px-2 py-2"><Pill tone={s.status === "Active" ? "success" : "muted"}>{s.status}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}