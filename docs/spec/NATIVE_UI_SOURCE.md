# Текстовые UI-контракты и привязки — AC-128

Срез EMS-038 поверх native kernel AC-125, общего canvas AC-126 и UI binding model AC-127. Глобальная цель активна; полное обратное преобразование native implementation IR в исходник не заявлено.

## Общая грамматика

Используется **тот же** tokenizer/parser `src/frontend/index.mjs`, located `ems-ast/1`, type/contract IR и UI validator. Добавлены `ApplicationDeclaration`, `UINodeDeclaration`, `UIPropertyDeclaration`, `UIEventBindingDeclaration`, `UIEventInput`. Обычный checker/native module linker явно требуют application linker при UI declarations; UI не отбрасывается молча. Сравнение `<=` в телах контрактов и инвариантах сохраняет обычную Boolean-семантику.

```ems
@Counter {
    value: Number = 1;
    +Change(delta: Number) -> Number {
        value = value + delta;
        return value;
    }
    ? value >= 0;
}
@Application {
    @Counter #counter;
    @UI.Column #root {
        @UI.Text #display {
            content <= counter.value as number;
        }
        @UI.Button #increment { text: "Увеличить"; }
    }
    increment.clicked ~> counter::Change(delta: 1);
}
```

Application — контрактная композиция с вложенными static instances, одним UI root и event bindings. Контейнер распознаётся по вложенному `@` в начале тела. Объявления stateful prototypes/helpers/aliases остаются на уровне module; вложенные определения/приложения не поддержаны. Эквивалентная форма без Application container: native definitions/instances, один `@UI.*` root и event bindings на уровне module. Точки с запятой обязательны у свойств и bindings.

Поддержаны `UI.Column`, `UI.Row`, `UI.Text`, `UI.Button`, `UI.TextInput`, `UI.Checkbox` — текущие semantic kinds AC-127. `UI.*` зарезервирован для source UI contracts; неподдержанный `UI.Window` и другие kinds дают ошибку, а не DOM-имитацию native window. Node IDs и domain instance IDs уникальны между экземплярами; UI node IDs с точками/дефисами/числовым началом записываются строкой: `#"input-1"`, `"input-1".change ~> ...`.

Свойство `name: literal;` — неизменяемое значение UI binding. `name <= instance.field [as number|json];` — существующая однонаправленная reactive state binding. `content` у UI.Text — source alias `text`; канонический вывод использует `text`. Number→String требует `as number`; rich finite value→String — `as json`. Презентационные свойства сохраняют literal-only ограничения общего UI validator. Это не двухсторонняя привязка и не вычисление произвольного выражения при рендере.

`widget.press ~> instance::Transition(port: binding, ...);` выбирает настоящую native операцию и все её именованные inputs. `clicked` — alias `press`; input/change events используют `change`. Пустой список может опускаться для нульарной операции. Повторный event, input/property, неизвестный node/field/operation, неверный тип или event value у button отклоняются. `.value` события выражается `event.value` только во входах event binding; textInput даёт String, checkbox — Boolean. Экземпляр с именем event допустим: поле записывается как `"event".value`, что отличает его от значения события. Ключевые слова/нестандартные имена в UI member/input positions могут экранироваться строкой.

## Значения и исполнение

UI literal codec принимает scalar literals, numeric sign, arrays и **закрытые data constructors** `None()`, `Some(v)`, `Ok(v)`, `Err(v)`, `Map([[key,value],...])`. Map в этом контексте — запись finite tagged data, а не вызов пользовательской функции или foreign code. Размеры, типы, уникальность Map keys и signed zero проверяет прежняя модель значений. Codec не выполняет арифметику, произвольные calls или initializers. Такие вычисления выражаются контрактами, а UI передаёт их state fields либо closed inputs.

`compileInstanceSource` отделяет UI declarations и передаёт оставшийся **AST**, а не реконструированную строку, прежнему native linker. Application container даёт module ID по умолчанию; optional compiler options могут его задать явно. UI lowering создаёт ровно `ems-ui/1` tree/bindings AC-127. Native implementation, initializer и invariant — прежний IR2, shared budget и genuine ReactorKernel. Source positions добавляются к ошибкам node/binding, где они обнаружены. Import/list/save/build выполняют проверки и code generation, не выполняют native initializers или guards.

