/**
 * Оновлення описів карток Trello з коректним UTF-8 (обійти баг PowerShell з кодуванням).
 * Запуск: node scripts/trello-update-card-descriptions.mjs
 * Ключі: з ~/.cursor/mcp.json → mcpServers.trello.env (TRELLO_API_KEY, TRELLO_TOKEN)
 */
import fs from "fs";
import path from "path";

const BOARD_SHORT = "uKqTe9aD";

function loadCredentials() {
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const mp = path.join(home, ".cursor", "mcp.json");
  const raw = fs.readFileSync(mp, "utf8");
  const j = JSON.parse(raw);
  const env = j.mcpServers?.trello?.env;
  if (!env?.TRELLO_API_KEY || !env?.TRELLO_TOKEN) {
    throw new Error("Trello: немає TRELLO_API_KEY / TRELLO_TOKEN у ~/.cursor/mcp.json");
  }
  return { key: env.TRELLO_API_KEY, token: env.TRELLO_TOKEN };
}

async function trelloFetch(relPath, { method = "GET", bodyParams = null } = {}) {
  const { key, token } = loadCredentials();
  const q = new URLSearchParams({ key, token });
  const url =
    method === "GET"
      ? `https://api.trello.com/1${relPath}?${q}`
      : `https://api.trello.com/1${relPath}?${q}`;

  const opts = { method };
  if (bodyParams && method !== "GET") {
    opts.headers = { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" };
    opts.body = bodyParams.toString();
  }

  const res = await fetch(url, opts);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${method} ${relPath} ${res.status}: ${t}`);
  }
  if (res.status === 204) return null;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

/** Описи за id (де назви дублюються в різних списках). */
const DESCRIPTION_BY_ID = {
  /** Про проєкт → Адмінка: модель даних — концепція */
  "69c68378687270cf43440e3a": `Розділ «Управління → Модель даних»: конфігурація домену без зміни коду.

Що налаштовується
• Категорії дерева, типи товарів, прив’язки полів до типів і категорій.
• Визначення полів (тип даних, віджет, валідація, пресети, композитні підполя).
• Таби картки та розміщення полів (TabField), опція «розтягнути в ряд» (stretchInRow).
• Статуси товару, порядок і колір; системні таби (наприклад golovna).

Робота з кешем
• Управління: staleTime ~5 хв (MANAGEMENT_STALE_MS), пріоритет кешу.
• Стан останнього підтабу та категорії превʼю — localStorage (management-state.ts).

Для команди: це «CMS метаданих» поверх PostgreSQL/Prisma.`,

  /** Компоненти → Адмінка: модель даних — код */
  "69c6828c9c4438a02abd6a17": `Код адмінки моделі даних (не плутати з продуктовими формами каталогу).

Ключові шляхи
• src/features/management/components/products-config/ — основні підкомпоненти.
• data-model-page.tsx — таби розділу, синхронізація з URL (nuqs) і localStorage.
• API: префікс /api/admin/ (categories, product-types, field-definitions, tabs, statuses).

Взаємодія
• TanStack Query + ключі з query-keys; мутації через admin-клієнт (lib/api/admin).

Для інженера/BA: зміни в цих екранах впливають на те, що зберігається в БД як метадані, а не на самі записи товарів (хоча можуть вимагати міграцій).`,
};

/** Решта карток — за точною назвою. */
const DESCRIPTION_BY_NAME = {
  "Що це за продукт": `Внутрішній веб-додаток ProductERP (репозиторій GitHub Makmillerme/ProductERP, локально папка nextjs_vmd).

Призначення
• Облік і редагування товарів із гнучкою моделлю: категорії, типи, довільні поля, таби на картці, статуси.
• Каталог, детальна картка товару (sheet), завантаження медіа та документів по папках.

Технічна суть
• Дані полів товару в EAV-моделі (ProductFieldValue), а не окремі колонки на кожне поле.

Ролі: команди, яким потрібна єдина система обліку асортименту та документів без жорстко зашитої схеми в коді.`,

  "Навіщо і хто користувачі": `Мета
• Централізувати інформацію про продукти, вкладені документи та медіа.
• Зменшити розсинхрон між таблицями Excel/файлами та операційними процесами.

Доступ і відображення
• Ролі та набір дозволів (permissions) визначають, хто що бачить у системі.
• DisplayConfig дозволяє налаштовувати відображення списків і картки (у межах реалізованої моделі).

Основні екрани для користувача
• Головна, каталог за категоріями, розділ управління (модель, відображення, інтеграції, користувачі).
• Канбан (демо/робочий екран у застосунку), налаштування профілю.
• У шапці — актуальні курси валют з публічного API Goverla (індикатив для команди).

Аудиторія: інженер, аналітик і розробник як внутрішні користувачі; зовнішні клієнти — лише якщо пізніше розширите доступ.`,

  "Стек і інструменти": `Фронт і мова
• Next.js 15 (App Router), React 19, TypeScript strict, Tailwind CSS v4, компоненти shadcn/ui, Lucide.

Дані та стан
• Prisma + PostgreSQL; Better-Auth для сесій/облікових записів.
• TanStack Query v5 з персистом у localStorage для стійкості UI; nuqs для стану в URL; Zustand за потреби локального UI-стану.

Інфраструктура розробки
• Node >= 20.19.0; перед dev/build — npm run generate:locales (синхронізація JSON локалей у згенеровані TS).
• Додатково: date-fns, sonner (тости).

Підхід: один монолітний Next-застосунок з серверними маршрутами API, без окремого BFF для цієї частини.`,

  "Дані та EAV": `Доменні сутності (узагальнено)
• Product — кількісний ідентифікатор товару, прив’язки до типу, категорії, статусу.
• ProductType, Category, ProductStatus — довідники структури та життєвого циклу.
• ProductMedia, ProductDocument — файли та зображення з прив’язкою до товару.
• FieldDefinition, таби (TabDefinition), зв’язки поля з табом (TabField), пресети та типи віджетів.
• ProductFieldValue — фактичні значення поля (текст, число, дата) у стилі EAV.

Переваги EAV для BA/інженера
• Нові поля додаються конфігурацією, а не завжди міграцією «одна колонка на поле».

Обмеження
• Складні звіти та масові вибірки можуть потребувати індексів і узгодженості найменувань полів.

Конфіг документів: src/config/product-documents.ts (папки типу імпорт/логістика тощо). Системний таб — golovna.`,

  "Маршрути й зони UI": `Публічні застосункові маршрути
• / — головна
• /catalog, /catalog/[categoryId] — каталог
• /login — вхід
• /settings — налаштування
• /management, /management/data-model, /display, /api-integrations, /automations, /users — адміністрування

Конфіг навігації: src/config/navigation.ts (NAV_MAIN, динамічні категорії).

Функціональні модулі (src/features)
• products — список і картка товару, віджети полів
• management — адмінка моделі, користувачі, ролі, відображення, інтеграції
• currency, home, kanban, settings — допоміжні екрани

Рекомендація: при зміні маршруту оновлювати navigation.ts і права доступу в permissions.ts узгоджено.`,

  "API (огляд)": `Застосунок (приклади)
• GET/POST /api/products; CRUD /api/products/[id]; медіа та документи під шляхом продукту.
• GET /api/product-config/... — конфігурація табів/полів для UI.
• GET /api/categories, /api/statuses — довідники для списків.
• /api/auth/* — Better-Auth; /api/me — поточний користувач; /api/currency/goverla — курси.

Адміністративні маршрути /api/admin/*
• Категорії, типи продуктів, визначення полів, таби, статуси, display-config, користувачі, owner transfer тощо.
• Вбудований парсер Python з репозиторію прибрано: інтеграції — окремо (див. розділ інтеграцій).

Детальний перелік і нюанси: пам’ятка Serena nextjs_vmd-api-db-routes.

Для розробника: зміни контракту API супроводжуйте оновленням типів на клієнті та Prisma-схеми.`,

  "Що вже зроблено (рівень продукту)": `Домен і архітектура
• Повний перехід від «vehicle» до Product/ProductType; дані полів у EAV (ProductFieldValue).
• Міграції Prisma під нову модель; парсер/legacy поля pdf прибрані з коду та схеми.

Інтерфейс і техборг
• Уніфікована пагінація (TablePaginationBar), діалог підтвердження ризикових дій (ConfirmDestructiveDialog).
• Admin API-клієнт (lib/api/admin), спільні стани завантаження/порожнього списку для таблиць управління.
• Пілот react-hook-form + Zod на формах типів і статусів; shadcn Form.

Дані в UI
• Модернізація query keys, інвалідація display-кешів, оптимістичні оновлення для табів (див. perf/data-fetching-modernization-implemented).
• Поле TabField.stretchInRow і сегменти сітки на картці товару.

Орієнтир для BA: більша частина «зручності адмінки» вже в коді; нові вимоги краще оцінювати через наявні патерни.`,

  "Куди далі (напрями)": `Короткострокові напрями
• Розширити RHF+Zod на інші важкі форми в management.
• Розбити дуже великі файли (наприклад products-page, field-definitions-management) на підкомпоненти та хуки.

Опційно
• TanStack Table — лише якщо знадобляться сортування/колонки/ресайз на рівні таблиці без ручного map; інакше залишити поточній підхід.

Продукт
• Сторінки Automations та API integrations — точка розширення для зовнішніх систем; конкретні сценарії фіксувати окремими епіками після пріоритизації.

Не роздувати scope: кожен напрям — окрема картка в Беклозі/Плані з критерієм готовності.`,

  "Відкладені ідеї в репозиторії": `Джерело істини для відкладених рішень у коді
• Файл nextjs_vmd/docs/backlog/ideas.md — формат: дата, суть, статус.

Репозиторій
• https://github.com/Makmillerme/ProductERP

Процес
• Обговорення «на потім» → короткий запис у ideas.md + за потреби картка в Trello Беклог.
• Після реалізації — оновити статус у markdown або винести в розділ «зроблено», щоб не плутати команду.

Роль сіньйора: раз на спринт проглядати ideas.md і синхронізувати з Trello.`,

  "Синхронізація Trello ↔ Serena": `Коли оновлювати
• Після завершення помітного етапу (новий модуль API, зміна домену, велика перебудова UI).

Дії
• У Trello: картки «Що вже зроблено», за потреби «API (огляд)» і «Куди далі».
• У Serena: write_memory для nextjs_vmd-current-state-2025-03; при зміні API — nextjs_vmd-api-db-routes; при зміні структури проєкту — nextjs_vmd-project-context / stack.

Пам’ятка в Serena: workflow/trello-board-serena-sync.

Ціль: щоб AI і люди в чаті бачили один узгоджений знімок системи без ручного копіювання з досі відкритих файлів.`,

  "Лейаут і shell": `Призначення: оболонка застосунку й навігація між розділами.

Файли
• src/components/layout/: app-header, app-sidebar, providers, auth-modal, catalog-nav-item, content-skeleton.

Покриття
• Підключення глобальних провайдерів (TanStack Query з персистом, локаль, тема).
• Модальне вікно входу, пункти меню, скелетон завантаження контенту.

Для розробника: зміни тут зачіпають увесь застосунок — перевіряйте SSR, гідратацію та марш middleware.`,

  "Спільні таблиці та форми": `Компоненти рівня застосунку (не primitives shadcn).

Приклади
• table-pagination-bar, table-with-pagination — узгоджена пагінація.
• confirm-destructive-dialog — підтвердження небезпечних дій.
• management-list-states — завантаження / порожній стан таблиці.
• mgmt-table-colgroup — узгодження ширин колонок.
• sheet-form-layout, overlay-portal-container — контейнери для форм і порталів.

Ціль: один патерн для адмін-таблиць і форм, менше копіпасти й роз’їзду UX.`,

  "UI-kit (shadcn)": `Бібліотека примітивів у src/components/ui/.

Типові елементи
• Кнопки, діалоги, sheet, input/select/textarea, table, tabs, sidebar, calendar, form (обгортки RHF), popover, dropdown тощо.

Політика проєкту
• «Shadcn first» — не винаходити власні примітиви там, де є radix+shadcn.

Оновлення: через CLI shadcn; кастомізація через className і tailwind-merge.`,

  "Каталог і картка товару": `Модуль src/features/products/.

Функціонал
• Список товарів (фільтри, сортування, пагінація, URL-стан через nuqs).
• Product detail sheet: динамічні поля, вкладки, медіа, документи.
• Віджети полів (текст, число, дата, вибір, мультивибір, радіо, калькулятор тощо).
• Допоміжні модулі: grid-layout, field-utils, product-card-grid-segments (групи stretch).

Дані
• EAV через product-field-values та products-db на сервері.

Для BA: нова вимога по картці товару майже завжди проходить через FieldDefinition + віджет, а не через нову колонку в products.`,

  "Адмінка: користувачі й ролі": `Управління доступом і складом команди.

Зона коду
• users-management, roles-management під src/features/management/.

Можливості (узагальнено)
• Перегляд користувачів, ролей, призначення ролі, блокування (ban), видалення, детальний sheet.

Інтеграція
• API /api/admin/users, /api/roles, Better-Auth user store.

Увага: зміни ролей впливають на permissions і DisplayConfig — тестуйте сценарій «користувач без права X».`,

  "Адмінка: відображення та інтеграції": `Налаштування того, як користувач бачить дані й майбутні інтеграції.

Компоненти
• display-page, display-settings-management, product-card-preview-modal.
• api-integrations-page та підпапка api-integrations.
• automations-page — зараз точка входу для розвитку сценаріїв.

API
• /api/admin/display-config та суміжні адмін-маршрути.

Для інженера: узгоджуйте зміни з query-keys і invalidate-display-caches, щоб превʼю та списки не показували застарілі дані.`,

  "Інші екрани": `Додаткові розділи застосунку.

• home — головна панель.
• kanban — дошка в застосунку (не плутати з Trello).
• settings — користувацькі налаштування.
• currency — віджет курсу у шапці (Goverla).

Розширення: додавати як окремі feature-модулі під src/features з мінімальним перетином з products/management.`,

  "API і дані": `Серверна частина та доступ до БД.

Шляхи
• src/app/api/** — маршрути Next.js (REST-подібні handler-и).
• src/lib/prisma.ts, products-db.ts, product-field-values.ts — основна робота з даними товарів.
• Prisma schema та migrations — єдине джерело схеми БД.

Auth
• Better-Auth: маршрути під /api/auth.

Рекомендація: критичні зміни супроводжувати тестом міграції на копії БД і короткою нотаткою в Serena nextjs_vmd-api-db-routes.`,

  "Як користуємось дошкою": `Робочий потік (канбан цього проєкту)
• Беклог — сирі ідеї й техборг, без жорсткого терміну.
• План — те, що беремо найближчим часом (пріоритизовано).
• В роботі — WIP, тримати 1–3 картки, щоб фокус не розмазувався.
• Готово — закриті задачі; періодично архівувати.

Не чіпати щодня (довідник)
• «Про проєкт» — концепція продукту.
• «Компоненти» — шпаргалка по кодовій базі.

Backlog у коді
• nextjs_vmd/docs/backlog/ideas.md

GitHub
• https://github.com/Makmillerme/ProductERP`,

  "Актуалізувати docs/backlog/ideas.md": `У файлі залишився блок «Текстові поля — валідація за типами» зі статусом «Впроваджено 2025-02-23».

Що зробити
• Або перенести блок до розділу «Зроблено / архів», або скоротити до одного рядка з посиланням на PR/коміт.
• Переконатися, що в Беклозі Trello немає дубля тієї ж ідеї без статусу.

Критерій готовності: новий розробник відкриває ideas.md і розуміє, що ще відкладено, а що вже історія.`,

  "Розширити RHF+Zod на інші форми в management": `Контекст: пілот уже на product-types-management та statuses-management.

Наступні кандидати
• Field definition sheet (складна валідація пресетів і типів).
• Categories / tabs config — де багато полів і залежностей.
• User detail / role sheet — за потреби уніфікації повідомлень про помилки.

Технічні кроки
• Схеми Zod поруч з формою або в lib/validation; повідомлення через i18n.
• Уникати дубля валідації «на клієнті і на сервері» — сервер лишається джерелом правди.

Результат: передбачувані форми, менше регресій при зміні API.`,

  "Рознести великі компоненти на частини": `Проблема: файли на сотні рядків ускладнюють review і паралельну роботу.

Пріоритетні файли (приклади)
• products-page.tsx
• field-definitions-management.tsx
• statuses-management.tsx

Підхід
• Виносити колонки таблиці, діалоги, хуки даних у підфайли в тій самій feature-папці.
• Зберігати публічний API зовнішнього компонента незмінним, щоб не ламати імпорти.

Метрика: файл < 300 рядків там, де це реалістично без штучного дроблення.`,

  "Оцінити TanStack Table": `Коли має сенс
• Потрібні складні сортування по кількох колонках, видимість колонок, resize, групування.

Коли НЕ чіпати
• Прості таблиці з пагінацією й одним ключем сортування — поточний Table + map достатні.

Оцінка (чеклист)
• Чи є узгоджена UX-вимога на «як Excel»?
• Чи окупається розмір бандла та час навчання команди?

Висновок зафіксувати одним рядком у картці або посиланням на рішення в ideas.md.`,

  "Automations / API integrations — наступні кроки": `Поточний стан: сторінки та заготовки під інтеграції; без жорстко зашитого продакшен-сценарію для кожного клієнта.

Рекомендовані кроки для BA/інженера
• Зібрати 2–3 конкретні сценарії (джерело даних, частота, напрям sync, помилки).
• Для кожного — окрема картка в Плані з API-контрактом і тестовими даними.
• Узгодити безпеку (ключі, IP whitelist, журнали).

Технічно: нові маршрути тільки через /api з перевіркою прав і лімітами на виклики зовнішніх API.`,
};

async function main() {
  const { key, token } = loadCredentials();
  const q = new URLSearchParams({ key, token, fields: "name,desc,id" });
  const listRes = await fetch(`https://api.trello.com/1/boards/${BOARD_SHORT}/cards?${q}`);
  if (!listRes.ok) throw new Error(await listRes.text());
  const cards = await listRes.json();

  let updated = 0;
  for (const c of cards) {
    const desc =
      DESCRIPTION_BY_ID[c.id] ??
      DESCRIPTION_BY_NAME[c.name] ??
      null;
    if (!desc) {
      console.warn("Skip (no template):", c.name, c.id);
      continue;
    }
    if (c.desc === desc) {
      console.log("Unchanged:", c.name);
      continue;
    }
    const body = new URLSearchParams();
    body.set("desc", desc);
    const putUrl = `https://api.trello.com/1/cards/${c.id}?${new URLSearchParams({ key, token })}`;
    const res = await fetch(putUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
      body: body.toString(),
    });
    if (!res.ok) throw new Error(`${c.name}: ${await res.text()}`);
    console.log("Updated:", c.name);
    updated++;
  }
  console.log("Done. Updated:", updated, "/", cards.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
