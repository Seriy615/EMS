# Структурированный control IR и finite runtime

EMS-015; AC-033; G-01/02/03/11/12. Реализация: `src/frontend/control.mjs`, `src/ir/control.mjs`, `src/runtime/control.mjs`, `src/compiler/control.mjs`. Это исполняемый control-flow срез, не завершение полного языка или M1.

## Артефакт

`ems-ir/2`, профиль `ems-control-finite/1`: id/version, entry и functions. Function содержит id, упорядоченные inputs, output, explicit requirements, computed policy и body — массив semantic statements. Схема `schemas/control-ir.schema.json`; executable verifier дополнительно проверяет scopes, типы, control exits, сигнатуры, pinned host versions, return coverage и транзитивные effects. Canvas/source locations не входят в артефакт. Sidecar пока содержит function locations; полный statement/node source map для IDE остаётся впереди.

Это общая семантическая форма для текста и будущего визуального редактора control regions, а не копия AST для отдельного текстового interpreter. IR можно независимо построить/изменить и проверить. Dataflow IR v1 продолжает работать: он не подменяется новым форматом. `graphFromIR` намеренно не превращает control blocks в фиктивные M0 graph nodes. Общие `parseIR`, `serializeIR`, `executeIR`, `compileIRToJS`, `signatureIR` и `checkIRPolicy` выбирают соответствующий проверенный профиль.

Expression forms: literal/local, unary, binary, array/index, named assignment, call. Call target явно различает local function id и registered contract id/version; arguments следуют порядку публичных портов. Statement forms: let (mutable/immutable), expression, return, block, if, while, for, break, continue. Неподдерживаемый или лишний field/тип/оператор отвергается до выполнения. Primitive types остаются Number (finite binary64), NumberArray, Boolean и String. Generic helpers специализируются в concrete functions; одинаковая специализация переиспользуется, локальная рекурсия разрешена под budget. Imports/extern не загружают и не выполняют host-код при проверке.

## Значения и порядок

В отличие от demand-driven SSA v1, каждое let/expression statement этого профиля выполняется в исходном порядке даже при неиспользуемом результате. Присваивание меняет только объявленную mutable local; параметры и loop binding immutable. Inner block имеет lexical scope, а присваивание outer binding обновляет тот же cell. Обычный own-text frontend теперь также сохраняет eager statement semantics для straight-line programs через explicit sequence в call IR v1; добавление control-flow не меняет смысл уже существующих let. Legacy M0 dataflow artifacts остаются demand-driven. Переход на v2 явен в артефакте; automatic frontend selection выбирает v2 для control/mutation/index/computed-array forms, новых операторов и локальной рекурсии. Можно явно выбрать lowering `{profile:'control'}`; `{profile:'call'}` сохраняет исходный legacy SSA/demand-driven профиль и его ограничения. Это explicit compatibility mode, не семантика полноценного текстового EMS.

if вычисляет только выбранную ветвь. &&/|| вычисляют right operand только при необходимости и возвращают Boolean. Other arguments/operands вычисляются слева направо. while повторно вычисляет condition, for один раз вычисляет и копирует NumberArray перед итерациями. break/continue относятся к ближайшему loop; return выходит из function через любой вложенный block. Каждая function invocation имеет новые locals. Ошибка прекращает последующие statements/operands; в ReactorSession draft state откатывается по AC-032.

Каждый expression result проверяется на declared finite type, включая промежуточное переполнение. / и % с нулевым делителем дают DIV_BY_ZERO (включая -0). Numeric == считает +0 и -0 равными; NumberArray equality структурная по длине и === элементов. Relational operators определены только для Number; implicit coercion нет. Index требует safe integer в [0,length), иначе BOUNDS_ERROR с index/length. Computed arrays содержат только Number. Literal signed zero использует typed "-0" encoding; JSON roundtrip IR сохраняет его.

## Effects, отмена и пределы

