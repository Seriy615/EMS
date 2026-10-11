# Независимый UI-пакет — начальный finite профиль

EMS-061 IN_PROGRESS; AC-057. Одна проверенная `ems-ui-app/1` исполняется через UIRuntime либо экспортируется в самостоятельное DOM-приложение без EMS IDE, sources или сервиса. Профиль поддерживает существующие column/row/text/button/textInput/checkbox, typed state/property/event bindings и разрешённые standalone handlers. Это расширение AC-056 state session, не production/native UI/PWA или полный WEB IDE MVP.

## Compiler и общий runtime

`compileUIJS(application, baseRegistry)` из `src/compiler/ui.mjs` проверяет весь UI/IR closure существующим linker, затем компилирует reactor через `compileReactorJS`. Generated module экспортирует `createRuntime(options)` и `mountApplication(host, options)`.

Интерпретируемый UIRuntime и generated output используют один `UIKernel`: snapshots/view/trace, typed events, disabled gate, event input bindings и close. Единственный `ReactorKernel` сохраняет FIFO/state isolation/commit/rollback/cancellation. Включён существующий `mountDOMRuntime`: фиксированные DOM tags и безопасные properties, обновление существующих elements с сохранением focus, labels, listener cleanup, host ownership и failed-input restoration. Нового языка UI или альтернативного evaluator/scheduler нет.

`createRuntime({policy,maxQueue,recordTrace})` проверяет явные ui.render capability/effect, policy всех handlers (включая невидимые) и параметры session. `mountApplication(host,{policy,onError,...options})` возвращает тот же controller interface: runtime, dispatch, refresh, idle, close. Отсутствующие grants отвергаются до монтирования. Compiler не выдаёт permissions и не исполняет обработчики при сборке.

State/литералы сохраняют Number signed zero, String "-0", Boolean и NumberArray. Object input names, включая own `__proto__`, не меняют prototype. User text не вставляется в HTML/JS script contents страницы: UI создаётся через существующий DOM adapter, bindings встроены как кодированные JS values в внешнем module.

## Сборка из сохранённого проекта

```bash
npm run export:ui
# or:
node tools/export-ui.mjs examples/ui-source-counter.ems-ui.json --policy examples/ui-policy.json --out dist/counter-ui
```

CLI проверяет typed project schema/version/ref closure и воспроизводимость source→IR witness. Policy передаётся отдельным файлом и проверяется до записи package. Пример grants относится только к DOM и local state, не OS/network/device APIs. Invalid project/source/policy/unsupported backend не перезаписывает существующие артефакты. IO failure при записи не гарантирует атомарность каталога; deployment rollback остаётся отдельной процедурой.

Результат: `application.mjs`, `bootstrap.mjs`, `index.html`, `style.css`. Пакет можно размещать на обычном static host, включая вложенный URL. Imports bootstrap относительные; compiled application не импортирует EMS. При pagehide controller закрывается. Стандартные JavaScript APIs и Browser DOM остаются declared environment dependencies. Сохранённые initial values включаются в artifact; runtime state preview не экспортируется. UI runtime errors показываются кодом в локальном alert, telemetry отсутствует.

`exportUIProject(projectSource,directory,{policy})` из tools/export-ui.mjs — Node packaging API. Сам compiler доступен Node и Web, packaging CLI использует Node filesystem. IDE package download теперь реализован по AC-058 ниже; CLI и IDE используют общий builder.

## Приёмка и ограничения

`tests/ui-compiler.test.mjs`: interpreter/compiled value/state/view/trace parity, concurrent FIFO, failure rollback, types/events/disabled/close, UI/all-handler grants, invalid trees/backend, source drift/previous output preservation, signed zero/own port names и fresh Node module execution.

`tests/browser/ui-compiler.test.mjs`: actual Chromium DOM exercise в EMS runtime, остановка origin, затем тот же пакет на independent static host под nested path. Реальные clicks/inputs/checkbox, error rollback, disabled control, focus/accessibility, inert malicious-looking text, listener/session close и отсутствие запросов к `/src/`/`/web/`. Это рабочий Node semantic UI + Web/DOM export proof; поддержки Windows/macOS native/mobile UI он не доказывает.

Поддержаны control IR v2 kernel-state handlers и pure graph IR v1. State graph IR v1/effectful composite host graphs/native resources/IO backend пока UNSUPPORTED_TARGET. Скомпилированный DOM runtime работает в main thread под existing step budget; Worker hard deadline/sandbox не включён в пакет. State program lock/provenance, source maps, PWA/service worker/installability, full graphical control handler authoring/unified manager и MVP/deploy остаются открытыми. Global language/ecosystem goal сохраняется полностью.

## Экспорт из IDE — AC-058

На `/web/ui-demo.html` кнопка **«Скачать приложение (.tar)»** собирает текущую применённую программу. Она ждёт завершения queued authoring/preview изменений, повторно проверяет source/IR/ref closure и explicit existing UI/state policy, затем скачивает `ems-ui-app.tar`. Unapplied drafts не заменяют программу; preview runtime state не копируется в initial values. Экспорт не изменяет editor history, source или текущую preview-сессию.

`buildUIProjectPackage(projectSource,{policy})` в `src/compiler/ui-package.mjs` — общий Web/Node builder. CLI экспорт теперь только записывает его файлы. Browser и CLI output byte-identical для одного source/policy. Никакой Node-only module, локальный filesystem или hosted build service браузеру не нужны. Package содержит те же четыре static files AC-057; после распаковки они размещаются на static host.

`packageTAR(files)` создаёт стандартный uncompressed POSIX ustar archive regular files с deterministic zero timestamps и UTF-8 содержимым. Только flat ASCII имена; нет директорий, links или произвольного extraction API. Ограничения: не более16 файлов и16MiB всего archive. Unsafe names/non-text/oversize дают INVALID_PACKAGE/PACKAGE_LIMIT. Новых зависимостей нет. Browser packaging/compilation выполняются в main thread; hard Worker deadline этим API не обещается.

`tests/ui-package.test.mjs` использует системный tar как независимый oracle: exact UTF-8/empty/block-boundary bytes, names, deterministic output, limits/path negatives и CLI/Web parity. `tests/browser/ui-compiler.test.mjs` меняет реальный EMS handler в IDE, проверяет preview=3, скачивает/распаковывает архив, сравнивает файлы с builder, останавливает EMS origin и запускает **скачанный** пакет: initial=0, first press=3. Unsupported legacy state graph export показывает UNSUPPORTED_TARGET, не скачивает новый archive и сохраняет source/preview count=1.

Control handler graph editing/unified manager, PWA/native/platform expansion/source locks и полный MVP/deploy остаются открытыми. Initial IDE download реализован; он не закрывает все требования visual/text parity.
