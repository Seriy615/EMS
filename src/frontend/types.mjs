import { fail } from '../reference/errors.mjs';

const arities = new Map([['Number', 0], ['Boolean', 0], ['String', 0], ['Array', 1], ['Option', 1],
  ['Result', 2], ['Map', 2], ['Set', 1], ['Future', 1], ['Stream', 1], ['ResourceHandle', 1],
  ['Tuple', { min: 0 }], ['Union', { min: 2 }]]);

/** Normalize located type syntax into structural type terms for the type-checking pass. */
export function normalizeType(syntax, parameters = new Set(), customTypes = new Map()) {
  const error = (code, message) => fail(code, message, { location: syntax?.location });
  if (!syntax || syntax.kind !== 'NamedType' || !Array.isArray(syntax.arguments)) error('UNKNOWN_TYPE', 'Expected named type syntax');
  const name = syntax.name === 'NumberArray' ? 'Array' : syntax.name;
  const arguments_ = syntax.name === 'NumberArray' && !syntax.arguments.length
    ? [{ kind: 'NamedType', name: 'Number', arguments: [] }] : syntax.arguments;
  if (parameters.has(name)) {
    if (arguments_.length) error('TYPE_ARITY', `Type parameter ${name} cannot take arguments`);
    return { kind: 'Variable', name };
  }
  const arity = arities.has(name) ? arities.get(name) : customTypes.get(name);
  if (arity === undefined) error('UNKNOWN_TYPE', `Unknown type ${name}`);
  if (typeof arity === 'number' ? arguments_.length !== arity : arguments_.length < arity.min)
    error('TYPE_ARITY', `${name} has invalid number of type arguments`);
  return { kind: 'Type', name, arguments: arguments_.map(argument => normalizeType(argument, parameters, customTypes)) };
}

/** Apply inferred substitutions without carrying source metadata into type identity. */
export function resolveType(term, substitutions = new Map()) {
  if (term.kind === 'Variable') {
    const replacement = substitutions.get(term.name);
    if (replacement?.kind === 'Variable' && replacement.name === term.name) return replacement;
    return replacement ? resolveType(replacement, substitutions) : term;
  }
  return { ...term, arguments: term.arguments.map(argument => resolveType(argument, substitutions)) };
}
function occurs(name, term, substitutions) {
  const resolved = resolveType(term, substitutions);
  return resolved.kind === 'Variable' ? resolved.name === name : resolved.arguments.some(argument => occurs(name, argument, substitutions));
}

/** Unify exact structural types and infer generic arguments; no numeric or collection coercions. */
export function unifyTypes(expected, actual, substitutions = new Map()) {
  const left = resolveType(expected, substitutions), right = resolveType(actual, substitutions);
  if (left.kind === 'Variable' && left.rigid) {
    if (right.kind === 'Variable' && !right.rigid) return unifyTypes(right, left, substitutions);
    if (right.kind === 'Variable' && right.rigid && left.name === right.name) return substitutions;
    fail('TYPE_MISMATCH', `Generic parameter ${left.name} is rigid`);
  }
  if (left.kind === 'Variable') {
    if (right.kind === 'Variable' && left.name === right.name) return substitutions;
    if (occurs(left.name, right, substitutions)) fail('RECURSIVE_TYPE', `Recursive generic substitution ${left.name}`);
    substitutions.set(left.name, right); return substitutions;
  }
  if (right.kind === 'Variable') return unifyTypes(right, left, substitutions);
  if (left.name !== right.name || left.arguments.length !== right.arguments.length ||
      JSON.stringify(left.fields) !== JSON.stringify(right.fields))
    fail('TYPE_MISMATCH', `Cannot unify ${typeName(left)} with ${typeName(right)}`);
  for (let index = 0; index < left.arguments.length; index++) unifyTypes(left.arguments[index], right.arguments[index], substitutions);
  return substitutions;
}
export function typeName(term) {
  if (term.kind === 'Variable') return term.name;
  return term.arguments.length ? `${term.name}<${term.arguments.map(typeName).join(',')}>` : term.name;
}
