// Record the image canvas only. Controls remain interactive throughout capture.
export function setupRecording({canvas, isReady, notify}) {
 const $ = id => document.getElementById(id);
 let session=null, resultURL=null;
 const format=$('motionFormat'), start=$('startRecording'), stop=$('stopRecording'), status=$('recordStatus');
 function setState(state){
  $('recordingSection').dataset.state=state;
  const recording=state==='recording',processing=state==='processing',done=state==='done';
  start.hidden=recording||processing;stop.hidden=!recording&&!processing;
  start.textContent=done?'重新录制':state==='error'?'重试录制':'● 开始录制';
  stop.textContent=processing?'正在生成文件…':'■ 停止并生成文件';
  $('recordTimer').hidden=!recording;
  $('recordStateLabel').textContent={idle:'待录制',recording:'录制中',processing:'生成中',done:'已完成',error:'未完成'}[state];
  $('videoPreviewHeading').textContent=done?'录制结果':'实时画面';
  $('videoLiveFrame').hidden=done;$('recordResult').hidden=!done;
  $('downloadRecording').hidden=!done;
  $('recordGuide').textContent=recording?'现在拖动左侧参数，变化会被录进去。满意后点击停止并生成文件。':processing?'正在整理录制内容，请稍候。':done?'可以先播放检查，再点击下载。重新录制会生成新的结果。':'先选格式，点击开始录制，再到左侧调整已有涂抹。结束后生成文件供预览和下载。';
  document.querySelectorAll('[data-step]').forEach(el=>{if(el.dataset.step===(done?'done':recording||processing?'recording':'ready'))el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');});
 }
 // Independent live preview remains visible before capture and during parameter edits.
 function livePreview(){
  if(!$('videoExportPanel').hidden&&!$('videoLiveFrame').hidden&&canvas.width&&canvas.height){
   const p=$('videoPreview'),scale=440/Math.max(canvas.width,canvas.height),w=Math.max(1,Math.round(canvas.width*scale)),h=Math.max(1,Math.round(canvas.height*scale));
   if(p.width!==w||p.height!==h){p.width=w;p.height=h;}
   p.getContext('2d').drawImage(canvas,0,0,w,h);
  }
  previewFrame=requestAnimationFrame(livePreview);
 }
 let previewFrame=requestAnimationFrame(livePreview);setState('idle');
 const supported = typeof MediaRecorder !== 'undefined' && typeof canvas.captureStream === 'function';
 const mime = supported ? ['video/webm;codecs=vp8','video/webm;codecs=vp9','video/webm','video/mp4'].find(m=>MediaRecorder.isTypeSupported(m)) : null;
 if(!mime) { format.options[0].disabled=true; format.value='gif'; }
 else format.options[0].textContent=mime.includes('mp4')?'视频 MP4 · 30fps':'视频 WebM · 30fps';
 function cleanup(s) {
  clearInterval(s.timer); s.stream?.getTracks().forEach(t=>t.stop()); s.worker?.terminate();
  session=null; start.disabled=false; stop.disabled=true; format.disabled=false;
 }
 function fail(s,error) {
  if(session!==s)return;
  if(s.recorder?.state==='recording')s.recorder.stop();
  cleanup(s);setState('error'); status.textContent='录制失败，请重新开始'; notify(error.message||String(error));
 }
 function complete(s,blob,extension) {
  if(session!==s)return;
  if(!blob.size){fail(s,new Error('没有捕获到画面，请重新录制。'));return;}
  cleanup(s);
  if(resultURL)URL.revokeObjectURL(resultURL);
  resultURL=URL.createObjectURL(blob);
  const link=$('downloadRecording'); link.href=resultURL; link.download=`liquid-studio-${Date.now()}.${extension}`; link.hidden=false;
  link.textContent=`下载 ${extension.toUpperCase()} · ${(blob.size/1048576).toFixed(1)} MB`;
  const holder=$('recordResult'); holder.replaceChildren();
  const media=document.createElement(extension==='gif'?'img':'video');media.src=resultURL;
  if(extension==='gif')media.alt='录制的效果动画';else{media.controls=true;media.loop=true;media.playsInline=true;}
  holder.append(media);setState('done'); status.textContent='录制完成，可预览并下载';
 }
 function frame(s) {
  if(session!==s||s.stopping)return;
  const elapsed=performance.now()-s.started;
  status.textContent='正在录制画面变化';$('recordTimer').textContent=`${String(Math.floor(elapsed/60000)).padStart(2,'0')}:${String(Math.floor(elapsed/1000)%60).padStart(2,'0')}`;
  if(s.gif&&s.busy)return;
  s.ctx.drawImage(canvas,0,0,s.surface.width,s.surface.height);
  if(s.gif){
   s.busy=true;const pixels=s.ctx.getImageData(0,0,s.surface.width,s.surface.height).data;
   s.worker.postMessage({type:'frame',pixels,width:s.surface.width,height:s.surface.height,time:elapsed},[pixels.buffer]);
  }
 }
 start.onclick=()=>{
  if(session)return;
  if(!isReady()){notify('请等待图片加载完成后再开始录制。');return;}
  const gif=format.value==='gif',surface=document.createElement('canvas');
  const scale=Math.min(1,(gif?640:1280)/Math.max(canvas.width,canvas.height));
  surface.width=Math.max(2,Math.round(canvas.width*scale/2)*2);surface.height=Math.max(2,Math.round(canvas.height*scale/2)*2);
  const s={gif,surface,ctx:surface.getContext('2d',{willReadFrequently:gif}),started:performance.now(),busy:false};session=s;
  start.disabled=true;stop.disabled=false;format.disabled=true;setState('recording');
  try{
   if(gif){
    s.worker=new Worker(new URL('./gif-worker.js',import.meta.url),{type:'module'});
    s.worker.onmessage=({data})=>{if(data.type==='ready')s.busy=false;else if(data.type==='done')complete(s,new Blob([data.bytes],{type:'image/gif'}),'gif');else if(data.type==='error')fail(s,new Error(data.message));};
    s.worker.onerror=e=>fail(s,new Error(e.message||'GIF 编码失败'));
   }else{
    s.stream=surface.captureStream(30);s.chunks=[];
    s.recorder=new MediaRecorder(s.stream,{mimeType:mime,videoBitsPerSecond:6000000});
    s.recorder.ondataavailable=e=>{if(e.data.size)s.chunks.push(e.data);};
    s.recorder.onerror=e=>fail(s,e.error||new Error('视频编码失败'));
    s.recorder.onstop=()=>complete(s,new Blob(s.chunks,{type:s.recorder.mimeType}),s.recorder.mimeType.includes('mp4')?'mp4':'webm');
    s.recorder.start(1000);
   }
   frame(s);s.timer=setInterval(()=>{try{frame(s);}catch(error){fail(s,error);}},gif?100:1000/30);
  }catch(error){fail(s,error);}
 };
 stop.onclick=()=>{
  const s=session;if(!s||s.stopping)return;s.stopping=true;clearInterval(s.timer);stop.disabled=true;setState('processing');status.textContent='正在生成文件…';
  if(s.gif)s.worker.postMessage({type:'finish',time:performance.now()-s.started});else s.recorder.stop();
 };
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&session&&!session.stopping){stop.click();notify('页面已切到后台，已结束录制并保存，避免丢帧。');}});
 canvas.addEventListener('webglcontextlost',()=>{if(session)stop.click();});
 window.addEventListener('beforeunload',e=>{if(session){e.preventDefault();e.returnValue='';}});
 window.addEventListener('pagehide',()=>{cancelAnimationFrame(previewFrame);if(session)cleanup(session);if(resultURL)URL.revokeObjectURL(resultURL);});
}

