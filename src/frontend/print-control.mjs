import {validateControlIR,decodeControlLiteral} from '../ir/control.mjs';
import {uiSymbolSource} from './index.mjs';
import {fail} from '../reference/errors.mjs';
const number=value=>Object.is(value,-0)?'#-0':value<0?'#'+String(value):String(value);
const reference=name=>uiSymbolSource(name)===name?name:'#'+JSON.stringify(name);
const path=id=>id.split('.').map(uiSymbolSource).join('::');
/** Print finite synchronous control IR as ordinary EMS contracts, with lexical binding hygiene. */
export function printControlProgram(ir,registry,{prefix='_ems_text',contractName=path}={}){
 validateControlIR(ir,registry);if(!['ems-control-finite/1','ems-control-errors/1','ems-control-algebraic/1'].includes(ir.profile))fail('SOURCE_PROFILE','Current source requires finite synchronous control IR');
 if(!/^_[A-Za-z][A-Za-z0-9_]*$/.test(prefix))fail('SOURCE_NAME','Invalid source helper prefix');
 const functions=[...ir.functions].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0),names=new Map(functions.map((fn,index)=>[fn.id,prefix+'_'+String(index).padStart(4,'0')]));
 const source=functions.map(fn=>{
  const used=new Set(fn.inputs.map(input=>input.name));let next=0;
  function fresh(){let name;do{name='_local_'+next++;}while(used.has(name));used.add(name);return name;}
  const name=(value,scope)=>{if(!scope.has(value))fail('UNKNOWN_SYMBOL','Source local is unavailable');return reference(scope.get(value));};
  function expr(node,scope){let text;switch(node.kind){
   case 'literal':{const value=decodeControlLiteral(node.value,node.type);text=node.type==='Number'?number(value):node.type==='NumberArray'?'#['+value.map(value=>Object.is(value,-0)?'-0':String(value)).join(', ')+']':JSON.stringify(value);break;}
   case 'local':return name(node.name,scope);
   case 'array':text='['+node.elements.map(value=>expr(value,scope)).join(', ')+']';break;
   case 'index':text='('+expr(node.value,scope)+')['+expr(node.index,scope)+']';break;
   case 'assign':text='('+name(node.name,scope)+' = '+expr(node.value,scope)+')';break;
   case 'unary':text='('+node.operator+expr(node.value,scope)+')';break;
   case 'binary':text='('+expr(node.left,scope)+' '+node.operator+' '+expr(node.right,scope)+')';break;
   case 'construct':text=node.tag+'('+node.arguments.map(value=>expr(value,scope)).join(', ')+')';break;
   case 'call':text=(node.target.kind==='function'?names.get(node.target.id):contractName(node.target.id))+'('+node.arguments.map(value=>expr(value,scope)).join(', ')+')';break;
   default:fail('SOURCE_PROFILE','Unsupported source expression '+node.kind);
  }return node.type.includes('<')?'('+text+' : '+node.type+')':text;}
  function pattern(node,scope){switch(node.kind){case 'wildcard':return '_';case 'literal':return node.type==='Number'?number(decodeControlLiteral(node.value,node.type)):JSON.stringify(node.value);case 'binding':{const value=fresh();scope.set(node.name,value);return value;}case 'constructor':return node.tag+'('+node.arguments.map(value=>pattern(value,scope)).join(', ')+')';default:fail('SOURCE_PROFILE','Unsupported source pattern');}}
  function block(body,parent,depth){const scope=new Map(parent),pad='    '.repeat(depth),lines=[];for(const statement of body){let text;switch(statement.kind){
   case 'let':{const value=expr(statement.value,scope),local=fresh();scope.set(statement.name,local);text='let '+(statement.mutable?'mut ':'')+local+': '+statement.type+' = '+value+';';break;}
   case 'expression':text=expr(statement.value,scope)+';';break;
   case 'return':case 'throw':text=statement.kind+' '+expr(statement.value,scope)+';';break;
   case 'break':case 'continue':text=statement.kind+';';break;
   case 'block':text='{\n'+block(statement.body,scope,depth+1)+'\n'+pad+'}';break;
   case 'if':text='if '+expr(statement.condition,scope)+' {\n'+block(statement.then,scope,depth+1)+'\n'+pad+'}'+(statement.otherwise.length?' else {\n'+block(statement.otherwise,scope,depth+1)+'\n'+pad+'}':'');break;
   case 'while':text='while '+expr(statement.condition,scope)+' {\n'+block(statement.body,scope,depth+1)+'\n'+pad+'}';break;
   case 'for':{const iterable=expr(statement.iterable,scope),local=fresh(),nested=new Map(scope);nested.set(statement.binding,local);text='for '+local+' in '+iterable+' {\n'+block(statement.body,nested,depth+1)+'\n'+pad+'}';break;}
   case 'try':{text='try {\n'+block(statement.body,scope,depth+1)+'\n'+pad+'}';if(statement.handler){const nested=new Map(scope),local=fresh();nested.set(statement.handler.binding,local);text+=' catch ('+local+': '+statement.handler.type+') {\n'+block(statement.handler.body,nested,depth+1)+'\n'+pad+'}';}if(statement.finalizer!==null)text+=' finally {\n'+block(statement.finalizer,scope,depth+1)+'\n'+pad+'}';break;}
   case 'match':{text='match '+expr(statement.value,scope)+' {\n';for(const arm of statement.arms){const nested=new Map(scope),head=pattern(arm.pattern,nested);text+=pad+'    '+head+' => {\n'+block(arm.body,nested,depth+2)+'\n'+pad+'    }\n';}text+=pad+'}';break;}
   default:fail('SOURCE_PROFILE','Unsupported source statement '+statement.kind);
  }lines.push(pad+text);}return lines.join('\n');}
  const requirements=[...fn.requirements.effects.map(value=>'effect('+JSON.stringify(value)+')'),...fn.requirements.capabilities.map(value=>'capability('+JSON.stringify(value)+')')];
  return '@'+names.get(fn.id)+'('+fn.inputs.map(input=>uiSymbolSource(input.name)+': '+input.type).join(', ')+') -> '+fn.output.type+(requirements.length?' requires '+requirements.join(', '):'')+' {\n'+block(fn.body,new Map(fn.inputs.map(input=>[input.name,input.name])),1)+'\n}';
 }).join('\n\n');
 return {source,entry:names.get(ir.entry),names};
}
