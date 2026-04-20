## DELETE облікової групи — P2002 на `nextGroupId`

**Причина:** у `AccountingGroup` поле `nextGroupId` має `@unique`. Під час видалення рядка `group` код намагався одразу зробити `prev.nextGroupId = group.nextGroupId`, поки рядок `group` ще існував з тим самим `nextGroupId` — два рядки не можуть посилатися на однакове значення `next_group_id`.

**Виправлення** (`src/app/api/admin/accounting-groups/[id]/route.ts`, транзакція DELETE): спочатку зберегти `bridgeNextId = group.nextGroupId`, обнулити `nextGroupId` у рядку що видаляється, потім оновити `prev`, далі `delete`.