Verifier повторно вычисляет policy из explicit requirements и всех синтаксических вызовов, включая обе ветви и рекурсивные local call edges; host composites анализируются транзитивно. Policy, не совпадающая с вычисленной, даёт EFFECT_MISMATCH. Требования policy всей entry function проверяются перед первым вызовом; untaken effect branch не выдаёт grants автоматически. Runtime передаёт state/signal context существующим trusted atoms/composites; отмена проверяется на semantic boundaries и host Promise await. Это не исполнение source-language Future/async/Stream и не plugin sandbox.

Shared invocation budget: maxSteps=100000, maxDepth=64 по умолчанию. Tick до каждого statement, expression и function invocation; for также tick до каждой итерации. Все локальные calls разделяют budget. Положительные safe integer options обязательны, maxDepth не более 256. Превышение — STEP_LIMIT/CALL_DEPTH с соответствующим limit в details. Дополнительная одинаковая runtime/standalone защита — максимум 256 одновременно активных expression evaluations (EVALUATION_DEPTH), чтобы сложная рекурсия не уходила в непереносимый native JS stack overflow. Предел выражений учитывает suspended caller expressions.

Verifier ограничивает артефакт 1000 functions, 20000 structural nodes и depth 128 (IR_LIMIT). Это не byte-size sandbox и не accounting стоимости trusted host implementations. Host graph calls сохраняют собственные reference limits; их внутренние операции не входят в control tick budget. Async interpreter может уступать microtasks, но fairness относительно timer/IO queues и preemption synchronous host loops не обещаются.

## Standalone и CLI

Pure backend генерирует JavaScript branches, loops, lexical locals и local function calls из control blocks, а не встраивает AST parser или зависимость от EMS. Value helpers общие с graph backend; pure registered contracts используют существующий JS compiler в изолированных wrappers. Compiled execute(inputs, {maxSteps,maxDepth,signal}) имеет те же semantic ticks и ошибки. Реальные effects/capabilities пока дают UNSUPPORTED_TARGET: portable state/IO linker ещё не реализован.

```bash
node tools/ems.mjs module-ir examples/factorial.ems --entry demo.Factorial --out dist/factorial.ir.json
node tools/ems.mjs ir-run dist/factorial.ir.json '{"n":5}'
node tools/ems.mjs ir-build dist/factorial.ir.json --out dist/factorial.mjs
```

Пример принимает finite Number; integral/nonnegative domain constraint для математического factorial ещё не является precondition IDL. Он демонстрирует imperative multiplication для обычных положительных целых, не library-grade factorial. Typed throw/catch/finally выполняются в отдельном профиле ems-control-errors/1 (AC-034, CONTROL_ERRORS.md). Match/algebraic runtime, using/resource lifecycle и language async ещё unsupported.

Evidence: `tests/control.test.mjs`: ветви, loops/break/continue, mutable scopes, generics/recursion, arrays/index, negative zero, structural equality, short circuit, overflow/bounds/division errors, exact step thresholds, depth guards, tampered IR, effect preflight, state rollback и CLI export. Standalone запускается отдельным Node process вне workspace; это ещё не browser/native P1 proof. EMS-015 IN_PROGRESS: далее algebraic/resource и Future/Stream semantics, визуальное представление новых blocks, более полный конформанс.

Расширение `ems-control-algebraic/1` определено в CONTROL_ALGEBRAIC.md: Option/Result, typed construct и exhaustive match, включая error statements. Прежние profile gates сохранены.

Language async/Future реализованы отдельным профилем `ems-control-futures/1` (AC-036, CONTROL_FUTURES.md): explicit async markers, typed await, execution-owned handles, supervised join/abort, async standalone. Прежние profiles и primitive Registry/state ABI сохранены. Stream и гарантированный resource lifecycle остаются открыты.

AC-037: Stream<T>, typed intrinsics/for await и обязательные computed localEffects реализованы в ems-control-streams/1 (CONTROL_STREAMS.md). Bounded channels/FIFO/backpressure/cancellation, terminal task wakeup, actor rollback/replay и standalone используют общий IR/helpers. ResourceHandle/using lifecycle и foreign Stream adapters ещё не реализованы.
