import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut } from "./client";
import type { LiveTable } from "./admin";

export type SalesSegmentDto = { segment: string; value: number; sharePct: number; tx: number; avgBasket: number; returnsPct: number; trend: string };
export type KpiDto = { id: number; name: string; category: string; owner: string; target: number; actual: number; variancePct: number; status: string; period: string };
export type ReportDefinitionDto = { id: number; code: string; name: string; category: string; owner: string; frequency: string; format: string; status: string };
export type BiFeedDto = { id: number; name: string; source: string; destination: string; frequency: string; lastRun: string; rows: number; failed: number; latency: string; status: string };
export type OverviewAreaDto = { area: string; status: string; owner: string; metric: string; value: string; sla: string };
export type AdminOverviewDto = { activeUsers: number; pendingApprovals: number; openMaintenanceTickets: number; criticalAuditEvents24h: number; complianceOverdue: number; areas: OverviewAreaDto[] };

export const useInsightsSales = (enabled = true) => useQuery({ queryKey: ["insights", "sales"], queryFn: () => apiGet<SalesSegmentDto[]>("/api/insights/sales"), enabled });
export const useInsightsKpi = (enabled = true) => useQuery({ queryKey: ["insights", "kpi"], queryFn: () => apiGet<KpiDto[]>("/api/insights/kpi"), enabled });
export const useInsightsReports = (enabled = true) => useQuery({ queryKey: ["insights", "reports"], queryFn: () => apiGet<ReportDefinitionDto[]>("/api/insights/reports"), enabled });
export const useInsightsBi = (enabled = true) => useQuery({ queryKey: ["insights", "bi"], queryFn: () => apiGet<BiFeedDto[]>("/api/insights/bi"), enabled });
export const useAdminOverview = (enabled = true) => useQuery({ queryKey: ["admin", "overview"], queryFn: () => apiGet<AdminOverviewDto>("/api/admin/overview"), enabled });

export function useUpdateKpiTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, target }: { id: number; target: number }) => apiPut(`/api/insights/kpi/${id}/target`, { target }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["insights", "kpi"] }),
  });
}
export function useSetReportStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: "Active" | "Inactive" }) => apiPut<ReportDefinitionDto>(`/api/insights/reports/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["insights", "reports"] }),
  });
}
export function useRetryBiFeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiPost<BiFeedDto>(`/api/insights/bi/${id}/retry`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["insights", "bi"] }),
  });
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function mapSales(rows: SalesSegmentDto[]): LiveTable {
  return {
    columns: ["Segment", "Value (ر.س)", "Share %", "Tx", "Avg Basket", "Returns %", "Trend"],
    statusCol: -1,
    rows: rows.map((s) => [s.segment, s.value.toFixed(2), `${s.sharePct}%`, s.tx, s.avgBasket.toFixed(2), `${s.returnsPct}%`, s.trend]),
  };
}

export function mapKpis(rows: KpiDto[]): LiveTable {
  return {
    columns: ["KPI", "Category", "Owner", "Target", "Actual", "Variance", "Status", "Period"],
    statusCol: 6,
    ids: rows.map((k) => k.id),
    rows: rows.map((k) => [k.name, k.category, k.owner, k.target.toFixed(1), k.actual.toFixed(1), `${k.variancePct > 0 ? "+" : ""}${k.variancePct}%`, k.status, k.period]),
  };
}

export function mapReports(rows: ReportDefinitionDto[]): LiveTable {
  return {
    columns: ["Code", "Report", "Category", "Owner", "Frequency", "Format", "Status"],
    statusCol: 6,
    ids: rows.map((r) => r.id),
    rows: rows.map((r) => [r.code, r.name, r.category, r.owner, r.frequency, r.format, r.status]),
  };
}

export function mapBiFeeds(rows: BiFeedDto[]): LiveTable {
  return {
    columns: ["Feed", "Source", "Destination", "Frequency", "Last Run", "Rows", "Failed", "Latency", "Status"],
    statusCol: 8,
    ids: rows.map((f) => f.id),
    rows: rows.map((f) => [f.name, f.source, f.destination, f.frequency, fmtDateTime(f.lastRun), f.rows, f.failed, f.latency, f.status]),
  };
}

export function mapOverview(o: AdminOverviewDto): LiveTable {
  return {
    columns: ["Area", "Status", "Owner", "Metric", "Value", "SLA"],
    statusCol: 1,
    rows: o.areas.map((a) => [a.area, a.status, a.owner, a.metric, a.value, a.sla]),
  };
}
