# Приёмка первой браузерной версии EMS

Основание — подтверждённое владельцем задание WEB IDE MVP + deploy, затем уточнение «сначала ядро». Глобальная цель языка/экосистемы остаётся активной. Эта приёмка не закрывает full-language visual parity, все платформы, native/FFI/compiler backend или P1/P2 IDE-функции.

## Как начать

1. На странице «Проекты» создайте программу или интерфейс приложения.
2. В программе выберите «Сумма двух чисел» в меню примеров либо добавьте операции слева. Соедините круглый выход с входом другого блока и с результатом функции.
3. Нажмите вход или блок: справа появятся его свойства и значение. «Запустить» показывает результат в нижней панели. «Текст» переключает представление EMS. Точку останова можно добавить в свойствах блока или кнопкой «Точка под курсором» в тексте; в нижнем разделе «Точки останова» включите «При отладке сразу идти до точки» и нажмите «Отладка». «Продолжить» идёт до следующего совпадения, «Шаг» — до следующей операции. На паузе «Через операцию» пропускает внутренние шаги и вложенные вызовы, «Из функции» продолжает до вызывающего кадра или завершения. Эти кнопки доступны также для UI-событий; изменение данных подтверждается прежней транзакцией.
4. Свои составные контракты и коллекции находятся в раскрываемом разделе слева. «Файл» содержит импорт и резервную копию; «Экспорт JS» скачивает самостоятельную программу.
5. В редакторе интерфейса слева находятся данные, EMS-обработчики, элементы и связи событий; справа — работающий предпросмотр. Код первого обработчика открывается сразу. «Точка под курсором» и «Точка на выбранном узле» добавляют остановку обработчика; в предпросмотре откройте «Точки останова», включите ход до точки и начните новый запуск отладки. Добавление точки в idle preview сохраняет состояние; изменение policy на паузе применится также к следующему событию. JSON проекта доступен в дополнительном разделе ниже.

Проекты сохраняются в текущем браузере. Перенос между устройствами требует экспорта/импорта. Узкий экран складывает панели вертикально; сложный граф удобнее редактировать на широком экране.

## Локальные сценарии P0

| Требование | Реализация и доказательство | Ограничение |
|---|---|---|
| Открыть → создать граф → добавить/соединить блоки → ввод → Run | `tests/browser/studio.test.mjs`: DOM controls, Number2+3=5, типовой конфликт отвергнут | Node22/Chromium reference profile |
| Библиотека арифметики/значений/логики/сравнений/текста/массивов | 36 typed standard contracts + core, `tests/browser/stdlib.test.mjs`, public catalog/IDL | Select/eager And/Or явно обозначены; lazy if/&&/|| — текст EMS |
| Map/Filter | `tests/browser/studio-collections.test.mjs`: actual typed callbacks/composites/edit/serialization/export | Static NumberArray profiles, не произвольный host callback |
| Полотно: добавить/удалить/соединить/переместить/масштабировать/панорамировать | `web/studio.mjs`, project model tests, real browser mouse drag/zoom + Undo/Redo | Pure dataflow canvas; произвольный control CFG ещё открыт |
| Вложенные составные контракты, editable/reuse/expand/collapse | `tests/browser/studio.test.mjs` Sum→Outer→Sum editing, persist/run12 | Atomic implementation не раскрывается |
| AVG5 — именно раскрываемый составной контракт | `examples/studio-avg5.ems.json`, `tests/studio-avg5.test.mjs`, `tests/browser/avg5.test.mjs`: six operations, input3, body divisor4→2.25, Undo3, wrapper nesting/reopen2.25 | Арифметика `(sum-min-max)/3`; **не WCA**, нет DNF/penalties/rounding/cardinality guard |
| Текстовый EMS, единый IR/runtime | `tests/browser/studio.test.mjs`: Run10/apply/Undo5/IR/control4/draft/reopen/Stop/deadline | Full control→visual round-trip/source debugger не готов |
| UI.Text/Button/Input/Container, properties/state/events | semantic UI kinds + DOM renderer + authoring forms, `tests/browser/ui.test.mjs`: create from empty, button/input/checkbox/state rollback/source edit/reopen | Отдельный UI workspace, не вся UI palette внутри pure graph canvas; universal UI factory/IDL ещё открыт |
| Реальный интерактивный счётчик | UI binding → source frontend → original control IR → transactional reactor → DOM; persistent Worker preview | Browser backend, не native/mobile |
| Inspector/errors/duration/logs | typed graph inspector, original source diagnostics, graph failure observer identifies exact node/caller; actual Worker lifecycle log; `tests/runtime-observer.test.mjs`, `tests/browser/avg5.test.mjs` division error marks node | Log — lifecycle/validation/result, не полный step debugger/data-flow trace |
| Сохранение/open/new/import/export/examples/refresh | legacy codecs + unified catalog, `tests/browser/project-manager.test.mjs`: draft12/apply graph/refresh12, edited counter4/refresh4, create/copy/rename/file import originals | Browser-local; backup/export explicitly required, no server collaboration |
| Standalone output | independent graph/composite JS + compiled state/UI TAR; `tests/browser/ui-compiler.test.mjs`: exported edited app after EMS origin shutdown | Finite JS/DOM target, not native/PWA |
| Исполнение без произвольных системных команд VPS | EMS executes in browser Workers; VPS only GET/HEAD static asset server; `tests/ide-server.test.mjs` denies server data/POST/PUT/DELETE | Trusted built-in JS backend, не sandbox для произвольных plugins |

