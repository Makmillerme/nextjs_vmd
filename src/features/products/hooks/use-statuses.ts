"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { managementPublicKeys } from "@/lib/query-keys";

export type PublicStatusItem = {
  id: string;
  accountingGroupId: string;
  name: string;
  code: string | null;
  color: string;
  order: number;
  isDefault: boolean;
  hasSubStatuses: boolean;
  description: string | null;
  satelliteGroups?: PublicGroupItem[];
};

export type PublicGroupItem = {
  id: string;
  categoryId: string;
  parentStatusId: string | null;
  nextGroupId?: string | null;
  isDefault?: boolean;
  name: string;
  order: number;
  description?: string | null;
  /** allow | requireComplete — для сателітних груп у дереві статусів */
  subFunnelPolicy?: string;
  statuses: PublicStatusItem[];
};

export type PublicSatelliteSidebarItem = {
  id: string;
  name: string;
  order: number;
  parentStatusId: string | null;
  isDefault: boolean;
  showInSidebar: boolean;
  subFunnelPolicy?: string;
};

export type StatusOption = { value: string; label: string };

/** Усі ProductStatus з дерева груп, включно з підгрупами (satelliteGroups). */
function collectStatusesFromGroup(group: PublicGroupItem, out: PublicStatusItem[]): void {
  for (const s of group.statuses) {
    out.push(s);
    for (const sg of s.satelliteGroups ?? []) {
      collectStatusesFromGroup(sg, out);
    }
  }
}

async function fetchStatusGroups(categoryId?: string): Promise<{
  groups: PublicGroupItem[];
  satelliteGroups: PublicSatelliteSidebarItem[];
}> {
  const sp = new URLSearchParams();
  if (categoryId) sp.set("categoryId", categoryId);
  const res = await fetch(`/api/statuses?${sp.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch statuses");
  const data = await res.json();
  return {
    groups: (data?.groups ?? []) as PublicGroupItem[],
    satelliteGroups: (data?.satelliteGroups ?? []) as PublicSatelliteSidebarItem[],
  };
}

export function useStatuses(categoryId?: string) {
  const q = useQuery({
    queryKey: [...managementPublicKeys.statuses, categoryId ?? "all"],
    queryFn: () => fetchStatusGroups(categoryId),
    enabled: !!categoryId,
  });

  const groups = q.data?.groups ?? [];
  const satelliteGroups = q.data?.satelliteGroups ?? [];

  const defaultGroup = useMemo(
    () => groups.find((g) => g.isDefault),
    [groups]
  );

  const allStatuses = useMemo(() => {
    if (defaultGroup) {
      const result: PublicStatusItem[] = [];
      collectStatusesFromGroup(defaultGroup, result);
      return result;
    }
    const seen = new Set<string>();
    const result: PublicStatusItem[] = [];
    for (const g of groups) {
      for (const s of g.statuses) {
        if (!seen.has(s.id)) {
          seen.add(s.id);
          result.push(s);
        }
      }
    }
    return result;
  }, [groups, defaultGroup]);

  const options: StatusOption[] = useMemo(
    () => allStatuses.map((s) => ({ value: s.id, label: s.name })),
    [allStatuses]
  );

  const rootStatuses = useMemo(() => {
    if (defaultGroup) {
      return [...defaultGroup.statuses];
    }
    const seen = new Set<string>();
    const result: PublicStatusItem[] = [];
    for (const g of groups) {
      for (const s of g.statuses) {
        if (!seen.has(s.id)) {
          seen.add(s.id);
          result.push(s);
        }
      }
    }
    return result;
  }, [groups, defaultGroup]);

  const rootOptions: StatusOption[] = useMemo(
    () => rootStatuses.map((s) => ({ value: s.id, label: s.name })),
    [rootStatuses]
  );

  return {
    groups,
    satelliteGroups,
    allStatuses,
    options,
    rootStatuses,
    rootOptions,
    isLoading: q.isLoading,
    error: q.error,
  };
}
