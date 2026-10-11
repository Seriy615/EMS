# Развёртывание EMS language dev

## Воспроизводимая процедура

Основание: владелец явно разрешил WEB IDE MVP + deploy на `ems-vps`, единственный домен `https://dev-ems.d-mash.ru`. Существующие stage-ems/stage-api-ems/stage-play-ems и другие сервисы сохраняются.

Из чистого закоммиченного checkout с Node22+ и доступным Chromium:

```
node tools/deploy.mjs
node tools/deploy-smoke.mjs
```

Deploy повторяет `npm test`, `npm run verify`, `npm run browser:test`; отвергает незакоммиченные изменения и изменение checkout во время проверок; передаёт точный Git archive в `/opt/ems-language-dev/releases/<sha>`. npm dependencies не загружаются. Перед заменой выделенных конфигураций проверяется ownership marker. Release содержит tests/docs для аудита; HTTP whitelist разрешает только browser/source/examples/README, не Git/tools/deploy. Программы EMS выполняются в браузере; API произвольного host execution отсутствует.

`ems-language-dev.service` работает отдельным системным пользователем, слушает только localhost18877, имеет memory128M/CPU25%/tasks32, read-only filesystem/home protection, автоматический restart и journald. Nginx защищает все HTTPS IDE/assets с помощью Basic auth; HTTP только перенаправляет или обслуживает ACME challenge. Отдельный Let's Encrypt сертификат `ems-language-dev` использует отдельный renewal hook для reload nginx. Basic auth используется с проверенным HTTPS; credentials не включены в URL/страницы/проекты.

Файл доступа: `$HOME/.codex/private/ems-language-dev-access.json`, mode0600, вне репозитория; не печатается и не коммитится. Создаётся один раз; на VPS передаётся только SHA512-crypt password verifier. `deploy-smoke.mjs` читает файл для authenticated probes/Chromium requests без печати credentials. Резервная копия хранится отдельно. Полная identity management/MFA/server workspace — дальнейшая работа.

Диагностика:

```
ssh ems-vps 'systemctl status ems-language-dev.service --no-pager'
ssh ems-vps 'journalctl -u ems-language-dev.service --no-pager -n 50'
```

Отдельные access/error logs — `/var/log/nginx/ems-language-dev.*.log`. Формат не содержит Authorization header. Secret/hash files и certificate private keys не входят в Git. Чужие credentials/services/configs не импортируются и не заменяются.

Откат:

```
ssh ems-vps 'bash /opt/ems-language-dev/current/deploy/rollback.sh'
```

`previous` указывает на предшествующую release directory. Переключение атомарное, затем restart сервиса и localhost readiness check. У первой публикации нет previous artifact: нельзя заявлять успешный откат без него. Откат меняет application code, не отменяет первое provision nginx/auth/certificate. Конкурентные деплои, очистка failed provisioning и политика удаления старых release требуют отдельного операционного управления.

## Фактическое состояние

Подготовка: SSH/root access, nginx active, Node24.19.0, certbot установлен, port18877 отсутствует в просмотренных listeners; disk7.5GB free, RAM2420MB available. Existing stage services active. Public DNS корректен, публичный HTTPS имеет SAN mismatch (curl60). Это исходная инвентаризация до публикации; результаты выполненных запусков приведены ниже.

### Первый запуск — 412bf38

Gated local tests677/130/24 прошли повторно внутри deployment. Isolated configs/user/release созданы; certbot действительно выпустил сертификат для `dev-ems.d-mash.ru`. Service exited0 без listen: existing CLI entrypoint сравнивал symlink argv path с physical import URL и не вызывал start. Local readiness не прошёл; deploy завершился ошибкой, previous successful artifact отсутствовал. TLS nginx reload после readiness не выполнялся; live success не заявлен. Прежние unrelated конфигурации не заменены.

