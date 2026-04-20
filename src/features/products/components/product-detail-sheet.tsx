"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useLocale } from "@/lib/locale-provider";
import { useQueryClient } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDestructiveDialog } from "@/components/confirm-destructive-dialog";
import {
  SHEET_CONTENT_CLASS,
  SHEET_HEADER_CLASS,
  SHEET_BODY_CLASS,
  SHEET_FOOTER_CLASS,
  SHEET_TAB_TRIGGER_CLASS,
  SHEET_TABS_GAP,
  SHEET_TABS_CONTENT_MT,
  SHEET_SCROLL_CLASS,
  SHEET_FORM_PADDING,
  PRODUCT_CARD_GRID_GAP,
} from "@/config/sheet";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs";
import { ScrollableTabsList } from "@/components/ui/scrollable-tabs-list";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Product } from "../types";
import { fetchProductById } from "../api";
import { productsKeys, PRODUCT_DETAIL_STALE_MS } from "../queries";
import { DynamicFieldRenderer } from "./dynamic-field-renderer";
import { useStatuses, type PublicGroupItem } from "../hooks/use-statuses";
import {
  useProductConfig,
  productConfigQueryKeys,
  type ProductConfigTab,
} from "../hooks/use-product-config";
import { SYSTEM_TAB_CONFIG } from "@/config/system-tab";
import { useQuery } from "@tanstack/react-query";
import { computeGridLayout, type GridField } from "../lib/grid-layout";
import {
  buildProductCardSegments,
  stretchGroupInnerGridClass,
  stretchGroupParentColClass,
} from "../lib/product-card-grid-segments";
import { Plus, X } from "lucide-react";

type ProductDetailSheetProps = {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Поверніть створене/оновлене товар після збереження (для завантаження pending-медіа після створення). */
  onSave?: (data: Product, isCreate: boolean) => Promise<Product | void>;
  onDelete?: (id: number) => Promise<void>;
  /** Тип товару для контексту категорії (для створення та відображення полів). */
  productTypeId?: string | null;
  /** Категорія для прив'язки нового товару (при створенні з каталогу). */
  categoryId?: string | null;
  /** Назва категорії для заголовків (напр. "Авто", "Товари"). */
  categoryLabel?: string;
  /** Режим прев'ю: приховує кнопку видалення, показує "Скасувати" та "Зберегти". */
  previewMode?: boolean;
  /** У прев'ю: типи товару категорії для вибору в заголовку. */
  previewProductTypes?: { id: string; name: string }[];
  /** У прев'ю: обраний тип товару. */
  previewProductTypeId?: string | null;
  /** У прев'ю: зміна типу товару. */
  onPreviewProductTypeChange?: (productTypeId: string) => void;
  /** У прев'ю: натиснуто "+" на картці (додати поле). row, col — позиція порожньої клітинки. */
  onClickAddField?: (tabId: string, row?: number, col?: number) => void;
  /** У прев'ю: видалити поле з табу. */
  onRemoveField?: (tabId: string, fieldDefinitionId: string) => void;
  /** Каталог відкрито з облікової групи підстатусів: у шапці лише підстатус, без головного статусу. */
  satelliteAccountingGroupId?: string | null;
};

function findSatelliteStatuses(
  groups: PublicGroupItem[],
  satelliteId: string
) {
  const def = groups.find((g) => g.isDefault);
  if (!def) return [];
  for (const s of def.statuses) {
    for (const sg of s.satelliteGroups ?? []) {
      if (sg.id === satelliteId) {
        return [...(sg.statuses ?? [])].sort((a, b) => a.order - b.order);
      }
    }
  }
  return [];
}

const EMPTY_EDIT: Product = {
  id: 0,
  processed_file_id: null,
  product_status_id: null,
  product_sub_status_id: null,
  product_type_id: null,
  category_id: null,
  created_at: "",
};

type DocumentFolder = { id: string; label: string };

