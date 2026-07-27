import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateCustomer, useUpdateCustomer, type CustomerDto } from "@/lib/api/pos";

const TYPES = ["WalkIn", "Retail", "Contractor", "B2B"];
const TYPE_LABELS: Record<string, string> = { WalkIn: "Walk-in", Retail: "Retail", Contractor: "Contractor", B2B: "B2B" };
// BRD §7 (CR-038): which of the product's list prices this customer is charged — independent of
// Type above (a Contractor-type customer isn't automatically Contractor-priced).
const PRICE_LIST_TYPES = ["Retail", "Contractor", "Wholesale", "Project"];

const EMPTY = {
  type: "Retail", nameEn: "", nameAr: "", phone: "", email: "", vatNo: "", creditLimit: "0",
  city: "", district: "", address: "", projectName: "", creditTermDays: "", priceListType: "Retail",
};

export function CustomerFormDialog({ customer, open, onOpenChange }: { customer: CustomerDto | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [form, setForm] = useState(EMPTY);
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const isEdit = customer !== null;
  const saving = createCustomer.isPending || updateCustomer.isPending;

  useEffect(() => {
    if (!open) return;
    if (customer) {
      setForm({
        type: customer.type, nameEn: customer.nameEn, nameAr: customer.nameAr ?? "", phone: customer.phone ?? "",
        email: customer.email ?? "", vatNo: customer.vatNo ?? "", creditLimit: String(customer.creditLimit),
        city: customer.city ?? "", district: customer.district ?? "", address: customer.address ?? "",
        projectName: customer.projectName ?? "", creditTermDays: customer.creditTermDays ? String(customer.creditTermDays) : "",
        priceListType: customer.priceListType ?? "Retail",
      });
    } else {
      setForm(EMPTY);
    }
  }, [open, customer]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const creditLimitValid = form.creditLimit === "" || Number(form.creditLimit) >= 0;
  const creditTermDaysValid = form.creditTermDays === "" || Number(form.creditTermDays) >= 0;
  const isValid = !!form.nameEn.trim() && creditLimitValid && creditTermDaysValid;

  async function submit() {
    if (!isValid) return;
    const payload = {
      nameEn: form.nameEn.trim(), nameAr: form.nameAr || null, type: form.type, phone: form.phone || null,
      email: form.email || null, vatNo: form.vatNo || null, creditLimit: Number(form.creditLimit) || 0,
      city: form.city || null, district: form.district || null, address: form.address || null,
      loyaltyEnrolled: customer?.loyaltyEnrolled ?? false,
      projectName: form.projectName || null, creditTermDays: form.creditTermDays ? Number(form.creditTermDays) : null,
      priceListType: form.priceListType,
    };
    try {
      if (isEdit) {
        await updateCustomer.mutateAsync({ id: customer.id, ...payload });
        toast.success("Customer updated");
      } else {
        await createCustomer.mutateAsync(payload);
        toast.success("Customer added");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save this customer.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{isEdit ? `Edit ${customer!.nameEn}` : "Add Customer"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Type</label>
            <Select value={form.type} onValueChange={(v) => set("type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Phone</label>
            <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+966 5x xxx xxxx" />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Name (English) *</label>
            <Input value={form.nameEn} onChange={(e) => set("nameEn", e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Name (Arabic)</label>
            <Input value={form.nameAr} onChange={(e) => set("nameAr", e.target.value)} dir="rtl" />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Email</label>
            <Input value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">VAT / CR Number</label>
            <Input value={form.vatNo} onChange={(e) => set("vatNo", e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Price List</label>
            <Select value={form.priceListType} onValueChange={(v) => set("priceListType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRICE_LIST_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {(form.type === "Contractor" || form.type === "B2B") && (
            <>
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Project Name</label>
                <Input value={form.projectName} onChange={(e) => set("projectName", e.target.value)} placeholder="e.g. Al Narjis Villas Phase 2" />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Credit Term (days)</label>
                <Input type="number" value={form.creditTermDays} onChange={(e) => set("creditTermDays", e.target.value)} placeholder="30" />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Credit Limit (ر.س)</label>
                <Input type="number" value={form.creditLimit} onChange={(e) => set("creditLimit", e.target.value)} />
              </div>
            </>
          )}

          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">City</label>
            <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">District</label>
            <Input value={form.district} onChange={(e) => set("district", e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Address</label>
            <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" disabled={!isValid || saving} onClick={submit} className="bg-brand text-brand-foreground hover:bg-brand/90">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isEdit ? "Save Changes" : "Add Customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
