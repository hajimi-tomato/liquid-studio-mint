window.addEventListener('DOMContentLoaded',()=>{
// Original 24px outline family: rounded joins, open silhouettes, one stroke weight.
const shapes={
paint:'M14 4q2-2 4 0t0 4l-8 8-4-4zM6 13q-4 1-3 7 6 1 7-4M12 6l4 4',
effect:'M4 7h5m5 0h6M4 17h10m5 0h1M9 4h5v6H9zM14 14h5v6h-5z',
glass:'M7 3h12v15H7zM4 7v14h12M10 7l3-2M10 11l6-4',
color:'M12 3C9 7 5 10 5 14a7 7 0 0 0 14 0c0-4-4-7-7-11zM8 14a4 4 0 0 0 4 4M12 9v4',
push:'M4 13h16M7 9l-4 4 4 4M17 9l4 4-4 4M9 6q3-2 6 0',
erase:'M14 4l6 6-9 10H6l-4-4zM7 11l7 7M12 20h8',
undo:'M8 5L4 9l4 4M4 9h9a6 6 0 0 1 0 12h-2',redo:'M16 5l4 4-4 4M20 9h-9a6 6 0 0 0 0 12h2',
reset:'M5 9a8 8 0 1 1 0 7M5 4v5h5',plus:'M5 12h14M12 5v14',minus:'M5 12h14',
fit:'M9 4H4v5M15 4h5v5M4 15v5h5M20 15v5h-5M9 9h6v6H9z',
folder:'M3 8V5h7l2 3h8v3M3 8v12h16l2-9H7l-2 9',
upload:'M12 16V4M8 8l4-4 4 4M4 16v4h16v-4',download:'M12 4v12M8 12l4 4 4-4M4 17v3h16v-3',
save:'M5 4h12l3 3v13H4V4zM8 4v6h8V4M8 20v-6h8v6',
split:'M4 6h16v13H4zM12 3v18M7 10v5M16 10v5',
close:'M6 6l12 12M18 6L6 18',play:'M8 5l11 7-11 7z',stop:'M6 6h12v12H6z',
image:'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01',
film:'M3 6h18v13H3zM7 6v13M17 6v13M3 10h4m10 0h4M3 15h4m10 0h4M10 10l4 3-4 2z',
library:'M4 6h5v14H4zM11 4h4v16h-4zM17 7l3-1 3 13-3 1z',
check:'M5 12l4 4L19 6',spark:'M12 3l2 6 6 3-6 2-2 7-2-7-6-2 6-3z',trash:'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7'};
const ids={undo:'undo',redo:'redo',restoreAll:'reset',zoomIn:'plus',zoomOut:'minus',fit:'fit',addImages:'plus',importFolder:'folder',uploadTop:'upload',openLibrary:'library',compare:'split',comparePrevious:'split',clear:'trash',loadSample:'image',imageExportTab:'image',videoExportTab:'film',export:'download',savePreset:'save',previewAnimation:'play',startRecording:'download',stopRecording:'stop',cancelRecording:'close',closeEffects:'close',closeLibrary:'close',applyAloe:'check',paintAloe:'paint',confirmSave:'save',recommendMotion:'spark',exitMotion:'close',resetColor:'reset',resetStrokeAdjust:'reset',batchExport:'download',batchApply:'check',batchAll:'check',downloadRecording:'download'};
const svg=k=>'<svg class="ui-icon" data-mint-icon="'+k+'" viewBox="0 0 24 24" aria-hidden="true"><path d="'+shapes[k]+'"/></svg>';
function apply(){document.querySelectorAll('button').forEach(b=>{let key=b.dataset.panelTarget||b.dataset.tool||ids[b.id]||b.querySelector('[data-icon]')?.dataset.icon;if(!key&&b.closest('.header-quick'))key=b.textContent.includes('保存')?'save':b.textContent.includes('适应')?'fit':null;if(!shapes[key]||b.dataset.mintIcon===key)return;b.dataset.mintIcon=key;const existing=b.querySelector('svg');if(existing){existing.outerHTML=svg(key)}else if(b.id.startsWith('close')||b.id==='exitMotion'){b.innerHTML=svg(key)}else{const span=document.createElement('span');span.className='action-symbol';span.innerHTML=svg(key);b.prepend(span)}})}apply();let queued=false;new MutationObserver(()=>{if(!queued){queued=true;queueMicrotask(()=>{queued=false;apply()})}}).observe(document.body,{childList:true,subtree:true});
window.mintIconCatalog=shapes;
});