function parseDocumentFoldersFromPresetValues(presetValues: string | null): DocumentFolder[] {
  if (!presetValues?.trim()) return [];
  try {
    const parsed = JSON.parse(presetValues) as { folders?: { code: string; label: string }[] };
    const folders = parsed?.folders;
    if (!Array.isArray(folders)) return [];
    return folders
      .filter((f) => typeof f === "object" && f !== null && typeof (f as { code?: string }).code === "string")
      .map((f) => ({ id: (f as { code: string }).code, label: (f as { label?: string }).label ?? (f as { code: string }).code }));
  } catch {
    return [];
  }
}

function parseDocumentFoldersFromTabConfig(tabConfig: string | null): DocumentFolder[] {
  if (!tabConfig?.trim()) return [];
  try {
    const parsed = JSON.parse(tabConfig) as { folders?: { code: string; label: string }[] };
    const folders = parsed?.folders;
    if (!Array.isArray(folders)) return [];
    return folders
      .filter((f) => typeof f === "object" && f !== null && typeof (f as { code?: string }).code === "string")
      .map((f) => ({ id: (f as { code: string }).code, label: (f as { label?: string }).label ?? (f as { code: string }).code }));
  } catch {
    return [];
  }
}

function getDocumentFoldersForField(
  field: { fieldDefinition: { presetValues: string | null } },
  tabConfig: string | null
): DocumentFolder[] {
  const fromPreset = parseDocumentFoldersFromPresetValues(field.fieldDefinition.presetValues);
  if (fromPreset.length > 0) return fromPreset;
  return parseDocumentFoldersFromTabConfig(tabConfig);
}

type DynamicTabsProps = {
  tabs: ProductConfigTab[] | null;
  edit: Product;
  update: (key: keyof Product | string, value: unknown) => void;
  saving: boolean;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  previewMode?: boolean;
  /** Статус винесено в шапку sheet (облік з таблиці) — прибираємо поле з тіла картки. */
  statusFieldInHeader?: boolean;
  onClickAddField?: (tabId: string, row?: number, col?: number) => void;
  onRemoveField?: (tabId: string, fieldDefinitionId: string) => void;
};