Исправление: CLI сравнивает realpath, regression test запускает настоящий процесс через release symlink и проверяет GET200. Provision сохраняет previous только для active/ready предыдущего сервиса, не записывает failed startup как успешную rollback target. Исправление проверено и опубликовано в следующем запуске.

### Первая успешная публикация — f356ee3

Gated deploy снова прошёл678 Node/130 verify/24 Chromium tests и опубликовал `f356ee3cbc01f1ad540676c664da551c3f54a3fe`. Dedicated service active, User=ems-language-dev, NoNewPrivileges=yes, memory≈21MiB. Публичный сертификат действительно покрывает dev-ems.d-mash.ru, notBefore2026-10-11/notAfter2027-01-09; проверка HTTPS проходит без insecure bypass. Неавторизованный HTTPS401, HTTP301→HTTPS; authenticated assets200, Git/tools/deploy403, POST405.

`tools/deploy-smoke.mjs`: actual Chromium создаёт/соединяет7+8→15, переоткрывает→15, раскрывает AVG5 и получает12.56666..., запускает DOM counter→1. Первый browser probe с manually injected Authorization header не передавал credentials Worker и завершился EXECUTION_WORKER. Исправлен тестовый transport: реальный Fetch HTTP authentication challenge, origin-scoped credentials и browser HTTP auth cache. Production auth не ослаблялась. Новый local auth regression также проверяет Worker и401 без credentials.

Recovery: принудительно завершён только новый EMS service main PID19022; systemd восстановил PID19242, localhost readiness PASS, NRestarts1, memory≈17MiB. Шесть прочих enabled nginx configs имеют те же SHA256; nginx и четыре observed stage services active, ничего из них не перезапущено принудительно/не заменено. Логи: /tmp/ems-live-deploy-fixed.log, /tmp/ems-live-smoke-auth.log, /tmp/ems-live-recovery.log, /tmp/ems-vps-{before,after}-deploy.log.

Первый failed artifact412bf38 не принят как previous. Проверка отката между двумя успешными release приведена ниже.


### Вторая успешная публикация, реальный откат и восстановление — dc7ced8

Полный gated deploy проверил **678/678 Node, 130/130 verify, 25/25 Chromium PASS** и опубликовал `dc7ced833cd3c021cf9388269e0d6effb3cf96df`. Реальный rollback переключил current на `f356ee3cbc01f1ad540676c664da551c3f54a3fe`; SHA256 отдаваемого README изменился с `921e66ef8eaaaa2f6bc8a0e47f632f0f37902232e872afb9ee7818e6e80fb558` на `eb5c8dd0bf0433b70acc477abfd4968b56065e6be09f0b023a827e8fc62f0277`. Live authenticated Chromium smoke прошёл на откатанной версии. Затем восстановлен уже проверенный artifact dc7ced8; current снова указывает на него, previous — f356ee3.

Финальный live smoke: HTTPS/auth/access boundaries PASS; actual Chromium create/connect 7+8→15, создание пользовательского composite user.LiveSum, reuse/expand/run→15, повторное открытие→15, раскрытие/исполнение AVG5 и DOM counter→1 PASS. Service active, localhost18877, User=ems-language-dev, MemoryCurrent20615168, MemoryMax134217728, CPUQuota25%, TasksMax32, ProtectHome=yes, ProtectSystem=strict, NoNewPrivileges=yes. Все шесть прочих enabled nginx config SHA256 совпали с исходными; nginx и четыре просмотренных staging service active.

Логи этой сессии: `/tmp/ems-live-deploy-second.log`, `/tmp/ems-live-rollback.log`, `/tmp/ems-live-smoke-rollback.log`, `/tmp/ems-live-restore.log`, `/tmp/ems-live-smoke-final.log`, `/tmp/ems-vps-final.log`. Это временные локальные логи; воспроизводимые команды и проверяемые результаты сохраняются здесь. Последующий commit документации и расширенного smoke не меняет опубликованный application artifact dc7ced8. Owner P0 dev publication принята; production/MFA/server sync/full debugger/native targets остаются открытыми.


