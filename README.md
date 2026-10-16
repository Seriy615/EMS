Исходные модули: `import "lib.ems" as lib`, exported контракты и типы, stateful definitions и графовые тела проходят общий compiler/runtime. Multi-file CLI и примеры самостоятельных приложений — [AC-136](docs/spec/SOURCE_MODULES.md). Редактирование связанных source files в IDE — следующий этап.

Запуск UI Worker: загрузка среды и выполнение EMS имеют отдельные ограниченные бюджеты; native Stop отменяет и незавершённый запуск — [AC-135](docs/spec/UI_WORKER_STARTUP.md). Текущая приёмка и ограничения — в STATUS.

Текст контрактного графа EMS и применение к тем же узлам/связям в обычном canvas — [AC-132](docs/spec/GRAPH_SOURCE.md), [пример](examples/graph-body.ems). Полный native source-document inverse остаётся открытым.

Текущий native модуль можно показать и скачать как настоящий EMS после правок графов, полей и UI — [AC-130](docs/spec/NATIVE_MODULE_SOURCE.md). CLI `instance-source` / `application-source`; обратный импорт копии и standalone build проверяются на общем parser/IR. Применение полного текста к исходному холсту с сохранением геометрии ещё впереди.

Поля native контрактов: добавление, переименование и удаление с сохранением графов, инвариантов и UI; зависимости удаления и отмена/повтор — [AC-129](docs/spec/INSTANCE_FIELDS.md). Новое поле и операция связываются с кнопкой и текстом через тот же обычный граф.

Native UI на EMS: `@UI.*`, `~>`, `<=`, общий typed model и UI-only text/visual inverse — [AC-128](docs/spec/NATIVE_UI_SOURCE.md), [полный source](examples/native-ui.ems). `application-build` создаёт независимое DOM-приложение.
Native `graph` bodies сохраняют авторские узлы при первом открытии в обычном редакторе, включая поля и инварианты: [AC-133 / проверяемые origins](docs/spec/NATIVE_GRAPH_ORIGINS.md), [пример UI и графового обработчика](examples/native-graph-ui.ems).
Полный актуальный EMS можно редактировать и применить к тому же проекту: «Код EMS» / «Код приложения EMS» в UI. Графы сохраняют IDs и оформление, invalid drafts хранятся отдельно — [AC-134](docs/spec/NATIVE_SOURCE_APPLY.md).

Native контрактный модуль теперь связывается с UI: поля `left.value`, операции `left::Change`, общий designer/canvas и независимый DOM export — [AC-127](docs/spec/INSTANCE_UI.md). Пример для импорта: [contract-instance-ui.ems-project.json](examples/contract-instance-ui.ems-project.json).

Контрактные модули Studio: создание/импорт native EMS, экземпляры и данные, операции и инварианты в общем графе — [AC-126](docs/spec/INSTANCE_STUDIO.md). Срез не завершает глобальную цель; полный body inverse и dynamic lifetimes ещё впереди.

# EMS — universal contract-oriented programming platform

> **EMS = language, contracts, compiler, runtime, UI, system API adapters, plugin ecosystem and AI-assisted programming.** Not merely an event builder or a website constructor.

**Project type:** Codex-ready development repository and architectural specification.  
**Current implementation:** **M0 reference proof of concept only**, not a production compiler, complete IDE, FFI runtime, secure sandbox or true multi-platform toolchain.  
**Owner's mandatory agent policy:** ONLY **GPT-6.1 Sol / GPT-6 Luna**. **Do not use GPT-5.6 Sol or Astra.** See [`AGENTS.md`](AGENTS.md).

## Get started (Node.js 22+, no npm install required)

```bash
npm test
npm run verify
npm run demo
npm run text:demo
npm run build:demo
npm run seal:demo
npm run studio
```

Open `http://127.0.0.1:8787` after `npm run studio` to inspect and execute the example graph. Reference CLI:

```bash
node tools/ems.mjs validate examples/avg5.graph.json
node tools/ems.mjs run examples/avg5.graph.json '{"times":[12.4,11.85,13.2,12.1,14]}'
node tools/ems.mjs text-run examples/avg5.ems '{"times":[12.4,11.85,13.2,12.1,14]}'
node tools/ems.mjs seal examples/avg5.graph.json --out dist/avg5-atomic
```

