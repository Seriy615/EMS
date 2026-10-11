# Журнал продолжения EMS

## 11 октября 2026 — глобальная цель и EMS-010

Цель сохранена в `PROJECT_GOAL.md` (G-01..18, первый proof P1) и как активная цель чата. Политика обновлена по последнему указанию владельца: GPT-6.1 Sol / GPT-6 Luna; владелец подтвердил выбор, независимый ID модели среда не раскрывает. Делегирования не было.

Прочитаны README, AGENTS, CODEX_START, вся документация `docs/`, backlog, локальные навыки, reference-код, CLI, схемы, примеры, тесты и просмотрщик. Рабочая директория не содержит Git metadata; commit ID получить невозможно. Node/npm найдены локально, без загрузки или установки зависимостей.

Команды запускать с `PATH=/opt/forgeai-node-v22.21.0/bin:$PATH`, если PATH окружения не содержит npm. Node v22.21.0. Baseline: `npm test` 16/16 PASS; `npm run verify` 18/18 PASS. Первые попытки без этого PATH завершились кодом 127, не являлись результатами тестов.

EMS-010 DONE: нормативный finite-number профиль и 28 сериализуемых векторов; исправлены проверки промежуточных результатов, повторное исполнение общего узла в standalone, ошибки входов, знак нуля в литералах, порядок портов и min/max больших массивов. Сырые host exceptions и trusted JS остаются границей прототипа. Новые проверки: AC-025; всего `npm test` 59/59 PASS, `npm run verify` 18/18 PASS. Одна промежуточная попытка: 58/59, старый тест ожидал код внутри сообщения; обновлён на проверку структурированного error.code.

Следующий готовый work item EMS-011 начат: отдельный версионированный типизированный IR начального профиля, каноническая сериализация, pinned contract versions, provenance вне семантики, CLI и round-trip/negative tests. EMS-012 готова по зависимости, но следует после этого среза. M1 целиком открыт; полноценной грамматики, state/control/async ещё нет.

## Продолжение — EMS-011 завершена, EMS-012 начата

EMS-011 DONE для начального профиля: `src/ir/index.mjs`, `schemas/ir.schema.json`, `docs/spec/IR.md`; CLI `ir/text-ir/ir-run/ir-build`. Все 28 векторов проходят graph → IR JSON → runtime/standalone; проверены версии, типы, неверные ссылки, циклы, вложенные эффекты и независимый запуск новым процессом вне workspace. Canvas/provenance не входят в semantic artifact; text/graph примеры дают идентичный IR. Полный production HIR/control IR и transitive package lock ещё впереди.

`npm test` **110/110 PASS**, `npm run verify` **29/29 PASS**. Промежуточный CLI-тест ожидал округлённую десятичную константу; исправлен на точное сравнение с reference результатом binary64. Реальный браузер не найден в доступных локальных каталогах; внешние зависимости не устанавливались, P1 остаётся открыт.

Следующая задача EMS-012 начата: собственные lexer/grammar/parser → AST с позициями для модулей, контрактов, функций, выражений, условий, циклов и ошибок. Parser не будет выполнять произвольный JS или выдавать синтаксическую поддержку за готовое исполнение. Типизация и lowering новых конструкций — EMS-013..015.

## Продолжение — EMS-012 завершена; ядро перед IDE

EMS-012 DONE по AC-027: собственный lexer/parser, `docs/spec/TEXT_GRAMMAR.md`, located AST для модулей, generic-функций, условий, циклов, pattern matching, ошибок, async и resource syntax. CLI `parse`; 31 положительный/отрицательный frontend-тест. Синтаксический fixture `language-core.ems` не заявлен исполняемым.

EMS-013 IN_PROGRESS: `src/frontend/types.mjs` нормализует типы, делает exact structural unification, вывод generic arguments и occurs check; 11 тестов. Полный AST checker, union/collection checking и lowering ещё не завершены. Пересобран checked-in sealed AVG5, добавлена проверка его входов/ошибок. Текущий итог: `npm test` **153/153 PASS**, `npm run verify` **31/31 PASS**.

