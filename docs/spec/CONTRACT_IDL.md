# Contract IDL v1 — интерфейс и binding

EMS-016 IN_PROGRESS, CONT-01/07/08, AC-039. Исполняемый начальный профиль, отдельный от M0 manifests `0.1` и draft camera example. Public API: src/contracts/index.mjs; схемы contract-interface.schema.json и contract-binding.schema.json. Existing registry/runtime/compiler не заменяются; adapter устанавливается через typed atomic boundary либо сохранённую composite graph boundary. Примеры: examples/contract-interface.json, contract-binding.json и contract-division.mjs.

## Публичный интерфейс

`schemaVersion: ems-contract-interface/1`, canonical id и stable `major.minor.patch` version, ordered inputs `{name,type}`, single output `{type}`, errors `{code,payloadType}`, semantics `{determinism,effects,capabilities}`, conditions `{pre,post}`. Unknown/missing fields и duplicates запрещены; списки dense и bounded (1000). Type strings используют существующую canonical control grammar, включая Option/Result/Future/Stream/ResourceHandle. Предельные arity/depth проверяет executable validator; нет новой независимой системы типов. Политика effects/capabilities — conservative upper bound, не выданные grants.

Interface не хранит execution kind, native symbol, artifact URL, package, license или source visibility. Atomic/composite — representation выбранной реализации. Interface id, binding id/version и implementation id/version различны. JSON validation не импортирует foreign modules и не запускает callbacks. Валидированный snapshot canonical по object keys, deep-frozen и независим от последующей мутации входного descriptor. Port order семантически значим.

`deterministic` и `unspecified` — декларация реализации, не полученное из метаданных доказательство её поведения. Device nondeterminism нельзя скрыть несовместимым deterministic binding. Behavioral evidence потребуется conformance harness.

## Условия

Каждое condition: `{kind,subject}`, kind nonzero/positive для Number или nonempty для NumberArray. Subject `{input:"port"}` либо `{result:true}`; result разрешён только в post. Нет eval/free text/script или вызова host-функций. Тип subject и существование port проверяются до execution. -0 не удовлетворяет nonzero. Проверка pre идёт после input types, до host invocation; post — после actual typed output. Отказы PRECONDITION_FAILED/POSTCONDITION_FAILED содержат только id и condition index, без input/result payload.

Это исполняемые predicates начального finite профиля, не theorem prover/полная логика контрактов. Совместимость условий использует консервативное структурное сравнение; positive → nonzero не выводится автоматически. В runtime post по input наблюдает params после callback; trusted JS implementation не изолирован от mutation. Compile emitJS доверенный и обязан обеспечивать заявленную семантику.

## Ошибки

Обычные declared host errors перечислены code с payloadType null. Необъявленная ошибка заменяется UNDECLARED_CONTRACT_ERROR без host message/value. Объявленная ошибка сохраняется как обычный failure; envelope/application может содержать её payload согласно доверенному ABI, журнал reactor по-прежнему не пишет failure payload.

Typed user exception использует existing `USER_THROW`, `ems-user-throw/1`, canonical serializable payloadType и value. Проверяются envelope/type/value; malformed payload не попадает в typed catch. USER_THROW требует ненулевой payloadType, остальные codes в этом профиле payload не объявляют. Existing EMS catch по payload type работает; custom error constructors/multiple named variants ещё не реализованы. Budget/cancel/type/condition diagnostics принадлежат ядру и проходят независимо от declared host errors.

## Descriptor и linking

`schemaVersion: ems-contract-binding/1`, id/version binding, exact `interface:{id,version}`, exact `implementation:{id,version}`, explicit nonempty targets и determinism. Target — строковая идентичность, а не доказательство backend support. Declared web target в example не закрывает browser P1; требуется реальный запуск.

`checkContractBinding(interface,binding,registry,target)` ничего не исполняет: сверяет exact references/versions, target, ordered input/output types, determinism и фактический union effect/capability policy. Для composite анализирует recursively все nodes, включая unused, сохраняя inspectable representation. Implementation может требовать меньше разрешений; превышение public upper bound отвергается INCOMPATIBLE_BINDING. Существующие metadata доверенные: static check не доказывает, что JS callback честно объявил IO.

`registerContractBinding(registry,interface,binding,{target})` устанавливает public id/version поверх выбранной **finite atomic/composite** реализации. Вызовы проверяют pre/post/errors в runtime; emitJS включает те же predicate/error/type helpers в независимый output без EMS imports. Adapter использует conservative interface policy даже при более чистой выбранной реализации. Поэтому preflight не исчезает при binding replacement. Missing pure emit hook остаётся unsupported compiler target.

