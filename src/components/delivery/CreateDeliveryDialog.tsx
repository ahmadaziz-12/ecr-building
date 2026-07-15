import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronLeft, ChevronRight, Package, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useDeliveryStore, type DeliveryLine, type DeliveryOrder } from "@/lib/delivery/store";
import { useHrStore, driverAvailable, employeeName } from "@/lib/hr/store";

const STEPS = ["Source Order", "Items", "Address", "Schedule", "Driver & Vehicle", "Charges", "Review"];

const SEED_LINES: DeliveryLine[] = [
  { sku: "CEM-OPC-50KG", product: "OPC Cement 50KG", ordered: 40, deliveryQty: 40, uom: "Bag", unitWeight: 50 },
  { sku: "STEEL-RBR-12MM", product: "Steel Rebar 12MM", ordered: 12, deliveryQty: 12, uom: "Bundle", unitWeight: 483 },
];

export function CreateDeliveryDialog({ open, onOpenChange, sourceOrderId }: { open: boolean; onOpenChange: (v: boolean) => void; sourceOrderId?: string }) {
  const [step, setStep] = useState(0);
  const [f, setF] = useState({
    orderId: sourceOrderId ?? "ORD-2026-8096",
    invoiceId: "",
    customer: "Al Noor Contracting Company",
    customerType: "Contractor" as DeliveryOrder["customerType"],
    project: "PRJ-RYD-221",
    poRef: "PO-AN-7782",
    branch: "Riyadh Main Branch",
    paymentStatus: "Credit" as DeliveryOrder["paymentStatus"],
    lines: SEED_LINES,
    addressType: "Project Site" as const,
    contactName: "Site Engineer",
    contactMobile: "+966 55 111 2233",
    city: "Riyadh",
    district: "Al Malqa",
    street: "King Fahd Rd",
    landmark: "",
    instructions: "",
    latLng: "",
    promisedDate: new Date().toISOString().slice(0, 10),
    timeSlot: "04:00 PM–06:00 PM",
    promisedTime: "04:00 PM",
    priority: "High" as DeliveryOrder["priority"],
    area: "Riyadh North",
    driverEmpId: "",
    vehicleId: "",
    fee: 350,
    handling: 0,
    heavy: 0,
    discount: 0,
    amount: 7850,
    notes: "",
  });

  const addOrder = useDeliveryStore((s) => s.addOrder);
  const drivers = useDeliveryStore((s) => s.drivers);
  const vehicles = useDeliveryStore((s) => s.vehicles);
  const zones = useDeliveryStore((s) => s.zones);
  const employees = useHrStore((s) => s.employees);

  const totalWeight = useMemo(
    () => f.lines.reduce((sum, l) => sum + (l.deliveryQty * l.unitWeight) / 1000, 0),
    [f.lines]
  );
  const vehicle = vehicles.find((v) => v.id === f.vehicleId);
  const overload = vehicle && totalWeight > vehicle.capacityTons;
  const driverEmp = employees.find((e) => e.id === f.driverEmpId);
  const driverCheck = f.driverEmpId ? driverAvailable(f.driverEmpId) : null;
  const chargesSubtotal = f.fee + f.handling + f.heavy - f.discount;
  const vat = Math.round(chargesSubtotal * 0.15 * 100) / 100;
  const totalCharge = chargesSubtotal + vat;

  function close(v: boolean) {
    onOpenChange(v);
    if (!v) setTimeout(() => setStep(0), 200);
  }

  function save(mode: "draft" | "confirm") {
    if (!f.customer || !f.contactName || !f.contactMobile) {
      toast.error("Address and contact number are mandatory.");
      return;
    }
    if (new Date(f.promisedDate) < new Date(new Date().toDateString())) {
      toast.error("Delivery date cannot be earlier than the current business date.");
      return;
    }
    if (overload) {
      toast.error("Estimated load exceeds vehicle capacity. Manager approval required.");
      return;
    }
    if (f.driverEmpId && driverCheck && !driverCheck.ok) {
      toast.error(`Driver unavailable — ${driverCheck.reason}.`);
      return;
    }
    const doc = addOrder({
      orderId: f.orderId,
      invoiceId: f.invoiceId || undefined,
      customer: f.customer,
      customerType: f.customerType,
      project: f.project,
      poRef: f.poRef,
      branch: f.branch,
      paymentStatus: f.paymentStatus,
      lines: f.lines,
      weightTons: Number(totalWeight.toFixed(2)),
      area: f.area,
      address: {
        type: f.addressType,
        contactName: f.contactName,
        contactMobile: f.contactMobile,
        city: f.city,
        district: f.district,
        street: f.street,
        landmark: f.landmark,
        instructions: f.instructions,
        latLng: f.latLng,
      },
      promisedDate: f.promisedDate,
      promisedTime: f.promisedTime,
      timeSlot: f.timeSlot,
      priority: f.priority,
      driverEmpId: f.driverEmpId || undefined,
      driverName: driverEmp ? employeeName(driverEmp) : undefined,
      vehicleId: f.vehicleId || undefined,
      vehicleType: vehicle?.type,
      vehicleCapacity: vehicle?.capacityTons,
      amount: f.amount,
      charges: { fee: f.fee, handling: f.handling, heavy: f.heavy, discount: f.discount, vat },
      stockReserved: mode === "confirm",
      stage: mode === "confirm" && f.driverEmpId && f.vehicleId ? "Assigned" : "Pending",
      notes: f.notes,
    });
    toast.success(`${doc.id} created`, {
      description: mode === "confirm" ? "Stock reserved and driver assigned." : "Saved as draft — no stock reserved.",
    });
    close(false);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-4xl overflow-hidden p-0 sm:rounded-2xl">
        <div className="grid md:grid-cols-[220px_1fr]">
          <div className="relative hidden bg-sidebar-bg p-5 text-sidebar-fg md:block">
            <div className="pointer-events-none absolute inset-0 blueprint-grid-dark opacity-40" />
            <div className="relative">
              <div className="mb-4 flex items-center gap-2">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-white/10"><Package className="h-4 w-4" /></div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Flow</p>
                  <p className="text-sm font-semibold">Create Delivery Order</p>
                </div>
              </div>
              <ol className="space-y-1">
                {STEPS.map((s, i) => (
                  <li key={s}>
                    <button
                      type="button"
                      onClick={() => i <= step && setStep(i)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition ${
                        i === step ? "bg-white/10 text-white" : i < step ? "text-white/80 hover:bg-white/5" : "text-white/40"
                      }`}
                    >
                      <span className={`grid h-5 w-5 flex-none place-items-center rounded-full text-[10px] font-bold ${
                        i < step ? "bg-success text-success-foreground" : i === step ? "bg-white text-brand" : "bg-white/10 text-white/60"
                      }`}>
                        {i < step ? <Check className="h-3 w-3" /> : i + 1}
                      </span>
                      <span className="truncate font-medium">{s}</span>
                    </button>
                  </li>
                ))}
              </ol>
              <p className="mt-5 text-[11px] leading-relaxed text-white/50">
                Estimated weight <span className="text-white">{totalWeight.toFixed(2)} t</span>
                {vehicle && <> · capacity {vehicle.capacityTons} t</>}
              </p>
              {overload && <p className="mt-1 rounded bg-critical/25 px-2 py-1 text-[11px] font-medium text-white">⚠ Overload — needs manager override</p>}
            </div>
          </div>

          <div className="relative flex max-h-[85vh] flex-col">
            <div className="flex items-start justify-between gap-3 border-b border-black/5 px-6 py-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-brand">Step {step + 1} of {STEPS.length}</p>
                <h2 className="font-display text-lg font-bold">{STEPS[step]}</h2>
              </div>
              <button onClick={() => close(false)} className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-black/5"><X className="h-4 w-4" /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {step === 0 && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Field label="Order Number" v={f.orderId} onChange={(v) => setF({ ...f, orderId: v })} />
                  <Field label="Invoice Number" v={f.invoiceId} onChange={(v) => setF({ ...f, invoiceId: v })} />
                  <Field label="Customer" v={f.customer} onChange={(v) => setF({ ...f, customer: v })} required />
                  <Select label="Customer Type" v={f.customerType} onChange={(v) => setF({ ...f, customerType: v as DeliveryOrder["customerType"] })} options={["Walk-in", "Retail", "Contractor", "B2B"]} />
                  <Field label="Project Code" v={f.project} onChange={(v) => setF({ ...f, project: v })} />
                  <Field label="PO Reference" v={f.poRef} onChange={(v) => setF({ ...f, poRef: v })} />
                  <Select label="Branch" v={f.branch} onChange={(v) => setF({ ...f, branch: v })} options={["Riyadh Main Branch", "Jeddah Branch", "Dammam Branch", "Makkah Branch", "Madinah Branch", "Khobar Building Materials Branch"]} />
                  <Select label="Payment Status" v={f.paymentStatus} onChange={(v) => setF({ ...f, paymentStatus: v as DeliveryOrder["paymentStatus"] })} options={["Paid", "Unpaid", "Partial", "Credit"]} />
                </div>
              )}

              {step === 1 && (
                <div className="space-y-3">
                  <div className="overflow-x-auto rounded-xl border border-black/5">
                    <table className="w-full text-sm">
                      <thead className="bg-canvas text-[10px] uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left">SKU</th>
                          <th className="px-3 py-2 text-left">Product</th>
                          <th className="px-3 py-2 text-right">Ordered</th>
                          <th className="px-3 py-2 text-right">Delivery Qty</th>
                          <th className="px-3 py-2 text-left">UOM</th>
                          <th className="px-3 py-2 text-right">Wt / u (kg)</th>
                          <th className="px-3 py-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {f.lines.map((l, i) => (
                          <tr key={i} className="border-t border-black/5">
                            <td className="px-3 py-2 font-mono text-xs">{l.sku}</td>
                            <td className="px-3 py-2">{l.product}</td>
                            <td className="px-3 py-2 text-right">{l.ordered}</td>
                            <td className="px-3 py-2 text-right">
                              <input
                                type="number"
                                className="w-20 rounded border border-black/10 bg-white px-2 py-1 text-right text-sm"
                                value={l.deliveryQty}
                                max={l.ordered}
                                onChange={(e) => {
                                  const q = Math.min(l.ordered, Math.max(0, Number(e.target.value)));
                                  const next = [...f.lines];
                                  next[i] = { ...l, deliveryQty: q };
                                  setF({ ...f, lines: next });
                                }}
                              />
                            </td>
                            <td className="px-3 py-2">{l.uom}</td>
                            <td className="px-3 py-2 text-right">{l.unitWeight}</td>
                            <td className="px-3 py-2 text-right font-medium">{((l.deliveryQty * l.unitWeight) / 1000).toFixed(2)} t</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-black/5 bg-canvas px-3 py-2 text-sm">
                    <span className="text-muted-foreground">Total estimated weight</span>
                    <span className="font-display text-base font-bold">{totalWeight.toFixed(2)} tons</span>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Select label="Address Type" v={f.addressType} onChange={(v) => setF({ ...f, addressType: v as typeof f.addressType })} options={["Customer Address", "Project Site", "Different Address", "Branch Pickup"]} />
                  <Field label="Contact Person" v={f.contactName} onChange={(v) => setF({ ...f, contactName: v })} required />
                  <Field label="Contact Mobile" v={f.contactMobile} onChange={(v) => setF({ ...f, contactMobile: v })} required />
                  <Field label="City" v={f.city} onChange={(v) => setF({ ...f, city: v })} />
                  <Field label="District" v={f.district} onChange={(v) => setF({ ...f, district: v })} />
                  <Field label="Street / Building" v={f.street} onChange={(v) => setF({ ...f, street: v })} />
                  <Field label="Landmark" v={f.landmark} onChange={(v) => setF({ ...f, landmark: v })} />
                  <Field label="Lat / Lng" v={f.latLng} onChange={(v) => setF({ ...f, latLng: v })} />
                  <TextArea label="Site Instructions" v={f.instructions} onChange={(v) => setF({ ...f, instructions: v })} full />
                </div>
              )}

              {step === 3 && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Field label="Delivery Date" type="date" v={f.promisedDate} onChange={(v) => setF({ ...f, promisedDate: v })} required />
                  <Select label="Time Slot" v={f.timeSlot} onChange={(v) => setF({ ...f, timeSlot: v, promisedTime: v.split("–")[0] })} options={["08:00 AM–10:00 AM", "10:00 AM–12:00 PM", "12:00 PM–02:00 PM", "02:00 PM–04:00 PM", "04:00 PM–06:00 PM", "06:00 PM–08:00 PM", "Custom Time"]} />
                  <Select label="Priority" v={f.priority} onChange={(v) => setF({ ...f, priority: v as DeliveryOrder["priority"] })} options={["Urgent", "High", "Standard", "Low"]} />
                  <Select label="Delivery Zone / Area" v={f.area} onChange={(v) => setF({ ...f, area: v })} options={zones.map((z) => z.name)} />
                  <TextArea label="Delivery Notes" v={f.notes} onChange={(v) => setF({ ...f, notes: v })} full />
                </div>
              )}

              {step === 4 && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="md:col-span-2 rounded-lg border border-info/20 bg-info/5 p-3 text-xs text-foreground/80">
                    Driver availability updates from HR — approved leave, expired licence and inactive status block assignment automatically.
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Driver</label>
                    <select
                      className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm"
                      value={f.driverEmpId}
                      onChange={(e) => setF({ ...f, driverEmpId: e.target.value })}
                    >
                      <option value="">Unassigned</option>
                      {drivers.map((d) => {
                        const chk = driverAvailable(d.empId);
                        return (
                          <option key={d.empId} value={d.empId} disabled={!chk.ok}>
                            {d.name} — {chk.ok ? d.status : `⛔ ${chk.reason}`}
                          </option>
                        );
                      })}
                    </select>
                    {driverCheck && !driverCheck.ok && (
                      <p className="mt-1 text-[11px] text-critical">Blocked: {driverCheck.reason}</p>
                    )}
                  </div>
                  <Select label="Vehicle" v={f.vehicleId} onChange={(v) => setF({ ...f, vehicleId: v })} options={vehicles.map((v) => `${v.id}`)} />
                  {vehicle && (
                    <div className="md:col-span-2 grid grid-cols-3 gap-2 rounded-lg border border-black/5 bg-canvas p-3 text-xs">
                      <div><span className="text-muted-foreground">Type:</span> <strong>{vehicle.type}</strong></div>
                      <div><span className="text-muted-foreground">Capacity:</span> <strong>{vehicle.capacityTons} t</strong></div>
                      <div><span className="text-muted-foreground">Est. Load:</span> <strong className={overload ? "text-critical" : ""}>{totalWeight.toFixed(2)} t</strong></div>
                      {overload && <div className="col-span-3 rounded bg-critical/10 px-2 py-1 text-critical">⚠ Load exceeds vehicle capacity — manager approval required.</div>}
                    </div>
                  )}
                </div>
              )}

              {step === 5 && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Field label="Delivery Fee (SAR)" type="number" v={String(f.fee)} onChange={(v) => setF({ ...f, fee: Number(v) })} />
                  <Field label="Handling Fee" type="number" v={String(f.handling)} onChange={(v) => setF({ ...f, handling: Number(v) })} />
                  <Field label="Heavy Material Fee" type="number" v={String(f.heavy)} onChange={(v) => setF({ ...f, heavy: Number(v) })} />
                  <Field label="Discount" type="number" v={String(f.discount)} onChange={(v) => setF({ ...f, discount: Number(v) })} />
                  <div className="md:col-span-2 rounded-xl border border-black/5 bg-canvas p-3 text-sm">
                    <div className="flex justify-between"><span>Subtotal</span><span className="font-mono">{chargesSubtotal.toFixed(2)} ر.س</span></div>
                    <div className="flex justify-between"><span>VAT 15%</span><span className="font-mono">{vat.toFixed(2)} ر.س</span></div>
                    <div className="mt-1 flex justify-between border-t border-black/5 pt-1 text-base font-semibold"><span>Total Delivery Charge</span><span className="font-mono">{totalCharge.toFixed(2)} ر.س</span></div>
                  </div>
                </div>
              )}

              {step === 6 && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-black/5 bg-canvas p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-brand">Summary</p>
                    <div className="mt-2 grid grid-cols-2 gap-y-2 text-sm md:grid-cols-3">
                      <Summary k="Customer" v={f.customer} />
                      <Summary k="Order" v={f.orderId} />
                      <Summary k="Branch" v={f.branch} />
                      <Summary k="Items" v={String(f.lines.length)} />
                      <Summary k="Weight" v={`${totalWeight.toFixed(2)} t`} />
                      <Summary k="Area" v={f.area} />
                      <Summary k="Date" v={f.promisedDate} />
                      <Summary k="Time" v={f.timeSlot ?? f.promisedTime} />
                      <Summary k="Priority" v={f.priority} />
                      <Summary k="Driver" v={driverEmp ? employeeName(driverEmp) : "Unassigned"} />
                      <Summary k="Vehicle" v={f.vehicleId || "Unassigned"} />
                      <Summary k="Delivery Charge" v={`${totalCharge.toFixed(2)} ر.س`} />
                    </div>
                  </div>
                  <p className="rounded bg-info/10 px-3 py-2 text-xs text-foreground/80">
                    Save as draft to keep in Pending. Confirm reserves stock and (if driver + vehicle set) moves the order to Assigned.
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-black/5 bg-white px-6 py-3">
              <Button variant="ghost" size="sm" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
                <ChevronLeft className="h-4 w-4" /> Back
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => close(false)}>Cancel</Button>
                {step < STEPS.length - 1 ? (
                  <Button size="sm" onClick={() => setStep(step + 1)} className="gap-1 bg-brand text-brand-foreground hover:bg-brand/90">
                    Continue <ChevronRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <>
                    <Button size="sm" variant="outline" onClick={() => save("draft")}>Save Draft</Button>
                    <Button size="sm" onClick={() => save("confirm")} className="bg-brand text-brand-foreground hover:bg-brand/90">
                      <Check className="h-4 w-4" /> Reserve & Confirm
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, v, onChange, type = "text", required }: { label: string; v: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}{required && <span className="text-critical"> *</span>}
      </label>
      <input type={type} value={v} onChange={(e) => onChange(e.target.value)} className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15" />
    </div>
  );
}
function TextArea({ label, v, onChange, full }: { label: string; v: string; onChange: (v: string) => void; full?: boolean }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
      <textarea value={v} onChange={(e) => onChange(e.target.value)} rows={3} className="min-h-[84px] w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15" />
    </div>
  );
}
function Select({ label, v, onChange, options }: { label: string; v: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
      <select value={v} onChange={(e) => onChange(e.target.value)} className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15">
        <option value="">Select…</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
function Summary({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{k}</p>
      <p className="font-medium text-foreground">{v}</p>
    </div>
  );
}