Владелец явно утвердил вложение «WEB IDE MVP + DEPLOY» и размещение на `ems-vps` / `https://dev-ems.d-mash.ru`, затем уточнил: делать ядро и IDE, **сначала ядро**. Сохранить глобальную цель; базовый порядок — типизация/IR/effects/state/events, затем работающая IDE с реальным runtime, три demo, persistence, browser E2E и защищённый деплой. Документ-вложение содержит старые Terra/Luna labels; актуальная подтверждённая политика Sol 6.1/Luna 6 сохраняется.

Read-only инфраструктурная проверка: SSH `ems-vps` доступен, Ubuntu/Linux, Nginx 80/443, много существующих сервисов (не менять). Свободно около 19 GB диска, RAM около 183 MB available и заполненный swap. DNS домена → 85.198.64.183. `curl -I https://dev-ems.d-mash.ru` завершился кодом 60: certificate SAN не соответствует домену; deploy не выполнен. Для EMS потребуется отдельный минимальный сервис, авторизация и корректный TLS. Никаких чужих конфигураций не изменено.

Браузер обнаружен позднее при расширенном поиске: `/home/jcode/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell`. Предыдущая запись «браузер не найден» описывает более узкий поиск, а не окончательный blocker. Playwright Node package ещё ищется. P1 по-прежнему не проверен.

## Продолжение — EMS-013 завершена; EMS-014 начата

EMS-013 DONE по AC-028, в пределах `docs/spec/TYPE_CHECKING.md`: нормализованные типы, aliases, rigid generic bodies, независимая inference каждого вызова, occurs check, unions/collections/resource tags, located AST checker, scope/control/async проверки и консервативная полнота Option/Result/Boolean patterns. Не обещать FFI ownership или исполнение всех типизированных конструкций.

Новый frontend соединён с существующим IR/runtime: arithmetic AVG5, выражения, immutable SSA, generic helpers и вложенные локальные функции реально исполняются и экспортируются. Generic specialization создаёт обычные composite; compiler раскрывает их. CLI `check`, `module-run`, `module-build`; standalone проверен отдельным процессом вне проекта. Неподдерживаемые control/state/async/algebraic runtime forms завершаются `UNSUPPORTED_PROFILE`, отсутствующий extern — `MISSING_CONTRACT`, несовпадающая реальная сигнатура — `BINDING_SIGNATURE`.

Обнаружены и исправлены два тонких случая: alias-подстановка одноимённых/переставленных generic parameters не должна зацикливаться; вложенный ограниченный pattern не должен ложно подтверждать exhaustiveness. Регрессионные проверки добавлены. Ещё одна промежуточная ошибка metadata (`constructor` совпадал с прототипным свойством объекта) исправлена на отдельное имя `algebraicConstructor`; полный прогон прошёл.

EMS-014 IN_PROGRESS: `src/semantics/effects.mjs` вычисляет transitive declarations через nested composite без запуска кода; `checkGraphPolicy` отдельно требует capabilities и разрешённые effects, включая unused nodes. Четыре теста проходят. Пока это явный preflight API; он ещё не встроен в IR/runtime, не является OS sandbox и не завершает EMS-014. Следующее действие — effect fields/проверки AST/IR и explicit sequencing, затем EMS-015 state/events/control для IDE.

Текущий итог: `npm test` **211/211 PASS**, `npm run verify` **33/33 PASS**. Полные логи последнего запуска: `/tmp/ems-all-tests.log`; версия локального браузера проверена: Google Chrome for Testing 156.0.8078.4, uid 1000. Само browser conformance ещё не выполнялось. M1, P1, WEB IDE MVP и deploy остаются открыты; глобальную цель не закрывать.

P1 и AC-018 открыты: сравнение runtime/standalone в одном Node.js не доказывает второй target. Не заявлять браузер, Android, iOS или native compiler без реального запуска. Не закрывать глобальную цель на этой итерации.

## Продолжение — репозиторий владельца

Владелец указал `git@github.com:Seriy615/EMS.git` для всех коммитов и push. Репозиторий доступен по SSH и пуст (проверен `git ls-remote`); локальная Git-история создаётся впервые. Доступ настроен локально через существующий SSH identity, приватные ключи в проект не копируются. Первый коммит сохраняет текущий исходный прототип, цель, результаты EMS-010..013 и незавершённый EMS-014. SHA snapshot в evidence относится к состоянию до добавления этой записи и Git metadata; это исторический снимок, не подтверждение будущих изменений. Далее сохранять историю, коммитить проверенные срезы и отправлять в этот remote.