### Пошаговый отладчик опубликован — af30dcb

Current application release: `af30dcb0bf4c905a7dce814492b863ed5ccffc90`. Checked commit pushed origin/main; gated deploy повторно прошёл683/683 Node,131/131 verify,27/27 Chromium PASS. Dedicated service active; previous — dc7ced833cd3c021cf9388269e0d6effb3cf96df. Сертификат/domain/auth сохраняют проверенные границы.

Actual public HTTPS/authenticated Chromium smoke PASS: graph15/custom composite reuse/expand15/reopen15, AVG5 ordinary execution и **реальная пауза на composite → Step до total/core.sum → Continue с прежним результатом**, counter1; unauth401/redirect/private403/method405 сохраняются. Проверены шесть неизменённых чужих nginx config SHA256 и пять active observed services. Логи /tmp/ems-debugger-deploy.log, /tmp/ems-debugger-live-smoke.log, /tmp/ems-debugger-vps.log. Это обновление application artifact поверх ранее доказанных recovery/rollback scripts, без повторного kill/rollback других сервисов. Full source/control/state/native debugger остаётся открытым. Последующий documentation evidence commit не заменяет live artifact af30dcb.


### Text/control source stepping опубликован — 03ac659

Current release: `03ac6590d00203c3b1adf2da8c4daf556ef1f74f`, previous artifact — af30dcb0bf4c905a7dce814492b863ed5ccffc90. Feature commit da646ac и bounded Chromium fixture concurrency commit03ac659 отправлены origin/main. Повторный gated deployment прошёл688/688 Node,132/132 verify,28/28 Chromium PASS и terminal exit0. Первая попытка da646ac остановилась до remote mutations после26/28 browser: два Worker transport failures в старых stdlib/UI сценариях. Семь targeted unchanged сценариев затем прошли; concurrency independent Chromium fixtures ограничена1, все assertions/scenarios сохранены, exact low-level cause не доказана. Full bounded suite и повторный deployment gate28/28 PASS.

Actual live HTTPS/auth boundaries и Chromium: graph15/custom composite reuse/expand15/reopen15, AVG5 ordinary/debug Step/Continue, **text control source pause → Step с выделенным `x>0` → Continue6**, counter1 PASS. Проверены current/previous, dedicated restricted service active, шесть unchanged unrelated nginx config SHA256, nginx и четыре observed staging services active. TLS SAN/domain и credentials boundary сохранены; новые secrets в Git не добавлены.

Логи: /tmp/ems-control-debug-deploy.log (остановленная попытка), /tmp/ems-control-debug-recheck-browser.log, /tmp/ems-control-debug-browser-serial.log, /tmp/ems-control-debug-deploy-serial.log, /tmp/ems-control-debug-live-smoke.log, /tmp/ems-control-debug-vps.log. Последующий evidence documentation commit не заменяет live artifact03ac659. Full UI event/state/source debugger и production/platform scope остаются открытыми.


### UI event transaction debugger опубликован — f1b478a

Current application release: `f1b478a4471490a61f8a1c928c45218fc5244c01`; previous —03ac6590d00203c3b1adf2da8c4daf556ef1f74f. Checked commit pushed origin/main, repeated gated deployment694/694 Node,133/133 verify,29/29 Chromium PASS, terminal exit0. Dedicated restricted service active; public certificate/domain/auth boundaries retained.

Actual public authenticated Chromium UI event **pause with confirmed count0 → Step → Continue → committed count1**, terminal panel confirms event. Existing graph15/composite reuse-expand-reopen15/AVG5 debug/text source Step/Continue6/counter1/401/301/403/405 gates PASS. Other six nginx config hashes unchanged, nginx/four observed staging services active. Logs /tmp/ems-ui-debug-deploy.log, /tmp/ems-ui-debug-live-smoke.log, /tmp/ems-ui-debug-vps.log.

