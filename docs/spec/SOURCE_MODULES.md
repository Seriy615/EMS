# Исходные модули EMS — AC-136

Связь с целью: G-01/G-02/G-03/G-05/G-11/G-12. Один parser, общий AST,
checker типов/эффектов, прежние IR/runtime/compiler и native/UI kernels.
Этот этап реализует компиляцию нескольких исходных файлов; создание и
редактирование связанных source projects в IDE остаётся следующим этапом.

## Исходный проект

`ems-source-project/1` — вход компилятора с точным снимком всех файлов:

```json
{
  "schemaVersion": "ems-source-project/1",
  "entry": "main.ems",
  "files": [
    {"path":"main.ems","source":"import \"lib.ems\" as lib; @Main(x:Number)->Number{return lib.Double(x);}"},
    {"path":"lib.ems","source":"export @Double(x:Number)->Number{return x*2;}"}
  ]
}
```

Схема: `schemas/source-project.schema.json`. Поля строго заданы; entry должен
существовать, пути уникальны и каноничны. До 64 файлов, суммарно 1 MiB UTF-8
исходников, JSON до 4 MiB символов. Полная проверка membership/нормализации/байтов
остаётся в parser. Путь — до 240 ASCII-символов, буквы/цифры/`_ .-/`;
абсолютные пути, URL, `:`, backslash, percent escapes, пустые компоненты запрещены.

В API `linkEMSModules(Map<path,source>, entryPath)` все документы передаются
явно. Ключи Map каноничны; import нормализует `.` и `..` относительно файла,
не выходя за корень. Ни файловая система, ни сеть не используются при разрешении.
Неиспользуемые документы учитываются в input byte budget, но не парсятся.
Бюджеты API: maxModules1..64, maxBytes1..4MiB, defaults64/1MiB;
parser каждого использованного файла ограничен 20000 tokens/depth128,
обход объединённого AST — 200000 узлов. Общие IR/graph/native лимиты сохраняются.

## Имена, экспорт и типы

```ems
import "../math/Operations.ems" as math;
@Main(value:Number)->Number {
    return math::Double(value);
}
```

`::` и `.` продолжают обозначать общие qualified symbols. Внутри файла доступны
его собственные объявления, включая private helpers и рекурсию. Через alias
доступен только член с `export`. Файл библиотеки содержит обычные контракты,
функции, type aliases и stateful definitions. Экземпляры, UI nodes/events и
application containers объявляются в entry-файле: импорт библиотеки не создаёт
дополнительных владельцев состояния и не монтирует чужое приложение.
Source imports образуют DAG; циклы отвергаются `MODULE_CYCLE` с цепочкой файлов.
Рекурсивные функции внутри модуля поддерживаются общим backend.

Объявления получают отдельные стабильные идентификаторы из канонического пути
и исходного имени: `__ems_module_<UTF8 path hex>.<name>`. Код не может напрямую
ссылаться на этот зарезервированный namespace. Это lossless encoding для
гигиены имён, не hash, подпись, шифрование или механизм защиты исходников.
Физические IDs являются деталями compiler output; `modules.symbols` связывает
их с исходными именами/файлами/visibility/version. Native definition ID по прежнему
ограничен 200 символами, включая namespace; превышение даёт MODULE_SYMBOL_LIMIT.

Linker меняет ссылки на вызываемые контракты, типы, static collection callbacks,
GraphNode.contract и explicit implementation references. Имена переменных,
параметров, полей, UI widgets, graph nodes/ports, literals и activation edges
сохраняются. Лексические области параметров, последовательных block bindings,
for/catch/match учитываются; локальное значение не превращается в callable
после переименования глобального контракта. Type parameters, type aliases,
value symbols и UI IDs сохраняют свои пространства имён. Канонические graph
kernel contracts, логические операции экземпляра и `self` сохраняют прежний смысл.
Библиотека не получает неявной ссылки на экземпляр из entry-файла.

Внешний typed registry передаётся вызывающим кодом. Необязательный Map `bindings`
явно связывает source specifier с namespace registry; декларации source extern
в этом профиле отвергаются MODULE_EXTERN_PROFILE. Коллизия binding с реальным
source path отвергается. Например `ems:core` → `core` разрешает `math.add`
по настоящей сигнатуре атома. Это не загрузка host-библиотеки и не FFI sandbox.
Существующие canonical core/std calls допустимы без import. Разрешения/эффекты
импортированных реализаций продолжают проверяться исходным runtime/compiler.

