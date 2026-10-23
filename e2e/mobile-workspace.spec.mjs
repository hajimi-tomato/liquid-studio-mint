import {test,expect} from '@playwright/test';
test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
async function ready(p){await p.goto('/');await expect(p.locator('#loading')).toBeHidden();await p.waitForFunction(()=>!!document.querySelector('#startRecording').onclick);}
const touch=(session,type,points)=>session.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([id,x,y])=>({id,x,y,radiusX:5,radiusY:5,force:1}))});

test('touch pinch leaves no stroke, painting and touch undo retain real edits',async({page:p})=>{
 await ready(p);const session=await p.context().newCDPSession(p),r=await p.locator('#editor').boundingBox(),x=r.x+r.width/2,y=r.y+r.height/2;
 const before=await p.locator('#preview').evaluate(c=>c.toDataURL());
 await touch(session,'touchStart',[[1,x-20,y],[2,x+20,y]]);
 await touch(session,'touchMove',[[1,x-35,y],[2,x+35,y]]);
 await touch(session,'touchEnd',[]);
 await expect(p.locator('#strokeCount')).toHaveText('0 笔');await expect(p.locator('#undo')).toBeDisabled();
 expect(await p.locator('#preview').evaluate(c=>c.toDataURL())).toBe(before);await expect(p.locator('#fit')).not.toHaveText('适应');await p.locator('#fit').tap();
 const box=await p.locator('#editor').boundingBox();
 await touch(session,'touchStart',[[1,box.x+box.width*.25,box.y+box.height*.5]]);
 for(let i=1;i<=15;i++)await touch(session,'touchMove',[[1,box.x+box.width*(.25+i/30),box.y+box.height*.5]]);
 await touch(session,'touchEnd',[]);await expect(p.locator('#strokeCount')).toHaveText('1 笔');
 await p.locator('#undo').tap();await expect(p.locator('#strokeCount')).toHaveText('0 笔');await p.locator('#redo').tap();await expect(p.locator('#strokeCount')).toHaveText('1 笔');
});

test('controls scroll independently, touch sliders and direct input work, PNG exports',async({page:p})=>{
 await ready(p);const errors=[];p.on('pageerror',e=>errors.push(e.message));const canvas=await p.locator('#editor').boundingBox();
 await p.locator('#brushSize').scrollIntoViewIfNeeded();expect((await p.locator('#editor').boundingBox()).y).toBe(canvas.y);
 await p.locator('#brushSize').tap({position:{x:150,y:20}});expect(Number(await p.locator('#brushSize').inputValue())).toBeGreaterThan(100);
 await p.locator('[data-panel-target=color]').tap();await p.locator('[data-for=brightness]').fill('12');await p.locator('[data-for=brightness]').press('Enter');await expect(p.locator('#brightness')).toHaveValue('12');
 const sample=await p.request.get('/assets/sample.png');await p.locator('#fileInput').setInputFiles({name:'mobile-import.png',mimeType:'image/png',buffer:await sample.body()});await expect(p.locator('.image-tile')).toHaveCount(2);
 await p.locator('[data-panel-target=export]').tap();const download=p.waitForEvent('download');await p.locator('#export').tap();expect((await download).suggestedFilename()).toMatch(/\.png$/);
 await p.locator('#savePreset').tap();await p.locator('#presetName').fill('移动端保存验证');await p.locator('#confirmSave').tap();await expect(p.locator('.saved-card')).toHaveCount(1);await p.locator('#closeLibrary').tap();
 await p.locator('#videoExportTab').tap();await p.selectOption('#motionFormat','gif');const gif=p.waitForEvent('download');await p.locator('#startRecording').tap();expect((await gif).suggestedFilename()).toMatch(/\.gif$/);
 expect(await p.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);expect(errors).toEqual([]);
});

test('short landscape keeps all tools and canvas usable',async({page:p})=>{
 await p.setViewportSize({width:844,height:390});await ready(p);for(const panel of ['paint','effect','glass','color','export']){await p.locator('[data-panel-target='+panel+']').tap();const box=await p.locator('#editor').boundingBox();expect(box.width).toBeGreaterThan(200);expect(box.y+box.height).toBeLessThan(390);}
 await expect(p.locator('#export')).toBeVisible();expect(await p.evaluate(()=>document.documentElement.scrollWidth)).toBe(844);
});
