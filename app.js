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

class LiquidRenderer {
 constructor(canvas) {
  this.canvas=canvas;
  const gl = canvas.getContext('webgl', {alpha:false, antialias:false, preserveDrawingBuffer:true});
  if(!gl) throw new Error('当前浏览器不支持图形加速，请尝试新版 Chrome 或 Edge。');
  this.gl=gl;
  const vertex=`attribute vec2 a_position; varying vec2 v_uv; void main(){v_uv=vec2((a_position.x+1.0)*0.5,(1.0-a_position.y)*0.5);gl_Position=vec4(a_position,0.0,1.0);}`;
  const fragment=`precision highp float;
   varying vec2 v_uv;
   uniform sampler2D u_image; uniform sampler2D u_field;
   uniform vec2 u_fieldSize; uniform vec2 u_imageSize;
   uniform float u_original; uniform float u_brightness; uniform float u_contrast;
   uniform float u_saturation; uniform float u_hue; uniform float u_temperature;
   uniform float u_refraction; uniform float u_gloss; uniform float u_diffusion;
   uniform float u_strokeIntensity; uniform float u_strokeThickness; uniform float u_strokeSoftness;
   uniform vec3 u_absorption; uniform float u_glassTint; uniform float u_glassClarity; uniform float u_glassReflection; uniform float u_glassWarp; uniform float u_glassTexture;
   vec3 rawPhoto(vec2 uv){vec4 p=texture2D(u_image,clamp(uv,vec2(0.0),vec2(1.0)));return mix(vec3(1.0),p.rgb,p.a);}
   float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   vec3 photo(vec2 uv){
    vec2 aspect=vec2(u_imageSize.y/u_imageSize.x,1.0);vec2 q=uv;float ridge=0.0;float warp=u_glassWarp*0.01;
    if(u_glassTexture>0.5&&u_glassTexture<1.5){float phase=uv.x/aspect.x*115.0;ridge=cos(phase);q.x+=sin(phase)*0.018*aspect.x*warp;}
    else if(u_glassTexture>1.5){ridge=sin(uv.x/aspect.x*33.0+sin(uv.y*29.0))*cos(uv.y*22.0);q+=vec2(ridge,cos(uv.y*31.0+sin(uv.x*27.0)))*aspect*warp*0.014;}
    float frost=1.0-u_glassClarity*.01;vec3 c=rawPhoto(q);
    if(frost>.001){vec2 jitter=(vec2(hash(floor(uv*u_imageSize*.45)),hash(floor(uv.yx*u_imageSize.yx*.45)+7.0))-.5)*aspect*frost*.013;vec2 b=aspect*frost*.024;q+=jitter;c=rawPhoto(q)*.24;c+=rawPhoto(q+vec2(b.x,0.0))*.19+rawPhoto(q-vec2(b.x,0.0))*.19+rawPhoto(q+vec2(0.0,b.y))*.19+rawPhoto(q-vec2(0.0,b.y))*.19;c=mix(c,vec3(.86,.89,.87),frost*.17);}
    float depth=u_glassTint*.01*(1.0+abs(ridge)*warp*.4);
    vec3 transmission=exp(-u_absorption*depth*1.6);
    c*=transmission;
    float band=exp(-pow((uv.x+uv.y*.6-.36)*7.0,2.0))*.15;
    float edge=pow(1.0-min(min(uv.x,1.0-uv.x),min(uv.y,1.0-uv.y)),16.0)*.055;
    c+=(vec3(.96,.99,1.0)*band+vec3(edge)+vec3(max(ridge,0.0)*warp*.10))*u_glassReflection*.01;
    return c;
   }
   float heightAt(vec2 uv){return texture2D(u_field,clamp(uv,vec2(0.0),vec2(1.0))).r;}
   vec3 adjust(vec3 c){
     c+=u_brightness*0.006;
     c=(c-0.5)*(1.0+u_contrast*0.012)+0.5;
     vec3 axis=normalize(vec3(1.0)); float angle=u_hue*0.0174532925;
     c=c*cos(angle)+cross(axis,c)*sin(angle)+axis*dot(axis,c)*(1.0-cos(angle));
     float lum=dot(c,vec3(0.2126,0.7152,0.0722)); c=mix(vec3(lum),c,1.0+u_saturation*0.01);
     c+=vec3(0.0015,0.00025,-0.0015)*u_temperature;
     return clamp(c,0.0,1.0);
   }
   void main(){
    vec2 uv=v_uv;
    if(u_original>0.5){gl_FragColor=vec4(rawPhoto(uv),1.0);return;}
    vec3 color=photo(uv);
    vec4 field=texture2D(u_field,uv); float rawH=field.r; float h=pow(max(rawH,0.0001),mix(1.0,0.38,u_strokeSoftness))*u_strokeThickness; h=clamp(h,0.0,1.0);
    if(h>0.001){
     vec2 px=1.0/u_fieldSize;
     vec2 gradient=vec2(heightAt(uv+vec2(px.x,0.0))-heightAt(uv-vec2(px.x,0.0)),heightAt(uv+vec2(0.0,px.y))-heightAt(uv-vec2(0.0,px.y)));
     vec2 flow=field.gb*2.0-1.0; float flowLength=length(flow);
     vec2 direction=flowLength>0.02?flow/flowLength:vec2(0.7,0.7);
     vec2 aspect=vec2(u_imageSize.y/u_imageSize.x,1.0);
     float refract=u_refraction*0.01;float gloss=u_gloss*0.01;float diffusion=u_diffusion*0.01;
     vec2 offset=gradient*aspect*refract*(2.2+u_strokeThickness*1.8) + flow*aspect*h*refract*0.16;
     vec2 across=vec2(-direction.y,direction.x);
     float ridge=sin(dot(uv/aspect,across)*155.0+sin(uv.y*23.0)*0.7);
     float broadRidge=sin(dot(uv/aspect,across)*46.0+sin(uv.x*17.0)*0.9);
     offset+=across*aspect*(ridge*0.0025+broadRidge*0.005)*h*refract;
     offset=clamp(offset,vec2(-0.15),vec2(0.15));
     vec2 sampleUV=uv+offset;
     vec2 blur=direction*aspect*h*(0.002+diffusion*0.028+u_strokeThickness*0.018+u_strokeSoftness*0.07);
     vec3 glass=photo(sampleUV)*0.28;
     glass+=photo(sampleUV+blur)*0.16+photo(sampleUV-blur)*0.16;
     glass+=photo(sampleUV+blur*2.0)*0.11+photo(sampleUV-blur*2.0)*0.11;
     glass+=photo(sampleUV+blur*3.0)*0.09+photo(sampleUV-blur*3.0)*0.09;
     float edge=min(length(gradient)*24.0,1.0);
     glass.r=mix(glass.r,photo(sampleUV+offset*0.07).r,edge*0.68);
     glass.b=mix(glass.b,photo(sampleUV-offset*0.07).b,edge*0.68);
     vec3 normal=normalize(vec3(-gradient.x*22.0,-gradient.y*22.0,1.0));
     float light=dot(normal,normalize(vec3(-0.45,-0.6,0.8)));
     float shine=pow(max(light,0.0),18.0)*edge*gloss*1.6;
     float rim=pow(1.0-normal.z,1.3)*gloss*0.28;
     float shadow=max(dot(gradient,vec2(0.5,0.7)),0.0)*gloss*2.7;
     glass=glass*(1.0-shadow)+vec3(1.0,0.99,0.93)*(shine+rim);
     vec3 halo=photo(sampleUV+aspect*vec2(0.014,0.0))+photo(sampleUV-aspect*vec2(0.014,0.0))+photo(sampleUV+vec2(0.0,0.014))+photo(sampleUV-vec2(0.0,0.014));
     glass+=max(halo*0.25-0.55,vec3(0.0))*h*(diffusion+u_strokeSoftness)*0.85;
     float luminance=dot(glass,vec3(0.2126,0.7152,0.0722));
     float milky=u_strokeSoftness*0.34+h*0.10;
     glass=mix(glass,vec3(luminance)*0.82+glass*0.18,milky);
     glass+=vec3(0.96,0.98,0.94)*h*(0.025+u_strokeSoftness*0.09);
     float film=smoothstep(0.004,0.13,h)*clamp(u_strokeIntensity,0.0,1.5);
     color=mix(color,glass,clamp(film,0.0,1.0));
    }
    gl_FragColor=vec4(adjust(color),1.0);
   }`;
  const compile=(type,src)=>{const shader=gl.createShader(type);gl.shaderSource(shader,src);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));return shader;};
  this.program=gl.createProgram(); gl.attachShader(this.program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(this.program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(this.program);
  if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(this.program));
  gl.useProgram(this.program);
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  const a=gl.getAttribLocation(this.program,'a_position');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
  this.locations={}; ['image','field','fieldSize','imageSize','original','brightness','contrast','saturation','hue','temperature','refraction','gloss','diffusion','strokeIntensity','strokeThickness','strokeSoftness','absorption','glassTint','glassClarity','glassReflection','glassWarp','glassTexture'].forEach(n=>this.locations[n]=gl.getUniformLocation(this.program,'u_'+n));
  this.imageTexture=this.texture(0);this.fieldTexture=this.texture(1);gl.uniform1i(this.locations.image,0);gl.uniform1i(this.locations.field,1);
 }
 texture(unit){const gl=this.gl;gl.activeTexture(gl.TEXTURE0+unit);const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;}
 setImage(image){const gl=this.gl;gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.imageTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);this.width=image.width;this.height=image.height;gl.uniform2f(this.locations.imageSize,this.width,this.height);}
 setField(data,w,h){const gl=this.gl;gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.fieldTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,data);gl.uniform2f(this.locations.fieldSize,w,h);}
 draw(w,h,original=false){const gl=this.gl;if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}gl.viewport(0,0,w,h);gl.uniform1f(this.locations.original,original?1:0);['brightness','contrast','hue','saturation','temperature','refraction','gloss','diffusion','strokeIntensity','strokeThickness','strokeSoftness','glassTint','glassClarity','glassReflection','glassWarp'].forEach(n=>gl.uniform1f(this.locations[n],Number($(n).value)/(['strokeIntensity','strokeThickness','strokeSoftness'].includes(n)?100:1)));gl.uniform3fv(this.locations.absorption,GLASS_COLORS[glassColor]);gl.uniform1f(this.locations.glassTexture,['smooth','reeded','ripple'].indexOf(glassTexture));gl.drawArrays(gl.TRIANGLES,0,6);}
}

