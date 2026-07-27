import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { API_BASE } from "@/lib/api/client";
import type { CustomerDto } from "@/lib/api/pos";
import { PaymentDialog } from "./PaymentDialog";

function renderDialog(ui: React.ReactElement) {
  server.use(
    http.get(`${API_BASE}/api/pos/orders/loyalty-config`, () =>
      HttpResponse.json({ pointsPerSarEarned: 1, pointsPerSarRedeemed: 100, minRedeemPoints: 500, maxRedeemPctOfTotal: 20 }),
    ),
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

// Module 3 (docs/BRD-GAP-IMPLEMENTATION-PLAN.md) — the Account Credit tab is only offered for B2B/
// Contractor customers and must show the correct available-credit figure (BRD §4.2).
function b2bCustomer(overrides: Partial<CustomerDto> = {}): CustomerDto {
  return {
    id: 1, nameEn: "Al-Nasser Contracting Co.", nameAr: null, type: "B2B", phone: "0500000000", email: null,
    vatNo: null, creditLimit: 5000, outstanding: 3000, city: null, district: null, address: null,
    loyaltyEnrolled: false, loyaltyPoints: 0, loyaltyLifetimePoints: 0, loyaltyTier: "Bronze", status: "Active",
    lastPurchaseAt: null, projectName: null, creditTermDays: null, createdAt: new Date(0).toISOString(),
    loyaltyLifetimeSpend: 0, accountManagerUserId: null, accountManagerName: null, priorityBilling: false,
    ...overrides,
  };
}

describe("PaymentDialog — Account Credit (BRD §4.2)", () => {
  it("does not show an Account tab for a retail customer", () => {
    renderDialog(<PaymentDialog open total={100} onOpenChange={() => {}} onCharge={vi.fn()} customer={b2bCustomer({ type: "Retail" })} />);

    expect(screen.queryByRole("tab", { name: /account/i })).not.toBeInTheDocument();
  });

  it("shows the correct credit limit, outstanding, and available credit for a B2B customer", async () => {
    const user = userEvent.setup();
    renderDialog(<PaymentDialog open total={100} onOpenChange={() => {}} onCharge={vi.fn()} customer={b2bCustomer({ creditLimit: 5000, outstanding: 3000 })} />);

    await user.click(screen.getByRole("tab", { name: /account/i }));

    expect(screen.getByText("5,000.00 ر.س")).toBeInTheDocument(); // credit limit
    expect(screen.getByText("3,000.00 ر.س")).toBeInTheDocument(); // outstanding
    expect(screen.getByText("2,000.00 ر.س")).toBeInTheDocument(); // available credit
  });

  it("warns when the charge exceeds available credit", async () => {
    const user = userEvent.setup();
    renderDialog(<PaymentDialog open total={2500} onOpenChange={() => {}} onCharge={vi.fn()} customer={b2bCustomer({ creditLimit: 5000, outstanding: 3000 })} />);

    await user.click(screen.getByRole("tab", { name: /account/i }));

    expect(screen.getByText(/exceeds .* available credit/i)).toBeInTheDocument();
  });

  it("charges AccountCredit for the full total when confirmed", async () => {
    const user = userEvent.setup();
    const onCharge = vi.fn().mockResolvedValue(undefined);
    renderDialog(<PaymentDialog open total={100} onOpenChange={() => {}} onCharge={onCharge} customer={b2bCustomer()} />);

    await user.click(screen.getByRole("tab", { name: /account/i }));
    await user.click(screen.getByRole("button", { name: /charge to account/i }));

    expect(onCharge).toHaveBeenCalledWith([{ method: "AccountCredit", amount: 100 }]);
  });
});
