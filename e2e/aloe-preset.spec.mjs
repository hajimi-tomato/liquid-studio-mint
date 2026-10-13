import {test,expect} from '@playwright/test';
test('aloe preset applies on demand, adjusts, undoes and exports',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await expect(page.locator('#loading')).toBeHidden();await expect(page.locator('#strokeCount')).toHaveText('0 笔');await page.waitForTimeout(100);const pixels=()=>page.locator('#editor').evaluate(c=>c.toDataURL());const before=await pixels();await page.click('#openEffects');await page.click('#applyAloe');await page.waitForTimeout(150);await expect(page.locator('#saturation')).toHaveValue('0');await expect(page.locator('#contrast')).toHaveValue('0');const applied=await pixels();expect(applied===before).toBe(false);await expect(page.locator('#strokeCount')).toHaveText('1 笔');await page.screenshot({path:'e2e/output/aloe-applied.png'});await page.click('#undo');await page.waitForTimeout(100);expect(await pixels()===before).toBe(true);await page.click('#redo');await page.waitForTimeout(100);expect(await pixels()===applied).toBe(true);await page.click('[data-panel-target=effect]');await page.locator('#strokeThickness').fill('140');await page.waitForTimeout(100);expect(await pixels()===applied).toBe(false);await page.click('#imageExportTab');const download=page.waitForEvent('download');await page.click('#export');expect((await download).suggestedFilename()).toMatch(/png$/);expect(errors).toEqual([]);
});

test('aloe manual mode leaves a clean photo until the user paints',async({page})=>{await page.goto('/');await expect(page.locator('#loading')).toBeHidden();await page.waitForTimeout(100);const pixel=()=>page.locator('#editor').evaluate(c=>c.toDataURL());const clean=await pixel();await page.click('#openEffects');await page.click('#paintAloe');await page.waitForTimeout(100);expect(await pixel()===clean).toBe(true);await expect(page.locator('[data-preset=aloe]')).toHaveAttribute('aria-pressed','true');const b=await page.locator('#editor').boundingBox();await page.mouse.move(b.x+b.width*.5,b.y+b.height*.5);await page.mouse.down();for(let i=0;i<=36;i++)await page.mouse.move(b.x+b.width*(.5+.1*Math.cos(i/36*Math.PI*2)),b.y+b.height*(.5+.12*Math.sin(i/36*Math.PI*2)));await page.mouse.up();await page.waitForTimeout(100);expect(await pixel()===clean).toBe(false);await expect(page.locator('#strokeCount')).toHaveText('1 笔');});

test('light sense makes the applied gel more colorful in lit areas and leaves original comparison intact',async({page})=>{
 await page.goto('/');await expect(page.locator('#loading')).toBeHidden();
 await page.click('#openEffects');await page.click('#applyAloe');
 await page.click('[data-panel-target=effect]');
 await page.locator('.liquid-section summary').click();
 await expect(page.locator('#lightSense')).toHaveValue('62');
 const sample=()=>page.locator('#editor').evaluate(c=>{const copy=document.createElement('canvas');copy.width=c.width;copy.height=c.height;const ctx=copy.getContext('2d');ctx.drawImage(c,0,0);const data=ctx.getImageData(0,0,c.width,c.height).data;let sum=0,count=0;for(let i=0;i<data.length;i+=32){const r=data[i]/255,g=data[i+1]/255,b=data[i+2]/255;const lum=.2126*r+.7152*g+.0722*b;if(lum>.36&&lum<.84){sum+=Math.max(r,g,b)-Math.min(r,g,b);count++;}}return {chroma:sum/count,pixels:c.toDataURL()};});
 await page.locator('#lightSense').fill('0');await page.waitForTimeout(120);const low=await sample();
 await page.locator('#lightSense').fill('100');await page.waitForTimeout(120);const high=await sample();
 expect(high.pixels).not.toBe(low.pixels);
 expect(high.chroma).toBeGreaterThan(low.chroma);
 await page.locator('#compare').focus();await page.keyboard.down('Space');await page.waitForTimeout(100);
 const original=await sample();expect(original.pixels).not.toBe(high.pixels);
 await page.keyboard.up('Space');
});
