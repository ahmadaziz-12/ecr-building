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

export function usePrintLabel() {
  return useMutation({
    mutationFn: (request: { productId: number; terminalId: number | null }) => apiPost<PrintJobDto>("/api/print/label", request),
  });
}

export function useTestPrint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (deviceId: number) => apiPost<PrintJobDto>("/api/print/test", { deviceId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["network", "devices"] }),
  });
}
