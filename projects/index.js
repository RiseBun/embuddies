import { categories, language, loadProjects, opennessLabels, projectUrl, readinessLabels, setLanguageLinks, translated } from '../platform/catalog.js';

const lang = language();
setLanguageLinks(lang);
const grid = document.querySelector('#project-grid');
const status = document.querySelector('#filter-status');
const search = document.querySelector('#project-search');
const category = document.querySelector('#category-filter');
const openness = document.querySelector('#openness-filter');
const readiness = document.querySelector('#readiness-filter');
search.placeholder = lang === 'en' ? 'Project or author' : '项目名称或作者';

function fillSelect(select, labels, allLabel) {
  select.add(new Option(allLabel, 'all'));
  Object.entries(labels).forEach(([value, label]) => select.add(new Option(label[lang], value)));
}

fillSelect(category, categories, lang === 'en' ? 'All categories' : '全部类型');
fillSelect(openness, opennessLabels, lang === 'en' ? 'All openness' : '全部开放程度');
fillSelect(readiness, readinessLabels, lang === 'en' ? 'All readiness' : '全部制作状态');

function makeCard(project) {
  const link = document.createElement('a');
  link.className = 'project-card';
  link.href = projectUrl(project.id, lang);
  const media = document.createElement('div');
  media.className = 'project-card-media';
  if (project.image) {
    const image = document.createElement('img');
    image.src = project.image;
    image.alt = project.imageType === 'photo' ? project.title : '';
    image.loading = 'lazy';
    image.addEventListener('error', () => { image.remove(); media.classList.add('media-empty'); });
    media.append(image);
  } else media.classList.add('media-empty');
  const body = document.createElement('div');
  body.className = 'project-card-body';
  const eyebrow = document.createElement('div');
  eyebrow.className = 'project-card-meta';
  eyebrow.textContent = `${categories[project.category]?.[lang] || categories.other[lang]} / ${project.author}`;
  const title = document.createElement('h3');
  title.textContent = project.title;
  const description = document.createElement('p');
  description.textContent = translated(project.description, lang);
  const labels = document.createElement('div');
  labels.className = 'project-labels';
  [opennessLabels[project.openness], readinessLabels[project.readiness]].forEach(label => {
    if (!label) return;
    const badge = document.createElement('span');
    badge.textContent = label[lang];
    labels.append(badge);
  });
  body.append(eyebrow, title, description, labels);
  link.append(media, body);
  return link;
}

let projects = [];
function render() {
  const term = search.value.trim().toLocaleLowerCase();
  const results = projects.filter(project =>
    (category.value === 'all' || project.category === category.value) &&
    (openness.value === 'all' || project.openness === openness.value) &&
    (readiness.value === 'all' || project.readiness === readiness.value) &&
    (!term || `${project.title} ${project.author} ${translated(project.description, lang)}`.toLocaleLowerCase().includes(term))
  );
  grid.replaceChildren(...results.map(makeCard));
  status.textContent = lang === 'en' ? `${results.length} projects` : `显示 ${results.length} 个项目`;
  if (!results.length) {
    const empty = document.createElement('div');
    empty.className = 'catalog-empty';
    const text = document.createElement('p');
    text.textContent = lang === 'en' ? 'No projects match these filters.' : '没有符合条件的项目。';
    const submit = document.createElement('a');
    submit.className = 'text-button';
    submit.href = `/submit/${lang === 'en' ? '?lang=en' : ''}`;
    submit.textContent = lang === 'en' ? 'Share a project ↗' : '分享一个项目 ↗';
    empty.append(text, submit);
    grid.append(empty);
  }
}

[search, category, openness, readiness].forEach(control => control.addEventListener('input', render));
try {
  projects = await loadProjects();
  render();
} catch {
  status.textContent = lang === 'en' ? 'Projects could not be loaded.' : '项目暂时无法加载。';
}
