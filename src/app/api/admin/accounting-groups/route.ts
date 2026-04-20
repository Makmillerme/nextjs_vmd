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

/** Ensure a default funnel group exists for the category; return its id. */
async function ensureDefaultGroup(categoryId: string): Promise<string> {
  const existing = await prisma.accountingGroup.findFirst({
    where: { categoryId, parentStatusId: null, isDefault: true },
    select: { id: true },
  });
  if (existing) {
    await ensureDefaultStatus(existing.id);
    return existing.id;
  }

  const created = await prisma.accountingGroup.create({
    data: {
      categoryId,
      name: "\u0423\u0441\u0456 \u043f\u043e\u0437\u0438\u0446\u0456\u0457",
      isDefault: true,
      order: 0,
    },
  });
  await ensureDefaultStatus(created.id);
  return created.id;
}

/** Ensure the group has a default 'Нерозібрані' status with isDefault=true. Reuses existing row with code nerozibrani if present (avoids duplicates after isDefault was cleared). */
async function ensureDefaultStatus(groupId: string): Promise<void> {
  const existingDefault = await prisma.productStatus.findFirst({
    where: { accountingGroupId: groupId, isDefault: true },
    select: { id: true },
  });
  if (existingDefault) return;

  const byCode = await prisma.productStatus.findFirst({
    where: { accountingGroupId: groupId, code: "nerozibrani" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (byCode) {
    await prisma.$transaction(async (tx) => {
      await tx.productStatus.updateMany({
        where: { accountingGroupId: groupId, isDefault: true },
        data: { isDefault: false },
      });
      await tx.productStatus.update({
        where: { id: byCode.id },
        data: { isDefault: true, order: 0 },
      });
    });
    return;
  }

  await prisma.productStatus.create({
    data: {
      accountingGroupId: groupId,
      name: "\u041d\u0435\u0440\u043e\u0437\u0456\u0431\u0440\u0430\u043d\u0456",
      code: "nerozibrani",
      color: "#6b7280",
      isDefault: true,
      order: 0,
      hasSubStatuses: false,
    },
  });
}

export async function GET(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("categoryId");
    const parentStatusId = searchParams.get("parentStatusId");

    if (!categoryId) {
      return NextResponse.json({ error: "categoryId is required" }, { status: 400 });
    }

    // Ensure the default funnel group exists
    await ensureDefaultGroup(categoryId);

    const where: Record<string, unknown> = { categoryId };
    if (parentStatusId) {
      where.parentStatusId = parentStatusId;
    } else {
      where.parentStatusId = null;
    }

    const groups = await prisma.accountingGroup.findMany({
      where,
      orderBy: { order: "asc" },
      include: {
        startStatus: { select: { id: true, name: true, order: true, color: true } },
        endStatus: { select: { id: true, name: true, order: true, color: true } },
        statuses: {
          orderBy: { order: "asc" },
          include: {
            satelliteGroups: {
              orderBy: { order: "asc" },
              include: {
                statuses: { orderBy: { order: "asc" } },
              },
            },
          },
        },
      },
    });

    return NextResponse.json({ groups });
  } catch (e) {
    console.error("[GET /api/admin/accounting-groups]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: {
    categoryId?: string;
    parentStatusId?: string | null;
    name?: string;
    order?: number;
    description?: string | null;
    startStatusId?: string | null;
    endStatusId?: string | null;
    showInSidebar?: boolean;
    /** allow | requireComplete — для сателітних груп */
    subFunnelPolicy?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.categoryId) {
    return NextResponse.json({ error: "categoryId is required" }, { status: 400 });
  }
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  try {
    // For root groups (not satellite), validate range if non-default
    if (!body.parentStatusId) {
      const defaultGroupId = await ensureDefaultGroup(body.categoryId);

      // Validate startStatusId / endStatusId belong to the default group
      if (body.startStatusId && body.endStatusId) {
        const [start, end] = await Promise.all([
          prisma.productStatus.findUnique({
            where: { id: body.startStatusId },
            select: { order: true, accountingGroupId: true },
          }),
          prisma.productStatus.findUnique({
            where: { id: body.endStatusId },
            select: { order: true, accountingGroupId: true },
          }),
        ]);
        if (!start || start.accountingGroupId !== defaultGroupId) {
          return NextResponse.json({ error: "startStatusId must belong to the default funnel group" }, { status: 400 });
        }
        if (!end || end.accountingGroupId !== defaultGroupId) {
          return NextResponse.json({ error: "endStatusId must belong to the default funnel group" }, { status: 400 });
        }
        if (start.order > end.order) {
          return NextResponse.json({ error: "startStatus order must be <= endStatus order" }, { status: 400 });
        }
      }
    }

    const group = await prisma.$transaction(async (tx) => {
      const subPolicy =
        body.parentStatusId && body.subFunnelPolicy === "requireComplete"
          ? "requireComplete"
          : "allow";
      const created = await tx.accountingGroup.create({
        data: {
          categoryId: body.categoryId!,
          parentStatusId: body.parentStatusId ?? null,
          name: body.name!.trim(),
          order: body.order ?? 0,
          description: body.description?.trim() ?? null,
          isDefault: false,
          showInSidebar: body.showInSidebar ?? true,
          subFunnelPolicy: subPolicy,
          startStatusId: body.startStatusId ?? null,
          endStatusId: body.endStatusId ?? null,
        },
      });

      // Auto-chain for root non-default groups
      if (!body.parentStatusId) {
        const lastGroup = await tx.accountingGroup.findFirst({
          where: {
            categoryId: body.categoryId!,
            parentStatusId: null,
            isDefault: false,
            id: { not: created.id },
            nextGroupId: null,
          },
          orderBy: { order: "desc" },
        });
        if (lastGroup) {
          await tx.accountingGroup.update({
            where: { id: lastGroup.id },
            data: { nextGroupId: created.id },
          });
        }
      }

      return created;
    });

    if (body.parentStatusId) {
      await ensureDefaultStatus(group.id);
      await prisma.productStatus.update({
        where: { id: body.parentStatusId },
        data: { hasSubStatuses: true },
      });
      const defaultSub = await prisma.productStatus.findFirst({
        where: { accountingGroupId: group.id, isDefault: true },
        select: { id: true },
      });
      if (defaultSub) {
        await prisma.product.updateMany({
          where: { productStatusId: body.parentStatusId },
          data: { productSubStatusId: defaultSub.id },
        });
      }
    }

    return NextResponse.json(group, { status: 201 });
  } catch (e) {
    console.error("[POST /api/admin/accounting-groups]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
