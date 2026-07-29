import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost } from "./client";

export type PrintJobDto = {
  id: number; terminalId: number | null; orderId: number | null; type: string; previewText: string;
  escPosBase64: string; status: string; createdAt: string;
};

export function usePrintReceipt() {
  return useMutation({
    mutationFn: (request: { orderId: number; terminalId: number | null }) => apiPost<PrintJobDto>("/api/print/receipt", request),
  });
}

// Barcode: just the Code128 symbol + its digits, no product info — a minimal re-labeling/scanning
// sticker. Label: the full shelf/price tag — name, SKU, price — AND the barcode symbol + digits
// underneath. Two separate print actions in the UI, not tabs of one dialog (see PrintBarcodeDialog.tsx
// / PrintLabelDialog.tsx).
export type LabelTemplate = "Barcode" | "Label";

export function usePrintLabel() {
  return useMutation({
    mutationFn: (request: {
      productId: number; terminalId: number | null; template?: LabelTemplate; overridePrice?: number;
      // How far to feed past the content before the cutter fires — a physical constant of the
      // specific printer that the user tunes themselves (see lib/buildpos/label-print-settings.ts).
      extraFeedLines?: number;
    }) => apiPost<PrintJobDto>("/api/print/label", request),
  });
}

export function usePrintLabelsBatch() {
  return useMutation({
    mutationFn: (request: {
      items: { productId: number; copies: number; overridePrice?: number }[];
      terminalId: number | null;
      template?: LabelTemplate;
      extraFeedLines?: number;
    }) => apiPost<PrintJobDto[]>("/api/print/labels/batch", request),
  });
}

export function useTestPrint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (deviceId: number) => apiPost<PrintJobDto>("/api/print/test", { deviceId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["network", "devices"] }),
  });
}
