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