let renderer, ready=false, exporting=false, imageWidth=0,imageHeight=0,fieldW=0,fieldH=0,fieldBytes,heights,flowX,flowY;
let dirty=true,queued=false,tool='paint',zoom=1,panX=0,panY=0,fitW=0,fitH=0,original=false,spaceDown=false;
let history=[],future=[],stroke=null,loadToken=0,currentName='liquid-studio',hasEdits=false;
const GLASS_COLORS={clear:[0,0,0],blue:[1.05,.35,.025],yellow:[.02,.15,1.1],brown:[.23,.7,1.28],red:[.04,1.1,.95]};
const DEFAULT_SETTINGS={brushSize:100,amount:72,softness:65,refraction:75,gloss:65,diffusion:35,strokeIntensity:100,strokeThickness:100,strokeSoftness:0,brightness:0,contrast:0,hue:0,saturation:0,temperature:0,glassTint:0,glassClarity:100,glassReflection:0,glassWarp:35};
let glassColor='clear',glassTexture='smooth',originalSource=null;
let strokeCount=0;
function captureSettings(){return {values:Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map(id=>[id,Number($(id).value)])),glassColor,glassTexture,tool};}
function applySettings(settings){for(const [id,def] of Object.entries(DEFAULT_SETTINGS)){$(id).value=settings.values?.[id]??def;updateRange($(id));}glassColor=Object.hasOwn(GLASS_COLORS,settings.glassColor)?settings.glassColor:'clear';glassTexture=['smooth','reeded','ripple'].includes(settings.glassTexture)?settings.glassTexture:'smooth';setTool(['paint','push','erase'].includes(settings.tool)?settings.tool:'paint');syncGlass();syncFinish();}
function syncGlass(){document.querySelectorAll('[data-glass]').forEach(el=>{const on=el.dataset.glass===glassColor;el.classList.toggle('selected',on);el.setAttribute('aria-pressed',String(on));});document.querySelectorAll('[data-glass-texture]').forEach(el=>{const on=el.dataset.glassTexture===glassTexture;el.classList.toggle('selected',on);el.setAttribute('aria-pressed',String(on));});}
function syncFinish(){const v=['refraction','gloss','diffusion'].map(id=>Number($(id).value));document.querySelectorAll('[data-finish]').forEach(el=>{const on={clear:[42,38,8],gel:[75,65,35],glow:[90,90,80]}[el.dataset.finish].every((x,i)=>x===v[i]);el.classList.toggle('selected',on);el.setAttribute('aria-pressed',String(on));});}
function snapshot(){return {field:pack().slice(),settings:captureSettings()};}
function restoreAll(){if(!ready||exporting)return;saveHistory();setPreset('clear',false);applySettings({values:DEFAULT_SETTINGS,glassColor:'clear',glassTexture:'smooth',tool:'paint'});fitCanvas(true);compare(false);dirty=true;requestRender();toast('已还原当前原图；可以撤销，已保存的预设不受影响。');}
const pointers=new Map();let pinch=null;
function pack(){for(let i=0;i<heights.length;i++){let j=i*4;fieldBytes[j]=Math.round(Math.min(1,heights[i])*255);fieldBytes[j+1]=Math.round((flowX[i]*0.5+0.5)*255);fieldBytes[j+2]=Math.round((flowY[i]*0.5+0.5)*255);fieldBytes[j+3]=255;}return fieldBytes;}
function restore(state){const bytes=state.field??state;for(let i=0;i<heights.length;i++){heights[i]=bytes[i*4]/255;flowX[i]=bytes[i*4+1]/127.5-1;flowY[i]=bytes[i*4+2]/127.5-1;}if(state.settings)applySettings(state.settings);dirty=true;requestRender();}
function saveHistory(){history.push(snapshot());if(history.length>25)history.shift();future=[];updateHistory();}
function updateHistory(){$('undo').disabled=!history.length;$('redo').disabled=!future.length;}
function undo(){if(!ready||!history.length)return;future.push(snapshot());restore(history.pop());updateHistory();}
function redo(){if(!ready||!future.length)return;history.push(snapshot());restore(future.pop());updateHistory();}
function requestRender(){if(queued||!ready||exporting)return;queued=true;requestAnimationFrame(()=>{queued=false;if(!ready||exporting)return;if(dirty){renderer.setField(pack(),fieldW,fieldH);dirty=false;}const scale=Math.min(1,1536/Math.max(imageWidth,imageHeight));renderer.draw(Math.max(1,Math.round(imageWidth*scale)),Math.max(1,Math.round(imageHeight*scale)),original);if(!original){const p=$('preview');const ps=440/Math.max(imageWidth,imageHeight),pw=Math.max(1,Math.round(imageWidth*ps)),ph=Math.max(1,Math.round(imageHeight*ps));if(p.width!==pw||p.height!==ph){p.width=pw;p.height=ph;}p.getContext('2d').drawImage($('editor'),0,0,pw,ph);}});}
function fitCanvas(reset=false){if(!ready)return;const box=$('stage').getBoundingClientRect();const scale=Math.min((box.width-44)/imageWidth,(box.height-44)/imageHeight);fitW=imageWidth*scale;fitH=imageHeight*scale;if(reset){zoom=1;panX=0;panY=0;}const wrap=$('canvasWrap');wrap.style.width=fitW+'px';wrap.style.height=fitH+'px';applyView();}
function applyView(){panX=Math.max(-fitW*zoom/2,Math.min(fitW*zoom/2,panX));panY=Math.max(-fitH*zoom/2,Math.min(fitH*zoom/2,panY));$('canvasWrap').style.transform=`translate(${panX}px,${panY}px) scale(${zoom})`;$('fit').textContent=zoom===1?'适应':Math.round(zoom*100)+'%';}
function changeZoom(value){zoom=Math.max(.5,Math.min(4,value));applyView();}
function coords(event){const r=$('editor').getBoundingClientRect();return {x:(event.clientX-r.left)/r.width,y:(event.clientY-r.top)/r.height};}
function brushRadius(){return Number($('brushSize').value)/Math.min(fitW,fitH)/zoom/2*Math.min(fieldW,fieldH);}
function stamp(x,y,dx,dy,r,amount,erase=false){
 const cx=x*fieldW,cy=y*fieldH;const xmin=Math.max(0,Math.floor(cx-r)),xmax=Math.min(fieldW-1,Math.ceil(cx+r)),ymin=Math.max(0,Math.floor(cy-r)),ymax=Math.min(fieldH-1,Math.ceil(cy+r));
 const soft=Number($('softness').value)/100; const len=Math.hypot(dx,dy);const fx=len>0.00001?dx/len:.7,fy=len>0.00001?dy/len:.7;
 for(let yy=ymin;yy<=ymax;yy++)for(let xx=xmin;xx<=xmax;xx++){
  const qx=(xx-cx)/r,qy=(yy-cy)/r,d=Math.hypot(qx,qy);if(d>=1)continue;
  const edge=Math.max(0,Math.min(1,(1-d)/(.25+soft*.75)));const fall=edge*edge*(3-2*edge);
  const i=yy*fieldW+xx;
  if(erase){heights[i]*=Math.max(0,1-fall*amount*2.1);if(heights[i]<.002)heights[i]=0;}
  else{const grain=1+0.07*Math.sin((xx*(-fy)+yy*fx)*.28);const add=fall*amount*grain;heights[i]=Math.min(.97,heights[i]+add*(1-heights[i]*.45));flowX[i]=flowX[i]*(1-fall*.35)+fx*fall*.35;flowY[i]=flowY[i]*(1-fall*.35)+fy*fall*.35;}
 }
 dirty=true;
}
function pushStroke(x,y,dx,dy,r){
 const cx=x*fieldW,cy=y*fieldH;const xmin=Math.max(0,Math.floor(cx-r)),xmax=Math.min(fieldW-1,Math.ceil(cx+r)),ymin=Math.max(0,Math.floor(cy-r)),ymax=Math.min(fieldH-1,Math.ceil(cy+r));
 const oldH=heights.slice(),oldX=flowX.slice(),oldY=flowY.slice();
 const sample=(a,x,y)=>{x=Math.max(0,Math.min(fieldW-1.001,x));y=Math.max(0,Math.min(fieldH-1.001,y));const ix=Math.floor(x),iy=Math.floor(y),tx=x-ix,ty=y-iy;const j=iy*fieldW+ix;return a[j]*(1-tx)*(1-ty)+a[j+1]*tx*(1-ty)+a[j+fieldW]*(1-tx)*ty+a[j+fieldW+1]*tx*ty;};
 for(let yy=ymin;yy<=ymax;yy++)for(let xx=xmin;xx<=xmax;xx++){const d=Math.hypot(xx-cx,yy-cy)/r;if(d>=1)continue;const f=(1-d*d)**2;const i=yy*fieldW+xx;const sx=xx-dx*fieldW*f*.9,sy=yy-dy*fieldH*f*.9;heights[i]=sample(oldH,sx,sy);flowX[i]=sample(oldX,sx,sy);flowY[i]=sample(oldY,sx,sy);}
 dirty=true;
}
function paintSegment(a,b,pressure=1){
 const dx=b.x-a.x,dy=b.y-a.y,r=brushRadius();const distance=Math.hypot(dx*fieldW,dy*fieldH);
 if(tool==='push'){pushStroke(b.x,b.y,dx,dy,r);return;}
 const steps=Math.max(1,Math.ceil(distance/Math.max(1,r*.14)));const amount=Number($('amount').value)/100*.17*pressure;
 for(let i=1;i<=steps;i++)stamp(a.x+dx*i/steps,a.y+dy*i/steps,dx*fieldW,dy*fieldH,r,amount,tool==='erase');
}
function setPreset(name,record=true){
 if(!ready)return;if(record)saveHistory();heights.fill(0);flowX.fill(0);flowY.fill(0);strokeCount=name==='clear'?0:(name==='strokes'?4:1);updateStrokeCount();
 if(name==='thin'){for(let y=0;y<fieldH;y++)for(let x=0;x<fieldW;x++){const i=y*fieldW+x;heights[i]=.16+.06*Math.sin(x/fieldW*11+y/fieldH*4);flowX[i]=.55;flowY[i]=.3;}}
 if(name==='strokes'){
  const radius=Math.min(fieldW,fieldH)*.095;
  const paths=[[[.00,.27],[.10,.21],[.27,.16],[.44,.12],[.64,.08]],[[.02,.49],[.15,.41],[.31,.35],[.48,.28],[.57,.22]],[[.07,.74],[.16,.64],[.29,.55],[.40,.49]],[[.12,.96],[.21,.85],[.32,.77]]];
  for(const path of paths)for(let k=1;k<path.length;k++){const a=path[k-1],b=path[k];const dx=b[0]-a[0],dy=b[1]-a[1];const steps=Math.ceil(Math.hypot(dx*fieldW,dy*fieldH)/(radius*.12));for(let s=0;s<=steps;s++)stamp(a[0]+dx*s/steps,a[1]+dy*s/steps,dx*fieldW,dy*fieldH,radius,.065);}
 }
 document.querySelectorAll('.preset').forEach(el=>{const on=el.dataset.preset===name;el.classList.toggle('selected',on);el.setAttribute('aria-pressed',String(on));});dirty=true;hasEdits=record;requestRender();
}
function updateStrokeCount(){const el=$('strokeCount');if(el)el.textContent=strokeCount+' 笔';}
function setTool(next){tool=next;document.querySelectorAll('.tool').forEach(el=>{const on=el.dataset.tool===tool;el.classList.toggle('selected',on);el.setAttribute('aria-pressed',String(on));});$('brushCursor').classList.toggle('erase',tool==='erase');$('canvasHint').textContent={paint:'拖动涂抹，让光线换一种经过的方式。',push:'沿着已有的液体拖动，把纹路轻轻推开。',erase:'擦去液体，让原本的清晰重新显现。'}[tool];}
function cursor(event){if(!ready)return;const p=coords(event),el=$('brushCursor');el.style.left=p.x*fitW+'px';el.style.top=p.y*fitH+'px';const size=Number($('brushSize').value)/zoom;el.style.width=size+'px';el.style.height=size+'px';el.hidden=spaceDown||event.pointerType==='touch';}
function endStroke(){stroke=null;pinch=null;}
function beginPinch(){if(pointers.size!==2)return;const [a,b]=[...pointers.values()];pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),zoom,midX:(a.x+b.x)/2,midY:(a.y+b.y)/2,panX,panY};stroke=null;}
function handleDown(e){if(!ready||exporting||e.button>1)return;e.preventDefault();$('stage').setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){beginPinch();return;}if(pointers.size>2)return;
 if(spaceDown||e.button===1){stroke={pan:true,x:e.clientX,y:e.clientY,panX,panY};return;}
 if(e.target!==$('editor'))return;
 saveHistory();strokeCount++;updateStrokeCount();const p=coords(e);stroke={point:p};original=false;$('originalBadge').hidden=true;hasEdits=true;
 if(tool!=='push')paintSegment(p,p,e.pointerType==='pen'?Math.max(.2,e.pressure):1);dirty=true;requestRender();cursor(e);
 document.querySelectorAll('.preset').forEach(el=>{el.classList.remove('selected');el.setAttribute('aria-pressed','false');});
}
function handleMove(e){cursor(e);if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(pinch&&pointers.size>=2){const [a,b]=[...pointers.values()];zoom=Math.max(.5,Math.min(4,pinch.zoom*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,pinch.distance)));panX=pinch.panX+(a.x+b.x)/2-pinch.midX;panY=pinch.panY+(a.y+b.y)/2-pinch.midY;applyView();return;}
 if(!stroke)return;if(stroke.pan){panX=stroke.panX+e.clientX-stroke.x;panY=stroke.panY+e.clientY-stroke.y;applyView();return;}
 const p=coords(e);paintSegment(stroke.point,p,e.pointerType==='pen'?Math.max(.2,e.pressure):1);stroke.point=p;requestRender();
}
function handleUp(e){pointers.delete(e.pointerId);endStroke();if(e.pointerType==='touch')$('brushCursor').hidden=true;}

