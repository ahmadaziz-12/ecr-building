import { Pill } from "@/components/buildpos/sections";
import { STAGE_TONE, type DeliveryOrder } from "@/lib/delivery/store";
import { CheckCircle2 } from "lucide-react";

export function DeliveryTimeline({ order }: { order: DeliveryOrder }) {
  const events = [
    { at: order.history[0]?.at ?? Date.now(), title: "Delivery Created", detail: `Source: ${order.orderId}` },
    ...order.history.map((h) => ({
      at: h.at,
      title: `${h.from} → ${h.to}`,
      detail: `${h.by}${h.note ? " · " + h.note : ""}`,
    })),
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-black/5 bg-canvas p-3 text-xs md:grid-cols-4">
        <div><span className="text-muted-foreground">Stage:</span> <strong><Pill tone={STAGE_TONE[order.stage]}>{order.stage}</Pill></strong></div>
        <div><span className="text-muted-foreground">Driver:</span> <strong>{order.driverName ?? "—"}</strong></div>
        <div><span className="text-muted-foreground">Vehicle:</span> <strong>{order.vehicleId ?? "—"}</strong></div>
        <div><span className="text-muted-foreground">Amount:</span> <strong>{order.amount} ر.س</strong></div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-black/5">
        <table className="w-full text-sm">
          <thead className="bg-canvas text-[10px] uppercase text-muted-foreground">
            <tr><th className="px-3 py-2 text-left">SKU</th><th className="px-3 py-2 text-left">Product</th><th className="px-3 py-2 text-right">Delivery</th><th className="px-3 py-2 text-right">Loaded</th><th className="px-3 py-2 text-right">Delivered</th></tr>
          </thead>
          <tbody>
            {order.lines.map((l) => (
              <tr key={l.sku} className="border-t border-black/5">
                <td className="px-3 py-2 font-mono text-xs">{l.sku}</td>
                <td className="px-3 py-2">{l.product}</td>
                <td className="px-3 py-2 text-right">{l.deliveryQty}</td>
                <td className="px-3 py-2 text-right">{l.loadedQty ?? "—"}</td>
                <td className="px-3 py-2 text-right">{l.deliveredQty ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ol className="relative border-l border-black/10 pl-5">
        {events.map((e, i) => (
          <li key={i} className="mb-3 last:mb-0">
            <span className="absolute -left-1.5 grid h-3 w-3 place-items-center rounded-full bg-brand" />
            <p className="text-xs font-medium text-foreground">{e.title}</p>
            <p className="text-[11px] text-muted-foreground">{new Date(e.at).toLocaleString()} · {e.detail}</p>
          </li>
        ))}
        {order.stage === "Delivered" && (
          <li className="mb-0">
            <span className="absolute -left-1.5 grid h-3 w-3 place-items-center rounded-full bg-success" />
            <p className="flex items-center gap-1 text-xs font-medium text-foreground"><CheckCircle2 className="h-3 w-3 text-success" /> Delivered — received by {order.receivedBy ?? "—"}</p>
            <p className="text-[11px] text-muted-foreground">{order.proof ? `Signature: ${order.proof}` : "No signature captured"}</p>
          </li>
        )}
      </ol>
    </div>
  );
}