# EMS — полная техническая спецификация

**Документ:** EMS-SP-001  
**Редакция:** 1.0 (концепция + спецификация целевой архитектуры)  
**Статус:** проектируемая система, не описание существующего production-продукта  
**Историческая исходная задача:** автоматизация музыкального лото и интерактивных мероприятий; целевая область — универсальное программирование.

## 1. Определение

**EMS** — контрактно-ориентированный, типизированный, расширяемый язык программирования и платформа для создания, композиции, исполнения и компиляции программ в нескольких вычислительных средах. Единая программа описывает поведение через граф или текстовую форму языка, а привязка к API и устройствам осуществляется через конкретные реализации системных контрактов.

EMS предназначена для человека, пишущего код, пользователя визуального редактора и ИИ-агента. Эти три способа разработки не должны порождать три разные семантики. Каноническое представление программы существует независимо от визуального полотна, названий языков хост-систем и провайдера ИИ.

**Стратегическая цель:** пользователь формулирует намерение, проверяет результат и при наличии реализованных возможностей получает работающее приложение без необходимости знать платформенный стек. Конечное ограничение — физические ресурсы, доступность интерфейсов, безопасность и выразительность реализованной библиотеки, а не заранее заданная категория «конструктор мероприятий».

## 2. Границы и принципы

**SHALL:**

1. Текстовая форма и визуальная форма соответствуют одному языку и одной формальной семантике.
2. Контракт имеет независимую от реализации идентичность, типы, условия, эффекты, права доступа, ошибки, версию и тесты.
3. Атомарный контракт **не раскрывается как внутренний EMS-граф**, но может быть реализован скомпилированной композицией, нативной библиотекой или системным API.
4. Составной контракт **раскрывается рекурсивно** в граф других контрактов; просмотр и редактирование могут различаться по правам.
5. Любой проверенный составной контракт может стать повторно используемой функцией, пакетной зависимостью либо атомарным артефактом после компиляции.
6. Внешняя библиотека импортируется как **пакет типизированных атомарных контрактов** с явными адаптерами и объявлениями эффектов.
7. Платформенная специфика остаётся за адаптерами; бизнес-логика программы не переписывается при выборе другой совместимой реализации.
8. Приложение работает в EMS runtime либо собирается в самостоятельный артефакт, не требующий установки IDE EMS.
9. Компилятор отвергает неподдерживаемые функции, недостающие права, несовместимые версии и невозможные связи.
10. ИИ работает через проверяемый каталог контрактов; отсутствие компонента не маскируется выдуманным API.

**SHALL NOT:** заявлять полной эквивалентности всех ОС, абсолютной защищённости локального бинарного кода или формальной гарантии правильности пользовательской идеи без тестов.

## 3. Терминология

| Термин | Определение |
|---|---|
| Contract | Публичная спецификация возможности и гарантий её исполнения |
| Atomic contract | Контракт без раскрываемого внутреннего EMS-графа; граница декомпозиции в редакторе |
| Composite contract | Контракт, реализованный графом других контрактов |
| Opaque | Видимость реализации ограничена; не обязательно лицензия или отсутствие исходника |
| Foreign binding | Привязка функции иной среды к EMS-контракту |
| Adapter | Реализация контракта через конкретный API, драйвер или сервис |
| Capability | Возможность исполнения (camera, filesystem, GPU и т. д.) |
| Effect | Наблюдаемое воздействие на состояние или внешний мир |
| EMS IR | Семантическое промежуточное представление программы |
| Package | Контракты, реализации, зависимости, манифест и подписи |
| Host runtime | Исполнение EMS внутри управляемой среды |
| Target backend | Генерация самодостаточного исполняемого артефакта |
| Agent planner | ИИ-компонент, строящий кандидат графа и тестовых сценариев |

