/**
 * Маппінг між Prisma Product (camelCase) та фронтовим Product (snake_case base + EAV).
 * Всі польові дані — через ProductFieldValue.
 */
import { prisma } from "@/lib/prisma";
import type { Product, ProductMedia } from "@/features/products/types";
import type { ProductFilterState, ProductColumnId } from "@/features/products/types";
import type { Prisma } from "@/generated/prisma/client";
import {
  upsertProductFieldValues,
  loadProductFieldValues,
  getFieldDefinitionsForCategory,
} from "@/lib/product-field-values";

/** Клієнт має показати i18n за ключем products.errors.subFunnelIncomplete */
export class SubFunnelIncompleteError extends Error {
  readonly code = "SUB_FUNNEL_INCOMPLETE" as const;
  constructor() {
    super("SUB_FUNNEL_INCOMPLETE");
    this.name = "SubFunnelIncompleteError";
  }
}

/** Для головного статусу з сателітною групою — id підстатусу «за замовчуванням», інакше null. */
export async function getSyncedSubStatusIdForMainStatus(
  mainStatusId: string | null
): Promise<string | null> {
  if (!mainStatusId) return null;
  const satellite = await prisma.accountingGroup.findFirst({
    where: { parentStatusId: mainStatusId },
    select: { id: true },
  });
  if (!satellite) return null;
  const def = await prisma.productStatus.findFirst({
    where: { accountingGroupId: satellite.id, isDefault: true },
    select: { id: true },
  });
  return def?.id ?? null;
}

async function getSatelliteLastSubStatusId(satelliteGroupId: string): Promise<string | null> {
  const last = await prisma.productStatus.findFirst({
    where: { accountingGroupId: satelliteGroupId },
    orderBy: { order: "desc" },
    select: { id: true },
  });
  return last?.id ?? null;
}

async function assertMayLeaveMainStatus(
  oldMainStatusId: string | null,
  newMainStatusId: string | null,
  currentSubStatusId: string | null
): Promise<void> {
  if (oldMainStatusId === newMainStatusId) return;
  if (!oldMainStatusId) return;

  const satellite = await prisma.accountingGroup.findFirst({
    where: { parentStatusId: oldMainStatusId },
    select: { id: true, subFunnelPolicy: true },
  });
  if (!satellite || satellite.subFunnelPolicy !== "requireComplete") return;

  const lastId = await getSatelliteLastSubStatusId(satellite.id);
  if (!lastId) return;
  if (currentSubStatusId !== lastId) {
    throw new SubFunnelIncompleteError();
  }
}

type DbProductMedia = {
  id: number;
  productId: number;
  path: string;
  mimeType: string | null;
  kind: string | null;
  order: number;
  createdAt: Date;
};

type DbProductRow = {
  id: number;
  productTypeId: string | null;
  categoryId: string | null;
  productStatusId: string | null;
  productSubStatusId: string | null;
  processedFileId: number | null;
  createdAt: Date;
  media?: DbProductMedia[];
};

function dbMediaToMedia(m: DbProductMedia): ProductMedia {
  return {
    id: m.id,
    product_id: m.productId,
    path: m.path,
    mime_type: m.mimeType,
    kind: (m.kind === "image" || m.kind === "video" ? m.kind : null) as ProductMedia["kind"],
    order: m.order,
    created_at: m.createdAt.toISOString(),
  };
}

function rowToBaseProduct(row: DbProductRow): Omit<Product, "media"> & { media?: ProductMedia[] } {
  const base: Product = {
    id: row.id,
    processed_file_id: row.processedFileId,
    product_status_id: row.productStatusId,
    product_sub_status_id: row.productSubStatusId ?? null,
    product_type_id: row.productTypeId,
    category_id: row.categoryId,
    created_at: row.createdAt.toISOString(),
    media: row.media?.map(dbMediaToMedia),
  };
  return base;
}

function mergeFieldValues(base: Record<string, unknown>, fieldValues: Record<string, unknown>): Product {
  return { ...base, ...fieldValues } as Product;
}

const BASE_PRODUCT_KEYS = new Set([
  "id",
  "processed_file_id",
  "product_status_id",
  "product_sub_status_id",
  "product_type_id",
  "category_id",
  "created_at",
  "media",
]);

