"use client";

import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Закриває всі toasts (Sonner) при pointerdown поза контейнером тостів.
 * Кліки всередині [data-sonner-toaster] ігноруються (кнопка закриття, actions).
 */
export function ToastDismissOnInteraction() {
  useEffect(() => {
    const onPointerDownCapture = (e: PointerEvent) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest("[data-sonner-toaster]")) return;
      toast.dismiss();
    };
    document.addEventListener("pointerdown", onPointerDownCapture, true);
    return () =>
      document.removeEventListener("pointerdown", onPointerDownCapture, true);
  }, []);
  return null;
}

