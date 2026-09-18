import {LiquidRenderer} from './liquid-renderer.js';
import {createDocument,layerFromField,beginStroke,paintStroke,previewStroke,finishStroke,documentFromState} from './stroke-layers.js';

const $ = (id) => document.getElementById(id);
const icons = {
 droplet:'<path d="M12 3c-2.4 4.5-7 8.5-7 12a7 7 0 0 0 14 0c0-3.5-4.6-7.5-7-12Z"/><path d="M8 15a4 4 0 0 0 4 4"/>',
 upload:'<path d="M12 16V3m-4 4 4-4 4 4M4 15v5h16v-5"/>', download:'<path d="M12 3v13m-4-4 4 4 4-4M4 16v5h16v-5"/>',
 check:'<path d="m5 12 4 4L19 6"/>', sparkle:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
 brush:'<path d="M14 4c4-4 8-1 5 3l-7 9-5-5 7-7Z"/><path d="M7 12c-4 0-2 7-5 8 5 2 9-1 8-5"/>',
 hand:'<path d="M8 12V6a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v8-6a2 2 0 0 1 4 0v8c0 5-3 8-7 8-3 0-5-2-6-4l-4-6c-1-2 1-4 3-2l2 2Z"/>',
 eraser:'<path d="m14 3 7 7-10 11H6l-5-5L14 3ZM8 9l7 7M10 21h11"/>',
 undo:'<path d="M8 5 3 10l5 5M3 10h11a6 6 0 0 1 0 12" transform="translate(0 -2)"/>', redo:'<path d="m16 5 5 5-5 5m5-5H10a6 6 0 0 0 0 12" transform="translate(0 -2)"/>',
 minus:'<path d="M5 12h14"/>', plus:'<path d="M5 12h14M12 5v14"/>', reset:'<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>',
 split:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M12 3v18M7 9v6"/>', mouse:'<rect x="6" y="2" width="12" height="20" rx="6"/><path d="M12 6v4"/>'
};
document.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[el.dataset.icon] || ''}</svg>`);
let toastTimer;
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 3600); }
function updateRange(el) {
 el.style.setProperty('--fill', `${(Number(el.value)-Number(el.min))/(Number(el.max)-Number(el.min))*100}%`);
 const out = $(el.id+'Value'); if (out) out.value = el.value + (['amount','softness','refraction','gloss','diffusion','glassTint','glassClarity','glassReflection','glassWarp','strokeIntensity','strokeThickness','strokeSoftness'].includes(el.id)?'%':el.id==='hue'?'°':'');
}
document.querySelectorAll('input[type=range]').forEach(el => { updateRange(el); el.addEventListener('input', () => updateRange(el)); });

let renderer, ready=false, exporting=false, imageWidth=0,imageHeight=0,fieldW=0,fieldH=0;
// `scene` is the committed, immutable layer document; an active stroke previews on top of it.
let scene=null,paintMode='fusion',eraseMode='top';
let dirty=true,queued=false,tool='paint',zoom=1,panX=0,panY=0,fitW=0,fitH=0,original=false,spaceDown=false;
let previousComparison=false;
let history=[],future=[],stroke=null,loadToken=0,currentName='liquid-studio',hasEdits=false;

const GLASS_COLORS={clear:[0,0,0],blue:[1.05,.35,.025],yellow:[.02,.15,1.1],brown:[.23,.7,1.28],red:[.04,1.1,.95]};
const DEFAULT_SETTINGS={brushSize:100,amount:72,softness:65,refraction:75,gloss:65,diffusion:35,strokeIntensity:100,strokeThickness:100,strokeSoftness:0,brightness:0,contrast:0,hue:0,saturation:0,temperature:0,glassTint:0,glassClarity:100,glassReflection:0,glassWarp:35};
const PAINT_MODES={fusion:'连续涂抹会融合；切换模式不会改变已经画好的内容。',independent:'每次松开完成一笔，交叉处保持各自边缘；推开会带动碰到的所有层。',squeeze:'新的一笔像气泡一样把旁边的液体挤开，贴近处形成平直的接触边。'};
const ERASE_MODES={top:'只擦最先碰到的上层笔画，下方笔画保留。',all:'擦掉笔刷碰到的所有层，直接露出底图。'};
let glassColor='clear',glassTexture='smooth',originalSource=null;
let strokeCount=0;
function captureSettings(){return {values:Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map(id=>[id,Number($(id).value)])),glassColor,glassTexture,tool,paintMode,eraseMode};}
function applySettings(settings){for(const [id,def] of Object.entries(DEFAULT_SETTINGS)){$(id).value=settings.values?.[id]??def;updateRange($(id));}glassColor=Object.hasOwn(GLASS_COLORS,settings.glassColor)?settings.glassColor:'clear';glassTexture=['smooth','reeded','ripple'].includes(settings.glassTexture)?settings.glassTexture:'smooth';setPaintMode(settings.paintMode);setEraseMode(settings.eraseMode);setTool(['paint','push','erase'].includes(settings.tool)?settings.tool:'paint');syncGlass();syncFinish();}
function syncGlass(){document.querySelectorAll('[data-glass]').forEach(el=>{const on=el.dataset.glass===glassColor;el.classList.toggle('selected',on);el.setAttribute('aria-pressed',String(on));});document.querySelectorAll('[data-glass-texture]').forEach(el=>{const on=el.dataset.glassTexture===glassTexture;el.classList.toggle('selected',on);el.setAttribute('aria-pressed',String(on));});}
function syncFinish(){const v=['refraction','gloss','diffusion'].map(id=>Number($(id).value));document.querySelectorAll('[data-finish]').forEach(el=>{const on={clear:[42,38,8],gel:[75,65,35],glow:[90,90,80]}[el.dataset.finish].every((x,i)=>x===v[i]);el.classList.toggle('selected',on);el.setAttribute('aria-pressed',String(on));});}
function setPaintMode(next){paintMode=Object.hasOwn(PAINT_MODES,next)?next:'fusion';document.querySelectorAll('[data-paint-mode]').forEach(el=>{const on=el.dataset.paintMode===paintMode;el.classList.toggle('selected',on);el.setAttribute('aria-pressed',String(on));});syncModeHelp();}
function setEraseMode(next){eraseMode=Object.hasOwn(ERASE_MODES,next)?next:'top';document.querySelectorAll('[data-erase-mode]').forEach(el=>{const on=el.dataset.eraseMode===eraseMode;el.classList.toggle('selected',on);el.setAttribute('aria-pressed',String(on));});syncModeHelp();}
// The erase tool shows its own mode row; every other tool shows the paint modes.
function syncModeHelp(){const erasing=tool==='erase';document.querySelectorAll('.paint-mode-heading,.paint-mode-options').forEach(el=>el.hidden=erasing);document.querySelectorAll('.erase-mode-heading,.erase-mode-options').forEach(el=>el.hidden=!erasing);const help=$('paintModeHelp');if(help)help.textContent=erasing?ERASE_MODES[eraseMode]:PAINT_MODES[paintMode];}
function currentScene(){return stroke?.tx?previewStroke(stroke.tx):scene;}
function selectPresetButton(name){document.querySelectorAll('.preset').forEach(el=>{const on=el.dataset.preset===name;el.classList.toggle('selected',on);el.setAttribute('aria-pressed',String(on));});}
function snapshot(){return {scene:currentScene(),fieldW,fieldH,settings:captureSettings(),strokeCount,selected:document.querySelector('.preset.selected')?.dataset.preset??null};}
function restoreAll(){if(!ready||exporting)return;endStroke();saveHistory();setPreset('clear',false);applySettings({values:DEFAULT_SETTINGS,glassColor:'clear',glassTexture:'smooth',tool:'paint',paintMode});fitCanvas(true);compare(false);dirty=true;requestRender();toast('已还原当前原图；可以撤销，已保存的预设不受影响。');}
const pointers=new Map();let pinch=null;
function restore(state){endStroke();if(state.scene)scene=state.scene;if(state.settings)applySettings(state.settings);if(state.strokeCount!==undefined){strokeCount=state.strokeCount;updateStrokeCount();}if('selected' in state)selectPresetButton(state.selected);dirty=true;requestRender();}
function pushHistory(entry){history.push(entry);if(history.length>25)history.shift();future=[];updateHistory();}
function saveHistory(){endStroke();pushHistory(snapshot());}
function updateHistory(){previousComparison=false;if($('comparePrevious'))$('comparePrevious').disabled=!history.length;$('undo').disabled=!history.length;$('redo').disabled=!future.length;}
function undo(){if(!ready||!history.length)return;endStroke();future.push(snapshot());restore(history.pop());updateHistory();}
function redo(){if(!ready||!future.length)return;endStroke();history.push(snapshot());restore(future.pop());updateHistory();}
function requestRender(){if(queued||!ready||exporting)return;queued=true;requestAnimationFrame(()=>{queued=false;if(!ready||exporting)return;const before=previousComparison?history.at(-1):null;
 try{if(before){renderer.setScene(before.scene);dirty=true;}else if(dirty){renderer.setScene(currentScene());dirty=false;}const scale=Math.min(1,1536/Math.max(imageWidth,imageHeight));renderer.draw(Math.max(1,Math.round(imageWidth*scale)),Math.max(1,Math.round(imageHeight*scale)),original,before?{...before.settings.values,glassColor:before.settings.glassColor,glassTexture:before.settings.glassTexture}:{});}
 catch(error){console.error(error);toast('画面暂时无法刷新：'+error.message);return;}
 if(!original&&!before){const p=$('preview');const ps=440/Math.max(imageWidth,imageHeight),pw=Math.max(1,Math.round(imageWidth*ps)),ph=Math.max(1,Math.round(imageHeight*ps));if(p.width!==pw||p.height!==ph){p.width=pw;p.height=ph;}p.getContext('2d').drawImage($('editor'),0,0,pw,ph);updateImageThumbnail();}});}
function selectExportTab(name){
 if(name==='image'&&document.getElementById('recordingSection').dataset.state==='recording'){toast('请先停止录制并生成文件，再切换到图片导出。');return;}
 document.querySelectorAll('[data-export-tab]').forEach(button=>{const on=button.dataset.exportTab===name;button.setAttribute('aria-selected',String(on));button.tabIndex=on?0:-1;});
 $('imageExportPanel').hidden=name!=='image';$('videoExportPanel').hidden=name!=='video';
}
function fitCanvas(reset=false){if(!ready)return;const box=$('stage').getBoundingClientRect();const scale=Math.min((box.width-44)/imageWidth,(box.height-44)/imageHeight);fitW=imageWidth*scale;fitH=imageHeight*scale;if(reset){zoom=1;panX=0;panY=0;}const wrap=$('canvasWrap');wrap.style.width=fitW+'px';wrap.style.height=fitH+'px';applyView();}
function applyView(){panX=Math.max(-fitW*zoom/2,Math.min(fitW*zoom/2,panX));panY=Math.max(-fitH*zoom/2,Math.min(fitH*zoom/2,panY));$('canvasWrap').style.transform=`translate(${panX}px,${panY}px) scale(${zoom})`;$('fit').textContent=zoom===1?'适应':Math.round(zoom*100)+'%';}
function changeZoom(value){zoom=Math.max(.5,Math.min(4,value));applyView();}
function coords(event){const r=$('editor').getBoundingClientRect();return {x:(event.clientX-r.left)/r.width,y:(event.clientY-r.top)/r.height};}
function brushRadius(){return Number($('brushSize').value)/Math.min(fitW,fitH)/zoom/2*Math.min(fieldW,fieldH);}
// Every dab goes through the stroke transaction; committed layers are never mutated here.
function paintSegment(a,b,pressure=1){
 if(!stroke?.tx)return;
 const dx=b.x-a.x,dy=b.y-a.y,r=brushRadius(),softness=Number($('softness').value)/100;let changed=false;
 try{
  if(stroke.tool==='push')changed=paintStroke(stroke.tx,{x:b.x,y:b.y,dx,dy,r,amount:1,softness});
  else{const distance=Math.hypot(dx*fieldW,dy*fieldH);const steps=Math.max(1,Math.ceil(distance/Math.max(1,r*.14)));const amount=Number($('amount').value)/100*.17*pressure;
   for(let i=1;i<=steps;i++)changed=paintStroke(stroke.tx,{x:a.x+dx*i/steps,y:a.y+dy*i/steps,dx,dy,r,amount,softness})||changed;}
 }catch(error){console.error(error);toast('这一笔无法继续：'+error.message);endStroke();return;}
 if(!changed)return;
 if(!stroke.changed){stroke.changed=true;pushHistory(stroke.before);if(stroke.tool==='paint'){strokeCount++;updateStrokeCount();}hasEdits=true;selectPresetButton(null);}
 dirty=true;
}
function presetScene(name){
 const empty=createDocument(fieldW,fieldH);
 if(name==='thin'){const bytes=new Uint8Array(fieldW*fieldH*4);for(let y=0;y<fieldH;y++)for(let x=0;x<fieldW;x++){const i=(y*fieldW+x)*4;bytes[i]=Math.round((.16+.06*Math.sin(x/fieldW*11+y/fieldH*4))*255);bytes[i+1]=Math.round((.55*.5+.5)*255);bytes[i+2]=Math.round((.3*.5+.5)*255);bytes[i+3]=255;}const layer=layerFromField(bytes,fieldW,fieldH,{kind:'fusion'});return {...empty,layers:layer?[layer]:[]};}
 if(name==='strokes'){
  const tx=beginStroke(empty,{tool:'paint',mode:'fusion'}),radius=Math.min(fieldW,fieldH)*.095,softness=Number($('softness').value)/100;
  const paths=[[[.00,.27],[.10,.21],[.27,.16],[.44,.12],[.64,.08]],[[.02,.49],[.15,.41],[.31,.35],[.48,.28],[.57,.22]],[[.07,.74],[.16,.64],[.29,.55],[.40,.49]],[[.12,.96],[.21,.85],[.32,.77]]];
  for(const path of paths)for(let k=1;k<path.length;k++){const a=path[k-1],b=path[k];const dx=b[0]-a[0],dy=b[1]-a[1];const steps=Math.ceil(Math.hypot(dx*fieldW,dy*fieldH)/(radius*.12));for(let s=0;s<=steps;s++)paintStroke(tx,{x:a[0]+dx*s/steps,y:a[1]+dy*s/steps,dx,dy,r:radius,amount:.065,softness});}
  return finishStroke(tx);
 }
 return empty;
}
function setPreset(name,record=true){
 if(!ready)return;endStroke();if(record)saveHistory();scene=presetScene(name);strokeCount=name==='clear'?0:(name==='strokes'?4:1);updateStrokeCount();
 selectPresetButton(name);dirty=true;hasEdits=record;requestRender();
}
let previewRenderer;
function previewPreset(name){
 if(!ready)return;
 const popup=$('materialPreview'),canvas=$('materialPreviewCanvas');
 try{
  previewRenderer??=new LiquidRenderer(canvas);
  const w=256,h=Math.max(2,Math.round(w*imageHeight/imageWidth)),bytes=new Uint8Array(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const u=x/w,v=y/h;let height=0;
   if(name==='thin')height=.16+.06*Math.sin(u*11+v*4);
   if(name==='strokes')for(const start of [.24,.46,.68,.90]){
    const d=Math.abs(v+u*.35-start)/.065;
    if(d<1&&u<.68)height=Math.max(height,(1-d*d)**2*.72);
   }
   const i=(y*w+x)*4;bytes[i]=height*255;bytes[i+1]=195;bytes[i+2]=90;bytes[i+3]=255;
  }
  previewRenderer.setImage(originalSource);previewRenderer.setField(bytes,w,h);
  const scale=240/Math.max(imageWidth,imageHeight);previewRenderer.draw(Math.max(2,Math.round(imageWidth*scale)),Math.max(2,Math.round(imageHeight*scale)),false,{strokeIntensity:100,strokeThickness:100,strokeSoftness:0,refraction:75,gloss:65,diffusion:35});
 }catch(error){console.error(error);return;}
 $('materialPreviewTitle').textContent={clear:'空白',thin:'薄涂',strokes:'手作纹路'}[name]+' · 效果示意';
 popup.hidden=false;
 const button=document.querySelector('[data-preset="'+name+'"]'),rect=button.getBoundingClientRect();
 popup.style.left=Math.max(8,Math.min(innerWidth-260,rect.left))+'px';
 popup.style.top=Math.max(8,rect.top-popup.offsetHeight-10)+'px';
}
function endPresetPreview(){ $('materialPreview').hidden=true; }
function clearStrokes(){
 if(!ready||exporting)return;
 endStroke();saveHistory();scene=createDocument(fieldW,fieldH);strokeCount=0;updateStrokeCount();dirty=true;hasEdits=true;requestRender();
}
function updateStrokeCount(){const el=$('strokeCount');if(el)el.textContent=strokeCount+' 笔';}
function setTool(next){tool=next;document.querySelectorAll('.tool').forEach(el=>{const on=el.dataset.tool===tool;el.classList.toggle('selected',on);el.setAttribute('aria-pressed',String(on));});$('brushCursor').classList.toggle('erase',tool==='erase');$('canvasHint').textContent={paint:'拖动涂抹，让光线换一种经过的方式。',push:'沿着已有的液体拖动，把纹路轻轻推开。',erase:'擦去液体，让原本的清晰重新显现。'}[tool];syncModeHelp();}
function cursor(event){if(!ready)return;const p=coords(event),el=$('brushCursor');el.style.left=p.x*fitW+'px';el.style.top=p.y*fitH+'px';const size=Number($('brushSize').value)/zoom;el.style.width=size+'px';el.style.height=size+'px';el.hidden=spaceDown||event.pointerType==='touch';}
// Single commit point for a gesture: pointer up/cancel, lost capture, blur, pinch, image switch, export.
function endStroke(){if(stroke?.tx){try{scene=finishStroke(stroke.tx);}catch(error){console.error(error);toast('这一笔未能保存：'+error.message);}dirty=true;}stroke=null;pinch=null;if(ready)requestRender();}
function beginPinch(){if(pointers.size!==2)return;endStroke();const [a,b]=[...pointers.values()];pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),zoom,midX:(a.x+b.x)/2,midY:(a.y+b.y)/2,panX,panY};}
function handleDown(e){if(!ready||exporting||e.button>1)return;e.preventDefault();$('stage').setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){beginPinch();return;}if(pointers.size>2)return;
 if(spaceDown||e.button===1){endStroke();stroke={pan:true,x:e.clientX,y:e.clientY,panX,panY};return;}
 if(e.target!==$('editor'))return;
 endStroke();const before=snapshot();let tx;
 try{tx=beginStroke(scene,{tool,mode:paintMode,eraseMode});}catch(error){console.error(error);toast('无法开始这一笔：'+error.message);return;}
 const p=coords(e);stroke={point:p,pointerId:e.pointerId,tool,mode:paintMode,tx,before,changed:false};original=false;$('originalBadge').hidden=true;
 if(tool!=='push')paintSegment(p,p,e.pointerType==='pen'?Math.max(.2,e.pressure):1);requestRender();cursor(e);
}
function handleMove(e){cursor(e);if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(pinch&&pointers.size>=2){const [a,b]=[...pointers.values()];zoom=Math.max(.5,Math.min(4,pinch.zoom*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,pinch.distance)));panX=pinch.panX+(a.x+b.x)/2-pinch.midX;panY=pinch.panY+(a.y+b.y)/2-pinch.midY;applyView();return;}
 if(!stroke)return;if(stroke.pan){panX=stroke.panX+e.clientX-stroke.x;panY=stroke.panY+e.clientY-stroke.y;applyView();return;}
 if(e.pointerId!==stroke.pointerId)return;
 const p=coords(e);paintSegment(stroke.point,p,e.pointerType==='pen'?Math.max(.2,e.pressure):1);if(stroke)stroke.point=p;requestRender();
}
function handleUp(e){pointers.delete(e.pointerId);if(!stroke?.tx||e.pointerId===stroke.pointerId)endStroke();if(e.pointerType==='touch')$('brushCursor').hidden=true;}

const album=[];let activeImage=-1,albumSwitch=false;
function recordingBusy(){return ['recording','processing'].includes($('recordingSection').dataset.state);}
function rememberImage(){
 if(activeImage<0||!ready)return;endStroke();
 Object.assign(album[activeImage],{source:originalSource,state:snapshot(),history:[...history],future:[...future],fieldW,fieldH,currentName,hasEdits,zoom,panX,panY,selected:document.querySelector('.preset.selected')?.dataset.preset});
}
function updateImageThumbnail(){
 if(activeImage<0||!album[activeImage])return;
 const item=album[activeImage];item.thumbnail??=document.createElement('canvas');const thumb=item.thumbnail;
 thumb.width=100;thumb.height=66;const ctx=thumb.getContext('2d');ctx.fillStyle='#e6ece3';ctx.fillRect(0,0,100,66);
 const scale=Math.min(100/imageWidth,66/imageHeight),w=imageWidth*scale,h=imageHeight*scale;ctx.drawImage($('editor'),(100-w)/2,(66-h)/2,w,h);
 const visible=$('imageStrip').children[activeImage]?.querySelector('canvas');if(visible)visible.getContext('2d').drawImage(thumb,0,0);
}
function renderAlbum(){
 const list=$('imageStrip');list.replaceChildren();$('imageTotal').textContent=album.length+' 张图片 · 每张独立编辑';
 album.forEach((item,index)=>{
  const button=document.createElement('button');button.className='image-tile';button.classList.toggle('selected',index===activeImage);button.setAttribute('aria-pressed',String(index===activeImage));button.title=item.name;
  const thumb=document.createElement('canvas');thumb.width=100;thumb.height=66;
  if(item.thumbnail||item.source)thumb.getContext('2d').drawImage(item.thumbnail||item.source,0,0,100,66);
  else {const img=new Image();img.onload=()=>thumb.getContext('2d').drawImage(img,0,0,100,66);img.src=item.url;}
  const label=document.createElement('span');label.textContent=item.name;button.append(thumb,label);button.onclick=()=>switchImage(index);list.append(button);
 });
}
async function switchImage(index){
 if(albumSwitch||index===activeImage||exporting)return;
 if(recordingBusy()){toast('请先结束录制，再切换图片。');return;}
 rememberImage();const item=album[index];albumSwitch=true;
 try{
  if(!item.state){
   if(!await loadImage(item.url,item.name))return;
   applySettings({values:DEFAULT_SETTINGS,paintMode});
  }else{
   originalSource=item.source;renderer.setImage(item.source);imageWidth=item.source.width;imageHeight=item.source.height;
   fieldW=item.fieldW;fieldH=item.fieldH;scene=item.state.scene;
   applySettings(item.state.settings);strokeCount=item.state.strokeCount;updateStrokeCount();
   history=[...item.history];future=[...item.future];updateHistory();currentName=item.currentName;hasEdits=item.hasEdits;original=false;
   $('originalBadge').hidden=true;$('imageBadge').textContent=item.name;$('dimensions').textContent=imageWidth+' × '+imageHeight;
   fitCanvas(true);zoom=item.zoom;panX=item.panX;panY=item.panY;applyView();
   selectPresetButton(item.selected);
  }
  activeImage=index;dirty=true;requestRender();rememberImage();renderAlbum();
 }finally{albumSwitch=false;}
}
async function importImages(files){
 if(recordingBusy()){toast('请先停止录制并生成文件，再导入图片。');return;}
 if(albumSwitch)return;
 const valid=[...files].filter(f=>['image/png','image/jpeg','image/webp'].includes(f.type)&&f.size<=60*1024*1024);
 if(!valid.length){toast('请选择 PNG、JPG 或 WebP 图片，单张不超过 60 MB。');return;}
 const first=album.length;valid.forEach(file=>album.push({name:file.webkitRelativePath||file.name,url:URL.createObjectURL(file)}));
 renderAlbum();await switchImage(first);$('fileInput').value='';$('folderInput').value='';
 toast('已加入 '+valid.length+' 张图片'+(valid.length<files.length?'，已跳过不支持或过大的文件。':'。'));
}
window.addEventListener('pagehide',()=>album.forEach(item=>{if(item.url)URL.revokeObjectURL(item.url);}));
document.addEventListener('scroll',endPresetPreview,true);
window.addEventListener('resize',endPresetPreview);
document.addEventListener('keydown',e=>{if(e.key==='Escape')endPresetPreview();});

async function loadImage(src,name,sample=false){
 if(recordingBusy()){toast('请先停止录制并生成文件，再打开其他图片。');return false;}
 if(!albumSwitch)rememberImage();
 const token=++loadToken;$('loading').hidden=false;const previousReady=ready;
 try{
  const image=new Image();image.src=src;await image.decode();if(token!==loadToken)return;
  const maxTexture=Math.min(renderer.gl.getParameter(renderer.gl.MAX_TEXTURE_SIZE),8192);
  const scale=Math.min(1,maxTexture/image.width,maxTexture/image.height,Math.sqrt(24000000/(image.width*image.height)));
  let source=image;
  if(scale<1){source=document.createElement('canvas');source.width=Math.max(1,Math.round(image.width*scale));source.height=Math.max(1,Math.round(image.height*scale));source.getContext('2d').drawImage(image,0,0,source.width,source.height);toast('这张照片较大，已缩至 '+source.width+' × '+source.height+' 以流畅编辑。');}
  renderer.setImage(source);originalSource=source;imageWidth=source.width;imageHeight=source.height;
  const fieldScale=640/Math.max(imageWidth,imageHeight);fieldW=Math.max(2,Math.round(imageWidth*fieldScale));fieldH=Math.max(2,Math.round(imageHeight*fieldScale));
  stroke=null;pinch=null;pointers.clear();scene=createDocument(fieldW,fieldH);
  history=[];future=[];updateHistory();ready=true;currentName=name.replace(/\.[^.]+$/,'');hasEdits=false;resetColors(false);fitCanvas(true);setPreset(sample?'strokes':'clear',false);Object.entries({strokeIntensity:100,strokeThickness:100,strokeSoftness:0}).forEach(([id,value])=>{$(id).value=value;updateRange($(id));});
  $('dimensions').textContent=imageWidth+' × '+imageHeight;$('imageBadge').textContent=sample?'示例照片':name;
  $('imageBadge').title=name;original=false;$('originalBadge').hidden=true;requestRender();if(!albumSwitch){album.push({name,source:originalSource});activeImage=album.length-1;rememberImage();renderAlbum();}return true;
 }catch(error){ready=previousReady;toast('图片未能打开，请选择 PNG、JPG 或 WebP 图片。');console.error(error);if(!ready){$('loading').innerHTML='<span>示例暂时无法载入，请上传一张照片开始。</span>';return;}}
 finally{if(token===loadToken&&ready)$('loading').hidden=true;}
}
async function loadFile(file){if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)){toast('请选择 PNG、JPG 或 WebP 图片。');return;}if(file.size>60*1024*1024){toast('请选择小于 60 MB 的图片。');return;}const url=URL.createObjectURL(file);try{await loadImage(url,file.name);}finally{URL.revokeObjectURL(url);$('fileInput').value='';}}

function analyseImage(){
 const c=document.createElement('canvas');c.width=64;c.height=64;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(originalSource,0,0,64,64);const pixels=ctx.getImageData(0,0,64,64).data;let dx=0,dy=0,sum=0,squared=0;
 const lum=i=>pixels[i*4]*.2126+pixels[i*4+1]*.7152+pixels[i*4+2]*.0722;
 for(let y=0;y<63;y++)for(let x=0;x<63;x++){const i=y*64+x,l=lum(i);dx+=Math.abs(l-lum(i+1));dy+=Math.abs(l-lum(i+64));sum+=l;squared+=l*l;}
 const variance=squared/3969-(sum/3969)**2;const style=variance<1000?'breathe':dx>dy?'vertical':'horizontal';
 const reason=style==='breathe'?'画面明暗较柔和，适合缓慢柔光呼吸':style==='vertical'?'画面竖向纹理较突出，推荐纵向流动':'画面横向层次较突出，推荐横向流光';return {source:originalSource,style,reason:reason+'（本地明暗与纹理分析，可手动更换）'};
}
function createAnimation(){
 endStroke();const c=document.createElement('canvas'),r=new LiquidRenderer(c),state=snapshot();
 try{r.setImage(originalSource);r.setScene(state.scene);}catch(error){r.dispose();throw error;}
 const settings={...state.settings.values,glassColor:state.settings.glassColor,glassTexture:state.settings.glassTexture};
 return {render(progress,style,w,h){const phase=progress*Math.PI*2,pulse=(1-Math.cos(phase))*.5;r.draw(w,h,false,{...settings,motionPhase:phase,motionMode:{horizontal:1,vertical:2,breathe:3}[style],strokeThickness:settings.strokeThickness*(1-.35*pulse),strokeSoftness:Math.min(100,settings.strokeSoftness+pulse*(style==='breathe'?35:12)),refraction:settings.refraction*(1-.35*pulse),gloss:Math.min(100,settings.gloss+25*pulse),glassReflection:Math.max(12,settings.glassReflection)+15*pulse});return c;},dispose(){r.dispose();r.gl.getExtension('WEBGL_lose_context')?.loseContext();}};
}

function resetColors(render=true){document.querySelectorAll('.color-adjust').forEach(el=>{el.value=0;updateRange(el);});if(render)requestRender();}
function comparePrevious(on){if(!ready)return;previousComparison=on&&history.length>0;original=false;dirty=true;$('originalBadge').textContent='上一步';$('originalBadge').hidden=!previousComparison;requestRender();}
function compare(on){if(!ready)return;previousComparison=false;dirty=true;$('originalBadge').textContent='原图';original=on;$('originalBadge').hidden=!on;requestRender();}
async function exportImage(){
 if(!ready||exporting)return;endStroke();exporting=true;$('export').disabled=true;$('export').textContent='正在导出…';
 try{
  renderer.setScene(scene);dirty=false;
  const target=$('exportSize').value;const scale=target==='original'?1:Math.min(1,Number(target)/Math.max(imageWidth,imageHeight));
  const w=Math.max(1,Math.round(imageWidth*scale)),h=Math.max(1,Math.round(imageHeight*scale));renderer.draw(w,h,false);
  const format=$('format').value;const blob=await new Promise(resolve=>$('editor').toBlob(resolve,'image/'+format,.95));if(!blob)throw new Error('Empty image');
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=currentName+'-液体涂抹.'+(format==='jpeg'?'jpg':'png');document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);toast(`已导出 ${w} × ${h} 的${format==='jpeg'?' JPG':' PNG'} 图片`);
 }catch(error){console.error(error);toast('导出未完成：'+(error.message||'请尝试较小的导出尺寸。'));}
 finally{exporting=false;dirty=true;$('export').disabled=false;$('export').innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true">${icons.download}</svg>导出图片`;requestRender();}
}

