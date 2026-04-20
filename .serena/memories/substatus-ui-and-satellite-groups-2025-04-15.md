## Feature: Substatus UI polish + Satellite accounting groups

### Phase 1: Substatus visual improvement
**File:** `statuses-management.tsx` -- `StatusRow` component
- Satellite group expanded section redesigned: `pl-10 border-l-2 border-primary/20 bg-muted/10`
- Header now shows: bold name, count Badge (outline), Pencil button to edit satellite group
- Sub-status rows: dividers via `border-b border-border/30 last:border-b-0`, `font-medium`, smaller reorder buttons (`size-5`)
- Removed extra `w-5` spacer for cleaner alignment

### Phase 2: Satellite accounting group management
**Concept:** Satellite `AccountingGroup` (with `parentStatusId`) can now be explicitly created/edited with name+description. One per parent status, always covers ALL substatuses.

**State:** `satelliteParentStatusId: string | null` added to `StatusesManagement`
- `openSatelliteGroupForEdit(sg)` -- opens existing satellite group in group sheet
- `openSatelliteGroupForCreate(parentStatusId)` -- creates new satellite group
- Group Sheet conditionally hides `startStatusId`/`endStatusId` fields when `satelliteParentStatusId` is set
- Sheet title changes to 'Create accounting group' with hint in satellite mode
- `createGroup` API helper extended with optional `parentStatusId`
- StatusRow receives `onEditSatelliteGroup` and `onCreateSatelliteGroup` callbacks
- When expanded area has `hasSubStatuses=true` but no satellite groups, shows 'Create accounting group' button

### Phase 3a: Public API
**File:** `src/app/api/statuses/route.ts`
- Now also fetches satellite groups (`parentStatusId: { not: null }`) and returns them as `satelliteGroups` alongside `groups`
- Minimal select: `id, name, order, parentStatusId, isDefault`

### Phase 3b: Sidebar
**File:** `src/components/layout/catalog-nav-item.tsx`
- `fetchSidebarGroups()` returns `{ groups, satelliteGroups }` from the API
- Root non-default groups render in first `SidebarMenuSub`
- If satellite groups exist: `Separator` + second `SidebarMenuSub` with its own left border indicator
- Links: `/catalog/[categoryId]/group/[groupId]` -- routing works as-is

### i18n keys added
- `productsConfig.accountingGroups.editSatelliteGroup`
- `productsConfig.accountingGroups.createSatelliteGroup`
- `productsConfig.accountingGroups.satelliteGroupHint`

### TypeScript: 0 errors