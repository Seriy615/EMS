/** Payload-free operation gate. This controls the existing evaluator, not a second interpreter. */
export class GraphStepper {
  #paused=null;
  #sequence=0;
  #continuous=false;
  constructor(onPause){this.onPause=onPause;}
  async enter(event){
    if(this.#continuous)return;
    const token=++this.#sequence;
    await new Promise(resolve=>{
      this.#paused={token,resolve};
      try{this.onPause({...structuredClone(event),token});}catch{this.#paused=null;resolve();}
    });
  }
  resume(token,mode){
    if(!this.#paused||token!==this.#paused.token||!['step','continue'].includes(mode))return false;
    const pending=this.#paused;this.#paused=null;
    this.#continuous=mode==='continue';pending.resolve();return true;
  }
}
