import test from 'node:test';
import assert from 'node:assert/strict';
import {captureSourceBreakpoint,resolveSourceBreakpoint,UISourceBreakpointStorage} from '../src/studio/source-anchors.mjs';
import {breakpointAtTextOffset} from '../src/studio/breakpoints.mjs';
import {compileTextDraft,runTextDraft} from '../src/studio/text.mjs';
import {ProjectEditor,newProject} from '../src/studio/project.mjs';
import {compileIRToJS} from '../src/ir/index.mjs';
import {GraphStepper,breakpointForEvent} from '../src/studio/debugger.mjs';
const editor=new ProjectEditor(newProject('anchors'));
const compile=(source,lowering='auto')=>compileTextDraft({source,entry:'main',lowering},editor);
const anchor=(source,needle,lowering='auto')=>captureSourceBreakpoint(compile(source,lowering),breakpointAtTextOffset(compile(source,lowering),source.indexOf(needle)));

test('control anchor survives comments and inserted sibling operations, with a fresh address and real runtime pause',async()=>{
 const before='fn main(x:Number)->Number {if false {return 0;}core.add(x,2);return x+1;}',saved=JSON.parse(JSON.stringify(anchor(before,'return x+1')));
 const after='// shifted\nfn main(x:Number)->Number {if false {return 0;}core.add(x,9);core.add(x,2);return x+1;}',bundle=compile(after),resolved=resolveSourceBreakpoint(bundle,saved);
 assert.equal(saved.point.node,'/body/2');assert.equal(resolved.point.node,'/body/3');assert.equal(resolved.reason,null);
 const stops=[],gate=new GraphStepper(p=>{stops.push(p);queueMicrotask(()=>gate.resume(p.token,'continue'));},{start:'continue',breakpoints:[resolved.point]});
 const original=JSON.stringify(bundle.ir);assert.equal(await runTextDraft({source:after,entry:'main',lowering:'auto'},editor,{x:4},{onControlEnter:e=>gate.enter(e)}),5);
 assert.equal(stops.length,1);assert.deepEqual(breakpointForEvent(stops[0]),resolved.point);assert.equal(after.slice(stops[0].location.start.offset,stops[0].location.end.offset),'return x+1;');assert.equal(JSON.stringify(bundle.ir),original);const js=compileIRToJS(bundle.ir,bundle.registry),standalone=await import('data:text/javascript,'+encodeURIComponent(js));assert.equal(await standalone.execute({x:4}),5);assert.equal(js.includes('ems-source-breakpoint'),false);
});

test('changed operation, owner, declaration or control context never falls back to the old path',()=>{
 const source='fn main(x:Number)->Number {let y=x;while y<2 {return y+1;}return 0;}',saved=anchor(source,'return y');
 for(const next of [source.replace('y+1','y+2'),source.replace('let y=x','let y=1'),source.replace('y<2','y<3'),source.replace('while y<2','if y<2'),source.replace('return y+1;','core.add(y,1);')]){
  assert.deepEqual(resolveSourceBreakpoint(compile(next),saved),{point:null,reason:'changed-or-missing'});
 }
});

test('duplicate typed operations are ambiguous, including an unchanged old address; removal and undo recover the unique anchor',()=>{
 const source='fn main(x:Number)->Number {if false {return 0;}core.add(x,1);return x;}',saved=anchor(source,'core.add');
 const duplicate=source.replace('return x;','core.add(x,1);return x;');assert.deepEqual(resolveSourceBreakpoint(compile(duplicate),saved),{point:null,reason:'ambiguous'});
 const removed=source.replace('core.add(x,1);','');assert.equal(resolveSourceBreakpoint(compile(removed),saved).point,null);
 assert.deepEqual(resolveSourceBreakpoint(compile(source),saved).point,saved.point);
});

test('call graph anchor follows regenerated node IDs using typed dependency identity',()=>{
 const source='fn main(x:Number)->Number {return core.mul(core.add(x,1),2);}',saved=anchor(source,'core.mul','call');
 const after='fn main(x:Number)->Number {let unused=core.sub(x,3);return core.mul(core.add(x,1),2);}';const resolved=resolveSourceBreakpoint(compile(after,'call'),saved);
 assert.equal(resolved.reason,null);assert.notEqual(resolved.point.node,saved.point.node);
 assert.equal(resolveSourceBreakpoint(compile(after.replace('core.add(x,1)','core.add(x,4)'),'call'),saved).point,null);
});

test('same operation in a different branch or argument role cannot be substituted',()=>{
 const source='fn main(x:Number)->Number {if x>0 {return x+1;}return 0;}',saved=anchor(source,'return x');
 assert.equal(resolveSourceBreakpoint(compile('fn main(x:Number)->Number {if x>0 {return 0;}else {return x+1;}}'),saved).point,null);
 const operands='fn main(x:Number)->Number {return core.sub(x,2);}';const left=anchor(operands,'x,2');assert.equal(resolveSourceBreakpoint(compile(operands.replace('core.sub(x,2)','core.sub(2,x)')),left).point,null);
});

test('anchor transport is bounded and detached from caller points',()=>{
 const source='fn main(x:Number)->Number {if false {return 0;}return x+1;}',bundle=compile(source),point=breakpointAtTextOffset(bundle,source.indexOf('return x+1')),saved=captureSourceBreakpoint(bundle,point);point.node='/body/999';assert.equal(saved.point.node,'/body/1');
 for(const invalid of [null,{...saved,extra:1},{...saved,schemaVersion:'bad'},{...saved,identity:'x'.repeat(1048577)}])assert.throws(()=>resolveSourceBreakpoint(bundle,invalid),{code:'INVALID_DEBUG_ANCHOR'});
 assert.throws(()=>captureSourceBreakpoint(bundle,{...saved.point,node:'/body/999'}),{code:'INVALID_DEBUG_ANCHOR'});
});


test('durable sidecar round-trips detached anchors, rejects corrupt/bounded records without replacing saved data',()=>{
 const data=new Map(),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)},store=new UISourceBreakpointStorage(storage,'project');
 const saved=anchor('fn main(x:Number)->Number {if false {return 0;}return x+1;}','return x+1');store.save([{handler:'change',anchor:saved}]);const before=data.get(store.key);
 saved.point.node='/body/99';assert.equal(store.load()[0].anchor.point.node,'/body/1');
 for(const value of ['null','1','[]','{}','{',JSON.stringify({schemaVersion:'ems-ui-source-breakpoints/1',anchors:[{handler:'event',anchor:{}}]})])assert.throws(()=>store.check(value),{code:'INVALID_DEBUG_ANCHOR'});
 assert.throws(()=>store.save(Array(65).fill({handler:'change',anchor:saved})),{code:'INVALID_DEBUG_ANCHOR'});assert.equal(data.get(store.key),before);
 assert.throws(()=>store.check(' '.repeat(1048577)),{code:'DEBUG_ANCHOR_LIMIT'});
 const source='fn main(x:Number)->Number {if false {return 0;}core.add(x,1);core.add(x,1);return x;}';assert.throws(()=>anchor(source,'core.add'),{code:'AMBIGUOUS_DEBUG_ANCHOR'});
});
