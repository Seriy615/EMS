import {authoredGraphsFor} from './authored-graphs.mjs';
import {createCoreRegistry} from '../reference/registry.mjs';
import {fail} from '../reference/errors.mjs';
import {uiSymbolSource} from '../frontend/index.mjs';
import {compileInstanceModule} from '../instances/frontend.mjs';
import {validateInstanceModule} from '../instances/module.mjs';
import {instanceSlot} from '../instances/names.mjs';
import {validateInstanceProject} from './instance-project.mjs';
import {parseFlowProject,serializeFlowProject,flowProjectOptions} from './flow-project.mjs';
import {compileContractFlow} from '../compiler/contract-flow.mjs';
import {canonicalFlowType,defaultFlowValue,flowValueSource,assertFlowValue} from '../contracts/flow-values.mjs';
import {richContractFlow,RICH_CONTRACT_FLOW_VERSION} from '../contracts/flow.mjs';
function visit(value,work){if(!value||typeof value!=='object')return;work(value);for(const child of Object.values(value))if(Array.isArray(child))child.forEach(item=>visit(item,work));else visit(child,work);}
function identity(name){if(typeof name!=='string'||name.length>200||!/^[_A-Za-z][_A-Za-z0-9]*$/.test(name)||uiSymbolSource(name)!==name||name==='self'||name.startsWith('ems_'))fail('INVALID_FIELD_NAME','Use a native field identifier outside reserved namespaces');}
function definition(project,id){const def=project.module.definitions.find(item=>item.id===id);if(!def)fail('UNKNOWN_INSTANCE','Unknown contract definition');return def;}
function member(project,id,name){const def=definition(project,id),field=def.fields.find(item=>item.name===name);if(!field)fail('UNKNOWN_STATE','Unknown contract field');return {def,field};}
function available(def,name){identity(name);if([...def.fields,...def.transitions].some(item=>item.name===name))fail('DUPLICATE_SYMBOL','Field conflicts with an existing field or operation');}
function initializer(type,value,base){assertFlowValue(value,type,'field initial',true);return compileInstanceModule('@Initial{value:'+type+'='+flowValueSource(value,type)+';+Read()->'+type+'{return value;}}@Initial #initial;',base).definitions[0].fields[0].initializer;}
function targets(project,contract,field){return new Map(project.module.instances.filter(item=>item.contract===contract).flatMap(instance=>['read','write'].map(action=>['state.'+instanceSlot(instance.id,field)+'.'+action,{instance:instance.id,field,action}])));}
function scopes(project){return [project,...(project.contracts??[])];}
/** Only references to the entry parameter count; loop/catch bindings may shadow its spelling. */
function readsParameter(fn,name){
 let used=false;function expression(value,active){if(!value||typeof value!=='object')return;if(value.kind==='local'&&value.name===name&&active)used=true;for(const item of Object.values(value))if(Array.isArray(item))item.forEach(child=>expression(child,active));else expression(item,active);}
 function pattern(value){let found=false;visit(value,item=>{if(item.kind==='binding'&&item.name===name)found=true;});return found;}
 function block(body,active){for(const statement of body){switch(statement.kind){
  case 'let':case 'using':expression(statement.value,active);if(statement.name===name)active=false;break;
  case 'for':expression(statement.iterable,active);block(statement.body,active&&statement.binding!==name);break;
  case 'try':block(statement.body,active);if(statement.handler)block(statement.handler.body,active&&statement.handler.binding!==name);if(statement.finalizer)block(statement.finalizer,active);break;
  case 'match':expression(statement.value,active);for(const arm of statement.arms)block(arm.body,active&&!pattern(arm.pattern));break;
  case 'block':block(statement.body,active);break;
  case 'if':expression(statement.condition,active);block(statement.then,active);block(statement.otherwise,active);break;
  case 'while':expression(statement.condition,active);block(statement.body,active);break;
  default:expression(statement,active);
 }} }
 block(fn.body,true);return used;
}
function callsRoot(program){let found=false;visit(program.functions,node=>{if(node.kind==='call'&&node.target.kind==='function'&&node.target.id===program.entry)found=true;});return found;}
function bindings(fn){const names=new Set();visit(fn.body,node=>{if(['let','using','binding'].includes(node.kind))names.add(node.name);if(node.kind==='for')names.add(node.binding);if(node.kind==='try'&&node.handler)names.add(node.handler.binding);});return names;}
/** Preserve the original body when a new parameter would capture a local or change recursive call arity. */
function adaptInvariant(program,fields,{rename=null,remove=null}={},base,graphs=[]){
 const next=structuredClone(program),entry=next.functions.find(fn=>fn.id===next.entry),locals=bindings(entry),old=entry.inputs,added=fields.filter(field=>!old.some(p=>p.name===field.name)&&(!rename||field.name!==rename.to)),bridge=added.some(field=>locals.has(field.name))||added.length&&callsRoot(next)||remove&&callsRoot(next)||rename&&(locals.has(rename.from)||locals.has(rename.to));
 const inputs=old.filter(port=>port.name!==remove?.name).map(port=>({name:port.name===rename?.from?rename.to:port.name,type:port.type}));for(const field of added)inputs.push({name:field.name,type:field.type});
 next.profile='ems-control-algebraic/1';
 if(!bridge){if(rename)visit(entry.body,node=>{if(node.kind==='local'&&node.name===rename.from)node.name=rename.to;});entry.inputs=inputs;for(const graph of graphs){if(graph.id===next.entry){graph.inputs=Object.fromEntries(inputs.map(port=>[port.name,{type:port.type}]));if(inputs.some(port=>port.type.includes('<'))&&!richContractFlow(graph))graph.schemaVersion=RICH_CONTRACT_FLOW_VERSION;if(rename)for(const node of graph.nodes)for(const ref of Object.values(node.args))if(ref.input===rename.from)ref.input=rename.to;}if(rename)for(const node of graph.nodes)if(node.uses===next.entry)node.args=renameKey(node.args,rename.from,rename.to);}return next;}
 const ids=new Set(next.functions.map(fn=>fn.id));let helper='ems_field_previous',index=0;while(ids.has(helper))helper='ems_field_previous_'+(++index);ids.add(helper);entry.id=helper;visit(next.functions,node=>{if(node.kind==='call'&&node.target.kind==='function'&&node.target.id===next.entry)node.target.id=helper;});
 const defaults=new Map();function constant(type){if(defaults.has(type))return structuredClone(defaults.get(type));const value=initializer(type,defaultFlowValue(type),base),names=new Map();for(const fn of value.functions){let id='ems_field_default_'+index++;while(ids.has(id))id='ems_field_default_'+index++;ids.add(id);names.set(fn.id,id);}const copied=structuredClone(value.functions);for(const fn of copied){fn.id=names.get(fn.id);visit(fn.body,node=>{if(node.kind==='call'&&node.target.kind==='function')node.target.id=names.get(node.target.id);});}next.functions.push(...copied);const expression={kind:'call',type,target:{kind:'function',id:names.get(value.entry)},arguments:[]};defaults.set(type,expression);return structuredClone(expression);}
 // Do not manufacture a state dependency merely to forward an unused parameter.
 const origin=graphs.find(graph=>graph.id===next.entry),readsOrigin=name=>origin?.nodes.some(node=>Object.values(node.args).some(ref=>ref.input===name));
 const args=old.map(port=>port.name===remove?.name||!readsParameter(entry,port.name)&&!readsOrigin(port.name)?constant(port.type):{kind:'local',name:port.name===rename?.from?rename.to:port.name,type:port.type});next.functions.push({id:next.entry,inputs,output:{type:'Boolean'},requirements:structuredClone(entry.requirements),policy:structuredClone(entry.policy),body:[{kind:'return',value:{kind:'call',type:'Boolean',target:{kind:'function',id:helper},arguments:args}}]});for(const graph of graphs){if(graph.id===next.entry)graph.id=helper;for(const node of graph.nodes)if(node.uses===next.entry)node.uses=helper;}return next;
}
function renameKey(record,from,to){return Object.fromEntries(Object.entries(record).map(([key,value])=>[key===from?to:key,value]));}
function changeInvariantGraph(flow,change,base){
 const project=parseFlowProject(flow,base),root=project.graph,port=change.rename?.from??change.remove,added=change.add;
 if(added){root.inputs[added.name]={type:added.type};project.inputs[added.name]=structuredClone(defaultFlowValue(added.type));project.canvas.positions['input:'+added.name]={x:40,y:40+Object.keys(root.inputs).length*120};if(added.type.includes('<')&&!richContractFlow(root))root.schemaVersion=RICH_CONTRACT_FLOW_VERSION;}
 if(change.rename){root.inputs=renameKey(root.inputs,port,change.rename.to);project.inputs=renameKey(project.inputs,port,change.rename.to);for(const node of root.nodes)for(const ref of Object.values(node.args))if(ref.input===port)ref.input=change.rename.to;for(const key of ['positions','descriptions'])project.canvas[key]=renameKey(project.canvas[key],'input:'+port,'input:'+change.rename.to);}
 if(change.remove){delete root.inputs[port];delete project.inputs[port];for(const key of ['positions','descriptions'])delete project.canvas[key]['input:'+port];}
 for(const workspace of scopes(project))for(const node of workspace.graph.nodes)if(node.uses===root.id){if(added){node.args[added.name]={literal:structuredClone(defaultFlowValue(added.type))};if(added.type.includes('<')&&!richContractFlow(workspace.graph))workspace.graph.schemaVersion=RICH_CONTRACT_FLOW_VERSION;}if(change.rename)node.args=renameKey(node.args,port,change.rename.to);if(change.remove)delete node.args[port];}
 const source=serializeFlowProject(project,base),program=compileContractFlow(root,base,flowProjectOptions(project)).ir;return {source,program};
}
function updateInvariants(original,next,contract,change,base){const def=definition(next,contract);for(const invariant of def.invariants){const saved=next.invariantGraphs.find(item=>item.contract===contract&&item.id===invariant.id);if(saved){const result=changeInvariantGraph(saved.flow,change,base);saved.flow=result.source;invariant.program=result.program;}else invariant.program=adaptInvariant(invariant.program,def.fields,{rename:change.rename,remove:change.remove?member(original,contract,change.remove).field:null},base,authoredGraphsFor(next,{kind:'invariant',definition:contract,id:invariant.id}));}}
/** Explicit declaration dependencies, including saved but currently uncalled graph definitions. */
export function instanceFieldDependencies(project,contract,name,base=createCoreRegistry()){
 validateInstanceProject(project,base);member(project,contract,name);const state=targets(project,contract,name),dependencies=[],seen=new Set(),add=value=>{if(dependencies.length>=256)return;const key=JSON.stringify(value);if(!seen.has(key)){seen.add(key);dependencies.push(value);}},checked=validateInstanceModule(project.module,base),functions=new Map(project.module.program.functions.map(fn=>[fn.id,fn]));
 const owners=new Map();for(const action of checked.transitions){const seen=new Set();function follow(id){if(seen.has(id))return;seen.add(id);const fn=functions.get(id);if(!fn)return;const list=owners.get(id)??[];list.push(action);owners.set(id,list);visit(fn.body,node=>{if(node.kind==='call'&&node.target.kind==='function')follow(node.target.id);});}follow(action.entry);}
 for(const fn of functions.values())visit(fn.body,node=>{if(node.kind!=='call'||node.target.kind!=='contract'||!state.has(node.target.id)||dependencies.length>=256)return;const field=state.get(node.target.id),uses=owners.get(fn.id)??[null];for(const action of uses)add({kind:'operation',function:fn.id,instance:action?.instance??field.instance,transition:action?.name??null,action:field.action,state:field.instance+'.'+field.field});});
 if(project.bodyGraph){const graph=parseFlowProject(project.bodyGraph,checked.registry,{allowState:true});for(const workspace of scopes(graph))for(const node of workspace.graph.nodes)if(state.has(node.uses))add({kind:'body-graph',graph:workspace.graph.id,node:node.id,...state.get(node.uses)});}
 for(const graph of authoredGraphsFor(project,{kind:'body'}))for(const node of graph.nodes)if(state.has(node.uses))add({kind:'body-graph',graph:graph.id,node:node.id,...state.get(node.uses)});
 for(const invariant of definition(project,contract).invariants){const saved=project.invariantGraphs.find(item=>item.contract===contract&&item.id===invariant.id);let used;if(saved){const graph=parseFlowProject(saved.flow,base);used=graph.graph.nodes.some(node=>Object.values(node.args).some(ref=>ref.input===name))||scopes(graph).some(workspace=>workspace.graph.nodes.some(node=>node.uses===graph.graph.id&&node.args[name]&&!Object.hasOwn(node.args[name],'literal')));}else used=readsParameter(invariant.program.functions.find(fn=>fn.id===invariant.program.entry),name)||authoredGraphsFor(project,{kind:'invariant',definition:contract,id:invariant.id}).some(graph=>graph.id===invariant.program.entry&&graph.nodes.some(node=>Object.values(node.args).some(ref=>ref.input===name))||graph.nodes.some(node=>node.uses===invariant.program.entry&&node.args[name]&&!Object.hasOwn(node.args[name],'literal')));if(used)add({kind:'invariant',contract,id:invariant.id,field:name});}
 const logical=new Set(project.module.instances.filter(item=>item.contract===contract).map(item=>item.id+'.'+name));if(project.ui)functionUI(project.ui.root);
 function functionUI(node){for(const [property,ref]of Object.entries(node.props))if(logical.has(ref.state))add({kind:'ui-property',widget:node.id,property,state:ref.state});for(const [event,ref]of Object.entries(node.events))for(const [input,binding]of Object.entries(ref.inputs))if(logical.has(binding.state))add({kind:'ui-input',widget:node.id,event,input,state:binding.state});node.children.forEach(functionUI);}
 return dependencies;
}
export function addInstanceField(project,contract,name,type,value,base=createCoreRegistry()){
 validateInstanceProject(project,base);const def=definition(project,contract);available(def,name);type=canonicalFlowType(type);const field={name,type,initializer:initializer(type,value,base)},next=structuredClone(project);definition(next,contract).fields.push(field);updateInvariants(project,next,contract,{add:field},base);validateInstanceProject(next,base);return next;
}
export function renameInstanceField(project,contract,from,to,base=createCoreRegistry()){
 validateInstanceProject(project,base);const {def}=member(project,contract,from);if(from===to)return structuredClone(project);available(def,to);const next=structuredClone(project),old=targets(project,contract,from),replacements=new Map([...old].map(([id,field])=>[id,'state.'+instanceSlot(field.instance,to)+'.'+field.action]));definition(next,contract).fields.find(field=>field.name===from).name=to;
 for(const instance of next.module.instances)if(instance.contract===contract)for(const initial of instance.initials)if(initial.field===from)initial.field=to;
 visit(next.module.program,node=>{if(node.kind==='call'&&node.target.kind==='contract'&&replacements.has(node.target.id))node.target.id=replacements.get(node.target.id);});updateInvariants(project,next,contract,{rename:{from,to}},base);
 if(next.bodyGraph){const graph=parseFlowProject(next.bodyGraph,validateInstanceModule(project.module,base).registry,{allowState:true});for(const workspace of scopes(graph))for(const node of workspace.graph.nodes)if(replacements.has(node.uses))node.uses=replacements.get(node.uses);next.bodyGraph=serializeFlowProject(graph,validateInstanceModule(next.module,base).registry,{allowState:true});}
 for(const graph of authoredGraphsFor(next,{kind:'body'}))for(const node of graph.nodes)if(replacements.has(node.uses))node.uses=replacements.get(node.uses);
 for(const record of next.authoredGraphs??[]){const scope=record.scope;if(scope.kind==='initializer'&&scope.definition===contract&&scope.field===from||scope.kind==='override'&&next.module.instances.some(instance=>instance.id===scope.instance&&instance.contract===contract)&&scope.field===from)scope.field=to;}
 if(next.ui){const logical=new Map(next.module.instances.filter(item=>item.contract===contract).map(instance=>[instance.id+'.'+from,instance.id+'.'+to]));function update(node){const refs=[...Object.values(node.props),...Object.values(node.events).flatMap(event=>Object.values(event.inputs))];for(const ref of refs)if(logical.has(ref.state))ref.state=logical.get(ref.state);node.children.forEach(update);}update(next.ui.root);}validateInstanceProject(next,base);return next;
}
export function removeInstanceField(project,contract,name,base=createCoreRegistry()){
 const dependencies=instanceFieldDependencies(project,contract,name,base);if(dependencies.length)fail('FIELD_IN_USE','Field is still connected to operations, invariants or UI',{contract,field:name,dependencies});const next=structuredClone(project);definition(next,contract).fields=definition(next,contract).fields.filter(field=>field.name!==name);for(const instance of next.module.instances)if(instance.contract===contract)instance.initials=instance.initials.filter(item=>item.field!==name);if(next.authoredGraphs)next.authoredGraphs=next.authoredGraphs.filter(({scope})=>!(scope.kind==='initializer'&&scope.definition===contract&&scope.field===name||scope.kind==='override'&&next.module.instances.some(instance=>instance.id===scope.instance&&instance.contract===contract)&&scope.field===name));updateInvariants(project,next,contract,{remove:name},base);validateInstanceProject(next,base);return next;
}