Synchronous structured programs can export typed atomic packages with nested `Option`/`Result` inputs and outputs. The reference JS backend validates and copies these values, preserves typed errors and shares execution budgets across reviewed package calls. Try `node tools/ems.mjs module-seal examples/option-result.ems --entry main --id sealed.Tagged --out dist/tagged`. See [the versioned package ABI](docs/spec/ATOMIC_PACKAGE.md); rich legacy dataflow/IDL, async package interfaces and native targets remain separate work.

The avg5 arithmetic demo computes `(sum - min - max)/3 = 12.566666…`, **not** an official WCA Ao5 implementation. The current textual syntax is a tiny draft and does **not** yet constitute the full EMS language. Generated standalone JS is a pure-operation target proof of concept; native/mobile compilers remain planned work.

## Explicit contract graphs

New graph projects use ordinary typed contracts with explicit activation connections.
`IterationBegin` and `IterationEnd` carry no data or hidden condition. A separate
comparison produces the Boolean consumed by a fork; connecting the end back to the
beginning repeats the actual graph. Incomplete graphs remain editable; run/build
checks all required ports and value availability. The compiler lowers to the same
checked IR2 used by textual EMS and exports independent JavaScript.

Try `node tools/ems.mjs flow-run examples/flow-counter.graph.json '{"limit":3}'`.
See [the versioned semantics and remaining limits](docs/spec/CONTRACT_FLOW.md).
Existing saved graph/text projects remain compatible. Supported saved control
sources open in the same contract canvas; “Сохранить граф” retains the original
source and creates an editable graph alongside it in the workspace. See
[saved source editing and its limits](docs/spec/SAVED_SOURCE_FLOW.md).
Owned composite contracts can be created, dragged, opened and edited on this same canvas. Supported finite source helpers retain separate editable definitions, including UI handlers. See [composition semantics and limits](docs/spec/FLOW_COMPOSITES.md). Self and mutual calls use the explicit [recursive flow profile](docs/spec/RECURSIVE_FLOW.md), shared execution limits and transactional UI state. Full reverse text editing and Map support remain separate work.

## Studio projects

The projects screen can create a workspace containing UI documents, graph files and
EMS contract sources. Existing single-document projects can be converted through
“Файлы проекта”. All documents are exported and imported together. UI handlers open
in the same full contract canvas; custom handlers can be created without writing a
source template. Initial UI state values are editable in the data panel and handler graph.
Local variable contracts expose a typed overwrite input and a current-value output.

Workspace files currently organize validated documents; automatic cross-file contract
imports and dependent module recompilation remain planned. See
[the acceptance scope and semantic limits](docs/plans/ORDINARY_CONTRACT_PORTS.md).

## Read in order

1. [`AGENTS.md`](AGENTS.md) — mandatory rules and model selection.
   [`PROJECT_GOAL.md`](PROJECT_GOAL.md) — persistent project goal and measurable completion gates.
2. [`docs/spec/EMS_FULL_SPEC.md`](docs/spec/EMS_FULL_SPEC.md) — product and architectural specification.
3. [`docs/spec/REQUIREMENTS.md`](docs/spec/REQUIREMENTS.md) — tracked requirements.
4. [`docs/architecture/OVERVIEW.md`](docs/architecture/OVERVIEW.md) — modules and boundaries.
5. [`docs/plans/ROADMAP.md`](docs/plans/ROADMAP.md) — milestones with acceptance gates.
6. [`docs/plans/CODEX_EXECUTION.md`](docs/plans/CODEX_EXECUTION.md) — detailed Codex execution method.
7. [`tasks/backlog.json`](tasks/backlog.json) — machine-readable work items.
8. [`docs/qa/ACCEPTANCE.md`](docs/qa/ACCEPTANCE.md) — verifiable acceptance criteria.

## Core model

```text
Intent / Textual EMS / Visual EMS / Imported library
                     |
        Canonical typed program + contracts
                     |
          Semantic verification -> EMS IR
                     |
         +-----------+------------+
         |                        |
    EMS Runtime            Compiler + Linker
         |                        |
 Platform bindings       Standalone artifacts
         |                        |
    System APIs          Web / Native / Server
```

