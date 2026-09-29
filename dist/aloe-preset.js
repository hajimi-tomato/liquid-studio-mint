import {createDocument,beginStroke,paintStroke,finishStroke,expandLayer} from './stroke-layers.js?v=20260928';
// Replay overlapping, open finger circles through the same brush engine as manual painting.
export const ALOE_SETTINGS={refraction:20,gloss:20,diffusion:3,lightSense:62,strokeIntensity:100,strokeThickness:70,strokeSoftness:0,glassTint:0,glassClarity:100,glassReflection:0,glassWarp:0,brightness:0,contrast:0,saturation:0,temperature:0,hue:0};
export function aloeField(w,h){
 const short=Math.min(w,h),hash=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
 const tx=beginStroke(createDocument(w,h),{tool:'paint',mode:'fusion'});
 const step=short*.105;let index=0;
 for(let y=short*.025;y<h+short*.035;y+=step)for(let x=short*.025;x<w+short*.035;x+=step){
  const k=index++*11+7,cx=x+(hash(k)-.5)*step*.7,cy=y+(hash(k+1)-.5)*step*.7;
  const radius=short*(.052+hash(k+2)*.025),start=hash(k+3)*Math.PI*2,turn=Math.PI*(2.2+hash(k+4)*1.1),count=Math.ceil(radius*turn/(short*.008));let previous;
  for(let i=0;i<=count;i++){
   const t=i/count,a=start+t*turn,rr=radius*(1-.22*t+.10*Math.sin(a*3+k)),px=(cx+Math.cos(a)*rr)/w,py=(cy+Math.sin(a)*rr*(.8+hash(k+5)*.35))/h;
   if(previous)paintStroke(tx,{x:px,y:py,dx:px-previous.x,dy:py-previous.y,r:short*(.028+.012*hash(k+6)),amount:.12*(.35+.65*Math.sin(Math.PI*t)**.5),softness:.82,texture:'aloe'});
   previous={x:px,y:py};
  }
 }
 const doc=finishStroke(tx);return doc.layers.length?expandLayer(doc.layers[0],w,h):new Uint8Array(w*h*4);
}
