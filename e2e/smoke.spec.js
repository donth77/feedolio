import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Records any Content Security Policy violation for the checks below.
  await page.addInitScript(() => {
    window.__violations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__violations.push(`${event.violatedDirective}: ${event.blockedURI}`);
    });
  });
});

test('loads the starter feeds and opens a story', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'All stories' })).toBeVisible();
  const headlines = page.locator('main a[data-story-link]');
  await expect(headlines.first()).toBeVisible();
  expect(await headlines.count()).toBeGreaterThan(20);

  const title = (await headlines.first().textContent())?.trim() ?? '';
  await headlines.first().click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Share this story' })).toBeVisible();
  expect(await page.evaluate(() => window.__violations)).toEqual([]);
});

test('is locked down: security headers, a strict CSP and Trusted Types', async ({ page }) => {
  const response = await page.goto('/');
  const headers = response?.headers() ?? {};
  expect(headers['content-security-policy']).toContain("require-trusted-types-for 'script'");
  expect(headers['content-security-policy']).toContain("object-src 'none'");
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');

  // Writing HTML as a string, outside DOMPurify's policy, is refused.
  const outcome = await page.evaluate(() => {
    try {
      document.createElement('div').innerHTML = '<b>raw</b>';
      return 'allowed';
    } catch (error) {
      return error instanceof TypeError ? 'blocked' : String(error);
    }
  });
  expect(outcome).toBe('blocked');
});

test('finds feeds on a website before adding one', async ({ page }, testInfo) => {
  await page.goto('/');
  const add =
    testInfo.project.name === 'phone'
      ? page.getByRole('banner').getByRole('button', { name: 'Add feed' })
      : page
          .getByRole('navigation', { name: 'Sections and feeds' })
          .getByRole('button', { name: 'Add feed' });
  await add.click();

  const dialog = page.getByRole('dialog', { name: 'Add a feed' });
  await dialog.getByRole('textbox', { name: 'Website or feed link' }).fill('github.blog');
  await dialog.getByRole('button', { name: 'Find feed' }).click();
  await expect(
    dialog.getByRole('group', { name: /^We found \d+ feeds on this page/ }),
  ).toBeVisible();
  await expect(dialog.getByRole('region', { name: /^Preview of / })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => window.__violations)).toEqual([]);
});
