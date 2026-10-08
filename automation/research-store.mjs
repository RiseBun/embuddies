import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function emptyResearchStore() {
  return { version: 1, pages: {}, projects: {}, runs: [] };
}

export async function loadResearchStore(filePath) {
  try {
    return { ...emptyResearchStore(), ...JSON.parse(await readFile(filePath, 'utf8')) };
  } catch (error) {
    if (error.code === 'ENOENT') return emptyResearchStore();
    throw error;
  }
}

export function recordResearchRun(store, report, now = new Date()) {
  const next = { ...emptyResearchStore(), ...store, pages: { ...(store.pages || {}) }, projects: { ...(store.projects || {}) }, runs: [...(store.runs || [])] };
  for (const item of [...(report.projects || []), ...(report.news || [])]) {
    const url = item.canonicalUrl || item.sourceUrl || item.url;
    if (!url) continue;
    next.pages[url] = { url, title: item.title, status: item.status, score: item.score, lastSeenAt: now.toISOString() };
    if (item.id || item.url) next.projects[item.id || item.url] = { ...item, lastSeenAt: now.toISOString() };
  }
  next.runs = [{ checkedAt: report.checkedAt || now.toISOString(), fetched: report.fetched || 0, projects: (report.projects || []).length, news: (report.news || []).length, warnings: (report.warnings || []).length }, ...next.runs].slice(0, 100);
  return next;
}

export async function saveResearchStore(filePath, store, dryRun = false) {
  if (dryRun) return false;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  return true;
}
