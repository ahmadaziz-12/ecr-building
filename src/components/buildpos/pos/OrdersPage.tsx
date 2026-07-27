import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { PageHeader, KpiGrid } from "@/components/buildpos/PageHeader";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  RowActionsMenu, statusTone, FilterBar, emptyFilterDraft, usePagination, PaginationBar, exportToCsv,
  type FilterFieldDef,
} from "./shared";
import { OrderDetailDialog } from "./OrderDetailDialog";
import { VoidOrderDialog } from "./VoidOrderDialog";
import { CreateReturnDialog } from "./CreateReturnDialog";
import { QuotationFormDialog } from "./QuotationFormDialog";
import { PaymentDialog } from "./PaymentDialog";
import { ReceiptDialog } from "./ReceiptDialog";
import {
  useOrders, useQuotations, useSendQuotation, useAcceptQuotation, useRejectQuotation, useConvertQuotation,
  usePayOrder, type OrderDto, type QuotationDto, type PaymentInput,
} from "@/lib/api/pos";
import { useAuth } from "@/lib/api/auth";
import { useBranches, useTerminals } from "@/lib/api/admin";

const TABS = ["All Orders", "Completed", "Pending", "Delivery", "Returned", "Voided", "Quotations"] as const;
type Tab = (typeof TABS)[number];

const ORDER_STATUSES = ["Pending", "Completed", "Dispatched", "Delivered", "Returned", "Voided"];
// "Delivery" isn't a real order Type (Checkout only ever sets Retail/Contractor) — whether an order
// has a delivery component is tracked separately via deliveryOrderId (BRD §3.5), surfaced by the
// "Delivery" TAB below and the Delivery column, not this Type filter.
const ORDER_TYPES = ["Retail", "Contractor", "Quotation"];
const PAYMENT_METHODS = ["Cash", "Mada", "ApplePay", "StcPay", "Transfer", "Loyalty"];
const PAYMENT_LABELS: Record<string, string> = { ApplePay: "Apple Pay", StcPay: "STC Pay" };

