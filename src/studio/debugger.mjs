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
function validFrames(value){return Array.isArray(value)&&value.length>0&&value.length<=64&&value.every(id=>Number.isSafeInteger(id)&&id>0)&&new Set(value).size===value.length;}
/** Payload-free operation gate for sequential and concurrent tasks in the existing evaluator. */
export class GraphStepper {
 #paused=null;
 #queue=[];
 #sequence=0;
 #continuous=false;
 #breakpoints=[];
 #plan=null;
 constructor(onPause,options={}){
  if(!options||typeof options!=='object'||Array.isArray(options)||Reflect.ownKeys(options).some(key=>!['breakpoints','start'].includes(key)))fail('INVALID_DEBUG_OPTION','Invalid operation gate options');
  const {breakpoints=[],start='step'}=options;
  if(typeof onPause!=='function'||!['step','continue'].includes(start))fail('INVALID_DEBUG_OPTION','Invalid operation gate options');
  this.onPause=onPause;this.#breakpoints=validateBreakpoints(breakpoints);this.#continuous=start==='continue';
 }
 #shouldPause(event){
  if(matches(event,this.#breakpoints)||!this.#continuous)return true;
  if(!this.#plan||!validFrames(event.frames))return false;
  const anchor=this.#plan.event,frames=anchor.frames;
  const ancestor=event.frames.length<frames.length&&event.frames.every((id,index)=>id===frames[index]);
  if(ancestor)return this.#plan.completed;
  if(this.#plan.mode==='out'||event.frames.length!==frames.length||!event.frames.every((id,index)=>id===frames[index]))return false;
  return anchor.profile!=='control'||event.profile!=='control'||!event.node.startsWith(anchor.node+'/');
 }
 async enter(event){
  if(!this.#shouldPause(event))return;
  const token=++this.#sequence;
  await new Promise(resolve=>{this.#queue.push({token,event:structuredClone(event),resolve});this.#advance();});
 }
 #advance(){
  if(this.#paused)return;
  while(this.#queue.length){
   const pending=this.#queue.shift();
   if(!this.#shouldPause(pending.event)){pending.resolve();continue;}
   this.#paused=pending;
   try{this.onPause({...pending.event,token:pending.token});}catch{if(this.#paused===pending)this.resume(pending.token,'step');}
   return;
  }
 }
 /** Original evaluator reports frame completion, including failures and cleanup. */
 leave(event){
  if(this.#plan&&validFrames(event.frames)&&event.frames.at(-1)===this.#plan.event.frames.at(-1))this.#plan.completed=true;
 }
 /** Only the current pause may edit debugger policy; it never releases execution. */
 update(token,breakpoints){
  if(!this.#paused||token!==this.#paused.token)return false;
  this.#breakpoints=validateBreakpoints(breakpoints);return true;
 }
 resume(token,mode){
  if(!this.#paused||token!==this.#paused.token||!['step','continue','over','out'].includes(mode))return false;
  const pending=this.#paused;
  if(['over','out'].includes(mode)&&!validFrames(pending.event.frames))return false;
  this.#paused=null;this.#plan=['over','out'].includes(mode)?{mode,event:pending.event,completed:false}:null;
  this.#continuous=mode!=='step';pending.resolve();this.#advance();return true;
 }
}
