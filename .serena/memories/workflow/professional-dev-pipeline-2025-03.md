# Професійний пайплайн (new_nodejs_vmd_parser)

**Джерело істини:** `.cursor/rules/senior-agent-workflow.mdc` (alwaysApply).

## Планування
- **Composer Plan** + зміст **`/plan`**: sequential-thinking MCP; у Plan не масово кодити.
- **Закриття:** підсумок → перемкнути Composer на **Agent**; явно позначити перехід до реалізації.

## Розробка
- **`/serena`** у **Agent**: `activate_project` (`nextjs_vmd` за замовч.), правки через Serena; `write_memory` після суттєвого.

## Допоміжні команди
- **`/docs`**: версії з `nextjs_vmd/package.json` + офіційна дока (`WebFetch` / web_search).
- **`/audit`**: Next — продуктивність, hydration, RSC; next-devtools MCP якщо є, інакше код + логи терміналу.
- **`/ui-add`**: Shadcn First — перевір `components/ui`, MCP registry, CLI; не примітиви з нуля.

## Інше
- Термінал: читати доступні `terminals/*.txt`; PowerShell; не `npm run dev` без запиту.
- Skills оновлені: `fullstack-development-workflow` (таблиця команд), `strategic-planning`, `ui-engineering`, `frontend-god` — посилання на rule.
- Команди в `.cursor/commands/`: `plan.md`, `serena.md`, `docs.md`, `audit.md`, `ui-add.md`.