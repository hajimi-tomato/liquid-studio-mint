import {test,expect} from '@playwright/test';

test('eight skins include the brush illustration and preserve the edited artwork',async({page:p})=>{
 await p.goto('/');await p.locator('#loading').waitFor({state:'hidden'});
 await expect(p.locator('html')).toHaveAttribute('data-skin','white');
 const canvas=p.locator('#editor'),box=await canvas.boundingBox();
 await p.mouse.move(box.x+box.width*.35,box.y+box.height*.4);await p.mouse.down();
 await p.mouse.move(box.x+box.width*.6,box.y+box.height*.6,{steps:12});await p.mouse.up();
 await expect(p.locator('#undo')).toBeEnabled();
 const image=await p.locator('#preview').evaluate(c=>c.toDataURL());
 const brushColors=new Set();
 for(const skin of ['white','green','blue','purple','yellow','brown','orange','red']){
  await p.locator('#skinLaunch').click();await p.locator(`[data-skin-choice=${skin}]`).click();
  await expect(p.locator('html')).toHaveAttribute('data-skin',skin);
  brushColors.add(await p.locator('#brushInk stop').last().evaluate(e=>getComputedStyle(e).stopColor));
  expect(await p.locator('#preview').evaluate(c=>c.toDataURL())).toBe(image);
  await expect(p.locator('#undo')).toBeEnabled();await p.keyboard.press('Escape');
 }
 expect(brushColors.size).toBe(8);
 await p.reload();await expect(p.locator('html')).toHaveAttribute('data-skin','red');
 await p.setViewportSize({width:390,height:844});await p.locator('#skinLaunch').click();
 const pop=await p.locator('#skinPopover').boundingBox();expect(pop.x+pop.width).toBeLessThanOrEqual(390);
 expect(await p.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 await p.keyboard.press('Escape');await expect(p.locator('#skinPopover')).toBeHidden();
});
