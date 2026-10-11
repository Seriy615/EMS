# Option, Result и match: исполняемый algebraic control profile

EMS-015, AC-035, G-01/03/11/12. Профиль `ems-control-algebraic/1` использует общий `ems-ir/2`, control verifier, runtime и standalone compiler. Он включает control-flow и typed errors прежних профилей. Старые `ems-control-finite/1` и `ems-control-errors/1` не расширяются неявно.

## Типы и значения

Каноническая грамматика IR type strings:

```text
T = Number | NumberArray | Boolean | String | Option<T> | Result<T,T>
```

Без пробелов, глубина вложенности ≤32, длина type string ≤4096. Frontend aliases и generic specializations нормализуются до этой грамматики; `Number[]` становится `NumberArray`, включая payload. Другие Array, Record, Union, Future/Stream и ResourceHandle пока явно UNSUPPORTED_PROFILE. Это ограниченный исполняемый профиль, не полный набор типов целевого языка.

На API границе значения имеют явный тег:

| Тип | Вариант | Значение |
|---|---|---|
| Option<T> | Some | `{tag:"Some", value: T}` |
| Option<T> | None | `{tag:"None"}` |
| Result<T,E> | Ok | `{tag:"Ok", value: T}` |
| Result<T,E> | Err | `{tag:"Err", value: E}` |

Объект plain/null-prototype, protocol fields собственные data properties, набор ключей точный. Accessors, лишние поля, неизвестные теги, неверные payload, host null/undefined и non-finite numbers отвергаются; getters tagged values не вызываются validator. None — отдельный вариант, не host null. Контекст выводит полные типы None/Ok/Err; Some выводит payload либо получает ожидаемый тип. Вложенные значения проверяются рекурсивно.

В тексте: `Some(expression)`, `None()`, `Ok(expression)`, `Err(expression)`. В IR: `{kind:"construct", type:T, tag, arguments:[expression]}` либо пустой arguments для None. Payload вычисляется ровно один раз. Algebraic object literals не разрешены: используется типизированная construct operation. Signed zero в numeric IR literals сохраняется как `"-0"`; вычисленные tagged payload сохраняют его также в standalone. Обычный JSON transport API inputs/results по-прежнему может потерять -0; новый универсальный transport не заявляется.

`==`/`!=` сравнивают теги и payload структурно; NumberArray по элементам, numbers по finite scalar `===` (0 и -0 равны). Это value comparison, не host object identity. Общий reference Registry и external binding ABI остаются primitive: расширены EMS local functions и входы/выходы control programs; произвольная foreign function с Option ABI автоматически не появляется.

## Pattern matching

```ems
fn resolve(value: Option<Number>) -> Result<Number, String> {
  match value {
    Some(n) => { return Ok(n + 1); },
    None => { return Err("missing"); }
  }
}
```

IR statement `match {value, arms:[{pattern,body}]}` использует semantic patterns:

- `{kind:"wildcard"}` — любое значение;
- `{kind:"binding", name}` — immutable binding с точным типом scrutinee;
- `{kind:"literal", type, value}` — Number/Boolean/String literal;
- `{kind:"constructor", tag, arguments:[pattern]}` — вариант и вложенный payload pattern; у None arguments пустой.

Scrutinee вычисляется один раз. Arms проверяются в исходном порядке, исполняется только первая подходящая body. Каждый посещённый pattern расходует один общий step tick, включая failed nested patterns. Body имеет lexical scope; bindings не выходят наружу и не затеняют существующие locals. Outer mutable cells, return/break/continue и typed throw/finally сохраняют обычную control semantics. `None` без скобок означает empty constructor в Option pattern, а вне Option может быть обычным binding.

Checker и независимый IR verifier требуют консервативную полноту: wildcard/binding, оба Boolean literals либо каждый Option/Result variant с total payload pattern. Например Some(1) и Some(Some(n)) сами по себе не покрывают весь Some. Требуется Some(n)/Some(_) или общий fallback. Доказательство полноты через объединение нескольких nested частичных patterns пока не производится; допустим explicit fallback. После total catch-all/полностью покрытого constructor повторный arm отвергается. Function return coverage требует exit каждой arm либо последующий return. Malformed serialized IR не обходит эти проверки.

Policies суммируют все calls во всех arms, включая недостигаемые по данным ветви; никаких grants через match не появляется. Runtime preflight выполняется до первого effect. Step/call/evaluation-depth limits и cancellation прежние; matching не скрывает terminal failures.

## Errors, events и compiler

В algebraic profile `throw`/typed `catch` могут переносить Option/Result. Envelope хранит canonical valueType; payload копируется рекурсивно. Точное совпадение catch type обязательно, Result не превращается автоматически в exception. Старые error profiles по-прежнему принимают только primitive types. Bounded finally не становится гарантированным resource cleanup.

ReactorSession принимает typed algebraic event inputs/results, копирует payload и журнал обычным существующим механизмом. State slots/bindings пока primitive. Успех commit, unhandled throw/cancellation rollback owned state; IO не откатывается, error payload не попадает в failure trace. Replay сохраняет algebraic data в текущем in-memory trace.

Pure standalone генерирует независимые JavaScript functions и match blocks, без parser/EMS imports. Общие portable value/type/pattern helpers встраиваются в output. Foreign effectful calls по-прежнему UNSUPPORTED_TARGET. JSON Schema entrypoint `schemas/control-ir.schema.json` ссылается на отдельные finite/error и algebraic schemas. Schema ограничивает структуру и lexical type strings; balanced grammar, type arities, coverage и policies проверяет executable verifier. Внешний schema validator не устанавливался.

```bash
node tools/ems.mjs module-ir examples/algebraic.ems --entry demo.Resolve --out dist/algebraic.ir.json
node tools/ems.mjs ir-run dist/algebraic.ir.json '{"value":{"tag":"Some","value":4}}'
node tools/ems.mjs ir-build dist/algebraic.ir.json --out dist/algebraic.mjs
```

AC-035: `tests/control-algebraic.test.mjs` содержит 33 differential/negative tests, включая вложенные значения, aliases/generics, scopes, effects, точные budgets, independent IR coverage, tagged input checks, cancellation/finally boundaries, events/rollback/replay и независимый запуск экспортированного модуля новым процессом вне EMS. Дополнительные cancellation tests остаются в control/reactor suites. Это Node evidence, не browser/native P1.
