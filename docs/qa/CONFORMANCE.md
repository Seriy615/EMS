# Общий differential conformance gate

EMS-017 / AC-043. Это начальный finite reference gate, а не доказательство реализации всех платформ или всего M1. Он связывает normative core vectors с общими language/interface fixtures и сравнивает исполнение одной программы через frontend/IR/runtime и независимый generated JS.

```bash
npm run conformance -- --out /tmp/ems-conformance-report.json
node tools/conformance.mjs --fixtures my-suite.json --out /tmp/my-report.json
node --test tests/conformance.test.mjs
```

Команда завершается с кодом 0 только при совпадении всех исполнителей между собой и с каждым ожидаемым результатом. Ошибка подготовки/компиляции/дочернего процесса, timeout, неверный oracle или отличающиеся diagnostics дают код 1. Standalone процесс ограничен 5 секундами на fixture; это QA timeout, не sandbox. Report содержит каждое расхождение, actual outcomes и expected-match flags. Встроенные suites — tests/fixtures/semantics.json (28) и language-conformance.json (26), всего 54.

## Что сравнивается

Исполнители node-reference, node-serialized-ir, node-standalone-process. Каждый строит программу из того же graph или EMS source в обычном core registry; последний пишет скомпилированный модуль в отдельную временную директорию и запускает новым Node процессом. Generated module не импортирует EMS. Worker использует только QA codec/outcome capture, без EMS frontend/runtime/compiler/IDE; он ждёт async execute и передаёт реальные результаты. Временные артефакты удаляются после проверки.

Fixture: уникальный id, graph либо source, optional entry (по умолчанию test), inputs/options, expected {value,negativeZero?} либо {error,details?}. Для public interfaces optional composites и interfaces [{interface,binding}], target (по умолчанию node). Подготовка выполняет обычные типовые/IDL/policy проверки. Нет загрузки неизвестных JavaScript adapters из fixture. Suites label — имя группы, не новый semantic IR profile; реальный профиль выбирает существующий lowering.

Вектор изолирован structuredClone для каждого исполнителя. Semantic outcome — returned/value или failed/error с code/name/details и optional valueType/value для typed user throw. Host message/stack исключены: они нестабильны и могут содержать секреты. Типизированный throw payload — явное значение программы, не секретный host diagnostic; report может содержать прикладные значения, поэтому не следует публиковать fixtures с секретами. Сравниваются все details; совпадение только error code недостаточно. Ожидаемое значение проверяется отдельно: одинаково неправильный результат трёх исполнителей не пройдёт.

Lossless transport encodeValue/decodeValue использует tagged containers для всех значений: -0 не превращается в 0, undefined и nonfinite QA diagnostics сохраняются, объект пользователя не может подделать transport tag. Object keys сортируются; sparse/cyclic/non-data values отвергаются. Top-level JSON report читаем обычным JSON parser, outcome каждого исполнителя декодируется через decodeValue. Это QA protocol, не новый формат значений языка.

## Границы доказательства и следующие цели

Core numeric vectors, structured scopes/branches/loops/recursion/short circuit, input/overflow/step/depth failures, typed catch/throw/finally, Option/Result, Future caching/supervision, Stream FIFO/backpressure/signed zero, owned resource cleanup и public atomic/composite predicates проверяются одним инструментом. State FIFO/replay/rollback/cancellation и actual native resource cleanup проверены отдельными executable suites reactor/control/contracts-resource; они не объявлены compiled state differential vectors. Native standalone и state compilation пока UNSUPPORTED_TARGET. Gate не подменяет их success stub.

Все три текущих исполнителя — Node на одной host платформе. Это не AC-018 и не browser evidence. src/conformance/index.mjs и program.mjs не используют Node APIs, чтобы следующий реальный browser runner мог применить тот же oracle и transport к тем же fixtures. Для browser dynamic standalone import нужен соответствующий QA origin/CSP; никакое изменение production CSP этим gate не выполняется. Следующий этап — настоящий Chromium/browser target и P1, затем Web IDE MVP. Глобальная цель PROJECT_GOAL.md и M1 остаются открыты.
