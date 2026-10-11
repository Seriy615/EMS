import { fail } from '../reference/errors.mjs';
import { normalizeType, resolveType, unifyTypes, typeName } from './types.mjs';
import { checkModuleEffects } from './effects.mjs';

const term = (name, args = []) => ({ kind: 'Type', name, arguments: args });
const primitive = name => term(name);
const qualified = expression => expression.kind === 'NameExpression' ? expression.name
  : expression.kind === 'MemberExpression' ? `${qualified(expression.value)}.${expression.member}` : null;
function diagnostic(code, message, node) { fail(code, message, { location: node?.location }); }
function expectType(expected, actual, node, substitutions = new Map()) {
  if (expected.kind === 'Type' && expected.name === 'Union' && actual.kind !== 'Variable' && actual.name !== 'Union') {
    for (const candidate of expected.arguments) {
      const attempt = new Map(substitutions);
      try { unifyTypes(candidate, actual, attempt); for (const [key, value] of attempt) substitutions.set(key, value); return; }
      catch (error) { if (error.code !== 'TYPE_MISMATCH') throw error; }
    }
    diagnostic('TYPE_MISMATCH', `${typeName(actual)} is outside ${typeName(expected)}`, node);
  }
  try { unifyTypes(expected, actual, substitutions); }
  catch (error) { diagnostic(error.code, error.message, node); }
}

