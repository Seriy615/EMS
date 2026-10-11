import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {packageTAR} from '../src/compiler/archive.mjs';
import {buildUIProjectPackage} from '../src/compiler/ui-package.mjs';
import {exportUIProject} from '../tools/export-ui.mjs';
import {policy} from './helpers/ui-fixture.mjs';

test('browser archive is deterministic and system tar extracts exact UTF-8/empty/block-boundary contents',async()=>{
 const files={'index.html':'<title>Привет EMS</title>','empty.txt':'','boundary.txt':'x'.repeat(512),'long.txt':'я'.repeat(513)},archive=packageTAR(files),dir=await mkdtemp(join(tmpdir(),'ems-tar-'));
 try{assert.deepEqual(packageTAR(files),archive);assert.equal(archive.length%512,0);await writeFile(join(dir,'app.tar'),archive);assert.deepEqual(execFileSync('tar',['-tf',join(dir,'app.tar')],{encoding:'utf8'}).trim().split('\n'),Object.keys(files));execFileSync('tar',['-xf',join(dir,'app.tar'),'-C',dir]);for(const [name,contents]of Object.entries(files))assert.equal(await readFile(join(dir,name),'utf8'),contents);}finally{await rm(dir,{recursive:true,force:true});}
});
test('archive rejects paths, unsafe names, non-text data and oversized contents',()=>{
 for(const name of ['../escape','/absolute','folder/file','a\\b','.','..','nul\0name','é.txt'])assert.throws(()=>packageTAR({[name]:'text'}),{code:'INVALID_PACKAGE'});
 assert.throws(()=>packageTAR({'file.txt':new Uint8Array()}),{code:'INVALID_PACKAGE'});assert.throws(()=>packageTAR({'file.txt':'x'.repeat(16*1024*1024)}),{code:'PACKAGE_LIMIT'});assert.throws(()=>packageTAR(Object.fromEntries(Array.from({length:17},(_,i)=>['f'+i,'']))),{code:'PACKAGE_LIMIT'});
});
test('shared Web/Node package builder produces byte-identical CLI files and no implicit grants',async()=>{
 const source=await readFile('examples/ui-source-counter.ems-ui.json','utf8'),dir=await mkdtemp(join(tmpdir(),'ems-package-parity-'));
 try{await assert.rejects(buildUIProjectPackage(source),{code:'PERMISSION_DENIED'});const files=await buildUIProjectPackage(source,{policy});await exportUIProject(source,dir,{policy});for(const [name,contents]of Object.entries(files))assert.equal(await readFile(join(dir,name),'utf8'),contents);}finally{await rm(dir,{recursive:true,force:true});}
});
