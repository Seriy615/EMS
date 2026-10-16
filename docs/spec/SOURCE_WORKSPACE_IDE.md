# AC-138 — исходные проекты и общий граф в IDE

Исходная программа хранится как `ems-source-project/1`: entry file и Map текстовых
файлов. Каталог Studio хранит такой документ с kind `source`; metadata имени/ID
проекта не меняет IR. Импорт, копирование и экспорт не заменяют исходники
скомпилированным snapshot. На главной есть новый исходный проект и готовый
счётчик из app.ems, lib/Counter.ems, lib/Math.ems. Старые document/workspace
редакторы продолжают работать. Старую вкладку EMS следует обновить перед работой
с новым kind: старый код каталога не знает этот тип документа.

## Проверяемая цепочка

1. `/web/source-project.html?project=...` открывает дерево настоящих EMS-файлов.
2. Редактор сохраняет отдельный bounded draft после изменений; он может содержать
   синтаксические ошибки и временно отсутствующие imports. Сохранённый проект не
   изменяется. До загрузки модели поля/команды отключены.
3. «Проверить», «Запустить» и сборка используют именно текущий черновик. Общий
   parser/linker/type/effect checker строит тот же IR, что Node CLI AC-136.
   Выбор native/pure производится по декларациям, без fallback после ошибки.
   Auto native требует объявленного экземпляра/UI; обычный контракт запускается
   по имени входа (по умолчанию Main).
4. «Сохранить проект» ещё раз проверяет actual snapshot общим компилятором.
   Только после успеха обновляется каталог. Перемещение файла переписывает
   относительные import strings в перемещённом файле и его потребителях по
   расположенным токенам; комментарии, aliases и остальной текст остаются.
   Удаление используемого файла/entry отвергается с указанием зависимости.
5. После проверки кнопка исходного тела `graph` открывает обычный full canvas.
   Сигнатуры, imports, поля и инварианты остаются в файлах. Сохранение изменяет
   только диапазоны тел соответствующих AST-узлов, восстанавливая module/self
   references, и пересобирает весь entry dependency closure.
6. После обратной записи сравниваются intended graphs с настоящими повторно
   связанными authored graphs. Совместимых типов недостаточно: неоднозначная
   owner/helper привязка тоже отвергается. Сравнение сохраняет signed zero.
7. Несколько экземпляров используют одно определение. Правка его тела обновляет
   все экземпляры; сохранённый canvas строится заново из новой программы.
   Геометрия/описания/аргументы переносятся по совпавшим IDs отдельно от семантики.
8. Run pure работает в terminating compiler/runtime Worker. Native UI использует
   прежний UI Worker, тот же native instance owner, события и инварианты. Каждый
   запуск создаёт новое состояние; изменение текста/Stop/pagehide отменяет старый
   compiler и preview. Никакие initializers/guards не исполняются при Check/Build.
9. Сборка выдаёт настоящий самостоятельный JS либо DOM TAR. Preview snapshot
   временный: его правки никогда не становятся второй версией программы.

## Хранение и конкуренция

- Program: `ems.studio.manager.v1`, source snapshot (64 files, ≤1 MiB aggregate
  UTF-8, canonical relative paths, existing 4 MiB JSON limit).
- Text draft: `ems.source.workspace.<project>`, schema
  `ems-source-workspace-draft/1`, exact base + current source, ≤8 MiB.
- Graph draft/presentation: `ems.source.project.flow.<project>:<selector>`, schema
  `ems-source-project-flow-draft/1`, exact base + bounded normal flow project.
- Run arguments/entry: `ems.source.preferences.<project>`, metadata, вне IR.
- Reset сохраняет recovery copy `.previous`; локальный текст, не сохранённый из-за
  quota/conflict, доступен отдельной загрузкой и архивируется в `.local` перед reset.

Compare-before-write проверяет и source, и draft bytes, включая изменения
зависимости в другой вкладке. Это локальный optimistic guard, а не обещание
линеаризуемой многопроцессной транзакции localStorage. При конфликте нет silent
merge/overwrite; доступна копия черновика. Устаревший graph draft не подменяет новую
программу: используется только проверенное оформление совпавших узлов. После
commit обновление presentation может дать предупреждение, но не ложный rollback
уже сохранённых source files. Catalog/view caches зависят от exact storage bytes
и возвращают изолированные копии; чужая правка заново проходит валидацию.

## Границы профиля

Text files используют общий язык: UI/state declarations, structured functions,
модули и поддержанные common runtime/compiler профили. Graph save поддерживает
исходные `graph` bodies, существующие в настоящем compiled scope: обычные
контракты и native переходы/initializer/invariant helpers. Для structured body
работают текст/run/build; полноценный module-aware graph inverse такой формы ещё
не реализован. Неиспользуемая private реализация может не входить в исполняемый
scope; её можно редактировать текстом/экспортировать/подключить.

Создание/удаление определения и смена его сигнатуры выполняются в тексте, затем
компилятор проверяет потребителей. Неизвестные временные compiler helpers не
выдаются за исходные определения. Доступ к private/transitive names не расширяется
редактором. Только graph тела меняются визуально; layout не влияет на IR. Layout
при переименовании самого файла/символа не имеет постоянного независимого ID;
перенос такого оформления остаётся открытым. Source export содержит файлы;
локальные presentation/drafts не являются частью source-project/1.

В source project визуальный UI designer использует тот же `InstanceUIProjectEditor`,
UI Worker и DOM preview, что и обычный native проект. Свойства виджетов и привязки
событий сериализуются обратно в UI-декларации исходного `app.ems`; логика
импортированных контрактов и другие source spans остаются неизменными. Привязанный
обработчик открывает его настоящий graph body в обычном canvas. Возврат ведёт к
исходному UI-файлу, а не к файлу реализации импортированного контракта. Невалидный
кандидат или устаревшее окно не меняет сохранённый source project.

Этот срез не превращает structured-body `if`/`for` в редактируемый граф и не
добавляет визуальное изменение сигнатур. FFI host bindings, native SDK,
распределённое размещение, dynamic lifetime и полный язык не объявлены завершёнными.

Проверки: tests/source-workspace.test.mjs, tests/source-project-job.test.mjs,
tests/source-project-ui.test.mjs, Chromium tests/browser/source-workspace.test.mjs
и tests/browser/source-project-ui.test.mjs. Клиент отдельно ограничивает
загрузку compiler Worker и его работу (5 s +5 s), late replies после Stop
игнорируются. Операционный бюджет остаётся 10000, глубина32. Существующие common
runtime limits/unsupported profiles не повышаются ради демонстрации. Scope/evidence
публикации фиксируется в STATUS.
