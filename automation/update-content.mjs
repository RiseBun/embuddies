import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(moduleDirectory, '..');
const supportedSourceKinds = new Set(['github-repo', 'github-releases', 'rss', 'official-page']);
const trackingParameters = new Set(['fbclid', 'gclid', 'mc_cid', 'mc_eid', 'ref', 'source']);

function decodeEntities(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

export function plainText(value, maximumLength = 240) {
  const text = decodeEntities(String(value || ''))
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, maximumLength);
}

export function normalizeUrl(value) {
  const url = new URL(String(value || '').trim());
  if (url.protocol !== 'https:') throw new Error(`Only HTTPS URLs are allowed: ${value}`);
  url.hash = '';
  for (const name of [...url.searchParams.keys()]) {
    if (name.toLowerCase().startsWith('utm_') || trackingParameters.has(name.toLowerCase())) {
      url.searchParams.delete(name);
    }
  }
  url.searchParams.sort();
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString();
}

export function safeDate(value, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '';
  const result = date.toISOString().slice(0, 10);
  if (result > now.toISOString().slice(0, 10)) return '';
  return result;
}

export function githubRepository(value) {
  const url = new URL(value);
  if (url.hostname.toLowerCase() !== 'github.com') return null;
  const [owner, repository] = url.pathname.split('/').filter(Boolean);
  if (!owner || !repository) return null;
  return `${owner}/${repository.replace(/\.git$/i, '')}`;
}

function xmlValue(block, names) {
  for (const name of names) {
    const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
    if (match) return plainText(match[1], 500);
  }
  return '';
}

function xmlLink(block) {
  const href = block.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/i)?.[1];
  return href || xmlValue(block, ['link', 'guid']);
}

