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

const projectFilters = [
  { id: 'all', zh: '全部', en: 'All' },
  { id: 'documented', zh: '自制项目', en: 'Buildable' },
  { id: 'robotics', zh: '机器人', en: 'Robotics' },
  { id: 'home', zh: '智能家居', en: 'Smart home' },
  { id: 'desktop', zh: '桌面设备', en: 'Desktop' },
  { id: 'input', zh: '输入设备', en: 'Input devices' },
  { id: 'wearable', zh: '可穿戴', en: 'Wearables' }
];

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
  article.className = 'news-feature-card';
  article.append(link, copy);
  return article;
}

function makeProjectFeature(project) {
  const isEnglish = document.documentElement.lang === 'en';
  const article = document.createElement('article');
  article.className = 'project-feature-card';
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
    if (newsFeature) renderShowcase(newsFeature, news, makeEditorialNews, 'news');
    if (projectFeatureGrid) {
      renderProjectCollection(projectFeatureGrid, catalog);
    }
  } catch {
    if (newsFeature) newsFeature.textContent = document.documentElement.lang === 'en' ? 'The latest story is being prepared.' : '最新资讯正在整理中。';
    if (projectFeatureGrid) projectFeatureGrid.textContent = document.documentElement.lang === 'en' ? 'Projects are being prepared.' : '项目内容正在整理中。';
  }
}

function renderProjectCollection(host, projects) {
  const filters = document.querySelector('#project-filters');
  const isEnglish = document.documentElement.lang === 'en';
  let selected = 'all';
  const render = () => {
    const visible = selected === 'all'
      ? projects
      : selected === 'documented'
        ? projects.filter(project => project.readiness === 'documented')
        : projects.filter(project => project.category === selected);
    host.replaceChildren(...visible.map(makeProjectFeature));
    filters?.querySelectorAll('button').forEach(button => {
      button.setAttribute('aria-selected', button.dataset.filter === selected ? 'true' : 'false');
    });
  };
  if (filters) {
    filters.replaceChildren(...projectFilters.map(filter => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'project-filter-tab';
      button.dataset.filter = filter.id;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', filter.id === selected ? 'true' : 'false');
      button.textContent = filter[isEnglish ? 'en' : 'zh'];
      button.addEventListener('click', () => { selected = filter.id; render(); });
      return button;
    }));
  }
  render();
}

function renderShowcase(host, items, makeCard, type) {
  const pageSize = type === 'news' ? 3 : 7;
  const pageCount = type === 'news' ? Math.max(1, items.length) : Math.max(1, Math.ceil(items.length / pageSize));
  let page = 0;
  const showcase = document.createElement('div');
  showcase.className = `showcase showcase-${type}`;
  const content = document.createElement('div');
  content.className = 'showcase-content';
  const main = document.createElement('div');
  main.className = 'showcase-main';
  const side = document.createElement('div');
  side.className = 'showcase-side';
  const controls = document.createElement('div');
  controls.className = 'showcase-controls';
  const previous = document.createElement('button');
  previous.className = 'showcase-arrow';
  previous.type = 'button';
  previous.setAttribute('aria-label', '上一页');
  previous.textContent = '←';
  const next = document.createElement('button');
  next.className = 'showcase-arrow';
  next.type = 'button';
  next.setAttribute('aria-label', '下一页');
  next.textContent = '→';
  const dots = document.createElement('div');
  dots.className = 'showcase-dots';
  const update = () => {
    const current = type === 'news'
      ? [0, 1, 2].map(offset => items[(page + offset) % items.length]).filter(Boolean)
      : items.slice(page * pageSize, (page + 1) * pageSize);
    main.replaceChildren(current[0] ? makeCard(current[0], 0) : document.createElement('div'));
    side.replaceChildren(...current.slice(1).map((item, index) => makeCard(item, index + 1)));
    [...dots.children].forEach((dot, index) => dot.setAttribute('aria-current', index === page ? 'page' : 'false'));
    previous.disabled = pageCount < 2 || (type !== 'news' && page === 0);
    next.disabled = pageCount < 2 || (type !== 'news' && page === pageCount - 1);
  };
  previous.addEventListener('click', () => { if (page > 0) { page -= 1; update(); } });
  next.addEventListener('click', () => { if (page < pageCount - 1) { page += 1; update(); } });
  for (let index = 0; index < pageCount; index += 1) {
    const dot = document.createElement('button');
    dot.className = 'showcase-dot';
    dot.type = 'button';
    dot.setAttribute('aria-label', `第 ${index + 1} 页`);
    dot.addEventListener('click', () => { page = index; update(); });
    dots.append(dot);
  }
  controls.append(previous, dots, next);
  content.append(main, side);
  showcase.append(content, controls);
  host.replaceChildren(showcase);
  update();
}

renderEditorial();