Initial local full suite had one intermittent legacy UI startup Worker failure; five diagnostic UI probes, final full suite and exact deployment gate passed without runtime retries or weakened assertions. QA harness keeps bounded startup error/selected platform stderr diagnostics; exact original cause remains unproven and full production stability remains open. Evidence documentation commit after this proof does not replace live artifact f1b478a. Full debugger/native/compiled/value policy/platform goal is not closed.

### Понятный Studio workflow опубликован — 208c177

Опубликован проверенный release `208c1773ec85b100099d937dcd2d053e8c8f222c` на `https://dev-ems.d-mash.ru`; previous — `f1b478a4471490a61f8a1c928c45218fc5244c01`. Повторный gate **694/694 Node,133/133 verify,30/30 Chromium PASS**, deploy terminal0. Public HTTPS/auth/access checks и actual Chromium graph15/composite reuse-expand15/reopen15/AVG5/control debugger6/counter1/UI event commit1 PASS. Дополнительная живая проверка нового оформления, меню файла, onboarding и UI source/узких390px экранов PASS; `/tmp/ems-design-live.png` просмотрен. Шесть чужих nginx hashes и пять observed active services совпали до/после. Выделенный сервис active, MemoryCurrent19058688, MemoryMax134217728, TasksMax32, Userems-language-dev, ProtectHomeyes, ProtectSystemstrict, NoNewPrivilegesyes, listener127.0.0.1:18877.

Логи: `/tmp/ems-design-deploy.log`, `/tmp/ems-design-live-smoke.log`, `/tmp/ems-design-live-preview.log`, `/tmp/ems-design-vps-before.log`, `/tmp/ems-design-vps-after.log`. EMS-036 DONE по AC-068. Документационный commit после этой приёмки не заменяет опубликованный artifact208c177. Глобальная цель и EMS-033/032 остаются открытыми.

### Operation breakpoints опубликованы — 55763fb

Публикация AC-069 подтверждена: current `55763fb591d227fab96645ecdf0400f93be94956`, previous `208c1773ec85b100099d937dcd2d053e8c8f222c`. Повторный gate **703/703 Node,134/134 verify,31/31 Chromium PASS**, deploy и public smoke terminal0. Реальный authenticated HTTPS Chromium: graph run-to-point→5; text cursor→three loop pauses→3, плюс прежние graph15/composite15/reopen15/AVG5/text debugger6/counter1/UI event commit1 и HTTP/TLS/auth/access checks PASS. Шесть чужих vhost hashes и пять observed active service states совпали до/после. Dedicated service active, MemoryCurrent17862656, MemoryMax134217728, TasksMax32, Userems-language-dev, ProtectHomeyes, ProtectSystemstrict, NoNewPrivilegesyes, listener127.0.0.1:18877.

Логи `/tmp/ems-breakpoints-deploy.log`, `/tmp/ems-breakpoints-live-smoke.log`, `/tmp/ems-breakpoints-vps-before.log`, `/tmp/ems-breakpoints-vps-after.log`. Скриншот заполненного inspector/остановки `/tmp/ems-breakpoints.png` просмотрен. Последующий evidence-only commit не заменяет live artifact55763fb. EMS-033 и глобальная цель остаются активными. Для следующего Step Over/Out нужны реальные activation identities, позволяющие отличать одноимённые одновременно исполняющиеся async function frames; одного function name/depth недостаточно.

### Activation-aware Over/Out опубликован — d2639e8

AC-070 опубликован: current `d2639e8d53ebb1c44b69bdaf992ada15f69f04ce`, previous `55763fb591d227fab96645ecdf0400f93be94956`. Повторный exact release gate **711/711 Node,135/135 verify,33/33 Chromium PASS**, deploy/smoke terminal0. Public trusted HTTPS/auth/access checks и actual Chromium control Over→next statement/Out→7, UI Over paused confirmed0/Out commit1 PASS. Existing graph15/composite15/reopen15/AVG5/text debugger6/counter1/UI stepping commit1/graph breakpoint5/text-loop points3 сохранились. Шесть чужих vhost hashes и пять observed active service states совпали до/после. Dedicated service active, MemoryCurrent17666048, MemoryMax134217728, TasksMax32, Userems-language-dev, ProtectHomeyes, ProtectSystemstrict, NoNewPrivilegesyes, listener127.0.0.1:18877.