type BaseProductInput = {
  processedFileId?: number | null;
  productStatusId?: string | null;
  productSubStatusId?: string | null;
  productTypeId?: string | null;
  categoryId?: string | null;
};

function extractBaseAndFieldValues(data: Record<string, unknown>): {
  base: BaseProductInput;
  fieldValues: Record<string, unknown>;
} {
  const base: Record<string, unknown> = {};
  const fieldValues: Record<string, unknown> = {};
  const snakeToCamel: Record<string, string> = {
    processed_file_id: "processedFileId",
    product_status_id: "productStatusId",
    product_sub_status_id: "productSubStatusId",
    product_type_id: "productTypeId",
    category_id: "categoryId",
  };
  for (const [key, value] of Object.entries(data)) {
    if (BASE_PRODUCT_KEYS.has(key)) {
      const camel = snakeToCamel[key] ?? key;
      if (key === "processed_file_id") base[camel] = value as number | null;
      else if (key === "media") continue;
      else base[camel] = value;
    } else {
      fieldValues[key] = value;
    }
  }
  return { base: base as BaseProductInput, fieldValues };
}

const BASE_FILTER_KEYS = new Set(["product_status_id", "productStatusId", "product_type_id", "productTypeId"]);

function buildWhere(
  filter: ProductFilterState,
  categoryId?: string,
  search?: string,
  searchableFieldCodes?: string[],
  accountingGroupId?: string,
  resolvedGroupFilter?: Prisma.ProductWhereInput | null
): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [];

  if (resolvedGroupFilter) {
    and.push(resolvedGroupFilter);
  } else if (accountingGroupId?.trim()) {
    const gid = accountingGroupId.trim();
    and.push({
      OR: [
        { productStatusRef: { accountingGroupId: gid } },
        { productSubStatusRef: { accountingGroupId: gid } },
      ],
    });
  }

  if (categoryId?.trim()) {
    const catId = categoryId.trim();
    and.push({
      OR: [
        { productTypeRef: { categoryId: catId } },
        { categoryId: catId },
      ],
    });
  }

  const productStatusId = filter.product_status_id ?? filter.productStatusId;
  const productTypeId = filter.product_type_id ?? filter.productTypeId;
  if (productStatusId?.trim()) and.push({ productStatusId: productStatusId.trim() });
  if (productTypeId?.trim()) and.push({ productTypeId: productTypeId.trim() });

  if (search?.trim() && searchableFieldCodes?.length) {
    const q = search.trim();
    const codes = searchableFieldCodes.filter(Boolean);
    if (codes.length > 0) {
      and.push({
        fieldValues: {
          some: {
            fieldDefinition: { code: { in: codes } },
            textValue: { contains: q, mode: "insensitive" },
          },
        },
      });
    }
  }

  for (const [key, value] of Object.entries(filter)) {
    const v = String(value ?? "").trim();
    if (!v) continue;
    if (BASE_FILTER_KEYS.has(key)) continue;

    const isFrom = key.endsWith("_from");
    const isTo = key.endsWith("_to");
    const code = isFrom ? key.slice(0, -5) : isTo ? key.slice(0, -3) : key;

    if (isFrom) {
      const num = parseFloat(v);
      if (!Number.isNaN(num)) {
        and.push({
          fieldValues: {
            some: {
              fieldDefinition: { code },
              numericValue: { gte: num },
            },
          },
        });
      }
    } else if (isTo) {
      const num = parseFloat(v);
      if (!Number.isNaN(num)) {
        and.push({
          fieldValues: {
            some: {
              fieldDefinition: { code },
              numericValue: { lte: num },
            },
          },
        });
      }
    } else {
      and.push({
        fieldValues: {
          some: {
            fieldDefinition: { code },
            textValue: { contains: v, mode: "insensitive" },
          },
        },
      });
    }
  }

  if (and.length === 0) return {};
  return { AND: and };
}

function getOrderBy(sortKey: ProductColumnId | null, sortDir: "asc" | "desc"): Prisma.ProductOrderByWithRelationInput {
  const valid: ProductColumnId[] = ["created_at", "id"];
  const key = sortKey && valid.includes(sortKey) ? sortKey : "created_at";
  const camel = key === "created_at" ? "createdAt" : key;
  return { [camel]: sortDir };
}

