# Актуальный native EMS из semantic module

AC-130. `printInstanceSource(module, ui?)` печатает текущую статическую программу
из проверенного `ems-instance-module/1` и необязательного semantic UI. Архив EMS,
позиции холста и JSON представление IR не используются как исходник программы.
Полученный текст разбирает общий EMS parser и компилирует прежний native linker
в тот же control IR2; второго интерпретатора или внешнего языка нет.

## Интерфейс и реализация

Прежняя форма с телом операции в определении поддерживается. Дополнительно:

```ems
@Counter {
    value: Number = @Initial;
    +Change(delta: Number) -> Number;
    ? nonnegative = @Nonnegative;
}
@Counter #left {
    +Change = @ChangeLeft;
}
@Initial() -> Number { return 1; }
@Nonnegative(value: Number) -> Boolean { return value >= 0; }
@ChangeLeft(delta: Number) -> Number {
    return left::value::write(left::value::read() + delta);
}
```

Операция с `;` объявляет интерфейс. Каждому её экземпляру требуется реализация.
`+Change = @ChangeLeft` связывает интерфейс с конкретным EMS-контрактом, проверяя
имена и типы входов и тип выхода. Связь публичного entry статическая, без дополнительного вызова
обёртки при named dispatch. Если текстовый позиционный вызов операции использует
интерфейс с другим порядком портов, linker создаёт обычный проверенный EMS adapter:
он сохраняет порядок вычисления аргументов интерфейса и передаёт уже полученные
значения реализации по именам. Его работа учитывается общим ledger; состояния
или транзакции отдельно он не создаёт. Один экземпляр может иметь отличающуюся реализацию: граф хранит именно
эти тела, поэтому экспорт не подменяет их одним архивным прототипом.

`field: Type = @Initializer` и override `field: @Initializer` связывают чистый
нулеарный контракт инициализации. `? name = @Predicate` сохраняет имя инварианта
и связывает чистый Boolean-контракт с параметрами всех полей определения.
Неизвестные, несовместимые и неполные привязки отклоняются. Ссылки `@...` здесь
не являются динамическими значениями функций и не разрешены в произвольных
выражениях. Импорт, печать и сборка не исполняют initializers и predicates.

`instance::field::read()` / `write(value)` связываются с настоящими typed state
атомами существующего kernel. Это позволяет обычному EMS-контракту реализации
ссылаться на статический экземпляр, не публикуя физический hex ID слота. Чистое
окружение инициализации/инвариантов не получает state bindings. При разрешении
чистого entry проверяется его транзитивное замыкание; несвязанные stateful helpers
не мешают проверке чистого entry, но проходят обычный checker модуля исполнения.

## Представление control IR

`printControlProgram` печатает конечные synchronous IR2 expressions/statements:
вызовы и рекурсию, локальные mutable bindings, арифметику/short circuit, массивы
и индексы, Option/Result, match, if/while/for, break/continue, throw/try/catch/finally.
Имена внутренних функций и локальных связываний нормализуются гигиенически;
публичные имена полей, экземпляров, операций, инвариантов и портов сохраняются.
Сохранённые графовые правки печатаются из их текущего IR, включая автомат состояний
явных activation connections. Это нормальная форма программы, не обещание
восстановить первоначальное форматирование или высокоуровневый стиль.

Общий синтаксис дополнен:

- `(expression : Type)` — проверяемая аннотация типа, без cast и runtime-вызова;
  нужна в том числе для пустых и вложенных Array/Option/Result.
- `#-0`, `#-2`, `#[1, -0, 2]` — атомарные числовые/NumberArray константы.
  Обычные `-x` и `[expressions]` сохраняют прежнюю вычислительную семантику.
  Форма `#` позволяет напечатать IR literal без превращения его в лишние unary
  или поэлементные операции; тест сравнивает расход общего work ledger.
- quoted имена портов/полей/операций и `#"for"` для ссылки на экранированный
  локальный символ. Обычные идентификаторы не требуют экранирования.

В экспорт входят заданные initializers и overrides. Новый запуск создаёт сеанс
из этих данных. Пакетный заголовок сохраняет ID native-модуля. Имена внутренних функций,
metadata IR version/profile и source locations могут нормализоваться, поэтому
повторный импорт не обещает побайтовую идентичность IR или диагностики по его
внутренним ID. Проверяются результаты, состояния, ошибки, права и вычислительная
структура; на синтетическом control fixture — точный расход work ledger.

## Studio и CLI

В модуле доступны «Актуальный EMS» и «Скачать EMS». Текст можно изменить и
импортировать отдельной копией. Исходный проект и его layout остаются сохранены.
Архив отображается отдельно с явным названием. Этот срез не применяет изменения
полного текста поверх существующего документа с сохранением узлов/геометрии,
не создаёт историю текстовых drafts и не объявляет завершённым общий inverse.
UI-only text editing AC-128 продолжает работать с прежней точной UI binding model.

```sh
node tools/ems.mjs instance-source examples/contract-instances.ems --out current.ems
node tools/ems.mjs application-source examples/native-ui.ems --out current-ui.ems
node tools/ems.mjs application-run current-ui.ems --events '[{"node":"up","event":"press"}]'
node tools/ems.mjs application-build current-ui.ems --out dist/current-ui
```

`instance-source` принимает native source, semantic module JSON или project JSON;
при наличии UI сохраняет его. `application-source` требует UI. Самостоятельный
артефакт создаёт существующий compiler, не source printer.

Профиль остаётся bounded finite synchronous native module: без dynamic instances,
async/resource transitions, cross-file imports или foreign bindings. Действуют
прежние лимиты parser (1M UTF-16 units,100k tokens,depth128), IR и semantic module;
превышение при печати выдаёт `INSTANCE_SOURCE_LIMIT`, а не неполную программу.
Имена native declarations сохраняют ограничения текущего frontend, в том числе
зарезервированные `self`/`ems_`; произвольный вручную созданный module JSON вне
этого source-профиля не объявлен поддержанным печатью.

Доказательства: `tests/native-module-source.test.mjs`,
`tests/browser/native-module-source.test.mjs`; runtime/standalone comparison,
mutable graph body and field rename, tagged values, exact work accounting fixture,
no-init build, negative bindings, real CLI export/edit/build и browser downloaded EMS.
