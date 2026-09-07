# Farm App Implementation Plan

## Purpose
An offline-capable, desktop-first Philippine livestock grower application for two people. It tracks batches of purchased piglets and chicks from arrival through live-weight sale.

## First Release
- Batch codes: `PIG-YYYYMMDD` and `CHK-YYYYMMDD`, adding `-02` for duplicate purchases on the same date.
- Batch headcount, age, average weight, target weight, feed usage, FCR, costs, mortality, and live-weight sales.
- Feed purchases and weekly batch-use records in bags, using a configurable bag weight and weighted-average PHP/kg cost. Weekly bag use is entered in quarter-bag increments: `.25`, `.50`, `.75`, or whole bags.
- Batch-specific and farm-overhead expenses, profitability, cash flow, exports, and JSON backup.
- Desktop-first dashboard with fast daily-entry forms. Mobile is a secondary workflow.

## Offline and Sharing
- Installable PWA app shell for offline startup after first use.
- Local Firestore persistence lets each user record transactions offline.
- Firebase Authentication and Firestore synchronize records when connectivity returns.
- The interface must show saved, syncing, synced, and pending-offline-change states.

## Data Model
- `suppliers`: supplier name, type, contact person, phone, location, and purchase history.
- `batches`: species, purchase date/code, livestock supplier, opening/current headcount, target weight, and status.
- `feedLots` and `weeklyFeedUse`: feed product, bags received, bags used by a batch each week, configured bag weight in kilograms, and product weighted-average cost.
- `weightEntries`, `mortalityEntries`, `expenseEntries`, and `sales`: immutable transaction ledgers by batch and date.
- Persist money as Philippine-peso centavos. Derive FCR as weekly bags used times configured bag weight in kilograms, divided by live-weight gain in kilograms; show it unavailable where inputs are incomplete.

## Excluded
Breeding, farrowing, egg production, and incubation are not part of this grower operation.