let presetDBPromise,libraryUrls=[],savingPreset=false;
function openPresetDB(){if(presetDBPromise)return presetDBPromise;presetDBPromise=new Promise((resolve,reject)=>{if(!window.indexedDB){reject(new Error('此浏览器不能保存本地预设'));return;}const request=indexedDB.open('liquid-studio-presets',1);request.onupgradeneeded=()=>request.result.createObjectStore('presets',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('请关闭其他工作台标签页后重试'));}).catch(e=>{presetDBPromise=null;throw e;});return presetDBPromise;}
async function presetTransaction(mode,action){const db=await openPresetDB();return new Promise((resolve,reject)=>{const tx=db.transaction('presets',mode);let result;const req=action(tx.objectStore('presets'));req.onsuccess=()=>{result=req.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('保存中断'));});}
// Version 1 records hold one fused field; version 2 records hold the ordered layer list.
function validateSavedPreset(record){
 const sized=Number.isInteger(record?.fieldW)&&Number.isInteger(record?.fieldH)&&record.fieldW>=2&&record.fieldH>=2&&record.fieldW<=640&&record.fieldH<=640;
 if(!record||![1,2].includes(record.version)||!(record.image instanceof Blob)||!sized||!record.settings?.values)throw new Error('预设数据不完整');
 if(record.version===1&&(!(record.field instanceof Uint8Array)||record.field.length!==record.fieldW*record.fieldH*4))throw new Error('预设数据不完整');
 if(record.version===2&&!Array.isArray(record.layers))throw new Error('预设数据不完整');
 for(const id of Object.keys(DEFAULT_SETTINGS))if(!Number.isFinite(record.settings.values[id]))throw new Error('预设参数无效');
 if(record.settings.paintMode!==undefined&&!Object.hasOwn(PAINT_MODES,record.settings.paintMode))throw new Error('预设参数无效');
 if(record.settings.eraseMode!==undefined&&!Object.hasOwn(ERASE_MODES,record.settings.eraseMode))throw new Error('预设参数无效');
 return record;
}
function presetDocument(record){const state=record.version===1?{field:record.field}:{layers:record.layers};return documentFromState({...state,fieldW:record.fieldW,fieldH:record.fieldH},record.fieldW,record.fieldH);}
function canvasBlob(canvas,type='image/png',quality=.92){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('图片保存失败')),type,quality));}
async function saveCurrentPreset(name){
 if(!ready||!originalSource||exporting||savingPreset)return;
 name=name.trim();if(!name){$('presetName').focus();return;}
 endStroke();savingPreset=true;$('confirmSave').disabled=true;$('confirmSave').textContent='正在保存…';
 try{
  const record={id:crypto.randomUUID(),version:2,name:name.slice(0,50),createdAt:Date.now(),settings:captureSettings(),layers:scene.layers.map(layer=>({...layer,data:layer.data.slice()})),fieldW,fieldH,strokeCount,sourceName:currentName};
  const sourceCanvas=document.createElement('canvas');sourceCanvas.width=imageWidth;sourceCanvas.height=imageHeight;sourceCanvas.getContext('2d').drawImage(originalSource,0,0,imageWidth,imageHeight);
  renderer.setScene(scene);dirty=false;const scale=Math.min(1,1536/Math.max(imageWidth,imageHeight));renderer.draw(Math.max(1,Math.round(imageWidth*scale)),Math.max(1,Math.round(imageHeight*scale)),false);
  const thumb=document.createElement('canvas'),ts=320/Math.max(imageWidth,imageHeight);thumb.width=Math.max(1,Math.round(imageWidth*ts));thumb.height=Math.max(1,Math.round(imageHeight*ts));thumb.getContext('2d').drawImage($('editor'),0,0,thumb.width,thumb.height);
  [record.image,record.thumbnail]=await Promise.all([canvasBlob(sourceCanvas),canvasBlob(thumb,'image/jpeg',.85)]);
  await presetTransaction('readwrite',store=>store.put(record));$('presetName').value='';await renderLibrary();toast('已保存原图与全部效果，下次可继续编辑。');
 }catch(error){console.error(error);toast(error.name==='QuotaExceededError'?'浏览器存储空间不足，预设未保存。':('保存未完成：'+(error.message||'请检查浏览器存储权限')));}
 finally{savingPreset=false;$('confirmSave').disabled=false;$('confirmSave').textContent='保存当前作品';requestRender();}
}
async function openSavedPreset(id,applyOnly=false){
 if(recordingBusy()){toast('请先停止录制并生成文件，再打开预设。');return;}
 try{
  const record=validateSavedPreset(await presetTransaction('readonly',store=>store.get(id)));
  const stored=presetDocument(record);
  if(applyOnly){if(!ready){toast('请先上传一张图片。');return;}saveHistory();}
  else{const url=URL.createObjectURL(record.image);try{if(!await loadImage(url,record.sourceName||record.name))return;}finally{URL.revokeObjectURL(url);}}
  const doc=documentFromState(stored,fieldW,fieldH);
  restore({scene:doc,settings:record.settings,strokeCount:record.strokeCount??(doc.layers.length?1:0)});original=false;$('originalBadge').hidden=true;selectPresetButton(null);requestRender();$('presetDialog').close();toast(applyOnly?'已将预设效果套用到当前图片。':'已恢复作品，可以继续涂抹和调整。');
 }catch(error){console.error(error);toast('预设未能打开，当前编辑内容已保留。');}
}
async function renderLibrary(){
 try{const records=await presetTransaction('readonly',store=>store.getAll());$('presetCount').textContent=records.length;libraryUrls.forEach(url=>URL.revokeObjectURL(url));libraryUrls=[];const list=$('presetList');list.replaceChildren();if(!records.length){const p=document.createElement('p');p.textContent='还没有预设，保存第一张喜欢的作品吧。';list.append(p);return;}
  records.sort((a,b)=>b.createdAt-a.createdAt).forEach(record=>{const card=document.createElement('article');card.className='saved-card';if(record.thumbnail instanceof Blob){const img=document.createElement('img'),url=URL.createObjectURL(record.thumbnail);libraryUrls.push(url);img.src=url;img.alt=record.name;card.append(img);}const title=document.createElement('h3');title.textContent=record.name;card.append(title);const actions=document.createElement('div');actions.className='saved-actions';[['打开作品',false],['套用效果',true]].forEach(([label,apply])=>{const button=document.createElement('button');button.textContent=label;button.onclick=()=>openSavedPreset(record.id,apply);actions.append(button);});card.append(actions);list.append(card);});
 }catch(error){$('presetList').textContent='本地预设暂时不可用，请允许网站使用浏览器存储。';}
}
function showLibrary(save=false){$('presetDialog').showModal();$('presetName').value=save?currentName+' · 玻璃习作':'';renderLibrary();if(save)$('presetName').focus();}