Логи `/tmp/ems-step-frames-deploy.log`, `/tmp/ems-step-frames-live-smoke.log`, `/tmp/ems-step-frames-vps-before.log`, `/tmp/ems-step-frames-vps-after.log`. Последующий evidence-only commit не заменяет live artifactd2639e8. В full local/exact deployment suites Worker error не наблюдался; first focused startup failure с пустой диагностикой остаётся необъяснённым, не считается исправленным. EMS-033 IN_PROGRESS и глобальная цель активна; следующий срез — UI event breakpoint authoring с typed handler source witness/FIFO/private state/commit/rollback, без изменения semantic IR.


### Source-owned UI event breakpoints опубликованы — 50f40dd

Опубликован checked release `50f40ddee56bb3166084b5cc23835fa67a14c881` на `https://dev-ems.d-mash.ru`; previous — `d2639e8d53ebb1c44b69bdaf992ada15f69f04ce`. Повторный exact gate **716/716 Node,136/136 verify,34/34 Chromium PASS**, deploy/public smoke terminal0. Actual public trusted HTTPS/auth/access checks и Chromium UI source points/private pause→commit1/live clear→commit2/next event3 PASS; прежние graph/composite/reopen15, AVG5, text debugger6, graph point5/text loop3 и Over/Out7/UI commit1 сохранены. Шесть чужих nginx hashes и пять observed active service states совпали до/после. Dedicated service active, MemoryCurrent18558976, MemoryMax134217728, TasksMax32, Userems-language-dev, ProtectHomeyes, ProtectSystemstrict, NoNewPrivilegesyes, listener127.0.0.1:18877. Логи `/tmp/ems-ui-points-deploy.log`, `/tmp/ems-ui-points-live-smoke.log`, `/tmp/ems-ui-points-vps-before.log`, `/tmp/ems-ui-points-vps-after.log`. Последующий evidence-only commit не заменяет live artifact50f40dd.

Readable light theme, separate project/program/interface screens and mobile layout retained. Full debugger and production platform scope remain open. Historical Worker startup failure cause remains unproven; no failure observed in this exact gate.


### Checked source anchors опубликованы — 17a7dfe

AC-072 опубликован: checked current `17a7dfef861797ffbf4e84d1c95221d33574e9b6`, previous `50f40ddee56bb3166084b5cc23835fa67a14c881`. Exact committed gate **723/723 Node,137/137 verify,36/36 Chromium PASS**, deploy и public smoke terminal0. Actual trusted HTTPS/auth/access и Chromium safe handler edit → fresh `/body/2` point → private snapshot0/точный return → commit1 PASS; изменённая операция деактивирована и следующий запуск подтверждает1 без паузы. Existing graph/composite/reopen15, AVG5, text6, graph point5/text loop3, Over/Out7/UI1, live-clear1/2/3 сохранены. Шесть чужих vhost hashes и пять active services совпали до/после. Dedicated service active, MemoryCurrent17285120, MemoryMax134217728, TasksMax32, Userems-language-dev, ProtectHomeyes, ProtectSystemstrict, NoNewPrivilegesyes, listener127.0.0.1:18877. Логи `/tmp/ems-anchors-deploy.log`, `/tmp/ems-anchors-live-smoke.log`, `/tmp/ems-anchors-vps-before.log`, `/tmp/ems-anchors-vps-after.log`. Evidence-only commit не заменяет live artifact17a7dfe; full debugger/global goal остаются открытыми.

