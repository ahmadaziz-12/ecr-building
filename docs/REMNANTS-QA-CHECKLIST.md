# Remnants Management & Cut Optimization — QA Checklist

Covers everything added/changed in this feature: Remnant tracking, the POS "use an offcut" flow,
Void/Return reversal correctness, and the admin Remnants tab. Test data below uses the seeded
`GLASS-6MM-CLR` (Clear Float Glass 6MM, Area mode, ~180 SAR/m²) at branch **Riyadh Main Yard** — swap
in any `IsCutToSize` product if that SKU changes. Seeded logins (password `Passw0rd!` for all):

- Cashier: `cashier.ruh@ecr-building.local`
- Admin: `admin@ecr-building.local`

Run in order — later scenarios (F, G, J, K) depend on remnants created in earlier ones (C).

---

## 0. Setup

1. Start backend (`dotnet run` in `backend/src/EcrBuilding.Api`) and frontend (`npm run dev`).
2. Log in as the cashier, go to **POS Checkout**. If prompted "Shift not started", click **Open
   Shift**, pick the terminal, accept the default float, confirm.
3. Note the branch's current `GLASS-6MM-CLR` stock (Product Catalog → search SKU → "Total
   Available") — call this **S₀**. You'll check it after each sale.

---

## A. Baseline cut-to-size sale — no source tracked (regression)

1. Search `GLASS`, click the tile to add it to the cart.
2. Set Length = `1`, Width = `1` (→ 1 m²). Leave "Cutting from a larger piece?" blank.
3. Charge (Cash, Exact, Confirm).
4. **Expect:** sale completes normally, no remnant prompt appears anywhere, stock drops by exactly 1
   m² (S₀ − 1). No row is added to the admin Remnants tab.

## B. MinCutQty billing floor still works (regression)

*(Only if the SKU has a `MinCutQty` set — check Product Catalog → edit product.)*

1. Add the product, enter dimensions producing a cut below the minimum (e.g. 0.4 × 0.5 = 0.2 m² with
   a 0.5 m² minimum).
2. **Expect:** cart shows "Billed at minimum 0.5 m² (measured 0.2)"; charge amount uses 0.5 m² ×
   price; stock drops by only **0.2** m² (the real cut, not the billed minimum).

## C. Restock creates a real, separately-tracked Remnant (core new behavior)

1. Add the glass product. Set Length=`2`, Width=`1` (2 m²).
2. In "Cutting from a larger piece?" enter `3`.
3. **Expect:** "Remnant: 1 m² — [Restock] [Scrap]" appears; "choose one" warning shown until you pick.
4. Click **Restock**. Charge the sale (Cash, Exact, Confirm).
5. **Expect:** stock drops by the **full 3 m²** (not 2) — S₀ − 3, not S₀ − 2.
6. Go to **Stock → Expiry → Remnants** tab (as admin, or cashier if they have access). **Expect:** a
   new row — SKU `GLASS-6MM-CLR`, Size **1 m²**, Status **Available**, Source Order = the order
   number just created, Discount **—**. "Available Offcuts" KPI increments by 1.
7. Keep this remnant's row visible — it's used by scenarios F, J.

## D. Scrap still fully removes the source, no remnant created (regression)

1. Add the glass product, Length=`2`, Width=`1` (2 m²), source size `3`.
2. Click **Scrap** instead of Restock. Charge the sale.
3. **Expect:** stock drops by the full 3 m² (same as Restock — Scrap always did this). **No** new row
   appears in the Remnants tab for this sale (the "Scrapped" KPI card counts admin-scrapped remnants,
   not this — it should NOT increment here).

## E. Admin Remnants tab — filters, KPIs, export

1. On **Stock → Expiry → Remnants**, confirm the KPI row: Available Offcuts, Discounted, Sold,
   Scrapped counts all look right for what you've done so far.
2. Use the Category filter, Status filter (`Available`/`Sold`/`Scrapped`), and the search box (by SKU
   or product name) — confirm the list narrows correctly and the "X of Y" counter updates.
3. Click **Export** — confirm a `remnants.csv` downloads with the visible (filtered) rows.
4. Switch between **Warehouse** / **Branch** / **Remnants** tabs — confirm each tab's own filters,
   KPIs, and table are independent (switching tabs resets the filter draft).

## F. Cut Optimization — sell straight from an existing remnant

*(Needs the 1 m² Available remnant from scenario C.)*

