import { PageHeader } from "@/components/buildpos/PageHeader";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import { useDeliveryStore } from "@/lib/delivery/store";

export function VehiclesPage() {
  const vehicles = useDeliveryStore((s) => s.vehicles);
  return (
    <div className="space-y-4">
      <PageHeader group="Delivery" title="Vehicle Assignments" desc="Fleet vehicles used for delivery — capacity, driver, and current dispatch." />
      <SectionCard title="Vehicles" desc={`${vehicles.length} in fleet`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-2 py-2 text-left">Vehicle</th>
                <th className="px-2 py-2 text-left">Registration</th>
                <th className="px-2 py-2 text-left">Type</th>
                <th className="px-2 py-2 text-left">Branch</th>
                <th className="px-2 py-2 text-right">Capacity</th>
                <th className="px-2 py-2 text-right">Load</th>
                <th className="px-2 py-2 text-left">Driver</th>
                <th className="px-2 py-2 text-left">Delivery</th>
                <th className="px-2 py-2 text-left">Device</th>
                <th className="px-2 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => {
                const util = v.currentLoad ? Math.min(100, Math.round((v.currentLoad / v.capacityTons) * 100)) : 0;
                return (
                  <tr key={v.id} className="border-t border-black/5">
                    <td className="px-2 py-2 font-mono text-xs text-brand">{v.id}</td>
                    <td className="px-2 py-2 font-mono text-xs">{v.registration}</td>
                    <td className="px-2 py-2">{v.type}</td>
                    <td className="px-2 py-2 text-muted-foreground">{v.branch}</td>
                    <td className="px-2 py-2 text-right">{v.capacityTons} t</td>
                    <td className="px-2 py-2 text-right">
                      <div className="inline-flex items-center gap-2">
                        <div className="h-1.5 w-16 rounded-full bg-black/5">
                          <div className={`h-1.5 rounded-full ${util > 90 ? "bg-critical" : util > 70 ? "bg-warning" : "bg-brand"}`} style={{ width: `${util}%` }} />
                        </div>
                        <span className="font-mono text-[11px]">{v.currentLoad ?? 0} t</span>
                      </div>
                    </td>
                    <td className="px-2 py-2 font-mono text-xs">{v.driverEmpId ?? "—"}</td>
                    <td className="px-2 py-2 font-mono text-xs">{v.currentDelivery ?? "—"}</td>
                    <td className="px-2 py-2"><Pill tone={v.deviceStatus === "Online" ? "success" : v.deviceStatus === "Idle" ? "warning" : "critical"}>{v.deviceStatus}</Pill></td>
                    <td className="px-2 py-2"><Pill tone={v.status === "Available" ? "success" : v.status === "Inactive" ? "muted" : "info"}>{v.status}</Pill></td>
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