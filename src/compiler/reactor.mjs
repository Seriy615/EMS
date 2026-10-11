import {ReactorSession,replayEvents} from '../runtime/reactor.mjs';
import {ReactorKernel,fields,declarations} from '../runtime/reactor-kernel.mjs';
import {stateIntrinsic} from '../runtime/state-bindings.mjs';
import {compileStateControlJS} from './control.mjs';
import {compileIRToJS,signatureIR} from '../ir/index.mjs';
import {CONTROL_VERSION,validateControlIR} from '../ir/control.mjs';
import {checkControlPolicy} from '../runtime/control.mjs';
import {assertPolicyNames} from '../semantics/effects.mjs';
import {EmsError,fail} from '../reference/errors.mjs';
import {typeOfValue,assertValueType,assertTypeName} from '../reference/types.mjs';
import {parseControlType,controlTypeName,controlVariants,assertControlValueType,validateControlInputs} from '../semantics/control-algebraic.mjs';
import {assertSignal,checkCancellation} from '../runtime/cancellation.mjs';

/** Compile a linked finite reactor to an independent module with the same FIFO transaction kernel. */
export function compileReactorJS(manifest,registry){
 // Validate the original semantic artifact before selecting any backend. No handler executes here.
 new ReactorSession(manifest,registry);
 for(const slot of manifest.state)for(const action of ['read','write'])
  if(!stateIntrinsic(registry.resolve(`state.${slot.id}.${action}`)))
   fail('UNSUPPORTED_TARGET','Standalone reactor requires kernel-owned state bindings');
 const implementations=[],handlers=[];
 for(const [index,handler]of manifest.handlers.entries()){
  const control=handler.program.schemaVersion===CONTROL_VERSION;
  const output=control?compileStateControlJS(handler.program,registry):compileIRToJS(handler.program,registry);
  const name=`__handler${index}`;
  implementations.push(`const ${name}=(()=>{${output.replace(/export (async )?function execute\(/,'$1function execute(')}\nreturn execute;})();`);
  const signature=signatureIR(handler.program,registry);
  const inputs=Object.entries(signature.inputs).map(([name,input])=>({name,type:input.type}));
  const policy=control?validateControlIR(handler.program,registry).policy:{effects:[],capabilities:[]};
  handlers.push(`{event:${JSON.stringify(handler.event)},inputs:${JSON.stringify(inputs)},checkPolicy:options=>checkControlPolicy(${JSON.stringify(policy)},options),execute:${name}}`);
 }
 const literal=value=>typeof value==='number'&&Object.is(value,-0)?'-0':Array.isArray(value)?`[${value.map(literal).join(',')}]`:JSON.stringify(value);
 const state=`[${manifest.state.map(slot=>`{id:${JSON.stringify(slot.id)},type:${JSON.stringify(slot.type)},initial:${literal(slot.initial)}}`).join(',')}]`;
 const helpers=[EmsError,fail,typeOfValue,assertValueType,assertTypeName,fields,declarations,assertPolicyNames,checkControlPolicy,parseControlType,controlTypeName,controlVariants,assertControlValueType,validateControlInputs,assertSignal,checkCancellation,ReactorKernel,replayEvents].map(fn=>fn.toString().replace(/^export /,'')).join('\n');
 return `// EMS independent finite reactor. Shared FIFO transaction kernel; no EMS imports.\nconst copy=value=>structuredClone(value),namePattern=/^[A-Za-z_][A-Za-z0-9_]*$/;\nconst PRIMITIVE_TYPES=new Set(['Number','NumberArray','Boolean','String']);\nconst assertPrimitiveValueType=(...args)=>assertValueType(...args);\n${helpers}\n${implementations.join('\n')}\nexport function createSession(options={}){return new ReactorKernel(${state},[${handlers.join(',')}],options);}\nexport {replayEvents};\n`;
}
