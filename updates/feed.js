'use strict';

function startMarquee(track) {
  const items = track.querySelector('.ticker-set');
  if (!items) return;
  const duplicate = items.cloneNode(true);
  duplicate.setAttribute('aria-hidden', 'true');
  duplicate.inert = true;
  track.append(duplicate);
  track.classList.add('is-ready');
}

function makeNewsLink(item) {
  const link = document.createElement('a');
  link.href = item.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  const date = document.createElement('time');
  date.dateTime = item.date;
  date.textContent = item.date.replaceAll('-', '.');
  const title = document.createElement('span');
  title.textContent = document.documentElement.lang === 'en' ? item.title_en || item.title : item.title;
  const source = document.createElement('small');
  source.textContent = item.source;
  link.append(date, title, source);
  return link;
}

async function renderNews() {
  const track = document.querySelector('#news-track');
  const list = document.querySelector('#news-list');
  if (!track && !list) return;
  try {
    const response = await fetch('/updates/news.json');
    if (!response.ok) throw new Error('News feed unavailable');
    const items = await response.json();
    items.sort((first, second) => second.date.localeCompare(first.date));
    if (track) {
      const set = track.querySelector('.ticker-set');
      set.replaceChildren(...items.map(makeNewsLink));
      startMarquee(track);
    }
    if (list) {
      list.replaceChildren(...items.map(makeNewsLink));
    }
  } catch {
    if (track) {
      const link = document.createElement('a');
      link.href = '/updates/';
      link.textContent = '查看资讯';
      track.querySelector('.ticker-set').replaceChildren(link);
    }
    if (list) list.textContent = document.documentElement.lang === 'en' ? 'News could not be loaded.' : '资讯暂时无法加载。';
  }
}

document.querySelectorAll('.ticker-track[data-marquee]').forEach(startMarquee);
renderNews();

async function renderProjects() {
  const track = document.querySelector('.project-row .ticker-track');
  if (!track) return;
  try {
    const { loadProjects } = await import('/platform/catalog.js');
    const projects = (await loadProjects()).slice(0, 12);
    const set = track.querySelector('.ticker-set');
    const links = projects.map(project => {
      const link = document.createElement('a');
      link.href = `/projects/detail/?id=${encodeURIComponent(project.id)}${document.documentElement.lang === 'en' ? '&lang=en' : ''}`;
      const image = document.createElement('img');
      image.src = project.image;
      image.alt = '';
      image.width = 68;
      image.height = 48;
      const title = document.createElement('span');
      title.textContent = project.title;
      const author = document.createElement('small');
      author.textContent = project.author;
      link.append(image, title, author);
      return link;
    });
    set.replaceChildren(...links);
    track.querySelectorAll('.ticker-set[aria-hidden]').forEach(item => item.remove());
    track.classList.remove('is-ready');
    startMarquee(track);
  } catch { /* Keep the initial project links. */ }
}

renderProjects();

const projectImageOverrides = {
  'microduck': '/assets/project-microduck.svg',
  'microban': '/assets/project-microban.svg',
  'tiny-engineer': '/assets/tiny-engineer-official.jpg'
};

function localized(value) {
  if (typeof value === 'string') return value;
  return value?.[document.documentElement.lang === 'en' ? 'en' : 'zh'] || '';
}

function imageForProject(project) {
  return projectImageOverrides[project.id] || project.image;
}

