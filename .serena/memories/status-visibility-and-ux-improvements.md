## Status Visibility & UX Improvements (2026-04-15)

### 1. showInSidebar field
- Added `showInSidebar Boolean @default(true) @map("show_in_sidebar")` to `AccountingGroup` in Prisma schema.
- Updated `AccountingGroupItem` type with `showInSidebar: boolean`.
- Updated PATCH `[id]/route.ts` and POST `route.ts` admin APIs to accept/save `showInSidebar`.
- Public `/api/statuses` returns `showInSidebar` for both root and satellite groups.

### 2. Sidebar filtering
- `catalog-nav-item.tsx`: Added `showInSidebar` to `AccountingGroupNav` type.
- 'Усі позиції' link is conditionally rendered based on default group's `showInSidebar`.
- Root groups and satellite groups filtered by `showInSidebar !== false`.

### 3. Default status (Нерозібрані) reorder lock
- StatusRow: Reorder arrows (ChevronUp/ChevronDown) hidden entirely for `isDefault` statuses.
- Non-default statuses cannot move up past an `isDefault` status.
- Same logic applied to sub-statuses.

### 4. Group sheet: filtered statuses + 'Not selected'
- Added `claimedStatusIds` useMemo that computes which statuses are used by other groups' ranges.
- `availableGroupStatuses` filters out claimed statuses from start/end dropdowns.
- Added `__none__` option ('Не обрано' / 'Not selected') to start/end selects, allowing groups to be temporarily unassigned.

### 5. Funnel gear settings
- Replaced subtitle text ('Основна послідовність статусів для категорії') with a Settings gear button.
- Gear opens a Popover with a showInSidebar checkbox for the default funnel group.
- Uses updateGroupMut to persist changes.

### 6. Group sheet showInSidebar checkbox
- Added `showInSidebar: z.boolean()` to group form schema.
- Checkbox added to both root and satellite group editing sheets.
- Values correctly initialized on create/edit and submitted to API.

### i18n keys added
- `productsConfig.accountingGroups.showInSidebar` — 'Відображати в сайдбарі' / 'Show in sidebar'
- `productsConfig.accountingGroups.notSelected` — 'Не обрано' / 'Not selected'

### Files modified
- `prisma/schema.prisma` — showInSidebar field
- `src/features/management/components/products-config/types.ts` — type update
- `src/features/management/components/products-config/statuses-management.tsx` — all UI changes
- `src/app/api/admin/accounting-groups/route.ts` — POST accepts showInSidebar
- `src/app/api/admin/accounting-groups/[id]/route.ts` — PATCH accepts showInSidebar
- `src/app/api/statuses/route.ts` — returns showInSidebar
- `src/components/layout/catalog-nav-item.tsx` — sidebar filtering
- `src/config/locales/uk.json`, `en.json`, `uk.generated.ts`, `en.generated.ts` — i18n