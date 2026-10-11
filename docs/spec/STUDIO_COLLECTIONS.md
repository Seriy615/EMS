# Визуальные типизированные коллекции — начальный профиль

EMS-034, AC-050. IDE создаёт и редактирует Map/Filter над NumberArray с явной ссылкой на типизированный контракт. Это представление compile-time application, не atomic JS callback и не новый runtime. Дополняет COLLECTION_TEMPLATES.md и STUDIO_PROJECT.md.

## Создание и редактирование

В библиотеке «Map / Filter» задаются ID, операция и преобразование. Map принимает контракт с одним Number input и Number output, Filter — одним Number input и Boolean output. Созданная привязка появляется в каталоге с одним портом values:NumberArray и NumberArray output. Callback выбирается из atomic/composite контрактов; версия фиксируется явно. Составной callback можно раскрыть из инспектора, изменить как граф и вернуться к потребителю. Правка меняет результат всех пользователей этой привязки и входит в aggregate Undo/Redo.

Выполнение требует отсутствия effects/capabilities во всей closure, включая неиспользованные зависимости. Неверная сигнатура, версия, рекурсивная зависимость или удаление используемой привязки/определения отклоняются до принятия изменения. Пользовательская строка не становится исполняемым именем функции: descriptor проверяется и связывается с фактическим контрактом до lowering.

## Единая семантика

Graph frontend разворачивает обычные составные графы в типизированные функции и приложения std.array.map/filter, затем использует существующий parser/type checker/normalizer/control IR/runtime/compiler. Уникальный SSA local сохраняет вычисление demand-node ровно один раз; неиспользованные чистые узлы остаются lazy. Explicit sequence выполняется перед возвратом, включая явно назначенные неиспользованные операции. Вложенные графы имеют отдельный memo scope.

Коллекции и раскрытые callback bodies используют один бюджет steps/depth/cancellation на всю программу. Не запускается новый executeIR на каждый элемент. Atomic host implementation остаётся доверенной границей, без обещания sandbox. Порядок, пустые массивы, копирование результатов и Filter signed zero совпадают с source templates. Immutable append reference пока может иметь квадратичную стоимость.

Внутренние function symbols кодируют ID/version исходного графа и выбранной реализации. Это сохраняет различие closure identities в semantic IR/program lock даже при одинаковом теле; canvas, пользовательские значения входов и layout не входят в semantic IR.

## Сохранение v3

Проекты с привязками записываются в ems-studio-project/3: root и editable definitions (graph/inputs/canvas/references), collections descriptors, проверенный root semantic IR. Схема — schemas/studio-collection-project.schema.json. Graph authoring refs имеют явный тип literal; Number/NumberArray signed zero кодируется строковым маркером только внутри соответствующего typed value. String "-0" остаётся строкой.

Чтение ограничено существующими project/storage лимитами (50 definitions, 50 bindings, 1000 total nodes; expansion gate10000/depth32). Reader сначала восстанавливает/проверяет whole project, exact referenced versions, signatures/effects/cycles и заново lower-ит граф. Saved IR обязан канонически совпасть с результатом; подмена IR отклоняется IR_MISMATCH. Missing/tampered pin отклоняется CONTRACT_VERSION. JSON порядок полей reference record не меняет семантику. Canvas валидируется отдельно. Schema служит структурным описанием; runtime validator дополнительно проверяет типы, closure и IR witness.

v1/v2 чтение и запись не меняются; после удаления последней неиспользуемой привязки сохраняется прежний формат. Storage, экспорт/импорт и Undo используют общий project codec. Text Apply другого обычного графа сохраняет коллекционную библиотеку проекта.

## Текст и ограничения

«Из графа» создаёт исполняемый текст тех же функций/templates. Run и JS export используют общий backend. Произвольный control source обратно в этот canvas ещё не преобразуется: Apply получает UNSUPPORTED_VISUAL_PROFILE. Прямой source вызов ID визуальной привязки запрещён; в source используются std.array.map/filter и явные typed callbacks. Source callbacks/generics поддерживаются текстовым frontend; visual profile пока выбирает atomic/composite Number callbacks.

Owned public interface graphs и разворачивание коллекций через interface-boundary composite пока получают UNSUPPORTED_PROFILE: pre/post/error границы не удаляются ради lowering. Обычные base interface-boundary callbacks остаются непрозрачными вызовами и сохраняют guards. External IDs и root input names должны представляться текущей source grammar; невозможные имена получают ошибку frontend. Dynamic first-class callables, closures, effectful/async-output mappings, другие element types, full control canvas/source roundtrip — отдельные расширения. AC-012, полный WEB IDE MVP, native targets и глобальная цель этим срезом не закрываются.

## Evidence

examples/studio-collections.ems.json: Map abs → Filter user.Positive(value>2), [-2,-0,3] → [3]. tests/studio-collections.test.mjs проверяет shared IR/runtime/text/standalone, fresh independent process, editable callbacks/undo/storage, strict v3 pins/witness/negative shapes/signed zero, lazy/sequence failures, effect/signature/cycle rejection и общий бюджет. tests/browser/studio-collections.test.mjs создаёт всю программу через реальные элементы IDE, редактирует предикат, проверяет Undo/Redo/Save/FromGraph/Run/reopen и запускает exported module на независимом origin после выключения runtime server, без запросов EMS source.
