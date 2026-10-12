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

## Сохранённая политика v2 (AC-090)

```json
{"schemaVersion":"ems-origin-policy/2","program":{"domain":"ems-control-origin-binding/1","sha256":"<64 lowercase hex>"},"sources":[]}
```

`createBoundOriginPolicy(ir,registry,v1)` явно связывает пересмотренные annotations с actual validated control IR. Digest — existing Web Crypto SHA-256 над UTF-8 `"ems-control-origin-binding/1" + NUL + serializeControlIR(ir,registry)`. Сериализация включает literal bytes (и signed zero), типы, порядок входов, тело/порядок инструкций, entry и закреплённые в IR contract versions/policies; object field order/function order нормализованы existing serializer. Canvas, текстовое форматирование/комментарии, runtime inputs и grants не входят. В policy возвращается только digest и annotations, не исходник/литералы.

`verifyBoundOriginPolicy` асинхронно проверяет actual program, повторно сверяет canonical bytes после digest и валидирует roots; ошибка несовпадения/изменения во время await →STALE_ORIGIN_POLICY до чтения runtime scope/диагностики. Возвращаемая v1 копия предназначена только для текущего проверенного исполнения, не для сохранения или переноса на другой IR. `classifyBoundControlOrigins` возвращает report с исходной bound v2 policy. Синхронный classify/createControlInspector явно отвергает непроверенную v2 (BOUND_ORIGIN_POLICY). Web Crypto недоступен →HASH_UNAVAILABLE, без слабого fallback. Existing стандартный SHA-256 abc vector и Node/browser cross-binding входят в QA.

Control interpreter проверяет v2 до первых callbacks; diagnostic IR уже отделён от исходного caller object перед await. `prepareBoundStudioInspection` фиксирует checked source request и независимо проверяет bound metadata. `await startBoundStudioExecution(request,options)` проверяет до создания Worker и возвращает прежний cancellable job; Worker ещё раз проверяет собственный freshly lowered IR. Во время подготовки запрос фиксируется, последующие изменения caller object не заменяют исполняемую программу. Execution timeout применяется к запущенному Worker, не к предшествующему native digest; source/frontend/analysis ограничения сохраняются. Sync startStudioExecution остаётся прежним v1 API и не понижает v2 автоматически.

```sh
node tools/ems.mjs module-bind-origins examples/classification.ems --entry main --policy examples/classification.policy.json --out bound-policy.json
node tools/ems.mjs module-classify examples/classification.ems --entry main --policy bound-policy.json --out classification.json
```

CLI проверяет v2 при classify. Повторное bind уже bound v2 запрещено: для новой версии программы нужен явно пересмотренный v1 annotation proposal. V1 остаётся доверенной политикой текущего запуска; гарантии against persisted stale labels относятся к v2. Это не автоматическое обнаружение секретов и не authentication владельца: SHA-256 не подтверждает доверие к самому файлу policy и не скрывает угадываемые константы. Host annotations по-прежнему требуют доверенного владельца. Digest фиксирует semantic IR, не bytes foreign/native implementations, target ABI или registry supply chain; для них существует отдельный program/package lock. IDE label authoring и долговременное storage labels ещё впереди. Public/restrict-only/effects/type/value-budget ограничения AC-089 сохраняются; полный noninterference/taint/declassification/native/compiled/visual mapping не заявляется.

## Назначение меток в Studio (AC-091)

В «Переменные на паузе» откройте «Какие данные можно показывать?». Для последовательного control кода: «Проверить источники данных», назначить входам/литералам «Не назначено — скрывать», «Закрытые данные» или «Можно показывать», затем «Применить и сохранить метки». Панель показывает имя входа/функцию/тип/строку, но не содержимое литерала или runtime value. Назначение public не ставит inspection grant: отдельно выберите разрешённые переменные.

Apply создаёт checked v2 binding, сохраняет project/draft и отдельный project-owned `ems-studio-origins/1` sidecar (`ems.studio.origins.v1:<project>`). В sidecar только owner и bound root policy, нет grants/snapshots/inputs/canvas/source text. Existing текстовый черновик и его JSON arguments по-прежнему сохраняются по прежним правилам: эти метки ограничивают только отладочную диагностику, не шифруют и не редактируют сохранённые черновики/обычные результаты.

На reopening требуется открыть код, проверить сохранённые метки и отдельно выбрать переменные; значения, grants и enabled checkbox не восстанавливаются. Изменение source/entry/lowering/library/mode снимает текущую проверку и grants, clears snapshots/cancels active execution. Stored stale policy остаётся для явного пересмотра, но selectors получают unknown и bound policy не активируется. Выбор другого label или удаление policy требует повторного apply. Если labels/source меняются во время hash, revision/identity guard запрещает сохранять предыдущий результат. Перед новым bound запуском actual client/Worker снова проверяют digest; source edit во время async preparation вызывает cancellation до обработки snapshot.

Удалить метки можно отдельной кнопкой; opt-in checkbox явно включает/выключает только дополнительное ограничение. Default legacy grants сохраняются для прежних workflows. Graph/visual collection-address authoring не поддержан этим gate. Нет auto rebind, автоматической классификации содержания, import/export grants, cross-event taint или full confidentiality proof.
