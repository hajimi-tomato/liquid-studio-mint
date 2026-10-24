import {chromium} from '@playwright/test';
import {mkdir,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const assets=fileURLToPath(new URL('../docs/assets/',import.meta.url));
const themes={white:'白瓷 · 默认',green:'青苔',blue:'雾蓝',purple:'鸢尾',yellow:'麦穗',brown:'胡桃',orange:'杏橙',red:'朱砂'};
await mkdir(assets+'/skins',{recursive:true});
const b=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'});
try{
 const p=await b.newPage({viewport:{width:1600,height:1000}});
 await p.goto(process.env.STUDIO_URL||'http://127.0.0.1:8000/');await p.locator('#loading').waitFor({state:'hidden'});
 let cards='';
 for(const [skin,name] of Object.entries(themes)){
  await p.locator('#skinLaunch').click();await p.locator(`[data-skin-choice=${skin}]`).click();await p.keyboard.press('Escape');
  await p.screenshot({path:assets+`/skins/${skin}.jpg`,type:'jpeg',quality:85});
  cards+=`<article><img src="data:image/jpeg;base64,${(await readFile(assets+`/skins/${skin}.jpg`)).toString('base64')}"><p>${name}</p></article>`;
 }
 await p.setContent(`<html lang="zh-CN"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:32px;background:#f3f2ee;color:#353832;font:16px 'Segoe UI','Microsoft YaHei',sans-serif}h1{font-size:26px;font-weight:500;margin:0 0 24px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}article{padding:8px;background:white;border:1px solid #d5d5cf}img{width:100%;display:block}p{margin:12px 8px 7px}</style><h1>涂抹 · 八款像素皮肤</h1><div class="grid">${cards}</div></html>`);
 await p.screenshot({path:assets+'/skins.jpg',type:'jpeg',quality:86,fullPage:true});
}finally{await b.close()}
console.log('Saved eight real theme screenshots and the overview.');
