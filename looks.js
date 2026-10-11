export const LOOKS=[
 {id:'lagoon',name:'翡翠浅湾',note:'柔缓水纹 / 透亮青绿',shape:'water',settings:{refraction:18,gloss:32,diffusion:8,lightSense:68,strokeThickness:48,saturation:12,temperature:-5},glass:'blue',tint:8,texture:'smooth'},
 {id:'sunroom',name:'午后温室',note:'斜向光痕 / 温暖胶片',shape:'ribbons',settings:{refraction:25,gloss:46,diffusion:16,lightSense:72,strokeThickness:55,saturation:7,temperature:12},glass:'yellow',tint:8,texture:'smooth'},
 {id:'rain',name:'雨后长窗',note:'纵向流纹 / 清冷折射',shape:'rain',settings:{refraction:22,gloss:40,diffusion:4,lightSense:52,strokeThickness:40,saturation:5,temperature:-8,glassWarp:18},glass:'clear',tint:0,texture:'reeded'},
 {id:'reverie',name:'绿野梦游',note:'环形柔光 / 保留中心主体',shape:'halo',settings:{refraction:30,gloss:24,diffusion:25,lightSense:58,strokeThickness:58,saturation:10,temperature:4},glass:'clear',tint:0,texture:'smooth'}
];
export function lookField(shape,w,h){const data=new Uint8Array(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const u=x/w,v=y/h,i=(y*w+x)*4;let z,dx,dy;
 if(shape==='water'){z=.18+.08*Math.sin(v*22+Math.sin(u*10)*1.8)+.035*Math.cos(u*28+v*12);dx=.55;dy=.2*Math.sin(u*8);}
 else if(shape==='ribbons'){const p=v+u*.36;z=.30*Math.exp(-Math.pow((p-.30)/.075,2))+.25*Math.exp(-Math.pow((p-.92)/.09,2));dx=.8;dy=-.25;}
 else if(shape==='rain'){z=.10+.10*Math.pow(.5+.5*Math.sin(u*65+Math.sin(v*9)),3);dx=.05;dy=.75;}
 else{const r=Math.hypot((u-.5)*1.2,v-.5);z=.24*Math.exp(-Math.pow((r-.43)/.12,2));dx=-(v-.5);dy=u-.5;}
 data[i]=Math.max(0,Math.min(255,Math.round(z*255)));data[i+1]=Math.round((dx*.5+.5)*255);data[i+2]=Math.round((dy*.5+.5)*255);data[i+3]=255;}return data;}