try{
 renderer=new LiquidRenderer($('editor'));
 document.querySelectorAll('[data-export-tab]').forEach(button=>{
  button.onclick=()=>selectExportTab(button.dataset.exportTab);
  button.onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const name=e.key==='Home'?'image':e.key==='End'?'video':button.dataset.exportTab==='image'?'video':'image';selectExportTab(name);document.querySelector('[data-export-tab][aria-selected=true]').focus();}};
 });
 $('jumpToAdjustments').onclick=()=>{document.querySelector('[data-layer=liquid]').click();$('existingStrokes').scrollIntoView({block:'nearest',behavior:'smooth'});$('existingStrokes').focus({preventScroll:true});};
 $('stage').addEventListener('pointerdown',handleDown);$('stage').addEventListener('pointermove',handleMove);$('stage').addEventListener('pointerup',handleUp);$('stage').addEventListener('pointercancel',handleUp);$('stage').addEventListener('lostpointercapture',e=>{if(stroke?.tx&&e.pointerId===stroke.pointerId)handleUp(e);});$('editor').addEventListener('pointerleave',()=>{$('brushCursor').hidden=true;});
 $('stage').addEventListener('wheel',e=>{if(!ready)return;e.preventDefault();changeZoom(zoom*Math.exp(-e.deltaY*.001));},{passive:false});
 $('uploadTop').onclick=()=>$('fileInput').click();$('fileInput').onchange=e=>importImages(e.target.files);$('folderInput').onchange=e=>importImages(e.target.files);$('importFolder').onclick=()=>$('folderInput').click();$('addImages').onclick=()=>$('fileInput').click();
 let dragDepth=0;document.body.addEventListener('dragenter',e=>{if(!e.dataTransfer.types.includes('Files'))return;e.preventDefault();dragDepth++;$('dropOverlay').hidden=false;});document.body.addEventListener('dragover',e=>e.preventDefault());document.body.addEventListener('dragleave',e=>{e.preventDefault();if(--dragDepth<=0){dragDepth=0;$('dropOverlay').hidden=true;}});document.body.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('dropOverlay').hidden=true;importImages(e.dataTransfer.files);});
 document.querySelectorAll('.tool').forEach(el=>el.onclick=()=>setTool(el.dataset.tool));
 document.querySelectorAll('[data-paint-mode]').forEach(el=>el.onclick=()=>setPaintMode(el.dataset.paintMode));
 document.querySelectorAll('[data-erase-mode]').forEach(el=>el.onclick=()=>setEraseMode(el.dataset.eraseMode));
 setPaintMode(paintMode);setEraseMode(eraseMode);
 document.querySelectorAll('.preset').forEach(el=>{
  el.onclick=()=>{endPresetPreview();setPreset(el.dataset.preset);};
  el.addEventListener('mouseenter',()=>previewPreset(el.dataset.preset));
  el.addEventListener('mouseleave',endPresetPreview);
  el.addEventListener('focus',()=>previewPreset(el.dataset.preset));
  el.addEventListener('blur',endPresetPreview);
 });
 document.querySelectorAll('.color-adjust').forEach(el=>el.addEventListener('input',()=>{hasEdits=true;requestRender();}));
 document.querySelectorAll('.liquid-adjust').forEach(el=>el.addEventListener('input',()=>{document.querySelectorAll('[data-finish]').forEach(b=>{b.classList.remove('selected');b.setAttribute('aria-pressed','false');});hasEdits=true;requestRender();}));
 document.querySelectorAll('[data-finish]').forEach(el=>el.onclick=()=>{if(!ready)return;saveHistory();const settings={clear:[42,38,8],gel:[75,65,35],glow:[90,90,80]}[el.dataset.finish];['refraction','gloss','diffusion'].forEach((id,i)=>{$(id).value=settings[i];updateRange($(id));});document.querySelectorAll('[data-finish]').forEach(b=>{const on=b===el;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));});requestRender();});
 document.querySelectorAll('[data-glass]').forEach(el=>el.onclick=()=>{if(!ready)return;saveHistory();glassColor=el.dataset.glass;$('glassTint').value=glassColor==='clear'?0:60;$('glassClarity').value=glassColor==='clear'?100:94;$('glassReflection').value=glassColor==='clear'?12:25;['glassTint','glassClarity','glassReflection'].forEach(id=>updateRange($(id)));syncGlass();requestRender();});
 document.querySelectorAll('[data-glass-texture]').forEach(el=>el.onclick=()=>{if(!ready)return;saveHistory();glassTexture=el.dataset.glassTexture;syncGlass();requestRender();});
 document.querySelectorAll('.glass-adjust').forEach(el=>el.addEventListener('input',()=>{hasEdits=true;requestRender();}));
 document.querySelectorAll('.stroke-adjust').forEach(el=>el.addEventListener('input',()=>{hasEdits=true;requestRender();}));
 document.querySelectorAll('input[type=range]').forEach(el=>{el.addEventListener('pointerdown',()=>{if(ready)saveHistory();});el.addEventListener('keydown',e=>{if(ready&&!e.repeat&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(e.key))saveHistory();});});
 $('resetStrokeAdjust').onclick=()=>{if(!ready)return;saveHistory();['strokeIntensity','strokeThickness','strokeSoftness'].forEach((id,i)=>{$(id).value=[100,100,0][i];updateRange($(id));});requestRender();toast('已重置这组涂抹的整体调整。');};
 $('restoreAll').onclick=restoreAll;
 document.querySelectorAll('[data-layer]').forEach(el=>el.onclick=()=>{$('materialSidebar').dataset.active=el.dataset.layer;document.querySelectorAll('[data-layer]').forEach(b=>{const on=b===el;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));});});
 $('savePreset').onclick=()=>showLibrary(true);$('openLibrary').onclick=()=>showLibrary();$('closeLibrary').onclick=()=>$('presetDialog').close();$('presetForm').onsubmit=e=>{e.preventDefault();saveCurrentPreset($('presetName').value);};
 $('undo').onclick=undo;$('redo').onclick=redo;$('clear').onclick=()=>{clearStrokes();toast('涂抹已清空，玻璃材质与侧边设置已保留。');};$('resetColor').onclick=()=>{if(ready)saveHistory();resetColors();};
 const previousButton=$('comparePrevious');previousButton.addEventListener('pointerdown',e=>{e.preventDefault();previousButton.setPointerCapture(e.pointerId);comparePrevious(true);});['pointerup','pointercancel','lostpointercapture','blur'].forEach(event=>previousButton.addEventListener(event,()=>comparePrevious(false)));previousButton.addEventListener('keydown',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();comparePrevious(true);}});previousButton.addEventListener('keyup',()=>comparePrevious(false));
 $('compare').addEventListener('pointerdown',e=>{e.preventDefault();$('compare').setPointerCapture(e.pointerId);compare(true);});$('compare').addEventListener('pointerup',()=>compare(false));$('compare').addEventListener('pointercancel',()=>compare(false));$('compare').addEventListener('keydown',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();compare(true);}});$('compare').addEventListener('keyup',()=>compare(false));$('compare').addEventListener('blur',()=>compare(false));
 $('zoomIn').onclick=()=>changeZoom(zoom*1.25);$('zoomOut').onclick=()=>changeZoom(zoom/1.25);$('fit').onclick=()=>fitCanvas(true);$('export').onclick=exportImage;
 $('loadSample').onclick=()=>loadImage('assets/sample.png','示例照片',true);
 new ResizeObserver(()=>fitCanvas()).observe($('stage'));
