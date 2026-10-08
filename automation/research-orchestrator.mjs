import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runDeepSeekAgent } from './providers/deepseek.mjs';
import { runResearch } from './research-agent.mjs';
import { loadResearchStore, recordResearchRun, saveResearchStore } from './research-store.mjs';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(moduleDirectory, '..');

async function readJson(filePath, fallback) {
  try { return JSON.parse(await readFile(filePath, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}

function uniqueQueries(queries, limit) {
  return [...new Set(queries.map(query => String(query || '').trim()).filter(Boolean))].slice(0, limit);
}

function seedQueries(discovery) {
  const queries = [];
  for (const family of discovery.queryFamilies || []) for (const language of discovery.languages || ['zh', 'en']) queries.push(family[language] || family.en || family.zh);
  return queries;
}

async function planQueries({ discovery, existingProjects, existingNews, env, fetchImpl, warnings }) {
  const seeds = seedQueries(discovery);
  const planner = await runDeepSeekAgent({
    agent: 'planner',
    input: {
      seedQueries: seeds,
      knownProjects: existingProjects.slice(0, 40).map(item => item.name || item.title || item.url),
      knownNews: existingNews.slice(0, 40).map(item => item.title || item.url),
      languages: discovery.languages || ['zh', 'en'],
      instruction: 'Expand discovery without repeating known projects. Include official-source, BOM, CAD, firmware, build-guide, release and image provenance queries.',
    },
    env,
    fetchImpl,
  });
  if (!planner.ok && planner.error) warnings.push(`planner: ${planner.error}`);
  const planned = Array.isArray(planner.data?.queries) ? planner.data.queries : [];
  return uniqueQueries([...seeds, ...planned], Number(discovery.maxQueriesPerRun || 48));
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function consume() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, consume));
  return results;
}

async function enrichCandidate(candidate, env, fetchImpl) {
  const evidence = { candidate, pageEvidence: candidate.evidence };
  const [source, image, editorial] = await Promise.all([
    runDeepSeekAgent({ agent: 'source-verifier', input: evidence, env, fetchImpl }),
    runDeepSeekAgent({ agent: 'image-verifier', input: evidence, env, fetchImpl }),
    runDeepSeekAgent({ agent: 'editorial', input: evidence, env, fetchImpl }),
  ]);
  const sourceData = source.data || {};
  const imageData = image.data || {};
  const editorialData = editorial.data || {};
  const status = sourceData.status === 'rejected' ? 'rejected' : 'needs_review';
  return {
    ...candidate,
    title: editorialData.title || candidate.title,
    title_en: editorialData.title_en || candidate.title_en,
    summary: editorialData.summary || candidate.summary,
    summary_en: editorialData.summary_en || candidate.summary_en,
    image: imageData.imageStatus === 'missing' ? '' : (candidate.image || imageData.imageSource || ''),
    imageSource: imageData.imageSource || candidate.imageSource,
    status,
    evidence: {
      ...(candidate.evidence || {}),
      agents: { source: sourceData, image: imageData, editorial: editorialData },
    },
  };
}

function mergeByUrl(existing, additions) {
  const merged = new Map(existing.map(item => [item.canonicalUrl || item.sourceUrl || item.url, item]));
  for (const item of additions) {
    const key = item.canonicalUrl || item.sourceUrl || item.url;
    if (key) merged.set(key, { ...merged.get(key), ...item });
  }
  return [...merged.values()].sort((first, second) => String(second.discoveredAt).localeCompare(String(first.discoveredAt)) || String(first.url).localeCompare(String(second.url)));
}

async function saveJson(filePath, value, dryRun) {
  if (dryRun) return false;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return true;
}

function markdownReport(report) {
  const lines = [
    '# embuddies multi-agent research report',
    '',
    `- Checked at: ${report.checkedAt}`,
    `- Queries planned: ${report.queries.length}`,
    `- Pages fetched: ${report.fetched}`,
    `- Dynamic pages: ${report.dynamicFetched || 0}`,
    `- Project candidates: ${report.projects.length}`,
    `- News candidates: ${report.news.length}`,
    '',
    '## Agent stages',
    '',
    '- planner: query expansion',
    '- discovery: web search and page evidence collection',
    '- source-verifier: attribution and source quality',
    '- image-verifier: project image provenance',
    '- editorial: bilingual candidate metadata',
    '',
    '## Candidates',
    '',
  ];
  for (const item of [...report.projects, ...report.news]) lines.push(`- [${item.title}](${item.url}) — ${item.status}; score=${item.score}; image=${item.image ? 'yes' : 'no'}`);
  lines.push('', '## Warnings', '');
  for (const warning of report.warnings) lines.push(`- ${warning}`);
  if (!report.warnings.length) lines.push('- None');
  return `${lines.join('\n')}\n`;
}

export async function runOrchestrator({ root = defaultRoot, dryRun = false, now = new Date(), fetchImpl = fetch, env = process.env, reportJson = '', reportMarkdown = '', cachePath = '' } = {}) {
  const config = await readJson(path.join(root, 'automation', 'sources.json'), { discovery: {} });
  const discovery = { provider: 'brave', languages: ['zh', 'en'], maxQueriesPerRun: 48, agentConcurrency: 4, ...(config.discovery || {}), ...(config.orchestration || {}) };
  const existingProjects = await readJson(path.join(root, 'automation', 'candidates', 'projects.json'), []);
  const existingNews = await readJson(path.join(root, 'automation', 'candidates', 'news.json'), []);
  const warnings = [];
  const queries = await planQueries({ discovery, existingProjects, existingNews, env, fetchImpl, warnings });
  const researchEnv = { ...env, MODEL_PROVIDER: env.MODEL_PROVIDER || 'deepseek' };
  const raw = await runResearch({ root, dryRun: true, now, fetchImpl, queries, env: researchEnv });
  warnings.push(...raw.warnings);
  const allCandidates = [...raw.projects, ...raw.news];
  const enriched = await mapLimit(allCandidates, Number(discovery.agentConcurrency || 4), async candidate => {
    try { return await enrichCandidate(candidate, researchEnv, fetchImpl); } catch (error) { warnings.push(`${candidate.url}: ${error.message}`); return candidate; }
  });
  const projectCount = raw.projects.length;
  const projects = enriched.slice(0, projectCount);
  const news = enriched.slice(projectCount);
  const mergedProjects = mergeByUrl(existingProjects, projects);
  const mergedNews = mergeByUrl(existingNews, news);
  const changedFiles = [];
  if (await saveJson(path.join(root, 'automation', 'candidates', 'projects.json'), mergedProjects, dryRun)) changedFiles.push('automation/candidates/projects.json');
  if (await saveJson(path.join(root, 'automation', 'candidates', 'news.json'), mergedNews, dryRun)) changedFiles.push('automation/candidates/news.json');
  const report = { checkedAt: now.toISOString(), dryRun, provider: researchEnv.MODEL_PROVIDER, queries, fetched: raw.fetched, dynamicFetched: raw.dynamicFetched, projects, news, warnings, changedFiles, stages: ['planner', 'discovery', 'source-verifier', 'image-verifier', 'editorial'] };
  const statePath = cachePath || path.join(root, 'automation', '.cache', 'research-state.json');
  const store = recordResearchRun(await loadResearchStore(statePath), report, now);
  await saveResearchStore(statePath, store, dryRun);
  if (reportJson) { await mkdir(path.dirname(reportJson), { recursive: true }); await writeFile(reportJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8'); }
  if (reportMarkdown) { await mkdir(path.dirname(reportMarkdown), { recursive: true }); await writeFile(reportMarkdown, markdownReport(report), 'utf8'); }
  return report;
}

function argumentValue(argumentsList, name) { const index = argumentsList.indexOf(name); return index >= 0 ? argumentsList[index + 1] || '' : ''; }

async function main() {
  const args = process.argv.slice(2);
  const report = await runOrchestrator({ dryRun: args.includes('--dry-run'), now: new Date(argumentValue(args, '--now') || Date.now()), reportJson: argumentValue(args, '--report-json'), reportMarkdown: argumentValue(args, '--report-markdown'), cachePath: argumentValue(args, '--cache-path') });
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch(error => { console.error(error); process.exitCode = 1; });
