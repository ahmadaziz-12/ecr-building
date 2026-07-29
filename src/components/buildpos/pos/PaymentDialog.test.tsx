import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CustomerDto } from "@/lib/api/pos";
import { PaymentDialog } from "./PaymentDialog";

function renderDialog(ui: React.ReactElement) {
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

describe("PaymentDialog — cash tender", () => {
  it("starts with no amount entered and Confirm disabled", () => {
    renderDialog(<PaymentDialog open total={43.7} onOpenChange={() => {}} onCharge={vi.fn()} />);

    expect(screen.getByLabelText<HTMLInputElement>(/customer gives/i).value).toBe("");
    expect(screen.getByRole("button", { name: /enter the cash received/i })).toBeDisabled();
  });

  it("enables Confirm once a covering amount is picked, and only highlights the picked button", async () => {
    const user = userEvent.setup();
    const onCharge = vi.fn().mockResolvedValue(undefined);
    renderDialog(<PaymentDialog open total={43.7} onOpenChange={() => {}} onCharge={onCharge} />);

    // "Exact" must not look chosen until it is chosen — picking 50 moves the selection to 50.
    const exact = screen.getByRole("button", { name: "Exact" });
    const fifty = screen.getByRole("button", { name: "50" });
    expect(exact).toHaveAttribute("aria-pressed", "false");

    await user.click(fifty);
    expect(fifty).toHaveAttribute("aria-pressed", "true");
    expect(exact).toHaveAttribute("aria-pressed", "false");

    await user.click(screen.getByRole("button", { name: /confirm cash payment/i }));
    expect(onCharge).toHaveBeenCalledWith([{ method: "Cash", amount: 43.7 }]);
  });

  it("keeps Confirm disabled while the tender is short of the total", async () => {
    const user = userEvent.setup();
    renderDialog(<PaymentDialog open total={143.7} onOpenChange={() => {}} onCharge={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "50" }));

    expect(screen.getByText(/short by/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm cash payment/i })).toBeDisabled();
  });
});

describe("PaymentDialog — Account Credit (BRD §4.2)", () => {
  it("does not show an Account tab for a retail customer", () => {
    renderDialog(<PaymentDialog open total={100} onOpenChange={() => {}} onCharge={vi.fn()} customer={b2bCustomer({ type: "Retail" })} />);

    expect(screen.queryByRole("tab", { name: /account/i })).not.toBeInTheDocument();
  });

  it("shows the correct credit limit, outstanding, and available credit for a B2B customer", async () => {
    const user = userEvent.setup();
    renderDialog(<PaymentDialog open total={100} onOpenChange={() => {}} onCharge={vi.fn()} customer={b2bCustomer({ creditLimit: 5000, outstanding: 3000 })} />);

    await user.click(screen.getByRole("tab", { name: /account/i }));

    // Amounts render as "<number> <SARIcon/>", so the figure and the currency are separate nodes —
    // assert on the enclosing element's text, which is what the cashier actually reads.
    const amounts = screen.getAllByText(/[\d,]+\.\d\d/).map((el) => el.textContent?.trim());
    expect(amounts).toContain("5,000.00"); // credit limit
    expect(amounts).toContain("3,000.00"); // outstanding
    expect(amounts).toContain("2,000.00"); // available credit
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
