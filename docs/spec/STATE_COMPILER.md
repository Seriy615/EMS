# Компиляция обработчиков state — начальный профиль

`compileStateControlJS(ir, registry)` из `src/compiler/control.mjs` создаёт независимый JavaScript-модуль с `execute(inputs, options)`. Вход — проверенный control IR v2. Выход не импортирует EMS. Обычный `compileControlJS` и `compileIRToJS` сохраняют pure-only gate.

Разрешены pure bindings и kernel state read/write, установленные `createStateRegistry`. Compiler проверяет приватную идентичность callback и точное совпадение ID, версии, сигнатуры, effects/capabilities, отсутствие emitJS и public interface boundary. Совпадение имени `state.*` недостаточно. Это проверка установленного kernel implementation, а не аттестация байтов или sandbox.

Вызов обязан явно передать grants `capabilities` и `allowedEffects`; они проверяются до исполнения. `options.state` предоставляет синхронные `read(slot)` и `write(slot, value)` в текущей транзакции. Провайдер должен принадлежать executor: изолировать значения, проверять типы слотов и запрещать доступ после завершения транзакции. Произвольный callback провайдера остаётся доверенным кодом host. Сам скомпилированный обработчик не создаёт state store и не выполняет commit/rollback.

Сохраняется существующая control semantics: порядок expressions, helpers, branches/loops, typed throw/finally, async task ownership, cancellation и step/depth limits. Чтения/записи проходят через переданный context; результаты проверяются существующей системой типов. Ошибки и лимиты не маскируются. Effectful composite host graphs, native resources, arbitrary IO bindings и graph IR v1 state export пока отвергаются.

## Приёмка AC-055

`tests/state-compiler.test.mjs` сравнивает результаты, подробности ошибок и последовательность state calls интерпретатора и compiled handlers для loops/helpers, signed zero, throw/finally, step exhaustion и async helper. Negative cases проверяют grants, malformed policy, inputs, отсутствующий context, cancellation, поддельный callback/изменённую metadata и unsupported IO. Отдельный Node-процесс исполняет только generated module и локальный context без импортов EMS.

AC-055 завершает профиль обработчиков. Независимый session поверх общего scheduler теперь реализован по AC-056 ниже. Экспорт целого UI-приложения, полный WEB IDE MVP и deploy остаются открытыми.

## Независимая сессия — AC-056

`compileReactorJS(manifest, registry)` из `src/compiler/reactor.mjs` проверяет существующий `ems-reactor/1`, реальные kernel state bindings и каждый handler до генерации. Control IR v2 state handlers и существующий pure graph IR v1 поддержаны. State graph IR v1, effectful composite host graphs и native/IO bindings пока дают `UNSUPPORTED_TARGET`.

Выходной модуль экспортирует `createSession({policy, maxQueue, recordTrace})` и `replayEvents(session, trace)`. Session предоставляет те же `dispatch`, `snapshot`, `trace`, `close`, что интерпретатор. Policy по умолчанию пустая: явные grants обязательны для state events. State store создаётся внутри каждого session, initial values встроены с сохранением signed zero. Compiler включает **тот же** `ReactorKernel`, который использует `ReactorSession`: FIFO admission, execution-owned draft, typed isolated reads/writes, commit/rollback, queue bounds, cancellation/close и detached traces не реализованы вторым scheduler.

Generated handlers и общие helpers встроены в модуль. Для исполнения нужны стандартные JavaScript APIs (`structuredClone`, `AbortController`, `queueMicrotask`); EMS sources/IDE/service, frontend и IR evaluator не нужны. Синхронный handler ограничен существующим step budget; module API не обещает preemption произвольного host JS или hard Worker deadline. Trace остаётся in-memory, обычный JSON транспорт не гарантирует signed zero. Native side effects и source lock/provenance этим срезом не добавлены.

### Экспорт сохранённого проекта

```bash
npm run export:reactor
# or:
node tools/export-reactor.mjs examples/ui-source-counter.ems-ui.json --out dist/counter-session.mjs
```

```js
import {createSession} from './dist/counter-session.mjs';
const session = createSession({policy: {
  capabilities: ['state.read', 'state.write'],
  allowedEffects: ['state.read', 'state.write']
}});
console.log(await session.dispatch('change', {delta: 3})); // 3
await session.close();
```

CLI сначала проверяет typed UI project и source/IR/version witnesses, затем компилирует его reactor. Он не исполняет handlers при сборке и не экспортирует DOM/UI. Unsupported build не перезаписывает предыдущий output.

`tests/reactor-compiler.test.mjs` проверяет FIFO, failure rollback/subsequent reads, replay, isolated arrays/signed zero/results/traces, admission errors, queue overflow, queued/active async cancellation/close, forged bindings/native effects и fresh Node/CLI execution. `tests/browser/reactor-compiler.test.mjs` сравнивает actual Chromium interpreter и independent session после закрытия EMS origin, без запросов к `/src/` или `/web/`.

Ближайший шаг — EMS-061: экспорт actual semantic UI + DOM adapter поверх этого session на независимом static host. EMS-060 остаётся IN_PROGRESS: production/native targets, source maps и state program lock ещё открыты. Full WEB IDE MVP/deploy/global goal не завершены.