async function loadImage(src,name,sample=false){
 const token=++loadToken;$('loading').hidden=false;const previousReady=ready;
 try{
  const image=new Image();image.src=src;await image.decode();if(token!==loadToken)return;
  const maxTexture=Math.min(renderer.gl.getParameter(renderer.gl.MAX_TEXTURE_SIZE),8192);
  const scale=Math.min(1,maxTexture/image.width,maxTexture/image.height,Math.sqrt(24000000/(image.width*image.height)));
  let source=image;
  if(scale<1){source=document.createElement('canvas');source.width=Math.max(1,Math.round(image.width*scale));source.height=Math.max(1,Math.round(image.height*scale));source.getContext('2d').drawImage(image,0,0,source.width,source.height);toast('这张照片较大，已缩至 '+source.width+' × '+source.height+' 以流畅编辑。');}
  renderer.setImage(source);originalSource=source;imageWidth=source.width;imageHeight=source.height;
  const fieldScale=640/Math.max(imageWidth,imageHeight);fieldW=Math.max(2,Math.round(imageWidth*fieldScale));fieldH=Math.max(2,Math.round(imageHeight*fieldScale));
  const n=fieldW*fieldH;heights=new Float32Array(n);flowX=new Float32Array(n);flowY=new Float32Array(n);fieldBytes=new Uint8Array(n*4);
  history=[];future=[];updateHistory();ready=true;currentName=name.replace(/\.[^.]+$/,'');hasEdits=false;resetColors(false);fitCanvas(true);setPreset(sample?'strokes':'clear',false);Object.entries({strokeIntensity:100,strokeThickness:100,strokeSoftness:0}).forEach(([id,value])=>{$(id).value=value;updateRange($(id));});
  $('dimensions').textContent=imageWidth+' × '+imageHeight;$('imageBadge').textContent=sample?'示例照片':name;
  $('imageBadge').title=name;original=false;$('originalBadge').hidden=true;endStroke();pointers.clear();requestRender();return true;
 }catch(error){ready=previousReady;toast('图片未能打开，请选择 PNG、JPG 或 WebP 图片。');console.error(error);if(!ready){$('loading').innerHTML='<span>示例暂时无法载入，请上传一张照片开始。</span>';return;}}
 finally{if(token===loadToken&&ready)$('loading').hidden=true;}
}
async function loadFile(file){if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)){toast('请选择 PNG、JPG 或 WebP 图片。');return;}if(file.size>60*1024*1024){toast('请选择小于 60 MB 的图片。');return;}const url=URL.createObjectURL(file);try{await loadImage(url,file.name);}finally{URL.revokeObjectURL(url);$('fileInput').value='';}}
function resetColors(render=true){document.querySelectorAll('.color-adjust').forEach(el=>{el.value=0;updateRange(el);});if(render)requestRender();}
function compare(on){if(!ready)return;original=on;$('originalBadge').hidden=!on;requestRender();}
async function exportImage(){
 if(!ready||exporting)return;exporting=true;$('export').disabled=true;$('export').textContent='正在导出…';
 try{
  if(dirty){renderer.setField(pack(),fieldW,fieldH);dirty=false;}
  const target=$('exportSize').value;const scale=target==='original'?1:Math.min(1,Number(target)/Math.max(imageWidth,imageHeight));
  const w=Math.max(1,Math.round(imageWidth*scale)),h=Math.max(1,Math.round(imageHeight*scale));renderer.draw(w,h,false);
  const format=$('format').value;const blob=await new Promise(resolve=>$('editor').toBlob(resolve,'image/'+format,.95));if(!blob)throw new Error('Empty image');
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=currentName+'-液体涂抹.'+(format==='jpeg'?'jpg':'png');document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);toast(`已导出 ${w} × ${h} 的${format==='jpeg'?' JPG':' PNG'} 图片`);
 }catch(error){console.error(error);toast('导出未完成，请尝试较小的导出尺寸。');}
 finally{exporting=false;$('export').disabled=false;$('export').innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true">${icons.download}</svg>导出图片`;requestRender();}
}

