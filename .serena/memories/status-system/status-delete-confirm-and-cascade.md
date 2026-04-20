# Статуси: підтвердження видалень + каскад (2026)

## StatusRow chevron

- `hasSatellite` = лише `satelliteGroups.length > 0` (не `hasSubStatuses`), щоб шеврон розгортання не показувався, коли сателітних груп у відповіді немає (застарілий прапорець у БД).

## UI (`statuses-management.tsx`)

- Прибрано дубль кнопки «Створити облікову групу» у розгорнутому блоці (рядок під головним статусом); залишено лише `+` у шапці рядка.
- Видалення облікової групи та статусу/підстатусу з sheet — через `ConfirmDestructiveDialog` перед викликом API.
- Тексти: `productsConfig.confirmDeleteGroup.*`, `productsConfig.confirmDeleteStatus.*` (uk/en).

## API `DELETE /api/admin/statuses/[id]`

- Для статусу **основної воронки** (`accountingGroup.parentStatusId == null`) перед `productStatus.delete` виконується `accountingGroup.deleteMany({ parentStatusId: id })` — видаляються усі сателітні групи та їх підстатуси (каскад Prisma), потім сам головний статус.
- Логіка «останній підстатус у сателіті» без змін.
