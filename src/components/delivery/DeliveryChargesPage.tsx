import { useState } from "react";
import { PageHeader } from "@/components/buildpos/PageHeader";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import { Field, Select } from "@/components/delivery/FormFields";
import { useFleetStore, MOVEMENT_ENDPOINTS } from "@/lib/delivery/fleet-store";

const VAT_RATE = 0.15;

export function DeliveryChargesPage() {
  const routes = useFleetStore((s) => s.routes);
  const [calc, setCalc] = useState({ routeId: routes[2]?.id ?? routes[0]?.id ?? "", orderValue: 1800, weightTons: 0.32, heavy: "No" });

  const route = routes.find((r) => r.id === calc.routeId);
  const internal = route ? MOVEMENT_ENDPOINTS[route.movementType].internal : false;
  const base = !route || internal ? 0 : route.standardFee;
  const heavy = !route || internal || calc.heavy === "No" ? 0 : route.heavyFee;
  const free = route?.freeThreshold && Number(calc.orderValue) >= route.freeThreshold;
  const net = free ? 0 : base + heavy + (route && !internal ? route.loadingFee : 0);
  const vat = Number((net * VAT_RATE).toFixed(2));

  return (
    <div className="space-y-4">
      <PageHeader group="Delivery" title="Delivery Charges" desc="Charge matrix per route and coverage area. Internal stock movements never carry a customer charge." />

      <SectionCard title="Charge calculator" desc="Pick a route to price a delivery.">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Select label="Route" v={calc.routeId} onChange={(v) => setCalc({ ...calc, routeId: v })} options={routes.map((r) => ({ value: r.id, label: `${r.id} — ${r.name}` }))} />
          <Field label="Order Value (SAR)" type="number" v={String(calc.orderValue)} onChange={(v) => setCalc({ ...calc, orderValue: Number(v) })} />
          <Field label="Weight (t)" type="number" v={String(calc.weightTons)} onChange={(v) => setCalc({ ...calc, weightTons: Number(v) })} />
          <Select label="Heavy Material" v={calc.heavy} onChange={(v) => setCalc({ ...calc, heavy: v })} options={[{ value: "No", label: "No" }, { value: "Yes", label: "Yes" }]} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5 text-sm">
          <div className="rounded-xl border border-black/5 p-3"><div className="text-[11px] uppercase text-muted-foreground">Standard fee</div><div className="font-mono">SAR {base}</div></div>
          <div className="rounded-xl border border-black/5 p-3"><div className="text-[11px] uppercase text-muted-foreground">Heavy fee</div><div className="font-mono">SAR {heavy}</div></div>
          <div className="rounded-xl border border-black/5 p-3"><div className="text-[11px] uppercase text-muted-foreground">Loading fee</div><div className="font-mono">SAR {route && !internal ? route.loadingFee : 0}</div></div>
          <div className="rounded-xl border border-black/5 p-3"><div className="text-[11px] uppercase text-muted-foreground">VAT 15%</div><div className="font-mono">SAR {vat}</div></div>
          <div className="rounded-xl border border-brand/30 bg-brand/5 p-3"><div className="text-[11px] uppercase text-muted-foreground">Total charge</div><div className="font-mono text-brand">SAR {(net + vat).toFixed(2)}</div></div>
        </div>
        {internal && <div className="mt-2 text-xs text-muted-foreground">This is an internal movement route — no customer charge is applied.</div>}
        {free && <div className="mt-2 text-xs text-success">Order value exceeds the free-delivery threshold (SAR {route?.freeThreshold}).</div>}
      </SectionCard>

      <SectionCard title="Charge matrix" desc={`${routes.length} routes`}>
        <div className="ui-table-scroll overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="whitespace-nowrap px-2 py-2 text-left">Route</th>
                <th className="whitespace-nowrap px-2 py-2 text-left">Movement</th>
                <th className="whitespace-nowrap px-2 py-2 text-left">Coverage</th>
                <th className="whitespace-nowrap px-2 py-2 text-right">Standard</th>
                <th className="whitespace-nowrap px-2 py-2 text-right">Heavy</th>
                <th className="whitespace-nowrap px-2 py-2 text-right">Loading</th>
                <th className="whitespace-nowrap px-2 py-2 text-right">Min Order</th>
                <th className="whitespace-nowrap px-2 py-2 text-right">Free Over</th>
                <th className="whitespace-nowrap px-2 py-2 text-left">Same-Day</th>
              </tr>
            </thead>
            <tbody>
              {routes.map((r) => {
                const isInternal = MOVEMENT_ENDPOINTS[r.movementType].internal;
                return (
                  <tr key={r.id} className="border-t border-black/5">
                    <td className="px-2 py-2"><span className="font-mono text-xs text-brand">{r.id}</span><div className="text-xs text-muted-foreground">{r.name}</div></td>
                    <td className="px-2 py-2 text-xs">{r.movementType}</td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">{r.coverageArea || r.destination}</td>
                    <td className="px-2 py-2 text-right font-mono text-xs">{isInternal ? <Pill tone="muted">No charge</Pill> : `SAR ${r.standardFee}`}</td>
                    <td className="px-2 py-2 text-right font-mono text-xs">{isInternal ? "—" : `SAR ${r.heavyFee}`}</td>
                    <td className="px-2 py-2 text-right font-mono text-xs">{isInternal ? "—" : `SAR ${r.loadingFee}`}</td>
                    <td className="px-2 py-2 text-right font-mono text-xs">{r.minOrderValue ? `SAR ${r.minOrderValue}` : "—"}</td>
                    <td className="px-2 py-2 text-right font-mono text-xs">{r.freeThreshold ? `SAR ${r.freeThreshold}` : "—"}</td>
                    <td className="px-2 py-2"><Pill tone={r.sameDay ? "success" : "muted"}>{r.sameDay ? `Before ${r.cutOffTime}` : "Scheduled only"}</Pill></td>
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
