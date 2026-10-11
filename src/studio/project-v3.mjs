import {fail} from '../reference/errors.mjs';
import {typeOfValue,assertValueType} from '../reference/types.mjs';
import {serializeIR,parseIR} from '../ir/index.mjs';
function fields(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==[...keys].sort().join(','))fail('INVALID_PROJECT','Unexpected collection project fields');}
const number=value=>Object.is(value,-0)?'-0':value;
function ref(value,decode=false){
 if(!value||Object.keys(value).length!==1)fail('INVALID_REF','Invalid model reference');
 if(Object.hasOwn(value,'input')||Object.hasOwn(value,'node'))return structuredClone(value);
 if(!Object.hasOwn(value,'literal'))fail('INVALID_REF','Unknown model reference');
 if(!decode){const type=typeOfValue(value.literal);if(type==='Unknown')fail('UNKNOWN_LITERAL','Invalid model literal');return {literal:{type,value:type==='Number'?number(value.literal):type==='NumberArray'?value.literal.map(number):value.literal}};}
 fields(value.literal,['type','value']);const {type}=value.literal,raw=value.literal.value,from=value=>value==='-0'?-0:value;
 const decoded=type==='Number'?from(raw):type==='NumberArray'&&Array.isArray(raw)?raw.map(from):raw;assertValueType(decoded,type,'saved graph literal');return {literal:decoded};
}
function graph(value,decode=false){
 fields(value,['schemaVersion','id','version','inputs','output','nodes','returns',...['sequence','effects','capabilities','description'].filter(key=>Object.hasOwn(value,key))]);
 if(value.schemaVersion!=='0.1'||!Array.isArray(value.nodes)||!value.inputs||typeof value.inputs!=='object'||Array.isArray(value.inputs))fail('PROJECT_VERSION','Collection authoring requires finite graph model');
 if(Object.hasOwn(value,'description')&&typeof value.description!=='string')fail('INVALID_PROJECT','Invalid graph description');
 const result=structuredClone(value);function spec(item){fields(item,['type',...(Object.hasOwn(item,'description')?['description']:[])]);if(Object.hasOwn(item,'description')&&typeof item.description!=='string')fail('INVALID_PROJECT','Invalid type description');}spec(result.output);for(const input of Object.values(result.inputs))spec(input);
 result.nodes=result.nodes.map(node=>{fields(node,['id','uses','args']);if(!node.args||typeof node.args!=='object'||Array.isArray(node.args))fail('INVALID_PROJECT','Invalid graph arguments');return {...node,args:Object.fromEntries(Object.entries(node.args).map(([port,value])=>[port,ref(value,decode)]))};});result.returns=ref(result.returns,decode);return result;
}
const pins=(workspace,registry)=>[...new Set(workspace.graph.nodes.map(node=>node.uses))].sort().map(id=>({id,version:registry.resolve(id).version}));
function inputs(workspace,decode=false){if(!workspace.inputs||typeof workspace.inputs!=='object'||Array.isArray(workspace.inputs))fail('INVALID_PROJECT','Invalid saved inputs');return Object.fromEntries(Object.entries(workspace.inputs).map(([name,value])=>{const type=workspace.graph.inputs[name]?.type,transform=decode?value=>value==='-0'?-0:value:number;return [name,type==='Number'?transform(value):type==='NumberArray'&&Array.isArray(value)?value.map(transform):value];}));}
export function serializeCollectionProject(project,registry,ir){
 function workspace(value){return {graph:graph(value.graph),inputs:inputs(value),canvas:value.canvas,references:pins(value,registry)};}
 return JSON.stringify({schemaVersion:'ems-studio-project/3',id:project.id,name:project.name,...workspace(project),contracts:[...project.contracts].sort((a,b)=>a.graph.id<b.graph.id?-1:a.graph.id>b.graph.id?1:0).map(workspace),collections:[...project.collections].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0),ir:JSON.parse(serializeIR(ir,registry))},null,2)+'\n';
}
export function decodeCollectionProject(data){
 fields(data,['schemaVersion','id','name','graph','inputs','canvas','references','contracts','collections','ir']);
 if(!Array.isArray(data.contracts)||data.contracts.length>50||!Array.isArray(data.collections)||!data.collections.length||data.collections.length>50)fail('PROJECT_LIMIT','Invalid collection project aggregate');
 function workspace(value){fields(value,['graph','inputs','canvas','references']);const result={graph:graph(value.graph,true),inputs:value.inputs,canvas:value.canvas};result.inputs=inputs(result,true);return result;}
 const root={graph:data.graph,inputs:data.inputs,canvas:data.canvas,references:data.references};
 return {id:data.id,name:data.name,...workspace(root),contracts:data.contracts.map(workspace),collections:data.collections};
}
export function verifyCollectionProject(data,project,registry,ir){
 const saved=[data,...data.contracts],actual=[project,...project.contracts];
 for(let i=0;i<saved.length;i++){
  const references=saved[i].references;if(!Array.isArray(references))fail('CONTRACT_VERSION','Missing project references');for(const item of references)fields(item,['id','version']);
  const normalized=references.map(item=>({id:item.id,version:item.version})).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  if(JSON.stringify(normalized)!==JSON.stringify(pins(actual[i],registry)))fail('CONTRACT_VERSION','Saved workspace references disagree with actual definitions');
 }
 if(serializeIR(parseIR(JSON.stringify(data.ir),registry),registry)!==serializeIR(ir,registry))fail('IR_MISMATCH','Saved control IR disagrees with editable graph and collection bindings');
}

export function validateCollectionAuthoring(project){for(const workspace of [project,...project.contracts]){graph(workspace.graph);}}
