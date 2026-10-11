# Текстовый EMS — грамматика frontend 0.1

**Задача:** EMS-012. **Цель:** G-01/02/03/14. **Acceptance:** AC-027.  
Реализация: `src/frontend/index.mjs`; формат дерева: `ems-ast/1`; пример: `examples/language-core.ems`.

Это собственный frontend EMS: lexer и recursive-descent/Pratt parser создают AST, не выполняя код хоста и не загружая импорты. Реализована грамматика ниже; разрешение имён, типизация, проверка effect/control/resource semantics и lowering новых конструкций ещё требуются. Parse success не равен исполняемой корректной программе. Старый M0 `text-run` остаётся отдельным ограниченным frontend к reference graph; новая команда `parse` создаёт AST и ничего не исполняет.

## Лексика

Идентификатор: `[A-Za-z_][A-Za-z0-9_]*`, кроме ключевых слов. Квалифицированные имена разделены точками. Комментарии `//` до конца строки и `/* ... */`, без вложенности. Строки заключены в двойные кавычки, escape соответствует JSON; raw newline и host template literals запрещены. Числовой литерал — конечный binary64: десятичные цифры, необязательная точка, необязательный exponent `e/E` со знаком. Знак — unary operator, поэтому отрицательный ноль сохраняется в AST как `-` над `0`. `1e999` отвергается.

Lexer распознаёт `->`, `=>`, `==`, `!=`, `<=`, `>=`, `&&`, `||` и одиночную пунктуацию. Никакие JS eval, template expansion или исполнение модуля не вызываются. `JSON.parse` используется только для чтения строковых escape.

## EBNF

```ebnf
Module        = [Package], {Import}, {Declaration}, EOF;
Package       = "package", QName, "@", String, [";"];
Import        = "import", String, "as", Identifier, ";";
Declaration   = ["export"], (TypeAlias | Callable);
TypeAlias     = "type", Identifier, [TypeParams], "=", Type, ";";
Callable      = ["extern"], ["async"], ("fn" | "contract"), QName,
                [TypeParams], "(", [Parameters], ")", "->", Type,
                [Requirements], (Block | ";");
Parameters    = Parameter, {",", Parameter};
Parameter     = Identifier, ":", Type;
TypeParams    = "<", Identifier, {",", Identifier}, ">";
Type          = QName, ["<", Type, {",", Type}, ">"], {"[", "]"};
Requirements  = "requires", Requirement, {",", Requirement};
Requirement   = "pure" | Identifier, "(", String, ")";
Block         = "{", {Statement}, "}";
Statement     = Block | Let | Using | Return | Throw | If | While | For
              | Match | Try | Break | Continue | Expression, End;
Let           = "let", ["mut"], Identifier, [":", Type], "=", Expression, End;
Using         = "using", ["mut"], Identifier, [":", Type], "=", Expression, End;
Return        = "return", [Expression], End;
Throw         = "throw", Expression, End;
If            = "if", Expression, Block, ["else", (If | Block)];
While         = "while", Expression, Block;
For           = "for", Identifier, "in", Expression, Block;
Match         = "match", Expression, "{", {Pattern, "=>", Block, [","]}, "}";
Pattern       = Literal | QName, ["(", [Pattern, {",", Pattern}], ")"];
Try           = "try", Block, [Catch], ["finally", Block];
Catch         = "catch", "(", Identifier, [":", Type], ")", Block;
Break         = "break", End;
Continue      = "continue", End;
Expression    = Assignment;
Assignment    = LogicalOr, ["=", Assignment];
LogicalOr     = LogicalAnd, {"||", LogicalAnd};
LogicalAnd    = Equality, {"&&", Equality};
Equality      = Comparison, {("==" | "!="), Comparison};
Comparison    = Sum, {("<" | "<=" | ">" | ">="), Sum};
Sum           = Product, {("+" | "-"), Product};
Product       = Unary, {("*" | "/" | "%"), Unary};
Unary         = ("!" | "-" | "+" | "await"), Unary | Postfix;
Postfix       = Primary, {"(", [Arguments], ")" | ".", Identifier | "[", Expression, "]"};
Arguments     = Expression, {",", Expression};
Primary       = Literal | Identifier | "(", Expression, ")" | Array | Record;
Array         = "[", [Expression, {",", Expression}, [","]], "]";
Record        = "{", [Field, {",", Field}, [","]], "}";
Field         = Identifier, ":", Expression;
Literal       = Number | String | "true" | "false";
QName         = Identifier, {".", Identifier};
```

Ограничения, дополнительно к EBNF:

- `extern` требует `;` и запрещает body; обычный callable требует body.
- `try` требует `catch` либо `finally`.
- Левая сторона `=` — NameExpression, MemberExpression или IndexExpression. Назначение неизменяемой переменной будет отклоняться type/control pass, а не parser.
- `_` — wildcard pattern, `QName(...)` — constructor pattern, обычное имя — binding pattern. Разрешение enum/constructor и exhaustiveness относятся к type checker.
- Публичный `Type[]` нормализуется в AST до `Array<Type>`. Type generic arguments в этой редакции являются типами; fixed-size numeric arguments пока не поддержаны.
- `End` — `;`, граница строки после завершённого выражения, `}` или EOF. Присоединяемые операторы и postfix продолжают выражение через newline. `return` с newline сразу после ключевого слова имеет пустое значение; выражение следующей строки — отдельный statement. Рекомендуются явные `;` в новом коде. Эта политика сохраняет существующий `avg5.ems`.
- `import` — только декларация; порядок разрешения, package versions и доверие проверяет следующий проход.

## AST и исходные позиции

Module содержит package, imports и declarations. Callable содержит параметры/выход/requirements/body, flags export/extern/async и type parameters. Statement и Expression — явные tagged nodes; операторы не преобразуются в хостовый JS. Семантическое разрешение unknown calls, `break` вне цикла, `await` вне async, mutable assignments и resource lifetimes обязательно до исполнения.

Каждый узел и token имеют `location.start/end` с `offset`, `line`, `column`; end исключает последующий символ. Offset и column измеряются UTF-16 code units, line/column начинаются с 1. CRLF считается одним переходом строки. Позиции находятся в AST/provenance и исключаются из идентичности конечного IR. Взаимное связывание IDE text/graph остаётся EMS-032.

Ошибки синтаксиса — `SYNTAX` с `details.location`; длина/число tokens — `SOURCE_LIMIT`; чрезмерная вложенность — `SYNTAX_DEPTH`. По умолчанию максимум 1 000 000 UTF-16 code units, 100 000 tokens и 128 уровней parser nesting. Они конфигурируются через options API; это budget frontend, не sandbox runtime.

## Проверка

```bash
node tools/ems.mjs parse examples/language-core.ems
node --test tests/frontend.test.mjs
```

AC-027 покрывает перечисленные конструкции, precedence/associativity, позиции, CRLF/comments, сохранение M0 syntax, отказ от host-only syntax, malformed inputs и управляемые limits. Пример `language-core.ems` является синтаксическим fixture, а не демонстрацией исполнения async/control/state. Следующая задача EMS-013 должна типизировать этот AST и связать исполняемый поднабор с общим IR; EMS-014/015 расширяют effects/runtime.
