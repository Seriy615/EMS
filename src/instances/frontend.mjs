import {flowValueSource} from '../contracts/flow-values.mjs';
import {instanceSlot} from './names.mjs';
import {validateInstanceModule} from './module.mjs';
import {parseEMSModule} from '../frontend/index.mjs';
import {typecheckModule} from '../frontend/check.mjs';
import {lowerCheckedModule} from '../frontend/lower.mjs';
import {createStateRegistry} from '../runtime/reactor.mjs';
import {canonicalFlowType,defaultFlowValue} from '../contracts/flow-values.mjs';
import {fail} from '../reference/errors.mjs';
const encode=name=>Array.from(name,c=>c.charCodeAt(0).toString(16).padStart(2,'0')).join('');
const bodyName=(instance,transition)=>'ems_body_i'+encode(instance)+'_t'+encode(transition);
const located=(kind,at,fields={})=>({kind,...fields,location:at.location});
const named=(name,at)=>located('NameExpression',at,{name});
const call=(id,args,at)=>located('CallExpression',at,{callee:named(id,at),arguments:args});
const qualified=node=>node.kind==='NameExpression'?node.name:node.kind==='MemberExpression'?qualified(node.value)+'.'+node.member:null;
function fn(name,parameters,output,body,at){return located('ContractDeclaration',at,{name,parameters,output,body,exported:false,external:false,async:false,typeParameters:[],requirements:[]});}
const resultBody=(value,at)=>located('Block',at,{statements:[located('ReturnStatement',at,{value})]});
/** Native state declarations lower to ordinary located AST and the existing control IR2. */
export function compileInstanceModule(source,base,{id='application',version='1.0.0'}={}){
 const ast=parseEMSModule(source),definitions=ast.declarations.filter(node=>node.kind==='StatefulContractDeclaration'),instances=ast.declarations.filter(node=>node.kind==='ContractInstanceDeclaration'),ordinary=ast.declarations.filter(node=>!['StatefulContractDeclaration','ContractInstanceDeclaration'].includes(node.kind));
 if(!definitions.length||!instances.length)fail('INSTANCE_DECLARATION','Declare a stateful contract and an instance');
 const declarations=new Map(),instanceNames=new Set();for(const node of ast.declarations){if(node.name.startsWith('ems_')||declarations.has(node.name))fail('DUPLICATE_SYMBOL','Duplicate or reserved declaration',{location:node.location});declarations.set(node.name,node);}
 const prototypes=new Map(definitions.map(def=>[def.name,def]));
 const aliases=new Map(ordinary.filter(node=>node.kind==='TypeDeclaration').map(node=>[node.name,node]));
 const substitute=(syntax,bindings)=>bindings.get(syntax.name)??({...syntax,arguments:syntax.arguments.map(argument=>substitute(argument,bindings))});
 const canonical=(syntax,bindings=new Map(),stack=[])=>{if(stack.length>32)fail('TYPE_LIMIT','Instance type expansion exceeds32');if(bindings.has(syntax.name))return canonical(bindings.get(syntax.name),new Map(),stack);const alias=aliases.get(syntax.name);if(alias){if(stack.includes(alias.name))fail('RECURSIVE_TYPE','Recursive instance type alias');if(alias.typeParameters.length!==syntax.arguments.length)fail('TYPE_ARITY','Invalid alias arguments');return canonical(alias.value,new Map(alias.typeParameters.map((name,i)=>[name,substitute(syntax.arguments[i],bindings)])),[...stack,alias.name]);}return canonicalFlowType(syntax.name+(syntax.arguments.length?'<'+syntax.arguments.map(arg=>canonical(arg,bindings,stack)).join(',')+'>':''));};
 for(const def of definitions){for(const [values,where]of [[def.fields,'field'],[def.transitions,'transition']]){const seen=new Set();for(const item of values){if(seen.has(item.name)||item.name==='self'||item.name.startsWith('ems_'))fail('DUPLICATE_SYMBOL','Duplicate or reserved '+where,{location:item.location});seen.add(item.name);}}}
 const slots=[],operations=new Map();for(const instance of instances){if(instance.name==='self'||instanceNames.has(instance.name)||!prototypes.has(instance.contract))fail('UNKNOWN_INSTANCE','Unknown or duplicate instance');instanceNames.add(instance.name);const def=prototypes.get(instance.contract);for(const field of def.fields)slots.push({id:instanceSlot(instance.name,field.name),type:canonical(field.type),initial:defaultFlowValue(canonical(field.type))});for(const action of def.transitions)operations.set(instance.name+'.'+action.name,bodyName(instance.name,action.name));}
 if(definitions.length>16||instances.length>16||slots.length>128||operations.size>128||definitions.some(def=>def.fields.length>32||def.transitions.length>32||def.invariants.length>32)||instances.reduce((count,instance)=>count+prototypes.get(instance.contract).invariants.length,0)>128)fail('INSTANCE_LIMIT','Instance declaration count exceeds profile limits');
 const registry=createStateRegistry(base,slots,'ems-reactor/2');
 function rewrite(node,instance,fields){
  if(!node||typeof node!=='object')return node;
  if(Array.isArray(node))return node.map(item=>rewrite(item,instance,fields));
  if(['LetDeclaration','UsingDeclaration','Parameter','BindingPattern'].includes(node.kind)&&node.name?.startsWith('ems_')||node.kind==='ForStatement'&&node.binding.startsWith('ems_'))fail('RESERVED_SYMBOL','Transition binding uses the instance linker namespace',{location:node.location});
  if(['LetDeclaration','UsingDeclaration','Parameter'].includes(node.kind)&&fields.has(node.name)||node.kind==='ForStatement'&&fields.has(node.binding)||node.kind==='BindingPattern'&&fields.has(node.name))fail('STATE_SHADOWING','A transition local cannot shadow a state field',{location:node.location});
  if(node.kind==='AssignmentExpression'&&node.left.kind==='NameExpression'&&fields.has(node.left.name))return call('state.'+instanceSlot(instance.name,node.left.name)+'.write',[rewrite(node.right,instance,fields)],node);
  if(node.kind==='NameExpression'&&fields.has(node.name))return call('state.'+instanceSlot(instance.name,node.name)+'.read',[],node);
  if(node.kind==='CallExpression'){let name=qualified(node.callee);if(name?.startsWith('self.'))name=instance.name+name.slice(4);const target=operations.get(name);if(target)return call(target,node.arguments.map(arg=>rewrite(arg,instance,fields)),node);}
  return Object.fromEntries(Object.entries(node).map(([key,value])=>[key,key==='location'?value:rewrite(value,instance,fields)]));
 }
 const bodies=[];for(const instance of instances){const def=prototypes.get(instance.contract),fields=new Set(def.fields.map(field=>field.name));for(const action of def.transitions)bodies.push(fn(bodyName(instance.name,action.name),action.parameters.map(p=>rewrite(p,instance,fields)),action.output,rewrite(action.body,instance,fields),action));}
 const moduleWith=(extra,state)=>({...ast,declarations:[...ordinary,...(state?bodies:[]),...extra]});
 const lower=(entry,extra=[],state=true)=>{const r=state?registry:base;return lowerCheckedModule(typecheckModule(moduleWith(extra,state),r),entry,r,{profile:'control'}).ir;};
 const actionEntries=instances.flatMap(instance=>prototypes.get(instance.contract).transitions.map(action=>({instance:instance.name,name:action.name,entry:bodyName(instance.name,action.name),declaration:action})));
 if(!actionEntries.length)fail('INSTANCE_DECLARATION','Module requires at least one transition');
 const rootSource='@ems_collect()->Boolean{'+actionEntries.map(item=>item.entry+'('+item.declaration.parameters.map(p=>flowValueSource(defaultFlowValue(canonical(p.type)),canonical(p.type))).join(',')+');').join('')+'return true;}',root=parseEMSModule(rootSource).declarations[0],program=lower('ems_collect',[root]);program.functions=program.functions.filter(fn=>fn.id!=='ems_collect');program.entry=actionEntries[0].entry;
 const definitionsOut=definitions.map((def,index)=>({id:def.name,version:'1.0.0',fields:def.fields.map((field,i)=>{const name='ems_initial_'+index+'_'+i;return {name:field.name,type:canonical(field.type),initializer:lower(name,[fn(name,[],field.type,resultBody(field.value,field),field)],false)};}),invariants:def.invariants.map((invariant,i)=>{const name='ems_invariant_'+index+'_'+i,parameters=def.fields.map(field=>located('Parameter',field,{name:field.name,type:field.type}));return {id:'invariant_'+i,program:lower(name,[fn(name,parameters,located('NamedType',invariant,{name:'Boolean',arguments:[]}),resultBody(invariant.value,invariant),invariant)],false)};}),transitions:def.transitions.map(action=>({name:action.name,inputs:action.parameters.map(p=>({name:p.name,type:canonical(p.type)})),output:{type:canonical(action.output)}}))}));
 const instancesOut=instances.map(instance=>{const def=prototypes.get(instance.contract),seen=new Set();return {id:instance.name,contract:def.name,version:'1.0.0',initials:instance.initials.map(initial=>{const field=def.fields.find(f=>f.name===initial.name);if(!field||seen.has(initial.name))fail('INVALID_INSTANCE_INITIAL','Unknown or duplicate initial field');seen.add(initial.name);const name='ems_override_'+encode(instance.name)+'_'+encode(field.name);return {field:field.name,program:lower(name,[fn(name,[],field.type,resultBody(initial.value,initial),initial)],false)};}),transitions:def.transitions.map(action=>({name:action.name,entry:bodyName(instance.name,action.name)}))};});
 const module={schemaVersion:'ems-instance-module/1',id,version,definitions:definitionsOut,instances:instancesOut,program};validateInstanceModule(module,base);return module;
}
