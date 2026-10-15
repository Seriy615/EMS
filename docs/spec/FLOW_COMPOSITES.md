AC-122: [profile /3](RECURSIVE_FLOW.md) добавляет self/mutual/entry recursion; /2 ниже остаётся прежним DAG profile.

# Собственные составные контракты в обычном графе — AC-121

Статус: reference slice EMS-043/044, частичное продвижение G-02/03/05/11/12/14.
Это сохраняемые раскрываемые определения, а не обозначение атома поверх скрытого
обработчика или разворачивание всех вызовов в один граф.

## Представление и типы

`ems-flow-project/2` добавляет к полям /1 массив `contracts`. Каждый элемент
содержит `{graph, inputs, canvas}`: собственный semantic graph, значения для
отдельного запуска и независимую геометрию/описания. Корневой документ сохраняет
прежние поля. /1 по-прежнему читается, но не принимает `contracts` молча. Графы
внутри документа используют существующие `ems-contract-flow/1`, /2 или /3;
новый evaluator и отдельная система типов не вводятся.

Вызов определения — обычная нода `{id, uses, version, args}`. Её typed inputs и
output берутся из определения. Activation interface тот же `enter→next`:
вызывающий блок продолжает выполнение после возврата значения. Определение
заканчивается обычным Result; If и value-less iteration markers внутри него
сохраняют прежние порты и явные connections.

ID определения уникален в модуле и не перекрывает entry, kernel или доступный
registry contract. Текущая версия интерфейсов/реализаций flow —1.0.0. Rich ports
используют те же canonical types, literal validation и signed-zero transport.
Типы входов/выхода проверяются до исполнения. Политика вычисляется по фактическим
зависимостям, затем каждый граф проверяется, включая неиспользуемые определения.
Составной контракт со state.read/write допускается только в UI profile и только
если конечные операции являются действительными kernel state bindings.
Непроверенный callback нельзя скрыть за composite policy metadata.

Пределы:32 определения,1024 ноды на весь модуль, прежние256 нод на один граф,
1MiB на авторский документ и существующие token/type/compiler limits. Текущий
профиль определений ацикличен: self/mutual recursion получает явный
RECURSIVE_FLOW_CONTRACT. Текстовый IR2 уже имеет рекурсию; её перенос в flow с
проверяемыми глубиной/бюджетом — следующая отдельная семантическая задача.

## Исполнение и компиляция

Каждое определение понижается в отдельную функцию общего typed control IR2.
Вызовы не клонируют граф и не становятся host atomic executors. Локальные
Variable/owner storage создаются заново для каждого frame; repeated/loop calls
не разделяют локальные ячейки. Persistent state UI остаётся общим kernel state
транзакции события. Ошибка в caller после state-writing helper откатывает всё
событие в Runtime и standalone UI.

Имена аргументов flow definition задают стабильное соответствие портов и
параметров; генератор канонизирует их по имени. Registry atoms сохраняют свой
реальный declaration order. Source evaluation order и mutable snapshots
сохраняются до вызова; пример `Step(x=2,x=3)` с сигнатурой `(z,a)` проверяется
против исходного IR. Work/depth используют существующий общий IR runtime.

Compiler API принимает `options.contracts` как массив semantic graphs; optional
`entry` позволяет отдельно запустить определение с его inputs. `flowMap.functions`
отделяет activations/data по graph ID и исходным строкам. Worker использует этот
map, различая одинаковые node IDs в разных определениях. Проверка доступности
значений сообщает также graph ID; диагностика AC-120 по явному переходу открывает
нужное определение и не подсвечивает одноимённые ноды родителя.

## Редактор

«+ Свой контракт» находится над общим каталогом. Созданный контракт открывается
в том же полном canvas. Его вызовы перетаскиваются из того же каталога и имеют
те же порты и свойства. «Открыть контракт» на вызове и «Открыть граф» в каталоге
открывают определение; «Назад» возвращает прежний scope. Геометрия, view и
описания каждого scope сохраняются раздельно. Редактирование определения меняет
все его вызовы. Количество вызовов не увеличивает количество определений.
На мобильном видны текущий scope и Back; toolbar занимает свою высоту, не
перекрывая canvas. Кнопки открытия в каталоге допускают обычную touch-прокрутку.

