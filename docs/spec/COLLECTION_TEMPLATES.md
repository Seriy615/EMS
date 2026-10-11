# Типизированные Map/Filter — исходник и общий control IR

EMS-034 IN_PROGRESS, AC-049. Реализованы pure статические contract-reference parameters для NumberArray в текстовом EMS. Это работающие typed templates, нормализуемые в обычные semantic loops/functions/calls, не String callback lookup и не второй executor. Generic first-class callable values, closures, effectful/async-output callbacks и визуальные collection blocks пока не реализованы.

```ems
fn square(value:Number)->Number {return value*value;}
fn keep(value:Number)->Boolean {return value>=4;}
contract analyze(values:Number[])->Number[] {
  return std.array.filter(std.array.map(values,square),keep);
}
```

Map требует одну Number-аргументную функцию/контракт с Number output; Filter — Number input и Boolean output. Callback — статическая qualified reference на source function (включая inferred generic specialization), atomic или composite contract. Простое String значение, local callable values, неверная arity/input/output и прямой async callback с Future output отвергаются типизацией. Module imports/namespace aliases разрешаются существующим linker. Inputs — NumberArray, result — новый NumberArray. Порядок сохраняется; Filter сохраняет исходный элемент, включая signed zero/дубликаты. Empty array не вызывает callback.

## Нормализация и формальная семантика

expandCollectionApplications до обычного type pass создаёт hygienic helper для каждого template application. Array argument остаётся в caller и вычисляется ровно один раз. Helper содержит обычные mutable local/for/if/return и типизированный вызов callback. Map append получает результат callback; Filter append выполняется только при true. for snapshot, call/type/error checks и order — существующие правила CONTROL_IR.md, а не отдельные операционные правила коллекций.

Generated declaration/local names не конфликтуют с user names/import aliases. Internal append принудительно связывается с actual std.array.append registry implementation через private normalization-side map, поэтому source declaration/import alias не подменяют построение результата. AST source не мутируется; без applications сохраняется его прежняя identity. При applications checked.ast — нормализованный located AST. collectionApplications sidecar содержит original operator/callback/helper/location; generated nodes привязаны к исходному call location, не фиктивным строкам helper source. Helpers становятся настоящими типизированными функциями ems-ir/2; новые IR schemas/opcodes/executors не добавлены.

Fixed-point effect analysis проверяет всю closure helper/callback, включая unused graph dependencies. Host effects/capabilities и local resource/Stream effects запрещены COLLECTION_EFFECT до execution даже для empty input. Purity foreign JS по-прежнему доверяет metadata host-approved callback; это не sandbox. Direct async callbacks не имеют требуемого Number/Boolean return type; обычный async entry и существующая Future supervision совместимы с template calls. Typed throws/catches/finally используют исходные control semantics.

Control steps/call depth/cancellation — один execution domain: helper loop и source mapper body не запускают новые executeIR с новым budget. Ошибка callback завершает collection и не вызывает следующие элементы. STEP_LIMIT/CALL_DEPTH/CANCELLED имеют identical standalone diagnostics и не становятся обычными catch payload. Existing linked atomic/composite ABI считает host call своей операцией; внутренние host/graph implementations не получают новый per-element CPU sandbox. Reference implementation использует immutable append и повторные array checks, поэтому большой Map может иметь квадратичную стоимость; production linear builder/cost model — отдельная доказуемая оптимизация.

## Каталог, export и ограничения редактора

Machine catalog теперь ems-stdlib-catalog/2: 36 installed primitive contracts плюс отдельные templates с typed callback signature и pure policy. Template не выдаётся за установленный atomic String-callable contract. tools/stdlib-catalog.mjs показывает actual interface/implementation data отдельно от compile-time templates. v1 catalog не включал templates; program/project schemas не меняются.

Compiler/runtime/serializeIR/parseIR/lock используют обычный проверяемый control IR. Atomic/composite callback versions сохраняются в contract targets; lock включает actual closure и отвергает callback replacement. Standalone содержит реальные helper/mapper bodies и исходные error/budget guards, не требует EMS imports/service.

Studio text mode исполняет templates в существующем disposable Worker и показывает настоящий IR; Control Apply в нынешний dataflow canvas получает UNSUPPORTED_VISUAL_PROFILE. Source draft локально сохраняется, но project v1/v2 не содержит full control source/IR. Визуальная authoring/persistence typed Map/Filter и расширение control workspace остаются обязательной незавершённой частью EMS-034/032. Ни AC-049, ни наличие текстового синтаксиса не закрывают full WEB IDE MVP.

## Evidence

examples/collection-pipeline.ems — реальный source pipeline, [-3,0,2] → [9,4]. tests/collections.test.mjs проверяет runtime/serialized IR/standalone oracles для atomic/generic/composite callbacks, map/filter/order/empty/signed zero, nested loop budgets, async entry, hygiene/aliases/source shadows, type/local-value/arity/async/effect rejection, locations/nonmutation, typed throws, cancellation и exact lock/version pins. tests/browser/collections.test.mjs запускает source в настоящей Studio, проверяет IR/functions/unsupported graph gate и independent exported module после shutdown runtime origin без /src requests.