let presetDBPromise,libraryUrls=[],savingPreset=false;
function openPresetDB(){if(presetDBPromise)return presetDBPromise;presetDBPromise=new Promise((resolve,reject)=>{if(!window.indexedDB){reject(new Error('此浏览器不能保存本地预设'));return;}const request=indexedDB.open('liquid-studio-presets',1);request.onupgradeneeded=()=>request.result.createObjectStore('presets',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('请关闭其他工作台标签页后重试'));}).catch(e=>{presetDBPromise=null;throw e;});return presetDBPromise;}
async function presetTransaction(mode,action){const db=await openPresetDB();return new Promise((resolve,reject)=>{const tx=db.transaction('presets',mode);let result;const req=action(tx.objectStore('presets'));req.onsuccess=()=>{result=req.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('保存中断'));});}
function validateSavedPreset(record){
 if(!record||record.version!==1||!(record.image instanceof Blob)||!(record.field instanceof Uint8Array)||!Number.isInteger(record.fieldW)||!Number.isInteger(record.fieldH)||record.fieldW<2||record.fieldH<2||record.fieldW>640||record.fieldH>640||record.field.length!==record.fieldW*record.fieldH*4||!record.settings?.values)throw new Error('预设数据不完整');
 for(const id of Object.keys(DEFAULT_SETTINGS))if(!Number.isFinite(record.settings.values[id]))throw new Error('预设参数无效');
 return record;
}
function resampleField(bytes,oldW,oldH,newW,newH){const out=new Uint8Array(newW*newH*4);for(let y=0;y<newH;y++)for(let x=0;x<newW;x++){const sx=(x/(newW-1))*(oldW-1),sy=(y/(newH-1))*(oldH-1),x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(oldW-1,x0+1),y1=Math.min(oldH-1,y0+1),tx=sx-x0,ty=sy-y0;for(let c=0;c<4;c++)out[(y*newW+x)*4+c]=Math.round(bytes[(y0*oldW+x0)*4+c]*(1-tx)*(1-ty)+bytes[(y0*oldW+x1)*4+c]*tx*(1-ty)+bytes[(y1*oldW+x0)*4+c]*(1-tx)*ty+bytes[(y1*oldW+x1)*4+c]*tx*ty);}return out;}
function canvasBlob(canvas,type='image/png',quality=.92){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('图片保存失败')),type,quality));}
async function saveCurrentPreset(name){
 if(!ready||!originalSource||exporting||savingPreset)return;
 name=name.trim();if(!name){$('presetName').focus();return;}
 savingPreset=true;$('confirmSave').disabled=true;$('confirmSave').textContent='正在保存…';
 try{
  const record={id:crypto.randomUUID(),version:1,name:name.slice(0,50),createdAt:Date.now(),settings:captureSettings(),field:pack().slice(),fieldW,fieldH,sourceName:currentName};
  const sourceCanvas=document.createElement('canvas');sourceCanvas.width=imageWidth;sourceCanvas.height=imageHeight;sourceCanvas.getContext('2d').drawImage(originalSource,0,0,imageWidth,imageHeight);
  renderer.setField(record.field,fieldW,fieldH);dirty=false;const scale=Math.min(1,1536/Math.max(imageWidth,imageHeight));renderer.draw(Math.max(1,Math.round(imageWidth*scale)),Math.max(1,Math.round(imageHeight*scale)),false);
  const thumb=document.createElement('canvas'),ts=320/Math.max(imageWidth,imageHeight);thumb.width=Math.max(1,Math.round(imageWidth*ts));thumb.height=Math.max(1,Math.round(imageHeight*ts));thumb.getContext('2d').drawImage($('editor'),0,0,thumb.width,thumb.height);
  [record.image,record.thumbnail]=await Promise.all([canvasBlob(sourceCanvas),canvasBlob(thumb,'image/jpeg',.85)]);
  await presetTransaction('readwrite',store=>store.put(record));$('presetName').value='';await renderLibrary();toast('已保存原图与全部效果，下次可继续编辑。');
 }catch(error){console.error(error);toast(error.name==='QuotaExceededError'?'浏览器存储空间不足，预设未保存。':('保存未完成：'+(error.message||'请检查浏览器存储权限')));}
 finally{savingPreset=false;$('confirmSave').disabled=false;$('confirmSave').textContent='保存当前作品';requestRender();}
}
async function openSavedPreset(id,applyOnly=false){
 try{
  const record=validateSavedPreset(await presetTransaction('readonly',store=>store.get(id)));
  if(applyOnly){if(!ready){toast('请先上传一张图片。');return;}saveHistory();}
  else{const url=URL.createObjectURL(record.image);try{if(!await loadImage(url,record.sourceName||record.name))return;}finally{URL.revokeObjectURL(url);}}
  const bytes=record.fieldW===fieldW&&record.fieldH===fieldH?record.field:resampleField(record.field,record.fieldW,record.fieldH,fieldW,fieldH);
  restore({field:bytes,settings:record.settings});dirty=true;original=false;$('originalBadge').hidden=true;document.querySelectorAll('.preset').forEach(el=>{el.classList.remove('selected');el.setAttribute('aria-pressed','false');});requestRender();$('presetDialog').close();toast(applyOnly?'已将预设效果套用到当前图片。':'已恢复作品，可以继续涂抹和调整。');
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
 $('stage').addEventListener('pointerdown',handleDown);$('stage').addEventListener('pointermove',handleMove);$('stage').addEventListener('pointerup',handleUp);$('stage').addEventListener('pointercancel',handleUp);$('editor').addEventListener('pointerleave',()=>{$('brushCursor').hidden=true;});
 $('stage').addEventListener('wheel',e=>{if(!ready)return;e.preventDefault();changeZoom(zoom*Math.exp(-e.deltaY*.001));},{passive:false});
 $('uploadTop').onclick=()=>$('fileInput').click();$('fileInput').onchange=e=>loadFile(e.target.files[0]);
 let dragDepth=0;document.body.addEventListener('dragenter',e=>{if(!e.dataTransfer.types.includes('Files'))return;e.preventDefault();dragDepth++;$('dropOverlay').hidden=false;});document.body.addEventListener('dragover',e=>e.preventDefault());document.body.addEventListener('dragleave',e=>{e.preventDefault();if(--dragDepth<=0){dragDepth=0;$('dropOverlay').hidden=true;}});document.body.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('dropOverlay').hidden=true;loadFile(e.dataTransfer.files[0]);});
 document.querySelectorAll('.tool').forEach(el=>el.onclick=()=>setTool(el.dataset.tool));document.querySelectorAll('.preset').forEach(el=>el.onclick=()=>setPreset(el.dataset.preset));
 document.querySelectorAll('.color-adjust').forEach(el=>el.addEventListener('input',()=>{hasEdits=true;requestRender();}));
 document.querySelectorAll('.liquid-adjust').forEach(el=>el.addEventListener('input',()=>{document.querySelectorAll('[data-finish]').forEach(b=>{b.classList.remove('selected');b.setAttribute('aria-pressed','false');});hasEdits=true;requestRender();}));
 document.querySelectorAll('[data-finish]').forEach(el=>el.onclick=()=>{const settings={clear:[42,38,8],gel:[75,65,35],glow:[90,90,80]}[el.dataset.finish];['refraction','gloss','diffusion'].forEach((id,i)=>{$(id).value=settings[i];updateRange($(id));});document.querySelectorAll('[data-finish]').forEach(b=>{const on=b===el;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));});requestRender();});
 document.querySelectorAll('[data-glass]').forEach(el=>el.onclick=()=>{if(!ready)return;saveHistory();glassColor=el.dataset.glass;$('glassTint').value=glassColor==='clear'?0:60;$('glassClarity').value=glassColor==='clear'?100:94;$('glassReflection').value=glassColor==='clear'?12:25;['glassTint','glassClarity','glassReflection'].forEach(id=>updateRange($(id)));syncGlass();requestRender();});
 document.querySelectorAll('[data-glass-texture]').forEach(el=>el.onclick=()=>{if(!ready)return;saveHistory();glassTexture=el.dataset.glassTexture;syncGlass();requestRender();});
 document.querySelectorAll('.glass-adjust').forEach(el=>el.addEventListener('input',()=>{hasEdits=true;requestRender();}));
 document.querySelectorAll('.stroke-adjust').forEach(el=>el.addEventListener('input',()=>{hasEdits=true;requestRender();}));
 document.querySelectorAll('input[type=range]').forEach(el=>el.addEventListener('pointerdown',()=>{if(ready)saveHistory();}));
 $('resetStrokeAdjust').onclick=()=>{if(!ready)return;saveHistory();['strokeIntensity','strokeThickness','strokeSoftness'].forEach((id,i)=>{$(id).value=[100,100,0][i];updateRange($(id));});requestRender();toast('已重置这组涂抹的整体调整。');};
 $('restoreAll').onclick=restoreAll;
 document.querySelectorAll('[data-layer]').forEach(el=>el.onclick=()=>{$('materialSidebar').dataset.active=el.dataset.layer;document.querySelectorAll('[data-layer]').forEach(b=>{const on=b===el;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));});});
 $('savePreset').onclick=()=>showLibrary(true);$('openLibrary').onclick=()=>showLibrary();$('closeLibrary').onclick=()=>$('presetDialog').close();$('presetForm').onsubmit=e=>{e.preventDefault();saveCurrentPreset($('presetName').value);};
 $('undo').onclick=undo;$('redo').onclick=redo;$('clear').onclick=()=>{setPreset('clear');toast('涂抹已清空，可撤销恢复。');};$('resetColor').onclick=()=>{if(ready)saveHistory();resetColors();};
 $('compare').addEventListener('pointerdown',e=>{e.preventDefault();$('compare').setPointerCapture(e.pointerId);compare(true);});$('compare').addEventListener('pointerup',()=>compare(false));$('compare').addEventListener('pointercancel',()=>compare(false));$('compare').addEventListener('keydown',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();compare(true);}});$('compare').addEventListener('keyup',()=>compare(false));$('compare').addEventListener('blur',()=>compare(false));
 $('zoomIn').onclick=()=>changeZoom(zoom*1.25);$('zoomOut').onclick=()=>changeZoom(zoom/1.25);$('fit').onclick=()=>fitCanvas(true);$('export').onclick=exportImage;
 $('loadSample').onclick=()=>loadImage('assets/sample.png','示例照片',true);
 new ResizeObserver(()=>fitCanvas()).observe($('stage'));
 document.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();return;}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo();return;}if(e.ctrlKey||e.metaKey||e.altKey)return;if(e.code==='Space'&&e.target===document.body){e.preventDefault();spaceDown=true;$('editor').style.cursor='grab';$('brushCursor').hidden=true;}if(e.key.toLowerCase()==='b')setTool('paint');if(e.key.toLowerCase()==='p')setTool('push');if(e.key.toLowerCase()==='e')setTool('erase');});
 document.addEventListener('keyup',e=>{if(e.code==='Space'){spaceDown=false;$('editor').style.cursor='none';}});window.addEventListener('blur',()=>{spaceDown=false;endStroke();pointers.clear();compare(false);});
 $('editor').addEventListener('webglcontextlost',e=>{e.preventDefault();ready=false;toast('图形加速已中断，请刷新页面重新打开照片。');});
 loadImage('assets/sample.png','示例照片',true);
 renderLibrary();
}catch(error){console.error(error);$('loading').innerHTML='<span>当前浏览器无法开启画布，请使用新版 Chrome 或 Edge。</span>';$('export').disabled=true;toast(error.message);}

