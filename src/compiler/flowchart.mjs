import {fail} from '../reference/errors.mjs';
import {validateControlIR,decodeControlLiteral} from '../ir/control.mjs';
import {graphFromIR} from '../ir/index.mjs';
const quote=v=>typeof v==='number'&&Object.is(v,-0)?'-0':Array.isArray(v)?'['+v.map(quote).join(', ')+']':JSON.stringify(v);
function expression(n){switch(n.kind){case 'literal':return quote(decodeControlLiteral(n.value,n.type));case 'local':return n.name;case 'array':return '['+n.elements.map(expression).join(', ')+']';case 'index':return expression(n.value)+'['+expression(n.index)+']';case 'unary':return n.operator+'('+expression(n.value)+')';case 'binary':return '('+expression(n.left)+' '+n.operator+' '+expression(n.right)+')';case 'assign':return n.name+' := '+expression(n.value);case 'call':return n.target.id+'('+n.arguments.map(expression).join(', ')+')';case 'construct':return n.tag+'('+n.arguments.map(expression).join(', ')+')';default:fail('UNSUPPORTED_FLOWCHART','Unsupported expression '+n.kind);}}
function pattern(p){return p.kind==='constructor'?p.tag+'('+p.arguments.map(pattern).join(', ')+')':p.kind==='literal'?quote(p.value):p.kind==='wildcard'?'_':p.name;}
/** Semantic CFG for the supported synchronous EMS subset, independent of canvas positions. */
export function buildFlowchart(ir,registry){
 const components=[];
 function component(name,inputs){const nodes=[],edges=[];const add=(kind,label)=>{if(nodes.length>=3000||label.length>5000)fail('FLOWCHART_LIMIT','Diagram exceeds bounded export size');const id='n'+nodes.length;nodes.push({id,kind,label});return id;},edge=(from,to,label='',back=false)=>{if(to!==null)edges.push({from,to,label,back});};return {name,inputs,nodes,edges,add,edge};}
 if(ir?.schemaVersion==='ems-ir/2'){
  const checked=validateControlIR(ir,registry);if(!['ems-control-finite/1','ems-control-errors/1','ems-control-algebraic/1'].includes(ir.profile))fail('UNSUPPORTED_FLOWCHART','Export currently requires synchronous finite/control/algebraic IR');
  for(const fn of checked.functions.values()){
   const c=component(fn.id,fn.inputs),end=c.add('terminal','Конец '+fn.id);
   function block(body,next,loop={}){for(const s of [...body].reverse()){
    let node;
    switch(s.kind){
     case 'let':node=c.add(s.value.kind==='call'?'predefined':'process',s.name+' := '+expression(s.value));c.edge(node,next);next=node;break;
     case 'expression':node=c.add(s.value.kind==='call'?'predefined':'process',expression(s.value));c.edge(node,next);next=node;break;
     case 'return':node=c.add('data','Вернуть '+expression(s.value));c.edge(node,end);next=node;break;
     case 'block':next=block(s.body,next,loop);break;
     case 'if':node=c.add('decision',expression(s.condition));c.edge(node,block(s.then,next,loop),'Да');c.edge(node,block(s.otherwise,next,loop),'Нет');next=node;break;
     case 'while':{node=c.add('decision',expression(s.condition));const again=c.add('connector','');c.edge(again,node,'',true);c.edge(node,block(s.body,again,{breakTo:next,continueTo:again}),'Да');c.edge(node,next,'Нет');next=node;break;}
     case 'for':{const init=c.add('process','Подготовить обход копии '+expression(s.iterable)),check=c.add('decision','Есть следующий элемент?'),bind=c.add('process',s.binding+' := следующий элемент'),again=c.add('connector','');c.edge(init,check);c.edge(check,bind,'Да');c.edge(check,next,'Нет');c.edge(bind,block(s.body,again,{breakTo:next,continueTo:again}));c.edge(again,check,'',true);next=init;break;}
     case 'break':node=c.add('connector','break');c.edge(node,loop.breakTo);next=node;break;
     case 'continue':node=c.add('connector','continue');c.edge(node,loop.continueTo);next=node;break;
     case 'match':{let fallback=next;for(const arm of [...s.arms].reverse()){node=c.add('decision',expression(s.value)+' соответствует '+pattern(arm.pattern)+'?');c.edge(node,block(arm.body,next,loop),'Да');c.edge(node,fallback,'Нет');fallback=node;}next=fallback;break;}
     default:fail('UNSUPPORTED_FLOWCHART','Explicit '+s.kind+' flow is not supported by this export profile');
    }
   }return next;}
   const entry=block(fn.body,end),input=c.add('data','Параметры: '+(fn.inputs.map(p=>p.name+': '+p.type).join(', ')||'нет')),start=c.add('terminal','Начало '+fn.id);c.edge(start,input);c.edge(input,entry);c.start=start;components.push(c);
  }
 }else{
  const g=graphFromIR(ir,registry),c=component(g.id,Object.entries(g.inputs).map(([name,v])=>({name,type:v.type}))),start=c.add('terminal','Начало '+g.id),input=c.add('data','Параметры: '+Object.entries(g.inputs).map(([n,p])=>n+': '+p.type).join(', '));c.edge(start,input);let previous=input;const seen=new Set(),byId=new Map(g.nodes.map(n=>[n.id,n]));
  const ref=r=>Object.hasOwn(r,'input')?r.input:Object.hasOwn(r,'node')?r.node:quote(r.literal);
  function visit(id){if(seen.has(id))return;const n=byId.get(id);for(const r of Object.values(n.args))if(Object.hasOwn(r,'node'))visit(r.node);seen.add(id);const at=c.add('predefined',n.id+' := '+n.uses+'('+Object.entries(n.args).map(([k,v])=>k+'='+ref(v)).join(', ')+')');c.edge(previous,at);previous=at;}
  for(const id of g.sequence??[])visit(id);if(Object.hasOwn(g.returns,'node'))visit(g.returns.node);const output=c.add('data','Вернуть '+ref(g.returns)),end=c.add('terminal','Конец '+g.id);c.edge(previous,output);c.edge(output,end);c.start=start;components.push(c);
 }
 return {schemaVersion:'ems-flowchart/1',standard:'ГОСТ 19.701-90',components:components.map(({name,inputs,nodes,edges,start})=>({name,inputs,nodes,edges,start}))};
}
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function assertChart(chart){
 if(chart?.schemaVersion!=='ems-flowchart/1'||chart.standard!=='ГОСТ 19.701-90'||!Array.isArray(chart.components)||chart.components.length>1000)fail('INVALID_FLOWCHART','Invalid diagram schema');let count=0,totalText=0;
 for(const c of chart.components){if(typeof c.name!=='string'||c.name.length>1024||!Array.isArray(c.nodes)||!Array.isArray(c.edges)||c.edges.length>10000)fail('INVALID_FLOWCHART','Invalid component');const ids=new Set();for(const n of c.nodes){if(++count>10000)fail('FLOWCHART_LIMIT','Too many diagram nodes');if(typeof n.id!=='string'||!/^n[0-9]+$/.test(n.id)||ids.has(n.id)||!['terminal','data','process','predefined','decision','connector'].includes(n.kind)||typeof n.label!=='string'||n.label.length>5000)fail('INVALID_FLOWCHART','Invalid diagram node');ids.add(n.id);totalText+=n.label.length;}if(totalText>2097152)fail('FLOWCHART_LIMIT','Too much diagram text');if(!ids.has(c.start))fail('INVALID_FLOWCHART','Missing entry');for(const e of c.edges)if(!ids.has(e.from)||!ids.has(e.to)||typeof e.back!=='boolean'||typeof e.label!=='string'||e.label.length>128)fail('INVALID_FLOWCHART','Invalid diagram edge');}
}
/** Standalone SVG using terminal/data/process/predefined-process/decision/connector symbols. */
export function renderFlowchartSVG(chart){
 assertChart(chart);let offset=80,width=1000;const content=[];
 for(const [ci,c]of chart.components.entries()){
  const nodes=new Map(c.nodes.map(n=>[n.id,{...n,rank:0}])),reachable=new Set(),visit=id=>{if(reachable.has(id))return;reachable.add(id);for(const e of c.edges.filter(e=>e.from===id&&!e.back))visit(e.to);};visit(c.start);
  const indegree=new Map([...reachable].map(id=>[id,0]));for(const e of c.edges)if(!e.back&&reachable.has(e.from)&&reachable.has(e.to))indegree.set(e.to,indegree.get(e.to)+1);const queue=[...reachable].filter(id=>indegree.get(id)===0);let processed=0;
  while(queue.length){const id=queue.shift();processed++;for(const e of c.edges.filter(e=>e.from===id&&!e.back&&reachable.has(e.to))){nodes.get(e.to).rank=Math.max(nodes.get(e.to).rank,nodes.get(id).rank+1);indegree.set(e.to,indegree.get(e.to)-1);if(!indegree.get(e.to))queue.push(e.to);}}if(processed!==reachable.size)fail('INVALID_FLOWCHART','Unexpected unmarked cycle');
  const rows=new Map();for(const n of nodes.values())if(reachable.has(n.id)){const row=rows.get(n.rank)??[];row.push(n);rows.set(n.rank,row);n.lines=n.label.match(/.{1,36}/gu)??[''];n.h=n.kind==='connector'?36:Math.max(n.kind==='decision'?100:70,n.lines.length*17+30);}
  const w=Math.max(800,...[...rows.values()].map(row=>row.length*380+140)),backCount=c.edges.filter(e=>e.back||nodes.get(e.to)?.rank>nodes.get(e.from)?.rank+1).length;width=Math.max(width,w+backCount*24+50);let y=offset+45;
  content.push(`<text x="40" y="${offset}" font-size="20" font-weight="bold">${escape(c.name)}</text>`);
  for(const rank of [...rows.keys()].sort((a,b)=>a-b)){const row=rows.get(rank),h=Math.max(...row.map(n=>n.h));row.forEach((n,index)=>{n.x=(w-row.length*380)/2+index*380+40;n.y=y;n.w=300;n.rowBottom=y+h;});y+=h+80;}
  let backLane=0;for(const e of c.edges){if(!reachable.has(e.from)||!reachable.has(e.to))continue;const a=nodes.get(e.from),b=nodes.get(e.to),x1=a.x+150,y1=a.y+a.h,x2=b.x+150,y2=b.y;let d;if(e.back||b.rank>a.rank+1){const lane=w+(backLane++)*24;d=`M${x1},${y1} V${a.rowBottom+22} H${lane} V${y2-22} H${x2} V${y2}`;}else{const mid=y1+(y2-y1)/2;d=`M${x1},${y1} V${mid} H${x2} V${y2}`;}content.push(`<path data-edge-from="${ci}-${e.from}" data-edge-to="${ci}-${e.to}" data-back="${e.back}" d="${d}" fill="none" stroke="#222" stroke-width="1.5" marker-end="url(#arrow)"/>`);if(e.label)content.push(`<text x="${x1+(e.label==='Нет'?22:-28)}" y="${y1+(e.label==='Нет'?40:22)}" font-size="12">${escape(e.label)}</text>`);}
  for(const n of nodes.values()){if(!reachable.has(n.id))continue;const {x,y,w,h}=n;let shape;if(n.kind==='decision')shape=`<polygon points="${x+w/2},${y} ${x+w},${y+h/2} ${x+w/2},${y+h} ${x},${y+h/2}"/>`;else if(n.kind==='data')shape=`<polygon points="${x+20},${y} ${x+w},${y} ${x+w-20},${y+h} ${x},${y+h}"/>`;else if(n.kind==='connector')shape=`<ellipse cx="${x+w/2}" cy="${y+h/2}" rx="${n.label?50:12}" ry="18"/>`;else shape=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${n.kind==='terminal'?h/2:0}"/>`+(n.kind==='predefined'?`<path d="M${x+15},${y} V${y+h} M${x+w-15},${y} V${y+h}"/>`:'');content.push(`<g data-node="${ci}-${n.id}" data-symbol="${n.kind}" fill="white" stroke="#222" stroke-width="1.5"><title>${escape(n.label)}</title>${shape}</g>`);n.lines.forEach((line,index)=>content.push(`<text x="${x+w/2}" y="${y+h/2+(index-(n.lines.length-1)/2)*17+5}" text-anchor="middle" font-size="13">${escape(line)}</text>`));}
  offset=y+80;
 }
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${offset}" viewBox="0 0 ${width} ${offset}" role="img" aria-label="Схема алгоритма EMS"><title>EMS — ${escape(chart.standard)}</title><desc>Выбранные символы ГОСТ 19.701-90. Семантический поток, без значений отладчика. Полное оформление ЕСПД и неподдерживаемые профили не заявляются.</desc><defs><marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#222"/></marker></defs><rect width="100%" height="100%" fill="white"/><g font-family="Arial, sans-serif" fill="#111"><text x="40" y="35" font-size="18">Схема программы EMS · ГОСТ 19.701-90</text>${content.join('\n')}</g></svg>`;
}
export function exportFlowchartSVG(ir,registry){return renderFlowchartSVG(buildFlowchart(ir,registry));}
