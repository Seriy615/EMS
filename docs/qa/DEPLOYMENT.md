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