Runtime, actual UI Worker, compiler и standalone DOM не получили второго evaluator. Пример `examples/native-ui.ems` при нормализованном module ID даёт **точно тот же semantic module и UI**, что fixture AC-127. Node/Worker/independent output должны совпадать по value, identity, snapshot и invariant rollback.

## UI text и визуальный конструктор

`printInstanceUISource(module,ui)` выводит **актуальный UI fragment** в EMS. Все semantic bindings и finite data constructors имеют обратную запись; результат проверяется на границы syntax profile. `compileInstanceUIFragment` проверяет fragment против текущего module, запрещает замену definitions/instances и не меняет implementation IR. AST-дерево не подменяет основной graph editor.

В существующем native UI designer: «Проект и экспорт» → «Интерфейс · код EMS». Применение текста меняет только UI, добавляет один undo step и сохраняет общий module/UI документ с прежним CAS. Пока текст не редактировался, графические изменения обновляют его представление. Незавершённый текст сохраняется отдельно, включая base UI fingerprint. Если конструктор изменён параллельно, `STALE_UI_TEXT` запрещает перезапись; исходный черновик остаётся. Reload восстанавливает его. «Из конструктора» явно загружает свежий UI, сохраняя предыдущий записанный draft в `.previous`. При ошибке storage/quota введённый текст остаётся в памяти. Ошибки source apply выделяют соответствующий диапазон текста.

Графовая правка native операции сохраняет UI. Последующая правка UI fragment сохраняет **точный текущий module/bodyGraph**, его guards, геометрию, helpers и sourceArchive. Архив полного source не выдаётся за актуальный source после изменения тела графом. В документе модуля явное применение полного `.ems` с UI использует UI из текста; при module-only source прежний UI сохраняется, только если привязки совместимы.

## CLI

```sh
node tools/ems.mjs application-project examples/native-ui.ems --out /tmp/native-ui.project.json
node tools/ems.mjs application-run examples/native-ui.ems --events '[{"node":"up","event":"press"}]'
node tools/ems.mjs application-build examples/native-ui.ems --out /tmp/native-ui-app
```

Build создаёт полный independent DOM package AC-127 (`index.html`, `style.css`, `bootstrap.mjs`, `application.mjs`). Run использует настоящий native UI runtime, ограничен1000 events, пишет реальные исходы/rollback; failed event даёт exit1. Instance-only CLI не игнорирует UI, а отказывает с требованием application linker.

## Приёмка и границы

`tests/native-ui-source.test.mjs`: located grammar, comparison compatibility, exact module/UI parity, interpreted/compiled execution, text/visual UI roundtrip, escaped IDs/event instance/Map/-0/__proto__/sum data, signature/scope/type/duplicate/unsupported-kind failures, no initial execution on import/build, independent draft/CAS/storage errors, real CLI artifacts/events.

`tests/browser/native-ui-source.test.mjs`: импорт полного `.ems`, UI text Apply→Worker3, ordinary body graph edit→UI text rebind→right7 с сохранением точного body, downloaded .tar→fresh Node7 и offline reload7; bad/stale source не меняет checked source/current runtime, draft восстанавливается, explicit refresh сохраняет визуальную radius24.

Syntax profile сохраняет default parser limits: 1,000,000 UTF-16 units,100,000 tokens,128 nested expressions/blocks; UI bounds1000 nodes/depth32 и value bounds прежние. Если документ выходит за source profile, source print сообщает UI_SOURCE_LIMIT; checked JSON/UI остаётся доступным. Это частичный native application grammar, не весь универсальный язык: native structure authoring, full body inverse, cross-file imports, dynamic instances/lifetimes, general event streams, native window/platform adapters и произвольные reactive computations остаются отдельными задачами. Общая долгосрочная цель EMS не сужена до данного среза.
