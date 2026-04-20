## Код статусу — автозаповнення з назви

**Дата:** 2026-03-31

**Контекст:** У `field-definitions-management` код з назви через `slugify(label)` + `codeManuallyEdited`. У формі статусу (`statuses-management.tsx`) цього не було.

**Облікові групи:** у Prisma `AccountingGroup` немає поля `code` (лише `name`) — трансліт коду для груп не застосовується.

**Реалізація:**
- `slugify` з `@/lib/slugify`, `statusForm.watch("name")`, `useEffect` оновлює `code` коли `editingStatus == null` і `!statusCodeManuallyEdited`.
- Після зміни поля коду вручну при створенні — `setStatusCodeManuallyEdited(true)` (як у полях).
- Скидання прапорця в `openStatusForCreate`, `openStatusForEdit`, `closeStatusSheet`.
- Підказка `fieldDefinitions.codeAutoHint`, placeholder `fieldDefinitions.codePlaceholder`, `font-mono` на input.

Див. `ui/order-reorder-optimistic-march-2026` / статуси.