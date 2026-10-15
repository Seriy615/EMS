import {parseEMSModule,uiSymbolSource} from '../frontend/index.mjs';
import {compileInstanceAST} from './frontend.mjs';
import {validateInstanceModule} from './module.mjs';
import {instanceUIBindings,validateInstanceUI} from './ui.mjs';
import {validateUITree} from '../ui/model.mjs';
import {defaultFlowValue} from '../contracts/flow-values.mjs';
import {createCoreRegistry} from '../reference/registry.mjs';
import {fail} from '../reference/errors.mjs';
const uiKinds={Column:'column',Row:'row',Text:'text',Button:'button',TextInput:'textInput',Checkbox:'checkbox'};
const declarationKinds=new Set(['UINodeDeclaration','UIEventBindingDeclaration','ApplicationDeclaration']);
function qualified(node){while(node.kind==='GroupExpression')node=node.value;if(node.kind==='NameExpression')return node.name;if(node.kind==='MemberExpression'){let value=node.value;while(value.kind==='GroupExpression')value=value.value;const base=value.kind==='LiteralExpression'&&typeof value.value==='string'?value.value:qualified(value);return base===null?null:base+'.'+node.member;}return null;}
function error(code,message,node){fail(code,message,{location:node?.location});}
function at(node,work){try{return work();}catch(e){e.details={...e.details,location:e.details?.location??node.location};throw e;}}
/** A closed value codec only: constructors contain data, never calls, arithmetic or host evaluation. */
function literal(node,depth=0){
 if(depth>64)error('UI_LIMIT','UI literal depth exceeds64',node);
 if(node.kind==='LiteralExpression')return node.value;
 if(node.kind==='GroupExpression')return literal(node.value,depth+1);
 if(node.kind==='UnaryExpression'&&['-','+'].includes(node.operator)){const value=literal(node.value,depth+1);if(typeof value!=='number')error('TYPE_MISMATCH','Numeric sign requires a Number literal',node);return node.operator==='-'?-value:value;}
 if(node.kind==='ArrayExpression')return node.elements.map(item=>literal(item,depth+1));
 if(node.kind==='CallExpression'){
  const name=qualified(node.callee),args=node.arguments;
  if(name==='None'&&args.length===0)return {tag:'None'};
  if(['Some','Ok','Err','Map'].includes(name)&&args.length===1)return {tag:name,value:literal(args[0],depth+1)};
 }
 error('UI_SOURCE_VALUE','UI values must be closed literals or field/event bindings; compute values in a contract',node);
}
function binding(node,format,{reactive=false,event=false}={}){
 const name=qualified(node);
 let expression=node;while(expression.kind==='GroupExpression')expression=expression.value;let receiver=expression.kind==='MemberExpression'?expression.value:null;while(receiver?.kind==='GroupExpression')receiver=receiver.value;const eventValue=expression.kind==='MemberExpression'&&expression.member==='value'&&receiver?.kind==='NameExpression'&&receiver.name==='event';
 if(eventValue){if(!event)error('UI_BINDING_TYPE','Event value is available only in event inputs',node);if(format)error('UI_BINDING_TYPE','Event value cannot use state formatting',node);return {value:true};}
 if(name?.split('.').length===2){if(!reactive&&!event)error('UI_SOURCE_BINDING','Use <= for reactive property bindings',node);return {state:name,...(format?{format}:{})};}
 if(reactive)error('UI_SOURCE_BINDING','Reactive property requires an instance field',node);
 if(format)error('UI_BINDING_TYPE','Formatting requires a state binding',node);
 return {literal:literal(node)};
}
function split(ast,{fragment=false}={}){
 if(fragment&&(ast.package||ast.imports.length))error('UI_SOURCE_SCOPE','UI fragments cannot declare packages or imports',ast);
 const apps=ast.declarations.filter(node=>node.kind==='ApplicationDeclaration');if(apps.length>1)error('UI_SOURCE_SCOPE','At most one application container',apps[1]);
 const declarations=ast.declarations.flatMap(node=>node.kind==='ApplicationDeclaration'?node.declarations:[node]);
 if(apps[0])for(const child of apps[0].declarations)if(!['ContractInstanceDeclaration','UINodeDeclaration','UIEventBindingDeclaration'].includes(child.kind))error('UI_SOURCE_SCOPE','Application contains static instances, UI nodes and event bindings',child);
 const core=declarations.filter(node=>!declarationKinds.has(node.kind)),ui=declarations.filter(node=>node.kind==='UINodeDeclaration'),events=declarations.filter(node=>node.kind==='UIEventBindingDeclaration');
 if(fragment&&core.length)error('UI_SOURCE_SCOPE','UI fragment cannot replace native contract declarations',core[0]);
 return {core,ui,events,application:apps[0],location:ast.location};
}
function lowerUI(parts,module,base){
 if(parts.ui.length!==1)error('UI_SOURCE_ROOT','Declare exactly one UI root',parts.ui[1]??parts.application??parts);
 const {fields,actions}=instanceUIBindings(module),slots=new Map(fields.map(field=>[field.id,{id:field.id,type:field.type,initial:defaultFlowValue(field.type)}])),handlers=new Map(actions.map(action=>[action.id,action.signature])),names=new Set(module.instances.map(item=>item.id)),nodes=new Map();
 function node(ast){
  const kind=Object.hasOwn(uiKinds,ast.contract.slice(3))?uiKinds[ast.contract.slice(3)]:null;if(!kind)error('UNSUPPORTED_UI','Unsupported semantic UI contract '+ast.contract,ast);
  if(names.has(ast.name)||nodes.has(ast.name))error('DUPLICATE_SYMBOL','UI and native instances require unique IDs',ast);
  const props=Object.create(null);for(const prop of ast.properties){const name=kind==='text'&&prop.name==='content'?'text':prop.name;if(Object.hasOwn(props,name))error('DUPLICATE_SYMBOL','Duplicate UI property '+name,prop);props[name]=binding(prop.value,prop.format,{reactive:prop.reactive});}
  const result={id:ast.name,kind,props:Object.fromEntries(Object.entries(props)),events:{},children:[]};nodes.set(ast.name,{node:result,ast});at(ast,()=>validateUITree({schemaVersion:'ems-ui/1',root:result},slots,handlers,{rich:true,stateVersion:'ems-reactor/2'}));result.children=ast.children.map(node);return result;
 }
 const root=node(parts.ui[0]);
 for(const route of parts.events){
  const target=nodes.get(route.widget);if(!target)error('UNKNOWN_UI_NODE','Event source is not a UI node',route);
  const event=route.event==='clicked'?'press':route.event;if(Object.hasOwn(target.node.events,event))error('DUPLICATE_SYMBOL','Duplicate UI event binding',route);
  const path=route.target.split('.');if(path.length!==2)error('UI_SOURCE_TARGET','Event target must be instance::Transition',route);
  const inputs=Object.create(null);for(const input of route.inputs){if(Object.hasOwn(inputs,input.name))error('DUPLICATE_SYMBOL','Duplicate event input '+input.name,input);inputs[input.name]=binding(input.value,input.format,{event:true});}
  const ref={handler:path.join('::'),inputs:Object.fromEntries(Object.entries(inputs))};at(route,()=>validateUITree({schemaVersion:'ems-ui/1',root:{...target.node,children:[],events:{[event]:ref}}},slots,handlers,{rich:true,stateVersion:'ems-reactor/2'}));target.node.events[event]=ref;
 }
 const ui={schemaVersion:'ems-ui/1',root};at(parts.ui[0],()=>validateInstanceUI(module,ui,base));return ui;
}
/** One parser and one semantic model: native UI syntax lowers to the existing module + UI artifact. */
export function compileInstanceSource(source,base=createCoreRegistry(),options={}){
 const ast=parseEMSModule(source),hasUI=ast.declarations.some(node=>declarationKinds.has(node.kind));if(!hasUI)return {module:compileInstanceAST(ast,base,options)};
 const parts=split(ast);if(parts.application&&parts.core.some(node=>node.name===parts.application.name))error('DUPLICATE_SYMBOL','Application name conflicts with another declaration',parts.application);
 const module=compileInstanceAST({...ast,declarations:parts.core},base,{...(parts.application?{id:parts.application.name}:{}),...options});return {module,ui:lowerUI(parts,module,base)};
}
/** Parse a UI-only fragment against current native definitions; existing implementation IR stays authoritative. */
export function compileInstanceUIFragment(source,module,base=createCoreRegistry()){
 validateInstanceModule(module,base);return lowerUI(split(parseEMSModule(source),{fragment:true}),module,base);
}
function valueSource(value){
 if(typeof value==='number')return Object.is(value,-0)?'-0':String(value);
 if(typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(valueSource).join(', ')+']';
 if(value?.tag==='None')return 'None()';
 if(['Some','Ok','Err','Map'].includes(value?.tag))return value.tag+'('+valueSource(value.value)+')';
 fail('UI_SOURCE_VALUE','Unsupported closed UI value');
}
/** Current UI has an exact text representation; native bodies are never reconstructed from an archived source. */
export function printInstanceUISource(module,ui,base=createCoreRegistry()){
 validateInstanceUI(module,ui,base);const names=Object.fromEntries(Object.entries(uiKinds).map(([name,kind])=>[kind,name])),routes=[];
 function ref(binding){if(Object.hasOwn(binding,'literal'))return valueSource(binding.literal);if(binding.value===true)return 'event.value';return binding.state.split('.').map((name,index)=>index===0&&name==='event'?JSON.stringify(name):uiSymbolSource(name)).join('.')+(binding.format?' as '+binding.format:'');}
 function node(value,depth){const pad='    '.repeat(depth),lines=[pad+'@UI.'+names[value.kind]+' #'+uiSymbolSource(value.id)+' {'];for(const [name,binding]of Object.entries(value.props))lines.push(pad+'    '+name+(Object.hasOwn(binding,'state')?' <= ':': ')+ref(binding)+';');for(const child of value.children)lines.push(node(child,depth+1));lines.push(pad+'}');for(const [event,binding]of Object.entries(value.events))routes.push(uiSymbolSource(value.id)+'.'+event+' ~> '+binding.handler.split('::').map(uiSymbolSource).join('::')+'('+Object.entries(binding.inputs).map(([name,binding])=>uiSymbolSource(name)+': '+ref(binding)).join(', ')+');');return lines.join('\n');}
 const source=node(ui.root,0)+'\n'+(routes.length?'\n'+routes.join('\n')+'\n':'');try{parseEMSModule(source);}catch(error){fail('UI_SOURCE_LIMIT','UI text exceeds the source syntax profile',{cause:error.code});}return source;
}
