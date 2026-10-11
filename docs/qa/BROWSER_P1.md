# P1: одна EMS-программа в Node и настоящем браузере

EMS-018 / AC-044, первое ограниченное P1 из PROJECT_GOAL.md. Это переносимость finite чистого ядра между Node.js и Web, а не M6/AC-018, native UI или готовность всей EMS. EMS source examples/portable-analysis.ems содержит только типизированные control/data операции: считает среднее массива и выбрасывает typed EMPTY_SAMPLE для пустого массива. Платформенные условия в прикладной логике отсутствуют.

```bash
npm run browser:test
npm run browser:verify -- --out /tmp/ems-browser-report.json
npm run export:portable -- --out dist/portable-analysis
```

Последняя фактическая среда: Linux, Node 22.21.0, HeadlessChrome/156.0.8078.4. Исполняемый Chromium найден локально, новые зависимости не устанавливались. Для другой установки задайте EMS_CHROMIUM=/absolute/path/to/chromium. Если указанный файл недоступен, gate завершается BROWSER_UNAVAILABLE: нет auto download, skip-success или скрытого fallback. npm test и npm run verify остаются Node gates; browser:test/browser:verify — отдельные обязательные проверки для утверждения browser support.

## Исполняемое доказательство

54 common fixtures из CONFORMANCE.md плюс 3 P1 inputs (числа, пустой массив, неверный тип) проходят через пять исполнителей:

1. node-reference — ordinary frontend/IR/runtime.
2. chromium-reference — тот же frontend/serialized IR/runtime, исполняемый настоящим Chromium.
3. chromium-locked-reference — тот же browser runtime после проверки Node-produced lock через настоящий Web Crypto SHA-256.
4. node-independent-standalone — generated module в новом Node process без frontend/runtime/IDE.
5. chromium-independent-standalone — тот же generated module на другом статическом origin без EMS source/modules.

Для P1 все три inputs используют **тот же program.mjs, что экспортирован в приложение**. Runner проверяет byte equality с compiler output. Manifest сохраняет SHA-256 исходника, semantic IR digest, SHA-256 generated artifact, профиль, selected contract bindings и grants. Здесь внешних bindings/grants/dependencies нет; arithmetic/control принадлежат reference semantic kernel. Запуск приложения не требует manifest/lock verifier: они сопровождают происхождение и сборку, а не являются hosted dependency.

Lossless oracle сравнивает signed zero и полные error code/name/details/typed payload, не только числовой результат. В настоящем браузере проверены secureContext/Web Crypto и отказ изменённого digest/target до execution. Отдельные negative tests проверяют недоступный browser и сохранность QA filesystem boundary; npm test проверяет source/artifact hashes и запуск package отдельно от проекта.

## Самостоятельное приложение

exportPortableAnalysis генерирует program.mjs, app.mjs, index.html, style.css, source snapshot, manifest и lock. HTML/UI shell только передаёт JSON-массив в compiled function и отображает результат/ошибку. Это один доказательный application exporter для анализа, не универсальная генерация всех EMS UI. Serve экспортированной директории любым обычным статическим HTTP сервером; никакой сервис EMS или IDE для неё не нужен.

Runner использует два read-only loopback HTTP origins с разными корнями. Runtime origin отдаёт только /src/ для QA. Independent origin видит только временную экспортированную директорию с generated modules и QA transport; он не может читать EMS source. Перед actual form submit runtime page закрывается и runtime server останавливается. После этого положительный input [3,9] показывает «Среднее: 6», empty и wrong type показывают ошибки. Independent request log проверяется: запросов /src/ нет. QA driver/codec нужны для сравнения fixtures; сама форма импортирует только app.mjs→program.mjs и не зависит от driver/codec.

Chromium запускается через CDP на loopback с отдельным temporary profile. Используется --no-sandbox для данной trusted local QA среды: runner **не** является защитой от чужих JS/browser code. CDP, экспорт и временные HTTP серверы не публикуются в сеть; profiles/temporary files закрываются и удаляются. Production IDE CSP не менялся; static QA server запрещает inline/eval scripts и symlink escape. Никакого server deployment этот gate не выполняет.

## Результаты и ограничения

57/57 differential PASS, actual browser tests 2/2 PASS; сохранённое machine-readable свидетельство docs/qa/evidence/browser-p1.json, полный transient report /tmp/ems-browser-report.json. Reproducible commands выше обязательны для следующей target версии. Артефакт соответствует commit, содержащему source/runner и это свидетельство; source/IR/program hashes в evidence идентифицируют прикладной код независимо от canvas.

P1 чистого ядра выполнен в этой матрице. AC-018 требует дополнительного настоящего native/desktop target с platform bindings и остаётся открытым. State standalone/provenance, native ABI/export, DOM/native UI equivalence, source maps и full text/visual editor roundtrip тоже открыты. Исправлен существующий npm run studio server: transitive core modules из /src/ теперь доступны, realpath защищает от symlink escape. Второй browser test реально исполняет arithmetic avg5 через прежний explorer; это восстановление браузерного запуска, не заявление о готовом редакторе.

Следующая ready работа — WEB IDE MVP на существующем общем frontend/IR/runtime; owner разрешил subsequent deployment, но deploy acceptance ещё не выполнен.
