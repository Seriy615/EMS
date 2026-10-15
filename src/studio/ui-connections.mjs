/** Static binding routes derived from the checked UI application, never a second program. */
export function uiConnections(application){
 const widgets=[];const visit=node=>{widgets.push(node);node.children.forEach(visit);};visit(application.ui.root);
 const properties=widgets.flatMap(widget=>Object.entries(widget.props).filter(([,ref])=>ref.state).map(([property,ref])=>({widget:widget.id,property,state:ref.state,format:ref.format??null})));
 const stateTargets=new Map(application.reactor.state.flatMap(slot=>['read','write'].map(action=>[`state.${slot.id}.${action}`,{slot:slot.id,action}])));
 const handlers=application.reactor.handlers.map(handler=>{
  const reads=new Set(),writes=new Set();
  // Only generated state interfaces of declared slots are identified. These are potential
  // dependencies across all branches, not a claim that an operation ran in this session.
  const visited=new Set(),functions=new Map((handler.program.functions??[]).map(fn=>[fn.id,fn]));
  const scan=value=>{if(!value||typeof value!=='object')return;
   const binding=stateTargets.get(value.contract?.id??(value.target?.kind==='contract'?value.target.id:null));if(binding)(binding.action==='read'?reads:writes).add(binding.slot);
   if(value.target?.kind==='function')visitFunction(value.target.id);
   for(const child of Object.values(value))scan(child);
  };
  const visitFunction=id=>{if(visited.has(id))return;visited.add(id);scan(functions.get(id));};
  if(handler.program.schemaVersion==='ems-ir/2')visitFunction(handler.program.entry);else scan(handler.program);
  return {event:handler.event,reads:[...reads],writes:[...writes]};
 });
 const events=widgets.flatMap(widget=>Object.entries(widget.events).map(([event,binding])=>({widget:widget.id,event,handler:binding.handler,inputs:structuredClone(binding.inputs)})));
 return {events,handlers,properties,state:application.reactor.state.map(({id,type})=>({id,type}))};
}
