export const formatSAR = (n: number): string =>
  `${new Intl.NumberFormat("en-US").format(n)} ر.س`;

export const formatNumber = (n: number): string =>
  new Intl.NumberFormat("en-US").format(n);

export type Severity = "critical" | "warning" | "success" | "info" | "muted";

export const severityClass: Record<Severity, string> = {
  critical: "bg-critical/15 text-critical border-critical/30",
  warning: "bg-warning/15 text-warning-foreground border-warning/40",
  success: "bg-success/15 text-success-foreground border-success/30",
  info: "bg-info/15 text-info-foreground border-info/30",
  muted: "bg-white/10 text-white/70 border-white/15",
};