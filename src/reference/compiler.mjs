import { fail } from './errors.mjs';
import { validateGraph } from './validate.mjs';
import { analyzeGraphEffects, validateEffectSequence } from '../semantics/effects.mjs';

/**
 * Reference pure JS target. Emits each reachable node once per composite call,
 * preserving checked intermediate values, port order and structured error codes.
 * Atomic emitJS hooks are trusted compiler plugins, not sandboxed extensions.
 */
export function compileStandaloneJS(graph, registry) {
  const policy = analyzeGraphEffects(graph, registry);
  if (policy.effects.length || policy.capabilities.length)
    fail('UNSUPPORTED_TARGET', 'Effects or capabilities cannot be erased during standalone compilation');
  validateEffectSequence(graph, registry);
  const statements = [];
  let nextValue = 0;
  function compileExpression(currentGraph, boundInputs, stack) {
    if (stack.includes(currentGraph.id) || stack.length >= 32)
      fail('RECURSIVE_COMPOSITE', `Recursive composite in compiler: ${currentGraph.id}`);
    const nextStack = [...stack, currentGraph.id];
    const { nodes } = validateGraph(currentGraph, registry);
    // A pure target cannot accept effectful declarations, including unused ones.
    for (const node of nodes.values()) {
      const contract = registry.resolve(node.uses);
      if (contract.capabilities.length || contract.effects.length)
        fail('UNSUPPORTED_TARGET', `${contract.id}: effects or capabilities cannot be erased during standalone compilation`);
    }
    const memo = new Map();
    function expression(ref) {
      if (Object.hasOwn(ref, 'input')) return boundInputs[ref.input];
      if (Object.hasOwn(ref, 'literal')) return emitLiteral(ref.literal);
      return compileNode(ref.node);
    }
    function compileNode(id) {
      if (memo.has(id)) return memo.get(id);
      const node = nodes.get(id);
      const contract = registry.resolve(node.uses);
      const args = Object.fromEntries(Object.keys(contract.inputs).map(key => [key, expression(node.args[key])]));
      let snippet;
      if (contract.kind === 'composite') {
        snippet = compileExpression(contract.graph, args, nextStack);
      } else if (typeof contract.emitJS === 'function') {
        snippet = contract.emitJS(args);
      } else {
        fail('UNSUPPORTED_TARGET', `${contract.id}: missing pure JS implementation for standalone target`);
      }
      const value = `__v${nextValue++}`;
      statements.push(`  const ${value} = ${snippet};`);
      statements.push(`  __assertType(${value}, ${JSON.stringify(contract.output)}, ${JSON.stringify('result of ' + contract.id)});`);
      memo.set(id, value);
      return value;
    }
    for (const id of currentGraph.sequence ?? []) compileNode(id);
    return expression(currentGraph.returns);
  }

  validateGraph(graph, registry);
  const bindings = Object.fromEntries(Object.keys(graph.inputs).map(name => [name, `inputs[${JSON.stringify(name)}]`]));
  const result = compileExpression(graph, bindings, []);
  const checks = Object.entries(graph.inputs).flatMap(([key, spec]) => [
    `  if (!Object.hasOwn(inputs, ${JSON.stringify(key)})) __fail('MISSING_INPUT', ${JSON.stringify('Missing input ' + key)});`,
    `  __assertType(inputs[${JSON.stringify(key)}], ${JSON.stringify(spec.type)}, ${JSON.stringify('inputs.' + key)});`
  ]);
  const inputNames = JSON.stringify(Object.keys(graph.inputs));
  return `// EMS reference output. Standalone JavaScript, NO EMS runtime dependency.
// Pure finite-number profile; trusted implementations only.
function __fail(code, message, details = {}) {
  const error = new Error(message);
  error.name = 'EmsError'; error.code = code; error.details = details;
  throw error;
}
function __type(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return 'Number';
  if (typeof value === 'boolean') return 'Boolean';
  if (typeof value === 'string') return 'String';
  if (Array.isArray(value) && Array.from(value).every(x => typeof x === 'number' && Number.isFinite(x))) return 'NumberArray';
  return 'Unknown';
}
function __assertType(value, expected, context) {
  const received = __type(value);
  if (received !== expected) __fail('TYPE_MISMATCH', context + ': expected ' + expected + ', got ' + received, { expected, received, context });
}
function __divide(a,b) { if (b === 0) __fail('DIV_BY_ZERO', 'Division by zero'); return a / b; }
function __min(a) { if (!a.length) __fail('EMPTY_ARRAY', 'core.min: empty list'); return a.reduce((x,y)=>Math.min(x,y),Infinity); }
function __max(a) { if (!a.length) __fail('EMPTY_ARRAY', 'core.max: empty list'); return a.reduce((x,y)=>Math.max(x,y),-Infinity); }
export function execute(inputs) {
  if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) __fail('INVALID_INPUT', 'Input values must be an object');
${checks.join('\n')}
  for (const key of Object.keys(inputs)) if (!${inputNames}.includes(key)) __fail('EXTRA_INPUT', 'Unexpected input ' + key);
${statements.join('\n')}
  const result = ${result};
  __assertType(result, ${JSON.stringify(graph.output.type)}, 'graph result');
  return result;
}
`;
}

function emitLiteral(value) {
  if (typeof value === 'number' && Object.is(value, -0)) return '-0';
  if (Array.isArray(value)) return `[${value.map(emitLiteral).join(',')}]`;
  return JSON.stringify(value);
}

/** Packaging declaration deliberately excludes the internal graph: atomicity != DRM. */
export function compiledAtomicManifest(graph) {
  return {
    schemaVersion: '0.1', id: graph.id, version: graph.version,
    kind: 'atomic', sourceVisibility: 'opaque',
    inputs: Object.fromEntries(Object.entries(graph.inputs).map(([k,v]) => [k, v.type])),
    output: graph.output.type, effects: [], capabilities: [],
    implementationBinding: { kind: 'esm', entry: './module.mjs', symbol: 'execute', trustedOnly: true },
    notes: 'Opaque to EMS visual editor. Executable bytecode/JS remains reverse engineerable.'
  };
}
