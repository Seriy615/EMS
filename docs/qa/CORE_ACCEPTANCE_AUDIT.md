# Аудит начальных EMS-015 / EMS-016

Область — finite reference profiles из текущих нормативных specs, а не полнота языка/платформ/IDE. Исходная ревизия для аудита e271177; расширение EMS-017 проверяется отдельным commit после полного npm test / verify. Нельзя переносить DONE этих backlog tasks на M1, P1 или PROJECT_GOAL.md.

| Task / критерий | Реальное свидетельство | Ограничение |
|---|---|---|
| EMS-015: state/events, deterministic replay | tests/reactor.test.mjs исполняет typed state через textual lowering/shared IR, FIFO dispatch, trace replay, failed-event rollback, isolated copies, queue overflow и active/queued cancellation; npm test | Это reference session, compiled state пока unsupported |
| EMS-015: control/error/async | tests/control.test.mjs, control-errors.test.mjs, control-algebraic.test.mjs, control-futures.test.mjs сравнивают runtime/generated behavior, exact budgets, throw/catch/finally, recursion, typed algebraic values и supervised tasks | Finite limits; нет обещания полной native ABI |
| EMS-015: Stream/resources ordering/ownership | tests/control-streams.test.mjs, control-resources.test.mjs проверяют actual backpressure/FIFO, copies, cancellation, lexical cleanup, OS fd release, event join/cleanup-before-commit | Timeout не гарантирует release зависшего native callback |
| EMS-016: formal public interfaces and binding refs | schemas/contract-interface.schema.json, contract-binding.schema.json, resource-interface.schema.json; CONTRACT_IDL.md и RESOURCE_IDL.md; tests/contracts-idl.test.mjs | Initial canonical value grammar; расширенный native payload ABI отдельно |
| EMS-016: incompatible versions/bindings rejected | contracts-idl/composite/resource tests: exact pins, order/type/target/grants, conservative interface evolution и preserved pre/post/error boundaries; callbacks не вызываются до preflight | Descriptor не является behavioral proof |
| EMS-016: inspectable composite and resource bindings | tests/contracts-composite.test.mjs и contracts-resource.test.mjs: mandatory interfaceRef/direct IR, missing binding/downcast rejection, rebinding, real readonly file lifecycle и rollback | Native standalone не реализован |
| EMS-016: dependency content integrity | tests/program-lock.test.mjs: verified byte provenance, transitive declared SDK artifacts, same-version callback/bytes drift, actual native file, snapshot/CLI export | Trusted SDK, не sandbox; kernel ABI witness не binary attestation; state callback lock unsupported |

Baseline audit: npm test 500/500, npm run verify 84/84 на Node 22.21.0, подтверждены повторно /tmp/ems-conformance-baseline-tests.log и /tmp/ems-conformance-baseline-verify.log. Более сильные counts после harness фиксируются в STATUS.md/PROGRESS.md. Fixtures/tests — исполняемые evidence, markdown/schema сами по себе не считаются PASS.

По исходным acceptance backlog (EMS-015: stable replay semantics; EMS-016: incompatible version/binding rejection) эти начальные tasks могут быть DONE после полного green run, сохраняя перечисленные ограничения и будущие deliverables. Pending state standalone переносится в существующий compiler task EMS-060; full native ABI — соответствующие FFI/backend tasks. Это не снятие требований глобальной цели: они остаются в ROADMAP/PROJECT_GOAL. EMS-017 теперь может выполнять свою зависимую acceptance, после которой требуется реальный browser P1 и Web IDE.
