# Статическое происхождение значений control IR

`analyzeControlOrigins(ir, registry, options)` экспортируется из `src/ir/index.mjs`. CLI:

```sh
node tools/ems.mjs module-origins examples/origins.ems --entry main --out origins.json
```

Frontend проверяет модуль и явно выбирает существующий control lowering. Анализ принимает validated `ems-ir/2` профили finite/errors/algebraic/futures/streams/resources; dataflow `ems-ir/1` напрямую не поддерживается. Новой исполняемой семантики нет. Программа и host implementations не исполняются. IR/registry не изменяются.

## Артефакт и идентичность

JSON `ems-control-origins/1` содержит `entry`, `mode`, `securityDecision:false`, `precision` и `nodes`. Узел имеет `id = JSON.stringify([function, path])`, `function`, `path`, `kind`, `type`, необязательное `name`, массив `dependencies` и массив `origins`. Это отдельный semantic sidecar: canvas координат, runtime values, grants и inspection witnesses в нём нет. `type:null` означает синтетический outcome/state узел либо не восстановленный тип структурного pattern/iteration binding; не доказательство типа исполнения.

Пути соответствуют вхождениям в control IR, а не identity JavaScript object. Один объект, использованный дважды в IR, даёт два узла; одноимённые sibling declarations имеют разные пути. `/inputs/i`, `/return`, `/outcome` — summaries функции; `/shared-state` у entry — объединённая неизвестная область внешнего/ресурсного/потокового состояния всего анализируемого модуля. Порядок функций/вхождений сохраняется; dependencies и origins сортируются. Повторный анализ того же validated IR даёт тот же JSON.

Происхождения: `input` (function/path), `literal` (function/path без содержимого литерала), `boundary` (contract), `effect`/`capability`/`local-effect` (name), `unknown` (reason). Имена функций, переменных, контрактов и типов включены: это не средство скрыть исходную структуру программы. Boundary и input labels не означают публичность данных.

## Правила зависимостей

1. Объявление зависит от initializer и управляющих зависимостей. Local read зависит от декларации. Assignment добавляет зависимость в общий узел изменяемой декларации: locals **flow-insensitive**, все возможные записи объединены.
2. Операторы, массивы, индексация, constructors и await объединяют зависимости операндов. Pattern binding зависит от всего match subject; индексация не различает элементы массива.
3. Вызов функции связывает actual arguments/control с formal inputs, а call result — с return summary. Calls **context-insensitive**: разные вызовы объединены; формальные input labels остаются символическими метками даже при constant actual arguments. Рекурсия обрабатывается fixed point без выполнения программы.
4. Conditions/iteration subjects входят в зависимости тела и последующих инструкций. После структурных ветвей/циклов/try объединяются накопленные зависимости вложенных тел: ранний return/break/continue не теряет управляющее условие. Предшествующие initializer/expression также включаются в последовательные зависимости. Это намеренное избыточное приближение, а не доказательство фактического влияния каждого предшествующего значения.
5. Outcome summary объединяет потенциально наблюдаемые ошибки/выходы и влияет на return summary. Catch получает outcome и `unknown:exception-path`; точный exception routing не доказывается.
6. Contract call имеет `boundary`, `unknown:opaque-boundary` и объявленные effect/capability labels. Composite дополнительно имеет `unknown:composite-boundary`; внутренний граф здесь не раскрывается. Даже «чистый» trusted foreign implementation не признаётся прозрачным автоматически.
7. Resource/stream/using и effectful/opaque composite boundaries объединяют аргументы и control в shared-state summary; соответствующие результаты зависят от него. Это учитывает запись через alias и чтение через другой handle, но не различает ресурсы, события, устройства, закрытия и жизненные циклы. `unknown:shared-state` остаётся явным. For-await дополнительно отмечает stream.read. Unreachable функции могут усиливать shared-state overapproximation.

## Fixed point и лимиты

Метки распространяются по dependencies до fixed point. Для каждого узла домен — множество origin descriptors либо единственный `unknown:origin-budget` (поглощающее верхнее значение при переполнении). Переполнение учитывается и при seed, и при propagation; верхнее значение никогда не смешивается с другими метками. Обычные unknown reasons сохраняются вместе с известными зависимостями, чтобы не терять обнаруженные входы.

Defaults / разрешённые диапазоны: maxNodes2048 /1..8192; maxOrigins64 /1..256; maxBytes1048576 /128..4194304 (UTF-8 JSON); maxDependencies32768 /1..262144; maxSteps100000 /1..1000000 (worklist iterations). Неверный numeric limit даёт `INVALID_ANALYSIS_OPTION`; остальные budget failures — `ANALYSIS_LIMIT`, без частичного артефакта. Лимиты sidecar не заменяют проверку размеров входных файлов, ресурсов frontend или изоляцию untrusted build host.

## Граница гарантии

Это исполняемый инструмент структурного анализа и основа следующего этапа политики происхождения, **не готовая система конфиденциальности**. `securityDecision:false` обязательно: absence of effect/unknown не разрешает раскрытие. Нет labels public/private, dynamic taint, declassification, доказательства noninterference, точного heap/exception/concurrency analysis, анализа реализации FFI или native/compiled transport. Проверки фиксируют покрытые зависимости и overapproximation; полный soundness/security proof не заявляется.

AC-086 entry effect barrier отладчика сохраняется. Будущая политика должна явно учитывать input/literal classification, все unknown/boundary labels и межсобытийное состояние, иметь conformance fixtures и negative leakage tests до любого ослабления этого барьера.

## Подтверждённые intrinsic операции (AC-093)

Call не считается opaque только при existing coreIntrinsic(item) proof: actual executor в private WeakMap createCoreRegistry, matching emitJS, exact ordered inputs/output/id/version, пустые effects/capabilities, без interfaceBoundary. Это поставляемые core/finite stdlib ABI; название core.add, произвольный host execute, package signature или пустые effects сами недостаточны. Seed intrinsic {abi,operation} — нейтральная public метка подтверждённого преобразования; результат всё равно содержит аргументы/control sources. Нет declassification: private/unknown operand сохраняет свой класс. Externally fabricated descriptors не принимаются classifier.

Opaque implementation может менять переданный агрегат. При наличии opaque boundary в анализируемом модуле все NumberArray-bearing typed nodes (включая nested Option/Result) зависят от unknown shared-state/opaque-mutation region. Это flow/context-insensitive conservative отказ, включая unreachable declarations; не точный alias analysis. Закрываются и public aggregate inputs, чтобы чужая функция не внедрила значение и не раскрыла его через снимок исходного массива. Ordinary outputs/mutations остаются семантикой программы; закрывается диагностическая проекция.

При origin-aware inspection runtime делает execution-local registry snapshot callbacks, input/effect/capability metadata, composite graphs/interface descriptors до binding/classification и исполнения. Diagnostic callbacks не могут заменить underlying core entry после classifier. Только режим с originPolicy использует snapshot; обычный reference runtime не объявляется immutable plugin host или sandbox.

Trust boundary — EMS проект против неподтверждённой реализации и diagnostic metadata. Trusted host realm и стандартные JS primitives остаются предположением M0; hostile privileged JS, monkeypatch глобальных примитивов, arbitrary library isolation, точный heap/noninterference/cross-event/native/compiled debugger не доказаны. Root grants/effect/protected/finite copier/budgets сохраняются. Graph IDE с explicitly public roots теперь показывает actual completed sum5; private input остаётся закрытым, непрозрачный replacement снова даёт unknown.