**Atomic contract:** public interface, implementation is an opaque or external boundary for visual decomposition (including imported API function, compiled program, library). Not synonymous with confidential or commercially closed.  
**Composite contract:** public interface with an inspectable EMS graph; can be nested and compiled into an atomic distributable artifact.  
**Library import:** each exported/selected callable may become a typed atomic block; an imported library becomes a package of such blocks.  
**Text + visual:** two authoring interfaces for a single language semantics.

## Repository structure

```text
AGENTS.md                   Codex rules + mandatory model policy
.agents/skills/             Five project-specific development skills
src/reference/              Executable M0 interpreter, compiler and binding demo
src/ir/                     Typed versioned core IR, validation and serialization
src/frontend/               EMS lexer/parser and located AST (new syntax execution pending)
schemas/                    Graph and contract JSON schemas (draft)
examples/                   Textual/graph demos + design manifests
web/                        Minimal browser graph explorer, NOT full editor
tools/                      CLI, local server and QA scripts
tests/                      Node built-in test runner
specs/docs in docs/spec/    Complete scope and requirements
architecture/               Decisions and API design boundaries
plans/                      Roadmap, task execution protocol, demos
qa/                         Acceptance & status evidence
tasks/backlog.json          Dependency-ordered task backlog
```

## Immediate engineering goal

M0 baseline passes. The core has normative semantics, typed versioned IR, a located AST parser and type checker. Pure SSA functions and inferred generic helpers execute through the shared IR/runtime and export to standalone JS; structured control-flow/loops/recursion now execute and export, typed user exceptions/finally and Option/Result with exhaustive pattern matching execute through the same control IR. Typed async/Future tasks and await now execute through the same IR and export to independent async JS; Typed Stream snapshots/bounded FIFO channels and for-await loops now execute and export; ResourceHandle/using lifecycle now executes and exports owned cells, with bounded native cleanup and explicit trusted bindings; see [`CONTROL_RESOURCES.md`](docs/spec/CONTROL_RESOURCES.md). Separate public contract interface/binding IDL now checks exact versions, targets, typed signatures and policy before execution; finite atomic adapters and inspectable composite boundaries preserve executable pre/postconditions and declared errors in runtime and standalone; direct composite graph/IR includes a mandatory interface reference and rejects missing bindings (see [`CONTRACT_IDL.md`](docs/spec/CONTRACT_IDL.md)). Public native resource IDL now declares per-phase conditions/errors and preserves runtime ownership during failed/late acquisition (see [`RESOURCE_IDL.md`](docs/spec/RESOURCE_IDL.md)); native standalone export remains unsupported. Finite event sessions now add transactional typed state, FIFO replay and cancellation; Verified program dependency locks now pin semantic IR, typed contract closure and explicitly trusted SDK source bytes before runtime/export (see [`PROGRAM_LOCK.md`](docs/spec/PROGRAM_LOCK.md), runnable [`pinned-lock.mjs`](examples/pinned-lock.mjs)); this is integrity checking, not a sandbox or runtime binary attestation. The common conformance gate now compares 54 core/language/interface fixtures across runtime, serialized IR and fresh standalone processes (`npm run conformance`; see [`CONFORMANCE.md`](docs/qa/CONFORMANCE.md)). The actual browser gate now passes 57 fixtures across Node and Chromium runtime/standalone, including browser lock verification and an independent static application (`npm run browser:verify`, [`BROWSER_P1.md`](docs/qa/BROWSER_P1.md)). Pure-core P1 is proven; the first working Studio editor now supports typed graph editing, Run, undo/redo and local project save/open/import/export (`npm run studio`; see [`STUDIO_PROJECT.md`](docs/spec/STUDIO_PROJECT.md)). Composite authoring, nested expand/edit/reuse, v2 dependency persistence and standalone JS export now work (see [`STUDIO_COMPOSITES.md`](docs/spec/STUDIO_COMPOSITES.md)). Initial text mode now uses the same frontend/IR/runtime, preserves eager versus dataflow semantics, supports source diagnostics and cancellable worker execution (see [`STUDIO_TEXT.md`](docs/spec/STUDIO_TEXT.md)); full control visual mapping remains open. The standard library now adds 36 working typed value/logic/comparison/select/text/array operations, categorized search and independent public IDL/catalog (see [`STANDARD_LIBRARY.md`](docs/spec/STANDARD_LIBRARY.md)); Typed static Map/Filter now work in text through the same control IR and budgets (see [`COLLECTION_TEMPLATES.md`](docs/spec/COLLECTION_TEMPLATES.md)); visual authoring/persistence remain open. Interactive UI and higher-order library support are next parts of the owner-approved Web IDE MVP; follow [`docs/qa/PROGRESS.md`](docs/qa/PROGRESS.md) and [`docs/plans/ROADMAP.md`](docs/plans/ROADMAP.md). The complete language and IDE remain under development.

