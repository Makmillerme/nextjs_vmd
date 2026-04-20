## Feature: Visual separators + Reorder lock + Default 'Нерозібрані' status

### 1. Visual separators
**File:** `statuses-management.tsx` -- `StatusRow`
- Added `border-b border-border` to satellite section container and create-group placeholder
- When substatuses are expanded, they are now visually separated from the next main status below

### 2. Funnel reorder lock
**File:** `statuses-management.tsx`
- New computed: `const funnelReorderLocked = accountingGroups.length > 0`
- `canStatusMoveUp` and `canStatusMoveDown` now include `&& !funnelReorderLocked`
- When ANY non-default accounting groups exist, main funnel status reordering is disabled
- Substatus reordering inside satellite groups remains unrestricted

### 3. Default 'Нерозібрані' status

**3a) Backend: `ensureDefaultStatus(groupId)`**
**File:** `src/app/api/admin/accounting-groups/route.ts`
- New helper: checks if group has `isDefault: true` status; if not, creates 'Нерозібрані' (code: nerozibrani, color: #6b7280, isDefault: true, order: 0)
- Called inside `ensureDefaultGroup()` -- both when creating new group AND when existing group found
- Every GET to accounting-groups triggers ensureDefaultGroup -> ensureDefaultStatus

**3b) Backend: satellite group POST auto-substatus**
- When POST creates a satellite group (parentStatusId provided), after creation:
  - Calls `ensureDefaultStatus(newGroupId)` to auto-create 'Нерозібрані' substatus
  - Sets `hasSubStatuses: true` on the parent status

**3c) Frontend: hide status Select on product creation**
**File:** `src/features/products/components/product-detail-sheet.tsx`
- Status selector condition changed: `edit.id > 0` (only for existing products)
- `handleSave`: if creating (product == null) and product_status_id is null, auto-resolves to the first `isDefault` status from `rootStatuses`
- Added `rootStatuses` to `useStatuses` destructuring

**3d) Frontend: '+' button flow change**
- StatusRow '+' button: if `satellites.length === 0` calls `onCreateSatelliteGroup(status.id)` (create accounting group first); otherwise calls `onAddSubStatus()`
- Title adapts: shows 'Create accounting group' when no satellite, 'Add substatus' when satellite exists

**3e) Frontend: '+' in satellite header**
- Added Plus button in satellite group header bar (before Pencil edit button)
- Calls `onAddSubStatus()` for adding substatuses into existing satellite group

### i18n keys added
- `productsConfig.statusesConfig.reorderLockedHint`
- `productsConfig.statusesConfig.defaultStatusName`

### TypeScript: 0 errors