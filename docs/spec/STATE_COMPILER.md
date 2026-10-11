# Компиляция обработчиков state — начальный профиль

`compileStateControlJS(ir, registry)` из `src/compiler/control.mjs` создаёт независимый JavaScript-модуль с `execute(inputs, options)`. Вход — проверенный control IR v2. Выход не импортирует EMS. Обычный `compileControlJS` и `compileIRToJS` сохраняют pure-only gate.

Разрешены pure bindings и kernel state read/write, установленные `createStateRegistry`. Compiler проверяет приватную идентичность callback и точное совпадение ID, версии, сигнатуры, effects/capabilities, отсутствие emitJS и public interface boundary. Совпадение имени `state.*` недостаточно. Это проверка установленного kernel implementation, а не аттестация байтов или sandbox.

Вызов обязан явно передать grants `capabilities` и `allowedEffects`; они проверяются до исполнения. `options.state` предоставляет синхронные `read(slot)` и `write(slot, value)` в текущей транзакции. Провайдер должен принадлежать executor: изолировать значения, проверять типы слотов и запрещать доступ после завершения транзакции. Произвольный callback провайдера остаётся доверенным кодом host. Сам скомпилированный обработчик не создаёт state store и не выполняет commit/rollback.

Сохраняется существующая control semantics: порядок expressions, helpers, branches/loops, typed throw/finally, async task ownership, cancellation и step/depth limits. Чтения/записи проходят через переданный context; результаты проверяются существующей системой типов. Ошибки и лимиты не маскируются. Effectful composite host graphs, native resources, arbitrary IO bindings и graph IR v1 state export пока отвергаются.

## Приёмка AC-055

`tests/state-compiler.test.mjs` сравнивает результаты, подробности ошибок и последовательность state calls интерпретатора и compiled handlers для loops/helpers, signed zero, throw/finally, step exhaustion и async helper. Negative cases проверяют grants, malformed policy, inputs, отсутствующий context, cancellation, поддельный callback/изменённую metadata и unsupported IO. Отдельный Node-процесс исполняет только generated module и локальный context без импортов EMS.

Это завершённая компиляция указанного профиля обработчиков, но не экспорт ReactorSession или целого приложения. Следующий шаг EMS-060 — подключить compiled handlers к общему транзакционному scheduler без второго evaluator, проверить FIFO/rollback/replay/close и затем EMS-061 — упаковать UI на независимом static host. До этого standalone state/UI application, полный WEB IDE MVP и deploy остаются открытыми.
