import { expect, test } from '@playwright/test';

test('Chinese homepage renders news and projects', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/embuddies/);
  await expect(page.getByRole('heading', { name: '最新资讯' })).toBeVisible();
  await expect.poll(() => page.locator('#project-feature-grid .project-feature-card').count()).toBeGreaterThanOrEqual(8);
});

test('English homepage renders translated sections', async ({ page }) => {
  await page.goto('/en/');
  await expect(page.getByRole('heading', { name: 'Latest news' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Featured projects' })).toBeVisible();
});

test('project catalog can search the curated directory', async ({ page }) => {
  await page.goto('/projects/');
  const search = page.locator('#project-search');
  await search.fill('Microduck');
  await expect(page.locator('#project-grid .project-card')).toHaveCount(1);
  await expect(page.getByText('Microduck', { exact: true })).toBeVisible();
});

test('mobile pages do not overflow horizontally', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile'));
  for (const route of ['/', '/en/', '/updates/', '/projects/']) {
    await page.goto(route);
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }));
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);
  }
});