export type ListProductsParams = {
  search?: string;
  filter?: ProductFilterState;
  sortKey?: ProductColumnId | null;
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
  categoryId?: string;
  searchableFieldCodes?: string[];
  /** Фільтр по обліковій групі (головний або підстатус у цій групі). */
  accountingGroupId?: string;
};

export type ListProductsResult = {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
};

export async function listProducts(params: ListProductsParams): Promise<ListProductsResult> {
  const {
    search = "",
    filter = {},
    sortKey = "created_at",
    sortDir = "desc",
    page = 1,
    pageSize = 500,
    categoryId = undefined,
    searchableFieldCodes = undefined,
    accountingGroupId = undefined,
  } = params;

  // Resolve accounting group filter: for non-default range-based groups, filter by status order range
  let resolvedGroupFilter: Prisma.ProductWhereInput | null = null;
  if (accountingGroupId?.trim()) {
    const grp = await prisma.accountingGroup.findUnique({
      where: { id: accountingGroupId.trim() },
      select: { isDefault: true, categoryId: true, startStatusId: true, endStatusId: true },
    });
    if (grp && !grp.isDefault && grp.startStatusId && grp.endStatusId) {
      const defaultGrp = await prisma.accountingGroup.findFirst({
        where: { categoryId: grp.categoryId, parentStatusId: null, isDefault: true },
        select: { id: true },
      });
      if (defaultGrp) {
        const [s, e] = await Promise.all([
          prisma.productStatus.findUnique({ where: { id: grp.startStatusId }, select: { order: true } }),
          prisma.productStatus.findUnique({ where: { id: grp.endStatusId }, select: { order: true } }),
        ]);
        if (s && e) {
          resolvedGroupFilter = {
            OR: [
              { productStatusRef: { accountingGroupId: defaultGrp.id, order: { gte: s.order, lte: e.order } } },
              { productSubStatusRef: { accountingGroupId: defaultGrp.id, order: { gte: s.order, lte: e.order } } },
            ],
          };
        }
      }
    }
  }

  const where = buildWhere(filter, categoryId, search, searchableFieldCodes, accountingGroupId, resolvedGroupFilter);
  const orderBy = getOrderBy(sortKey ?? null, sortDir);

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        media: { orderBy: { order: "asc" } },
        fieldValues: { include: { fieldDefinition: { select: { id: true, code: true, dataType: true } } } },
      },
    }),
    prisma.product.count({ where }),
  ]);

  const products: Product[] = [];
  for (const row of items) {
  const baseObj = rowToBaseProduct(row as DbProductRow);
  const base = baseObj as Record<string, unknown>;
  const fv: Record<string, unknown> = {};
  for (const v of row.fieldValues ?? []) {
      const fd = v.fieldDefinition;
      const key = fd.code ?? fd.id;
      const dt = fd.dataType ?? "string";
      let val: unknown;
      if (dt === "integer" || dt === "float") val = v.numericValue;
      else if (dt === "date" || dt === "datetime") val = v.dateValue?.toISOString() ?? null;
      else val = v.textValue ?? null;
      if (val !== null && val !== undefined && (typeof val !== "string" || val !== "")) {
        if (typeof val === "string" && val.trim()) {
          const t = val.trim();
          if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
            try {
              val = JSON.parse(t) as unknown;
            } catch {
              // leave as string
            }
          }
        }
        fv[key] = val;
      }
    }
    products.push(mergeFieldValues(base, fv));
  }

  return { items: products, total, page, pageSize };
}

export async function getProductById(id: number): Promise<Product | null> {
  const row = await prisma.product.findUnique({
    where: { id },
    include: {
      media: { orderBy: { order: "asc" } },
      fieldValues: { include: { fieldDefinition: { select: { id: true, code: true, dataType: true } } } },
    },
  });
  if (!row) return null;
  const base = rowToBaseProduct(row as DbProductRow);
  const fv = await loadProductFieldValues(id);
  return mergeFieldValues(base, fv);
}

export type CreateProductInput = Omit<Product, "id" | "created_at">;

