-- Accounting groups + product_statuses.accounting_group_id (align DB with schema.prisma)
-- Ідемпотентні кроки: безпечно для БД після лише migrate, або часткового db push.

-- 1) Таблиця accounting_groups
CREATE TABLE IF NOT EXISTS "accounting_groups" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "parent_status_id" TEXT,
    "next_group_id" TEXT,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "accounting_groups_pkey" PRIMARY KEY ("id")
);

-- Доповнення колонок, якщо таблиця була створена неповно
ALTER TABLE "accounting_groups" ADD COLUMN IF NOT EXISTS "parent_status_id" TEXT;
ALTER TABLE "accounting_groups" ADD COLUMN IF NOT EXISTS "next_group_id" TEXT;
ALTER TABLE "accounting_groups" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "accounting_groups" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "accounting_groups" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

-- 2) product_statuses — поля з поточної схеми
ALTER TABLE "product_statuses" ADD COLUMN IF NOT EXISTS "accounting_group_id" TEXT;
ALTER TABLE "product_statuses" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "product_statuses" ADD COLUMN IF NOT EXISTS "has_sub_statuses" BOOLEAN NOT NULL DEFAULT false;

-- 3) products — підстатус (якщо був лише db push)
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "product_sub_status_id" TEXT;

-- 4) Індекси
CREATE UNIQUE INDEX IF NOT EXISTS "accounting_groups_next_group_id_key" ON "accounting_groups"("next_group_id");
CREATE INDEX IF NOT EXISTS "accounting_groups_category_id_idx" ON "accounting_groups"("category_id");
CREATE INDEX IF NOT EXISTS "accounting_groups_parent_status_id_idx" ON "accounting_groups"("parent_status_id");
CREATE INDEX IF NOT EXISTS "accounting_groups_category_id_parent_status_id_idx" ON "accounting_groups"("category_id", "parent_status_id");
CREATE INDEX IF NOT EXISTS "product_statuses_accounting_group_id_idx" ON "product_statuses"("accounting_group_id");
CREATE INDEX IF NOT EXISTS "products_product_sub_status_id_idx" ON "products"("product_sub_status_id");

-- 5) Дефолтні глобальні групи по категоріях (якщо ще немає)
INSERT INTO "accounting_groups" ("id", "category_id", "name", "order", "created_at", "updated_at", "parent_status_id")
SELECT
    'ag_default_' || c."id",
    c."id",
    'Default',
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    NULL
FROM "categories" c
WHERE NOT EXISTS (
    SELECT 1 FROM "accounting_groups" ag
    WHERE ag."category_id" = c."id" AND ag."parent_status_id" IS NULL
);

-- Фолбек: хоча б одна група, якщо категорії є, а груп — ні
INSERT INTO "accounting_groups" ("id", "category_id", "name", "order", "created_at", "updated_at", "parent_status_id")
SELECT
    'ag_fallback_first_cat',
    (SELECT "id" FROM "categories" ORDER BY "order" ASC, "id" ASC LIMIT 1),
    'Default',
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    NULL
WHERE NOT EXISTS (SELECT 1 FROM "accounting_groups" LIMIT 1)
  AND EXISTS (SELECT 1 FROM "categories" LIMIT 1);

-- 6) Бекфіл accounting_group_id (EXECUTE — інакше Postgres парсить ps.category_id / ps.parent_id, яких уже немає)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'product_statuses' AND column_name = 'category_id'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'product_statuses' AND column_name = 'parent_id'
    ) THEN
        EXECUTE $sql$
            UPDATE "product_statuses" ps
            SET "accounting_group_id" = (
                SELECT ag."id" FROM "accounting_groups" ag
                WHERE ag."parent_status_id" IS NULL AND ag."category_id" = ps."category_id"
                ORDER BY ag."order" ASC, ag."id" ASC LIMIT 1
            )
            WHERE ps."accounting_group_id" IS NULL
              AND ps."category_id" IS NOT NULL
              AND ps."parent_id" IS NULL
        $sql$;
    ELSIF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'product_statuses' AND column_name = 'category_id'
    ) THEN
        EXECUTE $sql$
            UPDATE "product_statuses" ps
            SET "accounting_group_id" = (
                SELECT ag."id" FROM "accounting_groups" ag
                WHERE ag."parent_status_id" IS NULL AND ag."category_id" = ps."category_id"
                ORDER BY ag."order" ASC, ag."id" ASC LIMIT 1
            )
            WHERE ps."accounting_group_id" IS NULL AND ps."category_id" IS NOT NULL
        $sql$;
    ELSIF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'product_statuses' AND column_name = 'parent_id'
    ) THEN
        EXECUTE $sql$
            UPDATE "product_statuses" ps
            SET "accounting_group_id" = (
                SELECT ag."id" FROM "accounting_groups" ag
                WHERE ag."parent_status_id" IS NULL
                ORDER BY ag."order" ASC, ag."id" ASC LIMIT 1
            )
            WHERE ps."accounting_group_id" IS NULL AND ps."parent_id" IS NULL
        $sql$;
    ELSE
        EXECUTE $sql$
            UPDATE "product_statuses" ps
            SET "accounting_group_id" = (
                SELECT ag."id" FROM "accounting_groups" ag
                WHERE ag."parent_status_id" IS NULL
                ORDER BY ag."order" ASC, ag."id" ASC LIMIT 1
            )
            WHERE ps."accounting_group_id" IS NULL
        $sql$;
    END IF;
