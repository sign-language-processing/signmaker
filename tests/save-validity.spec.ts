import { test, expect } from '@playwright/test';
import { waitForApp, fswlive, fswnorm, vm, SIGNS } from './support';

/**
 * Every coordinate here is inside the 250–749 lane, so the sign is legal as drawn. But
 * normalization centers on the head symbol (S2ff00) alone, which drops the hand below y=749 —
 * saving would hand out SWU whose coordinates encode as *number* characters instead.
 */
const OVERFLOWS_WHEN_CENTERED = 'M518x735S2ff00482x255S10000485x705';

const COORD = /[0-9]{3}x[0-9]{3}/g;
const inLane = (fsw: string): boolean =>
  (fsw.match(COORD) ?? []).every((c) => {
    const [x, y] = [c.slice(0, 3), c.slice(4)].map(Number);
    return x >= 250 && x <= 749 && y >= 250 && y <= 749;
  });

/** Only SWU markers/coordinates (U+1D800–U+1D9FF) and symbols (U+40001–U+4F480) are legal. */
const isSwu = (s: string): boolean => !!s && [...s].every((c) => {
  const cp = c.codePointAt(0) as number;
  return (cp >= 0x1d800 && cp <= 0x1d9ff) || (cp >= 0x40001 && cp <= 0x4f480);
});

const swunorm = (page: import('@playwright/test').Page) => vm(page, 'swunorm') as Promise<string>;
const saveButton = (page: import('@playwright/test').Page) => page.locator('.palette-save');

test.describe('save validity', () => {
  test('a normal sign saves and yields only SignWriting characters', async ({ page }) => {
    await page.goto(`/index.html#?fsw=${encodeURIComponent(SIGNS.M)}`);
    await waitForApp(page);

    expect(isSwu(await swunorm(page))).toBe(true);
    await expect(saveButton(page)).toHaveAttribute('aria-disabled', 'false');

    await saveButton(page).click();
    expect(page.url()).toContain('fsw=');
  });

  test('a sign that fits but overflows once centered cannot be saved', async ({ page }) => {
    await page.goto(`/index.html#?fsw=${encodeURIComponent(OVERFLOWS_WHEN_CENTERED)}`);
    await waitForApp(page);

    // As drawn it is a legal sign; it is normalization that pushes it out of the lane.
    expect(inLane(await fswlive(page))).toBe(true);
    expect(inLane(await fswnorm(page))).toBe(false);
    expect(isSwu(await swunorm(page))).toBe(false);

    await expect(saveButton(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(saveButton(page)).toHaveAttribute('data-tip', 'Sign is too large after being centered');

    const before = page.url();
    // force: aria-disabled already fails Playwright's actionability check — this asserts that a
    // real click (which browsers do still dispatch) explains itself instead of saving.
    await saveButton(page).click({ force: true });
    await expect(page.locator('.canvas-toast')).toHaveText('Sign is too large after being centered');
    expect(page.url()).toBe(before);
  });

  test('Cmd+S is blocked for a sign that overflows once centered', async ({ page }) => {
    await page.goto(`/index.html#?fsw=${encodeURIComponent(OVERFLOWS_WHEN_CENTERED)}`);
    await waitForApp(page);

    const before = page.url();
    await page.keyboard.press('ControlOrMeta+s');
    await expect(page.locator('.canvas-toast')).toHaveText('Sign is too large after being centered');
    expect(page.url()).toBe(before);
  });

  test('shrinking the sign re-enables save', async ({ page }) => {
    await page.goto(`/index.html#?fsw=${encodeURIComponent(OVERFLOWS_WHEN_CENTERED)}`);
    await waitForApp(page);
    await expect(saveButton(page)).toHaveAttribute('aria-disabled', 'true');

    await vm(page, 'select', 1); // the head symbol — removing it leaves a sign that centers fine
    await vm(page, 'delete');

    await expect(saveButton(page)).toHaveAttribute('aria-disabled', 'false');
    expect(isSwu(await swunorm(page))).toBe(true);
  });
});
