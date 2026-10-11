import { expect, test } from '@playwright/test';

test('Chinese Explore renders news and projects', async ({ page }) => {
  await page.goto('/explore/');
  await expect(page).toHaveTitle(/embuddies/);
  await expect(page.getByRole('heading', { name: '最新资讯' })).toBeVisible();
  await expect.poll(() => page.locator('#project-feature-grid .project-feature-card').count()).toBeGreaterThanOrEqual(8);
});

test('English Explore renders translated sections', async ({ page }) => {
  await page.goto('/en/explore/');
  await expect(page.getByRole('heading', { name: 'Latest news' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Featured projects' })).toBeVisible();
});

test('English locale routes render without query-string language switches', async ({ page }) => {
  await page.goto('/en/projects/');
  await expect(page.getByRole('heading', { name: 'All projects' })).toBeVisible();
  await expect(page.locator('header nav a[href="/en/projects/"]')).toHaveAttribute('href', '/en/projects/');
  await page.goto('/en/projects/detail/?id=microduck');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('English browser locale redirects unprefixed public routes', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ locale: 'en-US' });
  const page = await context.newPage();
  await page.goto(`${baseURL}/projects/`);
  await expect(page).toHaveURL(/\/en\/projects\/$/);
  await expect(page.getByRole('heading', { name: 'All projects' })).toBeVisible();
  await context.close();
});

test('project catalog can search the curated directory', async ({ page }) => {
  await page.goto('/projects/');
  const search = page.locator('#project-search');
  await search.fill('Microduck');
  await expect(page.locator('#project-grid .project-card')).toHaveCount(1);
  await expect(page.getByText('Microduck', { exact: true })).toBeVisible();
});

test('public pages share the same sticky navigation', async ({ page }) => {
  const routes = [ '/projects/', '/updates/', '/kits/', '/community/', '/about/', '/en/about/'];
  const expectedChinese = ['首页', '硬件项目', '最新资讯', '套件', '社区', '发布项目', '关于我们'];
  const expectedEnglish = ['Home', 'Projects', 'News', 'Kits', 'Community', 'Submit', 'About'];
  for (const route of routes) {
    await page.goto(route);
    const navigation = page.locator('header nav a:visible');
    await expect(navigation).toHaveCount(7);
    expect((await navigation.allTextContents()).sort()).toEqual((route.startsWith('/en/') ? expectedEnglish : expectedChinese).slice().sort());
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

 test('brand homepage connects to existing discovery content', async ({ page }) => {
  await page.goto('/?lang=zh');
  await expect(page.locator('h1')).toContainText('下一颗明星');
  if (await page.locator('.menu-button').isVisible()) await page.locator('.menu-button').click();
  await page.locator('header a[href="/explore/?lang=zh"]').click();
  await expect(page.getByRole('heading', {name:'精选项目'})).toBeVisible();
  await page.goto('/en/');
  await expect(page.locator('h1')).toContainText('Discover the next star');
  if (await page.locator('.menu-button').isVisible()) await page.locator('.menu-button').click();
  await page.locator('header a[href="/en/explore/"]').click();
  await expect(page.getByRole('heading', {name:'Featured projects'})).toBeVisible();
});
