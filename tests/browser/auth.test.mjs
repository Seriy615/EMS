import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {startStudioServer} from '../../tools/serve.mjs';
import {launchChromium} from '../../tools/lib/chromium.mjs';
test('real HTTP auth challenge populates browser credentials for module Worker execution',async()=>{
 const studio=await startStudioServer({port:0}),credentials={username:'test-owner',password:'local-auth-test-only'},authorization='Basic '+Buffer.from(credentials.username+':'+credentials.password).toString('base64');let browser;
 const proxy=createServer(async(req,res)=>{if(req.headers.authorization!==authorization){res.writeHead(401,{'WWW-Authenticate':'Basic realm="EMS test"'});res.end('Authentication required');return;}try{const upstream=await fetch(studio.origin+req.url);res.writeHead(upstream.status,Object.fromEntries(upstream.headers));res.end(Buffer.from(await upstream.arrayBuffer()));}catch{res.writeHead(502);res.end();}});await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+proxy.address().port;
 try{assert.equal((await fetch(origin)).status,401);browser=await launchChromium();const page=await browser.page(origin,{credentials});const result=await page.evaluate(`(async()=>{await import('/web/studio.mjs');document.querySelector('[data-contract="core.add"]').click();document.querySelector('[data-node="n1"][data-port="out"]').click();document.querySelector('[data-node="output"][data-port="return"]').click();document.querySelector('#run').click();const end=Date.now()+5000;while(document.querySelector('#run').disabled){if(Date.now()>end)throw new Error('Authenticated Worker did not settle');await new Promise(r=>setTimeout(r,10));}return {value:document.querySelector('#output').textContent,error:document.querySelector('#error').textContent};})()`);assert.deepEqual(result,{value:'0',error:''});assert.equal((await fetch(origin)).status,401);
 }finally{await browser?.close();await new Promise(resolve=>{proxy.close(resolve);proxy.closeAllConnections();});await studio.close();}
});
