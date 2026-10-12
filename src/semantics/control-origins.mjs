import {validateControlIR} from '../ir/control.mjs';
import {fail} from '../reference/errors.mjs';

/** Static, context-insensitive dependency sidecar. Not a confidentiality decision or declassification. */
export function analyzeControlOrigins(ir,registry,{maxNodes=2048,maxOrigins=64,maxBytes=1048576,maxDependencies=32768,maxSteps=100000}={}){
 for(const [value,min,max]of [[maxNodes,1,8192],[maxOrigins,1,256],[maxBytes,128,4194304],[maxDependencies,1,262144],[maxSteps,1,1000000]])if(!Number.isSafeInteger(value)||value<min||value>max)fail('INVALID_ANALYSIS_OPTION','Invalid origin analysis limit');
 const checked=validateControlIR(ir,registry),nodes=new Map(),summaries=new Map();
 let dependencyCount=0;
 const unknown=JSON.stringify({kind:'unknown',reason:'origin-budget'});
 function add(fn,path,kind,type=null,name=null){const id=JSON.stringify([fn,path]);if(nodes.has(id))return id;if(nodes.size>=maxNodes)fail('ANALYSIS_LIMIT','Origin node budget exceeded');nodes.set(id,{id,function:fn,path,kind,type,...(name?{name}:{}),dependencies:new Set(),origins:new Set()});return id;}
 function edge(to,...from){for(const id of from.flat())if(id&&!nodes.get(to).dependencies.has(id)){if(++dependencyCount>maxDependencies)fail('ANALYSIS_LIMIT','Origin dependency budget exceeded');nodes.get(to).dependencies.add(id);}}
 function seed(id,origin){const node=nodes.get(id),key=JSON.stringify(origin);if(node.origins.has(unknown))return;if(node.origins.size>=maxOrigins&&!node.origins.has(key))node.origins=new Set([unknown]);else node.origins.add(key);}
 for(const fn of checked.functions.values()){
  const output=add(fn.id,'/return','return',fn.output.type),outcome=add(fn.id,'/outcome','outcome'),inputs=fn.inputs.map((p,i)=>{const id=add(fn.id,'/inputs/'+i,'input',p.type,p.name);seed(id,{kind:'input',function:fn.id,path:'/inputs/'+i});return id;});summaries.set(fn.id,{output,outcome,inputs});edge(output,outcome);
 }
 // One intentionally imprecise state region prevents alias writes from disappearing.
 const state=add(ir.entry,'/shared-state','shared-state');
 seed(state,{kind:'unknown',reason:'shared-state'});
 for(const fn of checked.functions.values()){
  const summary=summaries.get(fn.id),scope=new Map(fn.inputs.map((p,i)=>[p.name,summary.inputs[i]]));
  function expr(node,path,env,control=[]){const id=add(fn.id,path,node.kind,node.type);edge(id,control);let args=[];
   switch(node.kind){
    case 'literal':seed(id,{kind:'literal',function:fn.id,path});break;
    case 'local':edge(id,env.get(node.name));break;
    case 'assign':edge(id,expr(node.value,path+'/value',env,control));edge(env.get(node.name),id);break;
    case 'array':args=node.elements.map((n,i)=>expr(n,path+'/elements/'+i,env,control));edge(id,args);break;
    case 'unary':case 'await':edge(id,expr(node.value,path+'/value',env,control));edge(summary.outcome,id);break;
    case 'binary':edge(id,expr(node.left,path+'/left',env,control),expr(node.right,path+'/right',env,control));edge(summary.outcome,id);break;
    case 'index':edge(id,expr(node.value,path+'/value',env,control),expr(node.index,path+'/index',env,control));edge(summary.outcome,id);break;
    case 'construct':case 'resource':case 'stream':case 'call':{
     args=node.arguments.map((n,i)=>expr(n,path+'/arguments/'+i,env,control));edge(id,args);
     if(node.kind==='call'){
      if(node.target.kind==='function'){const target=summaries.get(node.target.id);target.inputs.forEach((input,i)=>edge(input,args[i],control));edge(id,target.output);edge(summary.outcome,target.outcome);}
      else{const target=registry.resolve(node.target.id);seed(id,{kind:'boundary',contract:target.id});seed(id,{kind:'unknown',reason:'opaque-boundary'});for(const name of target.effects??[])seed(id,{kind:'effect',name});for(const name of target.capabilities??[])seed(id,{kind:'capability',name});if(target.kind==='composite')seed(id,{kind:'unknown',reason:'composite-boundary'});if(target.kind==='resource')seed(id,{kind:'local-effect',name:'resource.create'});if(target.kind==='composite'||target.kind==='resource'||target.effects?.length||target.capabilities?.length){edge(state,args,control);edge(id,state);}edge(summary.outcome,id);}
     }else if(node.kind==='resource'||node.kind==='stream'){seed(id,{kind:'local-effect',name:node.kind+'.'+node.operation});edge(state,args,control);edge(id,state);edge(summary.outcome,id);}
     break;
    }
    default:fail('UNSUPPORTED_ANALYSIS','Unsupported control expression');
   }return id;
  }
  function pattern(value,path,env,input,control){
   const id=add(fn.id,path,value.kind==='binding'?'binding':'pattern-'+value.kind,null,value.kind==='binding'?value.name:null);edge(id,input,control);
   if(value.kind==='binding')env.set(value.name,id);
   else if(value.kind==='literal')seed(id,{kind:'literal',function:fn.id,path});
   else if(value.kind==='constructor')value.arguments.forEach((n,i)=>edge(id,pattern(n,path+'/arguments/'+i,env,input,control)));
   return id;
  }
  // Carry branch/body dependencies to successors, including nested early exits.
  function block(body,path,parent,parentControl=[]){const env=new Map(parent);let control=[...parentControl];for(const [i,statement]of body.entries()){const at=path+'/'+i;
   switch(statement.kind){
    case 'let':case 'using':{const value=expr(statement.value,at+'/value',env,control),id=add(fn.id,at,statement.kind,statement.type,statement.name);edge(id,value,control);env.set(statement.name,id);if(statement.kind==='using'){seed(summary.outcome,{kind:'local-effect',name:'resource.close'});edge(state,value,control);}control.push(value);break;}
    case 'expression':control.push(expr(statement.value,at+'/value',env,control));break;
    case 'return':edge(summary.output,expr(statement.value,at+'/value',env,control),control);break;
    case 'throw':edge(summary.outcome,expr(statement.value,at+'/value',env,control),control);break;
    case 'if':{const condition=expr(statement.condition,at+'/condition',env,control);control=[...new Set([...control,condition,...block(statement.then,at+'/then',env,[...control,condition]),...block(statement.otherwise,at+'/otherwise',env,[...control,condition])])];break;}
    case 'while':{const condition=expr(statement.condition,at+'/condition',env,control);edge(summary.outcome,condition);control=[...new Set([...control,condition,...block(statement.body,at+'/body',env,[...control,condition])])];break;}
    case 'for':case 'forAwait':{const iterable=expr(statement.iterable,at+'/iterable',env,control),binding=add(fn.id,at+'/binding','binding',null,statement.binding),nested=new Map(env);edge(binding,iterable,control);nested.set(statement.binding,binding);edge(summary.outcome,iterable);if(statement.kind==='forAwait')seed(binding,{kind:'local-effect',name:'stream.read'});control=[...new Set([...control,iterable,...block(statement.body,at+'/body',nested,[...control,iterable])])];break;}
    case 'match':{const input=expr(statement.value,at+'/value',env,control);statement.arms.forEach((arm,i)=>{const nested=new Map(env);const matched=pattern(arm.pattern,at+'/arms/'+i+'/pattern',nested,input,control);control=[...new Set([...control,...block(arm.body,at+'/arms/'+i+'/body',nested,[...control,input,matched])])];});control.push(input);break;}
    case 'try':{control=[...new Set([...control,...block(statement.body,at+'/body',env,control)])];if(statement.handler){const nested=new Map(env),binding=add(fn.id,at+'/handler/binding','catch',statement.handler.type,statement.handler.binding);edge(binding,summary.outcome,control);seed(binding,{kind:'unknown',reason:'exception-path'});nested.set(statement.handler.binding,binding);control=[...new Set([...control,...block(statement.handler.body,at+'/handler/body',nested,[...control,binding])])];}if(statement.finalizer!==null)control=[...new Set([...control,...block(statement.finalizer,at+'/finalizer',env,[...control,summary.outcome])])];control.push(summary.outcome);break;}
    case 'block':control=block(statement.body,at+'/body',env,control);break;
    case 'break':case 'continue':edge(summary.outcome,control);break;
    default:fail('UNSUPPORTED_ANALYSIS','Unsupported control statement');
   }
  }return control;}block(fn.body,'/body',scope);
 }
 // Origins form a finite union lattice; budget overflow is an absorbing top.
 const consumers=new Map([...nodes.keys()].map(id=>[id,new Set()]));for(const node of nodes.values())for(const dep of node.dependencies)consumers.get(dep).add(node.id);
 const queue=[...nodes.keys()],queued=new Set(queue);let head=0;
 while(head<queue.length){if(head>=maxSteps)fail('ANALYSIS_LIMIT','Origin fixed-point budget exceeded');const id=queue[head++];queued.delete(id);const node=nodes.get(id);let changed=false;
  if(!node.origins.has(unknown)){dependencies:for(const dep of node.dependencies)for(const origin of nodes.get(dep).origins){if(origin===unknown||node.origins.size>=maxOrigins&&!node.origins.has(origin)){node.origins=new Set([unknown]);changed=true;break dependencies;}if(!node.origins.has(origin)){node.origins.add(origin);changed=true;}}}
  if(changed)for(const consumer of consumers.get(id))if(!queued.has(consumer)){queue.push(consumer);queued.add(consumer);}
 }
 const result={schemaVersion:'ems-control-origins/1',entry:ir.entry,mode:'conservative-context-insensitive',securityDecision:false,precision:{locals:'flow-insensitive',calls:'context-insensitive',control:'lexical-and-sequential',state:'shared-unknown'},nodes:[...nodes.values()].map(({dependencies,origins,...node})=>({...node,dependencies:[...dependencies].sort(),origins:[...origins].sort().map(value=>JSON.parse(value))}))};
 if(new TextEncoder().encode(JSON.stringify(result)).length>maxBytes)fail('ANALYSIS_LIMIT','Origin artifact byte budget exceeded');return result;
}
