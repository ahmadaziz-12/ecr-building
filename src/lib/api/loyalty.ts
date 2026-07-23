import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "./client";

export type LoyaltyTransactionDto = {
  id: number;
  customerId: number;
  customerName: string;
  orderId: number | null;
  orderNo: string | null;
  branchId: number | null;
  branchName: string | null;
  type: string;
  points: number;
  description: string;
  createdByName: string | null;
  createdAt: string;
};

export type CustomerLoyaltyDto = {
  customerId: number;
  customerName: string;
  loyaltyEnrolled: boolean;
  points: number;
  pointsValue: number;
  lifetimePoints: number;
  tier: string;
  recent: LoyaltyTransactionDto[];
};

export const useLoyaltyTransactions = (customerId?: number, enabled = true) =>
  useQuery({
    queryKey: ["loyalty", "transactions", customerId ?? null],
    queryFn: () =>
      apiGet<LoyaltyTransactionDto[]>(
        `/api/loyalty/transactions${customerId ? `?customerId=${customerId}` : ""}`,
      ),
    enabled,
  });

export const useCustomerLoyalty = (customerId: number | null) =>
  useQuery({
    queryKey: ["loyalty", "customers", customerId],
    queryFn: () => apiGet<CustomerLoyaltyDto>(`/api/loyalty/customers/${customerId}`),
    enabled: customerId !== null,
  });

function invalidateLoyalty(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["loyalty"] });
  queryClient.invalidateQueries({ queryKey: ["pos", "customers"] });
}

export function useRedeemPoints() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: { customerId: number; points: number; description?: string }) =>
      apiPost<CustomerLoyaltyDto>("/api/loyalty/redeem", request),
    onSuccess: () => invalidateLoyalty(queryClient),
  });
}

export function useAdjustPoints() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: { customerId: number; points: number; description: string }) =>
      apiPost<CustomerLoyaltyDto>("/api/loyalty/adjust", request),
    onSuccess: () => invalidateLoyalty(queryClient),
  });
}
