# PRD addendum — B2B pivot (18 Sep 2026)

Decision by Pranav: the product is **B2B only** — businesses and shops that buy commercial cylinders. Domestic (household) supply is dropped entirely. This addendum supersedes the corresponding sections of `PRD_LPG_Booking_Platform.md`.

## Decisions taken
1. Drop domestic entirely (no 14.2 kg / 5 kg, no refill gap / yearly quota rules, no household persona).
2. Credit terms are decided by the **platform admin while onboarding a business** (verify + limit + net days in one decision). Agencies can switch credit on/off for their accounts and collect against invoices.
3. **Multi-outlet accounts** are included now: a business has several delivery locations, each with its own stock estimate and standing order.
4. `9000000001` is Imran (Al-Madina Tiffin Centre); `9000000002` is Fatima (Star Kitchens Cloud, credit requested).

## What changed, by surface
- **Customer → Business account:** name, type, GSTIN/FSSAI, outlets[] (label, address, contact, in-use / spare / empties, cylinders per week), credit terms (status, limit, term days), standing orders, verification status.
- **Cylinders:** 19 kg and 47.5 kg commercial only; quantity slabs per order; per-account negotiated rates; 18 % GST (CGST/SGST) on invoices.
- **Rules:** quantity cap (20 / order), credit not approved / over limit / overdue. Businesses may hold several open orders.
- **Home dashboard:** "days of LPG left" per outlet (spare + ½ in-use ÷ weekly consumption), credit outstanding/available, reorder usual, standing order, low-stock alerts.
- **Booking:** mixed cart, empties to return, slot *before opening*, payment: credit (default when approved) / UPI / card / netbanking / COD; failed online payment can switch to credit or cash.
- **Billing:** invoices due, ledger (invoice/payment with running balance), monthly consolidated statements, pay invoices (mock NEFT), request credit.
- **Delivery:** multi-cylinder drops, empties collected count, credit orders have nothing to collect.
- **Agency panel:** Business accounts (stock, credit, record payment, negotiated price, low-stock nudge campaign), Payments → credit receivables + aging, slab pricing, inventory *with accounts* and empties held by accounts, KPIs (cylinders, receivables, overdue).
- **Admin:** Businesses onboarding queue (verify + credit terms), credit book KPI, business segments, revenue streams incl. **1 % credit facilitation fee**; config for max cylinders, default credit, credit fee, low-stock days.
- **Seed:** ~100 businesses across Hyderabad (restaurants, cloud kitchens, hotels, canteens, hospitals, bakeries, tea stalls), ~2,500 orders / ₹2.1 Cr GMV in 90 days, 38 credit accounts, ~₹18 L credit book, 10 multi-outlet accounts.

## Demo script — see README §2.