UI anchors durable in separate local storage; Studio reattachment currently workspace-only. Conservative refusal is intentional where identity/context changed or multiple matches exist. No native/compiled debugger or runtime value inspection claims. Historical Worker startup root cause remains unproven; exact gate passed without retries.


### Durable Studio debugger contexts опубликованы — a36a331

AC-073 опубликован: current checked `a36a331f50ffc4bca996dedb36e8dad158d997e5`, previous `17a7dfef861797ffbf4e84d1c95221d33574e9b6`. Exact clean committed gate **729/729 Node,138/138 verify,39/39 Chromium PASS**, deploy/public smoke terminal0. Trusted public HTTPS/auth/access и actual Chromium durable Studio: новый документ→reopen graph count1→text count1→exact return pause→result1→graph count1 PASS. Прежние graph/composite/reopen15, AVG5, text6, points5/loop3, Over/Out7/UI1, UI live-clear1/2/3 и safe anchor private0→commit1/changed inactive сохранены. Шесть чужих nginx hashes/пять active services совпали до/после. Dedicated service active, MemoryCurrent17879040, MemoryMax134217728, TasksMax32, Userems-language-dev, ProtectHomeyes, ProtectSystemstrict, NoNewPrivilegesyes, listener127.0.0.1:18877. Логи `/tmp/ems-studio-points-deploy.log`, `/tmp/ems-studio-points-live-smoke.log`, `/tmp/ems-studio-points-vps-before.log`, `/tmp/ems-studio-points-vps-after.log`. Последующий evidence-only commit не заменяет live artifacta36a331. EMS-033/full debugger/global goal остаются открытыми.

Local graph/text/UI durability доказана только для описанных bounded profiles. Cross-tab sync/conflicts, native/compiled debugger и runtime value/secret inspection не заявлены. Историческая причина Worker startup failure не доказана; текущий exact gate прошёл без retries или ослабления assertions.


### Typed control inspection core опубликован — 5bcd6ab

AC-074 final опубликован: checked current `5bcd6abd41446073073db4e6e4f902a015488246`, previous промежуточный `723e4c4497ca324db1c7dcdeb68e86f4fb53a9e7` (до own-fields correction). Final exact gate **740/740 Node,139/139 verify,40/40 Chromium PASS**, deploy/public smoke terminal0. Trusted public HTTPS/auth/access и actual Chromium core opt-in: real typed x1 snapshot/result1, default absence of value payload, protected program/ungranted sentinel absence PASS. Existing graph/composite/reopen15, AVG5, text6, points5/loop3, Over/Out7/UI1, UI live-clear1/2/3, safe anchor private0→commit1/changed inactive и durable Studio graph1/text1/pause/result1 сохранены. Шесть чужих nginx hashes/пять active services совпали до/после двух gated publications. Dedicated service active, MemoryCurrent17788928, MemoryMax134217728, TasksMax32, Userems-language-dev, ProtectHomeyes, ProtectSystemstrict, NoNewPrivilegesyes, listener127.0.0.1:18877. Логи `/tmp/ems-inspect-deploy.log` (intermediate), `/tmp/ems-inspect-own-fields.log`, `/tmp/ems-inspect-deploy-final.log`, `/tmp/ems-inspect-live-smoke.log`, `/tmp/ems-inspect-vps-before.log`, `/tmp/ems-inspect-vps-after.log`. Evidence-only commit не заменяет live artifact5bcd6ab. Core API acceptance only; IDE value panel/checked transport/formal taint/effectful UI/native/compiled profiles остаются открытыми.

Default payload-free and conservative protection evidence applies to the documented trusted-host/core policy boundary. No inferred secret taint, plugin sandbox or finished IDE value inspector claims. Current Studio Worker explicitly rejects inspection transport until checked adapter; existing UI transactions/stepping unchanged. Historical Worker startup root cause remains unproven; final gate passed without retries.

## EMS-036 AC-075 — повторный дизайн, 11 октября 2026

