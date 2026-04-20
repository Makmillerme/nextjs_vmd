"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  SHEET_CONTENT_CLASS,
  SHEET_INPUT_CLASS,
  SHEET_HEADER_CLASS,
  SHEET_BODY_CLASS,
  SHEET_BODY_SCROLL_CLASS,
  SHEET_FOOTER_CLASS,
  SHEET_FORM_GAP,
  SHEET_FORM_PADDING,
  SHEET_FIELD_GAP,
} from "@/config/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import {
  Plus,
  Loader2,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  CornerDownRight,
  Pencil,
  Trash2,
  Layers,
  ArrowRight,
  Settings,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmDestructiveDialog } from "@/components/confirm-destructive-dialog";
import { useLocale } from "@/lib/locale-provider";
import { cn } from "@/lib/utils";
import {
  MANAGEMENT_STALE_MS,
  managementAdminKeys,
  managementPublicKeys,
} from "@/lib/query-keys";
import {
  adminGetJson,
  adminMutationJson,
  adminDeleteAllowMissing,
} from "@/lib/api/admin/client";
import {
  fetchAdminCategories,
  type AdminCategoryRow,
} from "@/lib/api/admin/catalog";
import { ManagementListLoading } from "@/components/management-list-states";
import { slugify } from "@/lib/slugify";
import type { AccountingGroupItem, StatusItem, SubFunnelPolicy } from "./types";

// --- API helpers ---

async function fetchGroups(
  categoryId: string,
  t: (k: string) => string
): Promise<AccountingGroupItem[]> {
  const data = await adminGetJson<{ groups?: AccountingGroupItem[] }>(
    `/accounting-groups?categoryId=${categoryId}`,
    t("productsConfig.statusesConfig.loadFailed")
  );
  return data.groups ?? [];
}

async function createGroup(
  body: {
    categoryId: string;
    parentStatusId?: string | null;
    name: string;
    order?: number;
    description?: string | null;
    startStatusId?: string | null;
    endStatusId?: string | null;
    showInSidebar?: boolean;
    subFunnelPolicy?: SubFunnelPolicy;
  },
  t: (k: string) => string
) {
  return adminMutationJson("/accounting-groups", {
    method: "POST",
    body,
    fallbackError: t("productsConfig.accountingGroups.createFailed"),
  });
}

async function updateGroup(
  id: string,
  body: {
    name?: string;
    order?: number;
    description?: string | null;
    startStatusId?: string | null;
    endStatusId?: string | null;
    showInSidebar?: boolean;
    subFunnelPolicy?: SubFunnelPolicy;
  },
  t: (k: string) => string
) {
  return adminMutationJson(`/accounting-groups/${id}`, {
    method: "PATCH",
    body,
    fallbackError: t("productsConfig.accountingGroups.saveFailed"),
  });
}

async function deleteGroup(id: string, t: (k: string) => string) {
  await adminDeleteAllowMissing(
    `/accounting-groups/${id}`,
    t("productsConfig.accountingGroups.deleteFailed")
  );
}

async function createStatus(
  body: {
    accountingGroupId?: string;
    categoryId?: string;
    parentStatusId?: string;
    name: string;
    code?: string | null;
    color: string;
    order: number;
    description?: string | null;
    isDefault?: boolean;
  },
  t: (k: string) => string
) {
  return adminMutationJson("/statuses", {
    method: "POST",
    body,
    fallbackError: t("productsConfig.statusesConfig.createFailed"),
  });
}

async function updateStatus(
  id: string,
  body: {
    name?: string;
    code?: string | null;
    color?: string;
    order?: number;
    description?: string | null;
    isDefault?: boolean;
  },
  t: (k: string) => string
) {
  return adminMutationJson(`/statuses/${id}`, {
    method: "PATCH",
    body,
    fallbackError: t("productsConfig.statusesConfig.saveFailed"),
  });
}

async function deleteStatusApi(id: string, t: (k: string) => string) {
  await adminDeleteAllowMissing(
    `/statuses/${id}`,
    t("productsConfig.statusesConfig.deleteFailed")
  );
}

// --- Form schemas ---

type GroupFormValues = {
  name: string;
  order: number;
  description: string;
  startStatusId: string;
  endStatusId: string;
  showInSidebar: boolean;
  subFunnelPolicy: SubFunnelPolicy;
};
type StatusFormValues = {
  name: string;
  code: string;
  color: string;
  order: number;
  description: string;
};

// --- Main component ---

