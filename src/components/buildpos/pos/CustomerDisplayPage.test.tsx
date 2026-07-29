import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { CustomerDisplayPage } from "./CustomerDisplayPage";
import type { CustomerDisplaySnapshot } from "@/lib/buildpos/pos-session-hub";

const mockHasAccess = vi.fn(() => true);
let mockCanVoidTransactions = false;
vi.mock("@/lib/api/auth", () => ({
  useAuth: () => ({
    user: { id: 99, branchId: 1, posCeilings: { canVoidTransactions: mockCanVoidTransactions } },
    hasAccess: mockHasAccess,
  }),
}));

vi.mock("@/lib/api/admin", () => ({
  useTerminals: () => ({
    data: [
      { id: 1, code: "T1", name: "Till 1", branchId: 1, branchName: "Main Branch", assignedCashierId: null },
      { id: 2, code: "T2", name: "Till 2", branchId: 1, branchName: "Main Branch", assignedCashierId: 555 },
    ],
  }),
}));

// The hub itself is a thin SignalR wrapper with no real server to talk to in tests — mocked so the
// test can push a snapshot straight into the component the same way a real "CartUpdated" event would.
let latestOnUpdate: ((snapshot: CustomerDisplaySnapshot) => void) | null = null;
let mockRestricted = false;
vi.mock("@/lib/buildpos/pos-session-hub", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/buildpos/pos-session-hub")>();
  return {
    ...actual,
    usePosSessionListener: (_terminalId: number | null, onUpdate: (snapshot: CustomerDisplaySnapshot) => void) => {
      latestOnUpdate = onUpdate;
      return { restricted: mockRestricted };
    },
  };
});

const TERMINAL_STORAGE_KEY = "buildpos.customer-display.terminalId";

const fixtureSnapshot: CustomerDisplaySnapshot = {
  status: "Building",
  lines: [{ name: "Cement Bag 50kg", qty: 10, uom: "Bag", unitPrice: 20, lineTotal: 200 }],
  subtotal: 200,
  discounts: [{ label: "Contractor discount 5%", amount: 10 }],
  fees: [{ label: "Delivery Fee (Zone A)", amount: 30 }],
  vat: 27.6,
  total: 247.6,
  customerName: "Al-Nasser Contracting",
  orderNo: null,
};

describe("CustomerDisplayPage", () => {
  beforeEach(() => {
    localStorage.clear();
    mockHasAccess.mockReturnValue(true);
    latestOnUpdate = null;
    mockRestricted = false;
    mockCanVoidTransactions = false;
    window.history.replaceState(null, "", "/operate/customer-display");
  });

  it("hides a till assigned to a different cashier from a plain cashier's picker", () => {
    render(<CustomerDisplayPage />);
    expect(screen.getByText(/Till 1/)).toBeInTheDocument();
    expect(screen.queryByText(/Till 2/)).not.toBeInTheDocument();
  });

  it("shows every till to a supervisor-tier viewer (void-transaction authority)", () => {
    mockCanVoidTransactions = true;
    render(<CustomerDisplayPage />);
    expect(screen.getByText(/Till 1/)).toBeInTheDocument();
    expect(screen.getByText(/Till 2/)).toBeInTheDocument();
  });

  it("shows a restricted-access message when the hub rejects the join (e.g. a different branch's terminal)", () => {
    mockRestricted = true;
    localStorage.setItem(TERMINAL_STORAGE_KEY, "1");
    render(<CustomerDisplayPage />);

    expect(screen.getByText(/isn't available to you/i)).toBeInTheDocument();
  });

  it("pairs directly from a ?terminal= key in the URL, skipping the picker", () => {
    window.history.pushState(null, "", "/operate/customer-display?terminal=1");
    render(<CustomerDisplayPage />);

    expect(screen.queryByText(/pick a register/i)).not.toBeInTheDocument();
    expect(screen.getByText("Welcome")).toBeInTheDocument();
    // Pairing from the URL also persists to localStorage, so a later bare visit remembers it.
    expect(localStorage.getItem(TERMINAL_STORAGE_KEY)).toBe("1");
  });

  it("shows an access-denied message when the user lacks the page permission", () => {
    mockHasAccess.mockReturnValue(false);
    render(<CustomerDisplayPage />);
    expect(screen.getByText(/don't have access/i)).toBeInTheDocument();
  });

  it("prompts to pick a register when no terminal is paired to this device yet", () => {
    render(<CustomerDisplayPage />);
    expect(screen.getByText(/pick a register/i)).toBeInTheDocument();
    expect(screen.getByText(/Till 1/)).toBeInTheDocument();
  });

  it("mirrors the cashier's cart with its discount, fee and VAT breakdown", () => {
    localStorage.setItem(TERMINAL_STORAGE_KEY, "1");
    render(<CustomerDisplayPage />);

    act(() => {
      latestOnUpdate?.(fixtureSnapshot);
    });

    expect(screen.getByText("Cement Bag 50kg")).toBeInTheDocument();
    expect(screen.getByText("Contractor discount 5%")).toBeInTheDocument();
    expect(screen.getByText("Delivery Fee (Zone A)")).toBeInTheDocument();
    expect(screen.getByText("VAT")).toBeInTheDocument();
    expect(screen.getByText("247.60")).toBeInTheDocument();
  });

  it("shows a thank-you screen once the sale is Approved", () => {
    localStorage.setItem(TERMINAL_STORAGE_KEY, "1");
    render(<CustomerDisplayPage />);

    act(() => {
      latestOnUpdate?.({ ...fixtureSnapshot, status: "Approved", orderNo: "ORD-1001" });
    });

    expect(screen.getByText("Thank you!")).toBeInTheDocument();
    expect(screen.getByText(/ORD-1001/)).toBeInTheDocument();
  });

  it("shows the attached customer's name, tier and loyalty points when present", () => {
    localStorage.setItem(TERMINAL_STORAGE_KEY, "1");
    render(<CustomerDisplayPage />);

    act(() => {
      latestOnUpdate?.({
        ...fixtureSnapshot,
        customerLoyaltyTier: "Gold",
        customerLoyaltyPoints: 1250,
        customerLoyaltyPointsSarValue: 12.5,
      });
    });

    expect(screen.getByText("Al-Nasser Contracting")).toBeInTheDocument();
    expect(screen.getByText(/Gold/)).toBeInTheDocument();
    expect(screen.getByText("1,250 pts")).toBeInTheDocument();
    expect(screen.getByText("12.50")).toBeInTheDocument();
  });

  it("omits the loyalty points line when the customer has none", () => {
    localStorage.setItem(TERMINAL_STORAGE_KEY, "1");
    render(<CustomerDisplayPage />);

    act(() => {
      latestOnUpdate?.({ ...fixtureSnapshot, customerLoyaltyTier: null, customerLoyaltyPoints: null });
    });

    expect(screen.getByText("Al-Nasser Contracting")).toBeInTheDocument();
    expect(screen.queryByText(/pts/)).not.toBeInTheDocument();
  });
});
