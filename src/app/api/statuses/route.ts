import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const STATUS_SELECT = {
  id: true,
  accountingGroupId: true,
  name: true,
  code: true,
  color: true,
  order: true,
  isDefault: true,
  hasSubStatuses: true,
  description: true,
  satelliteGroups: {
    orderBy: { order: "asc" as const },
    select: {
      id: true,
      categoryId: true,
      parentStatusId: true,
      name: true,
      order: true,
      subFunnelPolicy: true,
      statuses: {
        orderBy: { order: "asc" as const },
        select: {
          id: true,
          accountingGroupId: true,
          name: true,
          code: true,
          color: true,
          order: true,
          isDefault: true,
          hasSubStatuses: true,
          description: true,
        },
      },
    },
  },
} as const;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("categoryId");

    if (!categoryId) {
      return NextResponse.json({ groups: [] });
    }

    // Fetch all root groups for this category
    const allGroups = await prisma.accountingGroup.findMany({
      where: { categoryId, parentStatusId: null },
      orderBy: { order: "asc" },
      select: {
        id: true,
        categoryId: true,
        parentStatusId: true,
        nextGroupId: true,
        isDefault: true,
        showInSidebar: true,
        startStatusId: true,
        endStatusId: true,
        name: true,
        order: true,
        description: true,
        startStatus: { select: { id: true, name: true, order: true, color: true } },
        endStatus: { select: { id: true, name: true, order: true, color: true } },
        statuses: {
          orderBy: { order: "asc" },
          select: STATUS_SELECT,
        },
      },
    });

    // For non-default groups with range, resolve statuses from the default group
    const defaultGroup = allGroups.find((g) => g.isDefault);

    const groups = await Promise.all(
      allGroups.map(async (g) => {
        if (g.isDefault || !g.startStatusId || !g.endStatusId || !defaultGroup) {
          return g;
        }

        const startOrder = g.startStatus?.order;
        const endOrder = g.endStatus?.order;

        if (startOrder == null || endOrder == null) return g;

        const rangeStatuses = await prisma.productStatus.findMany({
          where: {
            accountingGroupId: defaultGroup.id,
            order: { gte: startOrder, lte: endOrder },
          },
          orderBy: { order: "asc" },
          select: STATUS_SELECT,
        });

        return { ...g, statuses: rangeStatuses };
      })
    );

    // Fetch satellite groups (parentStatusId is set) for sidebar navigation
    const satelliteGroups = await prisma.accountingGroup.findMany({
      where: { categoryId, parentStatusId: { not: null } },
      orderBy: { order: "asc" },
      select: {
        id: true,
        name: true,
        order: true,
        parentStatusId: true,
        isDefault: true,
        showInSidebar: true,
        subFunnelPolicy: true,
      },
    });

    return NextResponse.json({ groups, satelliteGroups });
  } catch (e) {
    console.error("[GET /api/statuses]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