**Ортогональные свойства:** atomic/composite ≠ source available/proprietary ≠ inspectable/noninspectable ≠ editable/readonly ≠ paid/free. Не использовать «закрытый контракт» для обозначения всех этих свойств одновременно.

## 4. Полноценный язык программирования

### 4.1. Модель

EMS — не только графический редактор. Требуется строгая грамматика **текстового EMS** и формальное семантическое ядро, позволяющее выражать всю модель вычислений и эффектов.

Типы: `Boolean`, `Int8..Int64`, `UInt8..UInt64`, `Float32/64`, `Decimal`, `String`, `Bytes`, `Duration`, `Timestamp`, `Array<T>`, `Map<K,V>`, `Set<T>`, `Tuple`, `Record`, `Enum`, `Option<T>`, `Result<T,E>`, `Future<T>`, `Stream<T>`, `ResourceHandle`, функции, пользовательские и параметризованные типы, интерфейсные типы.

Конструкции: объявления, функции, условия, циклы, рекурсия, pattern matching, обработка ошибок, асинхронные операции, подписки на события, потоки данных, преобразования коллекций, безопасное управление ресурсами и жизненным циклом. Чистые и эффектные операции различаются явно.

**Требование качества:** спецификация должна определить поведение `NaN`, переполнений, точности Decimal, сравнения, сортировки, сериализации, времени, конкурентности и отмены; нельзя отдавать решение случайному backend.

### 4.2. Две формы и один смысл

Визуальная форма состоит из узлов и типизированных портов; текстовая — из выражений, функций и объявлений контрактов. Они компилируются в общий AST/HIR и затем EMS IR. Координаты узлов, стили и пользовательские комментарии — метаданные IDE, не семантика программы. Для неподходящих для графа текстовых структур допускается представление «свернутый текстовый участок», но не несовместимый механизм выполнения.

### 4.3. Исполнение

Явно описать dataflow, control-flow, реактивность, порядок событий, side effects, пределы параллелизма, fairness, циклы, ошибки, cancellation, backpressure, транзакционные зоны, state ownership. Асинхронность и сетевые границы меняют доступные гарантии и должны быть видимы в спецификации.

## 5. Контрактная система

### 5.1. Публичная сигнатура

Минимальный контракт: `id`, `version`, `inputs`, `outputs`, `events`, `errors`, `effects`, `permissions`, `capabilities`, `preconditions`, `postconditions`, `lifecycle`, `threading`, `resource limits`, `supported execution environments`, `test vectors`, `documentation`, `license reference`.

В M0 прототипе присутствует только небольшой поднабор. Для production требуется отдельная сериализуемая расширяемая IDL, строгий резолвер версий и доказуемое соответствие ABI.

### 5.2. Атомарные контракты

Снаружи одинаковы для всех потребителей. Внутри могут находиться:

- арифметические встроенные примитивы;
- скомпилированный EMS IR / машинный код / WASM;
- FFI-привязка к C/C++/Rust и другим языкам;
- вызов системного API, SDK или драйвера;
- локальный процесс либо удалённый RPC/API.

Пользователь видит входы, выходы, ограничения и метаданные, но по умолчанию не раскрываемый на канвасе граф. При компиляции составного контракта в атомарный публичный интерфейс должен сохраняться; исходный граф можно хранить отдельно. Не обещать невосстановимость алгоритма по бинарному артефакту.

### 5.3. Составные контракты

Пользователь может раскрывать составные контракты многократно вплоть до атомарных границ. Это основа рекурсивной композиции. Интерфейс можно ограничивать правами, но «read-only graph» не означает atomic. Поддерживаются входы, выходы, внутреннее состояние, события, транзакции и границы изоляции.

**Пример:** `WCA.AverageOfFive` использует нормализацию результатов, правила DNF и штрафов, сортировку, исключение крайних результатов, расчёт и округление. Упрощённая арифметика `(sum-min-max)/3` — отдельный учебный пример, не официальный WCA алгоритм.