## Публикация: отдельная фактическая приёмка

SSH `ems-vps` доступен; public A domain →85.198.64.183. До этой итерации TLS на `dev-ems.d-mash.ru` не покрывал домен (`curl` exit60). На VPS уже работают другие staging приложения; их configs/services не принадлежат этой задаче.

Новый namespace — `ems-language-dev`: isolated unprivileged static Node service on127.0.0.1:18877, resource limits/restart/journal, dedicated nginx vhost/cert/auth, Git revision releases/atomic current/previous rollback. `tools/deploy.mjs` требует чистый commit, запускает test/verify/browser:test до upload, создаёт access secret вне Git, публикует только проверенный Git archive. `tools/deploy-smoke.mjs` отдельно проверяет настоящую цепочку HTTPS, 401 без credentials, redirect, boundaries и actual Chromium graph15/reopen15/AVG5 expand/counter1.

Фактическая публикация **PASS**: gated release `dc7ced833cd3c021cf9388269e0d6effb3cf96df`, 678/130/25 tests. Проверены доверенный TLS/auth/access boundaries, actual Chromium create/connect/run15, создание/reuse/expand пользовательского composite15, reopen15, AVG5 и counter1. Recovery PASS; настоящий rollback на успешный f356ee3 и повторный live smoke PASS, восстановление dc7ced8 и финальный live smoke PASS. Сохранность чужих configs/services проверена. Конкретные SHA, наблюдения и логи — `docs/qa/DEPLOYMENT.md`. EMS-035 DONE для owner P0; все ограничения матрицы остаются действующими.


Точки в исходнике и графе обработчика теперь проверяются при применении source. Комментарии и вставка соседнего оператора могут сохранить точку на новом адресе. Изменённая или неоднозначная операция отображается как «не привязана» и не останавливает приложение. UI точки сохраняются локально отдельно от программы и перепроверяются при повторном открытии; «Убрать все точки» удаляет также непривязанные. Ошибка quota оставляет прежний набор. Studio поддерживает reattachment в текущем workspace; durable persistence пока открыта.


Studio теперь сохраняет графические и текстовые точки локально для каждого проекта. Переход «Граф ↔ Текст», смена entry/lowering и повторное открытие сохраняют отдельные contexts; непривязанные точки не останавливают программу. Изменённая библиотека отображается как `library-changed`, Undo может восстановить привязку. «Убрать все точки проекта» очищает все его contexts. Файл импорта всегда открывается как новый проект и не наследует локальную отладку; export программы не содержит points. Ошибка хранилища оставляет прежнюю pause policy. Cross-tab synchronization и inspection runtime values пока открыты.
