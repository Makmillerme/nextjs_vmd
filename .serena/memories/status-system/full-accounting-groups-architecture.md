# Full Status System with Accounting Groups

## Date: 2026-03-27

## Architecture

### Prisma Schema
- **AccountingGroup** (new model): `id`, `categoryId` -> Category, `parentStatusId` -> ProductStatus (null for global, non-null for satellite), `nextGroupId` -> self (chain), `name`, `order`, `description`
- **ProductStatus** (refactored): removed `categoryId`, `parentId`, `groupName`; added `accountingGroupId` -> AccountingGroup. Kept `name`, `code`, `color`, `order`, `description`, `isDefault`, `hasSubStatuses`
- **Category**: now has `accountingGroups` relation (replaces `statuses`)
- **Product**: unchanged (`productStatusId`, `productSubStatusId`)

### Three-level hierarchy
1. Category -> global AccountingGroups (parentStatusId = null)
2. AccountingGroup -> ProductStatuses
3. ProductStatus -> satellite AccountingGroups (parentStatusId = status.id) -> sub-statuses

### API Routes
- `/api/admin/accounting-groups` (GET ?categoryId, POST) - CRUD for groups
- `/api/admin/accounting-groups/[id]` (GET, PATCH, DELETE) - with chain relink on delete
- `/api/admin/statuses` (GET ?accountingGroupId, POST) - statuses within group, auto-creates satellite group on first sub-status
- `/api/admin/statuses/[id]` (GET, PATCH, DELETE) - with satellite cleanup on last sub-status delete
- `/api/statuses` (GET ?categoryId) - public hierarchical response: `{ groups: [{ statuses: [{ satelliteGroups: [{ statuses }] }] }] }`

### Frontend
- **Types**: `AccountingGroupItem`, `StatusItem` in `products-config/types.ts`
- **Query keys**: `managementAdminKeys.accountingGroups` added to `query-keys.ts`
- **Hook**: `use-statuses.ts` returns `{ groups, allStatuses, options }`, requires `categoryId`
- **UI**: `statuses-management.tsx` fully rewritten with GroupCard, StatusRow, satellite expansion, Sheet forms for both groups and statuses
- **Localization**: `uk.json`/`en.json` updated with `accountingGroups.*` and `validationRequired.groupName` keys

### Data Migration
- Existing statuses migrated from old `(categoryId, groupName, parentId)` structure to AccountingGroup-based hierarchy
- Old columns (`category_id`, `parent_id`, `group_name`) dropped from `product_statuses`

### Key Business Logic
- Creating sub-status auto-creates satellite AccountingGroup if first sub-status
- Deleting last sub-status in satellite group auto-deletes the group and resets `hasSubStatuses`
- Group chain (nextGroupId) validated against circular references
- Deleting a group relinks the chain (prev.nextGroupId = deleted.nextGroupId)