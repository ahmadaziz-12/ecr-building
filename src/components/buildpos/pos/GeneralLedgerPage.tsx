import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { PageHeader, KpiGrid } from "@/components/buildpos/PageHeader";
import { SectionCard } from "@/components/buildpos/sections";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { exportToCsv } from "./shared";
import { useAccounts, useJournal, type AccountDto, type JournalEntryDto } from "@/lib/api/finance";

const TABS = ["Trial Balance", "Journal"] as const;
type Tab = (typeof TABS)[number];

function fmtSar(n: number): string {
  return `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
}

// Every account's own accounting convention: Asset/Expense balances read Debit − Credit (their
// "natural" balance grows with debits); Liability/Equity/Revenue read Credit − Debit — the backend
// (AccountsController) already computes it this way, this is just display-side grouping.
function AccountGroup({ title, accounts }: { title: string; accounts: AccountDto[] }) {
  if (accounts.length === 0) return null;
  const total = accounts.reduce((s, a) => s + a.balance, 0);
  return (
    <div>
      <div className="flex items-center justify-between px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>{title}</span>
        <span>{fmtSar(total)}</span>
      </div>
      {accounts.map((a) => (
        <div
          key={a.id}
          className="flex items-center justify-between border-t border-black/5 px-3 py-2 text-sm"
        >
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{a.code}</span>
            <span>{a.name}</span>
          </div>
          <span className={`font-medium ${a.balance < 0 ? "text-critical" : ""}`}>
            {fmtSar(a.balance)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function GeneralLedgerPage() {
  const [tab, setTab] = useState<Tab>("Trial Balance");
  const {
    data: accounts,
    refetch: refetchAccounts,
    isFetching: fetchingAccounts,
  } = useAccounts(tab === "Trial Balance");
  const {
    data: journal,
    refetch: refetchJournal,
    isFetching: fetchingJournal,
  } = useJournal(tab === "Journal");

  const grouped = useMemo(() => {
    const list = accounts ?? [];
    return {
      Asset: list.filter((a) => a.type === "Asset"),
      Liability: list.filter((a) => a.type === "Liability"),
      Equity: list.filter((a) => a.type === "Equity"),
      Revenue: list.filter((a) => a.type === "Revenue"),
      Expense: list.filter((a) => a.type === "Expense"),
    };
  }, [accounts]);

  const kpis = useMemo(() => {
    const list = accounts ?? [];
    const assets = list.filter((a) => a.type === "Asset").reduce((s, a) => s + a.balance, 0);
    const liabilities = list
      .filter((a) => a.type === "Liability")
      .reduce((s, a) => s + a.balance, 0);
    const revenue = list.filter((a) => a.type === "Revenue").reduce((s, a) => s + a.balance, 0);
    const expense = list.filter((a) => a.type === "Expense").reduce((s, a) => s + a.balance, 0);
    return [
      {
        label: "Total Assets",
        value: fmtSar(assets),
        sub: `${grouped.Asset.length} accounts`,
        tone: "info" as const,
      },
      {
        label: "Total Liabilities",
        value: fmtSar(liabilities),
        sub: `${grouped.Liability.length} accounts`,
        tone: "warning" as const,
      },
      {
        label: "Net Income (to date)",
        value: fmtSar(revenue - expense),
        sub: "Revenue − Expense",
        tone: revenue - expense >= 0 ? ("success" as const) : ("critical" as const),
      },
      {
        label: "Journal Entries",
        value: journal?.length ?? "—",
        sub: "Most recent 200",
        tone: "muted" as const,
      },
    ];
  }, [accounts, journal, grouped]);

  function handleExport() {
    if (tab === "Trial Balance") {
      exportToCsv(
        "trial-balance.csv",
        ["Code", "Account", "Type", "Balance"],
        (accounts ?? []).map((a) => [a.code, a.name, a.type, a.balance]),
      );
    } else {
      exportToCsv(
        "journal.csv",
        ["Date", "Reference", "Description", "Account", "Memo", "Debit", "Credit"],
        (journal ?? []).flatMap((e) =>
          e.lines.map((l) => [
            e.date,
            e.reference,
            e.description,
            `${l.accountCode} · ${l.accountName}`,
            l.memo ?? "",
            l.debit,
            l.credit,
          ]),
        ),
      );
    }
    toast.success("Exported CSV");
  }

  return (
    <div className="space-y-4">
      <PageHeader
        group="Finance & Customers"
        title="General Ledger"
        desc="Chart of accounts, trial balance, and the full double-entry journal behind every sale, payment, return, and expense."
        onRefresh={() => (tab === "Trial Balance" ? refetchAccounts() : refetchJournal())}
        onExport={handleExport}
      />

      <div className="flex flex-wrap gap-1 border-b border-black/5">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative px-3 py-2 text-sm font-medium transition ${tab === t ? "text-brand" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t}
            {tab === t && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand" />
            )}
          </button>
        ))}
      </div>

      <KpiGrid items={kpis} />

      {tab === "Trial Balance" && (
        <SectionCard
          title="Trial Balance"
          desc={`${(accounts ?? []).length} accounts${fetchingAccounts ? " · refreshing…" : ""}`}
        >
          <div className="divide-y divide-black/5 rounded-lg border border-black/5">
            <AccountGroup title="Assets" accounts={grouped.Asset} />
            <AccountGroup title="Liabilities" accounts={grouped.Liability} />
            <AccountGroup title="Equity" accounts={grouped.Equity} />
            <AccountGroup title="Revenue" accounts={grouped.Revenue} />
            <AccountGroup title="Expenses" accounts={grouped.Expense} />
            {(accounts ?? []).length === 0 && (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                No GL accounts configured.
              </p>
            )}
          </div>
        </SectionCard>
      )}

      {tab === "Journal" && (
        <SectionCard
          title="Journal"
          desc={`${(journal ?? []).length} most recent entries${fetchingJournal ? " · refreshing…" : ""}`}
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(journal ?? []).flatMap((e: JournalEntryDto) => {
                  const totalDebit = e.lines.reduce((s, l) => s + l.debit, 0);
                  const totalCredit = e.lines.reduce((s, l) => s + l.credit, 0);
                  const balanced = Math.round((totalDebit - totalCredit) * 100) === 0;
                  return e.lines.map((l, i) => (
                    <TableRow key={`${e.id}-${i}`} className={i === e.lines.length - 1 ? "border-b-2 border-black/10" : ""}>
                      {i === 0 ? (
                        <>
                          <TableCell
                            rowSpan={e.lines.length}
                            className="align-top text-muted-foreground"
                          >
                            {new Date(e.date).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </TableCell>
                          <TableCell rowSpan={e.lines.length} className="align-top">
                            <span className="font-mono text-xs">{e.reference}</span>
                            {balanced && (
                              <span
                                title="Total debits equal total credits"
                                className="mt-1 flex items-center gap-1 text-[10px] font-medium text-success"
                              >
                                <CheckCircle2 className="h-3 w-3" /> Balanced
                              </span>
                            )}
                          </TableCell>
                          <TableCell rowSpan={e.lines.length} className="align-top">
                            {e.description}
                          </TableCell>
                        </>
                      ) : null}
                      <TableCell>
                        <div>
                          <span className="font-mono text-xs text-muted-foreground">
                            {l.accountCode}
                          </span>{" "}
                          <span>{l.accountName}</span>
                        </div>
                        {l.memo && (
                          <p className="mt-0.5 text-[11px] italic text-muted-foreground">{l.memo}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {l.debit > 0 ? fmtSar(l.debit) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {l.credit > 0 ? fmtSar(l.credit) : "—"}
                      </TableCell>
                    </TableRow>
                  ));
                })}
                {(journal ?? []).length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      No journal entries yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
