Дошка: https://trello.com/b/uKqTe9aD. Списки: Про проєкт → Компоненти → Беклог → План → В роботі → Готово.

Cursor-команда /trello: .cursor/commands/trello.md — процес з інженером/BA/розробником, зв’язок із Serena.

Оновлення текстів карток тільки через Node (UTF-8): `npm run trello:update-cards` у nextjs_vmd або `node scripts/trello-update-card-descriptions.mjs`. Шаблони описів у scripts/trello-update-card-descriptions.mjs (DESCRIPTION_BY_ID для дубльованих назв). Не слати український desc через PowerShell Invoke-RestMethod body — крокозябри. Не використовувати в рядках літеральний «backtick+n» замість нового рядка — у Trello буде «n» перед словом.

Після спринту: Trello — картки «Що вже зроблено», «API (огляд)», «Куди далі»; Serena — write_memory nextjs_vmd-current-state-2025-03, при зміні API — nextjs_vmd-api-db-routes, структури — nextjs_vmd-project-context.

Backlog у коді: docs/backlog/ideas.md. Ключі Trello: ~/.cursor/mcp.json → mcpServers.trello.env (не в git).