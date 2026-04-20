"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MANAGEMENT_STALE_MS, managementAdminKeys, managementTabKeys } from "@/lib/query-keys";
import { fetchAdminCategories, fetchAdminProductTypes } from "@/lib/api/admin/catalog";
import {
  adminGetJson,
  adminMutationJson,
  adminDeleteAllowMissing,
} from "@/lib/api/admin/client";
import { invalidateCategoryDisplayCaches } from "@/lib/invalidate-display-caches";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { SHEET_CONTENT_CLASS, SHEET_INPUT_CLASS, SHEET_HEADER_CLASS, SHEET_BODY_CLASS, SHEET_FOOTER_CLASS, SHEET_FORM_PADDING, SHEET_SCROLL_CLASS } from "@/config/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDestructiveDialog } from "@/components/confirm-destructive-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { TablePaginationBar } from "@/components/table-pagination-bar";
import { ManagementListLoading } from "@/components/management-list-states";
import { Plus, Loader2, X, Search, ChevronUp, ChevronDown, LayoutList } from "lucide-react";
import { cn } from "@/lib/utils";
import { SYSTEM_TAB_CONFIG } from "@/config/system-tab";
import { toast } from "sonner";
import { useLocale } from "@/lib/locale-provider";
import { isFieldAvailableForCategory } from "@/features/products/lib/field-utils";
import { FULL_ROW_WIDGETS } from "@/features/products/lib/grid-layout";
import type {
  CategoryItem,
  ProductTypeItem,
  TabDefinitionItem,
  TabFieldItem,
  FieldDefinitionItem,
} from "./types";

const COLS_PER_ROW = 3;

/** order → (row, section): рядок 1, секція 1–3 (комірка в рядку) */
function orderToRowSection(order: number): { row: number; section: number } {
  const row = Math.floor(order / COLS_PER_ROW) + 1;
  const section = (order % COLS_PER_ROW) + 1;
  return { row, section };
}

/** (row, section) → order. Секція — комірка (1–3). */
function rowSectionToOrder(row: number, section: number): number {
  return (row - 1) * COLS_PER_ROW + Math.min(3, Math.max(1, section)) - 1;
}

const PAGE_SIZES = [10, 20, 50] as const;
const DEFAULT_PAGE_SIZE = 20;

type TFn = (key: string) => string;

async function fetchCategories(t: TFn): Promise<CategoryItem[]> {
  return fetchAdminCategories(t) as Promise<CategoryItem[]>;
}

async function fetchProductTypes(t: TFn): Promise<ProductTypeItem[]> {
  return fetchAdminProductTypes(t) as Promise<ProductTypeItem[]>;
}

async function fetchTabsForCategory(categoryId: string, t: TFn): Promise<TabDefinitionItem[]> {
  return adminGetJson(`/categories/${categoryId}/tabs`, t("productsConfig.tabsConfig.loadTabsFailed"));
}

async function fetchTabDetail(
  tabId: string,
  t: TFn
): Promise<TabDefinitionItem & { fields: TabFieldItem[] }> {
  return adminGetJson(`/tabs/${tabId}`, t("productsConfig.tabsConfig.loadTabFailed"));
}

async function fetchFieldDefinitions(t: TFn): Promise<FieldDefinitionItem[]> {
  const data = await adminGetJson<{ fieldDefinitions?: FieldDefinitionItem[] }>(
    "/field-definitions?pageSize=500",
    t("productsConfig.tabsConfig.loadFieldsFailed")
  );
  return data.fieldDefinitions ?? [];
}

async function createTabApi(
  categoryId: string,
  body: {
    name: string;
    icon?: string;
    order?: number;
  },
  t: TFn
): Promise<TabDefinitionItem> {
  return adminMutationJson<TabDefinitionItem>(`/categories/${categoryId}/tabs`, {
    method: "POST",
    body,
    fallbackError: t("productsConfig.tabsConfig.createTabFailed"),
  });
}

interface TabFieldInput {
  fieldDefinitionId: string;
  productTypeId?: string | null;
  order?: number;
  colSpan?: number;
  isRequired?: boolean;
  sectionTitle?: string | null;
  stretchInRow?: boolean;
}

async function updateTabApi(
  tabId: string,
  body: {
    name?: string;
    icon?: string;
    order?: number;
    fields?: TabFieldInput[];
  },
  t: TFn
) {
  return adminMutationJson(`/tabs/${tabId}`, {
    method: "PATCH",
    body,
    fallbackError: t("productsConfig.tabsConfig.saveTabFailed"),
  });
}

async function deleteTabApi(tabId: string, t: TFn) {
  await adminDeleteAllowMissing(
    `/tabs/${tabId}`,
    t("productsConfig.tabsConfig.deleteTabFailed"),
  );
}

