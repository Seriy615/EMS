# Program dependency lock v1

EMS-016, AC-042, CONT-07 и G-03/06/11/12/15. Lock фиксирует semantic IR, полный registry dependency closure и verified source artifact bytes до execution/export. Он отдельный от source/canvas/IDL, не заменяет их проверку. Public API — src/contracts/index.mjs; схема program-lock.schema.json, artifact ems-program-lock/1.

## Содержимое

Target, SHA-256 canonical serialized semantic program, sorted unique contracts и artifacts. Contract record: id/version/kind, hash signature/policy/representation/interface metadata и implementation {kind,id}. Composite hash включает normalized graph IR; traversal включает unused nodes и selected interface implementation refs. Resource включает valueType, write availability и всю phase boundary chain. Artifact: id, hash actual UTF-8 source bytes, sorted dependency ids. Extra/missing/changed records дают отказ; artifacts с одинаковым id и разными bytes/edges конфликтуют.

Все function/contract targets v1/v2 входят в closure. Direct composite interfaceRef тоже dependency. Source positions/canvas не включены. Existing canonical IR serialization нормализует graph nodes/literals; lock хеширует результат serializer, не обещает тождество произвольно переформатированных control artifacts. Version совпадение не заменяет content hash. Program inputs, session state и current grants не являются source artifact; runtime проверяет их отдельно.

## Provenance и доверенное ядро

Core intrinsics — доверенный reference ABI ems-core-finite/1. Private callback identity witness проверяет actual canonical execute/emit hooks/signature/version; обычная регистрация callback под именем core.add не делает его intrinsic. Lock не аттестует бинарник ядра, JS engine, OS или Node builtin libraries. Эти компоненты относятся к trusted runtime/platform root, отдельно от third-party dependency artifacts. Нельзя выдавать ABI witness за binary hash.

Другие atomic/native implementations требуют verified module provenance. **Function.toString не используется**: оно не доказывает closure/dependency bytes. Неподтверждённые callbacks, включая старые bare trusted JS bindings без byte provenance, получают UNPINNED_IMPLEMENTATION. Source sha256 вычисляется Web Crypto SHA-256, стандартный abc vector проверен. Web Crypto должен быть доступен (Node 22 / secure browser context); собственного crypto алгоритма нет.

registerTrustedPinnedModule — явно вызываемый **trusted** Module SDK loader. Он принимает manifest ems-pinned-binding/1, module id, typed atomic/resource mappings exports и массив {id,source,dependencies}. Bytes копируются до await. Каждый модуль экспортирует create(dependencies), получающий verified dependency module exports. Источники оцениваются из exact decoded UTF-8 bytes через data module; callbacks связываются с private provenance record. Loader проверяет SDK DAG/missing exports и staging всех registry declarations до registration. Factory/initializers исполняются только при явном вызове loader; создание/проверка lock не исполняют callbacks или emit hooks.

Это adapter SDK для **объявленного** source dependency graph, не автоматический разбор/переписывание JS imports и не sandbox. Arbitrary dynamic/absolute imports, global mutable state и undeclared external dependencies не выводятся из source; completeness/trust обязан обеспечить автор vetted adapter. Native Node builtin API относится к platform ABI, а не hashed vendor artifact. Crypto/FFI libraries нельзя объявлять закрытыми по dependencies без отдельного adapter audit. Default CLI не импортирует unknown JS для обнаружения exports.

Atomic IDL adapter хранит interface/binding metadata; private captured-source record проверяет, что current selected implementation соответствует actual closed-over callbacks. Stale replacement отвергается BINDING_DRIFT. Resource callback identities сверяются с binding refs; readonly interface может скрыть write. Composite graph snapshot и implementation refs хешируются отдельно, поэтому редактирование selected implementation под той же version не остаётся незамеченным.

## Проверка и исполнение

createProgramLock(ir,registry,{target,artifactSources}) строит lock. artifactSources — Map artifact id → current text/Uint8Array, обязательный для source artifacts; bytes должны совпасть с provenance реально загруженного модуля. Это позволяет отклонить изменившиеся файлы, а не просто доверять объявленной строке sha256.

verifyProgramLock повторно вычисляет program/dependency/source closure и требует exact match/target. executeLockedIR и compileLockedIRToJS делают verify до effect callbacks/emit hooks. Registry graph/signature и IR snapshots фиксируются перед asynchronous verification; последующая замена source registry не меняет selected execution. Imported callback closures/host behavior остаются trusted, snapshot не замораживает чужую OS или сторонние global variables. Existing unguarded reference executeIR/compileIRToJS сохраняются; lock обязательный только для явно выбранного locked workflow, не скрытая security настройка всех APIs.

Standalone compiler после verify генерирует independent output; запуск не требует EMS service/lock verifier. Artifact delivery signatures/digests, revocation и complete signed package manager — M5/M10. Native resource export всё ещё UNSUPPORTED_TARGET, хотя locked runtime для verified resource работает. State registry closures без provenance пока не входят в этот strict lock profile; state reference behavior из AC-032/041 продолжает работать обычным runtime, без fake lock success.

## CLI

```bash
node tools/ems.mjs module-ir examples/resources.ems --entry demo.ResourceTotal --out dist/resources.ir.json
node tools/ems.mjs lock dist/resources.ir.json --target node --out dist/resources.lock.json
node tools/ems.mjs locked-run dist/resources.ir.json --lock dist/resources.lock.json --target node '{"value":4}'
node tools/ems.mjs locked-build dist/resources.ir.json --lock dist/resources.lock.json --target node --out dist/resources.mjs
```

Пример examples/pinned-lock.mjs связывает два настоящих SDK-модуля, фиксирует их bytes/dependency edge и получает 6 в runtime и generated JS. Это Node evidence, не browser proof.

CLI uses core registry, source-artifact SDK подключается programmatic API после явного trust decision. Target label не доказывает portability: настоящие Node/browser/native evidence нужны отдельно. CLI отказ exit 1, output module создаётся только после verify/compile success. Schemas описывают структуру; semantic/provenance gate executable. External schema engine не запускался.

AC-042 — tests/program-lock.test.mjs: runtime/independent export, exact program/target/record closure, unused composites/IDL refs, verified source dependency DAG, byte drift/callback impersonation/stale adapter, no callbacks/emit during hashing, registration staging, standard SHA-256 vector, registry snapshot, actual pinned native file + OS fd EBADF, native export rejection и CLI/new-process standalone workflow. Это content integrity evidence, не behavioral equivalence/production trust. Следующий gate — общий differential conformance и actual browser P1.

Finite standard library добавлена с отдельным trusted intrinsic ABI ems-stdlib-finite/1: canonical id/version/signature/pure policy и captured callback/emitter witness. Existing core ABI не меняется. Public stdlib IDL/copy/error rules/catalog — [STANDARD_LIBRARY.md](STANDARD_LIBRARY.md). Closure lock отвергает подменённый std callback, не аттестует бинарник стандартной библиотеки или JS engine.
