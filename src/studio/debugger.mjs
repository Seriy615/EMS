import {fail} from '../reference/errors.mjs';

/** Debug metadata is bounded and separate from semantic IR and runtime values. */
export function validateBreakpoints(value){
 if(!Array.isArray(value)||value.length>64)fail('INVALID_DEBUG_BREAKPOINT','Expected at most 64 operation breakpoints');
 const result=[],seen=new Set();
 for(const point of value){
  const keys=point?.profile==='graph'?['profile','graph','node']:['profile','function','node'];
  if(!point||!['graph','control'].includes(point.profile)||Reflect.ownKeys(point).length!==3||keys.some(key=>!Object.hasOwn(point,key)||typeof point[key]!=='string'||!point[key].length||point[key].length>1024))fail('INVALID_DEBUG_BREAKPOINT','Invalid operation breakpoint');
  if(point.profile==='control'&&!/^\/body(?:\/[^/]+)*$/.test(point.node))fail('INVALID_DEBUG_BREAKPOINT','Expected a structural control node address');
  const copy=Object.fromEntries(keys.map(key=>[key,point[key]])),key=JSON.stringify(copy);
  if(!seen.has(key)){seen.add(key);result.push(copy);}
 }
 return result;
}
export function breakpointForEvent(event){
 if(event.profile==='control')return {profile:'control',function:event.function,node:event.node};
 const call=event.callPath?.at(-1);return call?{profile:'graph',graph:call.graph,node:call.node}:null;
}
function matches(event,points){
 const at=breakpointForEvent(event);return !!at&&points.some(point=>point.profile===at.profile&&point.node===at.node&&(at.profile==='graph'?point.graph===at.graph:point.function===at.function));
}
/** Payload-free operation gate for sequential and concurrent tasks in the existing evaluator. */
export class GraphStepper {
 #paused=null;
 #queue=[];
 #sequence=0;
 #continuous=false;
 #breakpoints=[];
 constructor(onPause,options={}){
  if(!options||typeof options!=='object'||Array.isArray(options)||Reflect.ownKeys(options).some(key=>!['breakpoints','start'].includes(key)))fail('INVALID_DEBUG_OPTION','Invalid operation gate options');
  const {breakpoints=[],start='step'}=options;
  if(typeof onPause!=='function'||!['step','continue'].includes(start))fail('INVALID_DEBUG_OPTION','Invalid operation gate options');
  this.onPause=onPause;this.#breakpoints=validateBreakpoints(breakpoints);this.#continuous=start==='continue';
 }
 async enter(event){
  if(this.#continuous&&!matches(event,this.#breakpoints))return;
  const token=++this.#sequence;
  await new Promise(resolve=>{this.#queue.push({token,event:structuredClone(event),resolve});this.#advance();});
 }
 #advance(){
  if(this.#paused)return;
  while(this.#queue.length){
   const pending=this.#queue.shift();
   if(this.#continuous&&!matches(pending.event,this.#breakpoints)){pending.resolve();continue;}
   this.#paused=pending;
   try{this.onPause({...pending.event,token:pending.token});}catch{if(this.#paused===pending)this.resume(pending.token,'step');}
   return;
  }
 }
 /** Only the current pause may edit debugger policy; it never releases execution. */
 update(token,breakpoints){
  if(!this.#paused||token!==this.#paused.token)return false;
  this.#breakpoints=validateBreakpoints(breakpoints);return true;
 }
 resume(token,mode){
  if(!this.#paused||token!==this.#paused.token||!['step','continue'].includes(mode))return false;
  const pending=this.#paused;this.#paused=null;
  this.#continuous=mode==='continue';pending.resolve();this.#advance();return true;
 }
}
