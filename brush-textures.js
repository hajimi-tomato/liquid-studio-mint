// Shared material height profile for reference preview and subsequent brush deposits.
export function textureHeight(name,u,v){
 if(name==='thin')return .16+.06*Math.sin(u*11+v*4);
 if(name==='strokes'){const t=(v+u*.35)*4.5;return .06+.66*Math.max(0,Math.cos(t*Math.PI*2))**4;}
 if(name==='ripple'){const r=Math.hypot((u-.48)*1.2,v-.48);return .32*Math.exp(-r*.9)*(1+Math.sin(r*55))*.5;}
 if(name==='swirl'){const x=(u-.5)*1.2,y=v-.5,r=Math.hypot(x,y);return .58*Math.exp(-r*2)*Math.max(0,Math.cos(Math.atan2(y,x)*3-r*32))**4;}
 if(name==='beads'){let height=0;for(const [cx,cy,r] of [[.24,.25,.09],[.62,.19,.055],[.48,.51,.13],[.77,.68,.08],[.19,.79,.065]]){const d=Math.hypot((u-cx)*1.2,v-cy)/r;if(d<1)height=Math.max(height,.65*(1-d*d)**1.5);}return height;}
 if(name==='flow'){let height=0;for(const [cx,phase] of [[.22,0],[.5,1.4],[.78,3]]){const d=Math.abs(u-cx-.035*Math.sin(v*11+phase))/.037;if(d<1)height=Math.max(height,.65*(1-d*d)**2*(.3+.7*v));}return height;}
 return 0;
}
export function textureDeposit(name,u,v){return !name||name==='clear'?1:.04+textureHeight(name,u,v)*1.4;}
