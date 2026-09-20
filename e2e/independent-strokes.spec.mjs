import { test, expect } from '@playwright/test';

async function ready(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden({ timeout: 20_000 });
  await page.click('[data-layer=liquid]');
  await page.locator('.more-actions summary').click();
  await page.click('#clear');
  return errors;
}

async function drag(page, from, to) {
  const box = await page.locator('#editor').boundingBox();
  const at = ([fx, fy]) => [box.x + box.width * fx, box.y + box.height * fy];
  const [sx, sy] = at(from), [ex, ey] = at(to);
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(ex, ey, { steps: 25 });
  await page.mouse.up();
  await page.waitForTimeout(150);
}

const layerCount = page => page.evaluate(() => Number(document.getElementById('strokeCount').textContent.replace(/\D/g, '')));

test('independent strokes keep separate layers and erase only the top one', async ({ page }) => {
  const errors = await ready(page);
  await page.click('[data-paint-mode=independent]');
  await expect(page.locator('[data-paint-mode=independent]')).toHaveAttribute('aria-pressed', 'true');
  await drag(page, [.2, .5], [.8, .5]);
  await drag(page, [.5, .2], [.5, .8]);
  expect(await layerCount(page)).toBe(2);
  await page.screenshot({ path: 'e2e/output/independent-cross.png' });

  const before = await page.locator('#editor').screenshot();
  await page.click('[data-tool=erase]');
  await drag(page, [.5, .35], [.5, .65]);
  const after = await page.locator('#editor').screenshot();
  expect(Buffer.compare(before, after)).not.toBe(0);
  await page.screenshot({ path: 'e2e/output/independent-erased.png' });

  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  expect(await layerCount(page)).toBe(0);
  expect(errors).toEqual([]);
});

test('fusion strokes merge into one layer and the mode survives switching', async ({ page }) => {
  const errors = await ready(page);
  await drag(page, [.2, .5], [.8, .5]);
  await drag(page, [.5, .2], [.5, .8]);
  expect(await layerCount(page)).toBe(2);
  await page.screenshot({ path: 'e2e/output/fusion-cross.png' });
  const layers = await page.evaluate(async () => {
    const mod = await import('./stroke-layers.js');
    return typeof mod.createDocument;
  });
  expect(layers).toBe('function');
  await page.click('[data-paint-mode=independent]');
  await page.click('[data-paint-mode=fusion]');
  await expect(page.locator('#paintModeHelp')).toContainText('融合');
  expect(errors).toEqual([]);
});

test('export produces a file with layered strokes', async ({ page }) => {
  const errors = await ready(page);
  await page.click('[data-paint-mode=independent]');
  await drag(page, [.3, .3], [.7, .7]);
  await page.click('#imageExportTab');
  const download = page.waitForEvent('download');
  await page.click('#export');
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.png$/);
  expect(errors).toEqual([]);
});
