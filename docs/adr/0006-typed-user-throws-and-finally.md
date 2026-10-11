# ADR-0006: typed user throws и bounded finally

Статус: принят для reference control error profile, 11 октября 2026. Evidence AC-034.

Введён отдельный ems-control-errors/1 в ems-ir/2. Новый typed user-value envelope имеет собственный marker и точный valueType. Catch получает primitive payload при точном совпадении типа; native host throws и messages не превращаются в String автоматически. Generic/alias resolution выполняется checker, а runtime/standalone используют один protocol helper. Доверенные adapters могут явно реализовывать этот reference протокол; это не sandbox и не окончательная FFI ABI.

Обычные abrupt finally outcomes имеют стандартный override порядок, включая returns и loop exits. Cancellation и исчерпание control budgets защищены: finally не может превращать terminal failure в успех. Finalizer разделяет исходный budget/signal; гарантированный resource cleanup при отмене требует отдельной bounded lifecycle scope и не заявляется этим срезом.

Unhandled payload возвращается caller API, но generic exception message и reactor failure trace его не включают. Новые statements не принимаются старым control finite profile. Structured error IDL, Option/Result/match и Future/Stream/resource lifecycle остаются открытыми этапами EMS-015/016.
