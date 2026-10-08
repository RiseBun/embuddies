import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runOrchestrator } from './research-orchestrator.mjs';

test('orchestrator expands queries, enriches candidates and records research state', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'embuddies-orchestrator-'));
  await mkdir(path.join(root, 'automation', 'candidates'), { recursive: true });
  await mkdir(path.join(root, 'projects'), { recursive: true });
  await mkdir(path.join(root, 'updates'), { recursive: true });
  await writeFile(path.join(root, 'automation', 'sources.json'), JSON.stringify({
    discovery: { languages: ['en'], queryFamilies: [{ en: 'open hardware' }], maxResultsPerQuery: 10, maxModelItems: 10 },
    orchestration: { maxQueriesPerRun: 3, agentConcurrency: 2 },
  }));
  await writeFile(path.join(root, 'automation', 'candidates', 'projects.json'), '[]\n');
  await writeFile(path.join(root, 'automation', 'candidates', 'news.json'), '[]\n');
  await writeFile(path.join(root, 'projects', 'catalog.json'), '[]\n');
  await writeFile(path.join(root, 'updates', 'news.json'), '[]\n');
  const html = '<html><head><title>Open hardware robot</title><meta name="description" content="Hardware BOM build guide"><meta property="og:image" content="https://example.com/robot.jpg"><link rel="canonical" href="https://example.com/robot"></head><body>Hardware project BOM build guide MIT license</body></html>';
  const fetchImpl = async (url, options = {}) => {
    if (String(url).startsWith('https://api.search.brave.com/')) return new Response(JSON.stringify({ web: { results: [{ title: 'Open hardware robot', url: 'https://example.com/robot', description: 'Hardware BOM build guide' }] } }), { status: 200 });
    if (String(url) === 'https://api.deepseek.com/chat/completions') {
      const system = JSON.parse(options.body).messages[0].content;
      let content = { queries: ['open hardware robot BOM', 'open hardware robot CAD'] };
      if (system.includes('candidate-extractor')) content = { kind: 'project', title: 'Open Robot', title_en: 'Open Robot', score: 82, author: 'Maker', reason: 'hardware evidence' };
      if (system.includes('source-verifier')) content = { status: 'accepted', confidence: 0.9, authorConfirmed: true, officialSource: true, reason: 'official source' };
      if (system.includes('image-verifier')) content = { imageStatus: 'verified', imageSource: 'https://example.com/robot.jpg', reason: 'official project image' };
      if (system.includes('editorial')) content = { title: 'Open Robot', title_en: 'Open Robot', summary: '开源硬件机器人。', summary_en: 'An open hardware robot.', tags: ['robotics'] };
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { status: 200 });
    }
    return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
  };
  const cachePath = path.join(root, 'automation', '.cache', 'research-state.json');
  const report = await runOrchestrator({ root, now: new Date('2026-10-08T00:00:00Z'), cachePath, fetchImpl, env: { BRAVE_SEARCH_API_KEY: 'test', DEEPSEEK_API_KEY: 'test' } });
  assert.equal(report.projects.length, 1);
  assert.ok(report.queries.includes('open hardware robot BOM'));
  assert.equal(report.projects[0].status, 'needs_review');
  assert.equal(report.projects[0].evidence.agents.image.imageStatus, 'verified');
  assert.equal(JSON.parse(await readFile(path.join(root, 'automation', 'candidates', 'projects.json'), 'utf8')).length, 1);
  assert.equal(JSON.parse(await readFile(cachePath, 'utf8')).runs.length, 1);
  assert.equal(JSON.parse(await readFile(path.join(root, 'projects', 'catalog.json'), 'utf8')).length, 0);
});
