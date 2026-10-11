# Визуальный редактор и проект Studio v1

EMS-030 / AC-045. Начальный работающий dataflow editor, не полный WEB IDE MVP из утверждённого вложения. Root npm run studio теперь открывает редактор; прежний M0 explorer сохранён на /web/explorer.html. Интерфейс — русский, публичные model APIs — English.

```bash
npm run studio
node --test tests/studio.test.mjs
node --test tests/browser/studio.test.mjs
```

Добавьте два Number inputs, задайте JSON значения через инспектор, добавьте Сложение. Соедините каждый выход входа функции с соответствующим a/b блока, затем выход блока с return. Run проверяет проект, сериализует существующий ems-ir/1, разбирает его и вызывает **существующий executeIR**. Никакого второго executor нет. Начальный registry — реальные 7 core arithmetic contracts; String/Boolean/NumberArray/Number inputs и literals исполняются в том же профиле. Нет fake Map/Filter/UI/State blocks без implementations.

Составные контракты теперь реализованы отдельным срезом EMS-031: см. STUDIO_COMPOSITES.md. С ними snapshot использует v2 и persisted registry closure; описание v1 ниже остаётся форматом проектов без definitions.

## Проект и редактирование

ems-studio-project/1 хранит id/name, semantic IR, typed input values и отдельный canvas {positions,view}. Schema studio-project.schema.json описывает структуру; executable parser дополнительно проверяет exact fields/version/known contracts/types/pins/ports/cycles и runtime input types. Допустимы только начальные graph IR profiles. Control IR не превращается в выдуманную диаграмму: полноценный text/control visual mapping будет отдельным расширением.

project.mjs содержит ProjectEditor: addNode/addInput/connect/disconnect/literal/remove/setInput/move/viewport/undo/redo/run. Каждая команда клонирует исходное состояние, применяет изменение, вызывает обычный graph validator и лишь после успеха фиксирует новый проект и undo snapshot. Type mismatch/cycle/malformed values не меняют ни граф, ни историю. Начальные незаполненные arguments имеют явно редактируемые literals соответствующего типа; output изначально возвращает literal 0. Удаление ссылки заменяет её typed default, удаление узла/входа очищает dangling refs. Input names совпадают с IR identifier grammar; node id output зарезервирован для представления результата. Atomic nodes не обещают раскрытия.

Canvas не участвует в семантике. Move/zoom/pan меняют только sidecar; тест проверяет unchanged canonical IR. View scale ограничен 0.25..2; finite node positions bounded. History до 100 состояний, project до 1000 nodes /100 inputs. Preview canvas не оптимизирован для тысяч узлов; это bounded reference editor. Пользователь соединяет ports кликами, удаляет connections кликом на линию либо через инспектор, перемещает card за заголовок. Validation failure подсвечивает известный destination block; runtime diagnostics выводятся в panel. Полный runtime-to-node trace/debugger ещё не реализован — ложная точная локализация runtime error не заявлена.

Number -0 в semantic IR и input metadata сохраняется без смешения со String "-0": Number/NumberArray input values кодируются по объявленному типу. JSON fields/enum validation самого IR выполняется existing parser. Unknown fields/project version/invalid positions и reserved names отвергаются. Arbitrary JS, plugins, system commands или foreign modules из project file не исполняются; imported artifacts должны соответствовать core registry. Project importer ограничивает файл 4 MiB; schema engine отдельно не запускался.

## Сохранение и импорт

ProjectStorage использует один localStorage key ems.studio.projects.v1 с active id и map serialized projects. Одна atomic setItem сохраняет одновременно данные и выбор проекта. До записи проверяются все snapshots; до 50 проектов и 4 MiB encoded storage. Quota/corruption не удаляют предыдущую запись; UI показывает «Не сохранено» и оставляет memory project доступным для export. Ошибка startup storage не очищает повреждённые данные. Autosave после принятой команды, Save/Ctrl-S, project dropdown, New, download JSON и file import работают. Незакоммиченный текст textarea требует «Применить»; применённый graph не теряется при reload.

Import проверяет весь файл до замены active editor. Если id уже существует, создаётся отдельная копия с новым id и именем «(импорт)», чтобы не перезаписать сохранённый проект. Local storage — browser/origin specific; это не cloud sync или durable database. При очистке browser storage пользователь должен иметь export backup. Нет серверного исполнения в этом этапе; local trusted core не является универсальным arbitrary-code sandbox.

## Приёмка и следующие этапы

tests/studio.test.mjs (7): real shared execution/transport, canvas IR independence, input/graph history, type/cycle rollback, delete/disconnect, signed-zero inputs vs String, atomic persistence/quota/corruption, prototype-like own input names и strict metadata. Actual tests/browser/studio.test.mjs: create inputs→add contract→connect→Run=5, wrong type rejection, real mouse drag, undo/redo, zoom, actual file download/import to a copy, original project reopening and browser page reopening with Run=5. Screenshot /tmp/ems-studio.png сделан реальным Chromium и осмотрен; он не заменяет execution evidence.

AC-045 закрывает initial finite EMS-030 acceptance: interactive typed editor, undo и saved graph roundtrip. Full MVP/AC-012 остаётся открыт. EMS-031 теперь закрывает initial composite authoring/expand/edit/reuse (AC-046). Далее библиотека logic/text/array transformations, text editor на общем IR, events/state/UI counter, три actual demos и их browser tests. Deploy после полного утверждённого MVP acceptance; owner authorization сохранена. Нельзя считать readonly M0 или этот первый editor slice полным IDE/deployment.