### 5.4. Семантика и поведение

Типизированность не заменяет проверки поведения. На уровне контракта декларируются предусловия, возможные состояния отказа, детерминированность, протокол вызова, эффекты, требуемые права и допустимые последствия отмены. Некоторые утверждения проверяемы статически; остальные подтверждаются тестами, runtime-checks и аудитом. В любой технической документации различать «типобезопасно», «контрактно совместимо» и «фактически корректно».

### 5.5. Версионирование и linking

Пакетные имена стабильны и namespaced. Использовать SemVer либо строго документированную систему совместимости; lockfile и хеш артефакта фиксируют реализацию. Контракт имеет несколько реализаций; компилятор выбирает реализацию по target, capabilities, версии, разрешениям, эффектам, требованиям производительности и политике доверия. При нехватке информации сборка завершается диагностикой, не произвольным выбором.

## 6. Импорт библиотек и межъязыковая совместимость

**Целевая операция:** пользователь выбирает библиотеку, доступные функции превращаются в набор атомарных блоков и типов EMS. EMS не переписывает сам алгоритм, а связывает его с контрактным интерфейсом.

Поддерживаемые стратегии в порядке реализации: C ABI и готовые C headers (через контролируемый генератор), WASM Component Model/WIT, JavaScript/TypeScript host integration, Python service adapter, Rust/C++ через экспорт стабильного ABI или генератор специфических binding, IPC/HTTP/gRPC внешних сервисов. Автоматическое прочтение нативной бинарной библиотеки с восстановлением смысловых контрактов не гарантируется.

**Pipeline:** detect format → discover exports/headers/interface → map foreign types → propose atomic contract candidates → declare errors/effects/permissions → generate binding shim → link target implementation → run conformance/negative tests → publish package. Где семантика неизвестна, обязательная ручная разметка.

Особые случаи: opaque pointers/resources, ownership, alloc/free, callbacks, exceptions, async invocation, thread affinity, cancellation, panics, Python GIL and subprocess lifecycle, serialization, secret propagation, nonportable system dependencies. Каждый импортированный блок обязан объявить ABI и поддерживаемые цели.

**Crypto:** только существующие, актуальные и проверяемые реализации; запрет самодельной криптографии. Контракты для AES-256-GCM, Argon2id, Ed25519, ML-KEM и др. могут описываться независимо от выбранной библиотеки, но должны иметь точные параметры, тестовые векторы и правила работы с ключами/nonce. Секреты не проходят через обычные логи/UI инспектор.

## 7. Системные API и драйверы

EMS предоставляет единый набор базовых системных **возможностей**, а не обещание 1:1 повторить каждую системную функцию. Категории: файловая система, сеть, storage, криптография, память и процессы, таймеры и часы, сенсоры, камеры, геолокация, уведомления, устройство ввода, USB/Serial/Bluetooth, аудио и видео, GPU, графика, окна и UI, сетевые транспорты, IPC, базы данных, cloud integrations, embedded IO.

**Один контракт — несколько реализаций**, например `Device.Camera.Capture` → Android CameraX / iOS AVFoundation / Web MediaDevices / desktop system provider. Эквивалентен стандартный формат результата и политика ошибок, но не физическая картинка, аппаратные ограничения и разрешения пользователя.

Для платформенно-уникальных возможностей допускаются узкоспециальные контракты. При невозможности реализовать требование на целевой платформе — явная диагностическая ошибка, degrade strategy по разрешённой политике или исключение соответствующего target.

**Драйверы:** либо EMS-native plugin, либо адаптер существующего системного драйвера/SDK. Требования на discovery, capabilities, доступность, ownership порта и безопасность аппаратных действий. Не путать наличие драйвера в ОС с возможностью прямого обращения к нему из приложения.

## 8. Единая UI-модель

