## Fix: Duplicate 'Усі позиції' in sidebar + duplicate React keys in status Select

### Root causes
1. `catalog-nav-item.tsx` rendered ALL groups from `/api/statuses`, including the default funnel group named 'Усі позиції', while there was already a hardcoded 'Усі позиції' link above the loop.
2. `use-statuses.ts` collected statuses from ALL groups (default + non-default). Non-default groups now contain resolved range statuses from the default group = same IDs duplicated.

### Fixes
1. **catalog-nav-item.tsx**: Added `isDefault` to `AccountingGroupNav` type; filtered out `isDefault` groups from the sidebar loop.
2. **use-statuses.ts**: Added `isDefault` to `PublicGroupItem` type; `allStatuses` and `rootStatuses` now prefer collecting only from the `defaultGroup` (single source of truth). Fallback uses `Set<string>` deduplication by `id`.