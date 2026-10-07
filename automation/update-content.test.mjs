import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  inspectRepositoryTree,
  mergeNews,
  normalizeUrl,
  parseFeed,
  releaseNews,
  runContentUpdate
} from './update-content.mjs';

const now = new Date('2026-10-07T00:00:00Z');
const fixture = name => readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('normalizes HTTPS URLs and removes tracking parameters', () => {
  assert.equal(normalizeUrl('https://example.com/project/?utm_source=test&b=2&a=1#readme'), 'https://example.com/project?a=1&b=2');
  assert.throws(() => normalizeUrl('http://example.com/project'), /HTTPS/);
});

test('parses RSS as plain text and rejects future entries', async () => {
  const items = parseFeed(await fixture('feed.xml'), { name: 'Example', image: '/image.svg' }, now);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Example 发布新动态：New controller board');
  assert.equal(items[0].url, 'https://example.com/releases/controller');
});

test('creates bilingual release news and rejects future releases', async () => {
  const releases = JSON.parse(await fixture('github-releases.json'));
  const items = releaseNews(releases, { name: 'Example Hardware', image: '' }, now);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Example Hardware 发布 v2.0.0 版本');
  assert.equal(items[0].title_en, 'Example Hardware released v2.0.0');
});

test('deduplicates news and separates overflow for archival', () => {
  const entries = Array.from({ length: 102 }, (_, index) => ({
    date: `2026-${String(10 - Math.floor(index / 28)).padStart(2, '0')}-${String((index % 28) + 1).padStart(2, '0')}`,
    title: `资讯 ${index}`,
    title_en: `News ${index}`,
    source: 'Fixture',
    image: 'https://example.com/images/project.jpg',
    imageSource: 'https://example.com/project',
    url: `https://example.com/news/${index}`
  }));
  entries.push({ ...entries[0] });
  const merged = mergeNews([], entries, new Date('2026-12-31T00:00:00Z'), 100);
  assert.equal(merged.active.length, 100);
  assert.equal(merged.overflow.length, 2);
  assert.equal(new Set([...merged.active, ...merged.overflow].map(item => item.url)).size, 102);
});

test('detects hardware, BOM and guide files in repository trees', () => {
  const inspection = inspectRepositoryTree([
    'hardware/controller.kicad_pcb',
    'docs/BOM.csv',
    'docs/build-guide.md',
    'assets/images/hardware-photo.jpg'
  ]);
  assert.deepEqual(
    { hardwareDocs: inspection.hardwareDocs, bom: inspection.bom, buildGuide: inspection.buildGuide },
    { hardwareDocs: true, bom: true, buildGuide: true }
  );
  assert.equal(inspection.imagePath, 'assets/images/hardware-photo.jpg');
});

test('published catalog and news never use embuddies placeholder artwork', async () => {
  const catalog = JSON.parse(await readFile(new URL('../projects/catalog.json', import.meta.url), 'utf8'));
  const news = JSON.parse(await readFile(new URL('../updates/news.json', import.meta.url), 'utf8'));
  for (const item of [...catalog, ...news]) {
    assert.ok(item.image, `${item.title || item.id} is missing an image`);
    assert.ok(item.imageSource, `${item.title || item.id} is missing an image source`);
    assert.doesNotMatch(item.image, /^\/assets\/(project-|kit-parts)/);
  }
});

test('full update is idempotent and isolates failed sources', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'embuddies-content-'));
  await Promise.all([
    mkdir(path.join(root, 'automation', 'candidates'), { recursive: true }),
    mkdir(path.join(root, 'updates'), { recursive: true }),
    mkdir(path.join(root, 'projects'), { recursive: true })
  ]);
  await writeFile(path.join(root, 'automation', 'sources.json'), JSON.stringify({
    sources: [
      { id: 'feed', name: 'Example', kind: 'rss', url: 'https://example.com/feed.xml', projectId: 'example', trustLevel: 'official', enabled: true, image: 'https://example.com/images/project.jpg', imageSource: 'https://example.com/project' },
      { id: 'broken', name: 'Broken', kind: 'official-page', url: 'https://example.com/broken', projectId: 'broken', trustLevel: 'official', enabled: true }
    ],
    discovery: { enabled: false }
  }));
  await writeFile(path.join(root, 'automation', 'candidates', 'projects.json'), '[]\n');
  await writeFile(path.join(root, 'projects', 'catalog.json'), '[]\n');
  await writeFile(path.join(root, 'updates', 'news.json'), '[]\n');
  const feed = await fixture('feed.xml');
  const fetchImpl = async url => {
    if (String(url).endsWith('/feed.xml')) return new Response(feed, { status: 200 });
    return new Response('unavailable', { status: 503, statusText: 'Unavailable' });
  };

  const first = await runContentUpdate({ root, now, fetchImpl });
  assert.equal(first.newsAdded, 1);
  assert.deepEqual(first.changedFiles, ['updates/news.json']);
  assert.equal(first.sources.filter(source => source.status === 'warning').length, 1);

  const second = await runContentUpdate({ root, now, fetchImpl });
  assert.equal(second.newsAdded, 0);
  assert.deepEqual(second.changedFiles, []);
});

test('does not restore an archived URL to the active news feed', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'embuddies-archive-'));
  await Promise.all([
    mkdir(path.join(root, 'automation', 'candidates'), { recursive: true }),
    mkdir(path.join(root, 'updates', 'archive'), { recursive: true }),
    mkdir(path.join(root, 'projects'), { recursive: true })
  ]);
  await writeFile(path.join(root, 'automation', 'sources.json'), JSON.stringify({
    sources: [{ id: 'feed', name: 'Example', kind: 'rss', url: 'https://example.com/feed.xml', projectId: 'example', trustLevel: 'official', enabled: true, image: 'https://example.com/images/project.jpg', imageSource: 'https://example.com/project' }],
    discovery: { enabled: false }
  }));
  await writeFile(path.join(root, 'automation', 'candidates', 'projects.json'), '[]\n');
  await writeFile(path.join(root, 'projects', 'catalog.json'), '[]\n');
  await writeFile(path.join(root, 'updates', 'news.json'), '[]\n');
  await writeFile(path.join(root, 'updates', 'archive', '2026.json'), JSON.stringify([{
    date: '2026-10-06',
    title: 'Archived',
    title_en: 'Archived',
    source: 'Example',
    image: '',
    url: 'https://example.com/releases/controller'
  }]));
  const feed = await fixture('feed.xml');
  const report = await runContentUpdate({
    root,
    now,
    fetchImpl: async () => new Response(feed, { status: 200 })
  });
  assert.equal(report.newsAdded, 0);
  assert.deepEqual(report.changedFiles, []);
});