/** Check the located EMS AST; imports resolve only through explicitly supplied namespaces. */
export function typecheckModule(ast, registry, { imports = new Map(), maxTypeNodes = 20_000, maxExpressions = 100_000 } = {}) {
  if (ast?.schemaVersion !== 'ems-ast/1') fail('AST_VERSION', 'Expected ems-ast/1');
  const aliases = new Map(), declarations = new Map(), signatures = new Map(), namespaces = new Map();
  const types = new Map(), calls = new Map(), catchTypes = new Map();
  let nextCall = 0, typeNodes = 0, expressions = 0;
  for (const imported of ast.imports) {
    if (!imports.has(imported.source)) diagnostic('UNRESOLVED_IMPORT', `No binding for ${imported.source}`, imported);
    if (namespaces.has(imported.alias)) diagnostic('DUPLICATE_SYMBOL', `Duplicate import ${imported.alias}`, imported);
    namespaces.set(imported.alias, imports.get(imported.source));
  }
  for (const declaration of ast.declarations) {
    if (declarations.has(declaration.name) || namespaces.has(declaration.name)) diagnostic('DUPLICATE_SYMBOL', `Duplicate declaration ${declaration.name}`, declaration);
    declarations.set(declaration.name, declaration);
    if (declaration.kind === 'TypeDeclaration') aliases.set(declaration.name, declaration);
  }
  function type(syntax, parameters = new Set(), stack = []) {
    if (++typeNodes > maxTypeNodes) diagnostic('TYPE_LIMIT', 'Type expansion exceeds configured budget', syntax);
    if (parameters.has(syntax.name)) return { ...normalizeType(syntax, parameters), rigid: true };
    const alias = aliases.get(syntax.name);
    if (alias) {
      if (stack.includes(alias.name)) diagnostic('RECURSIVE_TYPE', `Recursive type alias ${alias.name}`, syntax);
      if (syntax.arguments.length !== alias.typeParameters.length) diagnostic('TYPE_ARITY', `Wrong arity for ${alias.name}`, syntax);
      const body = type(alias.value, new Set(alias.typeParameters), [...stack, alias.name]);
      const substitutions = new Map(alias.typeParameters.map((name, index) => [name, type(syntax.arguments[index], parameters, stack)]));
      const substitute = term => term.kind === 'Variable' ? substitutions.get(term.name) ?? term
        : { ...term, arguments: term.arguments.map(substitute) };
      return substitute(body);
    }
    const shell = normalizeType({ ...syntax, arguments: syntax.arguments.map(argument => ({ kind: 'NamedType', name: 'Number', arguments: [], location: argument.location })) }, parameters);
    return { ...shell, arguments: syntax.name === 'NumberArray' ? [primitive('Number')] : syntax.arguments.map(argument => type(argument, parameters, stack)) };
  }
  for (const alias of aliases.values()) {
    if (new Set(alias.typeParameters).size !== alias.typeParameters.length) diagnostic('DUPLICATE_SYMBOL', 'Duplicate type parameter', alias);
    type(alias.value, new Set(alias.typeParameters), [alias.name]);
  }
  for (const declaration of ast.declarations) {
    if (declaration.kind === 'TypeDeclaration') continue;
    const parameters = new Set(declaration.typeParameters), names = new Set();
    if (parameters.size !== declaration.typeParameters.length) diagnostic('DUPLICATE_SYMBOL', 'Duplicate type parameter', declaration);
    const inputs = declaration.parameters.map(parameter => {
      if (names.has(parameter.name)) diagnostic('DUPLICATE_SYMBOL', `Duplicate parameter ${parameter.name}`, parameter);
      names.add(parameter.name); return { name: parameter.name, type: type(parameter.type, parameters) };
    });
    signatures.set(declaration.name, { name: declaration.name, parameters: declaration.typeParameters, inputs,
      output: type(declaration.output, parameters), async: declaration.async, declaration });
  }
  function signature(name, at) {
    if (signatures.has(name)) return signatures.get(name);
    const [prefix, ...rest] = name.split('.');
    const resolved = namespaces.has(prefix) ? `${namespaces.get(prefix)}.${rest.join('.')}` : name;
    const id = ['add','sub','mul','div','sum','min','max'].includes(resolved) ? `core.${resolved}` : resolved;
    let contract;
    try { contract = registry.resolve(id); } catch { diagnostic('UNKNOWN_SYMBOL', `Unknown callable ${name}`, at); }
    const syntax = typeName_ => ({ kind: 'NamedType', name: typeName_, arguments: [], location: at.location });
    return { name: id, parameters: [], inputs: Object.entries(contract.inputs).map(([name, spec]) => ({ name, type: type(syntax(typeof spec === 'string' ? spec : spec.type)) })),
      output: contract.kind==='resource'?term('ResourceHandle',[type(syntax(contract.valueType))]):type(syntax(contract.output)), async: false, contract };
  }
  function expression(node, scope, context, expected = null) {
    if (++expressions > maxExpressions) diagnostic('TYPE_LIMIT', 'Expression checking exceeds configured budget', node);
    let result;
    switch (node.kind) {
      case 'GroupExpression': result = expression(node.value, scope, context, expected); break;
      case 'LiteralExpression': result = primitive(typeof node.value === 'number' ? 'Number' : typeof node.value === 'boolean' ? 'Boolean' : 'String'); break;
      case 'NameExpression': {
        const binding = scope.get(node.name);
        if (!binding) diagnostic('UNKNOWN_SYMBOL', `Unknown name ${node.name}`, node);
        result = binding.type; break;
      }
      case 'ArrayExpression': {
        const hint = expected?.name === 'Array' ? expected.arguments[0] : null;
        if (!node.elements.length && !hint) diagnostic('CANNOT_INFER', 'Empty array requires an element type', node);
        const elements = node.elements.map(element => expression(element, scope, context, hint));
        const element = hint ?? elements[0];
        for (const actual of elements) expectType(element, actual, node);
        result = term('Array', [element]); break;
      }
      case 'RecordExpression': {
        const names = new Set(), fields = [], values = [];
        for (const field of node.fields) {
          if (names.has(field.name)) diagnostic('DUPLICATE_SYMBOL', `Duplicate field ${field.name}`, field);
          names.add(field.name); fields.push(field.name); values.push(expression(field.value, scope, context));
        }
        result = { ...term('Record', values), fields }; break;
      }
      case 'MemberExpression': {
        const owner = expression(node.value, scope, context);
        const index = owner.fields?.indexOf(node.member) ?? -1;
        if (owner.name !== 'Record' || index < 0) diagnostic('UNKNOWN_MEMBER', `No field ${node.member}`, node);
        result = owner.arguments[index]; break;
      }
      case 'IndexExpression': {
        const owner = expression(node.value, scope, context);
        expectType(primitive('Number'), expression(node.index, scope, context), node.index);
        if (owner.name !== 'Array') diagnostic('TYPE_MISMATCH', 'Indexing requires Array', node);
        result = owner.arguments[0]; break;
      }
      case 'UnaryExpression': {
        const actual = expression(node.value, scope, context);
        if (node.operator === 'await') {
          if (!context.async) diagnostic('INVALID_AWAIT', 'await requires async function', node);
          if (actual.name !== 'Future') diagnostic('TYPE_MISMATCH', 'await requires Future', node);
          result = actual.arguments[0];
        } else {
          result = primitive(node.operator === '!' ? 'Boolean' : 'Number'); expectType(result, actual, node.value);
        }
        break;
      }
      case 'BinaryExpression': {
        const left = expression(node.left, scope, context), right = expression(node.right, scope, context);
        if (['&&','||'].includes(node.operator)) {
          expectType(primitive('Boolean'), left, node.left); expectType(primitive('Boolean'), right, node.right); result = primitive('Boolean');
        } else if (['==','!='].includes(node.operator)) {
          expectType(left, right, node); result = primitive('Boolean');
        } else {
          expectType(primitive('Number'), left, node.left); expectType(primitive('Number'), right, node.right);
          result = primitive(['<','<=','>','>='].includes(node.operator) ? 'Boolean' : 'Number');
        }
        break;
      }
      case 'AssignmentExpression': {
        if (node.left.kind !== 'NameExpression') diagnostic('UNSUPPORTED_ASSIGNMENT', 'Only named mutable bindings can be assigned in this profile', node);
        const binding = scope.get(node.left.name);
        if (!binding) diagnostic('UNKNOWN_SYMBOL', `Unknown name ${node.left.name}`, node.left);
        if (!binding.mutable) diagnostic('IMMUTABLE_ASSIGNMENT', `Cannot assign ${node.left.name}`, node.left);
        result = expression(node.right, scope, context, binding.type); expectType(binding.type, result, node); break;
      }
      case 'CallExpression': {
        const name = qualified(node.callee);
        if (!name) diagnostic('UNSUPPORTED_CALL', 'Callable must have a declared qualified name', node.callee);
        if(['resource.cell','resource.read','resource.write','resource.close','resource.isClosed'].includes(name) && !signatures.has(name)) {
          const operation=name.slice(9),arity=operation==='write'?2:1;
          if(node.arguments.length!==arity)diagnostic('CALL_ARITY','Wrong resource operation arity',node);
          if(operation==='cell')result=term('ResourceHandle',[expression(node.arguments[0],scope,context,expected?.name==='ResourceHandle'?expected.arguments[0]:null)]);
          else { const resource=expression(node.arguments[0],scope,context);if(resource.name!=='ResourceHandle')diagnostic('TYPE_MISMATCH','Resource operation requires ResourceHandle',node);
            if(operation==='write')expectType(resource.arguments[0],expression(node.arguments[1],scope,context,resource.arguments[0]),node);
            result=['close','isClosed'].includes(operation)?primitive('Boolean'):resource.arguments[0];
          }
          calls.set(node,{resourceOperation:operation,output:result});break;
        }
        if (['stream.channel','stream.fromArray','stream.next','stream.send','stream.close'].includes(name) && !signatures.has(name)) {
          const operation = name.slice(7), arity = operation === 'send' ? 2 : 1;
          if (node.arguments.length !== arity) diagnostic('CALL_ARITY', 'Wrong stream operation arity', node);
          if (operation === 'channel') {
            if (expected?.name !== 'Stream') diagnostic('CANNOT_INFER', 'stream.channel requires expected Stream element type', node);
            expectType(primitive('Number'), expression(node.arguments[0], scope, context), node.arguments[0]); result = expected;
          } else if (operation === 'fromArray') {
            expectType(term('Array',[primitive('Number')]), expression(node.arguments[0],scope,context),node.arguments[0]); result = term('Stream',[primitive('Number')]);
          } else {
            const stream = expression(node.arguments[0],scope,context);
            if (stream.name !== 'Stream') diagnostic('TYPE_MISMATCH', 'Stream operation requires Stream',node.arguments[0]);
            if (operation === 'send') expectType(stream.arguments[0],expression(node.arguments[1],scope,context,stream.arguments[0]),node.arguments[1]);
            result = operation === 'next' ? term('Future',[term('Option',[stream.arguments[0]])]) : operation === 'send' ? term('Future',[primitive('Boolean')]) : primitive('Boolean');
          }
          calls.set(node,{streamOperation:operation,output:result}); break;
        }
        if (['Some', 'None', 'Ok', 'Err'].includes(name) && !signatures.has(name)) {
          const option = ['Some', 'None'].includes(name), empty = name === 'None';
          if (node.arguments.length !== (empty ? 0 : 1)) diagnostic('CALL_ARITY', `Wrong constructor arity ${name}`, node);
          const hint = expected?.name === (option ? 'Option' : 'Result') ? expected : null;
          if ((!option || empty) && !hint) diagnostic('CANNOT_INFER', `${name} requires contextual algebraic type`, node);
          if (empty) result = hint;
          else {
            const index = name === 'Err' ? 1 : 0;
            const value = expression(node.arguments[0], scope, context, hint?.arguments[index] ?? null);
            result = hint ?? term('Option', [value]);
          }
          calls.set(node, { algebraicConstructor: name, output: result });
          break;
        }
        const target = signature(name, node);
        if (scope.has(name)) diagnostic('UNSUPPORTED_CALL', 'Local callable values are not supported', node.callee);
        if (node.arguments.length !== target.inputs.length) diagnostic('CALL_ARITY', `Wrong number of arguments for ${name}`, node);
        const fresh = new Map(target.parameters.map(parameter => [parameter, { kind: 'Variable', name: `__call${nextCall}.${parameter}` }]));
        nextCall++;
        const substitutions = new Map(), output = resolveType(target.output, fresh);
        if (expected) expectType(expected, target.async ? term('Future', [output]) : output, node, substitutions);
        const inputs = target.inputs.map(input => resolveType(input.type, fresh));
        node.arguments.forEach((argument, index) => {
          const input = resolveType(inputs[index], substitutions);
          expectType(input, expression(argument, scope, context, input), argument, substitutions);
        });
        result = resolveType(output, substitutions);
        const unresolved = value => value.kind === 'Variable' ? value.name.startsWith('__call') : value.arguments.some(unresolved);
        if (unresolved(result)) diagnostic('CANNOT_INFER', `Cannot infer type arguments for ${name}`, node);
        if (target.async) result = term('Future', [result]);
        calls.set(node, { target, inputs: inputs.map(input => resolveType(input, substitutions)), output: result });
        break;
      }
      default: diagnostic('UNSUPPORTED_SYNTAX', `Cannot type-check ${node.kind}`, node);
    }
    if (expected) expectType(expected, result, node);
    types.set(node, result); return result;
  }
  function block(node, parentScope, context) {
    const scope = new Map(parentScope); let terminated = false;
    for (const statement of node.statements) {
      if (terminated) diagnostic('UNREACHABLE_CODE', 'Statement after unconditional exit', statement);
      switch (statement.kind) {
        case 'Block': terminated = block(statement, scope, context); break;
        case 'LetDeclaration': case 'UsingDeclaration': {
          if (scope.has(statement.name)) diagnostic('DUPLICATE_SYMBOL', `Duplicate local ${statement.name}`, statement);
          const expected = statement.type ? type(statement.type, context.parameters) : null;
          const actual = expression(statement.value, scope, context, expected);
          if(statement.kind==='UsingDeclaration' && statement.mutable)diagnostic('RESOURCE_OWNERSHIP','Using binding must be immutable',statement);
          if (statement.kind === 'UsingDeclaration' && actual.name !== 'ResourceHandle') diagnostic('TYPE_MISMATCH', 'using requires ResourceHandle', statement);
          scope.set(statement.name, { type: expected ?? actual, mutable: statement.mutable }); break;
        }
        case 'ReturnStatement': {
          if (!statement.value) diagnostic('TYPE_MISMATCH', 'A return value is required', statement);
          expectType(context.output, expression(statement.value, scope, context, context.output), statement);
          terminated = true; break;
        }
        case 'ThrowStatement': expression(statement.value, scope, context); terminated = true; break;
        case 'ExpressionStatement': expression(statement.value, scope, context); break;
        case 'IfStatement': {
          expectType(primitive('Boolean'), expression(statement.condition, scope, context), statement.condition);
          const yes = block(statement.then, scope, context);
          const no = statement.otherwise ? block(statement.otherwise.kind === 'Block' ? statement.otherwise : { statements: [statement.otherwise] }, scope, context) : false;
          terminated = yes && no; break;
        }
        case 'WhileStatement': {
          expectType(primitive('Boolean'), expression(statement.condition, scope, context), statement.condition);
          block(statement.body, scope, { ...context, loops: context.loops + 1 }); break;
        }
        case 'ForStatement': {
          const collection = expression(statement.iterable, scope, context);
          if (statement.asynchronous && !context.async) diagnostic('INVALID_AWAIT','for await requires async function',statement);
          if (collection.name !== (statement.asynchronous ? 'Stream' : 'Array')) diagnostic('TYPE_MISMATCH', statement.asynchronous ? 'for await requires Stream' : 'for requires Array', statement.iterable);
          const nested = new Map(scope); nested.set(statement.binding, { type: collection.arguments[0], mutable: false });
          block(statement.body, nested, { ...context, loops: context.loops + 1 }); break;
        }
        case 'BreakStatement': case 'ContinueStatement':
          if (!context.loops) diagnostic('INVALID_CONTROL', `${statement.kind} requires loop`, statement);
          terminated = true; break;
        case 'TryStatement': {
          const attempted = block(statement.body, scope, context); let handled = false;
          if (statement.handler) {
            if (!statement.handler.type) diagnostic('UNSUPPORTED_SYNTAX', 'Catch binding requires an explicit type in this profile', statement.handler);
            const handlerType = type(statement.handler.type, context.parameters); catchTypes.set(statement.handler, handlerType);
            const nested = new Map(scope); nested.set(statement.handler.binding, { type: handlerType, mutable: false });
            handled = block(statement.handler.body, nested, context);
          }
          const finalized = statement.finalizer ? block(statement.finalizer, scope, context) : false;
          terminated = finalized || (attempted && (!statement.handler || handled)); break;
        }
        case 'MatchStatement': {
          const value = expression(statement.value, scope, context);
          const variants = value.name === 'Option' ? new Map([['Some', [value.arguments[0]]], ['None', []]])
            : value.name === 'Result' ? new Map([['Ok', [value.arguments[0]]], ['Err', [value.arguments[1]]]]) : null;
          const covered = new Set(); let catchAll = false, exits = true;
          if (!statement.arms.length) diagnostic('NON_EXHAUSTIVE_MATCH', 'Empty match', statement);
          function pattern(node, actual, scope) {
            if (node.kind === 'WildcardPattern') return { total: true, complete: true };
            if (node.kind === 'BindingPattern') {
              const constructors = actual.name === 'Option' ? new Map([['Some', [actual.arguments[0]]], ['None', []]])
                : actual.name === 'Result' ? new Map([['Ok', [actual.arguments[0]]], ['Err', [actual.arguments[1]]]]) : null;
              if (constructors?.has(node.name)) {
                if (constructors.get(node.name).length) diagnostic('CALL_ARITY', `Constructor pattern ${node.name} requires payload`, node);
                return { total: false, complete: true };
              }
              if (scope.has(node.name)) diagnostic('DUPLICATE_SYMBOL', `Duplicate pattern binding ${node.name}`, node);
              scope.set(node.name, { type: actual, mutable: false }); return { total: true, complete: true };
            }
            if (node.kind === 'LiteralPattern') { expectType(actual, expression(node.value, scope, context), node); return { total: false, complete: false }; }
            if (node.kind !== 'ConstructorPattern') diagnostic('UNSUPPORTED_SYNTAX', 'Unknown pattern', node);
            const constructors = actual.name === 'Option' ? new Map([['Some', [actual.arguments[0]]], ['None', []]])
              : actual.name === 'Result' ? new Map([['Ok', [actual.arguments[0]]], ['Err', [actual.arguments[1]]]]) : null;
            const arguments_ = constructors?.get(node.name);
            if (!arguments_) diagnostic('TYPE_MISMATCH', `Constructor ${node.name} cannot match ${typeName(actual)}`, node);
            if (node.arguments.length !== arguments_.length) diagnostic('CALL_ARITY', `Wrong pattern arity ${node.name}`, node);
            let complete = true;
            node.arguments.forEach((argument, index) => { complete = pattern(argument, arguments_[index], scope).total && complete; });
            return { total: false, complete };
          }
          for (const arm of statement.arms) {
            if (catchAll) diagnostic('UNREACHABLE_CODE', 'Arm after catch-all pattern', arm);
            const nested = new Map(scope), coverage = pattern(arm.pattern, value, nested);
            const constructor = variants?.has(arm.pattern.name) ? arm.pattern.name : null;
            if (constructor && covered.has(constructor)) diagnostic('UNREACHABLE_CODE', `Constructor ${constructor} is already covered`, arm);
            if (constructor && coverage.complete) covered.add(constructor);
            else if (coverage.total) catchAll = true;
            if (arm.pattern.kind === 'LiteralPattern' && value.name === 'Boolean') covered.add(String(arm.pattern.value.value));
            exits = block(arm.body, nested, context) && exits;
          }
          const complete = catchAll || (variants && [...variants.keys()].every(key => covered.has(key))) ||
            (value.name === 'Boolean' && covered.has('true') && covered.has('false'));
          if (!complete) diagnostic('NON_EXHAUSTIVE_MATCH', 'Match does not cover every value', statement);
          terminated = exits; break;
        }
        default: diagnostic('UNSUPPORTED_SYNTAX', `Cannot check ${statement.kind}`, statement);
      }
    }
    return terminated;
  }
  for (const target of signatures.values()) {
    if (target.declaration.external) continue;
    const scope = new Map(target.inputs.map(input => [input.name, { type: input.type, mutable: false }]));
    const context = { output: target.output, parameters: new Set(target.parameters), async: target.async, loops: 0 };
    if (!block(target.declaration.body, scope, context)) diagnostic('MISSING_RETURN', `Not every path returns from ${target.name}`, target.declaration);
  }
  const checked = { ast, signatures, types, calls, catchTypes };
  checked.policies = checkModuleEffects(checked, registry);
  return checked;
}
