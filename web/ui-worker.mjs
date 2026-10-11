import {createUIWorkerHost} from '/src/ui/worker-host.mjs';
const handle=createUIWorkerHost(message=>self.postMessage(message));
self.onmessage=event=>{handle(event.data);};
