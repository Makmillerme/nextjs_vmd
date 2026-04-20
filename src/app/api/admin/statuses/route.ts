import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { OWNER_ROLE } from "@/config/owner";
import { ADMIN_ROLE } from "@/config/roles";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== ADMIN_ROLE && role !== OWNER_ROLE) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

/** Find the default funnel group for a category. */
async function findDefaultGroup(categoryId: string) {
  return prisma.accountingGroup.findFirst({
    where: { categoryId, parentStatusId: null, isDefault: true },
    select: { id: true },
  });
}

export async function GET(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const accountingGroupId = searchParams.get("accountingGroupId");
    const search = searchParams.get("search")?.trim() ?? "";

    if (!accountingGroupId) {
      return NextResponse.json({ error: "accountingGroupId is required" }, { status: 400 });
    }

    // Check if the requested group is non-default (range-based)
    const requestedGroup = await prisma.accountingGroup.findUnique({
      where: { id: accountingGroupId },
      select: { isDefault: true, categoryId: true, startStatusId: true, endStatusId: true },
    });

    if (!requestedGroup) {
      return NextResponse.json({ error: "Accounting group not found" }, { status: 404 });
    }

    let where: Record<string, unknown>;

    if (!requestedGroup.isDefault && requestedGroup.startStatusId && requestedGroup.endStatusId) {
      // Resolve range: get statuses from the default group within order range
      const defaultGroup = await findDefaultGroup(requestedGroup.categoryId);
      if (!defaultGroup) {
        return NextResponse.json({ statuses: [] });
      }

      const [startStatus, endStatus] = await Promise.all([
        prisma.productStatus.findUnique({ where: { id: requestedGroup.startStatusId }, select: { order: true } }),
        prisma.productStatus.findUnique({ where: { id: requestedGroup.endStatusId }, select: { order: true } }),
      ]);

      if (!startStatus || !endStatus) {
        return NextResponse.json({ statuses: [] });
      }

      where = {
        accountingGroupId: defaultGroup.id,
        order: { gte: startStatus.order, lte: endStatus.order },
      };
    } else {
      where = { accountingGroupId };
    }

    if (search) where.name = { contains: search, mode: "insensitive" as const };

    const statuses = await prisma.productStatus.findMany({
      where,
      orderBy: { order: "asc" },
      include: {
        satelliteGroups: {
          orderBy: { order: "asc" },
          include: { statuses: { orderBy: { order: "asc" } } },
        },
      },
    });

    return NextResponse.json({ statuses });
  } catch (e) {
    console.error("[GET /api/admin/statuses]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: {
    accountingGroupId?: string;
    categoryId?: string;
    parentStatusId?: string;
    name?: string;
    code?: string | null;
    color?: string;
    order?: number;
    description?: string | null;
    isDefault?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  try {
    let targetGroupId = body.accountingGroupId;

    // If parentStatusId is provided, auto-create satellite group if needed
    if (body.parentStatusId) {
      const parentStatus = await prisma.productStatus.findUnique({
        where: { id: body.parentStatusId },
        include: {
          accountingGroup: { select: { categoryId: true } },
          satelliteGroups: { take: 1 },
        },
      });
      if (!parentStatus) {
        return NextResponse.json({ error: "Parent status not found" }, { status: 404 });
      }

      if (parentStatus.satelliteGroups.length > 0) {
        targetGroupId = parentStatus.satelliteGroups[0].id;
      } else {
        const satellite = await prisma.accountingGroup.create({
          data: {
            categoryId: parentStatus.accountingGroup.categoryId,
            parentStatusId: body.parentStatusId,
            name: parentStatus.name,
            order: 0,
          },
        });
        targetGroupId = satellite.id;
        await prisma.productStatus.update({
          where: { id: body.parentStatusId },
          data: { hasSubStatuses: true },
        });
      }
    } else if (!targetGroupId && body.categoryId) {
      // Resolve default group from categoryId
      const defaultGroup = await findDefaultGroup(body.categoryId);
      if (!defaultGroup) {
        return NextResponse.json({ error: "Default funnel group not found for this category" }, { status: 400 });
      }
      targetGroupId = defaultGroup.id;
    }

    if (!targetGroupId) {
      return NextResponse.json({ error: "accountingGroupId, categoryId, or parentStatusId is required" }, { status: 400 });
    }

    const group = await prisma.accountingGroup.findUnique({
      where: { id: targetGroupId },
      select: { id: true },
    });
    if (!group) {
      return NextResponse.json({ error: "Accounting group not found" }, { status: 404 });
    }

    const created = await prisma.$transaction(async (tx) => {
      if (body.isDefault) {
        await tx.productStatus.updateMany({
          where: { accountingGroupId: targetGroupId!, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.productStatus.create({
        data: {
          accountingGroupId: targetGroupId!,
          name: body.name!.trim(),
          code: body.code?.trim() ?? null,
          color: body.color?.trim() ?? "#6b7280",
          order: body.order ?? 0,
          description: body.description?.trim() ?? null,
          isDefault: body.isDefault ?? false,
          hasSubStatuses: false,
        },
      });
    });

    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    console.error("[POST /api/admin/statuses]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
