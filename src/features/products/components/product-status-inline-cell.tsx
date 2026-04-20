"use client";

import { useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type StatusPillOption = { id: string; name: string; color: string };

function textColorForBg(hex: string): string {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (full.length !== 6) return "#111827";
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 186 ? "#111827" : "#ffffff";
}

type ProductStatusInlineCellProps = {
  valueId: string | null;
  options: StatusPillOption[];
  emptyLabel?: string;
  ariaLabel: string;
  disabled?: boolean;
  busy?: boolean;
  allowClear?: boolean;
  resolveUnknownLabel?: (id: string) => string;
  onChange: (nextId: string | null) => void | Promise<void>;
};

export function ProductStatusInlineCell({
  valueId,
  options,
  emptyLabel = "—",
  ariaLabel,
  disabled,
  busy,
  allowClear = true,
  resolveUnknownLabel,
  onChange,
}: ProductStatusInlineCellProps) {
  const [open, setOpen] = useState(false);

  const selected = valueId ? options.find((o) => o.id === valueId) : null;
  const fallbackHex = "#94a3b8";
  const label = valueId
    ? (selected?.name ?? resolveUnknownLabel?.(valueId) ?? valueId)
    : emptyLabel;
  const bg = selected?.color ?? fallbackHex;
  const fg = textColorForBg(bg);

  const handlePick = async (v: string) => {
    const next = v === "__none__" ? null : v;
    try {
      await onChange(next);
    } finally {
      setOpen(false);
    }
  };

  const isDisabled = disabled || busy || options.length === 0;

  return (
    <div className="flex min-w-0 items-center" onClick={(e) => e.stopPropagation()}>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={isDisabled}
            aria-label={ariaLabel}
            className={cn(
              "inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-left text-xs font-medium transition-opacity",
              valueId ? "border-black/10 shadow-sm" : "border-border bg-muted text-muted-foreground",
              !isDisabled && "hover:opacity-90 active:opacity-100",
              isDisabled && "cursor-not-allowed opacity-60"
            )}
            style={
              valueId
                ? { backgroundColor: bg, color: fg, borderColor: `${fg}22` }
                : undefined
            }
          >
            {busy ? (
              <Loader2 className="size-3.5 shrink-0 animate-spin opacity-80" aria-hidden />
            ) : null}
            <span className="min-w-0 truncate">{label}</span>
            {!busy ? (
              <ChevronDown className="size-3 shrink-0 opacity-70" aria-hidden />
            ) : null}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-h-[min(20rem,70vh)] w-[min(18rem,calc(100vw-2rem))] overflow-y-auto p-1"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenuRadioGroup
            value={valueId ?? "__none__"}
            onValueChange={(v) => void handlePick(v)}
          >
            {allowClear ? (
              <DropdownMenuRadioItem value="__none__" className="gap-2">
                <span className="text-muted-foreground">{emptyLabel}</span>
              </DropdownMenuRadioItem>
            ) : null}
            {options.map((o) => (
              <DropdownMenuRadioItem key={o.id} value={o.id} className="gap-2">
                <span
                  className="size-2.5 shrink-0 rounded-full border border-black/10"
                  style={{ backgroundColor: o.color }}
                  aria-hidden
                />
                <span className="min-w-0 truncate">{o.name}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

