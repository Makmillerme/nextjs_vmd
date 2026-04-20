import type { PublicGroupItem, PublicStatusItem } from "../hooks/use-statuses";

/** Підстатуси сателітної облікової групи з дерева груп (default funnel → satelliteGroups). */
export function findSatelliteStatuses(
  groups: PublicGroupItem[],
  satelliteId: string
): PublicStatusItem[] {
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