Изменение output type отключает несовместимых потребителей во всех scopes;
удаление входа удаляет соответствующие аргументы вызовов. Неполный кандидат
остаётся редактируемым, но не исполняется/не компилируется. Новые connections не
создаются автоматически. Удаление отдельного вызова работает как для остальных
нод. Явное «Удалить определение и вызовы» в свойствах открытого определения
удаляет его и его вызовы, разрывает затронутые ссылки/активации и сохраняет
прочие ноды/позиции/провода. Undo восстанавливает точный сериализованный модуль.
Публичное переименование ID определения с version migration не заявляется;
имена отдельных вызовов редактируются обычным действием Rename.

Run в чистом проекте исполняет текущий scope с его inputs. В UI Run всегда
запускает приложение с текущими определениями. «Скачать приложение» экспортирует
корневую программу, даже если открыт helper. JS не требует EMS или сервиса EMS;
UI export содержит тот же executable module. SVG содержит отдельные компоненты
для entry и definitions с реальными вызовами и пользовательскими описаниями.
CLI flow-run/build/svg понимает обе версии авторского документа.

## Существующий исходник и UI

Finite IR2 helper functions преобразуются в отдельные definitions. При этом
сохраняются реальные function boundaries, аргументы, результаты, условия, циклы,
возвраты и state semantics. Стандартный source-flow adapter сохраняет supported
source/IR semantics; сам по себе новый транспорт не расширяет его на exceptions,
async/resources, rich source profiles или несовместимый indexing error ABI.

AC-119 открывает поддерживаемые saved source-проекты с helpers тем же canvas и
сохраняет checked flow module рядом с точным исходным record. UIFlowSession
открывает source helpers, хранит incomplete draft отдельно, проверяет CAS и
применяет весь модуль как reproducible source/flow/IR witness UI project v3.
Изменение helper не заменяет исходный UI до Apply/Run. Workspace export/import
сохраняет определения, canvas и связанные документы.

Межфайловые imports, рекурсивный flow call profile, полный text↔flow inverse,
контрактные instances/invariants и общая готовность IDE/языка остаются открытыми.
Эта работа не превращает произвольные foreign libraries в переносимые реализации.

## Воспроизводимые свидетельства

- `node tools/ems.mjs flow-run examples/composite-flow.ems-project.json '{}'` →21.
  [EMS source](../../examples/composite-flow.ems) имеет два вложенных helpers,
  повторные вызовы из цикла и независимые локальные переменные.
- `flow-build ... --out /tmp/ems-composite.mjs`: отдельный Node process выполняет
  `execute({})` →21; изменение общего Wrap/Step аргумента2→3 даёт25.
- `tests/flow-composites.test.mjs`: separate IR functions, argument order,
  mutable snapshots, rich ports/-0, scopes, undo/delete/signature edits,
  export/import, diagrams, name collisions/recursion/versions/limits.
- `tests/ui-flow-composites.test.mjs`: repeated state helpers, permission refusal,
  exact witness/reopen, Runtime/standalone6→12 и rollback после caller error.
- `tests/browser/flow-composites.test.mjs`: actual drag/create/wire two calls,
  Worker12→shared edit27/reopen27, Download while helper is open still exports
  root27, explicit definition deletion/undo; UI Worker4→6/reopen6;
  nested diagnostic focus with identical parent/child node IDs.
- `tests/browser/source-flow-entry.test.mjs`: реальный saved helper source через
  root bookmark → editable definition → sibling flow Save → Worker8→9,
  original source record сохранён целиком.

Финальные counts, revision, public Worker/standalone proof и ограничения прогона
фиксируются в STATUS и PROGRESS; это не завершение глобальной цели EMS.
