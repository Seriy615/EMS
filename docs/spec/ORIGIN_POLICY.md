# Политика классификации происхождения

Это host policy отдельно от языка, contract interface, capability policy, лицензии и visibility. Политика задаёт классификацию действительных источников control IR и дополнительно ограничивает диагностику. Она не меняет исполнение программы, типы или обычный возвращаемый результат.

## Закрытый формат

```json
{
  "schemaVersion": "ems-origin-policy/1",
  "sources": [
    {"kind":"input","function":"main","path":"/inputs/0","classification":"public"},
    {"kind":"input","function":"main","path":"/inputs/1","classification":"private"}
  ]
}
```

Только собственные data fields: getters, неизвестные поля, sparse массивы, лишние properties и повторные источники отвергаются (`INVALID_ORIGIN_POLICY`). Sources ≤2048; function/path ≤1024 символов. kind только input/literal; classification только public/private. `normalizeOriginPolicy` делает отдельную копию записей. `classifyControlOrigins(ir,registry,policy)` заново валидирует IR и строит происхождение; импортированный аналитический sidecar не принимается как доказательство. Каждый annotation должен соответствовать реальному input/literal/pattern-literal вхождению этого IR. Derived declarations, unknown/effect/foreign boundaries нельзя «сделать публичными» записью политики.

## Алгебра

Порядок классов: **public < private < unknown**. Класс узла — join всех классов origin descriptors. У input/literal descriptor класс берётся из явного annotation; отсутствующий annotation →unknown. Любая boundary/effect/capability/local-effect/unknown метка →unknown без возможности override. Пустое множество →unknown. Поэтому private actual argument не становится публичным от public annotation formal helper input; неизвестная реализация foreign contract не получает public статус даже при пустых effects.

Артефакт `ems-origin-classification/1` содержит entry, `securityDecision:false`, нормализованную policy и nodes с semantic id/function/path/kind/type/name?, classification, reasons. Reason сохраняет descriptor, его classification и причину host-annotation/unclassified-source/unresolved-boundary. Нет содержимого литералов, runtime values, canvas или исполняемой реализации. Итоговый UTF-8 JSON ограничен2MiB; превышение →ANALYSIS_LIMIT. Лимиты analysis из CONTROL_ORIGINS.md действуют отдельно.

## Исполняемое дополнительное ограничение

```js
await executeIR(ir, inputs, registry, {
  inspection: {
    allow: [{function: 'main', declarations: ['/body/0', '/body/1']}],
    originPolicy
  },
  onControlExit: observe
});
```

При наличии originPolicy inspector вычисляет классы до исполнения и закрывает private/unknown/неизвестное declaration address **до scope.has/get и чтения ячейки**: status protected-origins, type:null, без value. Public оставляет только прежнюю возможность просмотра: нужен исходный явный allow, чистый entry/function, отсутствие protectedFunctions, разрешённый конечный тип, корректная scope identity и прежние budgets. Порядок приоритета: protected-program →protected-effects →protected-origins →обычная проверка scope/type/value. AC-086 entry barrier сохраняется. Публичный класс сам не создаёт grant и не снимает ни один прежний запрет. Когда originPolicy отсутствует, исходная opt-in модель не меняется.

`createControlInspector(ir, inspection, registry)` принимает registry третьим аргументом для новой политики. Snapshot status применим к v1 names и v2 declaration grants. Client source transport заново классифицирует собственный checked IR и не принимает private/unknown payload или downgrade в not-in-scope. Source witness привязан к actual draft/source/entry/lowering, snapshots — к frames/addresses/token; эти проверки сохраняются. Worker использует ту же семантику. Если закрытый origin class ошибочно отсутствует в map, решение — запрет.

CLI без исполнения:

```sh
node tools/ems.mjs module-classify examples/classification.ems --entry main --policy examples/classification.policy.json --out classification.json
```

## Область применения и доверие

Работают API/CLI, интерпретируемый control runtime и source-owned Worker transport. Flat dataflow/visual graph и визуальные collection-address adapters явно отклоняют эту policy: нужен собственный подтверждённый semantic root mapping. UI для назначения annotations ещё не реализован; JSON policy не помещается автоматически в сохранённый проект и не генерируется AI как доверенный grant.

Annotations — утверждения доверенного host/владельца о корневых данных, не вывод о фактической секретности. Прямой API не является persisted policy store или cryptographic program binding: после изменения программы root annotations следует пересмотреть; передавать старую policy автоматически по совпавшему path нельзя. Existing IDE source edits уже снимают инспекционные разрешения; здесь не реализовано новое долговременное хранение labels. Идентификаторы/структура программы не скрываются. Обычный результат исполнения не фильтруется этой диагностической политикой.

Это **restrict-only** слой поверх консервативного analysis, не готовое доказательство noninterference. Flow/context-insensitive объединения могут закрывать фактически независимые значения. Dynamic taint, declassification, точное heap/exception routing, межсобытийное/распределённое состояние, native/compiled debugger, ревизионное хранение labels и production sandbox остаются открытыми. Actor/resource/stream/opaque boundary uncertainty не ослабляется. Без отдельного доказательства полноты analysis и политики нельзя использовать public report как самостоятельное разрешение раскрытия.