type AssignedField = {
  fieldDefinitionId: string;
  productTypeId: string | null;
  order: number;
  colSpan: number;
  isRequired: boolean;
  sectionTitle: string;
  stretchInRow: boolean;
  fieldDefinition: FieldDefinitionItem;
};

type TabsConfigManagementProps = {
  categoryId?: string;
  onRequestCreateField?: (categoryId: string) => void;
  /** Коли передано — кнопка «Додати таб» рендериться зовні (наприклад, в header). */
  openAddTabRef?: React.MutableRefObject<(() => void) | null>;
};

export function TabsConfigManagement({
  categoryId: selectedCategoryId = "",
  onRequestCreateField,
  openAddTabRef,
}: TabsConfigManagementProps = {}) {
  const { t, tFormat } = useLocale();
  const queryClient = useQueryClient();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [isCreate, setIsCreate] = useState(false);
  const [saving, setSaving] = useState(false);

  const [tabName, setTabName] = useState("");
  const [tabIcon, setTabIcon] = useState("");
  const [tabOrder, setTabOrder] = useState(0);

  const [assignedFields, setAssignedFields] = useState<AssignedField[]>([]);
  const [addFieldDialogOpen, setAddFieldDialogOpen] = useState(false);
  const [deleteTabDialogOpen, setDeleteTabDialogOpen] = useState(false);
  const [tabOrderBusy, setTabOrderBusy] = useState(false);

  const { data: categories = [] } = useQuery({
    queryKey: [...managementAdminKeys.categories],
    queryFn: () => fetchCategories(t),
    staleTime: MANAGEMENT_STALE_MS,
  });

  const { data: productTypes = [] } = useQuery({
    queryKey: managementAdminKeys.productTypes,
    queryFn: () => fetchProductTypes(t),
    staleTime: MANAGEMENT_STALE_MS,
    enabled: !!selectedCategoryId,
  });

  const productTypeIdsInCategory = useMemo(
    () =>
      productTypes
        .filter((pt) => pt.categoryId === selectedCategoryId)
        .map((pt) => pt.id),
    [productTypes, selectedCategoryId],
  );

  const bustDisplayCaches = useCallback(() => {
    if (!selectedCategoryId) return;
    invalidateCategoryDisplayCaches(
      queryClient,
      selectedCategoryId,
      productTypeIdsInCategory,
    );
  }, [queryClient, selectedCategoryId, productTypeIdsInCategory]);

  const tabsQueryKey = managementTabKeys.categoryTabs(selectedCategoryId);
  const { data: tabs = [], isLoading: tabsLoading } = useQuery({
    queryKey: tabsQueryKey,
    queryFn: () => fetchTabsForCategory(selectedCategoryId, t),
    enabled: !!selectedCategoryId,
    staleTime: MANAGEMENT_STALE_MS,
  });

  const { data: tabDetail, isLoading: tabDetailLoading } = useQuery({
    queryKey: [...managementTabKeys.allTabDetails, editingTabId] as const,
    queryFn: () => fetchTabDetail(editingTabId!, t),
    enabled: !!editingTabId && !isCreate,
    staleTime: MANAGEMENT_STALE_MS,
  });

  const { data: allFields = [], isLoading: allFieldsLoading } = useQuery({
    queryKey: [...managementAdminKeys.fieldDefinitions],
    queryFn: () => fetchFieldDefinitions(t),
    staleTime: MANAGEMENT_STALE_MS,
    enabled: addFieldDialogOpen,
  });

  useEffect(() => {
    if (!editingTabId || isCreate) return;
    if (!tabDetail || tabDetail.id !== editingTabId) return;
    const rawFields = tabDetail.fields ?? [];
    const seen = new Map<string, (typeof rawFields)[number]>();
    for (const f of rawFields) {
      const prev = seen.get(f.fieldDefinitionId);
      if (!prev || (f.productTypeId && !prev.productTypeId)) {
        seen.set(f.fieldDefinitionId, f);
      }
    }
    setAssignedFields(
      Array.from(seen.values()).map((f) => ({
        fieldDefinitionId: f.fieldDefinitionId,
        productTypeId: f.productTypeId ?? null,
        order: f.order,
        colSpan: f.colSpan,
        isRequired: f.isRequired,
        sectionTitle: f.sectionTitle ?? "",
        stretchInRow: f.stretchInRow ?? false,
        fieldDefinition: f.fieldDefinition,
      }))
    );
  }, [tabDetail, editingTabId, isCreate]);

  const assignedInCard = useMemo(() => {
    const ids = new Set<string>();
    for (const tab of tabs) {
      const fields = (tab as { fields?: { fieldDefinitionId: string }[] }).fields ?? [];
      for (const f of fields) ids.add(f.fieldDefinitionId);
    }
    return ids;
  }, [tabs]);

  const allAssignedIds = useMemo(() => {
    const ids = new Set(assignedInCard);
    for (const f of assignedFields) ids.add(f.fieldDefinitionId);
    return ids;
  }, [assignedInCard, assignedFields]);

  const unassignedFields = useMemo(() => {
    return allFields.filter((f) => !allAssignedIds.has(f.id));
  }, [allFields, allAssignedIds]);

  const categoryNameById = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories]
  );

  const groupedUnassignedFields = useMemo(() => {
    const unassigned = allFields.filter((f) => !allAssignedIds.has(f.id));
    const isGlobal = (f: FieldDefinitionItem) =>
      !(f.categoryIds?.length) && !(f.productTypeIds?.length);
    const availableForCurrent = (f: FieldDefinitionItem) =>
      isFieldAvailableForCategory(f, selectedCategoryId, null, productTypes);
    const global = unassigned.filter(isGlobal);
    const currentCat = unassigned.filter(
      (f) => !isGlobal(f) && availableForCurrent(f)
    );
    return { currentCat, global, otherCats: [] as FieldDefinitionItem[] };
  }, [allFields, allAssignedIds, selectedCategoryId, productTypes]);

  const sortedTabs = useMemo(
    () =>
      [...tabs].sort((a, b) =>
        a.order !== b.order ? a.order - b.order : a.id.localeCompare(b.id)
      ),
    [tabs]
  );

  const moveTabOrder = useCallback(
    async (tabId: string, direction: "up" | "down") => {
      const list = sortedTabs;
      const idx = list.findIndex((x) => x.id === tabId);
      if (idx < 0) return;
      const j = direction === "up" ? idx - 1 : idx + 1;
      if (j < 0 || j >= list.length) return;
      const a = list[idx];
      const b = list[j];
      if (a.isSystem || b.isSystem) return;
      const orderA = a.order;
      const orderB = b.order;

      const previous = queryClient.getQueryData<TabDefinitionItem[]>(tabsQueryKey);
      const applySwap = (old: TabDefinitionItem[] = []) =>
        old
          .map((tab) => {
            if (tab.id === a.id) return { ...tab, order: orderB };
            if (tab.id === b.id) return { ...tab, order: orderA };
            return tab;
          })
          .sort((x, y) =>
            x.order !== y.order ? x.order - y.order : x.id.localeCompare(y.id)
          );

      queryClient.setQueryData<TabDefinitionItem[]>(tabsQueryKey, applySwap);
      if (editingTabId === a.id) setTabOrder(orderB);
      if (editingTabId === b.id) setTabOrder(orderA);
      queueMicrotask(() => bustDisplayCaches());

      setTabOrderBusy(true);
      try {
        await Promise.all([
          updateTabApi(a.id, { order: orderB }, t),
          updateTabApi(b.id, { order: orderA }, t),
        ]);
      } catch (e) {
        if (previous !== undefined) {
          queryClient.setQueryData(tabsQueryKey, previous);
        } else {
          void queryClient.invalidateQueries({ queryKey: tabsQueryKey });
        }
        toast.error(e instanceof Error ? e.message : t("errors.saveFailed"));
      } finally {
        setTabOrderBusy(false);
      }
    },
    [sortedTabs, t, queryClient, tabsQueryKey, bustDisplayCaches, editingTabId]
  );

  /** Не зберігати таб, поки не підтягнуто деталі — інакше PATCH з порожнім fields зітре TabField у БД. */
  const tabEditDetailReady =
    isCreate ||
    (!!editingTabId &&
      !!tabDetail &&
      tabDetail.id === editingTabId &&
      !tabDetailLoading);

  const [searchInput, setSearchInput] = useState("");
  const search = searchInput.trim().toLowerCase();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [pageInputValue, setPageInputValue] = useState("1");

  const filteredTabs = useMemo(
    () =>
      search
        ? sortedTabs.filter(
            (tab) =>
              tab.name.toLowerCase().includes(search) ||
              (tab.icon ?? "").toLowerCase().includes(search)
          )
        : sortedTabs,
    [sortedTabs, search]
  );

  const total = filteredTabs.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const paginatedTabs = useMemo(
    () => filteredTabs.slice((page - 1) * pageSize, page * pageSize),
    [filteredTabs, page, pageSize]
  );

  useEffect(() => {
    setPageInputValue(String(page));
  }, [page]);

  useEffect(() => {
    if (totalPages > 0 && page > totalPages) {
      setPage(totalPages);
    }
  }, [totalPages, page]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const handleSearchSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setPage(1);
    },
    []
  );

  const handlePageInputBlur = useCallback(() => {
    const n = parseInt(pageInputValue, 10);
    const clamped = Number.isNaN(n) ? page : Math.max(1, Math.min(totalPages, n));
    setPage(clamped);
    setPageInputValue(String(clamped));
  }, [pageInputValue, totalPages, page]);

  const handlePageInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") handlePageInputBlur();
    },
    [handlePageInputBlur]
  );

  const goToPage = useCallback(
    (p: number) => {
      const clamped = Math.max(1, Math.min(totalPages, p));
      setPage(clamped);
    },
    [totalPages]
  );

  const createMut = useMutation({
    mutationFn: (body: Parameters<typeof createTabApi>[1]) => {
      if (!selectedCategoryId) throw new Error("category");
      return createTabApi(selectedCategoryId, body, t);
    },
    onMutate: async (body) => {
      if (!selectedCategoryId) return {};
      await queryClient.cancelQueries({ queryKey: tabsQueryKey });
      const previous = queryClient.getQueryData<TabDefinitionItem[]>(tabsQueryKey);
      const tempId = `optimistic-${Date.now()}`;
      const now = new Date().toISOString();
      const optimistic: TabDefinitionItem = {
        id: tempId,
        categoryId: selectedCategoryId,
        name: body.name,
        icon: body.icon?.trim() ? body.icon.trim() : null,
        tabConfig: null,
        order: body.order ?? 0,
        isSystem: false,
        createdAt: now,
        updatedAt: now,
        _count: { fields: 0 },
      };
      queryClient.setQueryData<TabDefinitionItem[]>(tabsQueryKey, (old = []) =>
        [...old, optimistic].sort((a, b) => a.order - b.order),
      );
      return { previous, tempId };
    },
    onError: (_err, _body, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(tabsQueryKey, ctx.previous);
      }
    },
    onSuccess: (data, _body, ctx) => {
      const merged: TabDefinitionItem = {
        ...data,
        updatedAt: data.updatedAt ?? data.createdAt,
        _count: data._count ?? { fields: 0 },
      };
      queryClient.setQueryData<TabDefinitionItem[]>(tabsQueryKey, (old = []) =>
        old
          .map((tab) => (tab.id === ctx?.tempId ? merged : tab))
          .sort((a, b) => a.order - b.order),
      );
      bustDisplayCaches();
      toast.success(t("toasts.tabCreated"));
    },
  });

  const updateMut = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: Parameters<typeof updateTabApi>[1];
    }) => updateTabApi(id, body, t),
    onMutate: async ({ id, body }) => {
      await queryClient.cancelQueries({ queryKey: tabsQueryKey });
      const previous = queryClient.getQueryData<TabDefinitionItem[]>(tabsQueryKey);
      queryClient.setQueryData<TabDefinitionItem[]>(tabsQueryKey, (old = []) =>
        old
          .map((tab) =>
            tab.id === id
              ? {
                  ...tab,
                  ...(body.name !== undefined ? { name: body.name } : {}),
                  ...(body.icon !== undefined
                    ? { icon: body.icon ?? null }
                    : {}),
                  ...(body.order !== undefined ? { order: body.order } : {}),
                }
              : tab,
          )
          .sort((a, b) => a.order - b.order),
      );
      return { previous };
    },
    onError: (_err, _v, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(tabsQueryKey, ctx.previous);
      }
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: managementTabKeys.tabDetail(id) });
      bustDisplayCaches();
      toast.success(t("toasts.tabSaved"));
    },
  });

  const deleteMut = useMutation({
    mutationFn: (tabId: string) => deleteTabApi(tabId, t),
    onMutate: async (tabId) => {
      await queryClient.cancelQueries({ queryKey: tabsQueryKey });
      const previous = queryClient.getQueryData<TabDefinitionItem[]>(tabsQueryKey);
      queryClient.setQueryData<TabDefinitionItem[]>(tabsQueryKey, (old = []) =>
        old.filter((tab) => tab.id !== tabId),
      );
      queryClient.removeQueries({ queryKey: managementTabKeys.tabDetail(tabId) });
      if (editingTabId === tabId) {
        setSheetOpen(false);
        setEditingTabId(null);
        setIsCreate(false);
      }
      return { previous };
    },
    onError: (_err, _tabId, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(tabsQueryKey, ctx.previous);
      }
    },
    onSuccess: () => {
      bustDisplayCaches();
      toast.success(t("toasts.tabDeleted"));
    },
  });

  const openForCreate = useCallback(() => {
    setIsCreate(true);
    setEditingTabId(null);
    setTabName("");
    setTabIcon("");
    setTabOrder(
      tabs.length ? Math.max(...tabs.map((x) => x.order)) + 1 : 0
    );
    setAssignedFields([]);
    setAddFieldDialogOpen(false);
    setSheetOpen(true);
  }, [tabs]);

  useEffect(() => {
    if (openAddTabRef) {
      openAddTabRef.current = openForCreate;
      return () => {
        openAddTabRef.current = null;
      };
    }
  }, [openAddTabRef, openForCreate]);

  const openForEdit = (tab: TabDefinitionItem) => {
    setIsCreate(false);
    setEditingTabId(tab.id);
    setTabName(tab.name);
    setTabIcon(tab.icon ?? "");
    setTabOrder(tab.order);
    setAssignedFields([]);
    setAddFieldDialogOpen(false);
    setSheetOpen(true);
  };

  const closeSheet = () => {
    setSheetOpen(false);
    setEditingTabId(null);
    setIsCreate(false);
  };

  const handleSave = async () => {
    const trimmedName = tabName.trim();
    if (!trimmedName) {
      toast.error(t("validationRequired.tabName"));
      return;
    }
    if (!isCreate && !tabEditDetailReady) {
      toast.error(t("productsConfig.tabsConfig.tabDetailNotReady"));
      return;
    }
    setSaving(true);
    try {
      if (isCreate) {
        await createMut.mutateAsync({
          name: trimmedName,
          icon: tabIcon.trim() || undefined,
          order: tabOrder,
        });
      } else if (editingTabId) {
        const body: Parameters<typeof updateTabApi>[1] = {
          name: trimmedName,
          icon: tabIcon.trim() || undefined,
          order: tabOrder,
          fields: assignedFields.map((f) => ({
            fieldDefinitionId: f.fieldDefinitionId,
            productTypeId: f.productTypeId ?? null,
            order: f.order,
            colSpan: f.colSpan,
            isRequired: f.isRequired,
            sectionTitle: f.sectionTitle?.trim() ? f.sectionTitle.trim() : null,
            stretchInRow:
              f.stretchInRow &&
              !FULL_ROW_WIDGETS.has(f.fieldDefinition.widgetType) &&
              f.colSpan < 3,
          })),
        };
        await updateMut.mutateAsync({ id: editingTabId, body });
      }
      closeSheet();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingTabId || deleteMut.isPending) return;
    setSaving(true);
    try {
      await deleteMut.mutateAsync(editingTabId);
      closeSheet();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      toast.error(
        msg.toLowerCase().includes("system tab")
          ? t("productsConfig.tabsConfig.cannotDeleteSystemTab")
          : msg || t("errors.deleteFailed")
      );
    } finally {
      setSaving(false);
    }
  };

  const addField = (field: FieldDefinitionItem) => {
    setAssignedFields((prev) => {
      const maxOrder = prev.length > 0 ? Math.max(...prev.map((f) => f.order)) : -1;
      const isFullRow = FULL_ROW_WIDGETS.has(field.widgetType);
      const order = isFullRow
        ? (Math.floor(maxOrder / COLS_PER_ROW) + 1) * COLS_PER_ROW
        : prev.length;
      return [
        ...prev,
        {
          fieldDefinitionId: field.id,
          productTypeId: null,
          order,
          colSpan: isFullRow ? 3 : 1,
          isRequired: false,
          sectionTitle: "",
          stretchInRow: false,
          fieldDefinition: field,
        },
      ];
    });
  };

  const removeField = (fieldDefId: string) => {
    setAssignedFields((prev) =>
      prev.filter((f) => f.fieldDefinitionId !== fieldDefId)
    );
  };

  const setFieldStretchInRow = (fieldDefId: string, v: boolean) => {
    setAssignedFields((prev) =>
      prev.map((f) =>
        f.fieldDefinitionId === fieldDefId ? { ...f, stretchInRow: v } : f
      )
    );
  };

  const updateFieldPlacement = (index: number, row: number, section?: number) => {
    setAssignedFields((prev) =>
      prev.map((f, i) => {
        if (i !== index) return f;
        const isFullRow = FULL_ROW_WIDGETS.has(f.fieldDefinition.widgetType);
        const sec = section ?? (isFullRow ? 1 : 1);
        return { ...f, order: rowSectionToOrder(row, sec) };
      })
    );
  };

  if (categories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          {t("productsConfig.emptyStates.createCategoryFirst")}
        </p>
        <p className="text-xs text-muted-foreground/80">
          {t("productsConfig.emptyStates.goToCategories")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {!selectedCategoryId ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          {t("productsConfig.emptyStates.selectCategory")}
        </p>
      ) : tabsLoading ? (
        <ManagementListLoading />
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
            <form
              onSubmit={handleSearchSubmit}
              className="relative min-w-0 flex-1 max-w-sm"
            >
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                placeholder={t("productsConfig.tabsConfig.searchPlaceholder")}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="h-9 pl-9 bg-background"
              />
            </form>
          </div>
          <div className="rounded-lg border bg-card">
            <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2 rounded-t-lg">
              <LayoutList className="size-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                {t("productsConfig.tabsConfig.tabsListTitle")}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                aria-label={t("productsConfig.tabsConfig.addTab")}
                onClick={() => void openForCreate()}
              >
                <Plus className="size-3.5" />
              </Button>
            </div>
            <div className="flex flex-col">
              {paginatedTabs.length === 0 ? (
                <div className="flex min-h-[10rem] w-full flex-col items-center justify-center gap-2 py-10 text-center">
                  <p className="px-4 text-sm text-muted-foreground">
                    {sortedTabs.length === 0
                      ? t("productsConfig.emptyStates.noTabs")
                      : t("common.emptySearch")}
                  </p>
                </div>
              ) : (
                  <>
                    {paginatedTabs.map((tab) => {
                    const globalIdx = sortedTabs.findIndex((x) => x.id === tab.id);
                    const canMoveTabUp =
                      globalIdx > 0 &&
                      !tab.isSystem &&
                      !sortedTabs[globalIdx - 1]?.isSystem;
                    const canMoveTabDown =
                      globalIdx >= 0 &&
                      globalIdx < sortedTabs.length - 1 &&
                      !tab.isSystem &&
                      !sortedTabs[globalIdx + 1]?.isSystem;
                    const displayName = tab.isSystem
                      ? t(SYSTEM_TAB_CONFIG.nameI18nKey)
                      : tab.name;
                    const fieldCount = tab._count?.fields ?? 0;
                    return (
                      <div
                        key={tab.id}
                        className="flex cursor-pointer items-center gap-2 border-b border-border px-3 py-2 transition-colors last:border-b-0 hover:bg-muted/50"
                        onClick={() => openForEdit(tab)}
                      >
                        <span className="w-5 shrink-0" aria-hidden />
                        <span
                          className="min-w-0 flex-1 truncate text-sm font-medium"
                          title={displayName}
                        >
                          {displayName}
                        </span>
                        {tab.icon?.trim() ? (
                          <span
                            className="hidden shrink-0 truncate font-mono text-xs text-muted-foreground sm:inline"
                            title={tab.icon}
                          >
                            {tab.icon}
                          </span>
                        ) : null}
                        {tab.isSystem ? (
                          <Badge
                            variant="secondary"
                            className="shrink-0 text-[10px] font-normal"
                          >
                            {t("productsConfig.statusesConfig.defaultBadge")}
                          </Badge>
                        ) : null}
                        <span className="hidden shrink-0 text-xs text-muted-foreground tabular-nums sm:inline">
                          {tFormat("productsConfig.tabsConfig.tabsListFieldsCount", {
                            count: String(fieldCount),
                          })}
                        </span>
                        {!tab.isSystem ? (
                          <div
                            className="flex shrink-0 items-center justify-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-center gap-0.5">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-6 shrink-0"
                                disabled={!canMoveTabUp || tabOrderBusy || saving}
                                aria-label={t("productsConfig.common.moveUp")}
                                onClick={() => void moveTabOrder(tab.id, "up")}
                              >
                                <ChevronUp className="size-3" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-6 shrink-0"
                                disabled={!canMoveTabDown || tabOrderBusy || saving}
                                aria-label={t("productsConfig.common.moveDown")}
                                onClick={() => void moveTabOrder(tab.id, "down")}
                              >
                                <ChevronDown className="size-3" />
                              </Button>
                            </div>
                          </div>
                        ) : null}
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          #{tab.order}
                        </span>
                      </div>
                    );
                  })}
                  </>
              )}
            </div>
            {totalPages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/20 px-3 py-2">
                <TablePaginationBar
                  page={page}
                  totalPages={totalPages}
                  pageInputValue={pageInputValue}
                  onPageInputChange={setPageInputValue}
                  onPageInputBlur={handlePageInputBlur}
                  onPageInputKeyDown={handlePageInputKeyDown}
                  goToPage={goToPage}
                  pageSize={pageSize}
                  pageSizes={PAGE_SIZES}
                  onPageSizeChange={(size) => {
                    setPageSize(size);
                    setPage(1);
                  }}
                />
              </div>
            )}
          </div>
        </>
      )}

      <Sheet open={sheetOpen} onOpenChange={(open) => !open && closeSheet()}>
        <SheetContent
          side="right"
          className={SHEET_CONTENT_CLASS}
          aria-describedby={undefined}
        >
          <SheetHeader className={SHEET_HEADER_CLASS}>
            <SheetTitle className="text-base font-semibold sm:text-lg">
              {isCreate ? t("productsConfig.tabsConfig.newTab") : tabName || t("productsConfig.tabsConfig.tabLabel")}
            </SheetTitle>
          </SheetHeader>

          <div className={SHEET_BODY_CLASS}>
            <div className={cn("min-h-0 min-w-0 flex-1 py-1.5", SHEET_SCROLL_CLASS)}>
              <div className={cn("flex flex-col gap-4", SHEET_FORM_PADDING)}>
                <div className="grid gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="tab-name">{t("productsConfig.common.name")}</Label>
                    <Input
                      id="tab-name"
                      value={tabName}
                      onChange={(e) => setTabName(e.target.value)}
                      placeholder={t("productsConfig.tabsConfig.namePlaceholder")}
                      disabled={saving}
                      className={SHEET_INPUT_CLASS}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="tab-icon">{t("productsConfig.common.icon")}</Label>
                    <Input
                      id="tab-icon"
                      value={tabIcon}
                      onChange={(e) => setTabIcon(e.target.value)}
                      placeholder={t("productsConfig.tabsConfig.iconPlaceholder")}
                      disabled={saving}
                      className={SHEET_INPUT_CLASS}
                    />
                  </div>
                </div>

                <Separator />

                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">
                        {t("productsConfig.tabsConfig.assignedFields")} ({assignedFields.length})
                      </Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setAddFieldDialogOpen(true)}
                        disabled={saving}
                      >
                        <Plus className="mr-1 size-3" />
                        {t("productsConfig.common.add")}
                      </Button>
                    </div>

                    {!isCreate && tabDetailLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                      </div>
                    ) : assignedFields.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2">
                        {t("productsConfig.tabsConfig.noFieldsAssigned")}
                      </p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {assignedFields.map((f, idx) => (
                          <div
                            key={f.fieldDefinitionId}
                            className="rounded-md border p-2.5 text-sm"
                          >
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div className="min-w-0">
                                <span className="font-medium">
                                  {f.fieldDefinition.label}
                                </span>
                                <span className="ml-2 text-xs text-muted-foreground">
                                  {f.fieldDefinition.code ?? f.fieldDefinition.label ?? "—"} ·{" "}
                                  {t(`widgetTypesShort.${f.fieldDefinition.widgetType}`) || t(`widgetTypes.${f.fieldDefinition.widgetType}`) || f.fieldDefinition.widgetType}
                                </span>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                                onClick={() =>
                                  removeField(f.fieldDefinitionId)
                                }
                                disabled={saving}
                              >
                                <X className="size-3.5" />
                              </Button>
                            </div>
                            {(() => {
                              const { row, section } = orderToRowSection(f.order);
                              const isFullRow = FULL_ROW_WIDGETS.has(f.fieldDefinition.widgetType);
                              return (
                                <>
                                  <div className="flex flex-wrap gap-3">
                                    <div className="w-16">
                                      <Label className="text-xs text-muted-foreground">
                                        {t("productsConfig.tabsConfig.row")}
                                      </Label>
                                      <Input
                                        type="number"
                                        min={1}
                                        value={row}
                                        onChange={(e) =>
                                          updateFieldPlacement(
                                            idx,
                                            Number(e.target.value) || 1,
                                            isFullRow ? undefined : section
                                          )
                                        }
                                        className="h-8 text-xs"
                                        disabled={saving}
                                      />
                                    </div>
                                    {!isFullRow && (
                                      <div className="w-16">
                                        <Label className="text-xs text-muted-foreground">
                                          {t("productsConfig.tabsConfig.section")}
                                        </Label>
                                        <Input
                                          type="number"
                                          min={1}
                                          max={3}
                                          value={section}
                                          onChange={(e) => {
                                            const v = Number(e.target.value);
                                            updateFieldPlacement(
                                              idx,
                                              row,
                                              Math.min(3, Math.max(1, v || 1))
                                            );
                                          }}
                                          className="h-8 text-xs"
                                          disabled={saving}
                                        />
                                      </div>
                                    )}
                                  </div>
                                  {!isFullRow && f.colSpan < 3 && (
                                    <div className="mt-2 flex flex-col gap-1 border-t pt-2">
                                      <div className="flex items-center gap-2">
                                        <Checkbox
                                          id={`stretch-${f.fieldDefinitionId}`}
                                          checked={f.stretchInRow}
                                          onCheckedChange={(c) =>
                                            setFieldStretchInRow(
                                              f.fieldDefinitionId,
                                              c === true
                                            )
                                          }
                                          disabled={saving}
                                        />
                                        <Label
                                          htmlFor={`stretch-${f.fieldDefinitionId}`}
                                          className="cursor-pointer text-xs font-normal leading-none"
                                        >
                                          {t("productsConfig.tabsConfig.stretchInRow")}
                                        </Label>
                                      </div>
                                      <p className="text-xs text-muted-foreground pl-6">
                                        {t("productsConfig.tabsConfig.stretchInRowHint")}
                                      </p>
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        ))}
                      </div>
                    )}

                </div>
              </div>
            </div>
          </div>

          <SheetFooter className={SHEET_FOOTER_CLASS}>
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <div>
                {!isCreate && editingTabId && !tabs.find((t) => t.id === editingTabId)?.isSystem && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDeleteTabDialogOpen(true)}
                    disabled={saving || deleteMut.isPending}
                    className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                  >
                    {saving && deleteMut.isPending ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : null}
                    {t("users.delete")}
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeSheet}
                  disabled={saving}
                >
                  {t("productsConfig.common.cancel")}
                </Button>
                <Button onClick={handleSave} disabled={saving || (!isCreate && !tabEditDetailReady)}>
                  {saving && !deleteMut.isPending ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : null}
                  {isCreate ? t("productsConfig.common.create") : t("productsConfig.common.save")}
                </Button>
              </div>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ConfirmDestructiveDialog
        open={deleteTabDialogOpen}
        onOpenChange={setDeleteTabDialogOpen}
        title={t("productsConfig.deleteTab.title")}
        description={
          <>
            {t("productsConfig.deleteTab.description")} {t("productsConfig.common.cannotUndo")}
          </>
        }
        cancelLabel={t("productsConfig.common.cancel")}
        confirmLabel={t("users.delete")}
        confirmPendingLabel={t("productsConfig.common.deleting")}
        confirmPending={saving || deleteMut.isPending}
        cancelDisabled={saving}
        onConfirm={() => {
          setDeleteTabDialogOpen(false);
          handleDelete();
        }}
      />

      <Dialog open={addFieldDialogOpen} onOpenChange={setAddFieldDialogOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>{t("productsConfig.tabsConfig.addFieldToTab")}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Tabs defaultValue="existing" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="existing">{t("productsConfig.tabsConfig.selectExisting")}</TabsTrigger>
                <TabsTrigger value="create">{t("productsConfig.tabsConfig.createNew")}</TabsTrigger>
              </TabsList>
              <TabsContent value="existing" className="mt-3">
                {allFieldsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="size-6 animate-spin text-muted-foreground" />
                  </div>
                ) : unassignedFields.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    {t("productsConfig.tabsConfig.allFieldsAssigned")}
                  </p>
                ) : (
                  <div
                    className={cn(
                      "flex flex-col gap-3 max-h-64 overflow-y-auto rounded-md border p-2",
                      SHEET_SCROLL_CLASS
                    )}
                  >
                    {groupedUnassignedFields.currentCat.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">
                          {t("productsConfig.tabsConfig.categoryFields")}{" "}
                          {selectedCategoryId
                            ? categoryNameById.get(selectedCategoryId) ?? "—"
                            : "—"}
                        </p>
                        <div className="flex flex-col gap-0.5">
                          {groupedUnassignedFields.currentCat.map((f) => (
                            <button
                              key={f.id}
                              type="button"
                              className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted/50"
                              onClick={() => {
                                addField(f);
                                setAddFieldDialogOpen(false);
                              }}
                              disabled={saving}
                            >
                              <Plus className="size-3 shrink-0 text-muted-foreground" />
                              <span className="font-medium">{f.label}</span>
                              <span className="text-xs text-muted-foreground">
                                {f.code ?? f.label ?? "—"} ·{" "}
                                {t(`widgetTypesShort.${f.widgetType}`) || t(`widgetTypes.${f.widgetType}`) || f.widgetType}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {groupedUnassignedFields.global.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">
                          {t("productsConfig.tabsConfig.globalFields")}
                        </p>
                        <div className="flex flex-col gap-0.5">
                          {groupedUnassignedFields.global.map((f) => (
                            <button
                              key={f.id}
                              type="button"
                              className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted/50"
                              onClick={() => {
                                addField(f);
                                setAddFieldDialogOpen(false);
                              }}
                              disabled={saving}
                            >
                              <Plus className="size-3 shrink-0 text-muted-foreground" />
                              <span className="font-medium">{f.label}</span>
                              <span className="text-xs text-muted-foreground">
                                {f.code ?? f.label ?? "—"} ·{" "}
                                {t(`widgetTypesShort.${f.widgetType}`) || t(`widgetTypes.${f.widgetType}`) || f.widgetType}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>
              <TabsContent value="create" className="mt-3">
                <div className="flex flex-col gap-3 py-2">
                  <p className="text-sm text-muted-foreground">
                    {t("productsConfig.tabsConfig.createNewFieldForCategory")}{" "}
                    {selectedCategoryId
                      ? categoryNameById.get(selectedCategoryId) ?? "—"
                      : "—"}
                    . {t("productsConfig.tabsConfig.createFieldHint")}
                  </p>
                  <Button
                    type="button"
                    onClick={() => {
                      if (selectedCategoryId && onRequestCreateField) {
                        onRequestCreateField(selectedCategoryId);
                        setAddFieldDialogOpen(false);
                      }
                    }}
                    disabled={!selectedCategoryId || !onRequestCreateField}
                  >
                    <Plus className="mr-2 size-4" />
                    {t("productsConfig.tabsConfig.createNewField")}
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}
