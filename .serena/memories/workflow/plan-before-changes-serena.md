## Дисципліна /plan + /serena (узгоджено 2026-03)

### План (до коду)
- Не тривіальні зміни: **режим Plan** у Composer.
- Складні задачі: **user-sequential-thinking** MCP (ризики, залежності, кроки, альтернативи). Дрібний однофайловий фікс — короткий план у чаті без MCP.
- У фазі Plan **не** масово правити код до узгодження з користувачем.

### Реалізація
- Після узгодження: **Agent**.
- Код у **nextjs_vmd**: `activate_project` → **Serena** (`replace_content`, `replace_symbol_body`, …), не search_replace/write, крім fallback (`.cursor/rules/serena-editing.mdc`).
- Після суттєвих змін: **write_memory** / **edit_memory**.

### Деталі в репо
- `.cursor/rules/senior-agent-workflow.mdc` — коли Plan, /docs, /audit, обмеження dev-сервера.
- `.cursor/rules/serena-editing.mdc` — інструменти Serena.