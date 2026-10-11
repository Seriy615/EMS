# Журнал запуска и местоположение ошибки графа

`executeGraph(...,{onNodeFailure})` допускает optional observer `(callPath)=>void`. При ошибке actual atomic/composite operation или проверки её результата observer получает скопированный путь `{graph,node,contract}` от внешнего графа до текущей операции. При nested failure первое сообщение содержит точный leaf/caller chain; последующие parent сообщения могут быть короче. Ошибки вычисления аргументов принадлежат реально упавшему producer. Валидация до операции не придумывает node location.

Observer не изменяет `error.code`, `error.details`, порядок вычисления или результат. Observer exception игнорируется. Invalid non-function option отвергается. Путь не содержит аргументов, состояния, результата, ключей или native implementation. Прежние runtime/compiler conformance error vectors сохраняются.

Studio Worker сохраняет первый failure path отдельным диагностическим полем транспорта, client переносит его отдельно от semantic error details. Графовый редактор выделяет соответствующий node текущего workspace; для ошибки вложенного контракта это его call block, при исполнении раскрытого body — leaf. Полный автоматический переход в вложенный failing graph и source-map/control debugger ещё открыт.

`#execution-log` показывает actual Worker request start, успешную проверку сохранённого проекта, terminal completion/failure/cancel/deadline. «Проект проверен» относится к stored project, не утверждает проверку необработанного text candidate: текст проверяется ordinary frontend при Run. Лог не имитирует пошаговую трассу. UI событийная trace остаётся собственностью existing ReactorKernel. Путь и lifecycle — authoring diagnostics, не новое semantic IR.
