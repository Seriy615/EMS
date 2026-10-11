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

## Продолжение — EMS-014 runtime policy preflight

Транзитивный анализ встроен в `executeGraph` до первого host-вызова: проверяется весь граф, включая unused nodes и вложенные composite. Grants capabilities и allowedEffects независимы, по умолчанию пусты и наследуются nested вызовами. Registry и runtime отклоняют malformed декларации/grants (`INVALID_POLICY`); JSON schema согласована с именами policy. Экспорты reference API открывают анализ и проверку отдельно.

AC-029 подтверждена executable тестами: отказ на поздней зависимости не допускает раннего side effect; denied nested/unused effect не выполняется; разрешённый nested graph работает. `npm test` 215/215 PASS, `npm run verify` 33/33 PASS, baseline 211/211 и 33/33 на c4c47fe. Лог `/tmp/ems-effects-tests.log`. Доверенные атомы по-прежнему обладают полномочиями процесса, metadata enforcement не является OS sandbox. EMS-014 остаётся IN_PROGRESS: следующий срез — effectful semantic IR и explicit sequencing, затем state/events для IDE.

## Продолжение — EMS-014 effect IR и explicit sequencing

Новый профиль `ems-effects-finite/1` хранит транзитивную policy каждой операции/программы и explicit sequence. Graph/IR/runtime используют один план; canonical JSON сортирует операции, сохраняя порядок sequence. Проверяются все nested планы до host calls, полнота observable узлов, уникальность и data dependencies (включая путь через pure узлы). Последовательные вызовы await-ятся, memo исключает повторный эффект при чтении результата; ошибка прекращает следующие действия, rollback не обещается. Graph M0 без sequence сохраняет прежнюю семантику; effect IR требует sequence.

AC-030: десять executable тестов в `tests/effect-ir.test.mjs`; runtime/IR roundtrip, negative cases, nested order/preflight, denied grants, host failure и compiler rejection. Исправлен пропуск compiler: unused composite мог скрыть вложенный effect. Теперь transitive preflight запрещает такие экспорты до emitJS. `examples/effect-sequence.mjs` — настоящий trusted stdout adapter, не FFI sandbox или portable file implementation.

Baseline на 98cc910: 215/215 тестов, 33/33 verify. Итог: `npm test` 225/225 PASS, `npm run verify` 33/33 PASS; Node 22.21.0, логи `/tmp/ems-effect-ir-tests.log`, `/tmp/ems-effect-ir-verify.log`. EMS-014 IN_PROGRESS: следующий срез — AST effect declarations/checker и текстовое lowering в effect IR; затем EMS-015 state/events/control. M1/P1/IDE/deploy остаются открыты.

## Продолжение — EMS-014 завершена в finite kernel; AST → effects IR

`src/frontend/effects.mjs` выводит policy через call graph worklist, включая generic/forward/recursive calls. located pure assertions и explicit budgets проверены; linked extern не может скрыть binding metadata. Без annotation policy выводится; explicit interface requirements сохраняются отдельным root requirements IR. Никакой host-код при checker/linker не исполняется.

Lowering effectful SSA и expression statements формирует ordered sequences; ошибки чистых intermediate операций предшествуют поздним действиям. Pure sequences через nested helpers также сохраняются в standalone. Effectful standalone отвергается до emitJS; полного IO linker нет. Reference input policy по умолчанию пустая; CLI добавляет явный --policy с ограниченным envelope, опубликована execution policy schema. Пример `node examples/effect-text.mjs` реально печатает first/second из собственного EMS source через доверенный adapter.

AC-031: 10 frontend effect tests плюс расширенные IR/compiler negative checks; старый unsupported effect-annotation тест заменён проверкой реализованного пути. Baseline на 25c4004: 225/225 tests и 33/33 verify. Итог `npm test` **234/234 PASS**, `npm run verify` **36/36 PASS**; логи `/tmp/ems-ast-effects-tests.log` и `/tmp/ems-ast-effects-verify.log`, Node 22.21.0. EMS-014 DONE по AC-029..031 в описанном finite kernel; не объявлять runtime sandbox, IO backend или весь M1 завершёнными.

Следующая готовая задача — EMS-015: control-flow/state/events/cancellation и deterministic replay, необходимые для рабочего UI/IDE. Глобальная цель, P1, WEB IDE MVP и deploy остаются открыты. Все проверенные изменения отправлять в git@github.com:Seriy615/EMS.git.

## Продолжение — EMS-015 state/events и отмена

Добавлены `src/runtime/reactor.mjs`, `cancellation.mjs`: descriptor ems-reactor/1 связывает event names с существующими IR handlers, typed state adapters живут в explicit registry, committed memory принадлежит session. Text → type/effect checker → IR → event runtime проходит для `examples/counter.ems`; `node examples/counter.mjs` даёт count=2 и такое же состояние при replay.

FIFO сериализует события с bounded queue (QUEUE_FULL без drop). Каждый handler получает отдельный draft state, commit после успеха/проверки результата; отказ/abort откатывает только owned state, не внешний IO. Runtime передаёт signal/state context nested calls, прекращает ожидание отменённого host Promise, проверяет cancel boundaries. Поздние state calls после cancel/completion запрещены. close отменяет active/queued EMS outcomes и запрещает dispatch. External host work, игнорирующая signal, может продолжаться; это не sandbox или resource cleanup protocol.

AC-032: 13 tests подтверждают deterministic replay (успех/ошибка/queued cancel), отсутствие aliasing state/input/result/snapshot/trace, queue limits, preflight permissions, invalid bindings, cancellation в composite и сохранность queue после host throw null. Trace opt-in, по умолчанию пуст; JSON numeric trace transport/канонический -0 ещё не реализован. Baseline на 2fccc77: npm test 234/234 PASS и npm run verify 36/36 PASS. Итог npm test **247/247 PASS**, verify **40/40 PASS**, Node 22.21.0; логи `/tmp/ems-reactor-tests.log`, `/tmp/ems-reactor-verify.log`.

EMS-015 IN_PROGRESS; не закрывать её по одному state slice. Следующий срез — structured control-flow IR/lowering для if/loops/mutable locals, затем language Future/Stream и lifecycle. M1/P1/IDE/deploy/глобальная цель остаются открыты. Проверенные изменения коммитить и пушить в origin main.
