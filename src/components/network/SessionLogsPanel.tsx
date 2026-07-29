import { useState } from "react";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtDate, useSessionLogs, useTerminals } from "@/lib/api/admin";
import { SARIcon } from "@/lib/buildpos/currency";

function statusTone(status: string): "critical" | "warning" | "success" | "info" | "muted" {
  if (status === "Open") return "info";
  if (status === "NeedsReview") return "warning";
  return "success";
}

export function SessionLogsPanel() {
  const [terminalId, setTerminalId] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: terminals } = useTerminals();
  const { data: sessions, isLoading } = useSessionLogs(true, {
    terminalId: terminalId !== "all" ? Number(terminalId) : undefined,
    status: status !== "all" ? status : undefined,
    dateFrom: dateFrom || undefined,
    // the backend compares OpenedAt <= dateTo, so send end-of-day to include the chosen day
    dateTo: dateTo ? `${dateTo}T23:59:59` : undefined,
  });

  return (
    <SectionCard title="Session Logs" desc={`${sessions?.length ?? 0} cashier shifts · live data`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={terminalId} onValueChange={setTerminalId}>
          <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Terminal" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Terminals</SelectItem>
            {terminals?.map((t) => (
              <SelectItem key={t.id} value={String(t.id)}>{t.code}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="Open">Open</SelectItem>
            <SelectItem value="NeedsReview">Needs Review</SelectItem>
            <SelectItem value="Closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="h-8 rounded-md border border-black/10 bg-canvas px-2 text-xs outline-none focus:border-brand/40"
        />
        <span className="text-xs text-muted-foreground">–</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="h-8 rounded-md border border-black/10 bg-canvas px-2 text-xs outline-none focus:border-brand/40"
        />
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Terminal</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Cashier</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Opened At</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Closed At</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Variance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions?.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-mono text-xs">{s.terminalName}</TableCell>
                <TableCell className="text-sm">{s.cashierName}</TableCell>
                <TableCell><Pill tone={statusTone(s.status)}>{s.status}</Pill></TableCell>
                <TableCell className="text-sm text-foreground/85">{fmtDate(s.openedAt)}</TableCell>
                <TableCell className="text-sm text-foreground/85">{s.closedAt ? fmtDate(s.closedAt) : "—"}</TableCell>
                <TableCell className="text-sm text-foreground/85">{s.variance !== null ? <><span>{s.variance.toFixed(2)}</span> <SARIcon /></> : "—"}</TableCell>
              </TableRow>
            ))}
            {!isLoading && (sessions?.length ?? 0) === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No sessions match the current filters.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </SectionCard>
  );
}
