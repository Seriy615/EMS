# Статические экземпляры, переходы и инварианты — AC-125

Это первый исполняемый профиль контрактов с состоянием EMS-038. Он добавляет
реальные native declarations и versioned semantic module; не объявляет завершёнными
всю модель экземпляров, UI notation, динамическое создание или Studio authoring.

```ems
@Counter {
    value: Number = 1;
    +Change(delta: Number) -> Number {
        value = value + delta;
        return value;
    }
    ? value >= 0;
}
@Counter #left;
@Counter #right { value: 5; }
```

## Грамматика и связывание

Общий EMS tokenizer/parser выдаёт located StatefulContractDeclaration,
ContractInstanceDeclaration, StateFieldDeclaration, TransitionDeclaration и
InvariantDeclaration. Это расширение той же грамматики, не отдельный parser/evaluator.
Инициализаторы полей, `?` predicates и overrides заканчиваются `;`.
Переход имеет явные параметры и возвращаемый тип; тело использует обычные
let/if/while/for/calls/return EMS. Предварительный вариант `+Increment { ... }`
без сигнатуры не объявлен реализованным. Старые `@Main(...)->T` и fn сохраняются.

Определения имеют ID/version и typed поля/операции. Экземпляр ссылается на
определение/version и имеет свою идентичность, начальные значения и implementation
entries. Общие инварианты принадлежат определению. Module implementation — единый
control IR2 с функциями всех переходов, поэтому правка общего вызываемого
перехода не оставляет устаревшие копии у callers. Native lowering специализирует
body на статические экземпляры; graph API может менять конкретную implementation
binding, сохраняя interface/invariants определения. Публичные IDs не смешиваются
с license/package/visibility или обещанием секретности реализации.

В теле операции bare field reference читает её собственное состояние; присваивание
пишет через genuine kernel state contracts. `self::Change(...)` вызывает операцию
того же экземпляра, `right::Change(...)` — явно названного локального экземпляра.
Вложенные вызовы — обычные IR function calls, не новый event dispatch.
Поля не могут затеняться параметром/локальным binding. Namespace `ems_` у global
объявлений и transition bindings зарезервирован для lowering. Типы конечные,
канонические; поддерживаются aliases/generic helpers существующего frontend.
First-class instance references, dynamic allocation/aliases и generic prototypes
не реализованы. Source imports требуют будущего module linker.

## Создание и переход

Создание — async factory. Сначала проверяются полный semantic module, type/policy
и genuine implementations. Pure initializers выполняются под одним общим
creation work budget, затем проверяются типы/границы данных и все инварианты.
До успеха factory не отдаёт наблюдаемый session. Overrides не обходят инварианты.
Сигнал отмены, доставленный сразу после вызова factory, отвергает создание.

Каждый внешний dispatch запускает существующий ReactorKernel FIFO/draft.
Body и все проверки инвариантов связаны в один проверенный IR2 entry, с одним
work/depth budget. Чтения видят собственные записи. Инварианты проверяются после
успешного возврата body, перед commit; между присваиваниями и вложенными операциями
они не проверяются. Все локальные экземпляры принадлежат общей memory-транзакции:
нарушение у одного откатывает изменения остальных. Это не distributed commit.

False predicate даёт terminal `INVARIANT_VIOLATION` с instance/invariant/phase.
Ошибка вычисления predicate, например DIV_BY_ZERO, остаётся соответствующей
ошибкой и также откатывает draft. Типовая ошибка, отмена, CALL_DEPTH и STEP_LIMIT
не публикуют частичное состояние или результат успешного перехода. Очередь
исходящих языковых событий/after-commit IO ещё не реализована; failed transition
не выдаётся за успешное событие. trace использует существующий reactor outcome model.

Predicate — typed pure Boolean IR с field values в качестве параметров. Он не
читает ambient state. Initializers и predicates допускают локальные pure helpers
и настоящие finite/typed Array/Map intrinsics. Transition допускает дополнительно
genuine state.read/write. Произвольные host callbacks, fake pure/state metadata,
ресурсы, внешнее IO/эффекты, async/Future/Stream здесь отвергаются до исполнения.
Не доказывается математическая тотальность любого helper: исчерпание общего
бюджета или ошибка вычисления означает отказ создания/перехода.

## Артефакт и исполнение

`ems-instance-module/1` содержит definition interfaces/initializers/predicates,
static instance bindings и общий implementation control IR2. Это семантический
артефакт, независимый от canvas coordinates. Closed fields, own enumerable data,
типизированные signatures и genuine dependencies проверяются повторно при
parse/create/build. Accessors не вызываются. Канонический serializer сохраняет
IR signed-zero encoding. Лимиты:16 definitions/instances,32 fields/transitions/
invariants на definition,128 total slots/transitions/instantiated invariants,
1MiB UTF-8 module; стандартные IR/type/value limits также действуют. Standalone
artifact ограничен2MiB. Version1 профиля фиксирует contract versions1.0.0.

Runtime factory `createInstanceSession` возвращает snapshot/dispatch/trace/close.
Generated independent ESM exports async `createSession` с тем же интерфейсом.
Snapshot отделён от живого состояния. Два session одной definition независимы.
Состояние живёт до закрытия owner; новый owner начинает с initial. Caller явно
даёт policy state.read/state.write, maxSteps/maxDepth/maxQueue/recordTrace.
Начальные значения не исполняются при сборке или импорте generated module.

`createInstanceWorker` исполняет тот же module через настоящий Web Worker;
очередь/deadline ограничены. cancel/deadline прекращают owner, клиент хранит только
последний подтверждённый snapshot. Это не обещание восстановления незавершённой
сессии или durable disk storage. Browser и Node JS targets проверяются отдельно;
наличие ESM не доказывает native Windows/Android/iOS backend.

## Граф и текущая доступность

`transitionFlow`/`applyTransitionFlow`, `invariantFlow`/`applyInvariantFlow`
используют обычный FlowProjectEditor, typed cards/ports и те же control IR функции.
Они не создают отдельную сущность «алгоритм». Predicate signature/purity остаются
обязательны; invariant boundary при редактировании body пересобирается linker-ом.
Графы сохраняют все instance transition entries, включая невызванные текущим
entry; изменение shared callee действует на его callers. Коллизии generic/helper
функций исключаются гигиеническим namespace при linking predicates и bodies.

В этой приёмке граф редактируется через существующий **API модели графа**. Полный
Studio документ/маршрут для native stateful modules ещё не подключён. Обычный
text workspace явно отвечает INSTANCE_PROFILE_REQUIRED, а не открывает неверную
картинку. Не предлагается импортировать state-bound body как самостоятельный
pure graph: для него требуется registry/context экземпляра. Full inverse text,
live module patching/state migration и UI binding к instance methods — следующий
срез EMS-038/043, не готовая функция этого релиза.

## Воспроизведение

```
node tools/ems.mjs instance-ir examples/contract-instances.ems --out /tmp/counters.module.json
node tools/ems.mjs instance-run /tmp/counters.module.json --events '[{"instance":"left","transition":"Change","inputs":{"delta":-1}}]'
node tools/ems.mjs instance-build /tmp/counters.module.json --out /tmp/counters.mjs
```

CLI run даёт разрешения только локального memory state; при failed event печатает
реальный отказ/after snapshot и выставляет ненулевой exit code. Library factory
не выдаёт capabilities молча. В примере left1→0, следующая попытка0→-1 отвергается,
right остаётся5. Прямой файл `examples/contract-instances.module.json` воспроизводим
из текстового примера.
