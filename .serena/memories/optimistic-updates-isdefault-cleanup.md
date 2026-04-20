# Optimistic Updates + isDefault UI Cleanup (2026-04-15)

## What changed

### 1. Optimistic updates for all status mutations

File: `src/features/management/components/products-config/statuses-management.tsx`

- **deleteGroupMut**: added `onMutate` (remove group from cache), `onError` (rollback), `onSettled` (invalidateAll).
- **createGroupMut**: moved `invalidateAll()` from `onSuccess` to `onSettled` for faster toast feedback.
- **updateStatusMut**: added `onMutate` (merge body fields into cached statuses), `onError` (rollback), `onSettled` (invalidateAll).
- **deleteStatusMut**: added `onMutate` (filter out status from cache), `onError` (rollback), `onSettled` (invalidateAll).
- **createStatusMut**: toast in `onSuccess`, `invalidateAll` in `onSettled`.
- `updateGroupMut` was already optimistic from a prior session.

Pattern: `onMutate -> cancel queries -> snapshot -> setQueryData -> return { previous }`. `onError -> rollback`. `onSettled -> invalidateAll()`. Toasts in `onSuccess`/`onError`.

### 2. Removed isDefault checkbox from status editing UI

- Removed `isDefault` from `StatusFormValues` type.
- Removed `isDefault` from Zod schema (`statusSchema`).
- Removed `isDefault` from form `defaultValues`, `reset()` calls, and form submit body (both create and update paths in `onStatusSubmit`).
- Removed the `isDefault` `FormField` (Checkbox + mandatoryDefaultLocked hint) from the Sheet form.
- Removed the `isDefault` Badge from the Sheet header.

**Kept intact** (server-side & read-only indicators):
- `isDefault` in Prisma schema, API guards (PATCH/DELETE for nerozibrani), `ensureDefaultStatus` logic.
- `isDefault` badge in `StatusRow` list view (read-only).
- Reorder arrow visibility gated on `isDefault` (prevents moving Nerozibrani).
- Delete button hidden for `isDefault` statuses in Sheet footer.
- `product-detail-sheet.tsx`: auto-assigning `isDefault` status to new products.

### 3. i18n cleanup

Removed `mandatoryDefaultLocked` key from: `uk.json`, `en.json`, `uk.generated.ts`, `en.generated.ts`.

## Why

User feedback: UI must be instant (optimistic updates), and the isDefault checkbox provided no user value (Nerozibrani was locked, other statuses gained nothing from it).