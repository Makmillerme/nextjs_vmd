# Cursor rules: сіньйорський workflow

**Додано:** `.cursor/rules/senior-agent-workflow.mdc` (alwaysApply).

**Зміст:** проактивний пошук документації в мережі (web_search/fetch); планування — sequential-thinking MCP для складних задач, інакше вбудований структурований план; перед викликом MCP — перегляд дескрипторів у `mcps/<server>/tools/`; вибір сервера за задачею; не просити користувача натискати /plan, якщо агент може сам відкрити planning.

**Оновлено:** `.cursor/rules/serena-editing.mdc` — цільовий застосунок не лише nextjs_vmd; `activate_project` для іншого підпроєкту/шляху; файли поза проєктом Serena (напр. `.cursor/`) — стандартні інструменти; активувати Serena перед кодом без очікування /serena.

**Примітка:** зміни лише в repo root `.cursor/rules/`, не в nextjs_vmd src.

**Оновлення (Composer Plan):** У `senior-agent-workflow.mdc` додано розділ про вбудований **Plan** у Composer. Тригери: кілька підходів з компромісами, архітектура, великі рефакторинги / багато файлів, нечіткі вимоги. Проактивно: `SwitchMode` → `target_mode_id: "plan"`; якщо недоступно — попросити користувача обрати Plan у селекторі режиму. Після плану — Agent + Serena; **sequential-thinking** — для важкої логіки вже в Agent / розкладки кроків.