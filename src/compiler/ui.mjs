import {validateUIStyles} from '../ui/styles.mjs';
import {linkUIApplication} from '../ui/model.mjs';
import {UIKernel,kinds,record,valueOf,checkUIPolicy,createUIRuntimeLink,renderUITree} from '../ui/kernel.mjs';
import {mountDOMRuntime} from '../ui/dom.mjs';
import {compileReactorJS} from './reactor.mjs';
import {EmsError,fail} from '../reference/errors.mjs';
import {assertValueType,typeOfValue} from '../reference/types.mjs';
import {assertPolicyNames} from '../semantics/effects.mjs';

/** Preserve finite values and literal record keys, including signed zero and __proto__. */
function literal(value){
 if(typeof value==='number'&&Object.is(value,-0))return '-0';
 if(Array.isArray(value))return `[${value.map(literal).join(',')}]`;
 if(value!==null&&typeof value==='object')return `Object.fromEntries([${Object.entries(value).map(([key,item])=>`[${JSON.stringify(key)},${literal(item)}]`).join(',')}])`;
 return JSON.stringify(value);
}
/** Emit independent semantic UI and DOM mapping over the common compiled state session. */
export function compileUIJS(application,baseRegistry){
 const link=linkUIApplication(application,baseRegistry);
 const reactor=compileReactorJS(link.application.reactor,link.registry)
  .replace(/^export function (createSession|checkSessionPolicy)\(/gm,'function $1(')
  .replace(/^export \{replayEvents\};$/m,'');
 const data={ui:link.application.ui,reactor:{state:link.application.reactor.state}};
 const helpers=[validateUIStyles,EmsError,fail,typeOfValue,assertValueType,assertPolicyNames,record,valueOf,checkUIPolicy,createUIRuntimeLink,renderUITree,UIKernel,mountDOMRuntime].map(fn=>fn.toString()).join('\n');
 return `// EMS independent finite semantic UI application. No EMS imports or service dependency.\nconst clone=value=>structuredClone(value),mounted=new WeakMap(),kinds=Object.freeze(${JSON.stringify(kinds)});\n${helpers}\nconst __reactor=(()=>{${reactor}\nreturn {createSession,checkSessionPolicy};})();\nconst __application=${literal(data)};\nexport function createRuntime(options={}){const policy=options.policy??{};checkUIPolicy(policy);const session=__reactor.createSession(options);__reactor.checkSessionPolicy(policy);return new UIKernel(createUIRuntimeLink(__application,session));}\nexport function mountApplication(host,{onError=()=>{},...options}={}){\nif(!host?.ownerDocument||typeof host.replaceChildren!=='function'||typeof onError!=='function')fail('INVALID_UI','DOM host and error callback required');\nif(mounted.has(host))fail('UI_HOST_BUSY','DOM host already owns a mounted EMS application');\nreturn mountDOMRuntime(host,__application,createRuntime(options),{onError});}\n`;
}
