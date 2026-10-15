import test from 'node:test';
import assert from 'node:assert/strict';
import {KERNEL_CONTRACTS,instantiateKernelContract} from '../src/contracts/kernel.mjs';
import {ProjectEditor,newProject} from '../src/studio/project.mjs';
import {compileTextDraft,runTextDraft,compileTextJS} from '../src/studio/text.mjs';

test('catalogue kernel contracts lower to checked existing IR and agree in runtime and standalone',async()=>{
 const ids=new Set();
 for(const contract of KERNEL_CONTRACTS){
  assert.ok(!ids.has(contract.id));ids.add(contract.id);
  assert.equal(contract.interface.id,contract.id);assert.equal(contract.version,'1.0.0');
  assert.equal(contract.implementation.kind,'intrinsic');
  assert.ok(contract.interface.inputs.every(port=>port.name&&port.type));assert.ok(contract.interface.outputs.every(port=>port.name&&port.type));
  let body=instantiateKernelContract(contract.id);
  if(['break','continue'].includes(contract.key))body='while false {'+body+'}';
  const draft={source:'@Main()->Number {'+body+' return 0;}',entry:'Main',lowering:'auto'},editor=new ProjectEditor(newProject('kernel'));
  compileTextDraft(draft,editor);
  assert.equal(await runTextDraft(draft,editor,{}),0);
  const output=compileTextJS(draft,editor),module=await import('data:text/javascript;base64,'+Buffer.from(output).toString('base64'));
  assert.equal(await module.execute({}),0);
 }
 assert.throws(()=>instantiateKernelContract('unknown.Control'),e=>e.code==='MISSING_CONTRACT');
});
