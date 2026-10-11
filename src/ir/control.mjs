import { fail } from '../reference/errors.mjs';
import { assertTypeName } from '../reference/types.mjs';
import { parseControlType, controlTypeName, controlVariants, assertControlValueType } from '../semantics/control-algebraic.mjs';
import { analyzeGraphEffects, assertPolicyNames } from '../semantics/effects.mjs';

export const CONTROL_VERSION = 'ems-ir/2';
export const CONTROL_PROFILE = 'ems-control-finite/1';
export const CONTROL_ALGEBRAIC_PROFILE = 'ems-control-algebraic/1';
export const CONTROL_ERROR_PROFILE = 'ems-control-errors/1';
const names = /^[A-Za-z_][A-Za-z0-9_]*$/;
export function controlFields(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Reflect.ownKeys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail('INVALID_IR', `Expected exactly ${keys.join(', ')}`);
}
function array(value) {
  if (!Array.isArray(value) || Object.keys(value).length !== value.length) fail('INVALID_IR', 'Expected dense array');
}
function name(value) { if (typeof value !== 'string' || !names.test(value)) fail('INVALID_IR', 'Invalid local name'); }
function text(value) { if (typeof value !== 'string' || !value) fail('INVALID_IR', 'Nonempty identity required'); }
export function decodeControlLiteral(value, type) {
  const number = n => n === '-0' ? -0 : n;
  const result = type === 'Number' ? number(value) : type === 'NumberArray' && Array.isArray(value) ? value.map(number) : value;
  assertControlValueType(result, type, 'control literal'); return result;
}
function policy(value) {
  controlFields(value, ['effects', 'capabilities']);
  for (const field of ['effects', 'capabilities']) assertPolicyNames(value[field], field);
}
export function controlContractPolicy(contract, registry) {
  const literals = { Number: 0, NumberArray: [], Boolean: false, String: '' };
  const graph = { schemaVersion: '0.1', id: 'control:policy', inputs: {}, output: { type: contract.output },
    nodes: [{ id: 'call', uses: contract.id, args: Object.fromEntries(Object.entries(contract.inputs).map(([key, type]) => [key, { literal: literals[typeof type === 'string' ? type : type.type] }])) }], returns: { node: 'call' } };
  return analyzeGraphEffects(graph, registry);
}

