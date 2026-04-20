## products-config i18n / UI consistency (2026-04)

### Fixed in code
- **categories-management.tsx**: list metadata `N типів` and product counts `N од.` now use `tFormat` + keys `productsConfig.categoriesConfig.typesCount` and `typeProductsQuantity` (unit from `productsConfig.productTypesConfig.productsCount`).
- **field-definitions-management.tsx**: unit labels use existing `fieldSettings.unitDimension` and `fieldSettings.unitCustom` (removed duplicate hardcoded UA strings).
- **statuses-management.tsx**: accounting section title uses `productsConfig.accountingGroups.sectionTitle` (removed fragile `.replace()` on `addGroup`).
- **Locales**: new keys in `uk.json` / `en.json`; run `npm run generate:locales` after JSON edits.

### Audit notes (remaining)
- **products-config.tsx**: tab panels import `ProductTypesManagement` / `TabsConfigManagement` synchronously — no `next/dynamic` split; acceptable until bundle size matters.
- **statuses-management.tsx**: Cyrillic remains only in code comments (e.g. API edge-case note ~line 1517), not in UI.
- **field-definitions-management.tsx**: sheet label for placeholder field uses `fieldSettings.placeholder`.
- Broader duplicate logic (reorder hooks, query invalidation) not consolidated in this pass — track as refactor backlog if needed.
