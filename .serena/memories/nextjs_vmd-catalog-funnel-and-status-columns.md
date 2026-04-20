## Catalog sidebar & product table (2026-03-31)

- **Sidebar:** `app-sidebar.tsx` — спочатку група `layout.nav.general` + `NAV_MAIN` (Головна, Управління…), нижче група «Облік товару» (`NAV_CATALOG.titleKey`) + `CatalogNavItem`.
- **Статус у картці:** у шапці `ProductDetailSheet` (не прев'ю) — Select з `useStatuses().rootOptions` (лише статуси 1-го рівня груп); поле `status` прибране з тіла табів; `sub_status` не рендериться.
- **Таблиця:** одна пінна колонка `product_status_id` (без підстатусу).
- **CatalogNavItem** (`components/layout/catalog-nav-item.tsx`): per category `Collapsible`; sub links `layout.nav.catalogAllItems` → `/catalog/[categoryId]`; accounting groups → `/catalog/[categoryId]/group/[groupId]` (data from `GET /api/statuses?categoryId=`).
- **Group funnel page:** `src/app/(app)/catalog/[categoryId]/group/[groupId]/page.tsx` — `ProductsPage` with `categoryId` + `accountingGroupId` (group route id).
- **API:** `GET /api/products` accepts `accountingGroupId`; `lib/products-db.ts` `buildWhere` filters products whose main or sub status belongs to that accounting group.
- **Client:** `ListProductsQuery` / `fetchProducts` / `ProductsQueryParams` include `accountingGroupId`; `ProductsTableView` passes it in `queryParams`.
- **Table columns:** First data columns after № are fixed `product_status_id` + `product_sub_status_id` (labels `products.statusColumn`, `products.subStatusColumn`); duplicate dynamic cols `status`/`sub_status`/same ids stripped from config.
- **Card:** `EMPTY_EDIT` includes `product_sub_status_id`; `dynamic-field-renderer` maps `code === "sub_status"` → `product_sub_status_id` with same select/radio options as status.
- **useStatuses:** `collectStatusesFromGroup` flattens nested `satelliteGroups` so sub-status IDs resolve in dropdowns and table name map.
- **Locales:** ті самі ключі в uk.json/en.json + `generate:locales`. Додатково в `lib/i18n.ts` є **STATIC_FALLBACKS** на ці ключі, якщо *.generated.ts ще не оновлено.
- **Таблиця:** `PINNED_TABLE_STATUS_COLUMNS` + `mergePinnedVisible` — колонки статусів завжди у видимому наборі; `toggleColumn` знову застосовує merge.