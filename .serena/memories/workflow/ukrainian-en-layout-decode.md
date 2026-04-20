# Декодер EN→укр розкладки (репо new_nodejs_vmd_parser)

**Стан:** v2.0.0 у `.cursor/scripts/decode-ukrainian-en-layout.mjs`.

**Мапа:** `.cursor/uk-en-layout-map.json` → поле `lower`; альтернатива: `--map` або env `UK_LAYOUT_MAP`.

**CLI:** `-h`, `--check` (self-test, exit 0/1), `--smart` (default), `--no-smart`, `-f/--file` (UTF-8, strip BOM).

**Реалізація:** ітерація по `codePointAt` / `String.fromCodePoint`; перевірка `j.lower` при завантаженні; `runSelfTest(mapPath)` щоб `--check` узгоджувався з `--map`.

**Проєкт nextjs_vmd:** `npm run uk-layout:check` → `node ../.cursor/scripts/decode-ukrainian-en-layout.mjs --check`.

**Правило агента:** `.cursor/rules/ukrainian-wrong-keyboard-layout.mdc`.

**PowerShell:** довгі рядки в лапках — екранування як завжди для `node`.

**Можливі розширення (не зроблено):** upper/shift-ряд у JSON, розширення whitelist, CI окремим job.