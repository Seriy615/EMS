# Создание UI, состояния и EMS-обработчиков

EMS-050 IN_PROGRESS, AC-053. Новые операции UIProjectEditor и forms web/ui-authoring.mjs создают настоящий UI-проект без ручного изменения IR. Kernel frontend/runtime/IR semantics сохраняются. Этот срез дополняет UI_TREE.md/UI_PROJECT.md; full visual handler control graph/standalone UI/MVP не закрыты.

## Authoring операции

Новый UI-проект содержит пустой column root, state и handlers. Формы позволяют добавить Number/String/Boolean/NumberArray initial state, создать column/row/text/button/textInput/checkbox в выбранном контейнере, удалить поддерево и изменить typed property binding. Number/Boolean/array literals вводятся как JSON, String — как обычный текст; JSON.parse("-0") и typed project codec сохраняют sign.

Выбор события показывает реальные input ports handler и их types через signatureIR. Parameter связывается с literal, committed state, typed event value либо explicit Number-to-String formatting. Linker не принимает неправильную форму/тип/capability/недостающий slot или handler. UI preview по-прежнему выполняет только исходный ReactorSession; формы не содержат бизнес-логику счётчика.

UIProjectEditor.addState/setInitial/addNode/removeNode/property/event/applyHandler работают на candidate workspace. После изменения проверяется весь project — включая source witness остальных handlers и callers. Ошибка оставляет accepted source/history неизменными. Aggregate Undo/Redo возвращает и hierarchy/state/event bindings, и source/IR. GUI применяет изменение с дополнительным policy preflight до замены прежнего preview. Изменения через формы сериализуются, чтобы параллельные clicks не потеряли прежние edits.

## Исходник и общий IR

compileUIHandler(source,entry,application,base) создаёт обычный typed state registry, использует existing EMS parser/type checker/lowerCheckedModule(profile:"control") и возвращает shared IR v2. Control профиль сохраняет source helper functions прямо в semantic program, без missing ephemeral composite registry after save. Functions/generics/branches/loops/error/async semantics — исходные kernel правила; отдельного языка обработчиков или evaluator не добавлено. Source limit256KiB UTF-8,20000 tokens/depth128; entry до1024 chars.

applyHandler(event,source,entry) создаёт или заменяет настоящий handler, сохраняет воспроизводимый accepted source и entry. Typed signatures должны подходить всем UI users данного handler. Ошибочная программа не обновляет preview/program; frontend location показывается у source field. Draft исходника не считается accepted до Apply и не сохраняется как executable program. Source exports внешних библиотек не выполняются при импорте; references требуют existing trusted base registry.

## Project v2 и witness

ems-ui-project/2 добавляет sources:{event:{source,entry}} к прежнему typed transport; runtime ems-ui-app/1 shape не меняется. Каждый source относится к существующему handler. При serialize/parse исходник компилируется тем же frontend и canonical IR обязан совпасть с saved program. Несоответствие получает SOURCE_IR_MISMATCH. Это точный reproducibility witness, не проверка эквивалентности произвольных программ, byte подпись или гарантия правильности source.

v1 остаётся supported для IR-only проектов; пустой sources writer сохраняет v1. Sources позволяют смешанные проекты: не все импортированные IR handlers обязаны иметь исходник. Open handler без sources показывает actual IR и сообщает отсутствие authored text через пустой source field; выдуманный decompilation не создаётся. V2 aggregate limits остаются1MiB/100 handlers/sources; prototype-named event безопасно хранится own data property, без prototype mutation.

Save/Open/download/import/reopen сохраняют sources вместе с semantic program, а не в отдельном несогласованном local draft. Initial shipped counter компилируется из actual examples/counter.ems в source-owned control handler; saved UI program не зависит от этого example при reopen. Runtime state по-прежнему не входит в authoring snapshot.

## Inspect и границы

Клик по widget выбирает его ID в authoring inspector; показана actual event binding. Open handler показывает сохранённый EMS source и actual IR. Preview click остаётся событием приложения — выбор не подменяет его исполнение. UI/state/handler params видны через формы; запуск по кнопке идёт через typed event routing.

Пока нет editor canvas для control handler graph, rich source map/runtime stepping, полноценной UI contract factory/IDL или unified multi-project storage. Worker preview реализован (UI_WORKER.md); standalone state/UI compiler остаётся обязательным до full MVP/deployment gate. Native semantic parity и динамическая hierarchy — отдельные задачи. Существующие pure graph/control text editor/collections не переписывались.

## Evidence

tests/ui-authoring.test.mjs: создание state/UI/source/typed event и actual result, portable source witness/storage, helpers in control IR, changed result/Undo/Redo, malformed source/stale signature/source-IR mismatch rejection, atomic candidate rollback и safe prototype handler.
tests/browser/ui.test.mjs: реальные формы создают счётчик с пустого проекта, Number slot/EMS handler/text-state binding/button-event input; click=1, handler edit=2, invalid source preserves current program/value, Undo=1, Redo/Save/LoadHandler и page reopen retains source and click=2. Existing transport/download/import/corrupt record/UI lifecycle сценарии остаются проверяемыми.