function DynamicTabs({
  tabs,
  edit,
  update,
  saving,
  activeTab,
  setActiveTab,
  previewMode,
  statusFieldInHeader = false,
  onClickAddField,
  onRemoveField,
}: DynamicTabsProps) {
  const { t } = useLocale();
  const configTabs = tabs ?? [];
  const defaultTab = configTabs[0]?.id ?? "";

  if (configTabs.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-8 text-center">
        <p className="text-sm text-muted-foreground">{t("productDetail.noTabs")}</p>
        <p className="text-xs text-muted-foreground/80">{t("productDetail.createInDataModel")}</p>
      </div>
    );
  }

  return (
    <Tabs value={configTabs.some((t) => t.id === activeTab) ? activeTab : defaultTab} onValueChange={setActiveTab} className={cn("flex min-h-0 flex-1 flex-col", SHEET_TABS_GAP)}>
      <ScrollableTabsList variant="line">
        {configTabs.map((tab) => (
          <TabsTrigger key={tab.id} value={tab.id} className={SHEET_TAB_TRIGGER_CLASS}>
            <span className="min-w-0 truncate">
              {tab.isSystem ? t(SYSTEM_TAB_CONFIG.nameI18nKey) : tab.name}
            </span>
          </TabsTrigger>
        ))}
      </ScrollableTabsList>

      {configTabs.map((tab) => {
        const dedupedFields = Array.from(
          tab.fields.reduce((map, f) => {
            const prev = map.get(f.fieldDefinitionId);
            if (!prev || (f.productTypeId && !prev.productTypeId)) {
              map.set(f.fieldDefinitionId, f);
            }
            return map;
          }, new Map<string, (typeof tab.fields)[number]>()).values()
        ).filter((f) => {
          const c = f.fieldDefinition.code;
          if (c === "sub_status") return false;
          if (statusFieldInHeader && c === "status") return false;
          return true;
        });
        const fieldById = new Map(dedupedFields.map((f) => [f.fieldDefinitionId, f]));
        const gridFields: GridField[] = dedupedFields.map((f): GridField => ({
          fieldDefinitionId: f.fieldDefinitionId,
          colSpan: f.colSpan,
          order: f.order,
          label: f.fieldDefinition.label,
          code: f.fieldDefinition.code,
          widgetType: f.fieldDefinition.widgetType,
          targetRow: (f as { targetRow?: number }).targetRow,
          targetCol: (f as { targetCol?: number }).targetCol,
        }));
        /** Без полів у прев'ю все одно показуємо ряд сітки з «+» (computeGridLayout([], 3) дає 3 empty-клітинки). */
        const gridItems =
          dedupedFields.length > 0 || (previewMode && onClickAddField)
            ? computeGridLayout(gridFields, 3)
            : [];
        const segments = buildProductCardSegments(gridItems, fieldById);

        return (
          <TabsContent key={tab.id} value={tab.id} className={cn(SHEET_TABS_CONTENT_MT, "flex-1 min-w-0 p-2 data-[state=inactive]:hidden", SHEET_SCROLL_CLASS)}>
            <div className={cn("grid grid-cols-1 sm:grid-cols-3", PRODUCT_CARD_GRID_GAP, "items-start", SHEET_FORM_PADDING)}>
              {gridItems.length === 0 ? (
                <p className="col-span-full text-sm text-muted-foreground py-8 text-center">
                  {t("productDetail.noFields")}
                </p>
              ) : (
                segments.map((seg) => {
                  if (seg.kind === "empty") {
                    if (previewMode) {
                      return (
                        <button
                          key={`empty-${seg.row}-${seg.col}`}
                          type="button"
                          onClick={() => onClickAddField?.(tab.id, seg.row, seg.col)}
                          disabled={saving}
                          className={cn(
                            "group flex min-h-[4.5rem] items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/20",
                            "transition-colors hover:border-primary/40 hover:bg-primary/5",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            saving && "pointer-events-none opacity-40"
                          )}
                          title={t("productsConfig.tabsConfig.addFieldToTab")}
                        >
                          <Plus className="size-5 text-muted-foreground/40 transition-colors group-hover:text-primary/60" />
                        </button>
                      );
                    }
                    return (
                      <div
                        key={`empty-${seg.row}-${seg.col}-${tab.id}`}
                        className="hidden min-h-0 w-full sm:block"
                        aria-hidden
                      />
                    );
                  }
                  if (seg.kind === "stretchGroup") {
                    return (
                      <div
                        key={`stretch-${seg.row}-${seg.fields.map((x) => x.id).join("-")}`}
                        className={cn(
                          "relative min-w-0",
                          stretchGroupParentColClass(seg.parentColSpan)
                        )}
                      >
                        <div className={stretchGroupInnerGridClass(seg.fields.length)}>
                          {seg.fields.map((f) => (
                            <div key={f.id} className="group/field relative min-w-0">
                              <DynamicFieldRenderer
                                field={f}
                                product={edit}
                                onUpdate={update}
                                disabled={saving}
                                tabActive={activeTab === tab.id}
                                documentFolders={getDocumentFoldersForField(f, tab.tabConfig)}
                                previewMode={previewMode}
                              />
                              {previewMode && onRemoveField && (
                                <button
                                  type="button"
                                  onClick={() => onRemoveField(tab.id, f.fieldDefinitionId)}
                                  disabled={saving}
                                  className={cn(
                                    "absolute -right-1.5 -top-1.5 z-10 rounded-full border bg-background p-0.5 shadow-sm",
                                    "text-muted-foreground/50 opacity-0 transition-opacity",
                                    "hover:bg-destructive/10 hover:text-destructive",
                                    "group-hover/field:opacity-100 focus-visible:opacity-100",
                                    saving && "pointer-events-none"
                                  )}
                                  title={t("users.delete")}
                                >
                                  <X className="size-3" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }
                  const f = seg.field;
                  return (
                    <div key={f.id} className={cn("group/field relative min-w-0", seg.spanClass)}>
                      <DynamicFieldRenderer
                        field={f}
                        product={edit}
                        onUpdate={update}
                        disabled={saving}
                        tabActive={activeTab === tab.id}
                        documentFolders={getDocumentFoldersForField(f, tab.tabConfig)}
                        previewMode={previewMode}
                      />
                      {previewMode && onRemoveField && (
                        <button
                          type="button"
                          onClick={() => onRemoveField(tab.id, f.fieldDefinitionId)}
                          disabled={saving}
                          className={cn(
                            "absolute -right-1.5 -top-1.5 z-10 rounded-full border bg-background p-0.5 shadow-sm",
                            "text-muted-foreground/50 opacity-0 transition-opacity",
                            "hover:bg-destructive/10 hover:text-destructive",
                            "group-hover/field:opacity-100 focus-visible:opacity-100",
                            saving && "pointer-events-none"
                          )}
                          title={t("users.delete")}
                        >
                          <X className="size-3" />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </TabsContent>
        );
      })}
    </Tabs>
  );
}

export function ProductDetailSheet({
  product,
  open,
  onOpenChange,
  onSave,
  onDelete,
  productTypeId: productTypeIdProp,
  categoryId: categoryIdProp,
  categoryLabel: categoryLabelProp,
  previewMode = false,
  previewProductTypes,
  previewProductTypeId,
  onPreviewProductTypeChange,
  onClickAddField,
  onRemoveField,
  satelliteAccountingGroupId = null,
}: ProductDetailSheetProps) {
  const { t, tFormat } = useLocale();
  const categoryId = categoryIdProp ?? null;
  const categoryLabel = categoryLabelProp ?? t("productDetail.defaultCategoryLabel");
  const [edit, setEdit] = useState<Product>(EMPTY_EDIT);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("");
  const requestedProductIdRef = useRef<number | null>(null);
  const queryClient = useQueryClient();
  const statusSheetCategoryId = edit.category_id ?? categoryId ?? undefined;
  const {
    rootOptions: statusSelectOptions,
    rootStatuses,
    groups: statusGroups,
    isLoading: statusSelectLoading,
  } = useStatuses(statusSheetCategoryId);

  const satelliteSubOptions = useMemo(() => {
    if (!satelliteAccountingGroupId) return [];
    return findSatelliteStatuses(statusGroups, satelliteAccountingGroupId).map((st) => ({
      value: st.id,
      label: st.name,
    }));
  }, [statusGroups, satelliteAccountingGroupId]);

  const satelliteSubDefaultAppliedRef = useRef(false);

  /** Поки політика requireComplete і підстатус не останній у сателіті — заборона зміни головного статусу (крім поточного). */
  const mainStatusChangeBlocked = useMemo(() => {
    if (satelliteAccountingGroupId) return false;
    const mid = edit.product_status_id;
    if (!mid) return false;
    const st = rootStatuses.find((s) => s.id === mid);
    const sg = st?.satelliteGroups?.[0];
    if (!sg || sg.subFunnelPolicy !== "requireComplete") return false;
    const statuses = sg.statuses ?? [];
    if (statuses.length === 0) return false;
    const last = statuses.reduce((a, b) => (a.order >= b.order ? a : b));
    return (edit.product_sub_status_id ?? null) !== last.id;
  }, [
    satelliteAccountingGroupId,
    edit.product_status_id,
    edit.product_sub_status_id,
    rootStatuses,
  ]);

  useEffect(() => {
    if (!open) {
      satelliteSubDefaultAppliedRef.current = false;
      return;
    }
    if (!satelliteAccountingGroupId || product != null) return;
    if (satelliteSubDefaultAppliedRef.current) return;
    const subs = findSatelliteStatuses(statusGroups, satelliteAccountingGroupId);
    const defSub = subs.find((s) => s.isDefault);
    if (defSub) {
      satelliteSubDefaultAppliedRef.current = true;
      setEdit((e) => ({ ...e, product_sub_status_id: defSub.id }));
    }
  }, [open, satelliteAccountingGroupId, product, statusGroups]);

  const { data: defaultProductType } = useQuery({
    queryKey: productConfigQueryKeys.defaultType,
    queryFn: async () => {
      const res = await fetch("/api/product-config/default", { cache: "no-store" });
      if (!res.ok) return null;
      return res.json() as Promise<{ id: string; name: string }>;
    },
    staleTime: 10 * 60 * 1000,
    enabled: !productTypeIdProp,
  });

  const productTypeId =
    previewMode && previewProductTypeId
      ? previewProductTypeId
      : productTypeIdProp ?? defaultProductType?.id ?? null;
  const { data: productConfig } = useProductConfig(productTypeId);

  useEffect(() => {
    const tabs = productConfig?.tabs ?? [];
    if (tabs.length > 0 && !tabs.some((t) => t.id === activeTab)) {
      setActiveTab(tabs[0]!.id);
    }
  }, [productConfig?.tabs, activeTab]);

  useEffect(() => {
    if (!open) return;
    if (product) {
      if (product.id > 0) {
        requestedProductIdRef.current = product.id;
        // Одразу показуємо дані поточного товару без медіа, щоб не показувати чужих фото з попереднього стану.
        setEdit({ ...product, media: [] });
        const openedId = product.id;
        queryClient
          .fetchQuery({
            queryKey: productsKeys.detail(product.id),
            queryFn: () => fetchProductById(product.id),
            staleTime: PRODUCT_DETAIL_STALE_MS,
          })
          .then((full) => {
            if (full && requestedProductIdRef.current === openedId) setEdit({ ...full });
          })
          .catch(() => {
            setEdit((prev) => (prev.id === openedId ? { ...prev, media: [] } : prev));
          });
      } else {
        requestedProductIdRef.current = null;
        setEdit({ ...product });
      }
    } else {
      requestedProductIdRef.current = null;
      setEdit({
        ...EMPTY_EDIT,
        category_id: categoryId ?? null,
        product_type_id: productTypeId ?? null,
      });
    }
  }, [open, product, queryClient, categoryId, productTypeId]);

  const update = useCallback((key: keyof Product | string, value: unknown) => {
    setEdit((prev) => ({ ...prev, [key]: value } as Product));
  }, []);

  const handleSave = async () => {
    if (!onSave) {
      onOpenChange(false);
      return;
    }
    setSaveError(null);
    setSaving(true);
    try {
      let toSave = edit;
      if (product == null && !edit.product_status_id) {
        const defaultStatus = rootStatuses.find((s) => s.isDefault);
        if (defaultStatus) {
          toSave = { ...edit, product_status_id: defaultStatus.id };
        }
      }
      await onSave(toSave, product == null);
      onOpenChange(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : t("errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = () => {
    setDeleteError(null);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!onDelete || !product) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      await onDelete(product.id);
      setDeleteDialogOpen(false);
      onOpenChange(false);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : t("errors.deleteFailed"));
    } finally {
      setDeleting(false);
    }
  };

  const title =
    previewMode
      ? categoryLabel
      : product == null
        ? tFormat("productDetail.addItem", { category: categoryLabel })
        : edit.brand || edit.model
          ? [edit.brand, edit.model].filter(Boolean).join(" ") || tFormat("productDetail.cardTitle", { category: categoryLabel })
          : tFormat("productDetail.cardTitle", { category: categoryLabel });

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className={SHEET_CONTENT_CLASS}
          aria-describedby={undefined}
          onPointerDownOutside={(e) => {
            if ((e.target as Element)?.closest?.("[data-calculator-root]")) e.preventDefault();
          }}
        >
          <SheetHeader className={SHEET_HEADER_CLASS}>
            <div className="flex min-h-0 min-w-0 flex-1 flex-row items-center gap-3 overflow-hidden pr-1">
              <SheetTitle className="min-w-0 flex-1 truncate text-base font-semibold sm:text-lg">
                {title}
              </SheetTitle>
              {previewMode &&
                previewProductTypes &&
                previewProductTypes.length > 0 &&
                onPreviewProductTypeChange && (
                  <Select
                    value={previewProductTypeId || "__all__"}
                    onValueChange={(v) => onPreviewProductTypeChange(v === "__all__" ? "" : v)}
                  >
                    <SelectTrigger className="h-8 w-fit min-w-[8rem] shrink-0">
                      <SelectValue placeholder={t("dataModel.allTypes")} />
                    </SelectTrigger>
                    <SelectContent
                      position="popper"
                      side="bottom"
                      align="start"
                      className="min-w-[var(--radix-select-trigger-width)] max-h-[min(16rem,60vh)]"
                    >
                      <SelectItem value="__all__">{t("dataModel.allTypes")}</SelectItem>
                      {previewProductTypes.map((pt) => (
                        <SelectItem key={pt.id} value={pt.id}>
                          {pt.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              {!previewMode && statusSheetCategoryId && satelliteAccountingGroupId ? (
                <div className="flex min-w-0 shrink-0 flex-col items-end gap-0.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 whitespace-nowrap text-xs font-medium leading-none text-muted-foreground">
                      {t("products.subStatusColumn")}
                    </span>
                    <Select
                      value={edit.product_sub_status_id ?? "__none__"}
                      onValueChange={(v) =>
                        update("product_sub_status_id", v === "__none__" ? null : v)
                      }
                      disabled={saving || statusSelectLoading}
                    >
                      <SelectTrigger className="h-8 w-[min(11rem,calc(100vw-8rem))] max-w-[11rem] shrink-0">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent
                        position="popper"
                        side="bottom"
                        align="start"
                        className="max-h-[min(16rem,60vh)]"
                      >
                        <SelectItem value="__none__">—</SelectItem>
                        {satelliteSubOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : !previewMode && statusSheetCategoryId && edit.id > 0 ? (
                <div className="flex min-w-0 shrink-0 flex-col items-end gap-0.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 whitespace-nowrap text-xs font-medium leading-none text-muted-foreground">
                      {t("products.statusColumn")}
                    </span>
                    <Select
                      value={edit.product_status_id ?? "__none__"}
                      onValueChange={(v) =>
                        update("product_status_id", v === "__none__" ? null : v)
                      }
                      disabled={saving || statusSelectLoading}
                    >
                      <SelectTrigger className="h-8 w-[min(11rem,calc(100vw-8rem))] max-w-[11rem] shrink-0">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent
                        position="popper"
                        side="bottom"
                        align="start"
                        className="max-h-[min(16rem,60vh)]"
                      >
                        <SelectItem
                          value="__none__"
                          disabled={mainStatusChangeBlocked}
                        >
                          —
                        </SelectItem>
                        {statusSelectOptions.map((o) => (
                          <SelectItem
                            key={o.value}
                            value={o.value}
                            disabled={
                              mainStatusChangeBlocked &&
                              o.value !== edit.product_status_id
                            }
                          >
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {mainStatusChangeBlocked ? (
                    <p className="max-w-[min(14rem,100vw-6rem)] text-right text-[10px] leading-snug text-muted-foreground">
                      {t("products.subFunnelMainBlockedHint")}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </SheetHeader>

          <div className={SHEET_BODY_CLASS}>
            <DynamicTabs
              tabs={productConfig?.tabs ?? null}
              edit={edit}
              update={update}
              saving={saving}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              previewMode={previewMode}
              statusFieldInHeader={!previewMode}
              onClickAddField={onClickAddField}
              onRemoveField={onRemoveField}
            />
          </div>

          {(saveError || !previewMode) && (
          <SheetFooter className={SHEET_FOOTER_CLASS}>
            {saveError && (
              <p className="text-destructive text-sm w-full">{saveError}</p>
            )}
            {!previewMode && (
            <div className="flex w-full flex-wrap items-center gap-2">
              {product != null && onDelete != null && (
                <Button
                  type="button"
                  variant="outline"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={handleDeleteClick}
                  disabled={saving}
                >
                  {t("users.delete")}
                </Button>
              )}
              <Button
                onClick={handleSave}
                disabled={saving}
                className="w-full sm:w-auto sm:ml-auto"
              >
                {saving ? t("users.saving") : t("productsConfig.common.save")}
              </Button>
            </div>
            )}
          </SheetFooter>
          )}
        </SheetContent>
      </Sheet>

      <ConfirmDestructiveDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title={tFormat("productDetail.deleteTitle", { category: categoryLabel })}
        description={
          <>
            {t("productDetail.deleteDescription")}
            {product && (edit.brand || edit.model)
              ? ` (${[edit.brand, edit.model].filter(Boolean).join(" ")})`
              : ""}
          </>
        }
        errorMessage={deleteError}
        cancelLabel={t("productsConfig.common.cancel")}
        confirmLabel={t("users.delete")}
        confirmPendingLabel={t("productsConfig.common.deleting")}
        confirmPending={deleting}
        cancelDisabled={deleting}
        onConfirm={handleDeleteConfirm}
      />
    </>
  );
}
