import { createCoreRegistry, executeGraph, validateGraph } from '/src/reference/index.mjs';
const $=id=>document.getElementById(id);
const [base,nested] = await Promise.all([
  fetch('/examples/avg5.graph.json').then(r=>r.json()),
  fetch('/examples/composite-using-atomic.graph.json').then(r=>r.json())
]);
const reg = createCoreRegistry().registerComposite({id:base.id,graph:base});
let active=base, selected=null;
const svgNS='http://www.w3.org/2000/svg';
function element(tag,attrs,text){const e=document.createElementNS(svgNS,tag);for(const [k,v] of Object.entries(attrs??{}))e.setAttribute(k,String(v));if(text!==undefined)e.textContent=text;return e;}
function shorten(s,n=22){return s.length>n?s.slice(0,n-1)+'…':s;}
function selection(node){selected=node; renderInspector(); renderGraph();}
function renderInspector(){
  if(!selected){$('inspector').textContent='Выберите контракт на диаграмме.';return;}
  const c=reg.resolve(selected.uses);
  const props=Object.entries(c.inputs).map(([key,type])=>`<span class="pill">${key}: ${typeof type==='string'?type:type.type}</span>`).join('');
  const args=Object.entries(selected.args).map(([k,v])=>`<div><code>${k}</code> ← <code>${Object.values(v)[0]}</code></div>`).join('');
  $('inspector').innerHTML=`<strong>${c.id.replaceAll('<','&lt;')}</strong><div>Тип: ${c.kind==='composite'?'составной':'атомарный'}</div><div>Выход: <code>${c.output}</code></div><div>${props}</div>${args}<div style="margin-top:12px">${c.kind==='composite'?'Составной граф можно раскрыть: выберите пример «Composite», чтобы увидеть уровень вызова; исходный AVG5 представлен отдельным графом.':'Атомарный блок. Внутренний EMS-граф не предоставляется.'}</div>`;
}
function renderGraph(){
  const svg=$('graph');svg.replaceChildren();
  const positions=new Map();const nodes=active.nodes;
  // Visual reference diagram only, no complex DAG layout or graph editing.
  const cols=nodes.length<=2?1:2;const top=130;const rowHeight=94;
  nodes.forEach((node,i)=>{
    const row=Math.floor(i/cols), col=i%cols;
    positions.set(node.id,{x:cols===1?250:col?435:80,y:top+row*rowHeight});
  });
  const rows=Math.ceil(nodes.length/cols);
  const height=Math.max(350,top+rows*rowHeight+45);
  svg.setAttribute('viewBox',`0 0 720 ${height}`);
  // Input box
  svg.append(element('rect',{x:250,y:18,width:220,height:56,rx:9,class:'source'}));
  svg.append(element('text',{x:360,y:41,'text-anchor':'middle',class:'node-title'},'Вход: times'));
  svg.append(element('text',{x:360,y:58,'text-anchor':'middle',class:'node-type'},'NumberArray[5] (demo)'));
  for(const n of nodes){
    const to=positions.get(n.id);
    for(const ref of Object.values(n.args)){
      const from=ref.node?positions.get(ref.node):ref.input?{x:250,y:18}:null;
      if(from){const x1=from.x+ (ref.node?100:110),y1=from.y+(ref.node?57:56),x2=to.x+100,y2=to.y;
        svg.append(element('path',{d:`M ${x1} ${y1} C ${x1} ${y1+30}, ${x2} ${y2-24}, ${x2} ${y2}`,class:'connector'}));}
    }
  }
  nodes.forEach(n=>{
    const p=positions.get(n.id),c=reg.resolve(n.uses),g=element('g',{'data-node':n.id});
    g.append(element('rect',{x:p.x,y:p.y,width:200,height:57,rx:9,class:`node-rect ${c.kind==='composite'?'composite':''} ${selected?.id===n.id?'selected':''}`}));
    g.append(element('text',{x:p.x+13,y:p.y+23,class:'node-title'},shorten(n.uses,26)));
    g.append(element('text',{x:p.x+13,y:p.y+43,class:'node-type'},`${c.kind}  •  ${c.output}`));
    g.append(element('circle',{cx:p.x+100,cy:p.y, r:4,class:'port'}));
    g.addEventListener('click',()=>selection(n));g.style.cursor='pointer';svg.append(g);
  });
  svg.append(element('text',{x:360,y:height-23,'text-anchor':'middle',class:'node-type'},`return ${active.returns.node??active.returns.input} → ${active.output.type}`));
}
$('example').addEventListener('change',e=>{active=e.target.value==='nested'?nested:base;selected=null;renderGraph();renderInspector();$('description').textContent=active.id;});
$('execute').addEventListener('click',async()=>{
  try {
    const times=JSON.parse($('times').value);
    validateGraph(active,reg);
    const result=await executeGraph(active,{times},reg);
    $('output').textContent=JSON.stringify({contract:active.id,result},null,2);
  } catch(err) {$('output').textContent=`${err.code??'ERROR'}: ${err.message}`;}
});
$('description').textContent=base.id;
renderGraph();
