## Таблиця каталогу: статуси як теги + швидка зміна

- Файли: `src/features/products/components/product-status-inline-cell.tsx` (pill з кольором з налаштувань, YIQ для тексту; DropdownMenu + Radio; `stopPropagation` щоб не відкривалась картка); `src/features/products/lib/satellite-statuses.ts` (`findSatelliteStatuses` для варіанту підстатусів сателіта).
- `products-page.tsx` (`ProductsTableView`): колонки `product_status_id` / `status` і `product_sub_status_id` рендерять `ProductStatusInlineCell` замість `formatCell`; зміна через `updateMutation.mutateAsync` з полями `product_status_id` або `product_sub_status_id`; помилка `SUB_FUNNEL_INCOMPLETE` → тост як у `handleSave`.
- **ProductDetailSheet** не змінювався (вимога: без візуальних змін у Sheet).
