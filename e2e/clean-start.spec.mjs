import {test,expect} from '@playwright/test';
test('initial example and restored example start without strokes',async({page})=>{
 await page.goto('/');await expect(page.locator('#loading')).toBeHidden();await expect(page.locator('#strokeCount')).toHaveText('0 笔');await expect(page.locator('#undo')).toBeDisabled();
 const pixels=()=>page.locator('#editor').evaluate(c=>c.toDataURL());await page.waitForTimeout(100);const clean=await pixels();await page.locator('#compare').focus();await page.keyboard.down('Space');await page.waitForTimeout(100);expect(await pixels()===clean).toBe(true);await page.keyboard.up('Space');
 const box=await page.locator('#editor').boundingBox();await page.mouse.move(box.x+box.width*.3,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.7,box.y+box.height*.5,{steps:20});await page.mouse.up();await expect(page.locator('#strokeCount')).toHaveText('1 笔');
 await page.locator('.more-actions summary').click();await page.click('#loadSample');await expect(page.locator('#strokeCount')).toHaveText('0 笔');await page.waitForTimeout(100);expect(await pixels()===clean).toBe(true);
});
