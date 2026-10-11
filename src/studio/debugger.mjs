/** Payload-free operation gate for sequential and concurrent tasks in the existing evaluator. */
export class GraphStepper {
  #paused=null;
  #queue=[];
  #sequence=0;
  #continuous=false;
  constructor(onPause){this.onPause=onPause;}
  async enter(event){
    if(this.#continuous)return;
    const token=++this.#sequence;
    await new Promise(resolve=>{this.#queue.push({token,event:structuredClone(event),resolve});this.#advance();});
  }
  #advance(){
    if(this.#paused||!this.#queue.length)return;
    this.#paused=this.#queue.shift();
    const pending=this.#paused;
    try{this.onPause({...pending.event,token:pending.token});}catch{if(this.#paused===pending)this.resume(pending.token,'step');}
  }
  resume(token,mode){
    if(!this.#paused||token!==this.#paused.token||!['step','continue'].includes(mode))return false;
    const pending=this.#paused;this.#paused=null;
    this.#continuous=mode==='continue';pending.resolve();
    if(this.#continuous){for(const item of this.#queue.splice(0))item.resolve();}else this.#advance();
    return true;
  }
}
