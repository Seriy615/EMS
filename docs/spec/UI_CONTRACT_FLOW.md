# UI contract-flow handlers — AC-112 reference profile

Статус: связь обычного `ems-contract-flow/1` canvas с настоящим UI/Reactor.
Не отдельная сущность «алгоритм» и не отдельный язык исполнения.

## Семантика

В контексте UI тот же граф допускает атомы `state.<slot>.read/write`, созданные
самим kernel для объявленных слотов. Typed value ports, Activation, явные связи,
If и value-less IterationBegin/End сохраняют AC-111 семантику. Чтение состояния
выполняется только при активации read; это снимок, который обновляют новой
активацией. Запись проходит через действующую транзакцию ReactorSession.

Обычный standalone flow profile остаётся pure. Опция allowState допускает только
kernel stateIntrinsic с подлинной callback identity и точной сигнатурой/policy;
похожее имя state.* или декларация state.write не дают разрешения. Другие эффекты
и host/API contracts этот профиль не включает. Effects/capabilities интерфейса
не стираются. UI policy preflight и runtime transaction остаются обязательными.

Local std.storage.Variable сбрасывается при событии. Persistent UI state живёт в
Reactor session; initial задаёт новую сессию, не текущее значение. Несколько событий
видят подтверждённое состояние предыдущего события. Ошибка после write откатывает
всё событие. Нижний слой: checked EMS frontend → IR2 → существующий Reactor/UI
Runtime либо тот же standalone UI compiler. Не добавлен второй evaluator. Сохраняются существующие ограничения UI handler source:262144 UTF-8 bytes и20000 frontend tokens; это может ограничивать размер применяемого графа.

## Применённая программа и черновик

`ems-ui-project/3` расширяет source witness обработчика полем `flow`:
`{source, entry, flow}`. flow — serialized `ems-flow-project/1`, включая отдельные
canvas positions/view/descriptions. Свидетельство обязательно воспроизводит точный
canonical generated source/entry, а source — точный saved semantic IR. Расхождение
отвергается до вызова обработчика. Версии1/2 остаются совместимыми; flow metadata
нельзя спрятать в v2. UI export/import/undo/storage сохраняют его вместе с source.

Незавершённая схема хранится отдельно как bounded local handler draft. Удаление
контракта не блокируется: missing ports сохраняются, apply/run отказывают с typed
ошибкой. Кнопка «Применить к UI» проверяет полный граф и весь UI document, затем
одной записью заменяет обработчик. Запуск UI и экспорт сначала делают то же apply;
не запускают молча предыдущую программу вместо текущего незавершённого графа.

Draft привязан к исходной версии UI. Concurrent same-file change даёт
STALE_UI_PROJECT, оставляя draft и чужой UI. Sibling file change сохраняется при
apply. После внешнего изменения UI при открытии используется последний applied
flow с видимым предупреждением; предыдущий local draft сохраняется отдельно при
следующей записи. Это не универсальное слияние. Неприменённые local drafts пока
не входят в exported UI bundle и не синхронизируются между устройствами.

## Пользовательский путь

1. Конструктор UI → обработчики → «Создать граф обработчика».
2. Перетащить обычные контракты, в том числе «Прочитать count»/«Записать count»;
   соединить typed data и Activation ports, выбрать начальный контракт.
3. «Применить к UI», вернуться в конструктор, выбрать элемент и связать событие
   с этим обработчиком. Параметры поступают от существующих typed event bindings.
4. «Запустить UI»: настоящий Worker вызывает сохранённый граф, state bindings
   автоматически обновляют отображение. На холсте можно запустить весь UI.
5. «Скачать приложение»: настоящий статический UI package, без EMS service.

Существующий flow handler открывается кнопкой «Открыть граф» в этом же `/web/flow.html`.
Старые authored text handlers сохраняют прежний editor; автоматической миграции
arbitrary AST в flow нет. Ручная замена source делает обработчик текстовым и не
выдаёт старое flow witness за актуальный граф. Изменение сигнатуры bound handler
требует согласованных UI event inputs; автоматической миграции всех привязок нет.

## Приёмка и пределы

Node: реальные repeat events1→2→1, rollback после write, policy denial, fake state
callback refusal, flow/source mismatch, version gate, undo/sources preservation,
standalone UI session1→2; incomplete draft/reopen/CAS/sibling preservation.
Chromium: обычные порты на390px, input edit→actual Worker2→4, reopen UI2; создание
flow handler, wiring state.write, привязка к кнопке→3; прежние shared UI/file paths.

Пример: `examples/ui-flow-counter.ems-ui.json`. Он представляет реальную UI
программу с четырьмя контрактами read→add→write→result, а не демонстрационный
успех без исполнения.

Открыты: arbitrary text↔flow roundtrip, generic arrays/maps, cross-file source
linking, composites expansion в новом canvas, full debugger/native/effectful host
bindings, общий multi-device draft protocol. Полная цель PROJECT_GOAL.md активна.
