# ADR-0018: полное native source apply с сохранением graph presentation

Статус: принято для AC-134, finite native profile.

Проблема: прежний source export печатал актуальный IR, но обратный import создавал новый документ. Переход IR→projected flow ради восстановления geometry изменяет представление вычислений и не является надёжным inverse. Архивный source не описывает актуальный граф.

Решение: текущий проверенный document генерирует native source с graph bodies из checked origins/saved-flow witnesses и настоящей таблицей helper aliases. Candidate проходит общий compiler; его function/action/reference IDs remap по этой таблице, существующие функции сравниваются lexical alpha identity, остальные остаются действительным новым IR. Не угадывать identity по labels, source offsets или совпадению node lists. Printed source дополнительно проверяется против всех существующих функций и публичной native/UI структуры.

Для изменённого scope сохраняется checked origin, а presentation хранится отдельно в project/4 graphViews, проверяемом по actual graph IDs. Точный saved-flow witness прежних неизменённых scopes остаётся. Форма поля и guard compiler adapters обновляют metadata по явной rename map. Module/IR version не меняется.

Следствия: нужен versioned document/4, поддержка в Worker/manager и отдельный durable whole-source draft с semantic/document/storage CAS. Нельзя смешивать source text и coords либо считать несколько совпавших outputs доказательством compiler equivalence. Source exports с многими независимыми pure graph scopes требуют bounded native-file checking, сохраняя ordinary и per-program limits.

Спецификация: [NATIVE_SOURCE_APPLY.md](../spec/NATIVE_SOURCE_APPLY.md). Платформы, imports/lifetimes и полная visual mapping остаются отдельными gates.
