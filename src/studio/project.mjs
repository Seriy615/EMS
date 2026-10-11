import { createCoreRegistry } from '../reference/registry.mjs';
import { validateGraph, validateRuntimeInputs } from '../reference/validate.mjs';
import { assertValueType } from '../reference/types.mjs';
import { fail } from '../reference/errors.mjs';
import { lowerGraphToIR, serializeIR, parseIR, graphFromIR, executeIR } from '../ir/index.mjs';

export const defaultValue = type => ({ Number: 0, String: '', Boolean: false, NumberArray: [] })[type];
const namePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const clone = value => structuredClone(value);
function fields(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Reflect.ownKeys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key)))
    fail('INVALID_PROJECT', 'Unexpected project fields');
}
export function newProject(id = 'main', name = 'Новый проект') {
  return { id, name, graph: { schemaVersion: '0.1', id: 'project.main', version: '1.0.0', inputs: {}, output: { type: 'Number' }, nodes: [], returns: { literal: 0 } },
    inputs: {}, canvas: { positions: {}, view: { x: 0, y: 0, scale: 1 } } };
}
function validateCanvas(canvas, graph) {
  fields(canvas, ['positions', 'view']); fields(canvas.view, ['x', 'y', 'scale']);
  if (![canvas.view.x, canvas.view.y, canvas.view.scale].every(Number.isFinite) || canvas.view.scale < 0.25 || canvas.view.scale > 2)
    fail('INVALID_PROJECT', 'Invalid viewport');
  const ids = new Set([...graph.nodes.map(node => node.id), ...Object.keys(graph.inputs).map(name => `input:${name}`), 'output']);
  if (!canvas.positions || typeof canvas.positions !== 'object' || Array.isArray(canvas.positions)) fail('INVALID_PROJECT', 'Invalid positions');
  for (const [id, position] of Object.entries(canvas.positions)) {
    fields(position, ['x', 'y']);
    if (!ids.has(id) || ![position.x, position.y].every(Number.isFinite) || Math.abs(position.x) > 100000 || Math.abs(position.y) > 100000)
      fail('INVALID_PROJECT', 'Invalid node position');
  }
}
export function validateProject(project, registry = createCoreRegistry()) {
  fields(project, ['id', 'name', 'graph', 'inputs', 'canvas']);
  if (typeof project.id !== 'string' || !namePattern.test(project.id) || typeof project.name !== 'string' || !project.name.trim() || project.name.length > 200)
    fail('INVALID_PROJECT', 'Invalid project identity');
  validateGraph(project.graph, registry);
  if (project.graph.nodes.length > 1000 || Object.keys(project.graph.inputs).length > 100) fail('PROJECT_LIMIT', 'Project too large');
  if (project.graph.nodes.some(node => node.id === 'output' || !namePattern.test(node.id)) || Object.keys(project.graph.inputs).some(name => !namePattern.test(name))) fail('INVALID_NAME', 'Invalid or reserved graph name');
  validateRuntimeInputs(project.graph, project.inputs); validateCanvas(project.canvas, project.graph);
  return project;
}
const encodeNumber = value => Object.is(value, -0) ? '-0' : value;
function encodeInputs(project) {
  return Object.fromEntries(Object.entries(project.inputs).map(([name, value]) => [name,
    project.graph.inputs[name].type === 'Number' ? encodeNumber(value) : project.graph.inputs[name].type === 'NumberArray' ? value.map(encodeNumber) : value]));
}
export function serializeProject(project, registry = createCoreRegistry()) {
  validateProject(project, registry);
  return JSON.stringify({ schemaVersion: 'ems-studio-project/1', id: project.id, name: project.name,
    ir: JSON.parse(serializeIR(lowerGraphToIR(project.graph, registry), registry)), inputs: encodeInputs(project), canvas: project.canvas }, null, 2) + '\n';
}
export function parseProject(source, registry = createCoreRegistry()) {
  if (typeof source !== 'string' || source.length > 4 * 1024 * 1024) fail('PROJECT_LIMIT', 'Project file too large');
  let data; try { data = JSON.parse(source); } catch { fail('INVALID_PROJECT', 'Malformed project JSON'); }
  fields(data, ['schemaVersion', 'id', 'name', 'ir', 'inputs', 'canvas']);
  if (data.schemaVersion !== 'ems-studio-project/1') fail('PROJECT_VERSION', 'Unsupported project schema');
  const graph = graphFromIR(parseIR(JSON.stringify(data.ir), registry), registry);
  if (!data.inputs || typeof data.inputs !== 'object' || Array.isArray(data.inputs)) fail('INVALID_PROJECT', 'Invalid inputs');
  const number = value => value === '-0' ? -0 : value;
  const inputs = Object.fromEntries(Object.entries(data.inputs).map(([name, value]) => [name,
    graph.inputs[name]?.type === 'Number' ? number(value) : graph.inputs[name]?.type === 'NumberArray' && Array.isArray(value) ? value.map(number) : value]));
  return validateProject({ id: data.id, name: data.name, graph, inputs, canvas: data.canvas }, registry);
}

