import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { PageHeader } from "@/components/buildpos/PageHeader";
import { SectionCard } from "@/components/buildpos/sections";
import { Button } from "@/components/ui/button";
import { useDeliveryStore } from "@/lib/delivery/store";

export function ZonesPage() {
  const zones = useDeliveryStore((s) => s.zones);
  const add = useDeliveryStore((s) => s.addZone);
  const remove = useDeliveryStore((s) => s.removeZone);
  const [f, setF] = useState({ name: "", city: "Riyadh", distanceKm: 10, fee: 100 });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleAdd() {
    if (!f.name) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    const res = await add(f);
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error ?? "Could not create zone.");
      return;
    }
    setF({ name: "", city: "Riyadh", distanceKm: 10, fee: 100 });
    toast.success("Zone added");
  }

  async function handleRemove(id: string) {
    setDeletingId(id);
    const res = await remove(id);
    setDeletingId(null);
    if (!res.ok) {
      toast.error(res.error ?? "Could not delete zone.");
      return;
    }
    toast.success("Zone deleted");
  }

  return (
    <div className="space-y-4">
      <PageHeader group="Delivery" title="Delivery Zones" desc="Named areas mapped to distance and default delivery fee." />
      <SectionCard title="Add zone" desc="Zone name + city + distance + fee. Used in delivery scheduling.">
        <div className="ui-card-grid">
          <input placeholder="Name (e.g. Al Malqa)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="h-9 rounded-lg border border-black/10 bg-white px-3 text-sm" />
          <input placeholder="City" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} className="h-9 rounded-lg border border-black/10 bg-white px-3 text-sm" />
          <input type="number" placeholder="Distance (km)" value={f.distanceKm} onChange={(e) => setF({ ...f, distanceKm: Number(e.target.value) })} className="h-9 rounded-lg border border-black/10 bg-white px-3 text-sm" />
          <input type="number" placeholder="Fee (SAR)" value={f.fee} onChange={(e) => setF({ ...f, fee: Number(e.target.value) })} className="h-9 rounded-lg border border-black/10 bg-white px-3 text-sm" />
          <Button onClick={handleAdd} disabled={saving} className="bg-brand text-brand-foreground hover:bg-brand/90 md:col-span-4">{saving ? "Adding…" : "Add zone"}</Button>
        </div>
      </SectionCard>
      <SectionCard title="Zones" desc={`${zones.length} zones`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr><th className="px-2 py-2 text-left">Code</th><th className="px-2 py-2 text-left">Name</th><th className="px-2 py-2 text-left">City</th><th className="px-2 py-2 text-right">Distance (km)</th><th className="px-2 py-2 text-right">Fee (SAR)</th><th /></tr>
            </thead>
            <tbody>
              {zones.map((z) => (
                <tr key={z.id} className="border-t border-black/5">
                  <td className="px-2 py-2 font-mono text-xs">{z.id}</td>
                  <td className="px-2 py-2 font-medium">{z.name}</td>
                  <td className="px-2 py-2 text-muted-foreground">{z.city}</td>
                  <td className="px-2 py-2 text-right">{z.distanceKm}</td>
                  <td className="px-2 py-2 text-right font-mono">{z.fee}</td>
                  <td className="px-2 py-2 text-right">
                    <button
                      onClick={() => handleRemove(z.id)}
                      disabled={deletingId === z.id}
                      className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-critical/10 hover:text-critical disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}