function fmtSar(n: number): string {
  return `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" });
}
function isToday(iso: string): boolean {
  return new Date(iso).toDateString() === new Date().toDateString();
}
function inDateRange(iso: string, from: string, to: string): boolean {
  const d = new Date(iso).getTime();
  if (from && d < new Date(from).getTime()) return false;
  if (to && d > new Date(`${to}T23:59:59`).getTime()) return false;
  return true;
}

const PAGE_SIZE = 10;

const QUOTATION_FIELDS: FilterFieldDef[] = [{ kind: "search", key: "search", placeholder: "Search quote #, customer…" }];

export function OrdersPage() {
  const { user, hasAccess } = useAuth();
  const canReturn = hasAccess("Finance");
  const { data: branches } = useBranches(user?.branchId == null);
  const { data: terminals } = useTerminals(true);
  const effectiveBranchId = user?.branchId ?? branches?.[0]?.id ?? null;

  const { data: orders, refetch: refetchOrders, isFetching: ordersFetching } = useOrders(true);
  const { data: quotations, refetch: refetchQuotations, isFetching: quotationsFetching } = useQuotations(true);
  const sendQuotation = useSendQuotation();
  const acceptQuotation = useAcceptQuotation();
  const rejectQuotation = useRejectQuotation();
  const convertQuotation = useConvertQuotation();

  const [tab, setTab] = useState<Tab>("All Orders");
  const [detailOrder, setDetailOrder] = useState<OrderDto | null>(null);
  const [voidTarget, setVoidTarget] = useState<OrderDto | null>(null);
  const [returnTarget, setReturnTarget] = useState<OrderDto | null>(null);
  const [creatingQuote, setCreatingQuote] = useState(false);
  const [reprintTarget, setReprintTarget] = useState<OrderDto | null>(null);
  // Pending/Unpaid orders (converted quotations) get settled right here — without this the list is
  // a dead end: "Awaiting payment" with no way to ever take the payment.
  const [payTarget, setPayTarget] = useState<OrderDto | null>(null);
  const payOrder = usePayOrder();

  const payOutstanding = payTarget
    ? payTarget.grandTotal - payTarget.payments.filter((p) => p.status === "Completed").reduce((s, p) => s + p.amount, 0)
    : 0;

  async function handleTakePayment(payments: PaymentInput[]) {
    if (!payTarget) return;
    const terminalId = terminals?.find((t) => t.branchId === payTarget.branchId)?.id ?? null;
    const paid = await payOrder.mutateAsync({ id: payTarget.id, payments, terminalId });
    toast.success(`Payment accepted · ${paid.orderNo}`, { description: fmtSar(paid.grandTotal) });
    setPayTarget(null);
  }

  const orderFields: FilterFieldDef[] = useMemo(() => [
    { kind: "date", key: "dateFrom", placeholder: "From Date" },
    { kind: "date", key: "dateTo", placeholder: "To Date" },
    { kind: "select", key: "branchId", placeholder: "Branch", options: (branches ?? []).map((b) => String(b.id)), labels: Object.fromEntries((branches ?? []).map((b) => [String(b.id), b.nameEn])) },
    { kind: "select", key: "terminalId", placeholder: "Terminal", options: (terminals ?? []).map((t) => String(t.id)), labels: Object.fromEntries((terminals ?? []).map((t) => [String(t.id), t.name])) },
    { kind: "select", key: "cashier", placeholder: "Cashier", options: Array.from(new Set((orders ?? []).map((o) => o.cashierName))) },
    { kind: "select", key: "status", placeholder: "Status", options: ORDER_STATUSES },
    { kind: "select", key: "type", placeholder: "Order Type", options: ORDER_TYPES },
    { kind: "select", key: "paymentMethod", placeholder: "Payment Method", options: PAYMENT_METHODS, labels: PAYMENT_LABELS },
    { kind: "search", key: "search", placeholder: "Search order #, customer…" },
  ], [branches, terminals, orders]);
  const fields = tab === "Quotations" ? QUOTATION_FIELDS : orderFields;

  const allFilterKeys = useMemo(() => Array.from(new Set([...orderFields, ...QUOTATION_FIELDS].map((f) => f.key))), [orderFields]);
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(allFilterKeys.map((k) => [k, ""])));
  const [applied, setApplied] = useState<Record<string, string>>(draft);

  const allOrders = orders ?? [];
  const filteredOrders = useMemo(() => {
    return allOrders.filter((o) => {
      if (tab === "Completed" && o.status !== "Completed") return false;
      if (tab === "Pending" && o.status !== "Pending") return false;
      if (tab === "Delivery" && o.deliveryOrderId === null) return false;
      if (tab === "Returned" && o.status !== "Returned") return false;
      if (tab === "Voided" && o.status !== "Voided") return false;
      if (applied.status && o.status !== applied.status) return false;
      if (applied.type && o.type !== applied.type) return false;
      if (applied.paymentMethod && !o.payments.some((p) => p.method === applied.paymentMethod)) return false;
      if (applied.branchId && String(o.branchId) !== applied.branchId) return false;
      if (applied.terminalId && String(o.terminalId) !== applied.terminalId) return false;
      if (applied.cashier && o.cashierName !== applied.cashier) return false;
      if ((applied.dateFrom || applied.dateTo) && !inDateRange(o.createdAt, applied.dateFrom, applied.dateTo)) return false;
      if (applied.search) {
        const t = applied.search.trim().toLowerCase();
        if (t && !o.orderNo.toLowerCase().includes(t) && !o.customerName.toLowerCase().includes(t)) return false;
      }
      return true;
    });
  }, [allOrders, tab, applied]);

  const filteredQuotations = useMemo(() => {
    return (quotations ?? []).filter((q) => {
      if (!applied.search) return true;
      const t = applied.search.trim().toLowerCase();
      return !t || q.quoteNo.toLowerCase().includes(t) || q.customerName.toLowerCase().includes(t);
    });
  }, [quotations, applied.search]);

  const ordersPagination = usePagination(filteredOrders, PAGE_SIZE, JSON.stringify(applied) + tab);
  const quotationsPagination = usePagination(filteredQuotations, PAGE_SIZE, applied.search ?? "");

  const kpis = useMemo(() => {
    const today = allOrders.filter((o) => isToday(o.createdAt));
    const completed = allOrders.filter((o) => o.status === "Completed");
    const pending = allOrders.filter((o) => o.status === "Pending");
    const voided = allOrders.filter((o) => o.status === "Voided");
    return [
      { label: "Orders Today", value: today.length, sub: `${allOrders.length} total`, tone: "success" as const },
      { label: "Completed", value: completed.length, sub: allOrders.length ? `${Math.round((completed.length / allOrders.length) * 100)}% of total` : "—", tone: "success" as const },
      { label: "Pending", value: pending.length, sub: "Awaiting payment", tone: "warning" as const },
      { label: "Voided", value: voided.length, sub: "Reversed & restocked", tone: "muted" as const },
      { label: "Quotations", value: (quotations ?? []).length, sub: `${(quotations ?? []).filter((q) => q.status === "Sent").length} awaiting reply`, tone: "info" as const },
    ];
  }, [allOrders, quotations]);

  async function handleQuotationAction(q: QuotationDto, action: "send" | "accept" | "reject" | "convert") {
    try {
      if (action === "send") await sendQuotation.mutateAsync(q.id);
      if (action === "accept") await acceptQuotation.mutateAsync(q.id);
      if (action === "reject") await rejectQuotation.mutateAsync(q.id);
      if (action === "convert") {
        const order = await convertQuotation.mutateAsync(q.id);
        toast.success(`Converted to ${order.orderNo}`);
        return;
      }
      toast.success(`${q.quoteNo} updated`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed.");
    }
  }

  function handleExport() {
    if (tab === "Quotations") {
      exportToCsv("quotations.csv", ["Quote #", "Customer", "Created By", "Valid Until", "Amount", "Status"],
        filteredQuotations.map((q) => [q.quoteNo, q.customerName, q.createdByName, q.validUntil, q.grandTotal, q.status]));
    } else {
      exportToCsv("orders.csv", ["Order ID", "Date/Time", "Customer", "Type", "Payment", "Items", "Amount", "Cashier", "Status"],
        filteredOrders.map((o) => [o.orderNo, o.createdAt, o.customerName, o.type, o.payments.map((p) => p.method).join(" + "), o.lines.reduce((s, l) => s + l.qty, 0), o.grandTotal, o.cashierName, o.status]));
    }
    toast.success("Exported CSV");
  }

  return (
    <div className="space-y-4">
      <PageHeader
        group="Operate"
        title="Orders"
        desc="Completed, pending, voided, returned, delivery and quotation orders."
        onRefresh={() => { refetchOrders(); refetchQuotations(); }}
        onExport={handleExport}
        actions={
          tab === "Quotations" ? undefined : (
            <Button asChild size="sm" className="h-9 gap-1.5 bg-brand text-brand-foreground hover:bg-brand/90">
              <Link to="/operate/pos-checkout">New Sale</Link>
            </Button>
          )
        }
        primary={tab === "Quotations" ? "New Quotation" : undefined}
        onPrimary={tab === "Quotations" ? () => setCreatingQuote(true) : undefined}
      />

      <div className="flex flex-wrap gap-1 border-b border-black/5">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative px-3 py-2 text-sm font-medium transition ${tab === t ? "text-brand" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t}
            {tab === t && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand" />}
          </button>
        ))}
      </div>

      <FilterBar
        fields={fields}
        draft={draft}
        onDraftChange={(key, value) => setDraft((d) => ({ ...d, [key]: value }))}
        onApply={() => setApplied(draft)}
        onReset={() => { const empty = emptyFilterDraft(fields); setDraft((d) => ({ ...d, ...empty })); setApplied((a) => ({ ...a, ...empty })); }}
        resultLabel={`${(tab === "Quotations" ? filteredQuotations : filteredOrders).length} record(s)${ordersFetching || quotationsFetching ? " · refreshing…" : ""}`}
      />

      <KpiGrid items={kpis} />

      {tab === "Quotations" ? (
        <SectionCard title="Quotations" desc={`${filteredQuotations.length} records`}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quote #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Created By</TableHead>
                  <TableHead>Valid Until</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotationsPagination.pageRows.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell className="font-mono text-xs">{q.quoteNo}</TableCell>
                    <TableCell>{q.customerName}</TableCell>
                    <TableCell className="text-muted-foreground">{q.createdByName}</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(q.validUntil).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</TableCell>
                    <TableCell className="text-right font-medium">{fmtSar(q.grandTotal)}</TableCell>
                    <TableCell><Pill tone={statusTone(q.status)}>{q.status}{q.convertedOrderNo ? ` → ${q.convertedOrderNo}` : ""}</Pill></TableCell>
                    <TableCell>
                      <RowActionsMenu
                        actions={[
                          { label: "Send to Customer", onClick: () => handleQuotationAction(q, "send"), disabled: q.status !== "Draft" },
                          { label: "Mark Accepted", onClick: () => handleQuotationAction(q, "accept"), disabled: q.status !== "Sent" },
                          { label: "Mark Rejected", onClick: () => handleQuotationAction(q, "reject"), disabled: q.status !== "Sent" },
                          "separator",
                          { label: "Convert to Order", onClick: () => handleQuotationAction(q, "convert"), disabled: !["Sent", "Accepted"].includes(q.status) },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {filteredQuotations.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No quotations match those filters.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {filteredQuotations.length > 0 && (
            <PaginationBar page={quotationsPagination.page} totalPages={quotationsPagination.totalPages} totalCount={quotationsPagination.totalCount} pageSize={PAGE_SIZE} onChange={quotationsPagination.setPage} />
          )}
        </SectionCard>
      ) : (
        <SectionCard title="Order Ledger" desc={`${filteredOrders.length} records`}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Date/Time</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Cashier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Delivery</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordersPagination.pageRows.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-xs">{o.orderNo}</TableCell>
                    <TableCell className="text-muted-foreground">{fmtTime(o.createdAt)}</TableCell>
                    <TableCell>{o.customerName}</TableCell>
                    <TableCell>{o.type}</TableCell>
                    <TableCell className="text-muted-foreground">{o.payments.map((p) => p.method).join(" + ") || "—"}</TableCell>
                    <TableCell className="text-right">{o.lines.reduce((s, l) => s + l.qty, 0)}</TableCell>
                    <TableCell className="text-right font-medium">{fmtSar(o.grandTotal)}</TableCell>
                    <TableCell className="text-muted-foreground">{o.cashierName}</TableCell>
                    <TableCell><Pill tone={statusTone(o.status)}>{o.status}</Pill></TableCell>
                    <TableCell>
                      {o.deliveryOrderNo ? <Pill tone={statusTone(o.deliveryStage ?? "")}>{o.deliveryStage}</Pill> : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <RowActionsMenu
                        actions={[
                          { label: "View", onClick: () => setDetailOrder(o) },
                          { label: "Reprint Receipt", onClick: () => setReprintTarget(o) },
                          ...(o.status === "Pending" && o.paymentStatus !== "Paid"
                            ? [{ label: "Take Payment", onClick: () => setPayTarget(o) }]
                            : []),
                          "separator",
                          ...(canReturn ? [{ label: "Create Return", onClick: () => setReturnTarget(o), disabled: o.status === "Voided" || o.status === "Returned" }] : []),
                          { label: "Void Order", onClick: () => setVoidTarget(o), destructive: true, disabled: o.status === "Voided" || o.status === "Returned" },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {filteredOrders.length === 0 && (
                  <TableRow><TableCell colSpan={11} className="py-8 text-center text-sm text-muted-foreground">No orders match those filters.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {filteredOrders.length > 0 && (
            <PaginationBar page={ordersPagination.page} totalPages={ordersPagination.totalPages} totalCount={ordersPagination.totalCount} pageSize={PAGE_SIZE} onChange={ordersPagination.setPage} />
          )}
        </SectionCard>
      )}

      <OrderDetailDialog order={detailOrder} onClose={() => setDetailOrder(null)} />
      <VoidOrderDialog order={voidTarget} onClose={() => setVoidTarget(null)} />
      <CreateReturnDialog order={returnTarget} onClose={() => setReturnTarget(null)} />
      <QuotationFormDialog open={creatingQuote} onOpenChange={setCreatingQuote} branchId={effectiveBranchId} />
      <PaymentDialog
        open={payTarget !== null}
        onOpenChange={(v) => !v && setPayTarget(null)}
        total={payOutstanding}
        onCharge={handleTakePayment}
      />
      <ReceiptDialog order={reprintTarget} terminalId={reprintTarget?.terminalId ?? null} onClose={() => setReprintTarget(null)} />
    </div>
  );
}
