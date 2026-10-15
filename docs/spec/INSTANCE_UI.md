# Native экземпляры и UI — AC-127

Срез EMS-038/043/045. Глобальная цель остаётся активной. Реализуется связь UI с native static-instance ядром AC-125 и обычным canvas AC-126, без второго тела обработчика или новой модели вычисления.

## Семантика привязок

`ems-instance-project/2` расширяет закрытый authoring envelope /1 ровно одним полем `ui` — существующее platform-neutral `ems-ui/1` дерево. Версия /1 сохраняет прежние поля, /2 требует UI и не принимает смешанные документы. Semantic module `ems-instance-module/1` не изменён. Общий валидатор UI проверяет типы, стили, обязательные свойства, виды событий и все входы операции до запуска.

- Поле экземпляра: `{state:"left.value"}`. Number→String требует `format:"number"`; rich данные→String требуют `format:"json"`. Это существующие finite formatting contracts UI-профиля.
- Операция события: `{handler:"left::Change",inputs:{delta:{literal:1}}}`. Идентификатор однозначно выбирает static instance и объявленный transition; отдельный UI handler program не создаётся.
- Вход операции может быть литералом, полем экземпляра, форматированным полем либо типизированным `value:true` события textInput/checkbox. У button.press значения нет; попытка передать его отклоняется.

`instanceUIBindings` даёт typed metadata; `validateInstanceUI` проверяет его общей `validateUITree`. Default values здесь — только свидетели типов при статической проверке, не исполняемое начальное состояние и не показываемые данные. Initializers и creation invariants выполняются только при создании настоящего preview/runtime owner. Import/list/save/build ничего из них не запускает.

## Runtime и компилятор

`createInstanceUIRuntime` проверяет `ui.render` policy и создаёт реальный `createInstanceSession`. Адаптер `instanceUILink` переводит logical field paths в detached snapshot и выбирает `owner.dispatch(instance,transition,inputs)`. Данные, FIFO, общий budget/depth, rollback всех локальных экземпляров, cancellation и внешние invariant boundaries остаются в прежнем IR/ReactorKernel. Render, disabled check, event typing/value binding и DOM lifecycle используют **тот же UIKernel/mountDOMRuntime**, что и прежние UI apps.

Worker UI transport принимает /2 документ и использует тот же native owner. Успешный event обновляет UI из подтверждённого snapshot; отказ показывает error и сохраняет предыдущие значения. Native stepping в данном срезе не поддержан и не маскируется эмуляцией.

`compileInstanceUIJS` включает прежний native compiler и общую UI/DOM поддержку в независимый ESM. `createRuntime` и `mountApplication` — async: initialization проверяется до возврата владельца и до монтирования. Host reservation запрещает два параллельных mount; ошибка освобождает reservation и закрывает созданный runtime. UI literals/port names сохраняют own keys, включая `__proto__`; signed zero сохраняется через transport и compiled output.

`buildInstanceUIPackage` создаёт реальные `index.html`, `style.css`, `bootstrap.mjs`, `application.mjs`. Build проверяет UI/native policy без выполнения initializers/invariants. Bootstrap ожидает async mount и показывает ошибку инициализации. Экспорт запускается на отдельном статическом сервере без EMS origin, IDE, runtime installation или внешнего сервиса. Это reference JavaScript/DOM target, не доказательство native Windows/Android/iOS compiler.

## Studio

Из документа контрактного модуля «Интерфейс приложения» открывает **существующий** полноразмерный UI designer. Используются те же palette drag/drop, style controls, movable windows, binding forms и UI↔logic routes. Событие выбирается из операций экземпляров; поля предлагаются в datalist как `left.value · Number`. State panel показывает реальные field identities/types и переход к начальному состоянию в модуле; не подменяет initializer фиктивным 0.

Создание операций/полей/определений остаётся в модуле; UI не копирует их в отдельные handler bodies. Кнопка «Открыть граф» ведёт в обычный canvas самой native операции; `nativeUI=1` хранит обратный маршрут. Save применяет граф ко всему модулю, сохраняет UI, shared definitions, invariant guards, metadata и sibling files. Return UI создаёт новый preview из сохранённой программы. Экспорт из body/invariant canvas при наличии UI тоже сохраняет приложение целиком в .tar, а не body без guards/UI.

Native UI изменения сохраняются через checked candidate/CAS, undo/redo сохраняют общий документ. Неполный граф — отдельный draft AC-126. Исходный native EMS остаётся архивом; его явное применение сохраняет UI, если привязки совместимы, иначе отказывает до записи. Прежние UI project1..4/реакторы продолжают прежний путь. Native режим не открывает техническое AST-дерево вместо обычного графа и не предлагает неподдержанную отладку.

## Приёмка и границы

Node: runtime/standalone event→state→UI, independent instance identity, invariant rejection/rollback, policy refusals, no-init build/import, unknown/wrong bindings, shared graph Save, UI preservation, signed Map JSON, `__proto__` event port. Chromium: реальные кнопки и input forms, workspace/mobile graph roundtrip, GUI operation edit→UI3/5→reload3, downloaded .tar→fresh Node3/5; другое instance через формы event+property→right7, independent DOM после EMS origin shutdown и invariant refusal без изменения отображаемого7.

Native UI source notation `~>`/`<=` пока не реализована; здесь версионированное semantic UI tree связывается с native module. Нет dynamic instance references/lifetimes, native UI backend, durable state, cross-file imports или полного inverse. Проекция графов сохраняет ограничения AC-126. Дальше: редактирование структуры native state/instances в Studio, native UI text notation с тем же binding model и расширение conformance; весь EMS-038 не объявляется завершённым.
