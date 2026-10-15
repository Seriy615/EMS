/** Pointer-centred canvas navigation. Camera state stays outside semantic program data. */
export function installCanvasNavigation({viewport,getView,commit,preview,context}){
 let space=false;
 const typing=target=>!!target.closest('input,textarea,select,[contenteditable="true"]');
 function zoom(factor,x=viewport.clientWidth/2,y=viewport.clientHeight/2){const v=getView(),scale=Math.min(2,Math.max(.25,v.scale*factor)),ratio=scale/v.scale;commit({scale,x:x-(x-v.x)*ratio,y:y-(y-v.y)*ratio});}
 viewport.tabIndex=0;viewport.setAttribute('aria-label','Холст программы. Колесо — перемещение, Ctrl и колесо — масштаб, пробел и перетаскивание — панорама.');
 viewport.addEventListener('wheel',event=>{event.preventDefault();const v=getView();if(event.ctrlKey||event.metaKey){const r=viewport.getBoundingClientRect();zoom(Math.exp(-event.deltaY*.002),event.clientX-r.left,event.clientY-r.top);}else{const unit=event.deltaMode===1?16:event.deltaMode===2?viewport.clientHeight:1;commit({...v,x:v.x-(event.shiftKey?event.deltaY:event.deltaX)*unit,y:v.y-(event.shiftKey?0:event.deltaY)*unit});}},{passive:false});
 document.addEventListener('keydown',event=>{if(typing(event.target))return;if(event.code==='Space'){space=true;if(viewport.contains(event.target))event.preventDefault();}if((event.ctrlKey||event.metaKey)&&['+','=','-','0'].includes(event.key)){event.preventDefault();if(event.key==='0'){const v=getView();zoom(1/v.scale);}else zoom(event.key==='-'?1/1.2:1.2);}});
 document.addEventListener('keyup',event=>{if(event.code==='Space')space=false;});window.addEventListener('blur',()=>{space=false;});
 viewport.addEventListener('pointerdown',event=>{
  const pan=event.button===1||(event.button===0&&space);if(!pan)return;if(typing(event.target))return;
  event.preventDefault();event.stopPropagation();context?.close();const original={...getView()},start={x:event.clientX,y:event.clientY};let next=original;viewport.setPointerCapture(event.pointerId);viewport.classList.add('panning');
  const move=e=>{next={...original,x:original.x+e.clientX-start.x,y:original.y+e.clientY-start.y};preview(next);};
  const finish=e=>{viewport.removeEventListener('pointermove',move);viewport.removeEventListener('pointerup',finish);viewport.removeEventListener('pointercancel',cancel);viewport.classList.remove('panning');if(viewport.hasPointerCapture(e.pointerId))viewport.releasePointerCapture(e.pointerId);if(next!==original)commit(next);};
  const cancel=e=>{next=original;preview(original);finish(e);};viewport.addEventListener('pointermove',move);viewport.addEventListener('pointerup',finish);viewport.addEventListener('pointercancel',cancel);
 },{capture:true});
 viewport.addEventListener('contextmenu',event=>{event.preventDefault();event.stopPropagation();context?.open(event);});
 return {zoom};
}
