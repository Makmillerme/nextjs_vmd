# Refactor: Status Funnel + Range-based Accounting Groups

## Concept
- **One default funnel** per category (`AccountingGroup.isDefault = true`) holds ALL statuses.
- **Accounting groups** (`isDefault = false`) are logical slices referencing a contiguous range of statuses from the default funnel via `startStatusId`/`endStatusId`.
- Overlap on boundaries is allowed (the last status of group A = the first status of group B).

## Schema changes (prisma/schema.prisma)
`AccountingGroup` gained:
- `isDefault Boolean @default(false)`
- `startStatusId String?` + relation `GroupStartStatus`
- `endStatusId String?` + relation `GroupEndStatus`
- Index on `[categoryId, isDefault]`

`ProductStatus` gained reverse relations: `groupsStartingAt`, `groupsEndingAt`.

## API changes
- `GET /api/admin/accounting-groups?categoryId=X` — auto-creates default group if missing; returns `isDefault`, `startStatus`, `endStatus`.
- `POST /api/admin/accounting-groups` — always `isDefault=false` for new groups; validates `startStatusId`/`endStatusId` belong to default group.
- `DELETE /api/admin/accounting-groups/[id]` — protects default group from deletion.
- `POST /api/admin/statuses` — accepts `categoryId` (resolves default group) or `accountingGroupId`.
- `GET /api/admin/statuses?accountingGroupId=X` — for non-default groups resolves range from default group.
- `GET /api/statuses?categoryId=X` — public: returns default + non-default groups with resolved range statuses.

## Filter (products-db.ts)
`listProducts` resolves non-default group into order-range filter (`productStatusRef.order BETWEEN start AND end`).

## UI (statuses-management.tsx)
Two sections:
1. **Воронка статусів** — flat list of all statuses in default group; add/edit/reorder here.
2. **Облікові групи** — cards with name + range (from..to); Sheet with start/end status dropdowns.

## Types (types.ts)
`AccountingGroupItem` now has `isDefault`, `startStatusId`, `endStatusId`, `startStatus?`, `endStatus?`.

## i18n
New keys: `productsConfig.statusFunnel.*`, `productsConfig.accountingGroups.fromStatus/toStatus/rangeLabel/cannotDeleteDefault/selectStartStatus/selectEndStatus`.

## Data migration
`prisma/seed-funnel-migration.ts` — marks first root group as default per category; consolidates statuses from other groups.