export function parseFeed(xml, source, now = new Date()) {
  const blocks = [...String(xml).matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map(match => match[2]);
  const items = [];
  for (const block of blocks) {
    const originalTitle = plainText(xmlValue(block, ['title']), 180);
    const date = safeDate(xmlValue(block, ['pubDate', 'published', 'updated', 'dc:date']), now);
    let url;
    try {
      url = normalizeUrl(xmlLink(block));
    } catch {
      continue;
    }
    if (!originalTitle || !date) continue;
    items.push({
      date,
      title: `${source.name} 发布新动态：${originalTitle}`,
      title_en: originalTitle,
      source: source.name,
      image: source.image || '',
      imageSource: source.imageSource || source.url,
      url
    });
  }
  return items;
}

export function releaseNews(releases, source, now = new Date()) {
  const items = [];
  for (const release of releases || []) {
    if (release.draft || (release.prerelease && !source.includePrereleases)) continue;
    const date = safeDate(release.published_at || release.created_at, now);
    const version = plainText(release.tag_name || release.name, 100);
    let url;
    try {
      url = normalizeUrl(release.html_url);
    } catch {
      continue;
    }
    if (!date || !version) continue;
    items.push({
      date,
      title: `${source.name} 发布 ${version}${release.prerelease ? ' 预发布版本' : ' 版本'}`,
      title_en: `${source.name} released ${version}${release.prerelease ? ' prerelease' : ''}`,
      source: source.name,
      image: source.image || '',
      imageSource: source.imageSource || source.url,
      url
    });
  }
  return items;
}

function validNewsItem(item, now) {
  if (!item || !plainText(item.title) || !plainText(item.title_en) || !plainText(item.source) || !String(item.image || '').trim() || !String(item.imageSource || '').trim()) return false;
  if (!safeDate(item.date, now)) return false;
  if (/^\/assets\/(project-|kit-parts)/.test(String(item.image))) return false;
  try {
    normalizeUrl(item.url);
    normalizeUrl(item.imageSource);
    return true;
  } catch {
    return false;
  }
}

export function mergeNews(existing, additions, now = new Date(), activeLimit = 100) {
  const unique = new Map();
  for (const raw of [...existing, ...additions]) {
    if (!validNewsItem(raw, now)) continue;
    const item = {
      date: safeDate(raw.date, now),
      title: plainText(raw.title, 180),
      title_en: plainText(raw.title_en, 180),
      source: plainText(raw.source, 100),
      image: String(raw.image || '').trim(),
      imageSource: String(raw.imageSource || '').trim(),
      url: normalizeUrl(raw.url)
    };
    if (!unique.has(item.url)) unique.set(item.url, item);
  }
  const sorted = [...unique.values()].sort((first, second) => second.date.localeCompare(first.date) || first.url.localeCompare(second.url));
  return { active: sorted.slice(0, activeLimit), overflow: sorted.slice(activeLimit) };
}

export function inspectRepositoryTree(paths) {
  const entries = (paths || []).map(value => ({ original: String(value), normalized: String(value).toLowerCase() }));
  const matchingPaths = pattern => entries.filter(entry => pattern.test(entry.normalized)).map(entry => entry.original);
  const hardwarePaths = matchingPaths(/(^|\/)(hardware|cad|pcb|mechanical)(\/|$)|\.(kicad_pcb|kicad_sch|step|stp|stl|dxf|f3d)$/);
  const bomPaths = matchingPaths(/(^|\/)(bom|bill[-_ ]?of[-_ ]?materials|shopping|parts)(\.|\/|$)/);
  const guidePaths = matchingPaths(/(^|\/)(docs?|guide|build|assembly|getting[-_ ]?started)(\.|\/|$)|(^|\/)readme\.md$/);
  const imagePaths = entries
    .filter(entry => /\.(png|jpe?g|webp)$/i.test(entry.normalized) && !/(badge|icon|logo|avatar|qr|schematic|diagram)/i.test(entry.normalized))
    .map(entry => entry.original);
  return {
    hardwareDocs: hardwarePaths.length > 0,
    bom: bomPaths.length > 0,
    buildGuide: guidePaths.length > 0,
    imagePath: imagePaths.sort((first, second) => imageScore(second) - imageScore(first))[0] || '',
    evidence: {
      hardware: hardwarePaths.slice(0, 3),
      bom: bomPaths.slice(0, 3),
      guide: guidePaths.slice(0, 3)
    }
  };
}

function imageScore(value) {
  let score = 0;
  if (/(hero|cover|title|overview|photo|render|demo|hardware|assembly)/i.test(value)) score += 10;
  if (/(assets?|images?|media|docs?)/i.test(value)) score += 4;
  if (/\.(jpe?g|webp)$/i.test(value)) score += 2;
  return score;
}

function candidateFromRepository(repository, treeInspection, discoveredAt) {
  const missing = [];
  if (!treeInspection.bom) missing.push('bom');
  if (!treeInspection.buildGuide) missing.push('buildGuide');
  if (!treeInspection.imagePath) missing.push('imageSource');
  const imageSource = treeInspection.imagePath
    ? `https://raw.githubusercontent.com/${repository.full_name}/${repository.default_branch}/${treeInspection.imagePath.split('/').map(encodeURIComponent).join('/')}`
    : '';
  return {
    id: repository.full_name.toLowerCase(),
    name: plainText(repository.name, 100),
    author: plainText(repository.owner?.login, 100),
    url: normalizeUrl(repository.html_url),
    description: plainText(repository.description, 240),
    license: plainText(repository.license?.spdx_id, 40),
    lastActivity: safeDate(repository.pushed_at, new Date('9999-12-31T00:00:00Z')),
    stars: Number(repository.stargazers_count || 0),
    topics: (repository.topics || []).map(topic => plainText(topic, 50)).filter(Boolean).slice(0, 12),
    image: imageSource,
    imageSource: imageSource ? `https://github.com/${repository.full_name}` : '',
    hardwareDocs: treeInspection.hardwareDocs,
    bom: treeInspection.bom,
    buildGuide: treeInspection.buildGuide,
    missing,
    evidence: treeInspection.evidence,
    discoveredAt
  };
}

export function mergeCandidates(existing, discovered, discoveredAt) {
  const candidates = new Map(existing.map(candidate => [normalizeUrl(candidate.url), candidate]));
  let added = 0;
  let updated = 0;
  for (const raw of discovered) {
    const url = normalizeUrl(raw.url);
    const previous = candidates.get(url);
    const candidate = { ...raw, url, discoveredAt: previous?.discoveredAt || raw.discoveredAt || discoveredAt };
    if (!previous) added += 1;
    else if (JSON.stringify(previous) !== JSON.stringify(candidate)) updated += 1;
    candidates.set(url, candidate);
  }
  return {
    candidates: [...candidates.values()].sort((first, second) => second.lastActivity.localeCompare(first.lastActivity) || first.url.localeCompare(second.url)),
    added,
    updated
  };
}

function formatNews(items) {
  if (!items.length) return '[]\n';
  return `[
${items.map(item => `  ${JSON.stringify(item)}`).join(',\n')}
]\n`;
}

function formatJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function readText(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return '';
    throw error;
  }
}

