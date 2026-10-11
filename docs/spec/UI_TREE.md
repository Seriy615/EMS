# Семантическое UI-дерево и DOM — первый исполняемый профиль

EMS-050 IN_PROGRESS; AC-051. Реализация src/ui/model.mjs и src/ui/dom.mjs. Это начало универсальной UI-модели, не завершение native UI, визуального UI-authoring, AC-014 или WEB IDE MVP.

## Программа и границы

ems-ui-app/1 содержит id/version, существующий ems-reactor/1 и ui:{schemaVersion:"ems-ui/1",root}. Reactor handlers — обычный EMS IR v1/v2, полученный из текста/графа существующим frontend. UI дерево описывает widget identity/hierarchy/properties/state bindings/event routing и не содержит JS event callbacks, DOM tags, innerHTML или альтернативного языка обработки событий. Layout/canvas программы и semantic UI hierarchy — разные артефакты. Schema ui-application.schema.json описывает структуру; executable linker дополнительно проверяет весь typed closure.

linkUIApplication(application,baseRegistry,{policy,maxQueue,recordTrace}) создаёт state registry через существующий createStateRegistry, проверяет manifest/IR посредством ReactorSession и связывает дерево с реальными сигнатурами обработчиков. Проверка и inspectable tree сами не исполняют обработчики и не изменяют DOM. Base registry — trusted host implementations; sandbox не появился.

UIRuntime(application,baseRegistry,{policy,maxQueue=64,recordTrace=false}) владеет одной ReactorSession и требует отдельные capability ui.render и allowed effect ui.render. Все handler policies, включая неиспользуемые UI события, проверяются до монтирования. State.read/write не выдаются автоматически: policy должна явно включать нужные grants. Отсутствие capability — PERMISSION_DENIED, отсутствие effect — EFFECT_DENIED. Runtime events сохраняют исходный policy preflight.

## Типы дерева

Каждый node имеет ровно id,kind,props,events,children. ID уникален в дереве. Профиль: column/row (дочерние элементы), text (String text), button (String text, Boolean disabled), textInput (String value), checkbox (Boolean checked). String label — accessibility name; обязателен для полей и флажков. Leaf children пусты. Размер до1000 nodes, глубина до32. Произвольные tags/properties/events, отсутствующие значения и дублированные ID запрещены. Native backend обязан явно сообщать неподдерживаемые семантические возможности.

Property — {literal:value}, {state:id} или {state:id,format:"number"}. Последняя форма допускает только Number slot и явно переводит значение в String для display; signed zero отображается "-0". Другие bindings сохраняют точный primitive type, без неявного String→Number/Boolean преобразования.

button.press, textInput.change и checkbox.change связываются с {handler:eventName,inputs:{port:binding}}. Inputs обязан совпадать с реальными ports и типами handler. Binding может быть constant, committed state либо {value:true} для String/Boolean control value. Press не имеет payload value. Ссылки на неизвестный slot/handler, event value вне change и несовместимые типы отвергаются до выполнения. Handler return type не задаёт render: display связан с committed state.

## События, состояние и lifecycle

runtime.dispatch(nodeId,event,value,{signal}) проверяет событие, disabled и типы, снимает inputs с последнего committed snapshot и передаёт их обычной ReactorSession.dispatch. Accepted events имеют исходный FIFO порядок; ошибка/отмена handler откатывает staged writes. UI не пытается откатить внешний IO. Входы и snapshots копируются; редактирование исходного application после создания runtime не подменяет программу.

runtime.view() возвращает проверенное новое rendered semantic tree из snapshot. runtime.snapshot/trace используют обычные detached reactor values. close запрещает новые events и завершает отмену active/queued events. Ошибки бюджетов/typed throws/cancellation сохраняют semantics общего ядра; специального JS счётчика нет.

mountDOMApplication(host,application,baseRegistry,{policy,onError,...reactorOptions}) монтирует собственное поддерево после полной проверки. Второй mount в занятый host получает UI_HOST_BUSY. DOM backend отображает column/row как flex containers, text как текст, button/inputs как native DOM controls. Label устанавливается aria-label. Press отображается в click, String change — input, Boolean change — change. Nodes имеют data-ems-ui/data-ems-kind для identity/inspectability. Неприменимые свойства не интерпретируются как DOM атрибуты.

Adapter передаёт событие runtime, после settle обновляет props из committed snapshot и при ошибке также восстанавливает controlled input. Он сохраняет элементы/слушатели и фокус вместо полного remount на каждый state change. Text вставляется textContent, value/checked/disabled — соответствующими DOM properties; HTML/script/URL не исполняются. Caller может наблюдать ошибки через onError. Promise из dispatch доступен напрямую; DOM event rejection обрабатывается наблюдателем.

Controller idle ожидает принятые DOM события; dispatch позволяет отправить явное semantic event. close сразу удаляет listeners/root, закрывает reactor, ожидает callbacks и повторно возвращает тот же cleanup Promise. Detached control после close не отправляет события. Host освобождается для нового mount; исходные чужие children не восстанавливаются — controller владеет своей mount областью.

## Пример и незавершённые части

examples/ui-counter.json связывает кнопки increment/decrement с исходным examples/counter.ems (IR handler demo.Counter) и Number state.count. В браузере /web/ui-demo.html выполняется настоящий UI→IR→state→DOM counter. Workspace запускает shipped example или сохранённый typed UI project с явными ui/state grants; Apply/Save/Open/Undo/import/export описаны в UI_PROJECT.md. Визуальное UI-authoring и handler source/graph editing остаются в работе.

Initial profile поддерживает literal/state bindings, semantic events и reactive properties; пока нет динамического изменения hierarchy, полноценной UI contract factory/IDL, layout constraints, navigation/theme, event debounce, DOM capability nodes или native renderer. API snapshots сохраняют signed zero; Typed JSON authoring codec UI/state signed values и local workspace transport реализован (UI_PROJECT.md); полный program locking/IDE source authoring ещё требуется. Для сохранения -0 вне typed IR применяется ems-ui-project/1, а не обычный JSON.stringify runtime application. Worker preview boundary реализован (UI_WORKER.md), initial UI forms/source authoring/inspect — UI_AUTHORING.md; full graphical handler mapping и portable standalone state/UI compilation и третья owner demo остаются следующими acceptance slices, а не подменяются этой страницей.

## Evidence

tests/ui.test.mjs: actual EMS handlers/FIFO/isolated copies, editable input guard/typed throw rollback, permissions and hidden effects/no host call, invalid trees/bindings/types/DOM escapes, cancellation/close/signed zero и saved counter.
tests/browser/ui.test.mjs: actual browser counter DOM clicks, reset/close, denied mount preserves host, duplicate host rejection, rollback/control input restoration, String/Boolean event type mapping, focus/accessibility, malicious-looking text remains inert, disabled button and detached listeners/closed session.

AC-057: shared UIKernel +compiled ReactorKernel и existing DOM adapter теперь включаются в independent module/static package. Initial profile parity и actual Chromium DOM after EMS origin shutdown проверены; CLI/API/limits — UI_EXPORT.md. Full graphical handler authoring, IDE package download, native/PWA/production и MVP остаются открытыми.
