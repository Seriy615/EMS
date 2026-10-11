# Контракты, атомарность, декомпозиция и упаковка

## Не путать оси

```
Execution kind: atomic | composite
Source availability: open | proprietary
Editor visibility: graph | opaque | read-only
Rights: read | modify | execute | redistribute
Placement: local | remote | hybrid
Implementation: built-in | EMS IR | native | WASM | FFI | RPC
```

Всё выше должно задаваться независимо. Один импортированный атом может быть open-source; составной граф может быть только read-only; платный пакет может содержать открытые блоки.

## Atomic

В рамках языка **нет вложенного раскрываемого EMS-графа**. Реализация может внутри делать сколько угодно вычислений; это не определяет atomicity. Atomic предоставляет нормальные порты, типы, эффекты, права, ошибки и тесты. Compiler/Runtime видит публичную декларацию и linked artifact.

## Composite

Контракт реализован графом. Стандартная операция IDE `Expand` открывает составной граф, а `Collapse` возвращает его к одному блоку. Редактор обязан сохранять связь с исходным графом и отображать источник данных/событий. Рекурсивная вложенность допускается; цикл вызовов/рекурсия требует определённой семантики, а не молчаливого стека.

## Seal / compile composite as atomic

```
Author's composite graph
  -> type/effect validation
  -> target compilation
  -> binary/module + minimal manifest + tests + optional signature
  -> external atomic contract (no source graph in distributed package)
  -> consumed from any compatible EMS graph
```

Составной контракт может иметь две версии дистрибуции: исходный inspectable graph и compiled atomic. `Opaque` не гарантирует техническую защиту от reverse engineering. Нельзя хранить приватные ключи внутри таких артефактов в расчёте на «закрытость».

## Imported library -> a set of atomic blocks

Пример из импорта криптобиблиотеки: `encrypt`, `decrypt`, `sign`, `verify` -> четыре независимых атомарных контракта в одном EMS Package. ABI shim проводит типы, ownership и ошибки; каждый блок можно использовать из других composite-контрактов, комбинируя его с UI/Network/Storage.

## Contract identity and versions

Use fully qualified IDs e.g. `std.crypto.aes256gcm.encrypt`, `org.vendor.camera.capture`. Publisher, package, contract and implementation IDs are different. Link compiler cannot silently replace implementation across major contract semantics. `lockfile` pins actual binary and hashes, not only semantic names.

## M0 executable examples

`examples/avg5.graph.json`: composite arithmetic demonstration. `npm run seal:demo`: exports `module.mjs` with `contract.json` but not source graph. `registerCompiledAtomic` consumes the generated module via a normal atomic contract boundary. `examples/crypto-import.manifest.json`: design-only crypto binding, not functioning FFI.
