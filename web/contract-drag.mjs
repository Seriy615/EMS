/** Mouse drag is immediate; touch scrolls normally and requires a hold before drag. */
export function installContractDrag(button,drop){
 button.addEventListener('contextmenu',event=>event.preventDefault());button.draggable=false;button.style.touchAction='pan-y';let suppressUntil=0;
 button.addEventListener('click',event=>{if(event.detail>0&&performance.now()<suppressUntil){event.preventDefault();event.stopImmediatePropagation();}},{capture:true});
 button.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;const touch=event.pointerType==='touch',start={x:event.clientX,y:event.clientY};let armed=!touch,cancelled=false,moved=false,ghost,timer;
  const arm=()=>{if(cancelled)return;armed=true;button.setPointerCapture(event.pointerId);button.classList.add('drag-ready');};
  if(touch)timer=setTimeout(arm,380);else arm();
  const preventScroll=e=>{if(armed&&!cancelled)e.preventDefault();};button.addEventListener('touchmove',preventScroll,{passive:false});
  const move=e=>{const distance=Math.hypot(e.clientX-start.x,e.clientY-start.y);if(!armed){if(distance>8){cancelled=true;clearTimeout(timer);}return;}if(!moved&&distance<6)return;moved=true;e.preventDefault();suppressUntil=performance.now()+700;if(!ghost){ghost=document.createElement('div');ghost.className='ui-drag-ghost';ghost.textContent=button.textContent;document.body.append(ghost);}ghost.style.left=e.clientX+12+'px';ghost.style.top=e.clientY+12+'px';if(matchMedia('(max-width:700px)').matches)document.body.classList.add('mobile-dragging');};
  const finish=e=>{clearTimeout(timer);button.removeEventListener('pointermove',move);button.removeEventListener('pointerup',finish);button.removeEventListener('pointercancel',cancel);button.removeEventListener('touchmove',preventScroll);button.classList.remove('drag-ready');ghost?.remove();const target=document.elementFromPoint(e.clientX,e.clientY);if(moved&&!cancelled&&target)drop({target,clientX:e.clientX,clientY:e.clientY});document.body.classList.remove('mobile-dragging');};
  const cancel=e=>{cancelled=true;finish(e);};button.addEventListener('pointermove',move);button.addEventListener('pointerup',finish);button.addEventListener('pointercancel',cancel);
 });
}
