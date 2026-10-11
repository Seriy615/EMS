# Resource interface IDL v1 — lifecycle binding

EMS-016 IN_PROGRESS, AC-041, CONT-01/07/08 и G-03/08/11/15. Новый public profile ems-resource-interface/1 расширяет обычную форму interface **обязательной** lifecycle декларацией. Old ems-contract-interface/1 не принимает lifecycle field. Binding descriptor остаётся ems-contract-binding/1 с exact interface/implementation pins и targets. Validator/API/CLI используют validateContractInterface/registerContractBinding/compareContractInterfaces, отдельного параллельного языка нет.

## Форма и типы

Base fields: id/version, ordered inputs, output, errors, semantics, conditions. Output обязательно ResourceHandle<valueType>. lifecycle содержит ownership execution, canonical finite/algebraic valueType, read, write (null или операция), release. Live Future/Stream/ResourceHandle внутри payload запрещены существующим serializable value grammar. Native reference binding installation пока требует primitive inputs/valueType; advanced algebraic native ABI не выдаётся за работающий.

read/write operation: errors и conditions {pre,post}. У read нет пользовательских входов, поэтому pre пустой; post может проверять result. У write один typed input value, result того же valueType; pre/post используют существующие nonzero/positive/nonempty predicates. release содержит только errors; callback result игнорируется, пользователь получает lifecycle status/RESOURCE_CLEANUP, а не native return value. Ни opaque native value, ни handle нельзя использовать как numeric predicate.

Factory base errors/conditions относятся к acquire; factory post может проверять только typed inputs, поскольку output opaque. Post observes params после callback, как обычный finite IDL. Это не static theorem proving и не API для произвольных scripts. Value/error/condition typing проверяются общими IDL/control helpers. Пример полного readonly file interface — examples/resource-interface.json.

## Выполнение и ownership

registerContractBinding выбирает actual native resource implementation, проверяет target, exact versions, ordered signature/valueType, write availability, determinism declaration и whole-lifecycle effect/capability budget до callbacks. Все фазовые host permissions входят в conservative semantics union; global preflight проверяет его до acquire. Более чистая реализация не снимает interface grants. Декларации callbacks доверенные; in-process JS не ограничен OS sandbox.

Installed public contract сохраняет specialized atomic resource backend, opaque native value и execution-owned ResourceHandle. Это не третья editor representation. Using/LIFO/fallback, resource budgets, close/read-only/use-after-close, cancellation и deadline semantics из CONTROL_RESOURCES.md продолжают действовать.

Runtime исполняет factory preconditions **до** actual callback; actual acquire Promise остаётся в resource operation tail. Runtime сначала записывает returned native value под своё владение, затем проверяет factory postconditions и только после них раскрывает handle программе. Отказ postcondition/type check после acquisition не теряет ресурс: execution fallback вызывает release. Late cancelled acquisition тоже остаётся наблюдаемой и получает release attempt. Нельзя гонять собственный cancellation race внутри metadata adapter и потерять native completion.

Read/write guard validates typed payload и postcondition, сохраняя actual native tail. Read/write value copies, scopes и signal прежние. Cancellation завершает EMS ожидание, но release ждёт quiescence actual IO; timeout может отложить cleanup до реального завершения. Release получает отдельный cleanup signal и исполняется при primary error/cancel, независимо от maxSteps. Metadata guard не перепроверяет grant после отмены и не пропускает release из-за failure precondition.

## Error ABI и nested bindings

Acquire/read/write/release имеют отдельные declared error sets. Typed USER_THROW payload проходит existing envelope/value validation и catch для acquire/read/write; неизвестная ошибка превращается в UNDECLARED_CONTRACT_ERROR без private host payload. Kernel cancel/budget/type/condition diagnostics сохраняются. Release failure агрегируется existing RESOURCE_CLEANUP; diagnostics сохраняют code/binding/resource, без native message/value или typed payload. Primary error остаётся primary, secondary cleanup diagnostics прилагаются согласно CONTROL_RESOURCES.md. Declared release errors не обещают физического освобождения, если callback отказал.

Rebinding public resource сохраняет resourceBoundaries chain: validated frozen descriptors, outer→inner preconditions, один actual callback, inner→outer post/error gates. Acquire post отдельно inner→outer после ownership. Release callback вызывается один раз независимо от количества interfaces. Поэтому weaker outer interface не снимает stricter inner lifecycle conditions. Общая chain depth ограничена 32; превышение rejected before callbacks. Readonly public interface может скрыть physical write callback; writable public interface требует actual write. Write availability консервативно invariant при version compatibility.

Registry cloning для frontend/reactor сохраняет phase metadata. Запись state остаётся staged до полного handler/Future/resource cleanup; phase postcondition failure вызывает rollback owned state. Внешний файл/device IO не откатывается автоматически.

## Версии, artifacts и compiler

compareContractInterfaces проверяет schema identity, общий signature/effect/error budget и каждую lifecycle phase. Дополнительные phase errors/усиленные pre/ослабленные post — incompatible; removed errors/weaker pre/stronger post разрешены при новом compatible semver. Изменение valueType меняет ResourceHandle signature. Ownership пока только execution, альтернативные ownership protocols неизвестны и rejected. Exact pin остаётся обязательным даже после compatible comparison.

Serialized control IR сохраняет public contract id/version; missing registry dependency отвергается до host invocation. IDL schema version неизвестна older consumers и не должна игнорироваться. Native compiler export всё ещё UNSUPPORTED_TARGET; owned-cell standalone helper parity из AC-038 продолжает проходить. Это реальные runtime bindings, не притворная portable native binary support.

```bash
node tools/ems.mjs interface-check examples/resource-interface.json
node tools/ems.mjs interface-compare examples/resource-interface.json examples/resource-interface.json
node examples/resource-interface.mjs examples/resources.ems
```

CLI проверяет metadata без foreign imports. Пример runner явно регистрирует trusted Node FileHandle callbacks; реально открывает/читает/закрывает файл. Platform names в manifest не являются доказательством portability/conformance. Schema resource-interface.schema.json задаёт структуру; cross-field type/phase/ownership checks делает executable validator. External schema engine не запускался.

AC-041 — tests/contracts-resource.test.mjs: typed public resource/shared serialized IR, phase predicates/types/errors, no callback before preflight/preconditions, factory post ownership-before-check cleanup, readonly/missing-write, compatible/incompatible phase evolution, nested guards/single release, late acquisition/active read cancellation/deferred cleanup, exact pins/policy, real Node fd EBADF, actor rollback and registry metadata cloning. EMS-016 остаётся открыт для advanced ABI/error variants и dependency lock; M1/P1/IDE/deploy и глобальная цель не завершены.
