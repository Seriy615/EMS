# ADR 0014 — opt-in typed control inspection

Статус: принято для reference runtime API; Worker/IDE transport ещё не реализован.

## Проблема и граница доверия

Existing pre-operation diagnostics payload-free. Передавать весь scope или значения ресурсов в отладчик нельзя: observer может быть менее доверенным, чем execution host. Host владеет grants/classification; входная программа и разрешённые trusted bindings проходят existing type/effect/capability preflight. M0 trusted JavaScript не становится sandbox, а signed bindings не считаются доказательством безопасности.

## Решение

Явный execution option `inspection` разрешает только выбранные function/binding names. Snapshot берётся из реального lexical scope того же activation frame до statement/expression, metadata типизируется из validated IR. Source grants с неизвестной/неоднозначной declaration отклоняются до исполнения. Default отсутствия own option не добавляет значений к событиям. Inherited options/grants не являются разрешением. Policy содержит только own data properties; accessors/sparse или extra array entries отклоняются без вызова getter.

Первая confidentiality boundary консервативна: fn с effects/capabilities/localEffects не раскрывает значения; любой host-marked `protectedFunctions` закрывает всю текущую программу, включая derived values и callers. Никаких heuristics по имени переменной, inferred taint или declassification не заявлено. Без host classification явно разрешённая String может содержать секрет; allowlist — реальное разрешение на её данные. Дальнейшая поддержка secret flow требует отдельной формальной semantics/policy, а не обхода этой границы.

Closed finite copier поддерживает Number/Boolean/String/NumberArray и рекурсивные Option/Result; любые Future/Stream/ResourceHandle, включая вложенные, исключаются до чтения значения. Data accessor descriptors не вызываются. Proxy/untrusted JS остаётся за existing trusted-host boundary. Size/depth/slot budgets отклоняют значение целиком и ограничивают serialized snapshot, без secret prefixes.

Observer получает detached данные; mutation/throw не меняют program result, cancellation/cleanup остаются прежними. Graph value adapter не реализован и явный graph inspection request отклоняется. Control→composite graph сохраняет прежнюю семантику и не передаёт inspection option внутрь неподдерживаемого backend. Studio Worker явно отклоняет ещё не реализованный value transport; UI Worker имеет существующий strict option whitelist.

## Последствия и следующий этап

AC-074 проверяет настоящий core API и его границы. Это не завершённый value inspector IDE или production confidentiality system. Следующий срез: source-owned checked grants, bounded DTO validation, explicit owner opt-in controls и pure control Worker/IDE panel, default payload-free/unsupported profile refusal. Protected/effectful UI state/native/compiled inspection останутся закрытыми до отдельного доказательства политики.
