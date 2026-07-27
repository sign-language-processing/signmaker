import { test, expect } from '@playwright/test';
import { waitForApp, fswlive, symbolCount, vm } from './support';

const SWU = /[\u{1D800}-\u{1DAAF}]/u;

test.describe('shortcut sheet', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await waitForApp(page);
  });

  test('holding Cmd reveals the shortcut list, released on key up', async ({ page }) => {
    await expect(page.locator('.shortcut-sheet')).toHaveCount(0);
    await page.keyboard.down('Meta');
    // Appears only after the ~1s hold.
    await expect(page.locator('.shortcut-sheet')).toBeVisible({ timeout: 3000 });
    // Lists many shortcuts, each with a label and its key(s). Undo's modifier glyph is platform-
    // dependent (⌘ on macOS, Ctrl+ elsewhere — CI runs on Linux), so match either.
    expect(await page.locator('.shortcut-row').count()).toBeGreaterThan(10);
    await expect(page.locator('.shortcut-row', { hasText: 'Undo' }).locator('kbd')).toHaveText(/^(⌘|Ctrl\+)Z$/);
    await expect(page.locator('.shortcut-row', { hasText: 'Rotate +' }).locator('kbd')).toHaveText('/');

    await page.keyboard.up('Meta');
    await expect(page.locator('.shortcut-sheet')).toHaveCount(0);
  });

  test('pressing another key cancels the reveal before it shows', async ({ page }) => {
    await page.keyboard.down('Meta');
    await page.keyboard.press('z'); // Cmd+Z — uses a shortcut instead of revealing them
    await page.keyboard.up('Meta');
    await page.waitForTimeout(2200);
    await expect(page.locator('.shortcut-sheet')).toHaveCount(0);
  });
});

test.describe('clipboard', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/index.html');
    await waitForApp(page);
  });

  test('copies the sign as SWU and pastes it back, selecting what was pasted', async ({ page }) => {
    await vm(page, 'add', { key: 'S10000', x: 500, y: 500 });

    await page.keyboard.press('ControlOrMeta+c');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(SWU);
    await expect(page.locator('.canvas-toast')).toHaveText('Sign copied');
    await expect(page.locator('.canvas-toast')).toHaveCount(0, { timeout: 3000 });

    await page.keyboard.press('ControlOrMeta+v');
    expect(symbolCount(await fswlive(page))).toBe(2);
    await expect(page.locator('#signbox .signbox-symbol.selected')).toHaveCount(1);
  });

  test('copies only the selected symbols when a subset is selected', async ({ page }) => {
    await vm(page, 'add', { key: 'S10000', x: 480, y: 480 });
    await vm(page, 'add', { key: 'S10011', x: 520, y: 520 });
    await vm(page, 'select', -1); // the second add left symbol 1 selected; step back to symbol 0

    await page.keyboard.press('ControlOrMeta+c');
    await page.keyboard.press('ControlOrMeta+v');
    expect(symbolCount(await fswlive(page))).toBe(3); // the two originals + one pasted, not four
    await expect(page.locator('#signbox .signbox-symbol.selected')).toHaveCount(1);
  });

  test('ignores a paste that is not SignWriting', async ({ page }) => {
    await page.evaluate(() => navigator.clipboard.writeText('just some text'));
    await page.keyboard.press('ControlOrMeta+v');
    expect(await fswlive(page)).toBe('');
  });
});
