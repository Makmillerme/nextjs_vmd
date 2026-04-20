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

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await context.params;

  try {
    const group = await prisma.accountingGroup.findUnique({
      where: { id },
      include: {
        startStatus: { select: { id: true, name: true, order: true, color: true } },
        endStatus: { select: { id: true, name: true, order: true, color: true } },
        statuses: {
          orderBy: { order: "asc" },
          include: {
            satelliteGroups: {
              orderBy: { order: "asc" },
              include: { statuses: { orderBy: { order: "asc" } } },
            },
          },
        },
      },
    });
    if (!group) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(group);
  } catch (e) {
    console.error("[GET /api/admin/accounting-groups/[id]]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await context.params;

  let body: {
    name?: string;
    order?: number;
    description?: string | null;
    nextGroupId?: string | null;
    startStatusId?: string | null;
    endStatusId?: string | null;
    showInSidebar?: boolean;
    subFunnelPolicy?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const existing = await prisma.accountingGroup.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Validate range fields for non-default groups
    if (!existing.isDefault && (body.startStatusId !== undefined || body.endStatusId !== undefined)) {
      const defaultGroup = await prisma.accountingGroup.findFirst({
        where: { categoryId: existing.categoryId, parentStatusId: null, isDefault: true },
        select: { id: true },
      });
      if (defaultGroup) {
        const newStart = body.startStatusId ?? existing.startStatusId;
        const newEnd = body.endStatusId ?? existing.endStatusId;
        if (newStart && newEnd) {
          const [start, end] = await Promise.all([
            prisma.productStatus.findUnique({ where: { id: newStart }, select: { order: true, accountingGroupId: true } }),
            prisma.productStatus.findUnique({ where: { id: newEnd }, select: { order: true, accountingGroupId: true } }),
          ]);
          if (!start || start.accountingGroupId !== defaultGroup.id) {
            return NextResponse.json({ error: "startStatusId must belong to the default funnel group" }, { status: 400 });
          }
          if (!end || end.accountingGroupId !== defaultGroup.id) {
            return NextResponse.json({ error: "endStatusId must belong to the default funnel group" }, { status: 400 });
          }
          if (start.order > end.order) {
            return NextResponse.json({ error: "startStatus order must be <= endStatus order" }, { status: 400 });
          }
        }
      }
    }

    // Circular chain check
    if (body.nextGroupId !== undefined && body.nextGroupId !== null) {
      if (body.nextGroupId === id) {
        return NextResponse.json({ error: "Cannot link group to itself" }, { status: 400 });
      }
      let cursor: string | null = body.nextGroupId;
      const visited = new Set<string>([id]);
      while (cursor) {
        if (visited.has(cursor)) {
          return NextResponse.json({ error: "Circular chain detected" }, { status: 400 });
        }
        visited.add(cursor);
        const next: { nextGroupId: string | null } | null = await prisma.accountingGroup.findUnique({
          where: { id: cursor },
          select: { nextGroupId: true },
        });
        cursor = next?.nextGroupId ?? null;
      }
    }

    const subPolicyPatch =
      body.subFunnelPolicy !== undefined
        ? body.subFunnelPolicy === "requireComplete"
          ? "requireComplete"
          : "allow"
        : undefined;

    const updated = await prisma.accountingGroup.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name.trim() }),
        ...(body.order !== undefined && { order: body.order }),
        ...(body.description !== undefined && { description: body.description?.trim() ?? null }),
        ...(body.nextGroupId !== undefined && { nextGroupId: body.nextGroupId }),
        ...(body.startStatusId !== undefined && { startStatusId: body.startStatusId }),
        ...(body.endStatusId !== undefined && { endStatusId: body.endStatusId }),
        ...(body.showInSidebar !== undefined && { showInSidebar: body.showInSidebar }),
        ...(subPolicyPatch !== undefined && { subFunnelPolicy: subPolicyPatch }),
      },
      include: {
        startStatus: { select: { id: true, name: true, order: true, color: true } },
        endStatus: { select: { id: true, name: true, order: true, color: true } },
        statuses: { orderBy: { order: "asc" } },
      },
    });

    return NextResponse.json(updated);
  } catch (e) {
    console.error("[PATCH /api/admin/accounting-groups/[id]]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await context.params;

  try {
    const group = await prisma.accountingGroup.findUnique({ where: { id } });
    if (!group) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Protect the default funnel group from deletion
    if (group.isDefault) {
      return NextResponse.json({ error: "Cannot delete the default funnel group" }, { status: 400 });
    }

    const parentStatusIdForCleanup = group.parentStatusId;

    await prisma.$transaction(async (tx) => {
      const statusesInGroup = await tx.productStatus.findMany({
        where: { accountingGroupId: id },
        select: { id: true },
      });
      const subStatusIds = statusesInGroup.map((s) => s.id);
      if (subStatusIds.length > 0) {
        await tx.product.updateMany({
          where: { productSubStatusId: { in: subStatusIds } },
          data: { productSubStatusId: null },
        });
      }

      const prev = await tx.accountingGroup.findFirst({
        where: { nextGroupId: id },
      });
      const bridgeNextId = group.nextGroupId;
      // nextGroupId is @unique: clear the row-to-delete first, otherwise patching `prev` to
      // point at bridgeNextId conflicts with this row still holding the same nextGroupId.
      await tx.accountingGroup.update({
        where: { id },
        data: { nextGroupId: null },
      });
      if (prev) {
        await tx.accountingGroup.update({
          where: { id: prev.id },
          data: { nextGroupId: bridgeNextId },
        });
      }

      await tx.accountingGroup.delete({ where: { id } });
    });

    if (parentStatusIdForCleanup) {
      const remaining = await prisma.accountingGroup.count({
        where: { parentStatusId: parentStatusIdForCleanup },
      });
      if (remaining === 0) {
        await prisma.productStatus.update({
          where: { id: parentStatusIdForCleanup },
          data: { hasSubStatuses: false },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DELETE /api/admin/accounting-groups/[id]]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
