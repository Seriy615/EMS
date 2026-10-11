# Studio: текст и общий IR

EMS-032, начальный срез AC-047; full AC-012 остаётся открытым. Browser editor использует существующие parseEMSModule → typecheckModule → lowerCheckedModule → IR/runtime/compiler. Второй язык или evaluator не добавлен. В текстовом режиме доступны entry, JSON inputs, Run/Stop, semantic IR с provenance, перенос в граф и самостоятельный ESM export.

## Сохранение семантики

Обычный текст (`auto`) сохраняет последовательное вычисление выражений и существующее control lowering. Неиспользуемое `core.div(1,0)` завершает программу ошибкой. Generated dataflow text (`call`) — представление графа по зависимостям: неиспользуемые pure узлы не исполняются. Выбор профиля является частью программы; ручное переключение может менять поведение. Профиль не выбирается скрыто для обхода ошибки.

textFromWorkspace экспортирует supported primitive call graph. Node identifiers сохраняются через opt-in preserveGraphIdentity в существующем lowering (binding names и normalization signed numeric literals без synthetic arithmetic nodes); координаты, typed inputs и view сохраняются отдельно. Lazy граф получает dependency-ordered SSA text и `call`; граф с полной sequence получает точно такой же порядок и `auto`. Некорректные для грамматики имена, partial sequence и lazy root с nested sequence отвергаются UNSUPPORTED_TEXT_EXPORT. Новые richer types/control graphs требуют отдельного визуального представления.

projectFromText принимает только actual ems-ir/1. Он сохраняет helpers как editable composite definitions; открытый composite заменяется только при совпадении entry, с проверкой всех callers. Root/definition inputs и canvas разделены. Применение — одна валидируемая операция с Undo/Redo, ошибка не меняет проект. Обычный последовательный call text переносит sequence в pure ems-effects-finite/1, включая unused failure; v1/v2 persistence и standalone compiler сохраняют её. Host effects/capabilities по-прежнему запрещены в Studio graphs. Adding/removing nodes обновляет существующую sequence; произвольного UI редактора порядка пока нет.

Structured control, loops, async, local Stream/Future исполняются через существующий control IR в текстовом режиме и компилируются поддерживаемым pure standalone backend. Перенос control IR в текущий dataflow canvas получает UNSUPPORTED_VISUAL_PROFILE. Typed source errors показывают строку/столбец и выделение диапазона; просмотр provenance даёт связи source/functions/nodes. Полноценные breakpoints, runtime source trace и визуальные control blocks не реализованы.

## Выполнение и черновики

Run графа и текста передаёт snapshot в module Worker, который вызывает тот же ProjectEditor/executeIR. Worker завершается после результата, отмены или deadline 5 секунд (включая загрузку/компиляцию). Stop отклоняет promise с CANCELLED; deadline — EXECUTION_TIMEOUT. Control executor дополнительно ограничен 10000 steps/depth32. Worker сохраняет отзывчивость интерфейса и прекращает pending local async tasks, но не является sandbox для arbitrary JS, lifecycle гарантий host effects или новой платформой. GUI не импортирует foreign callbacks.

Текст ограничен 262144 символами, 20000 tokens и depth128; pure composite expansion проходит существующий memoized cost gate <=10000 операций. IR/export выполняются на main thread с этими input bounds. Общее source/compiler isolation не заявляется.

Один локальный черновик на project id хранится отдельной atomic записью ems-studio-text/1: source/entry/lowering/JSON-input text. Неполный source сохраняется без выполнения. Strict shape/size validation отвергает повреждённую запись; quota failure не удаляет предыдущую. «Из графа» явно заменяет текущий черновик. Переключение workspace внутри проекта не создаёт отдельный черновик; для нового selected workspace используйте «Из графа».

Project JSON export пока включает только применённый semantic graph и editable dependencies. Неприменённый source draft, комментарии и неиспользуемые source declarations не включены. Полная переносимость исходника и full language bidirectional editing остаются частью EMS-032, а не завершённой функцией.

## Evidence

npm test, npm run verify, npm run browser:test; tests/studio-text.test.mjs и tests/browser/studio.test.mjs. Проверяются canonical graph roundtrip с signed zero/unused errors, eager sequence persistence, helper provenance/runtime/standalone parity, control execution и отказ fake conversion, typed locations, selected composite updates, strict draft storage/quota и expansion limit. Actual Chromium проверяет text Run → IR → Apply → graph Run, Undo/Redo, graph → text, control, selection diagnostics, Stop/deadline и reopen invalid draft. Полный MVP, AC-012 и deployment остаются открытыми.
