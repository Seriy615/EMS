# Составные контракты Studio

EMS-031 / AC-046. Typed pure dataflow graphs создаются, раскрываются, редактируются, повторно вызываются и сохраняются с actual dependencies. Это продолжение рабочего редактора, не объявление полного WEB IDE MVP.

```bash
npm run studio
node --test tests/studio-composites.test.mjs
node --test tests/browser/studio.test.mjs
```

В Studio загрузите пример «Сумма двух чисел», введите ID user.Sum и нажмите «Создать из текущего графа». В библиотеке появится составной контракт с исходными inputs/output и собственной копией графа. Добавьте его как блок, соедините a/b с inputs и выход с return. Выберите блок → «Раскрыть граф», либо «Открыть» в библиотеке. Измените внутренний argument/literal, нажмите «Назад» и Run: вызывающий граф использует изменённую implementation. Можно создать второй контракт из текущего графа, вызвать первый внутри него и раскрывать уровни рекурсивно. Atomic core contracts остаются leaves, без ложного Expand.

## Данные, семантика и совместимость

Внутренний project теперь содержит contracts [{graph,inputs,canvas}]. Каждый descriptor — собственная inspectable implementation с typed graph signature, id и version; это не новый формат публичного IDL/license/package и не atomic callback, изображающий editable graph. Root metadata и каждый workspace canvas/input fixture независимы. Registry собирается из trusted base и project composite graphs; actual calls исполняются ordinary shared IR/runtime. Bodies не превращаются в картинки или отдельный evaluator.

createComposite(id) копирует текущий workspace, включая inputs/output, body и canvas, под новым id/version 1.0.0. openContract/collapse/main — session navigation, не semantic operations и не autosave current graph вместо root. editWorkspace применяет accepted edits к выбранной implementation, но validates **весь проект**, включая callers. Incompatible signature edits, cycles, unknown contracts, duplicate/reserved IDs и removal referenced definition отклоняются без изменения проекта/history. Для изменения уже используемой сигнатуры сначала создайте отдельный контракт и явно измените call sites; silent argument repair или отбрасывание pins не выполняется. Unused definition можно удалить, Undo восстанавливает её. Atomic open получает ATOMIC_CONTRACT.

Раскрытие не инлайнит копию внутрь caller: два вызова одного contract id продолжают ссылаться на одну editable definition. Undo/redo сохраняют aggregate project и заново собирают actual registry; изменения внутренних bodies действительно отражаются в caller execution. Navigation не расходует history. Если Undo/remove удаляет активный workspace, выбор безопасно возвращается к root. Run внутри раскрытого workspace использует его сохранённые test inputs; Run в root исполняет application entry. Root display name не меняется при навигации.

Whole-project validation разрешает только finite pure call graph profiles (core и explicit sequence effects, без host effects/capabilities) и primitive reference values. Все bodies, включая unused nodes/definitions, проходят ordinary graph/IR checks. Dependency DFS с memoized cost ограничивает depth 32 и conservative expanded operations 10000; даже маленький исходный fanout graph может быть отвергнут PROJECT_LIMIT до recursive lowering. До 50 definitions и 1000 nodes суммарно. Это explicit reference resource budget, не arbitrary-code sandbox.

## Persistence v2 и export

Без composite definitions serializer оставляет ems-studio-project/1, поэтому прежние файлы читаются и roundtrip не меняет их. С definitions используется ems-studio-project/2: root semantic IR плюс sorted contracts [{ir,inputs,canvas}]. В body сохраняются actual versioned contract refs. Parser сначала регистрирует только signatures, затем проверяет actual IR каждого body и whole dependency graph. Signature placeholders служат разрешению ссылок при parsing; execution/compile до установки и полной проверки actual bodies невозможны. Missing definition/version mismatch/extra metadata/cycles отвергаются.

LocalStorage envelope остаётся прежним atomic record, его snapshots могут быть v1/v2. Проект export/import/reopen сохраняет все нужные editable definitions, root IR, typed input values и отдельные canvas; v1 reader отвергает v2 вместо молчаливой потери library. Неизвестный JS из файла не загружается. Existing import-copy behavior сохраняет старый saved project.

«Экспорт JS» компилирует выбранный workspace existing compileIRToJS и скачивает самостоятельный ESM с execute(inputs). Nested composite bodies реально включены в generated code. Это standalone module export, **не** новая sealed package distribution/лицензирование или доказательство secrecy. Existing compiler/sealing API остаются отдельными; IDE import исполняемого arbitrary JS не добавлен.

Пример examples/studio-composite.ems.json: root вызывает user.Outer, тот user.Sum; Sum body изменён на x+10, вход x=2 даёт 12. Можно импортировать файл через Studio и изучить оба уровня.

## Свидетельства и оставшаяся работа

7 tests/studio-composites.test.mjs: actual caller/body edit/undo, nested scope and v2 storage, canvas separation, cycle/signature/used delete rollback, atomic leaf, creating String input/output before use, pins/missing metadata negatives, unchanged v1 migration, unused delete undo, independent new-process compiled execution и exponential fanout limit. Existing model tests также проходят.

Actual Chromium test создаёт user.Sum из editable graph, вызывает его, раскрывает body и меняет literal, создаёт user.Outer, раскрывает оба уровня и возвращается назад, получает 12 и после close/reopen page снова 12 с обеими definitions. Другой browser test продолжает проверять mouse drag/undo/redo/zoom, actual download/import copy и root saved graph.

Следующий этап — реальная библиотека logic/text/arrays и text editing через общий frontend/IR; затем UI/events/state counter и third demo. Full text/control visual parity, typed public IDL authoring, sealed package import и runtime source tracing остаются отдельными gates. Owner-approved WEB IDE MVP и VPS deployment не объявлены выполненными.

Editable text source integration и sequence transport — [STUDIO_TEXT.md](STUDIO_TEXT.md); full control visual mapping остаётся открытым.