async function readArchivedNews(root) {
  const directory = path.join(root, 'updates', 'archive');
  try {
    const files = await readdir(directory, { withFileTypes: true });
    const archives = await Promise.all(files
      .filter(file => file.isFile() && /^\d{4}\.json$/.test(file.name))
      .map(file => readJson(path.join(directory, file.name), [])));
    return archives.flat();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function saveIfChanged(filePath, content, dryRun) {
  if ((await readText(filePath)) === content) return false;
  if (!dryRun) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, 'utf8');
  }
  return true;
}

async function request(url, { token = '', accept = 'application/vnd.github+json', fetchImpl = fetch, timeout = 15_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const headers = { Accept: accept, 'User-Agent': 'embuddies-content-maintainer/1.0' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetchImpl(url, { headers, redirect: 'follow', signal: controller.signal });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function githubJson(endpoint, options) {
  const response = await request(`https://api.github.com${endpoint}`, options);
  return response.json();
}

function validateSource(source) {
  if (!source.id || !source.name || !source.url || !source.projectId || !source.trustLevel) throw new Error('Source is missing required fields');
  if (!supportedSourceKinds.has(source.kind)) throw new Error(`Unsupported source kind: ${source.kind}`);
  normalizeUrl(source.url);
}

async function collectSource(source, options) {
  validateSource(source);
  if (source.kind === 'github-releases') {
    const repository = githubRepository(source.url);
    if (!repository) throw new Error('Invalid GitHub releases URL');
    const releases = await githubJson(`/repos/${repository}/releases?per_page=10`, options);
    return { news: releaseNews(releases, source, options.now), detail: `${releases.length} releases checked` };
  }
  if (source.kind === 'github-repo') {
    const repository = githubRepository(source.url);
    if (!repository) throw new Error('Invalid GitHub repository URL');
    const metadata = await githubJson(`/repos/${repository}`, options);
    return { news: [], detail: `repository active ${safeDate(metadata.pushed_at, options.now) || 'unknown'}` };
  }
  const response = await request(source.url, { ...options, accept: source.kind === 'rss' ? 'application/rss+xml, application/atom+xml, application/xml, text/xml' : 'text/html' });
  if (source.kind === 'rss') {
    const xml = await response.text();
    const news = parseFeed(xml, source, options.now);
    return { news, detail: `${news.length} feed entries accepted` };
  }
  await response.body?.cancel();
  return { news: [], detail: 'page reachable' };
}

async function discoverProjects(config, knownRepositories, existingCandidates, options) {
  if (!config.enabled || options.skipDiscovery) return { candidates: [], filtered: [], queries: [] };
  const since = new Date(options.now);
  since.setUTCDate(since.getUTCDate() - 180);
  const discoveredRepositories = new Map();
  const queryReports = [];
  for (const configuredQuery of config.queries || []) {
    const query = `${configuredQuery} stars:>=${config.minimumStars || 10} pushed:>=${since.toISOString().slice(0, 10)}`;
    const result = await githubJson(`/search/repositories?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=10`, options);
    queryReports.push({ query, matches: result.total_count || 0 });
    for (const repository of result.items || []) discoveredRepositories.set(repository.full_name.toLowerCase(), repository);
  }

  const existingByUrl = new Map(existingCandidates.map(candidate => [normalizeUrl(candidate.url), candidate]));
  const candidates = [];
  const filtered = [];
  const limit = config.maximumCandidatesPerRun || 12;
  for (const repository of discoveredRepositories.values()) {
    if (candidates.length >= limit) break;
    const key = repository.full_name.toLowerCase();
    if (knownRepositories.has(key)) {
      filtered.push({ url: repository.html_url, reason: 'already in curated catalog' });
      continue;
    }
    if (repository.archived || repository.fork || repository.disabled) {
      filtered.push({ url: repository.html_url, reason: 'archived, forked or disabled repository' });
      continue;
    }
    if (!repository.license?.spdx_id || repository.license.spdx_id === 'NOASSERTION') {
      filtered.push({ url: repository.html_url, reason: 'license is missing or unclear' });
      continue;
    }
    try {
      const tree = await githubJson(`/repos/${repository.full_name}/git/trees/${encodeURIComponent(repository.default_branch)}?recursive=1`, options);
      const inspection = inspectRepositoryTree((tree.tree || []).filter(item => item.type === 'blob').map(item => item.path));
      if (!inspection.hardwareDocs) {
        filtered.push({ url: repository.html_url, reason: 'no hardware or CAD files detected' });
        continue;
      }
      const existing = existingByUrl.get(normalizeUrl(repository.html_url));
      candidates.push(candidateFromRepository(repository, inspection, existing?.discoveredAt || options.now.toISOString().slice(0, 10)));
    } catch (error) {
      filtered.push({ url: repository.html_url, reason: `metadata check failed: ${plainText(error.message, 120)}` });
    }
  }
  return { candidates, filtered, queries: queryReports };
}

function markdownReport(report) {
  const lines = [
    '# embuddies content refresh',
    '',
    `- Checked at: ${report.checkedAt}`,
    `- Dry run: ${report.dryRun ? 'yes' : 'no'}`,
    `- News added: ${report.newsAdded}`,
    `- Project candidates added: ${report.candidatesAdded}`,
    `- Project candidates updated: ${report.candidatesUpdated}`,
    `- Changed files: ${report.changedFiles.length ? report.changedFiles.join(', ') : 'none'}`,
    '',
    '## Sources'
  ];
  for (const source of report.sources) lines.push(`- ${source.status === 'ok' ? '✅' : '⚠️'} ${source.name}: ${source.detail}`);
  lines.push('', '## New news');
  if (!report.addedNews.length) lines.push('- None');
  for (const item of report.addedNews) lines.push(`- ${item.date} [${item.title_en}](${item.url}) — ${item.source}`);
  lines.push('', '## Project candidates');
  if (!report.discoveredCandidates.length) lines.push('- None');
  for (const candidate of report.discoveredCandidates) {
    lines.push(`- [${candidate.name}](${candidate.url}) — ${candidate.license}; hardware=${candidate.hardwareDocs}; BOM=${candidate.bom}; guide=${candidate.buildGuide}; missing=${candidate.missing.join(', ') || 'none'}`);
  }
  lines.push('', '## Filtered discovery results');
  if (!report.filtered.length) lines.push('- None');
  for (const item of report.filtered.slice(0, 30)) lines.push(`- ${item.url} — ${item.reason}`);
  lines.push('', '## Discovery queries');
  if (!report.queries.length) lines.push('- Discovery skipped');
  for (const query of report.queries) lines.push(`- \`${query.query}\` — ${query.matches} matches`);
  return `${lines.join('\n')}\n`;
}

export async function runContentUpdate({
  root = defaultRoot,
  dryRun = false,
  now = new Date(),
  token = process.env.GITHUB_TOKEN || '',
  fetchImpl = fetch,
  skipDiscovery = false,
  reportJson = '',
  reportMarkdown = ''
} = {}) {
  const sourceConfig = await readJson(path.join(root, 'automation', 'sources.json'), { sources: [], discovery: {} });
  const existingNews = await readJson(path.join(root, 'updates', 'news.json'), []);
  const archivedNews = await readArchivedNews(root);
  const catalog = await readJson(path.join(root, 'projects', 'catalog.json'), []);
  const existingCandidates = await readJson(path.join(root, 'automation', 'candidates', 'projects.json'), []);
  const options = { token, fetchImpl, now };
  const collectedNews = [];
  const sourceReports = [];

  for (const source of sourceConfig.sources || []) {
    if (!source.enabled) continue;
    try {
      const collected = await collectSource(source, options);
      collectedNews.push(...collected.news);
      sourceReports.push({ name: source.name, status: 'ok', detail: collected.detail });
    } catch (error) {
      sourceReports.push({ name: source.name, status: 'warning', detail: plainText(error.message, 160) });
    }
  }

  const existingUrls = new Set([...existingNews, ...archivedNews].map(item => {
    try { return normalizeUrl(item.url); } catch { return ''; }
  }));
  const additions = mergeNews([], collectedNews, now, Number.MAX_SAFE_INTEGER).active.filter(item => !existingUrls.has(item.url));
  const mergedNews = mergeNews(existingNews, additions, now, 100);

  const knownRepositories = new Set();
  for (const project of catalog) {
    for (const resource of project.resources || []) {
      const repository = githubRepository(resource.url);
      if (repository) knownRepositories.add(repository.toLowerCase());
    }
  }
  const discovery = await discoverProjects(sourceConfig.discovery || {}, knownRepositories, existingCandidates, { ...options, skipDiscovery });
  const mergedCandidates = mergeCandidates(existingCandidates, discovery.candidates, now.toISOString().slice(0, 10));
  const changedFiles = [];

  const newsPath = path.join(root, 'updates', 'news.json');
  if (await saveIfChanged(newsPath, formatNews(mergedNews.active), dryRun)) changedFiles.push('updates/news.json');

  const archiveGroups = new Map();
  for (const item of mergedNews.overflow) {
    const year = item.date.slice(0, 4);
    if (!archiveGroups.has(year)) archiveGroups.set(year, []);
    archiveGroups.get(year).push(item);
  }
  for (const [year, overflow] of archiveGroups) {
    const archivePath = path.join(root, 'updates', 'archive', `${year}.json`);
    const existingArchive = await readJson(archivePath, []);
    const archive = mergeNews(existingArchive, overflow, now, Number.MAX_SAFE_INTEGER).active;
    if (await saveIfChanged(archivePath, formatNews(archive), dryRun)) changedFiles.push(`updates/archive/${year}.json`);
  }

  const candidatesPath = path.join(root, 'automation', 'candidates', 'projects.json');
  if (await saveIfChanged(candidatesPath, formatJson(mergedCandidates.candidates), dryRun)) changedFiles.push('automation/candidates/projects.json');

  const report = {
    checkedAt: now.toISOString(),
    dryRun,
    newsAdded: additions.length,
    candidatesAdded: mergedCandidates.added,
    candidatesUpdated: mergedCandidates.updated,
    changedFiles,
    sources: sourceReports,
    addedNews: additions,
    discoveredCandidates: discovery.candidates,
    filtered: discovery.filtered,
    queries: discovery.queries
  };
  if (reportJson) {
    await mkdir(path.dirname(reportJson), { recursive: true });
    await writeFile(reportJson, formatJson(report), 'utf8');
  }
  if (reportMarkdown) {
    await mkdir(path.dirname(reportMarkdown), { recursive: true });
    await writeFile(reportMarkdown, markdownReport(report), 'utf8');
  }
  return report;
}

function argumentValue(argumentsList, name) {
  const index = argumentsList.indexOf(name);
  return index >= 0 ? argumentsList[index + 1] || '' : '';
}

async function main() {
  const argumentsList = process.argv.slice(2);
  const nowValue = argumentValue(argumentsList, '--now');
  const report = await runContentUpdate({
    dryRun: argumentsList.includes('--dry-run'),
    skipDiscovery: argumentsList.includes('--skip-discovery'),
    now: nowValue ? new Date(nowValue) : new Date(),
    reportJson: argumentValue(argumentsList, '--report-json'),
    reportMarkdown: argumentValue(argumentsList, '--report-markdown')
  });
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
