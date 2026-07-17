import { test, expect } from '@playwright/test';
import { waitForApp, SIGNS } from './support';

const encoded = encodeURIComponent(SIGNS.M);

test.describe('Canvas zoom', () => {
  test('Cmd+= / Cmd+- / Cmd+0 scale the symbol layer, slider tracks it', async ({ page }) => {
    await page.goto(`/index.html#?fsw=${encoded}`);
    await waitForApp(page);
    const layer = page.locator('.signbox-zoom');
    const btn = page.locator('#tool-zoomReset');

    await expect(btn).toHaveText('100%');
    await page.keyboard.press('Meta+=');
    await expect(btn).toHaveText('125%');
    await expect(layer).toHaveCSS('transform', /matrix\(1\.25/);

    await page.keyboard.press('Meta+-');
    await expect(btn).toHaveText('100%');

    await btn.hover(); // the slider only slides out on hover/focus
    await page.locator('.zoom-slider').fill('200');
    await expect(btn).toHaveText('200%');
    await expect(layer).toHaveCSS('transform', /matrix\(2,/);

    // Shortcuts are (correctly) inert while the slider input holds focus — click back on the canvas.
    await page.locator('#signbox').click({ position: { x: 30, y: 300 } });
    await page.keyboard.press('Meta+0');
    await expect(btn).toHaveText('100%');
  });
});
