## Порядок у management: стрілки вгору/вниз замість поля number

**Дата:** 2026-03-31

**Ідея:** Поміняти місцями `order` у двох сусідів у відсортованому списку (за `order`, tie-break `id`), два PATCH паралельно; системний таб не рухається (не свопати з `isSystem`).

### Таби (`tabs-config-management.tsx`)
- `sortedTabs` з tie-break `id`.
- `moveTabOrder`: обмін `order` між сусідами; кеш `tabsQueryKey`; оновлення `tabOrder` у sheet якщо відкритий редагований таб.
- Таблиця: колонка «Порядок» — дві ghost-кнопки ChevronUp/Down, `stopPropagation` на комірці.
- Sheet: підказка `productsConfig.common.orderMoveHint`, для редагування — ті самі кнопки + `# idx / n`.
- Створення: показується числовий `order` (max+1), без ручного input.
- `MGMT_COLGROUP_4_TABS`: `[16, 34, 22, 28]`.

### Категорії (`categories-management.tsx`)
- `reorderCategory`, `categoryReorderBusy`, кнопки у рядку дерева; sheet — підказка + стрілки + позиція; `setQueryData<CategoryItem[]>`.
- `treeData` sort з tie-break.

### Статуси (`statuses-management.tsx`)
- `sortedGroups`, `reorderAccountingGroups`, `reorderStatusesInGroup`, `reorderSubStatusInSatellite`.
- GroupCard: стрілки в шапці; статуси та підстатуси в сателіті — стрілки в рядку; форми групи/статусу: прибрано number input, при створенні — hidden `order` + підказка, при edit — read-only order (група: позиція в `sortedGroups`).
- `openStatusForCreate`: `order` = max+1 серед кореневих або серед усіх sub у satellite батьківського статусу.
- `onGroupSubmit` edit: `order: editingGroup.order`; `onStatusSubmit` edit: `order: editingStatus.order`.
- `useEffect` при відкритому group sheet синхронізує `editingGroup` з `groups` після зміни order.

### i18n
- `productsConfig.common`: `moveUp`, `moveDown`, `orderMoveHint` (uk/en + generated).