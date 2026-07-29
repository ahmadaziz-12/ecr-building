import { useState } from "react";
import { toast } from "sonner";
import { Printer, Download } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/buildpos/sections";
import { statusTone, exportToCsv } from "./shared";
import { useCustomerLedger, useCustomerStatement, useRecordCustomerPayment } from "@/lib/api/pos";
import { CurrencyText } from "@/lib/buildpos/currency";

function fmtSar(n: number): string {
  return `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
}

const PAYMENT_METHODS = ["BankTransfer", "Cash", "Cheque", "Card"];

function RecordPaymentForm({ customerId, onDone }: { customerId: number; onDone: () => void }) {
  const recordPayment = useRecordCustomerPayment();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState(PAYMENT_METHODS[0]);
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");

  async function submit() {
    const parsed = Number(amount);
    if (!parsed || parsed <= 0) {
      toast.error("Enter a payment amount greater than zero.");
      return;
    }
    try {
      await recordPayment.mutateAsync({
        customerId,
        amount: parsed,
        method,
        referenceNo: referenceNo || null,
        notes: notes || null,
      });
      toast.success(`Payment of ${fmtSar(parsed)} recorded.`);
      setAmount("");
      setReferenceNo("");
      setNotes("");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not record this payment.");
    }
  }

  return (
    <div className="grid grid-cols-2 gap-2 rounded-lg border border-black/5 bg-canvas p-3">
      <Input
        placeholder="Amount"
        type="number"
        min="0"
        step="0.01"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <select
        className="h-9 rounded-md border border-black/10 bg-white px-2 text-sm"
        value={method}
        onChange={(e) => setMethod(e.target.value)}
      >
        {PAYMENT_METHODS.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <Input
        placeholder="Reference # (optional)"
        value={referenceNo}
        onChange={(e) => setReferenceNo(e.target.value)}
      />
      <Input
        placeholder="Notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <Button className="col-span-2" size="sm" onClick={submit} disabled={recordPayment.isPending}>
        {recordPayment.isPending ? "Recording…" : "Record Payment"}
      </Button>
    </div>
  );
}

export function CustomerStatementDialog({
  customerId,
  customerType,
  onClose,
}: {
  customerId: number | null;
  customerType?: string;
  onClose: () => void;
}) {
  const { data: statement, isLoading } = useCustomerStatement(customerId);
  const [tab, setTab] = useState<"orders" | "ledger">("orders");
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const isAccountCustomer = customerType === "B2B" || customerType === "Contractor";
  const { data: ledger, isLoading: ledgerLoading } = useCustomerLedger(
    tab === "ledger" && customerId !== null ? customerId : undefined,
  );

  function handleExport() {
    if (!statement) return;
    if (tab === "ledger") {
      exportToCsv(`${statement.customerName}-ledger.csv`, ["Date", "Reference", "Description", "Charged", "Paid/Credited"],
        (ledger ?? []).map((l) => [l.date, l.reference, l.description, l.debit, l.credit]));
    } else {
      exportToCsv(`${statement.customerName}-orders.csv`, ["Order #", "Date", "Amount", "Payment", "Status"],
        statement.orders.map((o) => [o.orderNo, o.createdAt, o.grandTotal, o.paymentStatus, o.status]));
    }
    toast.success("Exported CSV");
  }

  return (
    <Dialog
      open={customerId !== null}
      onOpenChange={(v) => {
        if (!v) {
          setTab("orders");
          setShowPaymentForm(false);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {statement ? `Statement — ${statement.customerName}` : "Statement"}
          </DialogTitle>
        </DialogHeader>
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {statement && (
          <>
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-black/5 bg-canvas p-3 text-sm">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Credit Limit
                </p>
                <p className="mt-0.5 font-medium"><CurrencyText value={fmtSar(statement.creditLimit)} /></p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Outstanding
                </p>
                <p className="mt-0.5 font-medium"><CurrencyText value={fmtSar(statement.outstanding)} /></p>
              </div>
            </div>

            <div className="flex items-center justify-between border-b border-black/5">
              <div className="flex gap-1">
                {(["orders", "ledger"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`relative px-3 py-2 text-sm font-medium transition ${tab === t ? "text-brand" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {t === "orders" ? "Orders" : "Account Ledger"}
                    {tab === t && (
                      <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand" />
                    )}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="ghost" className="gap-1.5" onClick={handleExport}>
                  <Download className="h-3.5 w-3.5" /> Export
                </Button>
                <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => window.print()}>
                  <Printer className="h-3.5 w-3.5" /> Print
                </Button>
                {tab === "ledger" && isAccountCustomer && (
                  <Button size="sm" variant="outline" onClick={() => setShowPaymentForm((v) => !v)}>
                    {showPaymentForm ? "Cancel" : "Record Payment"}
                  </Button>
                )}
              </div>
            </div>

            {tab === "ledger" && showPaymentForm && isAccountCustomer && (
              <RecordPaymentForm
                customerId={statement.customerId}
                onDone={() => setShowPaymentForm(false)}
              />
            )}

            {tab === "orders" && (
              <div className="max-h-96 overflow-y-auto rounded-lg border border-black/5">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-canvas text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-2 text-left">Order #</th>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2 text-left">Payment</th>
                      <th className="px-3 py-2 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.orders.map((o) => (
                      <tr key={o.id} className="border-t border-black/5">
                        <td className="px-3 py-2 font-mono text-xs">{o.orderNo}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {new Date(o.createdAt).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                        <td className="px-3 py-2 text-right font-medium"><CurrencyText value={fmtSar(o.grandTotal)} /></td>
                        <td className="px-3 py-2">{o.paymentStatus}</td>
                        <td className="px-3 py-2">
                          <Pill tone={statusTone(o.status)}>{o.status}</Pill>
                        </td>
                      </tr>
                    ))}
                    {statement.orders.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                          No orders yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {tab === "ledger" && (
              <div className="max-h-96 overflow-y-auto rounded-lg border border-black/5">
                {ledgerLoading && <p className="p-3 text-sm text-muted-foreground">Loading…</p>}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-canvas text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-left">Reference</th>
                      <th className="px-3 py-2 text-left">Description</th>
                      <th className="px-3 py-2 text-right">Charged</th>
                      <th className="px-3 py-2 text-right">Paid/Credited</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(ledger ?? []).map((l, i) => (
                      <tr key={i} className="border-t border-black/5">
                        <td className="px-3 py-2 text-muted-foreground">
                          {new Date(l.date).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{l.reference}</td>
                        <td className="px-3 py-2">{l.description}</td>
                        <td className="px-3 py-2 text-right font-medium">
                          <CurrencyText value={l.debit > 0 ? fmtSar(l.debit) : "—"} />
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-success">
                          <CurrencyText value={l.credit > 0 ? fmtSar(l.credit) : "—"} />
                        </td>
                      </tr>
                    ))}
                    {!ledgerLoading && (ledger ?? []).length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                          No account activity yet — this customer has never used account credit.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
