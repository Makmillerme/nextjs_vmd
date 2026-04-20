"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQueries, useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { useLocale } from "@/lib/locale-provider";
import { managementPublicKeys } from "@/lib/query-keys";

type CategoryItem = { id: string; name: string; order: number };

type AccountingGroupNav = { id: string; name: string; order: number; isDefault?: boolean; showInSidebar?: boolean; parentStatusId?: string | null };

async function fetchCategories(): Promise<CategoryItem[]> {
  const res = await fetch("/api/categories");
  if (!res.ok) throw new Error("Failed to fetch categories");
  const data = await res.json();
  return data?.categories ?? data ?? [];
}

type SidebarGroupsData = { groups: AccountingGroupNav[]; satelliteGroups: AccountingGroupNav[] };

async function fetchSidebarGroups(categoryId: string): Promise<SidebarGroupsData> {
  const res = await fetch(`/api/statuses?categoryId=${encodeURIComponent(categoryId)}`);
  if (!res.ok) throw new Error("Failed to fetch groups");
  const data = await res.json();
  const groups = ((data?.groups ?? []) as AccountingGroupNav[]).sort((a, b) => a.order - b.order);
  const satelliteGroups = ((data?.satelliteGroups ?? []) as AccountingGroupNav[]).sort((a, b) => a.order - b.order);
  return { groups, satelliteGroups };
}

/** Категорії як роздільні згортачі; усередині — «Усі позиції» + облікові групи (воронка). */
export function CatalogNavItem() {
  const pathname = usePathname();
  const { t } = useLocale();
  const { data: categories = [] } = useQuery({
    queryKey: ["categories", "nav"],
    queryFn: fetchCategories,
    staleTime: 5 * 60 * 1000,
  });

  const sorted = [...categories].sort((a, b) => a.order - b.order);

  const groupQueries = useQueries({
    queries: sorted.map((cat) => ({
      queryKey: [...managementPublicKeys.statuses, "sidebar-groups", cat.id],
      queryFn: () => fetchSidebarGroups(cat.id),
      staleTime: 5 * 60 * 1000,
      enabled: sorted.length > 0,
    })),
  });

  if (sorted.length === 0) return null;

  return (
    <>
      {sorted.map((cat, idx) => {
        const queryData = groupQueries[idx]?.data;
        const defaultGroupVisible = (queryData?.groups ?? []).find((g) => g.isDefault)?.showInSidebar !== false;
        const rootGroups = (queryData?.groups ?? []).filter((g) => !g.isDefault && g.showInSidebar !== false);
        const satGroups = (queryData?.satelliteGroups ?? []).filter((g) => g.showInSidebar !== false);
        const catBase = `/catalog/${cat.id}`;
        const isCategoryBranch = pathname === catBase || pathname.startsWith(`${catBase}/`);

        return (
          <Collapsible
            key={cat.id}
            asChild
            defaultOpen={isCategoryBranch}
            className="group/collapsible"
          >
            <SidebarMenuItem>
              <CollapsibleTrigger asChild>
                <SidebarMenuButton tooltip={cat.name} isActive={isCategoryBranch}>
                  <span className="truncate min-w-0">{cat.name}</span>
                  <ChevronRight className="ml-auto size-4 shrink-0 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                </SidebarMenuButton>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub>
                  {defaultGroupVisible && (
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton asChild isActive={pathname === catBase}>
                        <Link href={catBase}>
                          <span>{t("layout.nav.catalogAllItems")}</span>
                        </Link>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  )}
                  {rootGroups.map((g) => {
                    const groupHref = `${catBase}/group/${g.id}`;
                    return (
                      <SidebarMenuSubItem key={g.id}>
                        <SidebarMenuSubButton asChild isActive={pathname === groupHref}>
                          <Link href={groupHref}>
                            <span>{g.name}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    );
                  })}
                </SidebarMenuSub>
                {satGroups.length > 0 && (
                  <>
                    <Separator className="my-1 mx-2" />
                    <SidebarMenuSub>
                      {satGroups.map((sg) => {
                        const sgHref = `${catBase}/group/${sg.id}`;
                        return (
                          <SidebarMenuSubItem key={sg.id}>
                            <SidebarMenuSubButton asChild isActive={pathname === sgHref}>
                              <Link href={sgHref}>
                                <span>{sg.name}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        );
                      })}
                    </SidebarMenuSub>
                  </>
                )}
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>
        );
      })}
    </>
  );
}