Опубликован checked artifact `69c17ec052730f92f6d1a03b753b7d176efef2a9` на `https://dev-ems.d-mash.ru`, previous `5bcd6abd41446073073db4e6e4f902a015488246`. Exact clean committed gate **740/740 Node,139/139 verify,41/41 Chromium PASS**, deploy/public smoke terminal0. Actual public HTTPS/auth/access + Chromium mouse first-example→result5, stable Code/Graph views, default-disclosed debugger and compact390px library PASS. Existing graph/composite/reopen15, AVG5, text6, points/Over/Out/UI transaction/storage and core inspection protection proofs PASS. Six foreign vhost hashes and five active service states unchanged. Dedicated service active, MemoryCurrent17838080, MemoryMax134217728, TasksMax32, Userems-language-dev, ProtectHomeyes, ProtectSystemstrict, NoNewPrivilegesyes, listener127.0.0.1:18877. Logs `/tmp/ems-redesign-deploy-final.log`, `/tmp/ems-redesign-live-smoke.log`, `/tmp/ems-redesign-vps-before.log`, `/tmp/ems-redesign-vps-after.log`. Evidence-only follow-up commit does not replace live artifact69c17ec. EMS-036 AC-075 accepted; full language/IDE and EMS-033 remain open. Next: review preserved inspection transport draft, checked opt-in pure control panel under new acceptance ID; no automatic restore/claim of completion.

## EMS-033 AC-076 — checked inspection panel, 11 октября 2026

AC-076 опубликован: checked current `6cf20cff960c0aed363f14024623ff687bc5d7c6`, previous `69c17ec052730f92f6d1a03b753b7d176efef2a9`. Exact gate **748/748 Node,140/140 verify,43/43 Chromium PASS**, deploy и public smoke terminal0. Actual trusted HTTPS/auth/access и Chromium opt-in panel: реальный x1/result1, Continue/Stop очищают значения, protected program скрывает значения, изменение source снимает grants; прежний дизайн/example5/mobile390px и все graph/composite/AVG5/text/UI/debugger/storage/core inspection proofs PASS. Шесть чужих nginx hashes и пять active service states совпали до/после. Выделенный service active, MemoryCurrent17805312, MemoryMax134217728, TasksMax32, Userems-language-dev, ProtectHomeyes, ProtectSystemstrict, NoNewPrivilegesyes, listener127.0.0.1:18877. Логи `/tmp/ems-transport-deploy.log`, `/tmp/ems-transport-live-smoke.log`, `/tmp/ems-transport-vps-before.log`, `/tmp/ems-transport-vps-after.log`. Evidence-only commit не заменяет live artifact6cf20cf. Предыдущий full Chromium42/43 и blank native Worker startup failure сохранены как невыясненный риск: focused UI5/5 и exact final43/43 не доказывают исправления причины; UI retry/таймауты не менялись. EMS-033 IN_PROGRESS/global goal active. Next: получить bounded worker/module/lifecycle diagnostics для воспроизводимого startup failure; затем scope-address grants/inspection parity для оставшихся execution profiles.

## EMS-033 AC-078 — exact declaration grants, 11 октября 2026

AC-078 опубликован на checked current `26fd89163d2d217f3c8f3012c50c2dc87714da7b`, previous `6cf20cff960c0aed363f14024623ff687bc5d7c6`. Corrected exact clean committed gate **758/758 Node,141/141 verify,48/48 Chromium PASS**, deploy/public HTTPS smoke terminal0. Actual live declared branch selection: repeated x/Number-vs-String, selected then active7/inactive99, sibling sentinel absent; existing opt-inx1/protected/clear/revoke, all prior graph/composite/AVG5/text/UI/debugger/storage/design/mobile proofs PASS. Six foreign nginx hashes/five active service states unchanged. Dedicated service active, MemoryCurrent17874944, MemoryMax134217728, TasksMax32, Userems-language-dev, ProtectHomeyes, ProtectSystemstrict, NoNewPrivilegesyes, listener127.0.0.1:18877. Logs `/tmp/ems-declarations-deploy-final.log`, `/tmp/ems-declarations-live-smoke.log`, `/tmp/ems-declarations-vps-before.log`, `/tmp/ems-declarations-vps-after.log`. Initial gate8c4c11e failed45/46 before upload; real incomplete module response and artifact/recovery ablation retained, no universal startup fix claim. Closed metadata artifact path survives reporter truncation; target interception remains opt-in and normal12 immediate recovery checks PASS. Evidence-only commit does not replace live artifact26fd891. EMS-033/global goal remain active. Next: scope-address fixtures for recursion/forAwait/using and client replay under v2, then call-IR/visual graph inspection profile; full taint/effectful UI/native/compiled parity open.

