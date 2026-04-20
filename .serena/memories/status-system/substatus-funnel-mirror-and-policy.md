# Substatus funnel mirror + subFunnelPolicy (2026)

## Data model

- `AccountingGroup.subFunnelPolicy`: `"allow"` | `"requireComplete"` (DB column `sub_funnel_policy`, default `allow`). Meaningful for satellite groups (`parentStatusId != null`).

## Product sync

- `getSyncedSubStatusIdForMainStatus(mainStatusId)` in `src/lib/products-db.ts`: if a satellite group exists for that main status, returns default substatus (`isDefault`); else `null`.
- **Create product**: `productSubStatusId` is set from sync when `productStatusId` is set.
- **Update product**: If `productStatusId` **changes**, server enforces `requireComplete` on the **old** main status, then sets `productSubStatusId` from sync for the **new** main (client `productSubStatusId` ignored for that transition). Sub-only updates use client `productSubStatusId` when main is unchanged.
- **SubFunnelIncompleteError** (`code: SUB_FUNNEL_INCOMPLETE`): thrown when leaving a main status whose satellite has `requireComplete` while current `productSubStatusId` is not the **last** substatus by `order` in that satellite group.

## Admin API

- **POST** `/api/admin/accounting-groups`: accepts `subFunnelPolicy` for satellites; after `ensureDefaultStatus`, `updateMany` all products with `productStatusId === parentStatusId` to `productSubStatusId = default` (full mirror).
- **DELETE** `/api/admin/accounting-groups/[id]`: before delete, clears `productSubStatusId` for products pointing at any status in the group; unlinks chain; if satellite, sets parent `hasSubStatuses` false when no satellites left.
- **PATCH** `/api/admin/accounting-groups/[id]`: accepts `subFunnelPolicy`.

## Public API

- `GET /api/statuses`: `subFunnelPolicy` on nested `satelliteGroups` in the funnel tree and on top-level `satelliteGroups` for sidebar.

## UI

- **Statuses management**: satellite group sheet — two mutually exclusive **Checkbox** options for `subFunnelPolicy` (`allow` vs `requireComplete`); unchecking the active option switches to the other (always exactly one selected).
- **Product detail sheet**: when current main status has satellite with `requireComplete` and sub is not last, main status Select disables other options; hint `products.subFunnelMainBlockedHint`.
- **Products page save**: toast `products.subFunnelIncompleteError` when API returns `code: SUB_FUNNEL_INCOMPLETE`.
