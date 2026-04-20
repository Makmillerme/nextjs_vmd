/**
 * Data migration: convert existing accounting groups to funnel model.
 * For each category:
 *  1. Pick the first root group (by order) as isDefault=true
 *  2. Move all statuses from other root groups into the default group
 *  3. Set startStatusId/endStatusId on non-default groups based on original statuses
 *
 * Run: npx tsx prisma/seed-funnel-migration.ts
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

function createClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (url.startsWith("prisma+postgres")) {
    return new PrismaClient({ accelerateUrl: url });
  }
  const pool = new Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

const prisma = createClient();

async function main() {
  const categories = await prisma.category.findMany({ select: { id: true, name: true } });
  console.log(`Found ${categories.length} categories`);

  for (const cat of categories) {
    const rootGroups = await prisma.accountingGroup.findMany({
      where: { categoryId: cat.id, parentStatusId: null },
      include: { statuses: { orderBy: { order: "asc" } } },
      orderBy: { order: "asc" },
    });

    if (rootGroups.length === 0) {
      console.log(`  [${cat.name}] No root groups, creating default`);
      await prisma.accountingGroup.create({
        data: {
          categoryId: cat.id,
          name: "Усі позиції",
          isDefault: true,
          order: 0,
        },
      });
      continue;
    }

    if (rootGroups.length === 1) {
      console.log(`  [${cat.name}] Single root group "${rootGroups[0].name}" -> isDefault=true`);
      await prisma.accountingGroup.update({
        where: { id: rootGroups[0].id },
        data: { isDefault: true },
      });
      continue;
    }

    // Multiple root groups: consolidate into first one
    const defaultGroup = rootGroups[0];
    console.log(`  [${cat.name}] ${rootGroups.length} root groups; default="${defaultGroup.name}"`);

    await prisma.accountingGroup.update({
      where: { id: defaultGroup.id },
      data: { isDefault: true },
    });

    let nextOrder = (defaultGroup.statuses.at(-1)?.order ?? -1) + 1;

    for (let i = 1; i < rootGroups.length; i++) {
      const g = rootGroups[i];
      if (g.statuses.length === 0) {
        console.log(`    Group "${g.name}" has no statuses, skip range`);
        continue;
      }

      const firstStatusNewOrder = nextOrder;

      for (const s of g.statuses) {
        await prisma.productStatus.update({
          where: { id: s.id },
          data: { accountingGroupId: defaultGroup.id, order: nextOrder++ },
        });
      }

      const lastStatusNewOrder = nextOrder - 1;

      // Re-read moved statuses to get IDs at boundaries
      const movedStatuses = await prisma.productStatus.findMany({
        where: {
          accountingGroupId: defaultGroup.id,
          order: { gte: firstStatusNewOrder, lte: lastStatusNewOrder },
        },
        orderBy: { order: "asc" },
      });

      if (movedStatuses.length > 0) {
        await prisma.accountingGroup.update({
          where: { id: g.id },
          data: {
            startStatusId: movedStatuses[0].id,
            endStatusId: movedStatuses[movedStatuses.length - 1].id,
          },
        });
        console.log(
          `    Group "${g.name}" -> range [${movedStatuses[0].name}..${movedStatuses[movedStatuses.length - 1].name}]`
        );
      }
    }
  }

  console.log("Migration complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