## Компиляция и диагностика

`compileEMSModules` передаёт resolved located AST общему checker/lowerer;
по умолчанию lowering auto. Generic/async/typed errors, коллекции и графовые
тела используют существующие профили. Неподдержанные Record execution/extern/
нативные targets не выдаются за реализованные. Профили и ограничения исходных
backend остаются в силе; сборка явно отказывает при неподдержанной конструкции.

`compileInstanceModules` использует `compileInstanceSourceAST`, затем прежние
native и UI linkers. Imported definition можно инстанцировать в entry, его
операции могут содержать графовые тела и вызывать другие source modules.
Initializers и invariants при link/build не исполняются. Реальный owner создаётся
при runtime startup; state, FIFO, проверки инвариантов и rollback общие с
одиночным source и standalone. UI по-прежнему связывается с этим же owner.

Виртуальный `source` — соединение оригинальных текстов для общих location spans.
`modules.files` и `moduleSourceLocation` возвращают исходный файл, UTF-16 offsets,
line/column. Sidecar расположен отдельно от semantic IR. Ошибки parser,
экспортов/путей и общих type/graph checks имеют исходный file/location.
Сборка из одинаковых источников не зависит от порядка ключей входного Map.
Это не полный debugger с переходом в любой imported source file.

## CLI и существующие проекты

```bash
node tools/workspace.mjs run examples/modules/series.source-project.json --inputs '{"epsilon":0.001}'
node tools/workspace.mjs build examples/modules/series.source-project.json --out dist/series.mjs
node tools/workspace.mjs application-run examples/modules/counter.source-project.json --events '[{"node":"up","event":"press"}]'
node tools/workspace.mjs native-build examples/modules/counter.source-project.json --out dist/counter.mjs
node tools/workspace.mjs application-build examples/modules/counter.source-project.json --out dist/counter-ui
node tools/workspace.mjs application-project examples/modules/counter.source-project.json --out dist/counter.project.json
```

Обычный entry — `Main`, меняется через `--entry`; `--file` выбирает другой
entry source. Native-run принимает instance/transition/inputs events;
application-run — node/event/value. Run использует настоящие runtime; build
пишет самостоятельный JS или DOM package без EMS imports/центрального сервиса.
Отклонённые events не подтверждаются и дают ненулевой CLI status.

`compileWorkspaceModule` также принимает текущий `ems-workspace/1` или его
project bundle, используя **реальные сохранённые text drafts** graph documents.
IR/canvas и sourceArchive не подменяют исходный текст. Для таких workspace
передаётся точный `--file`; unrelated invalid drafts не влияют на неимпортируемый
файл. Native/UI compiler input поддерживает тот же source-project manifest.
Старые compiled native/UI документы требуют существующих собственных инструментов.

`application-project` — проверенный compiled editor snapshot с genuine graph
origins и sourceArchive:null. Его можно импортировать в обычный Studio,
открывать/редактировать граф обработчика и экспортировать приложение. Исходный
source-project JSON остаётся отдельным compiler input. Изменение этого snapshot
не изменяет library files автоматически; IDE source dependency editing/navigation,
сохранение импортов при whole-source apply, file CAS и dependency-aware rebuild
остаются следующим этапом. Source module versions в sidecar не являются
package lock, разрешением на использование, лицензией или platform binding.

## Приёмка

Node: tests/source-modules.test.mjs — независимые namespace/private recursion,
generic types, diamond imports, input order, value/type/UI hygiene, graph ports,
async/errors, paths/cycles/limits, typed registry permissions и no-init compile;
actual persistent Worker и независимый native/UI output, CLI build/fresh Node.
Browser: tests/browser/source-modules.test.mjs — byte-identical Node/browser IR,
actual interpreter, исходные file errors, fresh independent output; импорт
compiled snapshot в обычный UI/canvas, исходные read/add/write/result ports,
настоящий Worker и скачанный DOM package после отключения EMS origin.
Полный source workspace IDE и native platforms этим gate не закрываются.
