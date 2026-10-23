// Move the actual undo/redo controls; keep a single set of engine handlers.
window.addEventListener('DOMContentLoaded',()=>{
 const compact=matchMedia('(max-width:780px), (max-width:1100px) and (max-height:560px)');
 const history=document.createElement('nav');history.className='mobile-history';history.setAttribute('aria-label','撤销与重做');
 document.querySelector('.canvas-bar .inline-controls').before(history);
 const controls=['undo','redo'].map(id=>{const button=document.getElementById(id),anchor=document.createComment(id+' desktop position');button.before(anchor);return{button,anchor}});
 // A cancelled/dragged canvas touch can suppress the next compatibility click.
 // Trigger history once on touch release and consume only its duplicate native click.
 for(const{button}of controls){let released=-Infinity;button.addEventListener('pointerup',event=>{
  if(event.pointerType!=='touch'||button.disabled)return;
  const hit=document.elementFromPoint(event.clientX,event.clientY);if(!hit||!button.contains(hit))return;
  event.preventDefault();released=performance.now();button.click();
 });button.addEventListener('click',event=>{if(event.isTrusted&&event.detail>0&&performance.now()-released<500){event.preventDefault();event.stopImmediatePropagation();}},true);}
 function layout(){for(const{button,anchor}of controls){if(compact.matches)history.append(button);else anchor.after(button)}window.dispatchEvent(new Event('resize'));}
 compact.addEventListener('change',layout);layout();
 for(const[id,label]of Object.entries({compare:'原图',comparePrevious:'上一步',restoreAll:'重置'})){
  const button=document.getElementById(id);button.setAttribute('aria-label',button.textContent.trim());
  for(const node of [...button.childNodes])if(node.nodeType===Node.TEXT_NODE){const span=document.createElement('span');span.className='desktop-action-label';span.textContent=node.textContent;node.replaceWith(span)}
  const small=document.createElement('span');small.className='compact-action-label';small.textContent=label;button.append(small);
 }
 document.querySelectorAll('input[type=number]').forEach(input=>input.setAttribute('inputmode',Number(input.min)<0?'text':'decimal'));
});