export function StatusesManagement() {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [hasMounted, setHasMounted] = useState(false);
  const colorInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [expandedStatuses, setExpandedStatuses] = useState<Set<string>>(new Set());

  const [groupSheetOpen, setGroupSheetOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<AccountingGroupItem | null>(null);
  const [statusSheetOpen, setStatusSheetOpen] = useState(false);
  const [editingStatus, setEditingStatus] = useState<StatusItem | null>(null);
  const [statusTargetGroupId, setStatusTargetGroupId] = useState<string | null>(null);
  const [statusParentId, setStatusParentId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusesReorderBusy, setStatusesReorderBusy] = useState(false);
  const [statusCodeManuallyEdited, setStatusCodeManuallyEdited] = useState(false);
  const [satelliteParentStatusId, setSatelliteParentStatusId] = useState<string | null>(null);
  const [deleteGroupConfirmOpen, setDeleteGroupConfirmOpen] = useState(false);
  const [deleteStatusConfirmOpen, setDeleteStatusConfirmOpen] = useState(false);

  const { data: categories = [] } = useQuery({
    queryKey: [...managementAdminKeys.categories],
    queryFn: () => fetchAdminCategories(t) as Promise<AdminCategoryRow[]>,
    staleTime: MANAGEMENT_STALE_MS,
  });

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.order - b.order),
    [categories]
  );

  useEffect(() => {
    if (!selectedCategoryId && sortedCategories.length > 0) {
      setSelectedCategoryId(sortedCategories[0].id);
    }
  }, [sortedCategories, selectedCategoryId]);

  const groupsKey = useMemo(
    () => [...managementAdminKeys.accountingGroups, selectedCategoryId],
    [selectedCategoryId]
  );

  const { data: groups = [], isLoading, isError, error } = useQuery({
    queryKey: groupsKey,
    queryFn: () => fetchGroups(selectedCategoryId, t),
    staleTime: MANAGEMENT_STALE_MS,
    enabled: !!selectedCategoryId,
  });

  // Separate default funnel group from accounting groups
  const defaultGroup = useMemo(() => groups.find((g) => g.isDefault) ?? null, [groups]);
  const accountingGroups = useMemo(
    () =>
      [...groups.filter((g) => !g.isDefault)].sort((a, b) =>
        a.order !== b.order ? a.order - b.order : a.id.localeCompare(b.id)
      ),
    [groups]
  );

  const funnelStatuses = useMemo(
    () =>
      [...(defaultGroup?.statuses ?? [])].sort((a, b) =>
        a.order !== b.order ? a.order - b.order : a.id.localeCompare(b.id)
      ),
    [defaultGroup]
  );

  const funnelReorderLocked = accountingGroups.length > 0;

  const claimedStatusIds = useMemo(() => {
    const claimed = new Set<string>();
    for (const g of accountingGroups) {
      if (editingGroup && g.id === editingGroup.id) continue;
      if (!g.startStatusId || !g.endStatusId) continue;
      const startOrder = g.startStatus?.order;
      const endOrder = g.endStatus?.order;
      if (startOrder == null || endOrder == null) continue;
      for (const s of funnelStatuses) {
        if (s.order >= startOrder && s.order <= endOrder) claimed.add(s.id);
      }
    }
    return claimed;
  }, [accountingGroups, editingGroup, funnelStatuses]);

  const availableGroupStatuses = useMemo(
    () => funnelStatuses.filter((s) => !claimedStatusIds.has(s.id)),
    [funnelStatuses, claimedStatusIds]
  );

  const invalidateAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: managementAdminKeys.accountingGroups });
    void queryClient.invalidateQueries({ queryKey: managementAdminKeys.statuses });
    void queryClient.invalidateQueries({ queryKey: managementPublicKeys.statuses });
  }, [queryClient]);

  // --- Group mutations ---
  const createGroupMut = useMutation({
    mutationFn: (body: Parameters<typeof createGroup>[0]) => createGroup(body, t),
    onSuccess: () => toast.success(t("productsConfig.accountingGroups.created")),
    onSettled: () => invalidateAll(),
  });

  const updateGroupMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof updateGroup>[1] }) =>
      updateGroup(id, body, t),
    onMutate: async ({ id, body }) => {
      await queryClient.cancelQueries({ queryKey: groupsKey });
      const previous = queryClient.getQueryData<AccountingGroupItem[]>(groupsKey);
      queryClient.setQueryData<AccountingGroupItem[]>(groupsKey, (old = []) =>
        old.map((g) => (g.id === id ? { ...g, ...body } : g))
      );
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(groupsKey, ctx.previous);
      }
      toast.error(err instanceof Error ? err.message : t("errors.saveFailed"));
    },
    onSuccess: (data, variables) => {
      if (data && typeof data === "object" && "id" in data && (data as { id: string }).id === variables.id) {
        const server = data as Partial<AccountingGroupItem> & { id: string };
        queryClient.setQueryData<AccountingGroupItem[]>(groupsKey, (old = []) =>
          old.map((g) => {
            if (g.id !== variables.id) return g;
            return {
              ...g,
              showInSidebar: server.showInSidebar ?? g.showInSidebar,
              name: server.name ?? g.name,
              order: server.order ?? g.order,
              description: server.description ?? g.description,
              startStatusId: server.startStatusId ?? g.startStatusId,
              endStatusId: server.endStatusId ?? g.endStatusId,
              nextGroupId: server.nextGroupId ?? g.nextGroupId,
              startStatus: server.startStatus ?? g.startStatus,
              endStatus: server.endStatus ?? g.endStatus,
              subFunnelPolicy:
                server.subFunnelPolicy === "requireComplete" || server.subFunnelPolicy === "allow"
                  ? server.subFunnelPolicy
                  : g.subFunnelPolicy,
            };
          })
        );
      }
      void queryClient.invalidateQueries({ queryKey: managementPublicKeys.statuses });
      const bodyKeys = Object.keys(variables.body);
      const onlyShowInSidebar = bodyKeys.length === 1 && bodyKeys[0] === "showInSidebar";
      if (!onlyShowInSidebar) {
        invalidateAll();
        toast.success(t("productsConfig.accountingGroups.saved"));
      }
    },
  });

  const deleteGroupMut = useMutation({
    mutationFn: (id: string) => deleteGroup(id, t),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: groupsKey });
      const previous = queryClient.getQueryData<AccountingGroupItem[]>(groupsKey);
      queryClient.setQueryData<AccountingGroupItem[]>(groupsKey, (old = []) =>
        old.filter((g) => g.id !== id)
      );
      return { previous };
    },
    onError: (err, _id, ctx) => {
      if (ctx?.previous !== undefined) queryClient.setQueryData(groupsKey, ctx.previous);
      toast.error(err instanceof Error ? err.message : t("errors.deleteFailed"));
    },
    onSuccess: () => toast.success(t("productsConfig.accountingGroups.deleted")),
    onSettled: () => invalidateAll(),
  });

  // --- Status mutations ---
  const createStatusMut = useMutation({
    mutationFn: (body: Parameters<typeof createStatus>[0]) => createStatus(body, t),
    onSuccess: () => toast.success(t("toasts.statusCreated")),
    onSettled: () => invalidateAll(),
  });

  const updateStatusMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof updateStatus>[1] }) =>
      updateStatus(id, body, t),
    onMutate: async ({ id, body }) => {
      await queryClient.cancelQueries({ queryKey: groupsKey });
      const previous = queryClient.getQueryData<AccountingGroupItem[]>(groupsKey);
      queryClient.setQueryData<AccountingGroupItem[]>(groupsKey, (old = []) =>
        old.map((gr) => ({
          ...gr,
          statuses: (gr.statuses ?? []).map((s) =>
            s.id === id ? { ...s, ...body } : s
          ),
        }))
      );
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous !== undefined) queryClient.setQueryData(groupsKey, ctx.previous);
      toast.error(err instanceof Error ? err.message : t("errors.saveFailed"));
    },
    onSuccess: () => toast.success(t("toasts.statusSaved")),
    onSettled: () => invalidateAll(),
  });

  const deleteStatusMut = useMutation({
    mutationFn: (id: string) => deleteStatusApi(id, t),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: groupsKey });
      const previous = queryClient.getQueryData<AccountingGroupItem[]>(groupsKey);
      queryClient.setQueryData<AccountingGroupItem[]>(groupsKey, (old = []) =>
        old.map((gr) => ({
          ...gr,
          statuses: (gr.statuses ?? []).filter((s) => s.id !== id),
        }))
      );
      return { previous };
    },
    onError: (err, _id, ctx) => {
      if (ctx?.previous !== undefined) queryClient.setQueryData(groupsKey, ctx.previous);
      toast.error(err instanceof Error ? err.message : t("errors.deleteFailed"));
    },
    onSuccess: () => toast.success(t("toasts.statusDeleted")),
    onSettled: () => invalidateAll(),
  });

  // --- Reorder statuses in the funnel ---
  const reorderStatusesInFunnel = useCallback(
    async (statusId: string, direction: "up" | "down") => {
      const list = funnelStatuses;
      const idx = list.findIndex((s) => s.id === statusId);
      if (idx < 0) return;
      const j = direction === "up" ? idx - 1 : idx + 1;
      if (j < 0 || j >= list.length) return;
      const a = list[idx];
      const b = list[j];
      const orderA = a.order;
      const orderB = b.order;

      const previous = queryClient.getQueryData<AccountingGroupItem[]>(groupsKey);
      queryClient.setQueryData<AccountingGroupItem[]>(groupsKey, (old = []) =>
        old.map((gr) => {
          if (!gr.isDefault) return gr;
          return {
            ...gr,
            statuses: (gr.statuses ?? []).map((s) => {
              if (s.id === a.id) return { ...s, order: orderB };
              if (s.id === b.id) return { ...s, order: orderA };
              return s;
            }),
          };
        })
      );

      setStatusesReorderBusy(true);
      try {
        await Promise.all([
          updateStatus(a.id, { order: orderB }, t),
          updateStatus(b.id, { order: orderA }, t),
        ]);
      } catch (e) {
        if (previous !== undefined) queryClient.setQueryData(groupsKey, previous);
        else invalidateAll();
        toast.error(e instanceof Error ? e.message : t("errors.saveFailed"));
      } finally {
        setStatusesReorderBusy(false);
      }
    },
    [funnelStatuses, t, queryClient, groupsKey, invalidateAll]
  );

  const reorderSubStatusInSatellite = useCallback(
    async (
      parentStatusId: string,
      satelliteGroupId: string,
      subStatusId: string,
      direction: "up" | "down"
    ) => {
      if (!defaultGroup) return;
      const parent = defaultGroup.statuses?.find((s) => s.id === parentStatusId);
      const sg = parent?.satelliteGroups?.find((x) => x.id === satelliteGroupId);
      const list = [...(sg?.statuses ?? [])].sort((a, b) =>
        a.order !== b.order ? a.order - b.order : a.id.localeCompare(b.id)
      );
      const idx = list.findIndex((s) => s.id === subStatusId);
      if (idx < 0) return;
      const j = direction === "up" ? idx - 1 : idx + 1;
      if (j < 0 || j >= list.length) return;
      const a = list[idx];
      const b = list[j];

      setStatusesReorderBusy(true);
      try {
        await Promise.all([
          updateStatus(a.id, { order: b.order }, t),
          updateStatus(b.id, { order: a.order }, t),
        ]);
        invalidateAll();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("errors.saveFailed"));
      } finally {
        setStatusesReorderBusy(false);
      }
    },
    [defaultGroup, t, invalidateAll]
  );

  // --- Group sheet (for accounting groups only) ---
  const groupSchema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t("validationRequired.groupName")),
        order: z.number().int(),
        description: z.string(),
        startStatusId: z.string(),
        endStatusId: z.string(),
        showInSidebar: z.boolean(),
        subFunnelPolicy: z.enum(["allow", "requireComplete"]),
      }),
    [t]
  );

  const groupForm = useForm<GroupFormValues>({
    resolver: zodResolver(groupSchema),
    defaultValues: {
      name: "",
      order: 0,
      description: "",
      startStatusId: "",
      endStatusId: "",
      showInSidebar: true,
      subFunnelPolicy: "allow",
    },
  });

  const openGroupForCreate = () => {
    setEditingGroup(null);
    groupForm.reset({
      name: "",
      order: accountingGroups.length
        ? Math.max(...accountingGroups.map((g) => g.order)) + 1
        : 0,
      description: "",
      startStatusId: funnelStatuses[0]?.id ?? "",
      endStatusId: funnelStatuses.at(-1)?.id ?? "",
      showInSidebar: true,
      subFunnelPolicy: "allow",
    });
    setGroupSheetOpen(true);
  };

  const openGroupForEdit = (g: AccountingGroupItem) => {
    setEditingGroup(g);
    setSatelliteParentStatusId(g.parentStatusId ?? null);
    groupForm.reset({
      name: g.name,
      order: g.order,
      description: g.description ?? "",
      startStatusId: g.startStatusId ?? "",
      endStatusId: g.endStatusId ?? "",
      showInSidebar: g.showInSidebar ?? true,
      subFunnelPolicy: g.subFunnelPolicy === "requireComplete" ? "requireComplete" : "allow",
    });
    setGroupSheetOpen(true);
  };

  const openSatelliteGroupForEdit = (sg: AccountingGroupItem) => {
    setEditingGroup(sg);
    setSatelliteParentStatusId(sg.parentStatusId ?? null);
    groupForm.reset({
      name: sg.name,
      order: sg.order,
      description: sg.description ?? "",
      startStatusId: "",
      endStatusId: "",
      showInSidebar: sg.showInSidebar ?? true,
      subFunnelPolicy: sg.subFunnelPolicy === "requireComplete" ? "requireComplete" : "allow",
    });
    setGroupSheetOpen(true);
  };

  const openSatelliteGroupForCreate = (parentStatusId: string) => {
    setEditingGroup(null);
    setSatelliteParentStatusId(parentStatusId);
    groupForm.reset({
      name: "",
      order: 0,
      description: "",
      startStatusId: "",
      endStatusId: "",
      showInSidebar: true,
      subFunnelPolicy: "allow",
    });
    setGroupSheetOpen(true);
  };

  const closeGroupSheet = () => {
    setGroupSheetOpen(false);
    setEditingGroup(null);
    setSatelliteParentStatusId(null);
  };

  const onGroupSubmit = async (values: GroupFormValues) => {
    setSaving(true);
    try {
      if (editingGroup) {
        await updateGroupMut.mutateAsync({
          id: editingGroup.id,
          body: {
            name: values.name.trim(),
            order: editingGroup.order,
            description: values.description.trim() || null,
            startStatusId: values.startStatusId || null,
            endStatusId: values.endStatusId || null,
            showInSidebar: values.showInSidebar,
            ...(editingGroup.parentStatusId
              ? { subFunnelPolicy: values.subFunnelPolicy }
              : {}),
          },
        });
      } else {
        await createGroupMut.mutateAsync({
          categoryId: selectedCategoryId,
          ...(satelliteParentStatusId ? { parentStatusId: satelliteParentStatusId } : {}),
          name: values.name.trim(),
          order: values.order,
          description: values.description.trim() || null,
          showInSidebar: values.showInSidebar,
          ...(satelliteParentStatusId ? { subFunnelPolicy: values.subFunnelPolicy } : {}),
          ...(!satelliteParentStatusId
            ? { startStatusId: values.startStatusId || null, endStatusId: values.endStatusId || null }
            : {}),
        });
      }
      closeGroupSheet();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const runDeleteGroup = async () => {
    if (!editingGroup) return;
    if (editingGroup.isDefault) {
      toast.error(t("productsConfig.accountingGroups.cannotDeleteDefault"));
      return;
    }
    setSaving(true);
    try {
      await deleteGroupMut.mutateAsync(editingGroup.id);
      closeGroupSheet();
      setDeleteGroupConfirmOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errors.deleteFailed"));
    } finally {
      setSaving(false);
    }
  };

  // --- Reorder accounting groups ---
  const reorderAccountingGroups = useCallback(
    async (groupId: string, direction: "up" | "down") => {
      const list = accountingGroups;
      const idx = list.findIndex((g) => g.id === groupId);
      if (idx < 0) return;
      const j = direction === "up" ? idx - 1 : idx + 1;
      if (j < 0 || j >= list.length) return;
      const a = list[idx];
      const b = list[j];

      setStatusesReorderBusy(true);
      try {
        await Promise.all([
          updateGroup(a.id, { order: b.order }, t),
          updateGroup(b.id, { order: a.order }, t),
        ]);
        invalidateAll();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("errors.saveFailed"));
      } finally {
        setStatusesReorderBusy(false);
      }
    },
    [accountingGroups, t, invalidateAll]
  );

  // --- Status sheet ---
  const statusSchema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t("validationRequired.statusName")),
        code: z.string(),
        color: z.string(),
        order: z.number().int(),
        description: z.string(),
      }),
    [t]
  );

  const statusForm = useForm<StatusFormValues>({
    resolver: zodResolver(statusSchema),
    defaultValues: { name: "", code: "", color: "#6b7280", order: 0, description: "" },
  });

  const statusNameWatch = statusForm.watch("name");

  useEffect(() => {
    if (editingStatus != null || statusCodeManuallyEdited) return;
    statusForm.setValue("code", slugify(statusNameWatch), { shouldValidate: true });
  }, [editingStatus, statusCodeManuallyEdited, statusNameWatch, statusForm]);

  const openStatusForCreate = (parentId?: string) => {
    if (!defaultGroup) return;
    setEditingStatus(null);
    setStatusCodeManuallyEdited(false);
    setStatusTargetGroupId(defaultGroup.id);
    setStatusParentId(parentId ?? null);
    let nextOrder = 0;
    if (!parentId) {
      nextOrder = funnelStatuses.length ? Math.max(...funnelStatuses.map((s) => s.order)) + 1 : 0;
    } else {
      const parent = funnelStatuses.find((s) => s.id === parentId);
      const allSubs = parent?.satelliteGroups?.flatMap((sg) => sg.statuses ?? []) ?? [];
      nextOrder = allSubs.length ? Math.max(...allSubs.map((s) => s.order)) + 1 : 0;
    }
    statusForm.reset({ name: "", code: "", color: "#6b7280", order: nextOrder, description: "" });
    setStatusSheetOpen(true);
  };

  const openStatusForEdit = (s: StatusItem) => {
    setEditingStatus(s);
    setStatusCodeManuallyEdited(false);
    setStatusTargetGroupId(s.accountingGroupId);
    setStatusParentId(null);
    statusForm.reset({
      name: s.name,
      code: s.code ?? "",
      color: s.color,
      order: s.order,
      description: s.description ?? "",
    });
    setStatusSheetOpen(true);
  };

  const closeStatusSheet = () => {
    setStatusSheetOpen(false);
    setEditingStatus(null);
    setStatusTargetGroupId(null);
    setStatusParentId(null);
    setStatusCodeManuallyEdited(false);
  };

  const onStatusSubmit = async (values: StatusFormValues) => {
    setSaving(true);
    try {
      if (editingStatus) {
        await updateStatusMut.mutateAsync({
          id: editingStatus.id,
          body: {
            name: values.name.trim(),
            code: values.code.trim() || null,
            color: values.color.trim() || "#6b7280",
            order: editingStatus.order,
            description: values.description.trim() || null,
          },
        });
      } else {
        await createStatusMut.mutateAsync({
          ...(statusParentId
            ? { parentStatusId: statusParentId }
            : { categoryId: selectedCategoryId }),
          name: values.name.trim(),
          code: values.code.trim() || null,
          color: values.color.trim() || "#6b7280",
          order: values.order,
          description: values.description.trim() || null,
        });
      }
      closeStatusSheet();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const runDeleteStatus = async () => {
    if (!editingStatus) return;
    setSaving(true);
    try {
      await deleteStatusMut.mutateAsync(editingStatus.id);
      closeStatusSheet();
      setDeleteStatusConfirmOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errors.deleteFailed"));
    } finally {
      setSaving(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => { setHasMounted(true); }, []);

  const noCategory = !selectedCategoryId;

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2 flex-wrap">
        <Select
          value={selectedCategoryId || "__none__"}
          onValueChange={(v) => setSelectedCategoryId(v === "__none__" ? "" : v)}
          disabled={sortedCategories.length === 0}
        >
          <SelectTrigger className="w-fit min-w-[10rem]">
            <SelectValue
              placeholder={
                sortedCategories.length === 0
                  ? t("dataModel.createCategoryFirst")
                  : t("common.selectCategoryPlaceholder")
              }
            />
          </SelectTrigger>
          <SelectContent className="min-w-max">
            {sortedCategories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isError && (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : t("productsConfig.statusesConfig.loadFailed")}
        </p>
      )}

      {noCategory ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          {sortedCategories.length === 0
            ? t("dataModel.createCategoryFirst")
            : t("common.selectCategoryPlaceholder")}
        </p>
      ) : !hasMounted || isLoading ? (
        <ManagementListLoading />
      ) : (
        <div className="flex flex-col gap-6">
          {/* ===== SECTION 1: Status funnel ===== */}
          <div className="rounded-lg border bg-card">
            <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30 rounded-t-lg">
              <Layers className="size-4 text-primary shrink-0" />
              <span className="text-sm font-semibold flex-1 min-w-0 truncate">
                {t("productsConfig.statusFunnel.title")}
              </span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0">
                    <Settings className="size-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 p-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="funnel-sidebar"
                      checked={defaultGroup?.showInSidebar ?? true}
                      onCheckedChange={(v) => {
                        if (!defaultGroup) return;
                        updateGroupMut.mutate({ id: defaultGroup.id, body: { showInSidebar: v === true } });
                      }}
                    />
                    <Label htmlFor="funnel-sidebar" className="text-sm font-normal leading-none cursor-pointer">
                      {t("productsConfig.accountingGroups.showInSidebar")}
                    </Label>
                  </div>
                </PopoverContent>
              </Popover>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                onClick={() => openStatusForCreate()}
              >
                <Plus className="size-3.5" />
              </Button>
            </div>

            {funnelStatuses.length === 0 ? (
              <p className="text-xs text-muted-foreground px-3 py-3 text-center">
                {t("productsConfig.statusesConfig.emptyCreate")}
              </p>
            ) : (
              <div className="flex flex-col">
                {funnelStatuses.map((s, si) => (
                  <StatusRow
                    key={s.id}
                    status={s}
                    expanded={expandedStatuses.has(s.id)}
                    onToggle={() => toggleExpand(s.id)}
                    onEdit={() => openStatusForEdit(s)}
                    onAddSubStatus={() => openStatusForCreate(s.id)}
                    onEditSubStatus={openStatusForEdit}
                    onEditSatelliteGroup={openSatelliteGroupForEdit}
                    onCreateSatelliteGroup={openSatelliteGroupForCreate}
                    reorderBusy={statusesReorderBusy}
                    canStatusMoveUp={si > 0 && !funnelReorderLocked && !s.isDefault && !funnelStatuses[si - 1]?.isDefault}
                    canStatusMoveDown={si < funnelStatuses.length - 1 && !funnelReorderLocked && !s.isDefault}
                    onStatusMoveUp={() => void reorderStatusesInFunnel(s.id, "up")}
                    onStatusMoveDown={() => void reorderStatusesInFunnel(s.id, "down")}
                    onReorderSubStatus={(
                      parentStatusId,
                      satelliteGroupId,
                      subId,
                      dir
                    ) => void reorderSubStatusInSatellite(parentStatusId, satelliteGroupId, subId, dir)}
                    t={t}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ===== SECTION 2: Accounting groups ===== */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold flex-1">
                {t("productsConfig.accountingGroups.sectionTitle")}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={openGroupForCreate}
                disabled={noCategory || funnelStatuses.length === 0}
                className="shrink-0 gap-1.5"
              >
                <Layers className="size-4" />
                {t("productsConfig.accountingGroups.addGroup")}
              </Button>
            </div>

            {accountingGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                {t("productsConfig.accountingGroups.emptyCreate")}
              </p>
            ) : (
              accountingGroups.map((g, idx) => (
                <AccountingGroupCard
                  key={g.id}
                  group={g}
                  groupIndex={idx}
                  groupsCount={accountingGroups.length}
                  reorderBusy={statusesReorderBusy}
                  onReorder={(dir) => void reorderAccountingGroups(g.id, dir)}
                  onEdit={() => openGroupForEdit(g)}
                  t={t}
                />
              ))
            )}
          </div>
        </div>
      )}

      {/* Group Sheet (accounting groups only) */}
      <Sheet open={groupSheetOpen} onOpenChange={(o) => !o && closeGroupSheet()}>
        <SheetContent side="right" className={SHEET_CONTENT_CLASS} aria-describedby={undefined}>
          <SheetHeader className={SHEET_HEADER_CLASS}>
            <SheetTitle className="text-base font-semibold sm:text-lg">
              {editingGroup
                ? editingGroup.name
                : satelliteParentStatusId
                  ? t("productsConfig.accountingGroups.createSatelliteGroup")
                  : t("productsConfig.accountingGroups.newGroup")}
            </SheetTitle>
            {satelliteParentStatusId && (
              <p className="text-xs text-muted-foreground">
                {t("productsConfig.accountingGroups.satelliteGroupHint")}
              </p>
            )}
          </SheetHeader>
          <Form {...groupForm}>
            <form onSubmit={groupForm.handleSubmit(onGroupSubmit)} className="flex min-h-0 flex-1 flex-col">
              <div className={SHEET_BODY_CLASS}>
                <div className={SHEET_BODY_SCROLL_CLASS}>
                  <div className={cn("grid", SHEET_FORM_GAP, SHEET_FORM_PADDING)}>
                    <FormField
                      control={groupForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem className={cn("grid", SHEET_FIELD_GAP)}>
                          <FormLabel>{t("productsConfig.common.name")}</FormLabel>
                          <FormControl>
                            <Input
                              placeholder={t("productsConfig.accountingGroups.namePlaceholder")}
                              disabled={saving}
                              className={SHEET_INPUT_CLASS}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {!satelliteParentStatusId && (
                      <>
                    <FormField
                      control={groupForm.control}
                      name="startStatusId"
                      render={({ field }) => (
                        <FormItem className={cn("grid", SHEET_FIELD_GAP)}>
                          <FormLabel>{t("productsConfig.accountingGroups.fromStatus")}</FormLabel>
                          <Select value={field.value || "__none__"} onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)} disabled={saving}>
                            <FormControl>
                              <SelectTrigger className={SHEET_INPUT_CLASS}>
                                <SelectValue placeholder={t("productsConfig.accountingGroups.selectStartStatus")} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="__none__">
                                <span className="text-muted-foreground">{t("productsConfig.accountingGroups.notSelected")}</span>
                              </SelectItem>
                              {availableGroupStatuses.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  <span className="inline-block size-2.5 rounded-full mr-2" style={{ backgroundColor: s.color }} />
                                  {s.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={groupForm.control}
                      name="endStatusId"
                      render={({ field }) => (
                        <FormItem className={cn("grid", SHEET_FIELD_GAP)}>
                          <FormLabel>{t("productsConfig.accountingGroups.toStatus")}</FormLabel>
                          <Select value={field.value || "__none__"} onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)} disabled={saving}>
                            <FormControl>
                              <SelectTrigger className={SHEET_INPUT_CLASS}>
                                <SelectValue placeholder={t("productsConfig.accountingGroups.selectEndStatus")} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="__none__">
                                <span className="text-muted-foreground">{t("productsConfig.accountingGroups.notSelected")}</span>
                              </SelectItem>
                              {availableGroupStatuses.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  <span className="inline-block size-2.5 rounded-full mr-2" style={{ backgroundColor: s.color }} />
                                  {s.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                      </>
                    )}
                    <FormField
                      control={groupForm.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem className={cn("grid", SHEET_FIELD_GAP)}>
                          <FormLabel>{t("productsConfig.common.description")}</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder={t("productsConfig.accountingGroups.descPlaceholder")}
                              disabled={saving}
                              rows={3}
                              className={SHEET_INPUT_CLASS}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {(satelliteParentStatusId || editingGroup?.parentStatusId) && (
                      <FormField
                        control={groupForm.control}
                        name="subFunnelPolicy"
                        render={({ field }) => (
                          <FormItem className={cn("grid", SHEET_FIELD_GAP)}>
                            <FormLabel>{t("productsConfig.accountingGroups.subFunnelPolicyTitle")}</FormLabel>
                            <div
                              role="group"
                              aria-label={t("productsConfig.accountingGroups.subFunnelPolicyTitle")}
                              className="flex flex-col gap-3 rounded-md border border-border bg-muted/20 p-3"
                            >
                              <div className="flex items-start gap-2.5">
                                <Checkbox
                                  id="sub-funnel-policy-allow"
                                  checked={field.value === "allow"}
                                  onCheckedChange={(v) => {
                                    if (v === true) field.onChange("allow");
                                    else if (field.value === "allow") field.onChange("requireComplete");
                                  }}
                                  disabled={saving}
                                />
                                <Label
                                  htmlFor="sub-funnel-policy-allow"
                                  className="cursor-pointer font-normal leading-snug text-sm"
                                >
                                  {t("productsConfig.accountingGroups.subFunnelPolicyAllow")}
                                </Label>
                              </div>
                              <div className="flex items-start gap-2.5">
                                <Checkbox
                                  id="sub-funnel-policy-require"
                                  checked={field.value === "requireComplete"}
                                  onCheckedChange={(v) => {
                                    if (v === true) field.onChange("requireComplete");
                                    else if (field.value === "requireComplete") field.onChange("allow");
                                  }}
                                  disabled={saving}
                                />
                                <Label
                                  htmlFor="sub-funnel-policy-require"
                                  className="cursor-pointer font-normal leading-snug text-sm"
                                >
                                  {t("productsConfig.accountingGroups.subFunnelPolicyRequireComplete")}
                                </Label>
                              </div>
                            </div>
                            <FormDescription>
                              {t("productsConfig.accountingGroups.subFunnelPolicyDescription")}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                    <FormField
                      control={groupForm.control}
                      name="showInSidebar"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center gap-2 space-y-0 pt-1">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={(v) => field.onChange(v === true)}
                              disabled={saving}
                            />
                          </FormControl>
                          <FormLabel className="font-normal leading-none">
                            {t("productsConfig.accountingGroups.showInSidebar")}
                          </FormLabel>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </div>
              <SheetFooter className={SHEET_FOOTER_CLASS}>
                <div className="flex w-full flex-wrap items-center justify-between gap-2">
                  <div>
                    {editingGroup && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setDeleteGroupConfirmOpen(true)}
                        disabled={saving}
                        className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                      >
                        {saving && deleteGroupMut.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                        {t("productsConfig.common.delete")}
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" onClick={closeGroupSheet} disabled={saving}>
                      {t("productsConfig.common.cancel")}
                    </Button>
                    <Button type="submit" disabled={saving}>
                      {saving && !deleteGroupMut.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                      {editingGroup ? t("productsConfig.common.save") : t("productsConfig.common.create")}
                    </Button>
                  </div>
                </div>
              </SheetFooter>
            </form>
          </Form>
        </SheetContent>
      </Sheet>

      {/* Status Sheet */}
      <Sheet open={statusSheetOpen} onOpenChange={(o) => !o && closeStatusSheet()}>
        <SheetContent side="right" className={SHEET_CONTENT_CLASS} aria-describedby={undefined}>
          <SheetHeader className={SHEET_HEADER_CLASS}>
            <SheetTitle className="text-base font-semibold sm:text-lg">
              {editingStatus
                ? editingStatus.name
                : statusParentId
                  ? t("productsConfig.statusesConfig.newSubStatus")
                  : t("productsConfig.statusesConfig.newStatus")}
            </SheetTitle>
          </SheetHeader>
          <Form {...statusForm}>
            <form onSubmit={statusForm.handleSubmit(onStatusSubmit)} className="flex min-h-0 flex-1 flex-col">
              <div className={SHEET_BODY_CLASS}>
                <div className={SHEET_BODY_SCROLL_CLASS}>
                  <div className={cn("grid", SHEET_FORM_GAP, SHEET_FORM_PADDING)}>
                    <FormField
                      control={statusForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem className={cn("grid", SHEET_FIELD_GAP)}>
                          <FormLabel>{t("productsConfig.common.name")}</FormLabel>
                          <FormControl>
                            <Input
                              placeholder={t("productsConfig.statusesConfig.namePlaceholder")}
                              disabled={saving}
                              className={SHEET_INPUT_CLASS}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={statusForm.control}
                      name="code"
                      render={({ field }) => (
                        <FormItem className={cn("grid", SHEET_FIELD_GAP)}>
                          <FormLabel>{t("productsConfig.statusesConfig.code")}</FormLabel>
                          <FormControl>
                            <Input
                              placeholder={t("fieldDefinitions.codePlaceholder")}
                              disabled={saving}
                              className={`font-mono ${SHEET_INPUT_CLASS}`}
                              {...field}
                              onChange={(e) => {
                                field.onChange(e.target.value);
                                if (editingStatus == null) setStatusCodeManuallyEdited(true);
                              }}
                            />
                          </FormControl>
                          {editingStatus == null && (
                            <FormDescription>{t("fieldDefinitions.codeAutoHint")}</FormDescription>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={statusForm.control}
                      name="color"
                      render={({ field }) => (
                        <FormItem className={cn("grid", SHEET_FIELD_GAP)}>
                          <FormLabel>{t("productsConfig.statusesConfig.colorHex")}</FormLabel>
                          <div className="flex items-center gap-2">
                            <input
                              ref={colorInputRef}
                              type="color"
                              value={field.value}
                              onChange={(e) => field.onChange(e.target.value)}
                              disabled={saving}
                              className="sr-only"
                              aria-hidden="true"
                              tabIndex={-1}
                            />
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => colorInputRef.current?.click()}
                              className="inline-block size-8 shrink-0 rounded-md border border-input bg-background cursor-pointer hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                              style={{ backgroundColor: field.value }}
                              aria-label={t("productsConfig.statusesConfig.selectColor")}
                            />
                            <FormControl>
                              <Input placeholder="#6b7280" disabled={saving} className={SHEET_INPUT_CLASS} {...field} />
                            </FormControl>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={statusForm.control}
                      name="order"
                      render={({ field }) => (
                        <FormItem className="hidden">
                          <FormControl>
                            <input type="hidden" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={statusForm.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem className={cn("grid", SHEET_FIELD_GAP)}>
                          <FormLabel>{t("productsConfig.common.description")}</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder={t("productsConfig.statusesConfig.descPlaceholder")}
                              disabled={saving}
                              rows={3}
                              className={SHEET_INPUT_CLASS}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                  </div>
                </div>
              </div>
              <SheetFooter className={SHEET_FOOTER_CLASS}>
                <div className="flex w-full flex-wrap items-center justify-between gap-2">
                  <div>
                    {editingStatus && !editingStatus.isDefault && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setDeleteStatusConfirmOpen(true)}
                        disabled={saving}
                        className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                      >
                        {saving && deleteStatusMut.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                        {t("productsConfig.common.delete")}
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" onClick={closeStatusSheet} disabled={saving}>
                      {t("productsConfig.common.cancel")}
                    </Button>
                    <Button type="submit" disabled={saving}>
                      {saving && !deleteStatusMut.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                      {editingStatus ? t("productsConfig.common.save") : t("productsConfig.common.create")}
                    </Button>
                  </div>
                </div>
              </SheetFooter>
            </form>
          </Form>
        </SheetContent>
      </Sheet>

      <ConfirmDestructiveDialog
        open={deleteGroupConfirmOpen}
        onOpenChange={setDeleteGroupConfirmOpen}
        title={t("productsConfig.confirmDeleteGroup.title")}
        description={
          editingGroup?.parentStatusId
            ? t("productsConfig.confirmDeleteGroup.descriptionSatellite")
            : t("productsConfig.confirmDeleteGroup.descriptionRange")
        }
        cancelLabel={t("productsConfig.common.cancel")}
        confirmLabel={t("productsConfig.common.delete")}
        confirmPending={saving && deleteGroupMut.isPending}
        onConfirm={() => void runDeleteGroup()}
      />

      <ConfirmDestructiveDialog
        open={deleteStatusConfirmOpen}
        onOpenChange={setDeleteStatusConfirmOpen}
        title={t("productsConfig.confirmDeleteStatus.title")}
        description={(() => {
          if (!editingStatus || !defaultGroup) return "";
          const isSub =
            editingStatus.accountingGroupId !== defaultGroup.id;
          if (isSub) return t("productsConfig.confirmDeleteStatus.descriptionSub");
          const hasSat =
            (funnelStatuses.find((s) => s.id === editingStatus.id)?.satelliteGroups?.length ?? 0) >
            0;
          return hasSat
            ? t("productsConfig.confirmDeleteStatus.descriptionMainWithSatellites")
            : t("productsConfig.confirmDeleteStatus.descriptionMain");
        })()}
        cancelLabel={t("productsConfig.common.cancel")}
        confirmLabel={t("productsConfig.common.delete")}
        confirmPending={saving && deleteStatusMut.isPending}
        onConfirm={() => void runDeleteStatus()}
      />
    </div>
  );
}

// --- Sub-components ---

function AccountingGroupCard({
  group,
  groupIndex,
  groupsCount,
  reorderBusy,
  onReorder,
  onEdit,
  t,
}: {
  group: AccountingGroupItem;
  groupIndex: number;
  groupsCount: number;
  reorderBusy: boolean;
  onReorder: (direction: "up" | "down") => void;
  onEdit: () => void;
  t: (k: string) => string;
}) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 rounded-lg">
        <Layers className="size-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-semibold flex-1 min-w-0 truncate">{group.name}</span>
        {group.startStatus && group.endStatus && (
          <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
            <span className="inline-block size-2 rounded-full" style={{ backgroundColor: group.startStatus.color }} />
            {group.startStatus.name}
            <ArrowRight className="size-3" />
            <span className="inline-block size-2 rounded-full" style={{ backgroundColor: group.endStatus.color }} />
            {group.endStatus.name}
          </span>
        )}
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            disabled={groupIndex <= 0 || reorderBusy}
            onClick={(e) => { e.stopPropagation(); onReorder("up"); }}
          >
            <ChevronUp className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            disabled={groupIndex >= groupsCount - 1 || reorderBusy}
            onClick={(e) => { e.stopPropagation(); onReorder("down"); }}
          >
            <ChevronDown className="size-3.5" />
          </Button>
        </div>
        <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" onClick={onEdit}>
          <Pencil className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function StatusRow({
  status,
  expanded,
  onToggle,
  onEdit,
  onAddSubStatus,
  onEditSubStatus,
  onEditSatelliteGroup,
  onCreateSatelliteGroup,
  reorderBusy,
  canStatusMoveUp,
  canStatusMoveDown,
  onStatusMoveUp,
  onStatusMoveDown,
  onReorderSubStatus,
  t,
}: {
  status: StatusItem;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onAddSubStatus: () => void;
  onEditSubStatus: (s: StatusItem) => void;
  onEditSatelliteGroup?: (sg: AccountingGroupItem) => void;
  onCreateSatelliteGroup?: (parentStatusId: string) => void;
  reorderBusy: boolean;
  canStatusMoveUp: boolean;
  canStatusMoveDown: boolean;
  onStatusMoveUp: () => void;
  onStatusMoveDown: () => void;
  onReorderSubStatus: (
    parentStatusId: string,
    satelliteGroupId: string,
    subStatusId: string,
    direction: "up" | "down"
  ) => void;
  t: (k: string) => string;
}) {
  /** Лише за фактом наявності сателітних груп у відповіді API — не покладатися на hasSubStatuses (може бути true без груп після видалення). */
  const satellites = status.satelliteGroups ?? [];
  const hasSatellite = satellites.length > 0;

  return (
    <>
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors border-b last:border-b-0"
        onClick={onEdit}
      >
        {hasSatellite ? (
          <button
            type="button"
            className="shrink-0 p-0.5 rounded hover:bg-muted"
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
          >
            <ChevronRight className={cn("size-4 transition-transform", expanded && "rotate-90")} />
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}

        <span className="inline-block size-3 rounded-full shrink-0" style={{ backgroundColor: status.color }} />
        <span className="text-sm font-medium truncate flex-1 min-w-0">{status.name}</span>

        {status.code && (
          <span className="text-xs text-muted-foreground font-mono shrink-0">{status.code}</span>
        )}
        {status.isDefault && (
          <Badge variant="secondary" className="text-[10px] font-normal shrink-0">
            {t("productsConfig.statusesConfig.defaultBadge")}
          </Badge>
        )}
        {!status.isDefault && (
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 shrink-0"
              disabled={!canStatusMoveUp || reorderBusy}
              onClick={(e) => { e.stopPropagation(); onStatusMoveUp(); }}
            >
              <ChevronUp className="size-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 shrink-0"
              disabled={!canStatusMoveDown || reorderBusy}
              onClick={(e) => { e.stopPropagation(); onStatusMoveDown(); }}
            >
              <ChevronDown className="size-3" />
            </Button>
          </div>
        )}
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">#{status.order}</span>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            if (satellites.length === 0 && onCreateSatelliteGroup) {
              onCreateSatelliteGroup(status.id);
            } else {
              onAddSubStatus();
            }
          }}
          title={satellites.length === 0
            ? t("productsConfig.accountingGroups.createSatelliteGroup")
            : t("productsConfig.statusesConfig.addSubStatus")}
        >
          <Plus className="size-3" />
        </Button>
      </div>

      {expanded && satellites.length > 0 && (
        <div className="border-b border-border bg-muted/20 divide-y divide-border">
          {satellites.flatMap((sg) => {
            const sortedSubs = [...(sg.statuses ?? [])].sort(
              (a, b) => a.order !== b.order ? a.order - b.order : a.id.localeCompare(b.id)
            );
            return [
              <div key={`${sg.id}-h`} className="flex items-center gap-2 py-2 pl-10 pr-3">
                <span className="text-xs font-semibold text-primary/70 truncate flex-1 min-w-0">
                  {sg.name}
                </span>
                <Badge variant="outline" className="text-[10px] font-normal tabular-nums px-1.5 py-0 h-5 shrink-0">
                  {sortedSubs.length}
                </Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0"
                  onClick={(e) => { e.stopPropagation(); onAddSubStatus(); }}
                  title={t("productsConfig.statusesConfig.addSubStatus")}
                >
                  <Plus className="size-3" />
                </Button>
                {onEditSatelliteGroup && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6 shrink-0"
                    onClick={(e) => { e.stopPropagation(); onEditSatelliteGroup(sg); }}
                    title={t("productsConfig.accountingGroups.editSatelliteGroup")}
                  >
                    <Pencil className="size-3" />
                  </Button>
                )}
              </div>,
              ...sortedSubs.map((sub, subIdx, arr) => (
                <div
                  key={sub.id}
                  className="flex items-center gap-2 py-2 pl-12 pr-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => onEditSubStatus(sub)}
                >
                  <CornerDownRight className="size-3.5 shrink-0 text-muted-foreground/40" />
                  <span className="inline-block size-2.5 rounded-full shrink-0" style={{ backgroundColor: sub.color }} />
                  <span className="text-xs font-medium truncate flex-1 min-w-0">{sub.name}</span>
                  {sub.code && (
                    <span className="text-[10px] text-muted-foreground font-mono shrink-0">{sub.code}</span>
                  )}
                  {sub.isDefault && (
                    <Badge variant="secondary" className="text-[10px] font-normal shrink-0">
                      {t("productsConfig.statusesConfig.defaultBadge")}
                    </Badge>
                  )}
                  {!sub.isDefault && (
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-5 shrink-0"
                        disabled={subIdx <= 0 || reorderBusy || arr[subIdx - 1]?.isDefault}
                        onClick={(e) => { e.stopPropagation(); onReorderSubStatus(status.id, sg.id, sub.id, "up"); }}
                      >
                        <ChevronUp className="size-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-5 shrink-0"
                        disabled={subIdx >= arr.length - 1 || reorderBusy}
                        onClick={(e) => { e.stopPropagation(); onReorderSubStatus(status.id, sg.id, sub.id, "down"); }}
                      >
                        <ChevronDown className="size-3" />
                      </Button>
                    </div>
                  )}
                  <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">#{sub.order}</span>
                </div>
              )),
            ];
          })}
        </div>
      )}
    </>
  );
}
