# ADR-0009 — execution-owned resources и lexical using

Статус: принят для начального ems-control-resources/1 (EMS-015, AC-038).

Контекст: finally с общим execution budget не гарантирует cleanup при cancellation/step exhaustion. Runtime и independent compiler должны иметь одинаковое владение, release порядок и видимый отказ, не считать arbitrary host IO прерванным по факту отмены Promise wait.

Решение: opaque ResourceHandle<T> принадлежит execution; using claims единственный lexical owner, cleanup LIFO вне program ticks с отдельным signal/deadline. Unclaimed resources закрываются на program boundary. Native bindings имеют acquire/read/optional write/release protocol; их union grants проверяется до acquire. Owned cells компилируются shared helpers; unsupported native export явно отвергается. Primary error сохраняется, secondary cleanup errors имеют payload-free metadata. Details: ../spec/CONTROL_RESOURCES.md.

Следствия: динамические ownership/escape checks предшествуют полноценной borrow системе. Timeout делает failure наблюдаемым, но не гарантирует physical release навечно зависшего native callback. Native operation tail должен завершиться до release; поздние native acquisition и IO outcomes получают exact-once release attempt. Trusted callbacks не sandboxed. Две формы программы продолжают использовать общий semantic IR; editor должен представлять using scopes, а не притворяться call DAG.
