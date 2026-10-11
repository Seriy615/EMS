# Структурный граф control-обработчика — начальный профиль

EMS-032/050 IN_PROGRESS; AC-059. Это типизированное графическое представление source-owned обработчика с выбранными узлами и транзакционной правкой EMS-фрагментов, не завершение свободного port wiring, полноценного control canvas или AC-012/WEB IDE MVP.

`handlerSourceGraph(editor,event)` в src/studio/control-graph.mjs повторно проверяет существующий project/source→IR witness и строит граф из AST обычного frontend/typechecker. Возвращает ephemeral `ems-control-source-graph/1`: source/entry/event, nodes с kind/type/location/text, public contract identity/signature/effects/capabilities и edges. Семантическим артефактом остаётся существующий IR; positions SVG не меняют программу и не сохраняются в IR.

Узлы показывают исходные функции, blocks/statements, typed expressions, calls, branches/loops, try/catch/finally и algebraic/async syntax, когда frontend/IR их принимает. Data edges идут от operands к consumer; structural control/sequence/next показывают регионы и порядок исходных statements. Это source-region graph, не полный flattened CFG с анализом всех exit/join/lifetime paths. Lexical references остаются именованными и проверяются existing frontend scopes. Local function calls связаны с inspectable source declarations, включая recursion; граф конечен и не рекурсивно разворачивает вызовы.

Atomic contract calls содержат только public interface metadata и arguments. Их JS/native/compiled implementation не раскрывается. Registry composite call metadata сохраняет kind=composite; раскрытие его внутреннего dataflow graph выполняется существующим pure Studio, здесь не реализовано. Generic types показываются на source-level, без выдачи их за конкретные specialization types IR.

## Правка и сохранение

В UI workspace: выбрать source-owned handler → «Открыть граф» → выбрать узел мышью или Enter/Space → изменить fragment → «Применить узел». SVG показывает typed nodes и edges; inspector сообщает kind/type/location/contract version. После успешной правки actual handler text обновляется.

`replaceHandlerGraphNode(editor,event,expectedSource,id,replacement)` заново строит checked graph, сравнивает exact current source (STALE_GRAPH), находит диапазон по собственному AST и не доверяет внешним offsets. Новый source проходит compileUIHandler и existing UIProjectEditor.applyHandler: type/effect/scope/IR/public UI binding checks и source witness. При ошибке source/history/runtime preview не меняются. Допустимый fragment может изменить выражение, statement, block или source function; это fragment editing, не отдельный графовый язык.

Undo/Redo/storage/import/export используют прежний source-owned project. После source изменения граф надо открыть заново; stale selection нельзя молча применять к новому source. UI preview остаётся существующим persistent Worker runtime. Generated standalone UI uses the same actual newly compiled handler.

Предел5000 displayed source nodes, source/token/depth limits прежние. Без source witness — SOURCE_REQUIRED. Collection-expanded synthetic helpers не имеют достоверных отдельных source ranges; такой граф явно UNSUPPORTED_VISUAL_PROFILE. Existing pure Map/Filter visual editor продолжает работать отдельно. Source graph строится в main thread; hard deadline/preemption не обещаются.

## Приёмка AC-059

Tests/control-graph.test.mjs: typed region/sequence/helper links and atomic signatures, exact ranges, helper constant edit changes actual runtime and standalone result to3, witness/storage/undo/redo, invalid types/stale source/fake IDs preserve state/history, async/error structure, missing source/synthetic collection negatives.

Tests/browser/control-graph.test.mjs: actual SVG selection/fragment edit → preview2, invalid literal type preserves source/preview, Undo→1, Redo/Save/reopen restores source and graph/preview2. Full arbitrary graphical node creation/connect/delete, persisted free layout, collection projection, source maps/runtime graph debugger и unified manager остаются следующими итерациями. Global goal и полный MVP/deploy открыты.