Существуют типизированное EMS UI Tree и декларативный UI/DOM контракт. Browser DOM, Android Views/Compose, iOS UIKit/SwiftUI и десктопные виджеты отображаются в одинаковую семантическую модель состояний, событий, accessibility и жизненного цикла. Визуальные примитивы `UI.Create`, `UI.SetProperty`, `UI.OnEvent`, `UI.Bind`, `UI.Layout` и набор высокоуровневых компонентов доступны и текстово, и графически.

**Тождественность** означает определённый контракт поведения, **не** пиксельную идентичность и **не** одинаковый доступ к OS-native функциям. Для систем, у которых capability отсутствует, adapter сообщает это явно. Редактор позволяет выбрать реальный элемент приложения, проследить путь до графа, изменить и применить патч.

Нужны reactive state owner, lifecycle scopes, поток событий, transactional render updates, theme, localization, accessibility, focus, navigation, input models, безопасность DOM (XSS) и plugin isolation. Базовый DOM node может сосуществовать с native capability node в одном логическом приложении.

## 9. Runtime, компилятор и standalone export

**EMS Runtime:** разрешает пакеты/контракты, выполняет граф/IR, координирует state, async, эффекты, ресурсы, плагины, разрешения, диагностику, версионирование. Не обязан интерпретировать GPU/frame-sensitive задачи; интеграции с оптимизированными нативными движками — штатная возможность.

**EMS Compiler:** parse → resolve → type/effect check → lower to IR → optimize → partition if distributed → select target bindings → link → package → test. Backend candidates: JS/Web, WASM, LLVM/native, Android/iOS packagers, server and embedded. **Никакой backend не объявляется работающим до реального запуска и acceptance.**

**Независимость:** скомпилированное приложение не должно требовать установленного графического редактора EMS, полной EMS IDE или EMS cloud для запуска; допустима встроенная runtime support library и отдельно объявленные внешние сервисы. Исходная логика одна, target binding различается. Сборка под iOS может требовать среду Apple SDK и подписи; не маскировать платформенные требования.

**Sealing:** составной граф → pure/compatible target compile → атомарный пакет (public manifest + binary/module). Исходный граф может оставаться в workspace у автора. Компилятор может инлайнить реализацию или линковать бинарную. Запрет попыток разгрузить секреты в произвольный артефакт.

## 10. Распределённые приложения

Одна логическая система может иметь UI на телефоне, server storage, output overlays, hardware IO и web dashboards. Deployment topology задаётся отдельным разделом IR/manifest: `client`, `server`, `edge`, `device`, location and trust zones. Для межузловых связей: serialization, authentication, authorization, schema evolution, ordering, retries, dedupe, idempotency, eventual/strong consistency by contract, offline queue, reconciliation, clock and failure semantics.

**Ни один граф не получает автоматически «надёжную сеть»**. Транспортные гарантии объявляются и проверяются. ИИ и визуальные инструменты обязаны показывать пересечение device/network boundary.

## 11. Безопасность и доверие

Capability grants enforced at runtime and included in build manifest: filesystem read/write, network, camera/mic, sensors, location, process execution, USB/serial, credentials, secrets, payment, hardware control. Trusted/untrusted implementation modes. Explicit approval before sensitive effects, device operations and payments. Host may not execute imported arbitrary code without sandboxing. Package signing, integrity, lockfile, revocation, vulnerability scanning, permission diff, supply-chain verification; user-origin identity and audit.

M0 trusted JS registry is NOT a sandbox. Permission declarations are contract metadata, not OS kernel enforcement. Do not use it to execute arbitrary downloaded libraries.

## 12. EMS Visual IDE

Node editor, typed ports, nested composite expansion/collapse, code editor for textual EMS, graph inspector, live data inspection, contract browser, package manager, errors, permission prompts, step-through debug, profiling, runtime selection and target packaging. Canvas coordinates and stylistic metadata separate from language semantics. Provide undo/redo, semantic diff, history, reusable snippets, templates and version control integration.

