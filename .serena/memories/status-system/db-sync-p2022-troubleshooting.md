# P2022 / accounting_groups column missing

**Cause:** Prisma schema expects `accounting_groups` (and `product_statuses.accounting_group_id`) but the database was not updated after pulling the full status system.

**Fix (pick one):**
1. `npm run db:migrate` — applies `prisma/migrations/20260331120000_accounting_groups_and_status_refactor` and prior history.
2. `npm run db:push` — dev shortcut when migrate history is not used (`npx prisma db push`).

Then `npx prisma generate` if client is stale, restart `next dev`.

**Note:** Migration uses dynamic SQL (EXECUTE) where `product_statuses.category_id` / `parent_id` may already be absent so parsing does not fail.