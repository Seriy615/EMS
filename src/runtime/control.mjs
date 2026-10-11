import { fail } from '../reference/errors.mjs';
import { assertValueType } from '../reference/types.mjs';
import { validateRuntimeInputs } from '../reference/validate.mjs';
import { executeGraph } from '../reference/runtime.mjs';
import { validateControlIR, decodeControlLiteral } from '../ir/control.mjs';
import { assertPolicyNames } from '../semantics/effects.mjs';
import { assertSignal, checkCancellation, awaitCancellable } from './cancellation.mjs';
import { binaryControlValue, unaryControlValue, indexControlValue, controlBudgetOptions } from '../semantics/control-values.mjs';

export function checkControlPolicy(summary, { capabilities = [], allowedEffects = [] } = {}) {
  assertPolicyNames(capabilities, 'capabilities'); assertPolicyNames(allowedEffects, 'allowedEffects');
  for (const capability of summary.capabilities) if (!capabilities.includes(capability)) fail('PERMISSION_DENIED', `Control program requires ${capability}`, { capability });
  for (const effect of summary.effects) if (!allowedEffects.includes(effect)) fail('EFFECT_DENIED', `Control program declares ${effect}`, { effect });
}
export function controlSignature(fn) {
  return { id: fn.id, inputs: Object.fromEntries(fn.inputs.map(input => [input.name, { type: input.type }])), output: fn.output };
}

/** Execute semantic blocks. Every statement/expression/call shares one bounded step/depth domain. */
export async function executeControlIR(ir, inputs, registry, options = {}) {
  assertSignal(options.signal); checkCancellation(options.signal);
  const checked = validateControlIR(ir, registry); checkControlPolicy(checked.policy, options);
  validateRuntimeInputs(controlSignature(checked.entry), inputs);
  const budget = controlBudgetOptions(options); let steps = 0, depth = 0, evaluationDepth = 0;
  function tick() { checkCancellation(options.signal); if (++steps > budget.maxSteps) fail('STEP_LIMIT', 'Control execution step budget exhausted', { maxSteps: budget.maxSteps }); }
  async function expression(node, scope) {
    tick();
    if (++evaluationDepth > 256) { evaluationDepth--; fail('EVALUATION_DEPTH', 'Control expression depth exhausted', { maxEvaluationDepth: 256 }); }
    try {
    let value;
    switch (node.kind) {
      case 'literal': value = decodeControlLiteral(node.value, node.type); break;
      case 'local': value = scope.get(node.name).value; break;
      case 'array': value = []; for (const element of node.elements) value.push(await expression(element, scope)); break;
      case 'index': value = indexControlValue(await expression(node.value, scope), await expression(node.index, scope)); break;
      case 'assign': value = await expression(node.value, scope); scope.get(node.name).value = value; break;
      case 'unary': value = unaryControlValue(node.operator, await expression(node.value, scope)); break;
      case 'binary': {
        const left = await expression(node.left, scope);
        if (node.operator === '&&') value = left && await expression(node.right, scope);
        else if (node.operator === '||') value = left || await expression(node.right, scope);
        else value = binaryControlValue(node.operator, left, await expression(node.right, scope)); break;
      }
      case 'call': {
        const args = []; for (const argument of node.arguments) args.push(await expression(argument, scope));
        checkCancellation(options.signal);
        if (node.target.kind === 'function') value = await invoke(checked.functions.get(node.target.id), args);
        else {
          const contract = registry.resolve(node.target.id);
          const params = Object.fromEntries(Object.keys(contract.inputs).map((key, index) => [key, args[index]]));
          value = contract.kind === 'composite' ? await executeGraph(contract.graph, params, registry, options)
            : await awaitCancellable(contract.execute(params, Object.freeze({ signal: options.signal, state: options.state })), options.signal);
        }
        if (node.target.kind === 'contract') assertValueType(value, registry.resolve(node.target.id).output, 'result of ' + node.target.id);
        break;
      }
    }
    checkCancellation(options.signal); assertValueType(value, node.type, 'control expression'); return value;
    } finally { evaluationDepth--; }
  }
  async function block(body, parent) {
    const scope = new Map(parent);
    for (const statement of body) {
      tick(); let exit;
      switch (statement.kind) {
        case 'let': scope.set(statement.name, { value: await expression(statement.value, scope) }); break;
        case 'expression': await expression(statement.value, scope); break;
        case 'return': return { kind: 'return', value: await expression(statement.value, scope) };
        case 'break': case 'continue': return { kind: statement.kind };
        case 'block': exit = await block(statement.body, scope); break;
        case 'if': exit = await block(await expression(statement.condition, scope) ? statement.then : statement.otherwise, scope); break;
        case 'while':
          while (await expression(statement.condition, scope)) {
            const result = await block(statement.body, scope);
            if (result?.kind === 'return') return result;
            if (result?.kind === 'break') break;
          } break;
        case 'for': {
          const values = [...await expression(statement.iterable, scope)];
          for (const value of values) { tick(); const nested = new Map(scope); nested.set(statement.binding, { value });
            const result = await block(statement.body, nested); if (result?.kind === 'return') return result; if (result?.kind === 'break') break;
          } break;
        }
      }
      if (exit) return exit;
    }
  }
  async function invoke(fn, args) {
    tick(); if (++depth > budget.maxDepth) { depth--; fail('CALL_DEPTH', 'Control call depth exhausted', { maxDepth: budget.maxDepth }); }
    try {
      const scope = new Map(fn.inputs.map((input, index) => [input.name, { value: args[index] }]));
      const outcome = await block(fn.body, scope); assertValueType(outcome?.value, fn.output.type, 'control return'); return outcome.value;
    } finally { depth--; }
  }
  return invoke(checked.entry, checked.entry.inputs.map(input => inputs[input.name]));
}
