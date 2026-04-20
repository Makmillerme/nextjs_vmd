## Sonner toasts (2026)

- **Root layout** (`src/app/layout.tsx`): `Toaster` uses `position="bottom-right"`, `duration={3500}` (global default for all toasts unless overridden per call).
- **Dismiss on overlay UI**: `Sheet`, `Dialog`, and `AlertDialog` roots in `src/components/ui/` wrap `onOpenChange` and call `toast.dismiss()` when `open === true`, so toasts clear when sheets/dialogs open (avoids blocking controls).
- Per-toast `duration` can still be passed to `toast.*()` calls if needed.
- **`ToastDismissOnInteraction`** (`src/components/layout/toast-dismiss-on-interaction.tsx`): document `pointerdown` capture dismisses all toasts on any interaction outside `[data-sonner-toaster]` (clicks inside the toaster area are ignored so close/actions still work).
