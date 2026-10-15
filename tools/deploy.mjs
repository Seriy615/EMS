import {spawnSync,spawn} from 'node:child_process';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..'),host='ems-vps';
function run(command,args,input){const result=spawnSync(command,args,{cwd:root,input,stdio:[input===undefined?'inherit':'pipe','inherit','inherit']});if(result.status!==0)throw new Error(`${command} failed (${result.status})`);}
function output(command,args,input){const result=spawnSync(command,args,{cwd:root,input,encoding:'utf8'});if(result.status!==0)throw new Error(`${command} failed`);return result.stdout.trim();}
const isolatedBrowserNetwork=process.argv.slice(2).includes('--isolated-browser-network');
if(process.argv.slice(2).some(arg=>arg!=='--isolated-browser-network'))throw new Error('Unknown deployment option');
const revision=output('git',['rev-parse','HEAD']);if(!/^[a-f0-9]{40}$/.test(revision)||output('git',['status','--porcelain']))throw new Error('Deploy requires a clean committed worktree');
for(const script of ['test','verify','browser:test']){if(script==='browser:test'&&isolatedBrowserNetwork)run(process.execPath,['tools/run-browser-qa.mjs','--isolated-network']);else run('npm',script==='test'?['test']:['run',script]);}
if(output('git',['rev-parse','HEAD'])!==revision||output('git',['status','--porcelain']))throw new Error('Worktree changed during checks');
const release='/opt/ems-language-dev/releases/'+revision;
run('ssh',['-o','BatchMode=yes',host,`bash -s -- ${revision}`],`set -euo pipefail
root=/opt/ems-language-dev
if [[ -e $root && ! -f $root/.ems-language-deployment ]]; then echo 'Unowned deployment directory'; exit 2; fi
for owned in /etc/nginx/sites-available/ems-language-dev /etc/systemd/system/ems-language-dev.service; do
 if [[ -e $owned ]]; then head -1 "$owned" | grep -qx '# Managed by EMS language deployment' || exit 3; fi
done
mkdir -p "$root/releases/$1"
touch "$root/.ems-language-deployment"
`);
await new Promise((yes,no)=>{const archive=spawn('git',['archive','--format=tar',revision],{cwd:root,stdio:['ignore','pipe','inherit']}),upload=spawn('ssh',['-o','BatchMode=yes',host,`tar -xf - --no-same-owner -C ${release}`],{stdio:['pipe','inherit','inherit']});let archiveStatus,uploadStatus;function done(){if(archiveStatus!==undefined&&uploadStatus!==undefined)(archiveStatus===0&&uploadStatus===0?yes:no)(new Error('Release upload failed'));}archive.on('error',no);upload.on('error',no);archive.stdout.pipe(upload.stdin);archive.on('close',code=>{archiveStatus=code;done();});upload.on('close',code=>{uploadStatus=code;done();});});
run('ssh',['-o','BatchMode=yes',host,`bash ${release}/deploy/provision.sh ${revision}`]);
console.log(`Deployed checked revision ${revision}. Public URL: https://dev-ems.d-mash.ru`);
