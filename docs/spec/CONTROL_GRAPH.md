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

## Структурированные операции — AC-060

`editHandlerGraphNode(editor,event,expectedSource,id,operation)` в src/studio/control-graph-ops.mjs предлагает пять операций над существующим checked AST:

- `literal {value}` меняет primitive literal с проверкой исходного типа; Number -0 сохраняется.
- `operator {operator}` меняет supported binary/unary operator, оборачивая operands для сохранения precedence/evaluation order. Await этим действием не изменяется.
- `call {target,arguments}` меняет qualified target и expression arguments. Каждый argument обязан быть одним синтаксическим выражением; actual target/signature/effects проверяет frontend.
- `insert {index,statement}` вставляет одну инструкцию в выбранный Block перед указанной позицией (или в конец). Parser не позволяет выдать несколько instructions/declarations за одну.
- `delete` удаляет выбранный statement из Block. Missing return, dangling locals или other semantic errors отклоняются без commit.

Operation record имеет точные fields, node category и stale-source guards. Диапазоны восстанавливаются из собственного AST, user offsets не принимаются. Новая программа проходит прежние source/IR/closure/UI checks и existing Undo/persistence. Это структурные source edits, не самостоятельный графовый язык и не arbitrary port rewiring. Формы IDE заполняют literal/operator/call values из выбранного узла; call arguments вводятся EMS expressions по одному в строке. Для блока — позиция и инструкция. Generic/full CFG/collection/free layout ограничения AC-059 сохраняются.

Tests/control-graph-ops.test.mjs доказывает actual literal/operator/runtime+standalone result, signed zero, typed call and argument injection negatives, block insertion/deletion/Undo, missing return, multi-statement and stale/category/field failures. Actual Chromium forms меняют call→3, вставляют state write перед вычислением→63, удаляют его→3, меняют literal→4 и operator→5; wrong call argument не меняет source/preview. Full canvas/unified manager/MVP/deploy остаются открытыми.

## Каталог и lexical value→call port — AC-061

`handlerGraphCatalog(editor,event)` перечисляет actual installed text-callable contracts с ID/version/kind/inputs/output/effects/capabilities, а также checked source functions с их реальными signatures/policies. Native resource constructor output представлен как ResourceHandle<T>; inspection не вызывает implementation. Collection templates скрыты, поскольку их source projection пока UNSUPPORTED_VISUAL_PROFILE; existing pure collection editor остаётся рабочим.

Graph nodes теперь включают typed function parameters и локальные declarations. Calls имеют actual input ports/source target. Name occurrences показывают связи с исходным lexical definition, а не только одинаковым текстом имени.

`connectHandlerGraphPort(editor,event,expectedSource,sourceId,targetId,port)` подключает parameter, let/using binding, existing named reference или immutable literal к одному входу CallExpression. При parameter/local connection frontend получает ссылку на существующее имя; producer computation не копируется. Source binding и target visibility сравниваются по AST definition identity с учётом functions, block position, branches, for/catch scopes. Одноимённая переменная другой ветви/функции не выдаётся за выбранную. Reference implementation запрещает nested redeclaration/shadowing; source graph это правило не меняет.

Произвольный computed/effectful expression нельзя подключить копированием. Его сначала надо поместить в actual let/using binding существующим language authoring. Connection before declaration, outside lexical scope, wrong type, unknown port или stale source отклоняются до commit. Local mutable value читается при фактическом выполнении consumer согласно EMS semantics; это не новый memo scheduler.

IDE показывает catalog signatures и позволяет выбрать target для существующей операции Call. После выбора call node доступны source value и named typed input port, кнопка «Соединить порт». На SVG отражаются actual definition-use edges. Это working initial named-port connection, не arbitrary mouse wire dragging/control-region relocation/full canvas.

Tests/control-graph-links.test.mjs: actual catalog/native handle metadata without execution; parameter/computed local runtime+standalone4, Undo; trusted effectful producer executes once when its binding connects, direct call-copy rejection; type/branch/function/unknown port/stale negatives. Actual Chromium catalog/port forms: parameter connection produces1 after two events, selected state-write call3, computed local connection2 and visible binding edges. Full AC-012/collection source projection/layout/unified manager/debugger/MVP/deploy остаются открытыми.