END $$;

-- Підстатуси (MVP parent_id): category з облікової групи батька (без колонки category_id на статусі)
DO $$
DECLARE
    r RECORD;
    new_group_id TEXT;
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'product_statuses' AND column_name = 'parent_id'
    ) THEN
        FOR r IN
            SELECT DISTINCT ON (ps."parent_id")
                ps."parent_id" AS pid,
                agp."category_id" AS cat_id,
                p."name" AS pname
            FROM "product_statuses" ps
            INNER JOIN "product_statuses" p ON p."id" = ps."parent_id"
            INNER JOIN "accounting_groups" agp ON agp."id" = p."accounting_group_id"
            WHERE ps."parent_id" IS NOT NULL
            ORDER BY ps."parent_id"
        LOOP
            new_group_id := 'ag_sat_' || r.pid;
            IF NOT EXISTS (SELECT 1 FROM "accounting_groups" WHERE "id" = new_group_id) THEN
                INSERT INTO "accounting_groups" ("id", "category_id", "parent_status_id", "name", "order", "created_at", "updated_at")
                VALUES (new_group_id, r.cat_id, r.pid, COALESCE(r.pname, 'Satellite'), 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
            END IF;
            UPDATE "product_statuses" SET "accounting_group_id" = new_group_id WHERE "parent_id" = r.pid;
            UPDATE "product_statuses" SET "has_sub_statuses" = true WHERE "id" = r.pid;
        END LOOP;
    END IF;
END $$;

-- Будь-які інші NULL — перша глобальна група
UPDATE "product_statuses" ps
SET "accounting_group_id" = (
    SELECT ag."id" FROM "accounting_groups" ag
    WHERE ag."parent_status_id" IS NULL
    ORDER BY ag."order" ASC, ag."id" ASC
    LIMIT 1
)
WHERE ps."accounting_group_id" IS NULL;

-- 7) NOT NULL після бекфілу
ALTER TABLE "product_statuses" ALTER COLUMN "accounting_group_id" SET NOT NULL;

-- 8) Foreign keys (лише якщо ще немає)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounting_groups_category_id_fkey') THEN
        ALTER TABLE "accounting_groups" ADD CONSTRAINT "accounting_groups_category_id_fkey"
            FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounting_groups_parent_status_id_fkey') THEN
        ALTER TABLE "accounting_groups" ADD CONSTRAINT "accounting_groups_parent_status_id_fkey"
            FOREIGN KEY ("parent_status_id") REFERENCES "product_statuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounting_groups_next_group_id_fkey') THEN
        ALTER TABLE "accounting_groups" ADD CONSTRAINT "accounting_groups_next_group_id_fkey"
            FOREIGN KEY ("next_group_id") REFERENCES "accounting_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_statuses_accounting_group_id_fkey') THEN
        ALTER TABLE "product_statuses" ADD CONSTRAINT "product_statuses_accounting_group_id_fkey"
            FOREIGN KEY ("accounting_group_id") REFERENCES "accounting_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_product_sub_status_id_fkey') THEN
        ALTER TABLE "products" ADD CONSTRAINT "products_product_sub_status_id_fkey"
            FOREIGN KEY ("product_sub_status_id") REFERENCES "product_statuses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- 9) Прибрати застарілі колонки MVP (якщо лишились після db push)
ALTER TABLE "product_statuses" DROP COLUMN IF EXISTS "category_id";
ALTER TABLE "product_statuses" DROP COLUMN IF EXISTS "parent_id";
ALTER TABLE "product_statuses" DROP COLUMN IF EXISTS "group_name";
