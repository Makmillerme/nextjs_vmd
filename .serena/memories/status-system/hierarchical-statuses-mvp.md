# Hierarchical Status System MVP

## Date: 2026-03-27

## Summary
Implemented a hierarchical, category-scoped status system for products.

## Schema Changes (prisma/schema.prisma)

### ProductStatus — new fields:
- `categoryId String @map("category_id")` — FK to Category (NOT NULL, cascading delete)
- `parentId String? @map("parent_id")` — self-reference for sub-statuses ("StatusHierarchy")
- `children ProductStatus[] @relation("StatusHierarchy")` — reverse side
- `code String?` — stable programmatic code (e.g. "new", "in_service")
- `groupName String? @map("group_name")` — visual grouping label ("Закупка", "Продаж")
- `hasSubStatuses Boolean @default(false) @map("has_sub_statuses")` — flag if status has children

### Product — new fields:
- `productSubStatusId String? @map("product_sub_status_id")` — FK to ProductStatus
- `productSubStatusRef ProductStatus? @relation("ProductSubStatus", ...)` — relation
- Relations renamed: ProductMainStatus, ProductSubStatus

### Indexes:
- `[categoryId]`, `[parentId]`, `[categoryId, parentId]` on ProductStatus
- `[productSubStatusId]` on Product

### Migration:
- Existing statuses assigned to first category by order
- Used `prisma db push` + raw SQL data migration

## API Changes

### Admin API (src/app/api/admin/statuses/route.ts)
- GET: requires `?categoryId=`, returns hierarchical list with `children[]`, sorted by groupName then order
- POST: body includes `categoryId` (required), `parentId?`, `code?`, `groupName?`, `hasSubStatuses?`
- `isDefault` scoped to (categoryId, parentId) pair

### Admin API [id] (src/app/api/admin/statuses/[id]/route.ts)
- GET: includes `children[]`
- PATCH: supports `code`, `groupName`, `hasSubStatuses` fields
- `isDefault` scoped to (categoryId, parentId)

### Public API (src/app/api/statuses/route.ts)
- GET: supports `?categoryId=` filter
- Returns new fields: categoryId, parentId, code, groupName, hasSubStatuses, children[]

## UI Changes

### data-model-page.tsx
- Tab order changed: categories -> statuses -> data (was: statuses -> categories -> data)
- Default tab: "categories" (was: "statuses")

### statuses-management.tsx (full rewrite)
- Category selector at the top (auto-selects first category)
- Hierarchical list with visual group sections (groupName headers)
- StatusRow component with expand/collapse for sub-statuses
- Sheet form: name, code, color, groupName (with datalist autocomplete), order, description, isDefault, hasSubStatuses
- Sub-status creation from parent row's "+" button
- groupName and hasSubStatuses hidden for sub-status items

### types.ts (StatusItem)
- Added: categoryId, parentId, code, groupName, hasSubStatuses, children?

### use-statuses.ts (public hook)
- Now accepts optional `categoryId` parameter
- Updated type `ProductStatusItem` with all new fields
- Uses `managementPublicKeys.statuses` query key

## Localization
- Added UK/EN keys: code, groupName, groupNamePlaceholder, hasSubStatuses, newSubStatus, addSubStatus

## Files Modified
- prisma/schema.prisma
- src/app/api/admin/statuses/route.ts
- src/app/api/admin/statuses/[id]/route.ts
- src/app/api/statuses/route.ts
- src/features/management/components/data-model-page.tsx
- src/features/management/components/products-config/statuses-management.tsx
- src/features/management/components/products-config/types.ts
- src/features/products/hooks/use-statuses.ts
- src/config/locales/uk.json
- src/config/locales/en.json