import { Registry, createCoreRegistry } from '../reference/registry.mjs';
import { validateGraph, validateRuntimeInputs } from '../reference/validate.mjs';
import { assertValueType } from '../reference/types.mjs';
import { analyzeGraphEffects } from '../semantics/effects.mjs';
import { fail } from '../reference/errors.mjs';
import { lowerGraphToIR, serializeIR, parseIR, graphFromIR, executeIR, compileIRToJS, CORE_PROFILE, EFFECT_PROFILE } from '../ir/index.mjs';

export const defaultValue = type => ({ Number: 0, String: '', Boolean: false, NumberArray: [] })[type];
const namePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const clone = value => structuredClone(value);
function fields(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Reflect.ownKeys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key)))
    fail('INVALID_PROJECT', 'Unexpected project fields');
}
export function newProject(id = 'main', name = 'Новый проект') {
  return { id, name, graph: { schemaVersion: '0.1', id: 'project.main', version: '1.0.0', inputs: {}, output: { type: 'Number' }, nodes: [], returns: { literal: 0 } },
    inputs: {}, canvas: { positions: {}, view: { x: 0, y: 0, scale: 1 } }, contracts: [] };
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
export function projectRegistry(project, base = createCoreRegistry()) {
  const registry = new Registry(); for (const [id,item] of base.items) registry.items.set(id,item);
  const contracts = project.contracts ?? [];
  if (!Array.isArray(contracts) || contracts.length > 50 || Object.keys(contracts).length !== contracts.length) fail('PROJECT_LIMIT','Invalid composite collection');
  for (const descriptor of contracts) {
    fields(descriptor,['graph','inputs','canvas']);
    if(descriptor.graph?.id===project.graph?.id)fail('DUPLICATE_CONTRACT','Composite conflicts with entry graph');
    registry.registerComposite({id:descriptor.graph.id,version:descriptor.graph.version,graph:descriptor.graph});
  }
  const visited=new Map(),active=new Set();
  function visit(id) {
    if(visited.has(id))return visited.get(id);
    if(active.has(id)||active.size>=32)fail('RECURSIVE_COMPOSITE','Composite dependency cycle/depth');
    active.add(id);const item=registry.resolve(id);let cost=1;
    if(item.kind==='composite')for(const node of item.graph.nodes){cost+=visit(node.uses);if(cost>10000)fail('PROJECT_LIMIT','Composite expansion exceeds 10000 operations');}
    active.delete(id);visited.set(id,cost);return cost;
  }
  for(const descriptor of contracts)visit(descriptor.graph.id);
  let entryCost=1;for(const node of project.graph?.nodes??[]){entryCost+=visit(node.uses);if(entryCost>10000)fail('PROJECT_LIMIT','Entry expansion exceeds 10000 operations');}
  return registry;
}
export function workspaceProfile(graph,registry) {
 const policy=analyzeGraphEffects(graph,registry);
 if(policy.effects.length||policy.capabilities.length)fail('UNSUPPORTED_PROFILE','Studio graph requires pure contracts');
 const seen=new Set();function sequenced(current){if(Object.hasOwn(current,'sequence'))return true;for(const node of current.nodes){const item=registry.resolve(node.uses);if(item.kind==='composite'&&!seen.has(item.id)){seen.add(item.id);if(sequenced(item.graph))return true;}}return false;}
 return sequenced(graph)?EFFECT_PROFILE:CORE_PROFILE;
}
function validateWorkspace(workspace, registry) {
  validateGraph(workspace.graph,registry);
  if(workspace.graph.nodes.length>1000||Object.keys(workspace.graph.inputs).length>100)fail('PROJECT_LIMIT','Workspace too large');
  if(workspace.graph.nodes.some(node=>node.id==='output'||!namePattern.test(node.id))||Object.keys(workspace.graph.inputs).some(name=>!namePattern.test(name)))fail('INVALID_NAME','Invalid or reserved graph name');
  validateRuntimeInputs(workspace.graph,workspace.inputs);validateCanvas(workspace.canvas,workspace.graph);
  lowerGraphToIR(workspace.graph,registry,{profile:workspaceProfile(workspace.graph,registry)});
}
export function validateProject(project, base = createCoreRegistry()) {
  fields(project,Object.hasOwn(project,'contracts')?['id','name','graph','inputs','canvas','contracts']:['id','name','graph','inputs','canvas']);
  if(typeof project.id!=='string'||!namePattern.test(project.id)||typeof project.name!=='string'||!project.name.trim()||project.name.length>200)fail('INVALID_PROJECT','Invalid project identity');
  const registry=projectRegistry(project,base);
  validateWorkspace(project,registry);for(const descriptor of project.contracts??[])validateWorkspace(descriptor,registry);
  if([project,...(project.contracts??[])].reduce((count,workspace)=>count+workspace.graph.nodes.length,0)>1000)fail('PROJECT_LIMIT','Too many total nodes');
  return project;
}
const encodeNumber = value => Object.is(value, -0) ? '-0' : value;
function encodeInputs(project) {
  return Object.fromEntries(Object.entries(project.inputs).map(([name, value]) => [name,
    project.graph.inputs[name].type === 'Number' ? encodeNumber(value) : project.graph.inputs[name].type === 'NumberArray' ? value.map(encodeNumber) : value]));
}
function serializeWorkspace(workspace,registry) {
  return {ir:JSON.parse(serializeIR(lowerGraphToIR(workspace.graph,registry,{profile:workspaceProfile(workspace.graph,registry)}),registry)),inputs:encodeInputs(workspace),canvas:workspace.canvas};
}
export function serializeProject(project, base = createCoreRegistry()) {
  validateProject(project,base);const registry=projectRegistry(project,base),contracts=project.contracts??[];
  return JSON.stringify({schemaVersion:contracts.length?'ems-studio-project/2':'ems-studio-project/1',id:project.id,name:project.name,
    ...serializeWorkspace(project,registry),...(contracts.length?{contracts:[...contracts].sort((a,b)=>a.graph.id<b.graph.id?-1:a.graph.id>b.graph.id?1:0).map(workspace=>serializeWorkspace(workspace,registry))}:{})},null,2)+'\n';
}
function parseWorkspace(data,registry) {
  const graph=graphFromIR(parseIR(JSON.stringify(data.ir),registry),registry);
  if(!data.inputs||typeof data.inputs!=='object'||Array.isArray(data.inputs))fail('INVALID_PROJECT','Invalid inputs');
  const number=value=>value==='-0'?-0:value;
  const inputs=Object.fromEntries(Object.entries(data.inputs).map(([name,value])=>[name,graph.inputs[name]?.type==='Number'?number(value):graph.inputs[name]?.type==='NumberArray'&&Array.isArray(value)?value.map(number):value]));
  return {graph,inputs,canvas:data.canvas};
}
export function parseProject(source, base = createCoreRegistry()) {
  if(typeof source!=='string'||source.length>4*1024*1024)fail('PROJECT_LIMIT','Project file too large');
  let data;try{data=JSON.parse(source);}catch{fail('INVALID_PROJECT','Malformed project JSON');}
  if(!['ems-studio-project/1','ems-studio-project/2'].includes(data?.schemaVersion))fail('PROJECT_VERSION','Unsupported project schema');
  fields(data,['schemaVersion','id','name','ir','inputs','canvas',...(data.schemaVersion.endsWith('/2')?['contracts']:[])]);
  let registry=base;
  if(data.schemaVersion.endsWith('/2')) {
    if(!Array.isArray(data.contracts)||data.contracts.length>50||Object.keys(data.contracts).length!==data.contracts.length)fail('PROJECT_LIMIT','Invalid composite collection');
    const placeholders=data.contracts.map(descriptor=>{
      fields(descriptor,['ir','inputs','canvas']);const ir=descriptor.ir;
      if(!ir||ir.schemaVersion!=='ems-ir/1'||!['ems-core-finite/1','ems-effects-finite/1'].includes(ir.profile)||!Array.isArray(ir.inputs))fail('UNSUPPORTED_PROFILE','Composite project requires finite core IR');
      return {graph:{schemaVersion:'0.1',id:ir.id,version:ir.version,inputs:Object.fromEntries(ir.inputs.map(input=>[input.name,{type:input.type}])),output:ir.output,nodes:[],returns:{literal:defaultValue(ir.output?.type)}},inputs:descriptor.inputs,canvas:descriptor.canvas};
    });
    registry=projectRegistry({graph:{id:data.ir?.id},contracts:placeholders},base);
  }
  const project={id:data.id,name:data.name,...parseWorkspace(data,registry),contracts:(data.contracts??[]).map(descriptor=>parseWorkspace(descriptor,registry))};
  return validateProject(project,base);
}

/** Transactional graph editing. Every accepted edit still passes the ordinary core validator. */
export class ProjectEditor {
  constructor(project = newProject(), registry = createCoreRegistry()) {
    this.baseRegistry=registry; this.project=clone({...validateProject(project,registry),contracts:project.contracts??[]}); this.registry=projectRegistry(this.project,registry); this.selectedContract=null; this.navigation=[]; this.history=[]; this.future=[];
  }
  edit(change) {
    const next = clone(this.project); change(next); validateProject(next, this.baseRegistry);
    this.history.push(clone(this.project)); if (this.history.length > 100) this.history.shift();
    this.project=clone(next); this.registry=projectRegistry(this.project,this.baseRegistry); this.future=[]; this.ensureSelection(); return this.project;
  }
  undo() { if (!this.history.length) return false; this.future.push(this.project); this.project = this.history.pop(); this.registry=projectRegistry(this.project,this.baseRegistry);this.ensureSelection();return true; }
  redo() { if (!this.future.length) return false; this.history.push(this.project); this.project = this.future.pop();this.registry=projectRegistry(this.project,this.baseRegistry);this.ensureSelection();return true; }
  get workspace() {return this.selectedContract?this.project.contracts.find(item=>item.graph.id===this.selectedContract):this.project;}
  ensureSelection() {if(this.selectedContract&&!this.project.contracts.some(item=>item.graph.id===this.selectedContract)){this.selectedContract=null;this.navigation=[];}}
  editWorkspace(change) {return this.edit(project=>change(this.selectedContract?project.contracts.find(item=>item.graph.id===this.selectedContract):project));}
  createComposite(id) {
    if(typeof id!=='string'||!/^[-A-Za-z0-9_.]+$/.test(id))fail('INVALID_ID','Invalid composite id');
    const snapshot=clone(this.workspace);snapshot.graph.id=id;snapshot.graph.version='1.0.0';
    this.edit(project=>project.contracts.push({graph:snapshot.graph,inputs:snapshot.inputs,canvas:snapshot.canvas}));return id;
  }
  openContract(id) {
    if(!this.project.contracts.some(item=>item.graph.id===id))fail('ATOMIC_CONTRACT','Atomic contracts have no editable EMS graph');
    this.navigation.push(this.selectedContract);this.selectedContract=id;
  }
  collapse() {if(!this.navigation.length)return false;this.selectedContract=this.navigation.pop();this.ensureSelection();return true;}
  main() {this.selectedContract=null;this.navigation=[];}
  removeComposite(id) {
    this.edit(project=>{if(!project.contracts.some(item=>item.graph.id===id))fail('MISSING_CONTRACT','Unknown composite');project.contracts=project.contracts.filter(item=>item.graph.id!==id);});
  }
  compile() {return compileIRToJS(lowerGraphToIR(this.workspace.graph,this.registry,{profile:workspaceProfile(this.workspace.graph,this.registry)}),this.registry);}
  addNode(contractId) {
    const contract = this.registry.resolve(contractId); let index = 1;
    while (this.workspace.graph.nodes.some(node => node.id === `n${index}`) || Object.hasOwn(this.workspace.graph.inputs, `n${index}`)) index++;
    const id = `n${index}`;
    this.editWorkspace(project => {
      project.graph.nodes.push({ id, uses: contractId, args: Object.fromEntries(Object.entries(contract.inputs).map(([name, type]) => [name, { literal: defaultValue(typeof type === 'string' ? type : type.type) }])) });
      if(Object.hasOwn(project.graph,'sequence'))project.graph.sequence.push(id);
      project.canvas.positions[id] = { x: 280 + ((index-1) % 2) * 250, y: 70 + Math.floor((index-1)/2) * 160 };
    }); return id;
  }
  addInput(name, type, value = defaultValue(type)) {
    if (!namePattern.test(name)) fail('INVALID_NAME', 'Input name must be an identifier');
    this.editWorkspace(project => {
      if (Object.hasOwn(project.graph.inputs, name) || project.graph.nodes.some(node => node.id === name)) fail('DUPLICATE_NODE', 'Name already used');
      Object.defineProperty(project.graph.inputs, name, {value:{type},enumerable:true,configurable:true,writable:true});
      Object.defineProperty(project.inputs, name, {value,enumerable:true,configurable:true,writable:true});
      project.canvas.positions[`input:${name}`] = { x: 40, y: 50 + Object.keys(project.graph.inputs).length * 120 };
    });
  }
  connect(ref, nodeId, port) {
    this.editWorkspace(project => {
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
    this.editWorkspace(project => {
      const node = project.graph.nodes.find(node => node.id === nodeId); if (!node || !Object.hasOwn(node.args, port)) fail('INVALID_PORT', 'Unknown argument');
      node.args[port] = { literal: value };
    });
  }
  disconnect(nodeId, port) {
    if (nodeId === 'output') return this.editWorkspace(project => { project.graph.returns = { literal: defaultValue(project.graph.output.type) }; });
    const node = this.workspace.graph.nodes.find(node => node.id === nodeId); if (!node) fail('UNKNOWN_NODE', 'Unknown node');
    const type = this.registry.resolve(node.uses).inputs[port]; if (!type) fail('INVALID_PORT', 'Unknown argument');
    return this.literal(nodeId, port, defaultValue(typeof type === 'string' ? type : type.type));
  }
  remove(id) {
    if(id==='output')fail('INVALID_NODE','Function output cannot be removed');
    this.editWorkspace(project => {
      const input = id.startsWith('input:') ? id.slice(6) : null;
      const matches = ref => input !== null ? ref.input === input : ref.node === id;
      if (input !== null) { delete project.graph.inputs[input]; delete project.inputs[input]; }
      else project.graph.nodes = project.graph.nodes.filter(node => node.id !== id);
      if(project.graph.sequence)project.graph.sequence=project.graph.sequence.filter(node=>node!==id);
      delete project.canvas.positions[id];
      for (const node of project.graph.nodes) for (const [port, ref] of Object.entries(node.args)) if (matches(ref)) {
        const type = this.registry.resolve(node.uses).inputs[port]; node.args[port] = { literal: defaultValue(typeof type === 'string' ? type : type.type) };
      }
      if (matches(project.graph.returns)) project.graph.returns = { literal: defaultValue(project.graph.output.type) };
    });
  }
  setInput(name, value) { this.editWorkspace(project => { if (!Object.hasOwn(project.inputs, name)) fail('UNKNOWN_INPUT', 'Unknown input'); assertValueType(value, project.graph.inputs[name].type, name); project.inputs[name] = value; }); }
  move(id, x, y) { this.editWorkspace(project => { project.canvas.positions[id] = { x, y }; }); }
  viewport(view) { this.editWorkspace(project => { project.canvas.view = view; }); }
  serialize() { return serializeProject(this.project, this.baseRegistry); }
  async run() {
    const project = clone(this.workspace), ir = parseIR(serializeIR(lowerGraphToIR(project.graph, this.registry,{profile:workspaceProfile(project.graph,this.registry)}), this.registry), this.registry);
    return executeIR(ir, project.inputs, this.registry);
  }
}
