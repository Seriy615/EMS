import {handlerSourceGraph,replaceHandlerGraphNode} from '../src/studio/control-graph.mjs';
const ns='http://www.w3.org/2000/svg';
/** Graph selection/editing is a view over checked source; all commits use existing transactional authoring. */
export function installControlGraph(getEditor,change,report){
 const host=document.querySelector('#control-graph'),snippet=document.querySelector('#graph-node-source'),detail=document.querySelector('#graph-node-detail');let graph,selected;
 const svg=(tag,attrs)=>{const node=document.createElementNS(ns,tag);for(const [key,value]of Object.entries(attrs))node.setAttribute(key,value);return node;};
 function open(){try{
  graph=handlerSourceGraph(getEditor(),document.querySelector('#handler-select').value);selected=null;snippet.value='';detail.textContent='Выберите узел для просмотра и изменения.';host.replaceChildren();
  const positions=new Map(graph.nodes.map((node,index)=>[node.id,{x:20+node.depth*190,y:20+index*62}]));
  const width=Math.max(600,...[...positions.values()].map(p=>p.x+185)),height=Math.max(140,graph.nodes.length*62+40),canvas=svg('svg',{width,height,role:'img','aria-label':'Граф обработчика EMS'});
  for(const edge of graph.edges){const a=positions.get(edge.from),b=positions.get(edge.to);const line=svg('path',{d:`M ${a.x+170} ${a.y+22} C ${a.x+185} ${a.y+22}, ${b.x-15} ${b.y+22}, ${b.x} ${b.y+22}`,class:'edge-'+edge.kind,fill:'none',stroke:edge.kind==='data'?'#85bfdc':'#dcbb85'});const title=svg('title',{});title.textContent=edge.kind+': '+edge.label;line.append(title);canvas.append(line);}
  for(const node of graph.nodes){const p=positions.get(node.id),group=svg('g',{'data-control-node':node.id,tabindex:0,role:'button','aria-label':node.kind+' '+node.label,transform:`translate(${p.x} ${p.y})`});group.append(svg('rect',{width:170,height:45,rx:6,fill:node.contract?'#263b54':'#1b3040',stroke:'#89a5c5'}));const text=svg('text',{x:8,y:18,fill:'#e7edf7'});text.textContent=(node.contract?.id??node.label).slice(0,24);const type=svg('text',{x:8,y:35,fill:'#a9c0d8'});type.textContent=(node.type??node.kind).slice(0,26);group.append(text,type);
   function select(){selected=node;snippet.value=node.text;detail.textContent=node.kind+(node.type?' : '+node.type:'')+(node.contract?' — '+node.contract.kind+' '+node.contract.id+'@'+node.contract.version:'')+' — '+node.location.start.line+':'+node.location.start.column;for(const other of canvas.querySelectorAll('g'))other.classList.toggle('selected',other===group);}
   group.onclick=select;group.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select();}};canvas.append(group);
  }
  host.append(canvas);
 }catch(failure){graph=null;selected=null;host.replaceChildren();report(failure);}}
 document.querySelector('#open-control-graph').onclick=open;
 document.querySelector('#apply-graph-node').onclick=()=>{if(!graph||!selected)return;const current=graph,node=selected,replacement=snippet.value;change(editor=>replaceHandlerGraphNode(editor,current.event,current.source,node.id,replacement)).then(()=>{const draft=getEditor().sources[current.event];document.querySelector('#handler-event').value=current.event;document.querySelector('#handler-entry').value=draft.entry;document.querySelector('#handler-source').value=draft.source;open();}).catch(report);};
 return {open};
}
