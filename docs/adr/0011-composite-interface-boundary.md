# ADR-0011 — public interface boundary сохраняет composite graph

Статус: принят, EMS-016, AC-040.

Контекст: finite atomic adapter уже проверяет pre/post/error contracts. Превращение composite в atomic wrapper лишило бы editor возможности раскрыть фактически исполняемую программу; отдельный показ исходного графа над непрозрачным callback не обеспечивает единый IR.

Решение: registerContractBinding для finite composite делает независимый snapshot выбранного graph с public interface id/version, сохраняет nodes/sequence и kind composite. Registry entry хранит validated frozen interfaceBoundary. Graph использует ems-contract-graph/1 с explicit interfaceRef; direct IR выбирает ems-contract-core-finite/1 или ems-contract-effects-finite/1 с той же mandatory ссылкой, missing binding отвергается. Selected interface является границей выполнения graph, а не editor coordinates; bare graph/IR с этим public id проходят version/signature и conservative policy checks. Вычислитель окружает исходные nodes pre/post/error guards. Compiler окружает те же compiled statements lexical JS boundary с shared helpers; nested scopes/memoization не выходят из своих границ.

Следствия: graph remains editable; изменения nodes исполняются под выбранным public interface. Public conditions действуют также на прямой graph/IR entry, а не только на call node. Registry/dependency bindings по-прежнему обязательны для интерпретации исходного артефакта; standalone seal содержит executable guards без EMS imports. Graph metadata нельзя использовать для снятия interface permissions. ID/version pin не заменяет transitive source hash/lockfile, а проверенный postcondition не доказывает все свойства алгоритма. Resource/advanced interface installation ещё отдельный срез.
