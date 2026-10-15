# Применение полного native EMS к текущему документу

AC-134 продолжает [NATIVE_MODULE_SOURCE.md](NATIVE_MODULE_SOURCE.md) и [NATIVE_GRAPH_ORIGINS.md](NATIVE_GRAPH_ORIGINS.md). Это один общий parser/checker/IR/runtime/compiler; текст не является вторым исполнителем или копией UI handlers.

## Текущий исходник

`printInstanceProjectSource` проверяет документ и печатает всю текущую программу: определения, поля, инварианты, экземпляры и их реализации, UI и event/property bindings. Сохранённые полные flow witnesses и checked graph origins печатаются graph-телами, с исходными node IDs, портами, связями, pins и shared storage. Остальные функции используют существующий finite IR→EMS backend. Настоящие physical state operations печатаются логическими обращениями `left::value::read/write`.

Helper aliases исходника сопоставляются с настоящими function IDs отдельно в body/initializer/invariant/override scopes. Печатающий backend сообщает реальные bindings, а Studio заменяет только located declarations, для которых существует проверенный graph witness. Неисполняемые owned graph helpers тоже печатаются настоящими определениями. Полностью неиспользуемые body-library contracts помечаются `export`; native lowering сохраняет реальные concrete synchronous implementations в общем specialization table, без дополнительных вызовов. Этот retention marker не создаёт UI operation, не выдаёт capability и не подменяет package visibility/license policy; generic/async/foreign native exports пока отказываются типизированно. После генерации исходник повторно компилируется: публичная структура/UI и каждая существующая IR-функция должны совпасть modulo private lexical names. Скопированный hash/IR и поведенческий пример не заменяют это сравнение.

Исходный архив первого импорта сохраняется отдельно и неизменен. Архив показывается только для чтения. Кнопка «Код приложения EMS» в UI ведёт в тот же редактор полного документа; UI-only source editor по-прежнему применяет только UI fragment.

## Применение

`applyInstanceProjectSource` компилирует полный candidate и проверяет все интерфейсы, типы, effects/capabilities и UI references до сохранения. Отсутствующий UI в полном исходнике означает его удаление; UI fragment не считается полной программой. Initializers и predicates при импорте/применении/сборке не исполняются: реальные initial/invariant failures появляются при создании runtime. Неполный или ошибочный текст не заменяет документ.

Bindings вычисляются заново из проверенного текущего документа; source text не может сам объявить соответствие чужому старому function ID. Прежние aliases восстанавливают прежние identities, все реальные function calls/action entries/graph references переименовываются вместе. При collision старого retained ID с новым helper — `INSTANCE_SOURCE_ID_CONFLICT`; кандидат остаётся только текстом. Смена имени исходного helper вне известных bindings означает новую identity, автоматического угадывания переименования нет.

Лексически эквивалентные функции сохраняют точный прежний IR. Saved-flow witness сохраняется только при совпадении и executable IR, и полного authored graph (включая inactive nodes). Изменение неисполняемого узла сохраняется даже при byte-identical IR. Полностью неизменённые scope-программы и их saved-flow witnesses остаются прежними; точное применение показанного исходника без изменений — no-op документа. Изменённые графовые функции получают новые checked origins через тот же компилятор, обычные текстовые функции — действительный новый IR. Source apply не перекомпилирует структурированный IR через visual projector и не меняет число вычислений ради построения canvas.

## `ems-instance-project/4`

Версия /4 расширяет /3 обязательным `graphViews`: `{scope,workspaces:[{id,inputs,canvas}]}`. Semantic module остаётся /1. Scope обязан ссылаться на существующий checked origin; `id` — реальный function/graph ID. `inputs` и `canvas` проверяются теми же правилами, что обычный flow workspace. Metadata не исполняет код и не входит в IR. Canvas maps допускают до2048 own keys, сохраняя прежние общие node/byte/value bounds; лимит200 полей semantic records не применяется к большим positions/descriptions maps.

При text apply совпадающие node/input IDs сохраняют positions/descriptions/view и совместимые run values. Удалённые IDs удаляют metadata; новые размещаются рядом, старые не переставляются. Prototype-shaped identifiers записываются собственными data properties, без изменения prototype canvas maps. Смена типа входа сбрасывает только его значение к типизированному default. Это не inferred rename и не автоматическое соединение портов. Переименование поля обычной формой обновляет порты/metadata; capture-safe guard wrapper переносит граф и его metadata по явной compiler rename map. Обычное полное graph Save заменяет только соответствующий origin/view scope на прежний exact saved-flow witness.

Старые /1-/2-/3 совместимы. В /4 только поддерживающий её валидатор принимает `graphViews`; неизвестные поля, stale scopes/IDs, bad inputs, accessors/symbols/cycles/sparse arrays отвергаются. Runtime, настоящий UI Worker и standalone compiler используют прежний semantic module/UI.

## Черновики и конкурентное редактирование

`InstanceTextDraft` хранится отдельно по project+file identity. Максимум1M UTF-16 units текста и4MiB semantic-base string; остальной документ ограничен4MiB. Ошибка quota сохраняет введённый текст в памяти и даёт возможность скачать. Применение проверяет document semantic CAS и draft storage CAS; новое состояние другого окна не перезаписывается. Geometry/descriptions/run arguments исключены из semantic identity и берутся из последнего документа при применении. Изменения программы/UI/реальных графов требуют явной загрузки актуального текста или сохранения своей копии. Старый текст при explicit Load/успешном Apply сохраняется как `.previous`; при сбое cleanup применённая программа остаётся сохранённой, старый draft доступен для восстановления. CAS использует оптимистические compare-before-write проверки существующего localStorage manager, не распределённую транзакцию. Undo/redo сохраняет целые документы, workspace siblings независимы. Неприменённые canvas drafts не удаляются и могут стать stale по прежним правилам.

## Границы

Finite synchronous native module/1 и текущий UI профиль; imports, dynamic instances/lifetimes, async/resource native source и полная visual projection произвольного structured source не объявляются завершёнными. `try/match` и другие неподдержанные visual constructs могут оставаться корректным текстом без доступной ordinary projection. Это не основание заменять их демонстрационным графом.

Native file checking допускает до1024 graph bodies/8192 graph nodes (общий checker сохраняет жёсткую configurable верхнюю границу1024/32768); ordinary source defaults остаются33/1024. Это позволяет независимым initializer/guard scopes одного native файла повторно использовать графы без плоского лимита33 на весь generated text. Каждое authoring program/witness по-прежнему ограничено33 graphs/1024 nodes, действуют source/token/IR/native module bounds. Верификация и печать консервативно отказывают при невозможности доказать соответствие.

Node: `tests/native-source-apply.test.mjs`; Chromium: `tests/browser/native-source-apply.test.mjs`. Это вертикальный срез G-01..03/G-14, не завершение глобальной цели EMS.