// Only real text entry owns the keyboard; sliders, selects and buttons keep the editor shortcuts.
function typingTarget(el){return el?.isContentEditable||el?.tagName==='TEXTAREA'||(el?.tagName==='INPUT'&&!['range','checkbox','radio','button','file'].includes(el.type));}
 document.addEventListener('keydown',e=>{if(typingTarget(e.target))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();return;}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo();return;}if(e.ctrlKey||e.metaKey||e.altKey)return;if(e.target.tagName==='SELECT')return;if(e.code==='Space'&&e.target===document.body){e.preventDefault();spaceDown=true;$('editor').style.cursor='grab';$('brushCursor').hidden=true;}if(e.key.toLowerCase()==='b')setTool('paint');if(e.key.toLowerCase()==='p')setTool('push');if(e.key.toLowerCase()==='e')setTool('erase');});
 document.addEventListener('keyup',e=>{if(e.code==='Space'){spaceDown=false;$('editor').style.cursor='none';}});window.addEventListener('blur',()=>{spaceDown=false;endStroke();pointers.clear();compare(false);});
 $('editor').addEventListener('webglcontextlost',e=>{e.preventDefault();ready=false;toast('图形加速已中断，请刷新页面重新打开照片。');});
 loadImage('assets/sample.png','示例照片',true);
 renderLibrary();
 import('./recording.js').then(({setupRecording})=>setupRecording({canvas:$('editor'),isReady:()=>ready&&!exporting,notify:toast,createAnimation,analyseImage})).catch(()=>toast('动画录制模块加载失败，请刷新重试。'));
}catch(error){console.error(error);$('loading').innerHTML='<span>当前浏览器无法开启画布，请使用新版 Chrome 或 Edge。</span>';$('export').disabled=true;toast(error.message);}