**UX key:** a user can click a `Scoreboard` block to inspect UI bindings, then further inspect `AVG5`, down to atomic arithmetic, while crypto/library binding remains an atomic leaf. Editing an imported atom requires going to its external source or another implementation—not fabricating a composite graph.

## 13. AI-assisted programming

AI agent (model-replaceable) interprets idea, discovers **actual** contracts from registry, proposes graph, validates types and capabilities, generates behavioral tests, runs in limited environment, shows diff, applies only approved effects and produces deployment packages. AI should choose functionality, not guess unknown library method names. A missing capability becomes an explicit user decision: create composite, write text EMS, import library, purchase plugin or request device adapter.

LLM outputs are proposals subject to deterministic validation. Different AI providers may be used. External permissions and security boundaries cannot be waived by model prompt.

## 14. Marketplace and economic model

EMS ecosystem sells infrastructure for creating and building applications, cloud runtime/CI, hosting and commercial packages, not mandatory lock-in. Catalog supports open-source and commercial contracts, private enterprise registries, compiled atomic packages, full apps, templates, hardware drivers, foreign adapters, backend extensions. Licensing, package ownership, receipts and revocation handled separately from atomic/composite status.

A commercial atomic contract may depend on other contracts, provided their licenses permit such distribution. Compiled code at client edge cannot guarantee secrecy; remote contract services or genuine hardware-supported isolation are separate delivery options.

## 15. Reference product demonstrations

1. Arithmetic Ao5: text EMS ⇄ graph; type-check; standalone JS; seal into atomic and consume it in another composite.
2. Import JS math library → multiple atomic blocks in library package; type-check and call each.
3. Cryptography: import audited external implementation; verify known vectors, nonce rules and secret handling.
4. Musical bingo: roles, player cards, music, shared sessions, broadcast UI, offline options; legacy origin and first customer-facing product.
5. Speedcubing: official WCA Ao5, device timer via adapter, multi-device UI, scoreboard.
6. Cross-target application: **exact same logic graph** compiled as standalone Web and a second real target (native/desktop or separately verified environment), with conformance suite.
7. EMS AI prompt-to-graph: user specifies app, model selects existing catalog, validation & tests, preview and target export.

## 16. Nonfunctional requirements

Reproducible builds where possible; deterministic pure semantics; observability and structured errors; memory/resource limits; explicit shutdown and cancellation; key material never logged; telemetry opt-in and privacy; no undisclosed cloud dependency. Performance budgets are benchmarked per operation and backend, **not** declared arbitrary universal speed targets. Accessibility, localization and usable editing of large graphs are product requirements.

## 17. Delivery stages

Implement M0 reference semantics and acceptance fixtures first. Then M1 formal language, M2 editor, M3 Web execution, M4 standalone export, M5 foreign library import and compiled atomic packages, M6 second target, M7 distributed runtime, M8 hardware integrations, M9 AI-assisted composition, M10 registry/security/hardening, M11+ ecosystem. Milestones may run in limited parallel when their dependencies are fixed; no broad launch without conformance evidence.

See `docs/plans/ROADMAP.md` for detailed checkpoints and `tasks/backlog.json` for implementation tasks.

## 18. Acceptance definition

A claim is accepted only if accompanied by an executable test/report in `docs/qa/` and the exact revision. Target promises (Web/Android/iOS/etc.) are accepted separately. For example, sealed compiled atom ≠ secure/encrypted binary; parsed imported exports ≠ audited FFI correctness; syntactically valid graph ≠ correct user requirement. The acceptance matrix documents every distinction.

## 19. Owner-approved agent policy

For any delegated autonomous work, use **only GPT-6.1 Sol or GPT-6 Luna**, never GPT-5.6 Sol or Astra. Verify actual model selection in the runtime; absent such guarantee, do not launch agent delegation. See `AGENTS.md` and `.agents/policy.json`.
