import {spawn} from 'node:child_process';
import {userInfo} from 'node:os';
import {dirname,join} from 'node:path';

// Explicit local QA isolation. The application and public HTTPS smoke use ordinary networking.
if(process.argv.slice(2).join(',')!=='--isolated-network'||process.platform!=='linux')throw new Error('Expected --isolated-network on Linux');
const user=userInfo();if(user.uid===0)throw new Error('Run isolated QA as an ordinary user with noninteractive sudo access');
const nodeDirectory=dirname(process.execPath),taskPath=nodeDirectory+':'+(process.env.PATH??'/usr/bin:/bin');
// Only loopback is configured in a new namespace. Drop root before starting npm/Node/Chromium.
// Positional arguments are quoted; neither the username nor PATH is evaluated as shell code.
const script='set -eu; ip link set lo up; ip -brief address; exec runuser -u "$1" -- env "$2" "$3" run browser:test';
console.log('Local browser QA: isolated network namespace; tests run as the original user. No retries or timeout changes.');
const child=spawn('sudo',['-n','unshare','--net','sh','-c',script,'ems-browser-qa',user.username,'PATH='+taskPath,join(nodeDirectory,'npm')],{cwd:join(import.meta.dirname,'..'),stdio:'inherit'});
child.once('error',error=>{console.error(error.message);process.exitCode=1;});
child.once('exit',(code,signal)=>{process.exitCode=signal?1:code??1;});