## Constraints and caveats

- No single ABI or API maps perfectly to every OS; capabilities, permissions and platform features must be explicit.
- Not all program properties can be statically verified. Type safety is not equivalent to correctness of business logic.
- Native/closed binaries cannot be guaranteed secret from decompilation.
- Generic automatic import of arbitrary C++, Rust, Python or crypto binaries is **not** implemented; requires language-specific adapters, audit and platform bindings.
- The M0 JavaScript registry executes trusted host functions with full host permissions. **Never run unknown imported modules as plugins.**

See `docs/spec/EMS_FULL_SPEC.md` for the long-term vision and exact boundaries.

Initial semantic UI/DOM backend: run `npm run studio` and open `/web/ui-demo.html`. Its buttons execute the EMS counter handler through the existing transactional reactor; UI/state permissions are explicit. Typed text/checkbox events, reactive properties and lifecycle are documented in [UI_TREE.md](docs/spec/UI_TREE.md). Typed signed-value UI project transport and local Save/Open/import/export/Undo are implemented (see [UI_PROJECT.md](docs/spec/UI_PROJECT.md)). Initial UI/state/event forms, widget selection and persisted EMS handler editing are implemented (see [UI_AUTHORING.md](docs/spec/UI_AUTHORING.md)). Initial typed handler graph editing, a unified local project catalog and standalone state/UI export now work. Full visual control authoring and the complete WEB IDE MVP acceptance remain in progress.

UI preview handlers now run in a persistent Worker with the same reactor semantics, bounded pending requests, deadlines and Stop. The editor keeps the last confirmed snapshot on termination and starts a new session from saved initial values; see [UI_WORKER.md](docs/spec/UI_WORKER.md). This is CPU isolation for the reference preview, not a production plugin sandbox.

## Standalone state session (initial finite profile)

`npm run export:reactor` builds `dist/counter-session.mjs` from the saved source-owned counter project. The independent module exports `createSession` and `replayEvents`, with the same FIFO transaction kernel as the interpreter. Explicit state permissions are required. Node and Chromium execution, rollback, replay and cancellation are verified; DOM/UI packaging and production/native backends remain open. See [STATE_COMPILER.md](docs/spec/STATE_COMPILER.md).

## Standalone DOM application (initial finite profile)

`npm run export:ui` builds `dist/counter-ui` from the saved source-owned project with explicit grants in `examples/ui-policy.json`. Serve that directory on a static host: it runs without EMS IDE or service, including nested URLs. Node semantic execution and actual Chromium controls after EMS origin shutdown are verified. The UI workspace can download the same package as a TAR archive. PWA/native UI and full MVP remain open. See [UI_EXPORT.md](docs/spec/UI_EXPORT.md).

Unified local project catalog: open `/web/projects.html` to create, copy, rename, import/export and open graph/text or UI projects. Managed graph drafts and applied UI sources survive refresh; existing editors retain the same IR/runtime and independent application export. Legacy saved projects remain accessible on editor URLs without `?project=...`. See [PROJECT_MANAGER.md](docs/spec/PROJECT_MANAGER.md).

The AVG5 Studio example now opens a reusable six-operation arithmetic composite (not WCA), with nested editing/persistence. Graph Run logs actual Worker lifecycle and marks runtime failures at their real node/caller. Owner MVP evidence and checked deployment procedure: [WEB_IDE_MVP.md](docs/qa/WEB_IDE_MVP.md), [DEPLOYMENT.md](docs/qa/DEPLOYMENT.md).

