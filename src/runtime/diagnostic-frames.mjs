/** Execution-local diagnostic identity. Never serialized into semantic IR or user values. */
export const DIAGNOSTIC_FRAMES=Symbol('EMS diagnostic frames');
export function diagnosticFrames(options){return options[DIAGNOSTIC_FRAMES]??{allocator:{next:0},stack:[]};}
export function nextDiagnosticFrame(context,parents=context.stack){return [...parents,++context.allocator.next];}
/** Exit notification cannot stall cleanup or replace the program's result/error. */
export function notifyDiagnosticExit(options,frames){
 if(!options.onFrameExit)return;
 try{Promise.resolve(options.onFrameExit?.({frames:[...frames]})).catch(()=>{});}catch{}
}
