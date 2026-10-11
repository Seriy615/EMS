# Типизированный UI-проект и сохранение

EMS-050 IN_PROGRESS, AC-052. src/ui/project.mjs отделяет runtime application ems-ui-app/1 от переносимого authoring artifact ems-ui-project/1. src/studio/ui-project.mjs обеспечивает проверяемый transactional snapshot/Undo и local storage. Это обязательное продвижение к UI authoring/full MVP, не завершение UI graph/source editor или standalone state/UI compiler.

## Формат и signed values

ems-ui-project/1 имеет ровно schemaVersion,application,references. Внутри application сохраняются semantic UI hierarchy, initial state и handler IR; отдельно references содержит exact transitive contract versions. Shape schema — schemas/ui-project.schema.json. Runtime application schema по-прежнему ui-application.schema.json, в памяти имеет обычные Number/NumberArray values.

Каждый state initial и literal UI/event binding переносится как {type:"Number"|"NumberArray"|"Boolean"|"String",value:...}. Number/NumberArray -0 кодируется маркером "-0" только в соответствующем typed value. String "-0" остаётся String. State initial typed tag обязан совпадать с slot.type; неизвестные типы, NaN/Infinity, malformed refs и неверные property/event signatures отвергаются. State references, explicit number formatting и event-value refs сохраняются без преобразования в callable String. Handler programs используют существующий canonical serializeIR/parseIR — отдельный serializer IR не появился.

serializeUIProject(application,baseRegistry) сначала связывает/проверяет всё приложение; canonical fields и UI props/events/input keys записываются в фиксированном порядке, children/state/handler arrays сохраняют заданный порядок. parseUIProject(source,baseRegistry) проверяет размер/JSON/schema, декодирует typed values, создаёт actual state registry и валидирует IR handlers; затем повторяет whole-application type/link проверки и сравнивает transitive pins.

Лимиты transport: 1 MiB UTF-8 bytes в source (с предварительным length guard), до100 state slots/handlers,1000 tree nodes/depth32 и10000 contract pins/dependency depth256. File input дополнительно ограничивает bytes до1 MiB. Это не streaming parser или production isolation. Embedded future registry/package authoring пока не добавлен: referenced base contracts должны реально присутствовать у потребителя.

## Контрактные версии и доверие

Pins охватывают handler targets, все composite graph dependencies (включая unused), interface-bound implementations и resource boundary chains. Отсутствие/дубликат/подмена/лишний pin даёт CONTRACT_VERSION до execution. Порядок JSON reference fields/records не меняет семантику, writer канонизирует его. Публичные implementation version references также проверяются.

Exact versions не удостоверяют implementation bytes и не являются подписью. Содержимое handler IR/UI можно намеренно изменять как authoring candidate, после чего типизация/политика проверяются снова. Полный UI program/source provenance lock — отдельное расширение существующего PROGRAM_LOCK.md; codec не обещает byte attestation для trusted state implementations. Parser/serializer не исполняют handlers, импорт не запускает JS библиотеки и не выдаёт capability grants.

## Workspace, сохранение и preview

UIProjectEditor хранит canonical source и возвращает detached decoded application. replace(source) принимает только целиком валидный candidate, заносит предыдущую версию в ограниченную100 snapshot историю и очищает redo. Ошибка не меняет текущую программу/history. Undo/Redo возвращают checked snapshots. UIProjectStorage сохраняет один UI workspace по ключу ems.studio.ui.v1 одной atomic setItem; перед записью выполняется codec validation. Corrupt load и quota failure не перезаписывают прежние данные.

UI workspace /web/ui-demo.html теперь имеет editable typed project text, Apply, Undo/Redo, Save/Open, JSON download/file import и actual preview. Ссылка доступна из Studio. Apply дополнительно preflight-ит UIRuntime policy до закрытия предыдущего preview, а затем начинает новую event session с initial state. Неуспешный import сохраняет прошлый accepted project и preview. Обычный draft textarea не считается accepted project до Apply; Save/Export работают с accepted program.

Save сохраняет программу/начальное состояние, не runtime snapshot. После reload счётчик начинает с сохранённого initial value; независимое execution state не смешивается с authoring. Ошибка corrupt saved record открывает shipped example без автоматической перезаписи. Runtime still requires explicit ui.render/state grants, all handler closure preflight и исходный ReactorSession.

Это первый проверяемый authoring transport/workspace, пока редактирование UI происходит через typed JSON. Визуальное создание UI/slot/event bindings, text/graph handler editing with source persistence/inspect, объединённый project manager и standalone UI export остаются EMS-050/051/032 требованиями; наличие textarea не объявляется полноценным UI IDE.

## Evidence

examples/ui-counter.ems-ui.json — canonical transported counter. tests/ui-project.test.mjs: Number/array signed zero и String marker, call/control handler execution/rollback, unused nested pins/no host calls/version drift, malformed typed metadata/refs/limits/canonical record order, editor Undo и corrupt/quota storage preservation.
tests/browser/ui.test.mjs: actual edit initial=-0 и delta2, Apply/Undo/Redo, failed candidate keeps accepted program, Save, real downloaded JSON, file import initial10 и reopen returns saved initial=-0. Runtime counter still uses original EMS state handler. tools/verify.mjs проверяет canonical roundtrip и restored event=1, вместе с исходным source→IR counter equality.
