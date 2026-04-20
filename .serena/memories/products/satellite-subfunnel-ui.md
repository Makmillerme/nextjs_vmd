## Сателітна облікова група (підворонка) — UI каталогу та картки

### Каталог (`products-page.tsx`)
- У перегляді сателіта (`accountingGroupId` збігається з id групи з `satelliteGroups`) закріплена колонка — `product_sub_status_id` (підстатуси), не `product_status_id`.
- При збереженні рядка в сателітному режимі в PATCH **не передається** `product_status_id`, щоб не змінювати головний статус з контексту сателіта.
- У `ProductDetailSheet` передається `satelliteAccountingGroupId={isSatelliteGroupView ? accountingGroupId ?? null : null}`.

### Картка (`product-detail-sheet.tsx`)
- Якщо задано `satelliteAccountingGroupId`, у шапці показується лише селект **підстатусів** (`products.subStatusColumn`), опції з `findSatelliteStatuses` + `satelliteSubOptions`; головний статус у шапці **не показується**.
- Для **нової** картки в контексті сателіта (`product == null`) після завантаження груп виставляється дефолтний підстатус через `isDefault` у дереві статусів (`useEffect` + `satelliteSubDefaultAppliedRef`). Очікується, що «Нерозібрані» позначені як default.
- `mainStatusChangeBlocked` не застосовується при `satelliteAccountingGroupId` (головний статус не керується з шапки в цьому режимі).

### Обмеження руху
- Рух лише по підстатусах даної сателітної групи реалізований через обмежений список опцій; головний статус з сателітного UI не змінюється.