## EMS-033 AC-079 — graph inspection core, 11 октября 2026

AC-079 опубликован: checked current `59fec33ca89afd8eaf0177104c33e224e16356a6`, previous `26fd89163d2d217f3c8f3012c50c2dc87714da7b`. Exact clean committed gate **769/769 Node,142/142 verify,49/49 Chromium PASS**, deploy и public HTTPS smoke terminal0. Actual browser graph/call-IR kernel: memo5/result25, exactly2 original operation observations, ungranted sentinel absent/default payload-free. Все прежние declaration active7/inactive99, opt-incontrolx1/protected/clear/revoke и graph/composite/AVG5/text/UI/debug/storage/design/mobile proofs PASS. Шесть чужих nginx hashes и пять active services совпали до/после. Dedicated service active, MemoryCurrent17698816, MemoryMax134217728, TasksMax32, Userems-language-dev, ProtectHomeyes, ProtectSystemstrict, NoNewPrivilegesyes, listener127.0.0.1:18877. Логи `/tmp/ems-graph-inspection-deploy.log`, `/tmp/ems-graph-inspection-live-smoke.log`, `/tmp/ems-graph-inspection-vps-before.log`, `/tmp/ems-graph-inspection-vps-after.log`. Первый full47/49 native startup failures и focused5/5/25-start recovery evidence сохранены; причина не объявляется устранённой. Evidence-only commit не заменяет live artifact59fec33. Core API acceptance only: graph/call Studio transport+panel по-прежнему явно unsupported, ближайшая задача — checked source/project witness и bounded graph DTO adapter. EMS-033/full language/global goal active.

## EMS-033 AC-080 — graph/call value panel, 11 октября 2026

AC-080 опубликован: checked current `dc46728d92c83edde5f9215545f60869c757c3c7`, previous `59fec33ca89afd8eaf0177104c33e224e16356a6`. Exact clean committed gate **774/774 Node,143/143 verify,51/51 Chromium PASS**, deploy/public HTTPS smoke terminal0. Actual visual panel: pending current output→memo5/result25, Continue clears, protected program refuses values; actual call-IR source pause/input3/result25 verified locally. Live core memo5/result25, declaration active7/inactive99, controlx1/protected/clear/revoke и все prior graph/composite/AVG5/text/UI/debugger/storage/design/mobile proofs PASS. Six foreign nginx hashes/five active services unchanged. Dedicated service active, MemoryCurrent17702912, MemoryMax134217728, TasksMax32, Userems-language-dev, ProtectHomeyes, ProtectSystemstrict, NoNewPrivilegesyes, listener127.0.0.1:18877. Logs `/tmp/ems-graph-transport-deploy.log`, `/tmp/ems-graph-transport-live-smoke.log`, `/tmp/ems-graph-transport-vps-before.log`, `/tmp/ems-graph-transport-vps-after.log`. First full50/51 UI startup failure/artifact8NWmbO remains unresolved risk; focused1/1 and final51/51 do not prove its cause fixed. Evidence-only commit does not replace live artifactdc46728. EMS-033/global goal active. Next: strengthen actual nested/repeated graph/call source inspection fixtures and invalidation/cleanup evidence, then remaining collection/effectful/native/compiled profiles and full language gates.