Resource/advanced signatures проверяются на compatibility, но их **installation** сейчас UNSUPPORTED_BINDING. Native lifecycle wrappers и полный ownership/error binding ABI — следующий срез EMS-016. М0 manifests/seals и trusted imports продолжают работать как раньше.

## Составная граница — AC-040

Finite composite selection сохраняет kind composite и независимый snapshot nodes/sequence. Public graph получает schemaVersion ems-contract-graph/1, explicit interfaceRef {id,version}, interface id/version и conservative interface policy. `interfaceBoundary:{interface,binding}` хранится в registry entry отдельно от graph/canvas; оба descriptors валидированы и frozen. Оригинальная реализация остаётся под собственным id/version. Изменение public graph nodes реально изменяет исполняемую программу, не маскируется скрытым atomic callback. Пример: examples/composite-interface.mjs.

Проверки public boundary работают при call, прямом graph execution и graph↔IR round-trip. Registry lookup по public graph id выбирает версионированную interface boundary; изменение graph version/ordered signature отвергается до nodes. Как и для обычных registry contracts, интерпретация требует установленного выбранного binding. Сериализованный прямой graph IR получает профиль ems-contract-core-finite/1 либо ems-contract-effects-finite/1 и обязательный interfaceRef; pin ссылается на implementation registry, не дублирует contract semantics. Missing selected binding отвергается MISSING_CONTRACT/MISSING_INTERFACE; legacy profile не может неявно отбросить ссылку. Older readers отвергают новую graph version/IR profile. Повторный binding уже публичного composite создаёт inspectable call к прежней boundary, сохраняя обе системы условий. Metadata packages/lockfile должны впоследствии переносить эти descriptors между проектами.

Precondition после type/policy preflight, до первого body node; postcondition после typed output. Error gate охватывает nested body. Compiler генерирует lexical boundary вокруг тех же graph statements; memoized values остаются в её scope, nested guards имеют тот же порядок. Kernel cancellation/budgets, recursive composite и уже классифицированные error diagnostics не превращаются в undeclared host payload.

Удаление graph effects/capabilities не снимает selected interface grants: effect analysis добавляет registry boundary policy. Binding compatibility учитывает и graph union, и собственные declarations implementation. Existing pure export отвергает host policies. Owned state event commit происходит после postcondition; отказ откатывает staged state, не обещает отменить external IO. Pure compiled seal сохраняет условия как executable code после повторного импорта атомом, даже без исходного graph/IDL runtime.

## Совместимость версий

`compareContractInterfaces(old,next)` возвращает `{compatible,reasons}` для backward compatibility старых callers. Identity и major должны совпасть, version не регрессирует; ordered signature invariant. Новые effects/capabilities/errors, weakened determinism, усиленные preconditions и ослабленные postconditions несовместимы. Удаление ошибок/policy, ослабление pre и усиление post допустимо. Менять descriptor под той же version запрещено; canonical object-key order не влияет на comparison. Major change возвращает incompatible даже при одинаковой сигнатуре; explicit миграция не выполняется.

Результат comparison не снимает exact pins и не разрешает автоматический upgrade. Artifact digests, transitive lockfile, package signing, target discovery и behavior conformance ещё не реализованы в этом срезе. Versioned metadata не доказывает equivalence compiled/native implementations.

## CLI и evidence

```bash
node tools/ems.mjs interface-check examples/contract-interface.json
node tools/ems.mjs interface-compare examples/contract-interface.json examples/contract-interface.json
node tools/ems.mjs binding-check examples/contract-binding.json --interface examples/contract-interface.json --target node
node examples/contract-division.mjs /tmp/ems-divide.mjs
# import {execute} from '/tmp/ems-divide.mjs'; execute({a:6,b:2}) === 3
```

CLI binding-check использует existing core registry; foreign implementations подключаются через trusted programmatic API, CLI не импортирует произвольный JS для проверки. interface-compare завершает процесс code 1 при incompatibility. Эти команды не делают сетевых запросов.

AC-039 — tests/contracts-idl.test.mjs: exact version/target/type/policy checks до callbacks, hidden composite effects, strict descriptors и immutable snapshots, compatible/incompatible evolution, pre/post/type/error parity call/control runtime/standalone, typed catch и malformed error payload, CLI и independent new-process export вне EMS. JSON Schema external engine не запускался; executable validation обязательна. EMS-016/M1 остаются открыты для advanced bindings, resource/error ABI, advanced resource condition preservation и dependency lock.

AC-040 — tests/contracts-composite.test.mjs: graph/IR/text call/control parity, positive/zero/-0/post failures, editable snapshot/representation, nested condition order до callbacks, declared/undeclared errors, policy/version/signature bypass negatives, own implementation policy, atomic sealing/reimport, independent process export и transactional state rollback.
