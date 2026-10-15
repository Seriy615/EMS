# ADR-0017: проверяемые исходные графы native-документа

Статус: принято для finite synchronous native profile, AC-133.

Проблема: общий graph lowering закономерно создаёт внутреннюю машину управления в IR. Обратная проекция этой машины при первом открытии native-исходника создавала другие узлы и скрывала авторские связи. Архивный текст не является свидетельством актуальной программы.

Решение: хранить graph bodies как отдельные authoring witnesses по реальному function ID и native scope в project/3. Проверять повторной компиляцией в настоящем окружении функций и структурным сравнением IR modulo lexical alpha-renaming. Common checker не потребляет входной graph AST при повторной компиляции. Runtime/compiler продолжают получать semantic module/1, без authoring metadata.

Причина: полное byte equality слишком сильно зависит от гигиенического написания private locals при изменении field-interface; сравнение результатов нескольких запусков или скопированного hash/IR слишком слабое. Alpha comparison сохраняет binding structure, операторы, аргументы, эффекты, версии и публичный ABI. Сигнатуры функций не заменяют их реализации.

Последствия: импорт требует bounded recompilation и может консервативно отказать вне поддержанного профиля. Первый canvas использует исходные graph IDs; обычное Save затем владеет полным прежним graph witness. Поля и guard adapters должны обновлять origins вместе с IR, а не молча оставлять stale metadata. Неисполняемые узлы сохраняются как авторская информация и учитываются при удалении полей.

Спецификация: [NATIVE_GRAPH_ORIGINS.md](../spec/NATIVE_GRAPH_ORIGINS.md). Полный native source-document apply остаётся отдельным следующим gate.
