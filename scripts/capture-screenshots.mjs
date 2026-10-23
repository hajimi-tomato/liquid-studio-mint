import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const assets=fileURLToPath(new URL('../docs/assets/',import.meta.url));
await mkdir(assets,{recursive:true});
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1,acceptDownloads:true});
 await page.goto(process.env.STUDIO_URL||'http://127.0.0.1:8000/');
 await page.locator('#loading').waitFor({state:'hidden'});
 await page.waitForFunction(()=>!!document.querySelector('#startRecording').onclick);
 await page.screenshot({path:assets+'/desktop.jpg',type:'jpeg',quality:88});
 await page.locator('#openEffects').click();
 await page.locator('[data-look=reverie]').click();
 await page.evaluate(()=>{for(const[id,value]of Object.entries({refraction:27,gloss:34,diffusion:18,strokeIntensity:70,strokeThickness:55,lightSense:55})){const el=document.getElementById(id);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));}});
 await page.locator('[data-panel-target=paint]').click();
 const r=await page.locator('#editor').boundingBox();
 await page.mouse.move(r.x+r.width*.1,r.y+r.height*.74);await page.mouse.down();
 for(let i=1;i<=20;i++)await page.mouse.move(r.x+r.width*(.1+i*.018),r.y+r.height*(.74+Math.sin(i/20*Math.PI)*.08));
 await page.mouse.up();
 await page.waitForTimeout(200);
 await page.selectOption('#format','jpeg');
 const download=page.waitForEvent('download');await page.locator('#export').click();await(await download).saveAs(assets+'/effect-study.jpg');
 await page.close();
 const mobile=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 await mobile.goto(process.env.STUDIO_URL||'http://127.0.0.1:8000/');await mobile.locator('#loading').waitFor({state:'hidden'});await mobile.locator('[data-panel-target=color]').tap();
 await mobile.screenshot({path:assets+'/mobile.jpg',type:'jpeg',quality:88});
 await mobile.close();
}finally{await browser.close()}
console.log('Saved current desktop, mobile and real effect screenshots to docs/assets/.');