/** Strict structured control verifier. Policy is recomputed from linked implementations and local call edges. */
export function validateControlIR(ir, registry) {
  if (ir?.schemaVersion !== CONTROL_VERSION) fail('IR_VERSION', `Expected ${CONTROL_VERSION}`);
  if (![CONTROL_PROFILE, CONTROL_ERROR_PROFILE, CONTROL_ALGEBRAIC_PROFILE].includes(ir.profile)) fail('UNSUPPORTED_PROFILE', `Expected ${CONTROL_PROFILE}`);
  controlFields(ir, ['schemaVersion', 'profile', 'id', 'version', 'entry', 'functions']); text(ir.id); text(ir.version); text(ir.entry);
  array(ir.functions); if (ir.functions.length > 1000) fail('IR_LIMIT', 'Too many control functions');
  const algebraic = ir.profile === CONTROL_ALGEBRAIC_PROFILE;
  const assertType = (type, context) => algebraic ? parseControlType(type) : assertTypeName(type, context);
  const functions = new Map(), summaries = new Map(), edges = new Map(); let nodes = 0;
  for (const fn of ir.functions) {
    controlFields(fn, ['id', 'inputs', 'output', 'requirements', 'policy', 'body']); text(fn.id);
    if (functions.has(fn.id)) fail('INVALID_IR', 'Duplicate function');
    array(fn.inputs); const inputNames = new Set();
    for (const input of fn.inputs) { controlFields(input, ['name', 'type']); name(input.name); assertType(input.type, 'control input');
      if (inputNames.has(input.name)) fail('INVALID_IR', 'Duplicate input'); inputNames.add(input.name); }
    controlFields(fn.output, ['type']); assertType(fn.output.type, 'control output'); policy(fn.requirements); policy(fn.policy);
    functions.set(fn.id, fn); summaries.set(fn.id, { effects: new Set(fn.requirements.effects), capabilities: new Set(fn.requirements.capabilities) }); edges.set(fn.id, new Set());
  }
  if (!functions.has(ir.entry)) fail('INVALID_IR', 'Unknown entry function');
  const expect = (actual, expected) => { if (actual !== expected) fail('TYPE_MISMATCH', `Control IR ${actual} does not match ${expected}`); };
  function limit(depth) { if (++nodes > 20000 || depth > 128) fail('IR_LIMIT', 'Control IR exceeds structural budget'); }
  for (const fn of functions.values()) {
    function expression(node, scope, depth) {
      limit(depth); if (!node || typeof node !== 'object') fail('INVALID_IR', 'Expected expression'); assertType(node.type, 'expression');
      let actual;
      switch (node.kind) {
        case 'literal': if (node.type.includes('<')) fail('INVALID_IR', 'Algebraic values require construct expression'); controlFields(node, ['kind', 'type', 'value']); decodeControlLiteral(node.value, node.type); actual = node.type; break;
        case 'local': controlFields(node, ['kind', 'type', 'name']); name(node.name);
          if (!scope.has(node.name)) fail('UNKNOWN_SYMBOL', `Unknown local ${node.name}`); actual = scope.get(node.name).type; break;
        case 'array': controlFields(node, ['kind', 'type', 'elements']); array(node.elements);
          for (const element of node.elements) expect(expression(element, scope, depth + 1), 'Number'); actual = 'NumberArray'; break;
        case 'index': controlFields(node, ['kind', 'type', 'value', 'index']); expect(expression(node.value, scope, depth + 1), 'NumberArray');
          expect(expression(node.index, scope, depth + 1), 'Number'); actual = 'Number'; break;
        case 'assign': controlFields(node, ['kind', 'type', 'name', 'value']); name(node.name);
          if (!scope.has(node.name)) fail('UNKNOWN_SYMBOL', `Unknown local ${node.name}`);
          if (!scope.get(node.name).mutable) fail('IMMUTABLE_ASSIGNMENT', `Cannot assign ${node.name}`);
          actual = expression(node.value, scope, depth + 1); expect(actual, scope.get(node.name).type); break;
        case 'unary': controlFields(node, ['kind', 'type', 'operator', 'value']);
          if (!['+', '-', '!'].includes(node.operator)) fail('INVALID_IR', 'Unknown unary operator');
          actual = node.operator === '!' ? 'Boolean' : 'Number'; expect(expression(node.value, scope, depth + 1), actual); break;
        case 'binary': {
          controlFields(node, ['kind', 'type', 'operator', 'left', 'right']);
          const left = expression(node.left, scope, depth + 1), right = expression(node.right, scope, depth + 1); expect(right, left);
          if (['&&', '||'].includes(node.operator)) { expect(left, 'Boolean'); actual = 'Boolean'; }
          else if (['==', '!='].includes(node.operator)) actual = 'Boolean';
          else { if (!['+', '-', '*', '/', '%', '<', '<=', '>', '>='].includes(node.operator)) fail('INVALID_IR', 'Unknown binary operator');
            expect(left, 'Number'); actual = ['<', '<=', '>', '>='].includes(node.operator) ? 'Boolean' : 'Number'; }
          break;
        }
        case 'construct': {
          if (!algebraic) fail('UNSUPPORTED_PROFILE', 'Constructors require algebraic profile');
          controlFields(node, ['kind', 'type', 'tag', 'arguments']); array(node.arguments);
          const payload = controlVariants(node.type)?.get(node.tag);
          if (!payload) fail('TYPE_MISMATCH', 'Constructor does not match declared type');
          if (node.arguments.length !== payload.length) fail('CALL_ARITY', 'Constructor argument count mismatch');
          node.arguments.forEach((argument, index) => expect(expression(argument, scope, depth + 1), controlTypeName(payload[index])));
          actual = node.type; break;
        }
        case 'call': {
          controlFields(node, ['kind', 'type', 'target', 'arguments']); array(node.arguments); let target;
          if (node.target?.kind === 'function') { controlFields(node.target, ['kind', 'id']); target = functions.get(node.target.id);
            if (!target) fail('UNKNOWN_SYMBOL', 'Unknown control function'); edges.get(fn.id).add(target.id); }
          else if (node.target?.kind === 'contract') {
            controlFields(node.target, ['kind', 'id', 'version']); target = registry.resolve(node.target.id);
            if (target.version !== node.target.version) fail('CONTRACT_VERSION', 'Control binding version mismatch');
            const summary = controlContractPolicy(target, registry);
            for (const field of ['effects', 'capabilities']) for (const value of summary[field]) summaries.get(fn.id)[field].add(value);
            target = { inputs: Object.entries(target.inputs).map(([name, type]) => ({ name, type: typeof type === 'string' ? type : type.type })), output: { type: target.output } };
          } else fail('INVALID_IR', 'Unknown call target');
          if (node.arguments.length !== target.inputs.length) fail('CALL_ARITY', 'Control argument count mismatch');
          node.arguments.forEach((arg, index) => expect(expression(arg, scope, depth + 1), target.inputs[index].type)); actual = target.output.type; break;
        }
        default: fail('INVALID_IR', 'Unknown control expression');
      }
      expect(node.type, actual); return actual;
    }
    function block(body, parent, loops, depth) {
      limit(depth); array(body); const scope = new Map(parent); let terminated = false;
      for (const statement of body) {
        limit(depth); if (!statement || typeof statement !== 'object') fail('INVALID_IR', 'Expected control statement');
        if (terminated) fail('UNREACHABLE_CODE', 'Control statement after exit');
        switch (statement.kind) {
          case 'let': controlFields(statement, ['kind', 'name', 'type', 'mutable', 'value']); name(statement.name); assertType(statement.type, 'local');
            if (scope.has(statement.name)) fail('DUPLICATE_SYMBOL', 'Duplicate local');
            if (typeof statement.mutable !== 'boolean') fail('INVALID_IR', 'Invalid mutability');
            expect(expression(statement.value, scope, depth + 1), statement.type); scope.set(statement.name, { type: statement.type, mutable: statement.mutable }); break;
          case 'match': {
            if (!algebraic) fail('UNSUPPORTED_PROFILE', 'Match requires algebraic profile');
            controlFields(statement, ['kind', 'value', 'arms']); array(statement.arms);
            const type = expression(statement.value, scope, depth + 1), variants = controlVariants(type);
            const covered = new Set(); let total = false, exits = true;
            function pattern(node, type, nested, level) {
              limit(level);
              if (!node || typeof node !== 'object') fail('INVALID_IR', 'Expected pattern');
              switch (node.kind) {
                case 'wildcard': controlFields(node, ['kind']); return { total: true, complete: true };
                case 'binding': controlFields(node, ['kind', 'name']); name(node.name);
                  if (nested.has(node.name)) fail('DUPLICATE_SYMBOL', 'Duplicate pattern binding');
                  nested.set(node.name, { type, mutable: false }); return { total: true, complete: true };
                case 'literal': if (node.type.includes('<')) fail('INVALID_IR', 'Algebraic values require construct expression'); controlFields(node, ['kind', 'type', 'value']);
                  if (!['Number','Boolean','String'].includes(type)) fail('TYPE_MISMATCH', 'Literal pattern requires scalar type');
                  expect(node.type, type); decodeControlLiteral(node.value, type); return { total: false, complete: false };
                case 'constructor': {
                  controlFields(node, ['kind', 'tag', 'arguments']); array(node.arguments);
                  const payload = controlVariants(type)?.get(node.tag);
                  if (!payload) fail('TYPE_MISMATCH', 'Pattern constructor does not match type');
                  if (node.arguments.length !== payload.length) fail('CALL_ARITY', 'Pattern arity mismatch');
                  let complete = true;
                  node.arguments.forEach((argument, index) => { complete = pattern(argument, controlTypeName(payload[index]), nested, level + 1).total && complete; });
                  return { total: false, complete };
                }
                default: fail('INVALID_IR', 'Unknown pattern');
              }
            }
            for (const arm of statement.arms) {
              controlFields(arm, ['pattern', 'body']);
              if (total) fail('UNREACHABLE_CODE', 'Arm after catch-all');
              const nested = new Map(scope), coverage = pattern(arm.pattern, type, nested, depth + 1);
              const variant = arm.pattern.kind === 'constructor' ? arm.pattern.tag : null;
              if (variant && covered.has(variant)) fail('UNREACHABLE_CODE', 'Variant already covered');
              if (variant && coverage.complete) covered.add(variant);
              if (arm.pattern.kind === 'literal' && type === 'Boolean') covered.add(String(arm.pattern.value));
              total ||= coverage.total;
              exits = block(arm.body, nested, loops, depth + 1) && exits;
            }
            if (!total && !(variants && [...variants.keys()].every(tag => covered.has(tag))) && !(type === 'Boolean' && covered.has('true') && covered.has('false')))
              fail('NON_EXHAUSTIVE_MATCH', 'Match does not cover every value');
            terminated = exits; break;
          }
          case 'throw':
            if (![CONTROL_ERROR_PROFILE, CONTROL_ALGEBRAIC_PROFILE].includes(ir.profile)) fail('UNSUPPORTED_PROFILE', 'User throws require control error profile');
            controlFields(statement, ['kind', 'value']); expression(statement.value, scope, depth + 1); terminated = true; break;
          case 'try': {
            if (![CONTROL_ERROR_PROFILE, CONTROL_ALGEBRAIC_PROFILE].includes(ir.profile)) fail('UNSUPPORTED_PROFILE', 'Try requires control error profile');
            controlFields(statement, ['kind', 'body', 'handler', 'finalizer']);
            if (statement.handler === null && statement.finalizer === null) fail('INVALID_IR', 'Try requires catch or finally');
            const attempted = block(statement.body, scope, loops, depth + 1); let handled = false;
            if (statement.handler !== null) {
              const handler = statement.handler; controlFields(handler, ['binding', 'type', 'body']); name(handler.binding); assertType(handler.type, 'catch type');
              const nested = new Map(scope); nested.set(handler.binding, { type: handler.type, mutable: false });
              handled = block(handler.body, nested, loops, depth + 1);
            }
            const finalized = statement.finalizer !== null ? block(statement.finalizer, scope, loops, depth + 1) : false;
            terminated = finalized || (attempted && (statement.handler === null || handled)); break;
          }
          case 'expression': case 'return': controlFields(statement, ['kind', 'value']);
            if (statement.kind === 'return') { expect(expression(statement.value, scope, depth + 1), fn.output.type); terminated = true; }
            else expression(statement.value, scope, depth + 1); break;
          case 'block': controlFields(statement, ['kind', 'body']); terminated = block(statement.body, scope, loops, depth + 1); break;
          case 'if': controlFields(statement, ['kind', 'condition', 'then', 'otherwise']); expect(expression(statement.condition, scope, depth + 1), 'Boolean');
            { const yes = block(statement.then, scope, loops, depth + 1), no = block(statement.otherwise, scope, loops, depth + 1); terminated = yes && no; } break;
          case 'while': controlFields(statement, ['kind', 'condition', 'body']); expect(expression(statement.condition, scope, depth + 1), 'Boolean');
            block(statement.body, scope, loops + 1, depth + 1); break;
          case 'for': controlFields(statement, ['kind', 'binding', 'iterable', 'body']); name(statement.binding); expect(expression(statement.iterable, scope, depth + 1), 'NumberArray');
            { const nested = new Map(scope); nested.set(statement.binding, { type: 'Number', mutable: false }); block(statement.body, nested, loops + 1, depth + 1); } break;
          case 'break': case 'continue': controlFields(statement, ['kind']); if (!loops) fail('INVALID_CONTROL', 'Loop exit outside loop'); terminated = true; break;
          default: fail('INVALID_IR', 'Unknown control statement');
        }
      }
      return terminated;
    }
    if (!block(fn.body, new Map(fn.inputs.map(input => [input.name, { type: input.type, mutable: false }])), 0, 0)) fail('MISSING_RETURN', 'Control function does not return on every path');
  }
  let changed = true;
  while (changed) { changed = false; for (const [id, targets] of edges) for (const target of targets) for (const field of ['effects', 'capabilities'])
    for (const value of summaries.get(target)[field]) if (!summaries.get(id)[field].has(value)) { summaries.get(id)[field].add(value); changed = true; } }
  for (const [id, summary] of summaries) for (const field of ['effects', 'capabilities']) {
    const expected = [...summary[field]].sort();
    if (JSON.stringify(functions.get(id).policy[field]) !== JSON.stringify(expected)) fail('EFFECT_MISMATCH', 'Control policy does not match linked calls');
  }
  return { functions, entry: functions.get(ir.entry), policy: functions.get(ir.entry).policy };
}

export function serializeControlIR(ir, registry) {
  validateControlIR(ir, registry);
  // Node field order is fixed by lowering; normalize external object order too.
  const normalize = value => Array.isArray(value) ? value.map(normalize) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])])) : value;
  return JSON.stringify(normalize({ ...ir, functions: [...ir.functions].sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(fn => ({ ...fn, requirements: { effects: [...fn.requirements.effects].sort(), capabilities: [...fn.requirements.capabilities].sort() } })) }), null, 2) + '\n';
}
