import {FLOW_KERNEL} from '../contracts/flow.mjs';
import {fail} from '../reference/errors.mjs';
import {parseEMSModule} from './index.mjs';
import {typecheckModule} from './check.mjs';
import {lowerCheckedModule} from './lower.mjs';
const reserved='__ems_module_';
const prefix=path=>reserved+[...new TextEncoder().encode(path)].map(byte=>byte.toString(16).padStart(2,'0')).join('')+'.';
const callable=node=>node?.kind==='NameExpression'?node.name:node?.kind==='MemberExpression'?(callable(node.value)?callable(node.value)+'.'+node.member:null):null;
const functions=new Set(['FunctionDeclaration','ContractDeclaration']);
const libraryKinds=new Set([...functions,'TypeDeclaration','StatefulContractDeclaration']);
function problem(code,message,node,file,extra={}){fail(code,message,{file,...(node?.location?{location:node.location}:{}),...extra});}
/** Normalize data-only project paths. Never consult filesystem, URLs or the network. */
export function modulePath(value,base=''){
 if(typeof value!=='string'||!value||value.length>240||value.startsWith('/')||!/^[A-Za-z0-9_./ -]+$/.test(value))fail('INVALID_MODULE_PATH','Expected a project-relative module path');
 const parts=base?base.split('/').slice(0,-1):[];
 for(const part of value.split('/')){if(part==='.')continue;if(!part)fail('INVALID_MODULE_PATH','Empty module path segment');if(part==='..'){if(!parts.length)fail('INVALID_MODULE_PATH','Module path escapes the project');parts.pop();}else parts.push(part);}
 const path=parts.join('/');if(!path||path.length>240)fail('INVALID_MODULE_PATH','Invalid normalized module path');return path;
}
function limits(maxModules,maxBytes){if(!Number.isSafeInteger(maxModules)||maxModules<1||maxModules>64||!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>4*1024*1024)fail('INVALID_MODULE_OPTION','Invalid bounded source module limits');}
/** Names are scoped per source file. The result is ordinary located EMS AST for the common checker. */
export function linkEMSModules(sources,entryPath,{bindings=new Map(),maxModules=64,maxBytes=1048576}={}){
 limits(maxModules,maxBytes);if(!(sources instanceof Map)||!(bindings instanceof Map))fail('INVALID_MODULE_SET','Expected explicit source and host namespace maps');
 if(sources.size>maxModules||bindings.size>64)fail('MODULE_LIMIT','Too many module sources or host namespaces');
 const files=new Map();let bytes=0;
 for(const [name,source]of sources){const path=modulePath(name);if(path!==name||files.has(path)||typeof source!=='string')fail('INVALID_MODULE_SET','Module keys must be unique canonical project paths with text values');if(source.length>maxBytes||(bytes+=new TextEncoder().encode(source).length)>maxBytes)fail('MODULE_LIMIT','Source byte budget exceeded');files.set(path,source);}
 for(const [specifier,namespace]of bindings)if(typeof specifier!=='string'||!specifier||specifier.length>240||typeof namespace!=='string'||namespace.length>200||!/^[_A-Za-z][_A-Za-z0-9]*(\.[_A-Za-z][_A-Za-z0-9]*)*$/.test(namespace)||namespace.startsWith(reserved))fail('INVALID_MODULE_BINDING','Invalid explicit host namespace');
 const root=modulePath(entryPath),active=[],loaded=new Map();
 function load(path,via){
  if(active.includes(path))problem('MODULE_CYCLE','Source imports must form a DAG',via?.node,via?.file??path,{cycle:[...active,path]});
  if(loaded.has(path))return loaded.get(path);
  if(!files.has(path))problem('MISSING_MODULE','Source module is absent from the supplied project',via?.node,via?.file??path,{target:path});
  active.push(path);let ast;
  try{ast=parseEMSModule(files.get(path),{maxTokens:20000,maxDepth:128});}catch(error){error.details={...error.details,file:path};throw error;}
  const module={path,source:files.get(path),ast,imports:new Map(),declarations:new Map()};loaded.set(path,module);
  for(const declaration of ast.declarations){
   if(path!==root&&!libraryKinds.has(declaration.kind))problem('MODULE_LIBRARY_SCOPE','Imported libraries declare contracts and types, not application instances or UI roots',declaration,path);
   if(declaration.name?.startsWith(reserved))problem('RESERVED_SYMBOL','Reserved source linker namespace',declaration,path);
   if(declaration.external)problem('MODULE_EXTERN_PROFILE','Use an explicit typed registry namespace binding instead of a source extern declaration',declaration,path);
   // UI event declarations do not have a declaration name.
   if(!declaration.name||declaration.kind==='UINodeDeclaration')continue;
   if(module.declarations.has(declaration.name))problem('DUPLICATE_SYMBOL','Duplicate module declaration',declaration,path);
   module.declarations.set(declaration.name,declaration);
  }
  for(const item of ast.imports){
   if(item.alias.startsWith(reserved)||module.imports.has(item.alias)||module.declarations.has(item.alias))problem('DUPLICATE_SYMBOL','Duplicate or reserved import namespace',item,path);
   if(bindings.has(item.source)){let local;try{local=modulePath(item.source,path);}catch{}if(files.has(item.source)||local&&files.has(local))problem('AMBIGUOUS_MODULE','Source path also has a host namespace binding',item,path);module.imports.set(item.alias,{namespace:bindings.get(item.source)});}
   else{let target;try{target=modulePath(item.source,path);}catch(error){error.details={...error.details,file:path,location:item.location};throw error;}module.imports.set(item.alias,{module:load(target,{file:path,node:item})});}
  }
  active.pop();return module;
 }
 load(root);
 const rootModule=loaded.get(root),rootInstances=rootModule.ast.declarations.flatMap(node=>node.kind==='ApplicationDeclaration'?node.declarations:[node]).filter(node=>node.kind==='ContractInstanceDeclaration'),rootOwners=new Set(rootInstances.map(node=>node.name)),ownerReferences=new Set();let selfReferences=new Set();
 for(const instance of rootInstances){const [alias,...member]=instance.contract.split('.'),imported=rootModule.imports.get(alias),definition=rootModule.declarations.get(instance.contract)??imported?.module?.declarations.get(member.join('.'));if(definition?.kind==='StatefulContractDeclaration'){for(const action of definition.transitions)ownerReferences.add(instance.name+'.'+action.name);for(const field of definition.fields)for(const operation of ['read','write'])ownerReferences.add(instance.name+'.'+field.name+'.'+operation);}}
 const ordered=[...loaded.values()].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0),segments=[],declarations=[],symbols=[];let source='',line=0,visits=0;
 const identity=(module,declaration)=>{const id=libraryKinds.has(declaration.kind)?prefix(module.path)+declaration.name:declaration.name;if(declaration.kind==='StatefulContractDeclaration'&&id.length>200)problem('MODULE_SYMBOL_LIMIT','Linked native definition exceeds its 200-character identity budget',declaration,module.path);return id;};
 function resolve(module,name,node,kind='call'){
  if(name.startsWith(reserved))problem('RESERVED_SYMBOL','Source cannot reference generated module identities',node,module.path);
  if(kind==='call'&&(selfReferences.has(name)||module.path===root&&ownerReferences.has(name)))return name;
  const own=module.declarations.get(name);if(own&&(kind==='type'?own.kind==='TypeDeclaration':kind==='definition'?own.kind==='StatefulContractDeclaration':functions.has(own.kind)))return identity(module,own);
  const [alias,...rest]=name.split('.'),imported=module.imports.get(alias);if(!imported){if(module.path!==root&&rootOwners.has(alias))problem('MODULE_UNBOUND_OWNER','Library cannot implicitly reference an application instance',node,module.path);return name;}
  if(!rest.length&&kind==='type')return name;
  if(!rest.length)problem('MODULE_MEMBER_REQUIRED','Select an exported member of the module',node,module.path);
  if(imported.namespace)return imported.namespace+'.'+rest.join('.');
  const declaration=imported.module.declarations.get(rest.join('.'));
  if(!declaration?.exported)problem('NOT_EXPORTED','Module member is absent or private: '+name,node,module.path);
  return identity(imported.module,declaration);
 }
 for(const module of ordered){
  const start=source.length,startLine=line;source+=module.source+'\n';line+=(module.source.match(/\n/g)?.length??0)+1;segments.push({path:module.path,start,end:start+module.source.length,startLine,source:module.source});
  function visit(node,scope=new Set(),types=new Set()){
   if(!node||typeof node!=='object')return node;if(++visits>200000)problem('MODULE_LIMIT','Linked AST exceeds traversal budget',node,module.path);
   if(Array.isArray(node))return node.map(child=>visit(child,scope,types));
   if(['UINodeDeclaration','UIEventBindingDeclaration'].includes(node.kind))return node;
   if(node.kind==='NamedType'){if(!types.has(node.name))node.name=resolve(module,node.name,node,'type');node.arguments=node.arguments.map(child=>visit(child,scope,types));return node;}
   if(functions.has(node.kind)){const parameters=new Set(node.parameters.map(p=>p.name)),generic=new Set(node.typeParameters);node.parameters=visit(node.parameters,scope,generic);node.output=visit(node.output,scope,generic);node.body=visit(node.body,parameters,generic);return node;}
   if(node.kind==='TypeDeclaration'){node.value=visit(node.value,scope,new Set(node.typeParameters));return node;}
   if(node.kind==='StatefulContractDeclaration'){
    const fields=new Set(node.fields.map(field=>field.name));node.fields=visit(node.fields,scope,types);node.invariants=visit(node.invariants,fields,types);
    const previous=selfReferences;selfReferences=new Set([...node.transitions.map(action=>'self.'+action.name),...node.fields.flatMap(field=>['self.'+field.name+'.read','self.'+field.name+'.write'])]);
    try{node.transitions=node.transitions.map(action=>({...action,parameters:visit(action.parameters,scope,types),output:visit(action.output,scope,types),body:visit(action.body,new Set([...fields,...action.parameters.map(p=>p.name)]),types)}));}finally{selfReferences=previous;}return node;
   }
   if(node.kind==='Block'){const local=new Set(scope);node.statements=node.statements.map(statement=>{const result=visit(statement,local,types);if(['LetDeclaration','UsingDeclaration'].includes(statement.kind))local.add(statement.name);return result;});return node;}
   if(node.kind==='ForStatement'){node.iterable=visit(node.iterable,scope,types);node.body=visit(node.body,new Set([...scope,node.binding]),types);return node;}
   if(node.kind==='CatchClause'){node.type=visit(node.type,scope,types);node.body=visit(node.body,new Set([...scope,node.binding]),types);return node;}
   if(node.kind==='MatchArm'){const local=new Set(scope);function bind(pattern){if(pattern.kind==='BindingPattern')local.add(pattern.name);for(const child of pattern.arguments??[])bind(child);}bind(node.pattern);node.body=visit(node.body,local,types);return node;}
   if(node.kind==='CallExpression'){
    const name=callable(node.callee);if(name){if(scope.has(name.split('.')[0]))problem('UNSUPPORTED_CALL','Local values are not callable module references',node.callee,module.path);const target=resolve(module,name,node.callee);node.callee={kind:'NameExpression',name:target,location:node.callee.location};
     if(['std.array.map','std.array.filter'].includes(target)&&node.arguments[1]){const callback=callable(node.arguments[1]);if(callback){if(scope.has(callback.split('.')[0]))problem('CONTRACT_REF_REQUIRED','Local values are not static contract references',node.arguments[1],module.path);node.arguments[1]={kind:'NameExpression',name:resolve(module,callback,node.arguments[1]),location:node.arguments[1].location};}}
    }
    node.arguments=node.arguments.map(child=>visit(child,scope,types));return node;
   }
   if(node.kind==='GraphNodeDeclaration'&&!Object.hasOwn(FLOW_KERNEL,node.contract))node.contract=resolve(module,node.contract,node);
   if(node.kind==='ContractInstanceDeclaration')node.contract=resolve(module,node.contract,node,'definition');
   if(['ContractReferenceExpression','InstanceTransitionBinding','InvariantBindingDeclaration'].includes(node.kind))node.target=resolve(module,node.target,node,'reference');
   for(const [key,item]of Object.entries(node)){if(key==='location')continue;if(Array.isArray(item)||item&&typeof item==='object')node[key]=visit(item,scope,types);}return node;
  }
  function shift(node){if(!node||typeof node!=='object')return;for(const [key,item]of Object.entries(node)){if(key==='location'){node.location={start:{...item.start,offset:item.start.offset+start,line:item.start.line+startLine},end:{...item.end,offset:item.end.offset+start,line:item.end.line+startLine}};}else if(Array.isArray(item))item.forEach(shift);else if(item&&typeof item==='object')shift(item);}}
  for(const original of module.ast.declarations){const declaration=visit(structuredClone(original));if(original.name){declaration.name=identity(module,original);symbols.push({file:module.path,name:original.name,id:declaration.name,kind:original.kind,exported:original.exported===true,version:module.ast.package?.version??'0.1.0'});}shift(declaration);declarations.push(declaration);}
 }
 const rootAST=loaded.get(root).ast,rootSegment=segments.find(file=>file.path===root),location={start:{...rootAST.location.start,offset:rootAST.location.start.offset+rootSegment.start,line:rootAST.location.start.line+rootSegment.startLine},end:{...rootAST.location.end,offset:rootAST.location.end.offset+rootSegment.start,line:rootAST.location.end.line+rootSegment.startLine}};
 return {ast:{...rootAST,location,...(rootAST.package?{package:{...rootAST.package,location:{start:{...rootAST.package.location.start,offset:rootAST.package.location.start.offset+rootSegment.start,line:rootAST.package.location.start.line+rootSegment.startLine},end:{...rootAST.package.location.end,offset:rootAST.package.location.end.offset+rootSegment.start,line:rootAST.package.location.end.line+rootSegment.startLine}}}}:{}),imports:[],declarations},source,entry(name){const declaration=loaded.get(root).declarations.get(name);if(!declaration||!functions.has(declaration.kind))problem('UNKNOWN_SYMBOL','Entry must be a concrete contract in the root source file',null,root);return identity(loaded.get(root),declaration);},modules:{schemaVersion:'ems-linked-modules/1',entry:root,files:segments,symbols}};
}
/** Convert a virtual compiler span to the exact original file without changing semantic IR. */
export function moduleSourceLocation(modules,location){
 const start=location?.start,end=location?.end;if(!Number.isSafeInteger(start?.offset)||!Number.isSafeInteger(end?.offset)||end.offset<start.offset)return null;
 const file=modules.files.find(file=>start.offset>=file.start&&end.offset<=file.end);if(!file)return null;
 return {file:file.path,location:{start:{...start,offset:start.offset-file.start,line:start.line-file.startLine},end:{...end,offset:end.offset-file.start,line:end.line-file.startLine}}};
}
export function withModuleDiagnostics(linked,work){try{return work();}catch(error){const original=moduleSourceLocation(linked.modules,error.details?.location);if(original)error.details={...error.details,...original};throw error;}}
export function compileEMSModules(sources,entryPath,entry,registry,options={}){
 const linked=linkEMSModules(sources,entryPath,options);
 return withModuleDiagnostics(linked,()=>({...lowerCheckedModule(typecheckModule(linked.ast,registry),linked.entry(entry),registry,{profile:options.profile??'auto',preserveGraphIdentity:true,retainGraphReferences:true}),modules:linked.modules,source:linked.source}));
}