function makeEditorialNews(item) {
  const isEnglish = document.documentElement.lang === 'en';
  const title = isEnglish ? item.title_en || item.title : item.title;
  const link = document.createElement('a');
  link.className = 'editorial-lead-media';
  link.href = item.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  const image = document.createElement('img');
  image.src = item.title.includes('Tiny Engineer') ? '/assets/tiny-engineer-official.jpg' : item.title.includes('Microban') ? '/assets/project-microban.svg' : '/assets/project-microduck.svg';
  image.alt = title;
  image.loading = 'eager';
  link.append(image);

  const copy = document.createElement('div');
  copy.className = 'editorial-lead-copy';
  const meta = document.createElement('div');
  meta.className = 'editorial-meta';
  meta.textContent = `${item.source} · ${item.date.replaceAll('-', '.')}`;
  const heading = document.createElement('h3');
  heading.textContent = title;
  const summary = document.createElement('p');
  summary.textContent = isEnglish
    ? 'A fresh release from the maker community. Open the source project and follow the work as it develops.'
    : '来自创作者社区的新发布。打开原项目，跟进硬件、软件与制作资料的最新进展。';
  const read = document.createElement('span');
  read.className = 'editorial-link';
  read.textContent = isEnglish ? 'Read the update ↗' : '阅读这条资讯 ↗';
  copy.append(meta, heading, summary, read);
  const article = document.createElement('article');
  article.className = 'editorial-lead-inner';
  article.append(link, copy);
  return article;
}

function makeNewsCard(item) {
  const isEnglish = document.documentElement.lang === 'en';
  const title = isEnglish ? item.title_en || item.title : item.title;
  const link = document.createElement('a');
  link.className = 'home-news-card';
  link.href = item.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  const meta = document.createElement('time');
  meta.dateTime = item.date;
  meta.textContent = `${item.date.replaceAll('-', '.')} · ${item.source}`;
  const heading = document.createElement('h3');
  heading.textContent = title;
  const action = document.createElement('span');
  action.textContent = isEnglish ? 'Read story ↗' : '阅读报道 ↗';
  link.append(meta, heading, action);
  return link;
}

function makeProjectFeature(project, index) {
  const isEnglish = document.documentElement.lang === 'en';
  const article = document.createElement('article');
  article.className = `project-feature-card${index === 0 ? ' is-lead' : ''}`;
  const link = document.createElement('a');
  link.href = `/projects/detail/?id=${encodeURIComponent(project.id)}${isEnglish ? '&lang=en' : ''}`;
  const image = document.createElement('img');
  image.src = imageForProject(project);
  image.alt = project.title;
  image.loading = 'eager';
  image.addEventListener('error', () => {
    if (image.src.endsWith('/assets/tiny-engineer-assembly.jpg')) return;
    image.src = '/assets/tiny-engineer-assembly.jpg';
  }, { once: true });
  link.append(image);
  const body = document.createElement('div');
  body.className = 'project-feature-body';
  const meta = document.createElement('div');
  meta.className = 'editorial-meta';
  meta.textContent = `${project.author} · ${project.category}`;
  const heading = document.createElement('h3');
  heading.textContent = project.title;
  const description = document.createElement('p');
  description.textContent = localized(project.description);
  const action = document.createElement('span');
  action.className = 'editorial-link';
  action.textContent = isEnglish ? 'Open project ↗' : '查看项目 ↗';
  body.append(meta, heading, description, action);
  article.append(link, body);
  return article;
}

async function renderEditorial() {
  const newsFeature = document.querySelector('#news-feature');
  const projectFeatureGrid = document.querySelector('#project-feature-grid');
  if (!newsFeature && !projectFeatureGrid) return;
  try {
    const [newsResponse, catalog] = await Promise.all([
      fetch('/updates/news.json'),
      import('/platform/catalog.js').then(({ loadProjects }) => loadProjects())
    ]);
    const news = await newsResponse.json();
    news.sort((first, second) => second.date.localeCompare(first.date));
    if (newsFeature && news[0]) newsFeature.replaceChildren(makeEditorialNews(news[0]));
    const newsList = document.querySelector('#news-list');
    if (newsList) newsList.replaceChildren(...news.slice(1).map(makeNewsCard));
    if (projectFeatureGrid) {
      const projectItems = catalog.slice(0, 5).map(makeProjectFeature);
      projectFeatureGrid.replaceChildren(...projectItems);
    }
  } catch {
    if (newsFeature) newsFeature.textContent = document.documentElement.lang === 'en' ? 'The latest story is being prepared.' : '最新资讯正在整理中。';
    if (projectFeatureGrid) projectFeatureGrid.textContent = document.documentElement.lang === 'en' ? 'Projects are being prepared.' : '项目内容正在整理中。';
  }
}

renderEditorial();
