import { useState } from "react";
import { PageHeader } from "@/components/buildpos/PageHeader";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import { useDeliveryStore } from "@/lib/delivery/store";
import { useHrStore, driverAvailable } from "@/lib/hr/store";

export function DriversPage() {
  const drivers = useDeliveryStore((s) => s.drivers);
  const employees = useHrStore((s) => s.employees);
  const [q, setQ] = useState("");
  const rows = drivers.filter((d) => !q || d.name.toLowerCase().includes(q.toLowerCase()) || d.empId.includes(q));

  return (
    <div className="space-y-4">
      <PageHeader group="Delivery" title="Driver Assignments" desc="Delivery & Dispatch employees. Availability is derived live from HR attendance, licence expiry and leave status." />
      <div className="rounded-xl border border-black/5 bg-white p-2">
        <input placeholder="Search driver…" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 w-64 rounded-lg border border-black/10 bg-canvas px-3 text-sm outline-none focus:border-brand" />
      </div>
      <SectionCard title="Drivers" desc={`${rows.length} of ${drivers.length}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-2 py-2 text-left">EMP</th>
                <th className="px-2 py-2 text-left">Driver</th>
                <th className="px-2 py-2 text-left">Branch</th>
                <th className="px-2 py-2 text-left">Mobile</th>
                <th className="px-2 py-2 text-left">Licence</th>
                <th className="px-2 py-2 text-left">Licence Expiry</th>
                <th className="px-2 py-2 text-left">Vehicle</th>
                <th className="px-2 py-2 text-left">Current DO</th>
                <th className="px-2 py-2 text-right">Today</th>
                <th className="px-2 py-2 text-left">Availability</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const chk = driverAvailable(d.empId);
                const emp = employees.find((e) => e.id === d.empId);
                return (
                  <tr key={d.empId} className="border-t border-black/5">
                    <td className="px-2 py-2 font-mono text-xs">{d.empId}</td>
                    <td className="px-2 py-2">{d.name}</td>
                    <td className="px-2 py-2 text-muted-foreground">{d.branch}</td>
                    <td className="px-2 py-2 font-mono text-xs">{d.mobile}</td>
                    <td className="px-2 py-2 font-mono text-xs">{d.license}</td>
                    <td className="px-2 py-2 text-muted-foreground">{d.licenseExpiry}</td>
                    <td className="px-2 py-2 font-mono text-xs">{d.vehicleId ?? "—"}</td>
                    <td className="px-2 py-2 font-mono text-xs">{d.currentDelivery ?? "—"}</td>
                    <td className="px-2 py-2 text-right">{d.deliveriesToday}</td>
                    <td className="px-2 py-2">
                      <Pill tone={chk.ok ? (d.status === "Available" ? "success" : "info") : "critical"}>
                        {chk.ok ? d.status : chk.reason ?? "Blocked"}
                      </Pill>
                      {emp?.status === "On Leave" && <span className="ml-1 text-[10px] text-warning">HR: On Leave</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}