import { getClient } from './client.js';

export const categories = {
  robotics: { zh: '机器人', en: 'Robotics' },
  desktop: { zh: '桌面设备', en: 'Desktop' },
  input: { zh: '输入设备', en: 'Input devices' },
  home: { zh: '智能家居', en: 'Smart home' },
  wearable: { zh: '可穿戴', en: 'Wearables' },
  art: { zh: '交互艺术', en: 'Interactive art' },
  tools: { zh: '工具与仪器', en: 'Tools and instruments' },
  other: { zh: '其他硬件', en: 'Other hardware' }
};

export const opennessLabels = {
  open: { zh: '开源', en: 'Open source' },
  partial: { zh: '部分开放', en: 'Partly open' },
  restricted: { zh: '附带许可限制', en: 'License restrictions' },
  showcase: { zh: '作品展示', en: 'Showcase' }
};

export const readinessLabels = {
  documented: { zh: '有制作资料', en: 'Build docs available' },
  reference: { zh: '资料待核对', en: 'Build details to verify' },
  showcase: { zh: '仅展示', en: 'Showcase only' }
};

export function language() {
  return new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : 'zh';
}

export function translated(value, lang = language()) {
  if (typeof value === 'string') return value;
  return value?.[lang] || value?.zh || value?.en || '';
}

export function projectUrl(id, lang = language()) {
  return `/projects/detail/?id=${encodeURIComponent(id)}${lang === 'en' ? '&lang=en' : ''}`;
}

export function setLanguageLinks(lang = language()) {
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
  document.querySelectorAll('[data-zh][data-en]').forEach(element => {
    element.textContent = element.dataset[lang];
  });
  document.querySelectorAll('nav a, [data-local-link]').forEach(link => {
    const url = new URL(link.getAttribute('href'), location.origin);
    if (lang === 'en') {
      if (['/projects/', '/submit/'].includes(url.pathname)) url.searchParams.set('lang', 'en');
      else if (url.pathname === '/') url.pathname = '/en/';
      else url.pathname = `/en${url.pathname}`;
    }
    link.href = url.pathname + url.search + url.hash;
  });
  document.querySelectorAll('[data-language-switch]').forEach(link => {
    const url = new URL(location.href);
    if (lang === 'en') url.searchParams.delete('lang');
    else url.searchParams.set('lang', 'en');
    link.href = url.pathname + url.search + url.hash;
    link.textContent = lang === 'en' ? '中文' : 'EN';
  });
}

export async function loadProjects() {
  const response = await fetch('/projects/catalog.json');
  if (!response.ok) throw new Error('Project catalog unavailable');
  const curated = await response.json();
  try {
    const client = await getClient();
    if (!client) return curated;
    const { data, error } = await client.from('published_projects').select('id,data,published_at').eq('hidden', false).order('published_at', { ascending: false });
    if (error) throw error;
    const community = await Promise.all((data || []).map(async project => {
      let image = '';
      if (project.data.imagePath) {
        const { data: signed } = await client.storage.from('project-media').createSignedUrl(project.data.imagePath, 3600);
        image = signed?.signedUrl || '';
      }
      return { ...project.data, image, imageType: 'photo', id: project.id, userProject: true };
    }));
    return [...community, ...curated];
  } catch (error) {
    console.warn('Community projects unavailable', error);
    return curated;
  }
}

export async function recordEvent(type, projectId) {
  try {
    const client = await getClient();
    if (!client) return;
    const reference = /^[0-9a-f-]{36}$/i.test(projectId) ? { project_id: projectId } : { catalog_id: projectId };
    await client.from('project_events').insert({ event_type: type, ...reference });
  } catch {
    // Analytics must never block project links.
  }
}