// Use the same editor actions for supported agent-enabled browsers.
if(document.modelContext?.registerTool){
 const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
 const tools=[{
  name:'read_liquid_editor',title:'读取液体编辑状态',description:'Read the current image dimensions, selected brush, paint mode and color adjustments. Does not return image data.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},
  execute(){return {ready,dimensions:{width:imageWidth,height:imageHeight},tool,paintMode,eraseMode,strokeCount,layerCount:scene?.layers.length??0,brushSize:Number($('brushSize').value),thickness:Number($('amount').value),undoAvailable:history.length>0,colors:Object.fromEntries(['brightness','contrast','hue','saturation','temperature'].map(id=>[id,Number($(id).value)])),strokeLayer:Object.fromEntries(['strokeIntensity','strokeThickness','strokeSoftness'].map(id=>[id,Number($(id).value)]))};}
 },{
  name:'configure_liquid_editor',title:'调整液体编辑参数',description:'Select the same brush, paint mode or adjust the same color and current stroke-layer controls as the visible interface. Does not reset strokes or export an image.',inputSchema:{type:'object',properties:{tool:{type:'string',enum:['paint','push','erase']},paintMode:{type:'string',enum:['fusion','independent','squeeze']},eraseMode:{type:'string',enum:['top','all']},brushSize:{type:'number',minimum:20,maximum:240},amount:{type:'number',minimum:5,maximum:100},softness:{type:'number',minimum:15,maximum:100},strokeIntensity:{type:'number',minimum:0,maximum:150},strokeThickness:{type:'number',minimum:20,maximum:180},strokeSoftness:{type:'number',minimum:0,maximum:100},brightness:{type:'number',minimum:-50,maximum:50},contrast:{type:'number',minimum:-50,maximum:50},hue:{type:'number',minimum:-180,maximum:180},saturation:{type:'number',minimum:-100,maximum:100},temperature:{type:'number',minimum:-50,maximum:50}},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},
  async execute(input){
   if(!ready)throw new Error('Upload an image or wait for the sample to load first.');
   if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Expected a settings object.');
   const bounds={brushSize:[20,240],amount:[5,100],softness:[15,100],strokeIntensity:[0,150],strokeThickness:[20,180],strokeSoftness:[0,100],brightness:[-50,50],contrast:[-50,50],hue:[-180,180],saturation:[-100,100],temperature:[-50,50]};
   for(const [key,value] of Object.entries(input)){if(key==='tool'){if(!['paint','push','erase'].includes(value))throw new Error('Unknown brush.');}else if(key==='paintMode'){if(!Object.hasOwn(PAINT_MODES,value))throw new Error('Unknown paint mode.');}else if(key==='eraseMode'){if(!Object.hasOwn(ERASE_MODES,value))throw new Error('Unknown erase mode.');}else if(!bounds[key]||typeof value!=='number'||!Number.isFinite(value)||value<bounds[key][0]||value>bounds[key][1])throw new Error('Invalid setting: '+key);}
   for(const [key,value] of Object.entries(input)){if(key==='tool')setTool(value);else if(key==='paintMode')setPaintMode(value);else if(key==='eraseMode')setEraseMode(value);else{$(key).value=value;updateRange($(key));}}
   requestRender();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return {updated:true};
  }
 }];
 for(const definition of tools){try{Promise.resolve(document.modelContext.registerTool(definition,{signal:lifecycle.signal})).catch(()=>{});}catch{}}
}
