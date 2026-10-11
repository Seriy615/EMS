# ADR-0010 — отдельные public interface и implementation binding

Статус: принят для начального EMS-016 finite atomic IDL, AC-039.

Контекст: M0 manifest смешивает graph/kind/binding и публичную сигнатуру. Выбор адаптера для платформы требует стабильного интерфейса, строгой compatibility проверки и сохранения permissions независимо от более чистой конкретной реализации.

Решение: отдельные ems-contract-interface/1 и ems-contract-binding/1, общий canonical type grammar, exact references до execution; conservative interface policy сохраняется в installed adapter. Version comparison не снимает pins. Машиночитаемые finite predicates и declared typed errors исполняются одинаковыми helpers в runtime и pure standalone.

Следствия: metadata не доказывает determinism/behavior/trust и не заменяет binary hash/lockfile. Initial installation ограничена finite atomic ABI; composite/resource compatibility проверяется без преобразования их representation. Advanced installation требует отдельного evidence с preserved graph visibility и lifecycle; errors/custom variants требуют расширения ABI. Старые manifests не переписываются.
