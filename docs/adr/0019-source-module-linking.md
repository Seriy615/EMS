# ADR-0019 — файловые source modules поверх общего AST

Статус: принят для AC-136 compiler profile. Цель: G-01/02/03/05/11/12.

## Решение

Импорты разрешаются из переданного data-only снимка файлов. Linker выполняет
проверку DAG, export visibility, нормализацию путей и hygienic symbol binding,
после чего общий located AST проходит существующий type/effect checker и IR
lowering. Stateful definition можно импортировать; instance/UI принадлежат
entry-файлу. Compile/build не исполняют EMS и не загружают host code.

Статические ссылки в graph bodies и implementation bindings разрешаются тем же
resolver. Лексические value/type scopes и UI identities сохраняются отдельно;
общие kernel и native owner/self semantics имеют прежний приоритет.
Идентичность внутренних symbols выводится из полного пути lossless encoding;
исходные spans/file names хранятся sidecar вне IR. Политики, лицензии, package
locks и platform implementations не смешиваются с source import visibility.

Компилированный editor snapshot — отдельный артефакт, редактируемый прежним
canvas. Он не притворяется живым source workspace. Следующий gate должен
добавить IDE file editing/navigation, CAS и проверяемое обновление зависимых
программ, сохраняя те же source bindings и authored graph identity.

## Границы

Первый профиль запрещает module cycles, library top-level instances/UI и source
extern declarations. Typed host namespace bindings предоставляются явно.
Общие backend limits сохраняются; native definition names ограничены 200
символами с namespace. Это reference compiler profile, не arbitrary code sandbox.
Миграция или удаление исходных пользовательских файлов не выполняются.

## Следствия

CLI, Node и browser используют один compiler input и семантику. Source library
может содержать private helpers, generic types, async functions и графовые тела.
Экспортированный DOM/JS package исполняется без исходного source-project и EMS.
Нормативный профиль/команды/acceptance: SOURCE_MODULES.md, AC-136.