Development IDE is available at [dev-ems.d-mash.ru](https://dev-ems.d-mash.ru), protected by owner authentication. Live Chromium graph execution, project reopen, expandable AVG5 and interactive counter are verified. Access credentials are stored outside Git; operational evidence and rollback status are recorded in [DEPLOYMENT.md](docs/qa/DEPLOYMENT.md).


В Studio доступна настоящая отладка графов вызовов: «Отладка» останавливает существующий runtime перед операцией, «Шаг» переходит к следующей, «Продолжить» завершает запуск, «Остановить» прекращает Worker. Панель показывает полный путь вложенных контрактов и типы без значений аргументов. В текстовом EMS control runtime выделяет actual instruction/expression, включая вложенные функции, циклы и локальные futures. Visual Map/Filter, UI state/events и native debugger ещё впереди; границы и протокол — [IDE_RUNTIME_DIAGNOSTICS.md](docs/spec/IDE_RUNTIME_DIAGNOSTICS.md).


UI preview поддерживает «Отладка событий (новый запуск)»: нажмите реальный элемент приложения, затем Step/Continue. Подтверждённое состояние сохраняется до завершения транзакции; Stop прекращает Worker preview и оставляет последнее подтверждённое отображение. Источники обработчиков проверяются как witness executable IR, значения draft/аргументов в pause metadata не передаются. См. AC-067 и документацию отладки.

Статический анализ происхождения control IR: `node tools/ems.mjs module-origins examples/origins.ems --entry main --out origins.json`. Создаёт зависимости без исполнения программы и содержимого литералов. Это аналитический sidecar, не разрешение раскрывать значения; [профиль и ограничения](docs/spec/CONTROL_ORIGINS.md).

Классификация действительных корней и дополнительное ограничение диагностики: `node tools/ems.mjs module-classify examples/classification.ems --entry main --policy examples/classification.policy.json --out classification.json`. [Формат, алгебра и границы политики](docs/spec/ORIGIN_POLICY.md). Public label сам не даёт разрешения просмотра.

Для сохранённых меток используйте `module-bind-origins … --policy annotations.json --out bound-policy.json`, затем `module-classify … --policy bound-policy.json`: изменённый semantic IR отвергается до диагностики. Source Worker API: `await startBoundStudioExecution(request, options)`. Подробности v2 в ORIGIN_POLICY.md.

Структурный pure EMS-модуль можно собрать в reusable atomic package: node tools/ems.mjs module-seal examples/factorial-sum.ems --entry main --id sealed.Factorials --out dist/factorials. В IDE — «Скачать атомарный контракт» в настройках кода. Формат и trusted import: [ATOMIC_PACKAGE.md](docs/spec/ATOMIC_PACKAGE.md).

## Native contract notation (initial profile)

Typed contract declarations accept `@Main() -> Number`, and qualified operations accept `core::add(10, 20)`. They use the existing checker, semantic IR and standalone compiler. Run `node tools/ems.mjs module-run examples/native-contracts.ems --entry Main '{}'` (result: 60). See [the current syntax profile](docs/spec/NATIVE_CONTRACT_SYNTAX.md) for limits; state transitions and invariants are separate upcoming work.

UI-обработчики теперь можно создавать обычным графом: «Создать граф обработчика», read/write данных UI, «Применить к UI» и привязка события элемента. [AC-112: правила, черновики и пример](docs/spec/UI_CONTRACT_FLOW.md).

Ядро исполняет `Array<String>`, `Array<Boolean>` и вложенные типизированные массивы в общем Runtime/standalone compiler. [Пример и ограничения AC-113](docs/spec/TYPED_ARRAYS.md); generic UI/flow ports и словари ещё в разработке.

Для `Array<T>` доступны типизированные контракты `append`, `set`, `insertAt`, `removeAt` и ещё шесть операций. [AC-114: пример, Registry/IR и границы](docs/spec/TYPED_ARRAY_CONTRACTS.md). Каталог v3 содержит их generic interfaces.

Обычный графовый редактор теперь поддерживает `Array<String>`, `Array<Boolean>`, вложенные и tagged типы: выбирайте тип элемента массива в библиотеке, соединяйте обычные порты и задавайте тип результата в свойствах. [AC-115: граф /2 и пример feedback](docs/spec/RICH_CONTRACT_FLOW.md).