/** Transactional graph editing. Every accepted edit still passes the ordinary core validator. */
export class ProjectEditor {
  constructor(project = newProject(), registry = createCoreRegistry()) {
    this.registry = registry; this.project = clone(validateProject(project, registry)); this.history = []; this.future = [];
  }
  edit(change) {
    const next = clone(this.project); change(next); validateProject(next, this.registry);
    this.history.push(clone(this.project)); if (this.history.length > 100) this.history.shift();
    this.project = clone(next); this.future = []; return this.project;
  }
  undo() { if (!this.history.length) return false; this.future.push(this.project); this.project = this.history.pop(); return true; }
  redo() { if (!this.future.length) return false; this.history.push(this.project); this.project = this.future.pop(); return true; }
  addNode(contractId) {
    const contract = this.registry.resolve(contractId); let index = 1;
    while (this.project.graph.nodes.some(node => node.id === `n${index}`) || Object.hasOwn(this.project.graph.inputs, `n${index}`)) index++;
    const id = `n${index}`;
    this.edit(project => {
      project.graph.nodes.push({ id, uses: contractId, args: Object.fromEntries(Object.entries(contract.inputs).map(([name, type]) => [name, { literal: defaultValue(typeof type === 'string' ? type : type.type) }])) });
      project.canvas.positions[id] = { x: 280 + ((index-1) % 2) * 250, y: 70 + Math.floor((index-1)/2) * 160 };
    }); return id;
  }
  addInput(name, type, value = defaultValue(type)) {
    if (!namePattern.test(name)) fail('INVALID_NAME', 'Input name must be an identifier');
    this.edit(project => {
      if (Object.hasOwn(project.graph.inputs, name) || project.graph.nodes.some(node => node.id === name)) fail('DUPLICATE_NODE', 'Name already used');
      Object.defineProperty(project.graph.inputs, name, {value:{type},enumerable:true,configurable:true,writable:true});
      Object.defineProperty(project.inputs, name, {value,enumerable:true,configurable:true,writable:true});
      project.canvas.positions[`input:${name}`] = { x: 40, y: 50 + Object.keys(project.graph.inputs).length * 120 };
    });
  }
  connect(ref, nodeId, port) {
    this.edit(project => {
      if (nodeId === 'output') {
        const type = Object.hasOwn(ref, 'input') ? project.graph.inputs[ref.input]?.type : this.registry.resolve(project.graph.nodes.find(node => node.id === ref.node)?.uses).output;
        project.graph.returns = ref; project.graph.output.type = type;
      } else {
        const node = project.graph.nodes.find(node => node.id === nodeId); if (!node || !Object.hasOwn(node.args, port)) fail('INVALID_PORT', 'Unknown destination port');
        node.args[port] = ref;
      }
    });
  }
  literal(nodeId, port, value) {
    this.edit(project => {
      const node = project.graph.nodes.find(node => node.id === nodeId); if (!node || !Object.hasOwn(node.args, port)) fail('INVALID_PORT', 'Unknown argument');
      node.args[port] = { literal: value };
    });
  }
  disconnect(nodeId, port) {
    if (nodeId === 'output') return this.edit(project => { project.graph.returns = { literal: defaultValue(project.graph.output.type) }; });
    const node = this.project.graph.nodes.find(node => node.id === nodeId); if (!node) fail('UNKNOWN_NODE', 'Unknown node');
    const type = this.registry.resolve(node.uses).inputs[port]; if (!type) fail('INVALID_PORT', 'Unknown argument');
    return this.literal(nodeId, port, defaultValue(typeof type === 'string' ? type : type.type));
  }
  remove(id) {
    if(id==='output')fail('INVALID_NODE','Function output cannot be removed');
    this.edit(project => {
      const input = id.startsWith('input:') ? id.slice(6) : null;
      const matches = ref => input !== null ? ref.input === input : ref.node === id;
      if (input !== null) { delete project.graph.inputs[input]; delete project.inputs[input]; }
      else project.graph.nodes = project.graph.nodes.filter(node => node.id !== id);
      delete project.canvas.positions[id];
      for (const node of project.graph.nodes) for (const [port, ref] of Object.entries(node.args)) if (matches(ref)) {
        const type = this.registry.resolve(node.uses).inputs[port]; node.args[port] = { literal: defaultValue(typeof type === 'string' ? type : type.type) };
      }
      if (matches(project.graph.returns)) project.graph.returns = { literal: defaultValue(project.graph.output.type) };
    });
  }
  setInput(name, value) { this.edit(project => { if (!Object.hasOwn(project.inputs, name)) fail('UNKNOWN_INPUT', 'Unknown input'); assertValueType(value, project.graph.inputs[name].type, name); project.inputs[name] = value; }); }
  move(id, x, y) { this.edit(project => { project.canvas.positions[id] = { x, y }; }); }
  viewport(view) { this.edit(project => { project.canvas.view = view; }); }
  serialize() { return serializeProject(this.project, this.registry); }
  async run() {
    const project = clone(this.project), ir = parseIR(serializeIR(lowerGraphToIR(project.graph, this.registry), this.registry), this.registry);
    return executeIR(ir, project.inputs, this.registry);
  }
}
