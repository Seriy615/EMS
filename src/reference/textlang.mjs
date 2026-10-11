import { fail } from './errors.mjs';
/** M0 tiny textual EMS subset: typed function-style SSA statements, no arbitrary JS evaluation. */
export function parseTextEMS(source) {
  const lines = source.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('//'));
  if (lines.length < 3) fail('SYNTAX', 'Too few lines');
  const header = /^contract\s+([A-Za-z][\w.]*)\s*\(([^)]*)\)\s*->\s*(Number|NumberArray|Boolean|String)\s*\{$/.exec(lines[0]);
  if (!header || lines.at(-1) !== '}') fail('SYNTAX', 'Expected contract NAME(arg: Type) -> Type { ... }');
  const inputs = {};
  if (header[2].trim()) for (const entry of header[2].split(',')) {
    const m = /^([A-Za-z_]\w*):\s*(Number\[\]|Number|Boolean|String)$/.exec(entry.trim());
    if (!m || inputs[m[1]]) fail('SYNTAX', `Invalid/duplicate parameter ${entry}`);
    inputs[m[1]] = { type: m[2] === 'Number[]' ? 'NumberArray' : m[2] };
  }
  const nodes = [];
  const defined = new Set(Object.keys(inputs));
  function atom(token) {
    const trimmed = token.trim();
    if (/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(trimmed)) return { literal: Number(trimmed) };
    if (/^[A-Za-z_]\w*$/.test(trimmed)) {
      if (!defined.has(trimmed)) fail('UNDEFINED_SYMBOL', `Unknown name ${trimmed}`);
      return Object.hasOwn(inputs, trimmed) ? { input: trimmed } : { node: trimmed };
    }
    fail('SYNTAX', `Unsupported argument ${trimmed}`);
  }
  let returns;
  for (const line of lines.slice(1, -1)) {
    const decl = /^let\s+([A-Za-z_]\w*)\s*=\s*([A-Za-z][\w.]*)\((.*)\)\s*;?$/.exec(line);
    if (decl) {
      const [, id, fn, rawArgs] = decl;
      if (defined.has(id)) fail('DUPLICATE_NODE', `Duplicate name ${id}`);
      const params = rawArgs.split(',').map(atom);
      const spec = { sum: ['values'], min: ['values'], max: ['values'], add: ['a','b'], sub: ['a','b'], mul: ['a','b'], div: ['a','b'] }[fn];
      if (!spec || spec.length !== params.length) fail('SYNTAX', `Unsupported call ${fn}/${params.length}`);
      nodes.push({ id, uses: `core.${fn}`, args: Object.fromEntries(spec.map((k, i) => [k, params[i]])) });
      defined.add(id);
    } else {
      const ret = /^return\s+([A-Za-z_]\w*)\s*;?$/.exec(line);
      if (!ret || returns || line !== lines.at(-2)) fail('SYNTAX', `Unsupported statement: ${line}`);
      returns = atom(ret[1]);
    }
  }
  if (!returns) fail('SYNTAX', 'Missing return statement');
  return { schemaVersion: '0.1', id: header[1], version: '0.1.0', inputs, output: { type: header[3] }, nodes, returns };
}
