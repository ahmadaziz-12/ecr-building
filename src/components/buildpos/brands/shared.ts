import { productImage } from "@/lib/buildpos/product-images";
import type { Severity } from "@/lib/buildpos/format";

export const brandImage: Record<string, string> = {
  rebar: productImage["STEEL-RBR-12MM"],
  cement: productImage["CEM-OPC-50KG"],
};

export function money(n: number) {
  return `SAR ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function stockTone(status: string): Severity {
  if (status === "In Stock") return "success";
  if (status === "Low Stock") return "warning";
  return "critical";
}

export function fmtTs(ts: number) {
  return new Date(ts).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}