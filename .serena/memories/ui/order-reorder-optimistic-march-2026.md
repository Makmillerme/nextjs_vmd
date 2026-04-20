## Швидке переставлення порядку (optimistic UI)

**Дата:** 2026-03-31

**Проблема:** Зміна порядку чекала відповіді API перед оновленням списку + зайві повні інвалідації → відчутні лаги.

**Зміни:**

1. **tabs-config-management `moveTabOrder`:** одразу `setQueryData` (swap order), `queueMicrotask(() => bustDisplayCaches())`, оновлення `tabOrder` у sheet; потім `await` двох PATCH; при помилці відкат попереднього снапшоту кешу.

2. **categories-management `reorderCategory`:** одразу `setQueryData` + оновлення `catOrder`; без `invalidateQueries(['categories'])` і без `toast.success` після успішного реордеру; відкат при помилці.

3. **statuses-management** (`reorderAccountingGroups`, `reorderStatusesInGroup`, `reorderSubStatusInSatellite`): оптимістичне оновлення `groupsKey` (вкладені `statuses` / `satelliteGroups`); без `invalidateAll()` після успіху; відкат або `invalidateAll` лише якщо не було снапшоту.

Див. також `ui/order-reorder-arrows-management-march-2026`.