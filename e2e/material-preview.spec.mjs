import {test,expect} from '@playwright/test';
const pixels=page=>page.locator('#editor').evaluate(c=>c.toDataURL());
test('texture previews never change artwork or undo history',async({page})=>{
 await page.goto('/');await expect(page.locator('#loading')).toBeHidden();
 await page.locator('.material-section summary').click();
 const before=await pixels(page);
 await page.locator('[data-preset=thin]').hover();await expect(page.locator('#materialPreview')).toBeVisible();
 await page.locator('[data-preset=thin]').click();await page.waitForTimeout(120);
 expect(await pixels(page)===before).toBe(true);await expect(page.locator('#undo')).toBeDisabled();
 const options=page.locator('[data-preset]');expect(await options.count()).toBeGreaterThanOrEqual(7);
 const previews=new Set();
 for(const option of await options.all()){
  await option.hover();await expect(page.locator('#materialPreview')).toBeVisible();
  previews.add(await page.locator('#materialPreviewCanvas').evaluate(c=>c.toDataURL()));
  await option.click();await page.waitForTimeout(50);expect(await pixels(page)===before).toBe(true);
 }
 expect(previews.size).toBe(await options.count());
 await page.keyboard.press('Escape');await expect(page.locator('#materialPreview')).toBeHidden();
 await page.locator('[data-preset=thin]').focus();await page.keyboard.press('Enter');expect(await pixels(page)===before).toBe(true);
});
test('visible reset is undoable and previous comparison is a hold action',async({page})=>{
 await page.goto('/');await expect(page.locator('#loading')).toBeHidden();
 await page.click('[data-panel-target=glass]');await page.click('[data-glass=blue]');await page.waitForTimeout(120);
 const edited=await pixels(page);
 await page.locator('.canvas-bar #restoreAll').click();await expect(page.locator('#strokeCount')).toHaveText('0 笔');await expect(page.locator('#glassTint')).toHaveValue('0');
 await page.click('#undo');await page.waitForTimeout(120);expect(await pixels(page)===edited).toBe(true);
 const control=page.getByRole('button',{name:'按住对比上一步',exact:true});await control.focus();await page.keyboard.down('Space');await expect(page.locator('#originalBadge')).toBeVisible();await page.keyboard.up('Space');await expect(page.locator('#originalBadge')).toBeHidden();
 await page.setViewportSize({width:390,height:844});await expect(control).toBeInViewport();await expect(page.locator('#restoreAll')).toBeInViewport();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
});