export async function createProduct(data: CreateProductInput): Promise<Product> {
  const { base, fieldValues } = extractBaseAndFieldValues(data as Record<string, unknown>);
  const categoryId = (base.categoryId ?? data.category_id) as string | undefined;
  if (!categoryId?.trim()) {
    throw new Error("category_id обов'язковий для створення товару");
  }
  const initialSub =
    base.productStatusId != null
      ? await getSyncedSubStatusIdForMainStatus(base.productStatusId)
      : base.productSubStatusId ?? null;

  const row = await prisma.product.create({
    data: {
      processedFileId: base.processedFileId ?? undefined,
      productStatusId: base.productStatusId ?? undefined,
      productSubStatusId: initialSub ?? undefined,
      productTypeId: base.productTypeId ?? undefined,
      categoryId: base.categoryId ?? undefined,
    },
    include: {
      media: { orderBy: { order: "asc" } },
    },
  });
  const defs = await getFieldDefinitionsForCategory(categoryId.trim());
  if (Object.keys(fieldValues).length > 0) {
    await upsertProductFieldValues(row.id, fieldValues, defs);
  }
  const loaded = await loadProductFieldValues(row.id);
  const baseProduct = rowToBaseProduct(row as DbProductRow);
  return mergeFieldValues(baseProduct, loaded);
}

export async function updateProduct(
  id: number,
  data: Partial<Omit<Product, "id">>
): Promise<Product | null> {
  const { base, fieldValues } = extractBaseAndFieldValues(data as Record<string, unknown>);

  const current = await prisma.product.findUnique({
    where: { id },
    select: { productStatusId: true, productSubStatusId: true },
  });
  if (!current) return null;

  const oldMain = current.productStatusId ?? null;
  const newMainRequested = base.productStatusId;
  const mainIsChanging =
    newMainRequested !== undefined && (newMainRequested ?? null) !== oldMain;

  if (mainIsChanging) {
    await assertMayLeaveMainStatus(oldMain, newMainRequested ?? null, current.productSubStatusId ?? null);
  }

  const updateData: Prisma.ProductUncheckedUpdateInput = {};
  if (base.processedFileId !== undefined) updateData.processedFileId = base.processedFileId;
  if (base.productTypeId !== undefined) updateData.productTypeId = base.productTypeId;
  if (base.categoryId !== undefined) updateData.categoryId = base.categoryId;

  if (newMainRequested !== undefined) {
    updateData.productStatusId = newMainRequested;
  }

  if (mainIsChanging) {
    updateData.productSubStatusId = await getSyncedSubStatusIdForMainStatus(newMainRequested ?? null);
  } else if (base.productSubStatusId !== undefined) {
    updateData.productSubStatusId = base.productSubStatusId;
  }

  try {
    const row = await prisma.product.update({
      where: { id },
      data: updateData,
      include: { media: { orderBy: { order: "asc" } } },
    });
    if (Object.keys(fieldValues).length > 0) {
      const categoryId = (row.categoryId ?? base.categoryId) as string | undefined;
      if (categoryId?.trim()) {
        const defs = await getFieldDefinitionsForCategory(categoryId.trim());
        await upsertProductFieldValues(id, fieldValues, defs);
      }
    }
    const loaded = await loadProductFieldValues(id);
    const baseProduct = rowToBaseProduct(row as DbProductRow);
    return mergeFieldValues(baseProduct, loaded);
  } catch {
    return null;
  }
}

export async function deleteProduct(id: number): Promise<boolean> {
  try {
    await prisma.product.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}

async function getNextMediaOrder(productId: number): Promise<number> {
  const last = await prisma.productMedia.findFirst({
    where: { productId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  return (last?.order ?? -1) + 1;
}

export async function createProductMedia(
  productId: number,
  data: { path: string; mimeType: string | null; kind: "image" | "video" }
): Promise<ProductMedia> {
  const row = await prisma.productMedia.create({
    data: {
      productId,
      path: data.path,
      mimeType: data.mimeType,
      kind: data.kind,
      order: await getNextMediaOrder(productId),
    },
  });
  return dbMediaToMedia(row as DbProductMedia);
}

export async function deleteProductMediaById(
  productId: number,
  mediaId: number
): Promise<{ path: string } | null> {
  const row = await prisma.productMedia.findFirst({
    where: { id: mediaId, productId },
  });
  if (!row) return null;
  await prisma.productMedia.delete({ where: { id: mediaId } });
  return { path: row.path };
}