1. As the cashier, add the glass product to a **new** cart.
2. **Expect:** a chip row appears under the dimension inputs: "Use an offcut: **1 m²**" (optionally
   showing a discount if one's been set — see scenario H).
3. Click the chip.
4. **Expect:** dimensions auto-set to 1×1 (or the remnant's own size); "Cutting from offcut: 1 m² ✕"
   replaces the manual source-size input; price is a normal 1 m² sale price (no distortion).
5. Charge the sale.
6. **Expect:** the receipt is a normal invoice at the normal per-m² price. Go back to the admin
   Remnants tab — the remnant used is now **Sold**, Size **0 m²**. Product/branch bulk stock (Product
   Catalog "Total Available") is **unchanged** by this sale (it never touched OnHand).

## G. Remnant-of-remnant — consuming a big offcut leaves a smaller one

1. Create a bigger remnant first: sell a 1 m² cut from the glass product with source size `2.5`,
   Restock the 1.5 m² leftover (repeat scenario C's steps with these numbers). Confirm the 1.5 m²
   remnant appears in the admin tab.
2. Start a new sale, click the "Use an offcut: 1.5 m²" chip.
3. Change the dimensions down to e.g. 1 m² (Length=1, Width=1) — **less** than the remnant's 1.5 m².
4. **Expect:** "Cutting from offcut: 1.5 m²" stays shown; a NEW "Remnant: 0.5 m² — [Restock][Scrap]"
   prompt appears (the leftover from consuming the offcut itself) — same UI as a normal source cut.
5. Choose Restock, charge.
6. **Expect:** the 1.5 m² remnant flips to **Sold** / 0 m² in the admin tab; a brand-new **0.5 m²
   Available** remnant appears, linked to this new order. Bulk stock still untouched throughout.
7. Try entering a cut **larger** than an offcut you pick (e.g. click a 1 m² chip, then type Length/
   Width producing 2 m²) — **expect** a toast: "That remnant is only 1 m² — 2.00 needed," blocked
   client-side.

## H. Per-remnant discount pricing

1. In the admin Remnants tab, find an **Available** remnant. Click its Discount cell (shows "—").
2. Type e.g. `20`, click **Save**.
3. **Expect:** the cell now shows "-20%"; toast "Discount updated."
4. As the cashier, add the same product — the "Use an offcut" chip should now read something like
   "1 m² (-20%)".
5. Select it and charge.
6. **Expect:** the line's discount is **20%** (or higher if some other discount — quantity/promo/
   manual — would apply anyway; discounts never stack additively, only "largest wins"), and the
   receipt/VAT reflect the discounted price correctly.

## I. Manually scrapping a remnant from admin

1. Find an **Available** remnant with no sale pending against it.
2. Row actions (⋮) → **Scrap**.
3. **Expect:** confirmation toast "Remnant scrapped"; Status flips to **Scrapped**, Qty → 0; it drops
   out of the cashier's "Use an offcut" chip list immediately (refresh POS cart to confirm); "Scrapped"
   KPI increments.
4. Try scrapping it again (if the action isn't disabled already) — **expect** a clear rejection
   ("already Scrapped") not a crash.

## J. Void correctly reverses a Restock — the common case

1. Do a fresh Restock sale like scenario C (note the resulting remnant's exact size, e.g. 1 m²) and
   **do not** touch that remnant afterward (don't sell from it or scrap it).
2. Go to **Orders & Quotations**, find that order, **Void** it (any reason code).
3. **Expect:** stock returns to its pre-sale level (the *full* source amount, not just the cut). In
   the admin Remnants tab, the 1 m² remnant row this sale created is **gone** — it was un-done along
   with the void, since nothing else ever touched it.

## K. Void when the created/consumed remnant has already moved on (edge case)

1. Do a Restock sale creating a remnant, then **separately sell that exact remnant** (consume it via
   the offcut chip, as in scenario F) so it's now Sold/0.
2. Now go back and **Void** the *original* Restock sale.
3. **Expect:** stock is restored by only the originally-*measured cut* portion, **not** the full
   source size — the leftover's fate (now tied up in the second sale) is correctly left untouched. No
   error, no double-counting: check Product Catalog stock math adds up, and the now-Sold remnant is
   NOT resurrected to Available by this void.
4. Similarly: consume a remnant (scenario F), then **Void** that consuming sale before touching
   anything else. **Expect:** the consumed remnant flips back to **Available** with its qty restored,
   and bulk stock is untouched (it was never touched to begin with).

## L. Returns still block cut-to-size items (pre-existing rule, must not have regressed)

1. Complete any cut-to-size sale (glass, any variant).
2. As a Supervisor/Admin, go to **Orders & Quotations** → open that order → **Return**, or via
   **Finance → Returns → Create**, select **Standard** or **Surplus** type against that line.
3. **Expect:** rejected with "Cut-to-size items are non-returnable" (or "cannot be returned without a
   receipt" for the no-receipt path) — same as before this feature existed. **Damaged** returns should
   still be accepted (they quarantine, never restock/remnant).

## M. Permission boundaries

1. Log in as the **cashier** only (no back-office roles). Confirm they can see and use the "Use an
   offcut" chips at POS (this hits `GET /api/inventory/remnants`, gated on `pos-checkout` View, not
   `stock/expiry`).
2. Confirm the cashier can **not** reach the discount-edit or Scrap actions unless their role also
   grants Stock/Expiry Edit/Delete (try navigating to Stock → Expiry directly as the cashier and
   confirm the expected access behavior matches every other admin-only inventory page).
3. As admin, confirm Edit-discount and Scrap both work and are audit-logged (Admin → Audit Logs,
   filter for `REMNANT_UPDATED` / `REMNANT_SCRAPPED`).

## N. Concurrency sanity (optional, if you want to push on it)

1. Open the same "Available" remnant's product in two POS sessions (two browser windows, same or
   different cashiers).
2. In both, select the same offcut chip and race to check out first.
3. **Expect:** the first checkout succeeds; the second gets a clear rejection ("just taken by another
   sale") instead of double-selling the same physical piece or corrupting its Qty.

---

## Quick regression pass on the code this merge pulled in

Not part of this feature, but touched the same files, so worth a fast smoke check since a merge
conflict was resolved by hand in `OrdersController.cs`, `PosDtos.cs`, and `InventoryDtos.cs`:

1. **Serial Number Tracking**: sell a serialized product at POS, confirm serial capture UI still
   works and `Stock → Serial Tracking` shows it Sold against the right order.
2. **Label/Barcode printing**: Print Label / Print Barcode dialogs still open and print correctly from
   Product Catalog.
3. **Approval Center**: create an approval request (e.g. a discount override) and confirm
   `Operate → Approval Center` lists and can action it.
4. **Payments**: `OrderPaymentDto` gained an `Id` field during the merge — confirm the receipt and any
   "change payment method" flow still show/behave correctly (this was a straightforward additive
   change, but worth eyeballing once).

---

**If anything in A–N fails**, note the exact scenario letter, the SKU/branch/order number used, and
the actual vs. expected result — that's enough to reproduce and fix directly.