// Use the same editor actions for supported agent-enabled browsers.
if(document.modelContext?.registerTool){
 const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
 const tools=[{
  name:'read_liquid_editor',title:'读取液体编辑状态',description:'Read the current image dimensions, selected brush and color adjustments. Does not return image data.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},
  execute(){return {ready,dimensions:{width:imageWidth,height:imageHeight},tool,strokeCount,brushSize:Number($('brushSize').value),thickness:Number($('amount').value),undoAvailable:history.length>0,colors:Object.fromEntries(['brightness','contrast','hue','saturation','temperature'].map(id=>[id,Number($(id).value)])),strokeLayer:Object.fromEntries(['strokeIntensity','strokeThickness','strokeSoftness'].map(id=>[id,Number($(id).value)]))};}
 },{
  name:'configure_liquid_editor',title:'调整液体编辑参数',description:'Select the same brush or adjust the same color and current stroke-layer controls as the visible interface. Does not reset strokes or export an image.',inputSchema:{type:'object',properties:{tool:{type:'string',enum:['paint','push','erase']},brushSize:{type:'number',minimum:20,maximum:240},amount:{type:'number',minimum:5,maximum:100},softness:{type:'number',minimum:15,maximum:100},strokeIntensity:{type:'number',minimum:0,maximum:150},strokeThickness:{type:'number',minimum:20,maximum:180},strokeSoftness:{type:'number',minimum:0,maximum:100},brightness:{type:'number',minimum:-50,maximum:50},contrast:{type:'number',minimum:-50,maximum:50},hue:{type:'number',minimum:-180,maximum:180},saturation:{type:'number',minimum:-100,maximum:100},temperature:{type:'number',minimum:-50,maximum:50}},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},
  async execute(input){
   if(!ready)throw new Error('Upload an image or wait for the sample to load first.');
   if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Expected a settings object.');
   const bounds={brushSize:[20,240],amount:[5,100],softness:[15,100],strokeIntensity:[0,150],strokeThickness:[20,180],strokeSoftness:[0,100],brightness:[-50,50],contrast:[-50,50],hue:[-180,180],saturation:[-100,100],temperature:[-50,50]};
   for(const [key,value] of Object.entries(input)){if(key==='tool'){if(!['paint','push','erase'].includes(value))throw new Error('Unknown brush.');}else if(!bounds[key]||typeof value!=='number'||!Number.isFinite(value)||value<bounds[key][0]||value>bounds[key][1])throw new Error('Invalid setting: '+key);}
   for(const [key,value] of Object.entries(input)){if(key==='tool')setTool(value);else{$(key).value=value;updateRange($(key));}}
   requestRender();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return {updated:true};
  }
 }];
 for(const definition of tools){try{Promise.resolve(document.modelContext.registerTool(definition,{signal:lifecycle.signal})).catch(()=>{});}catch{}}
}
