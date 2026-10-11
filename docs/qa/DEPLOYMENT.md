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

Подготовка: SSH/root access, nginx active, Node24.19.0, certbot установлен, port18877 отсутствует в просмотренных listeners; disk7.5GB free, RAM2420MB available. Existing stage services active. Public DNS корректен, публичный HTTPS имеет SAN mismatch (curl60). Успех публикации и live smoke ещё не заявлен; после выполнения добавляются конкретные SHA и фактические evidence.

### Первый запуск — 412bf38

Gated local tests677/130/24 прошли повторно внутри deployment. Isolated configs/user/release созданы; certbot действительно выпустил сертификат для `dev-ems.d-mash.ru`. Service exited0 без listen: existing CLI entrypoint сравнивал symlink argv path с physical import URL и не вызывал start. Local readiness не прошёл; deploy завершился ошибкой, previous successful artifact отсутствовал. TLS nginx reload после readiness не выполнялся; live success не заявлен. Прежние unrelated конфигурации не заменены.

Исправление: CLI сравнивает realpath, regression test запускает настоящий процесс через release symlink и проверяет GET200. Provision сохраняет previous только для active/ready предыдущего сервиса, не записывает failed startup как успешную rollback target. Новый release требуется повторно проверить и развернуть.

### Первая успешная публикация — f356ee3

Gated deploy снова прошёл678 Node/130 verify/24 Chromium tests и опубликовал `f356ee3cbc01f1ad540676c664da551c3f54a3fe`. Dedicated service active, User=ems-language-dev, NoNewPrivileges=yes, memory≈21MiB. Публичный сертификат действительно покрывает dev-ems.d-mash.ru, notBefore2026-10-11/notAfter2027-01-09; проверка HTTPS проходит без insecure bypass. Неавторизованный HTTPS401, HTTP301→HTTPS; authenticated assets200, Git/tools/deploy403, POST405.

`tools/deploy-smoke.mjs`: actual Chromium создаёт/соединяет7+8→15, переоткрывает→15, раскрывает AVG5 и получает12.56666..., запускает DOM counter→1. Первый browser probe с manually injected Authorization header не передавал credentials Worker и завершился EXECUTION_WORKER. Исправлен тестовый transport: реальный Fetch HTTP authentication challenge, origin-scoped credentials и browser HTTP auth cache. Production auth не ослаблялась. Новый local auth regression также проверяет Worker и401 без credentials.

Recovery: принудительно завершён только новый EMS service main PID19022; systemd восстановил PID19242, localhost readiness PASS, NRestarts1, memory≈17MiB. Шесть прочих enabled nginx configs имеют те же SHA256; nginx и четыре observed stage services active, ничего из них не перезапущено принудительно/не заменено. Логи: /tmp/ems-live-deploy-fixed.log, /tmp/ems-live-smoke-auth.log, /tmp/ems-live-recovery.log, /tmp/ems-vps-{before,after}-deploy.log.

Actual rollback ещё требует второй successful release: первый failed artifact412bf38 не принят как previous. До проверки переключения нельзя считать rollback gate завершённым.
