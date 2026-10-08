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

test('public pages share the same sticky navigation', async ({ page }) => {
  const routes = ['/', '/projects/', '/updates/', '/kits/', '/hackathon/', '/community/', '/about/', '/en/', '/en/about/'];
  const expectedChinese = ['首页', '硬件项目', '最新资讯', '套件', '黑客松', '社区', '发布项目', '关于我们'];
  const expectedEnglish = ['Home', 'Projects', 'News', 'Kits', 'Hackathon', 'Community', 'Submit', 'About'];
  for (const route of routes) {
    await page.goto(route);
    const navigation = page.locator('header nav a');
    await expect(navigation).toHaveCount(8);
    await expect(navigation).toHaveText(route.startsWith('/en/') ? expectedEnglish : expectedChinese);
    await expect(page.locator('header')).toHaveCSS('position', 'sticky');
  }
});

test('mobile pages do not overflow horizontally', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile'));
  for (const route of ['/', '/en/', '/updates/', '/projects/']) {
    await page.goto(route);
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }));
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);
  }
});
