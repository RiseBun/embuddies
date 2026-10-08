import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { extractPageEvidence, runResearch } from './research-agent.mjs';

test('extracts canonical metadata, image and hardware evidence from HTML', () => {
  const evidence = extractPageEvidence(`<!doctype html><html><head><title>Open robot</title><link rel="canonical" href="https://example.com/project/?utm_source=test"><meta name="author" content="Maker"><meta property="og:image" content="https://example.com/images/robot.jpg"><meta property="article:published_time" content="2026-10-06"></head><body><h1>Open robot</h1><p>Hardware BOM and build guide. MIT license.</p></body></html>`, 'https://example.com/project', new Date('2026-10-08T00:00:00Z'));
  assert.equal(evidence.canonicalUrl, 'https://example.com/project');
  assert.equal(evidence.author, 'Maker');
  assert.equal(evidence.image, 'https://example.com/images/robot.jpg');
  assert.equal(evidence.date, '2026-10-06');
  assert.equal(evidence.signals.bom, true);
  assert.equal(evidence.signals.buildGuide, true);
  assert.equal(evidence.signals.license, true);
});

test('research creates project candidates without touching public catalog files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'embuddies-research-'));
  await mkdir(path.join(root, 'automation', 'candidates'), { recursive: true });
  await mkdir(path.join(root, 'projects'), { recursive: true });
  await mkdir(path.join(root, 'updates'), { recursive: true });
  await writeFile(path.join(root, 'automation', 'sources.json'), JSON.stringify({ discovery: { provider: 'brave', languages: ['en'], queryFamilies: [{ en: 'open hardware' }], maxQueriesPerRun: 1, maxResultsPerQuery: 10, maxModelItems: 10, allowedDomains: [], blockedDomains: [] } }));
  await writeFile(path.join(root, 'automation', 'candidates', 'projects.json'), '[]\n');
  await writeFile(path.join(root, 'automation', 'candidates', 'news.json'), '[]\n');
  await writeFile(path.join(root, 'projects', 'catalog.json'), '[]\n');
  await writeFile(path.join(root, 'updates', 'news.json'), '[]\n');
  const html = '<html><head><title>Open hardware robot</title><meta name="description" content="A real open hardware robot with BOM and build guide"><meta property="og:image" content="https://example.com/robot.jpg"><link rel="canonical" href="https://example.com/robot"></head><body>Hardware project BOM build guide MIT license</body></html>';
  const fetchImpl = async url => {
    if (String(url).startsWith('https://api.search.brave.com/')) return new Response(JSON.stringify({ web: { results: [{ title: 'Open hardware robot', url: 'https://example.com/robot?utm_source=search', description: 'Hardware BOM build guide' }, { title: 'Duplicate', url: 'https://example.com/robot' }] } }), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
  };
  const report = await runResearch({ root, now: new Date('2026-10-08T00:00:00Z'), fetchImpl, env: { BRAVE_SEARCH_API_KEY: 'test' } });
  assert.equal(report.projects.length, 1);
  assert.equal(report.news.length, 0);
  const candidates = JSON.parse(await readFile(path.join(root, 'automation', 'candidates', 'projects.json'), 'utf8'));
  assert.equal(candidates.length, 1);
  assert.equal(JSON.parse(await readFile(path.join(root, 'projects', 'catalog.json'), 'utf8')).length, 0);
  assert.equal(JSON.parse(await readFile(path.join(root, 'updates', 'news.json'), 'utf8')).length, 0);
});

test('dry run skips writes when search credentials are unavailable', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'embuddies-research-dry-'));
  await mkdir(path.join(root, 'automation', 'candidates'), { recursive: true });
  await writeFile(path.join(root, 'automation', 'sources.json'), JSON.stringify({ discovery: { languages: ['en'], queryFamilies: [{ en: 'open hardware' }], maxQueriesPerRun: 1 } }));
  await writeFile(path.join(root, 'automation', 'candidates', 'projects.json'), '[]\n');
  await writeFile(path.join(root, 'automation', 'candidates', 'news.json'), '[]\n');
  const report = await runResearch({ root, dryRun: true, env: {} });
  assert.equal(report.fetched, 0);
  assert.match(report.warnings[0], /BRAVE_SEARCH_API_KEY/);
  assert.equal(await readFile(path.join(root, 'automation', 'candidates', 'projects.json'), 'utf8'), '[]\n');
});
