import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CustomerDto, LoyaltyConfigDto } from "@/lib/api/pos";
import { CheckoutRedeemDialog } from "./CheckoutRedeemDialog";

function customer(overrides: Partial<CustomerDto> = {}): CustomerDto {
  return {
    id: 1, nameEn: "Al-Nasser Contracting Co.", nameAr: null, type: "Retail", phone: "0500000000", email: null,
    vatNo: null, creditLimit: 0, outstanding: 0, city: null, district: null, address: null,
    loyaltyEnrolled: true, loyaltyPoints: 2000, loyaltyLifetimePoints: 2000, loyaltyTier: "Bronze", status: "Active",
    lastPurchaseAt: null, projectName: null, creditTermDays: null, createdAt: new Date(0).toISOString(),
    loyaltyLifetimeSpend: 0, accountManagerUserId: null, accountManagerName: null, priorityBilling: false,
    ...overrides,
  };
}

const loyaltyConfig: LoyaltyConfigDto = {
  pointsPerSarEarned: 1, pointsPerSarRedeemed: 100, minRedeemPoints: 500, maxRedeemPctOfTotal: 20,
  silverThreshold: 0, goldThreshold: 0, platinumThreshold: 0, silverMultiplier: 1, goldMultiplier: 1,
  platinumMultiplier: 1, silverDiscountPct: 0, goldDiscountPct: 0, platinumDiscountPct: 0, freeDeliveryMinOrderSar: 0,
};

// pointsPerSarRedeemed=100 -> 2000 pts = 20.00 SAR balance; minRedeemPoints=500 -> 5.00 SAR min.
// total=100, maxRedeemPctOfTotal=20% -> 20.00 SAR cap, same as the balance here.

describe("CheckoutRedeemDialog", () => {
  it("shows the points balance and the redeemable cap", () => {
    render(
      <CheckoutRedeemDialog
        open onOpenChange={() => {}} customer={customer()} loyaltyConfig={loyaltyConfig}
        total={100} currentRedeemed={0} onConfirm={vi.fn()} onClear={vi.fn()}
      />,
    );

    expect(screen.getByText(/2,000 pts/)).toBeInTheDocument();
    expect(screen.getByText(/Up to/)).toBeInTheDocument();
    expect(screen.getByText(/20% of total/)).toBeInTheDocument();
  });

  it("tells a customer below the minimum they can't redeem yet, with no input shown", () => {
    render(
      <CheckoutRedeemDialog
        open onOpenChange={() => {}} customer={customer({ loyaltyPoints: 100 })} loyaltyConfig={loyaltyConfig}
        total={100} currentRedeemed={0} onConfirm={vi.fn()} onClear={vi.fn()}
      />,
    );

    expect(screen.getByText(/needs at least 500 points/)).toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });

  it("disables Apply below the minimum redemption and above the max", async () => {
    const user = userEvent.setup();
    render(
      <CheckoutRedeemDialog
        open onOpenChange={() => {}} customer={customer()} loyaltyConfig={loyaltyConfig}
        total={100} currentRedeemed={0} onConfirm={vi.fn()} onClear={vi.fn()}
      />,
    );
    const input = screen.getByRole("spinbutton");
    const apply = screen.getByRole("button", { name: "Apply" });

    await user.type(input, "2");
    expect(screen.getByText(/Minimum redemption is/)).toBeInTheDocument();
    expect(apply).toBeDisabled();

    await user.clear(input);
    await user.type(input, "50");
    expect(screen.getByText(/Maximum redemption is/)).toBeInTheDocument();
    expect(apply).toBeDisabled();
  });

  it("fills the max redeemable amount when Max is clicked", async () => {
    const user = userEvent.setup();
    render(
      <CheckoutRedeemDialog
        open onOpenChange={() => {}} customer={customer()} loyaltyConfig={loyaltyConfig}
        total={100} currentRedeemed={0} onConfirm={vi.fn()} onClear={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Max" }));

    expect(screen.getByRole("spinbutton")).toHaveValue(20);
  });

  it("confirms a valid amount and closes the dialog", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <CheckoutRedeemDialog
        open onOpenChange={onOpenChange} customer={customer()} loyaltyConfig={loyaltyConfig}
        total={100} currentRedeemed={0} onConfirm={onConfirm} onClear={vi.fn()}
      />,
    );

    await user.type(screen.getByRole("spinbutton"), "10");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(onConfirm).toHaveBeenCalledWith(10);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("only offers 'Remove redemption' once something is already redeemed, and clears it", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <CheckoutRedeemDialog
        open onOpenChange={onOpenChange} customer={customer()} loyaltyConfig={loyaltyConfig}
        total={100} currentRedeemed={0} onConfirm={vi.fn()} onClear={onClear}
      />,
    );
    expect(screen.queryByRole("button", { name: /remove redemption/i })).not.toBeInTheDocument();

    rerender(
      <CheckoutRedeemDialog
        open onOpenChange={onOpenChange} customer={customer()} loyaltyConfig={loyaltyConfig}
        total={100} currentRedeemed={10} onConfirm={vi.fn()} onClear={onClear}
      />,
    );
    await user.click(screen.getByRole("button", { name: /remove redemption/i }));

    expect(onClear).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
