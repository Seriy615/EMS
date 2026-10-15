# Rich values in the ordinary contract canvas — AC-115

Статус: reference profile реализован; основной глобальный план остаётся активным.

## Версии и семантика

`ems-contract-flow/2` добавляет finite control types:
Number, Boolean, String, NumberArray, Array<T>, Option<T>, Result<T,E>.
Типы конкретные, canonical, без unresolved T и live handles. NumberArray сохраняет
legacy numeric array identity; поле типа редактора нормализует Array<Number> в него.
Новые проекты используют /2. /1 продолжает принимать только прежние finite types
и контракты; richer signatures не принимаются молчаливо. При добавлении rich
контракта/типа в старый проект редактор явно записывает schemaVersion/2 в reversible
candidate. Canvas metadata и ems-flow-project/1 transport не меняют форму.

Обычные typed ports имеют exact type equality. Literal получает тип порта, поэтому
[] не превращается неявно в NumberArray при подключении к Array<String>. Начальные
значения и сохранённые аргументы проверяются до compilation. Own-data literals
не читают element getters, требуют dense arrays, bounded strings и суммарно≤10000
array elements; Option/Result имеют точную закрытую tagged форму. Runtime API inputs
следуют прежним shared control value rules, включая legacy NumberArray semantics.

Маркеры Begin/End не получают values/conditions; If принимает только Boolean.
Activation/data wires и dominator checks сохраняются. Local variable с write input
и current output допускает rich type, initial literal и feedback. Она не становится
persistent UI state. Удаление разрывает связи и сохраняет incomplete draft; run/build
требуют complete wiring. Смена типа разрывает несовместимые data refs, не перемещает
карточки. Повторный выбор того же типа не удаляет соединение результата.

## Compiler и общий IR

Тот же checked frontend→IR2→Runtime/standalone. Rich values не исполняются отдельным
JavaScript evaluator. Literal codec генерирует закрытую EMS syntax: typed arrays,
Some/None/Ok/Err, строки и числа; raw object source не вставляется. Default buffers
имеют корректный конкретный тип и защищены прежним producer-availability check.
Их initial values не подставляются вместо несоединённого входа.

Version/effect/capability checks действуют для всех вызовов. /2 принимает trusted
pure ems-algebraic/1 atomic interfaces, включая standard typed array instances и
sealed-compatible callbacks; реальные installed versions сохраняются при add.
Capability-bearing host contracts не появляются в pure flow. В UI-контексте
допущены только прежние kernel state bindings по existing private witness.

## Работа в редакторе

- «Тип элемента массива» задаёт T для новых ordinary operation cards. Есть
  подсказки для основных типов и ввод concrete nested type. Изменение выбора не
  меняет существующие узлы.
- Array operations показаны обычными кнопками каталога с реальными signatures;
  drag добавляет обычную карточку, data/Activation ports соединяются явно.
- Тип входа программы, результата и переменной задаётся тем же canonical type
  input с подсказками. Rich literal/initial/input values редактируются как JSON;
  String-port literal остаётся обычным текстом.
- Карточки показывают actual port types и readable operation title вместо hex ID.
  Type mismatch показывает полученный и ожидаемый тип. Описание атома использует
  действительные operands. SVG берёт реальные graph edges и сохраняет signed zero
  также внутри tagged/nested labels.
- Managed save/import/copy/reopen и workspace files используют тот же checked
  project model. UI handler открывается тем же canvas; rich local array computation
  может записывать supported primitive state и обновлять UI через настоящий Worker.

Типы persistent Reactor/UI state slots пока остаются прежними primitive types.
Rich event literal transport/новые DOM property types этим срезом не объявляются.
Нет автоматической миграции произвольного text/AST в explicit graph.

## Приёмка

8 new Node cases: runtime/compiled rich graph and v1 refusal; nested/tagged literals
и signed-zero transport; migration/undo/delete/same-type preservation; writable
array variable; bad typing/getters/sparse/size/live types; actual feedback loop;
installed version2.0.0 и capability refusal; real UI transaction from the same graph.
2 new Chromium cases: mobile drag/type/wire/run/reopen with round ports/no scaffold;
array append→length→state.write built in the UI canvas updates actual UI to3.
Existing project/flow/UI/file compatibility checks remain required.

```
node tools/ems.mjs flow-run examples/flow-array-loop.graph.json '{"limit":3}'
node tools/ems.mjs flow-build examples/flow-array-loop.graph.json --out dist/array-loop.mjs
node tools/ems.mjs flow-svg examples/flow-array-loop.graph.json --out dist/array-loop.svg
```

Ожидается ["x","x","x"], при limit0 — []. Цикл состоит из обычных contracts,
state cells и настоящей обратной связи End→Begin; отдельной сущности algorithm
или body-region нет. Итерации и результаты совпадают с shared typed control IR.

Открыты Map/Set, persistent rich UI state, generic callback map/filter/sort,
composite expansion и полный text↔visual roundtrip. EMS-045 и PROJECT_GOAL не завершены.
