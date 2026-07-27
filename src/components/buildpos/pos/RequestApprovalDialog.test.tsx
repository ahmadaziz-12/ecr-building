import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { API_BASE } from "@/lib/api/client";
import { RequestApprovalDialog } from "./RequestApprovalDialog";

// Module 1 (docs/BRD-GAP-IMPLEMENTATION-PLAN.md) — RequestApprovalDialog gained defaultAmount/
// defaultReason pre-fill and an onCreated callback so PosCheckout can pre-fill a discount-approval
// request and capture the created request's id to pass back into checkout.
function renderDialog(props: Partial<ComponentProps<typeof RequestApprovalDialog>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const onCreated = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <RequestApprovalDialog
        open
        onOpenChange={() => {}}
        branchId={1}
        defaultType="Discount"
        defaultAmount="8.00"
        defaultReason="8% discount requested — above my 5% limit"
        onCreated={onCreated}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { onCreated };
}

describe("RequestApprovalDialog", () => {
  it("pre-fills the amount and reason from the discount context", () => {
    renderDialog();

    expect(screen.getByDisplayValue("8.00")).toBeInTheDocument();
    expect(screen.getByDisplayValue("8% discount requested — above my 5% limit")).toBeInTheDocument();
  });

  it("submits the pre-filled request and reports the created approval back to the caller", async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${API_BASE}/api/pos/approvals`, () =>
        HttpResponse.json({
          id: 42, type: "Discount", branchId: 1, requestedByName: "Cashier", approverName: null,
          amount: 8, reason: "8% discount requested — above my 5% limit", status: "Pending",
          relatedOrderId: null, relatedOrderNo: null, createdAt: new Date(0).toISOString(), resolvedAt: null,
        }),
      ),
    );
    const { onCreated } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Submit Request" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 42, status: "Pending" })));
  });
});
