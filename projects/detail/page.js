import { categories, language, loadProjects, opennessLabels, readinessLabels, recordEvent, setLanguageLinks, translated } from '../../platform/catalog.js';
import { getClient } from '../../platform/client.js';

const lang = language();
setLanguageLinks(lang);
const root = document.querySelector('#detail-content');
const id = new URLSearchParams(location.search).get('id');

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function section(title) {
  const wrapper = element('section', 'detail-section');
  wrapper.append(element('h2', null, title));
  return wrapper;
}

async function imageSource(project) {
  if (project.image) return project.image;
  if (!project.imagePath) return project.image;
  const client = await getClient();
  if (!client) return '';
  const { data, error } = await client.storage.from('project-media').createSignedUrl(project.imagePath, 3600);
  return error ? '' : data.signedUrl;
}

function resourceLink(resource, project) {
  const labels = {
    code: lang === 'en' ? 'Code repository' : '代码仓库',
    hardware: lang === 'en' ? 'Hardware files' : '硬件文件',
    cad: lang === 'en' ? 'CAD files' : 'CAD 文件',
    model: lang === 'en' ? 'Model or data' : '模型或数据',
    bom: lang === 'en' ? 'Parts list' : '材料清单',
    guide: lang === 'en' ? 'Build guide' : '制作指南',
    demo: lang === 'en' ? 'Demo' : '演示'
  };
  const link = element('a', 'resource-link', `${labels[resource.type] || (lang === 'en' ? 'Project resource' : '项目资料')} ↗`);
  link.href = resource.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.addEventListener('click', () => recordEvent(resource.type === 'bom' ? 'materials_click' : 'resource_click', project.id));
  return link;
}

function render(project, imageUrl) {
  document.title = `${project.title} | embuddies`;
  const article = element('article', 'project-detail');
  const header = element('div', 'detail-heading');
  header.append(element('div', 'eyebrow', `${categories[project.category]?.[lang] || categories.other[lang]} / ${project.author}`));
  header.append(element('h1', null, project.title));
  header.append(element('p', 'detail-description', translated(project.description, lang)));
  const labels = element('div', 'project-labels');
  [opennessLabels[project.openness], readinessLabels[project.readiness]].forEach(label => {
    if (label) labels.append(element('span', null, label[lang]));
  });
  header.append(labels);
  if (imageUrl) {
    const figure = element('figure', 'detail-image');
    const image = element('img');
    image.src = imageUrl;
    image.alt = project.imageType === 'photo' || project.imagePath ? project.title : '';
    image.addEventListener('error', () => figure.remove());
    figure.append(image);
    article.append(header, figure);
  } else article.append(header);

  const body = element('div', 'detail-columns');
  const main = element('div');
  const materials = section(lang === 'en' ? 'Parts and preparation' : '材料与准备');
  if (project.materials?.length) {
    const list = element('ul', 'material-list');
    project.materials.forEach(item => list.append(element('li', null, translated(item, lang))));
    materials.append(list);
  } else materials.append(element('p', 'sub', lang === 'en' ? 'Check the author’s current parts list before purchasing.' : '采购前请以原作者当前版本的材料清单为准。'));
  if (project.buildNotes) materials.append(element('p', null, translated(project.buildNotes, lang)));

  const resources = section(lang === 'en' ? 'Original resources' : '原始资料');
  if (project.resources?.length) {
    const list = element('div', 'resource-list');
    project.resources.forEach(resource => {
      try {
        if (new URL(resource.url).protocol === 'https:') list.append(resourceLink(resource, project));
      } catch { /* Ignore malformed links. */ }
    });
    resources.append(list);
  } else resources.append(element('p', 'sub', lang === 'en' ? 'No source files have been provided.' : '作者尚未提供源文件链接。'));

  const reports = section(lang === 'en' ? 'Build reports' : '复现记录');
  const reportList = element('div', 'report-list');
  reportList.append(element('p', 'sub', lang === 'en' ? 'No build reports have been published yet.' : '暂时没有已发布的复现记录。'));
  reports.append(reportList);
  const reportLink = element('a', 'text-button', lang === 'en' ? 'Share a build report ↗' : '分享复现记录 ↗');
  reportLink.href = `${lang === 'en' ? '/en' : ''}/reports/submit/?id=${encodeURIComponent(project.id)}`;
  reports.append(reportLink);
  main.append(materials, resources, reports);
  const side = element('aside', 'detail-aside');
  side.append(element('h2', null, lang === 'en' ? 'Project status' : '项目状态'));
  side.append(element('p', null, `${opennessLabels[project.openness]?.[lang] || ''} · ${readinessLabels[project.readiness]?.[lang] || ''}`));
  body.append(main, side);
  article.append(body);
  root.replaceChildren(article);
  populateExtras(project, reportList, side);
}

async function populateExtras(project, reportList, side) {
  try {
    const client = await getClient();
    if (!client) return;
    const reference = project.userProject ? ['project_id', project.id] : ['catalog_id', project.id];
    const [reportsResult, kitsResult] = await Promise.all([
      client.from('project_reports').select('display_name,hardware_revision,outcome,content,created_at').eq(reference[0], reference[1]).eq('status', 'approved').order('created_at', { ascending: false }),
      client.from('partner_kits').select('name,partner_name,revision,regions,url').eq(reference[0], reference[1]).eq('active', true)
    ]);
    if (!reportsResult.error && reportsResult.data.length) {
      reportList.replaceChildren(...reportsResult.data.map(report => {
        const article = element('article', 'build-report');
        article.append(element('strong', null, `${report.display_name} · ${report.outcome === 'built' ? (lang === 'en' ? 'Built' : '已完成') : (lang === 'en' ? 'Partial' : '部分完成')}`));
        if (report.hardware_revision) article.append(element('small', null, report.hardware_revision));
        article.append(element('p', null, report.content));
        return article;
      }));
    }
    if (!kitsResult.error && kitsResult.data.length) {
      const label = element('label', 'kit-region-label', lang === 'en' ? 'Delivery region' : '配送地区');
      const region = element('select');
      region.setAttribute('aria-label', label.textContent);
      region.add(new Option(lang === 'en' ? 'Select region' : '选择地区', ''));
      const supported = [...new Set(kitsResult.data.flatMap(kit => kit.regions).filter(code => code !== 'GLOBAL'))];
      supported.forEach(code => region.add(new Option(code, code)));
      region.add(new Option(lang === 'en' ? 'Other region' : '其他地区', 'OTHER'));
      label.append(region);
      const list = element('div');
      region.addEventListener('change', () => {
        list.replaceChildren();
        if (!region.value) return;
        const available = kitsResult.data.filter(kit => kit.regions.includes(region.value) || kit.regions.includes('GLOBAL'));
        if (!available.length) {
          list.append(element('p', 'sub', lang === 'en' ? 'No partner kit ships to this region.' : '该地区暂无可配送的合作套件。'));
          return;
        }
        available.forEach(kit => {
          const kitSection = element('div', 'partner-kit');
          kitSection.append(element('h3', null, kit.name));
          kitSection.append(element('p', null, `${kit.partner_name} · ${lang === 'en' ? 'Revision' : '适配版本'} ${kit.revision}`));
          const link = element('a', 'button', lang === 'en' ? 'View partner kit' : '查看合作套件');
          link.href = kit.url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer sponsored';
          link.addEventListener('click', () => recordEvent('kit_click', project.id));
          kitSection.append(link, element('small', null, lang === 'en' ? 'Partner fulfills the order and handles support.' : '由合作方负责发货与售后。'));
          list.append(kitSection);
        });
      });
      side.append(label, list);
    }
  } catch { /* Project details remain available without community services. */ }
}

try {
  const projects = await loadProjects();
  const project = projects.find(item => item.id === id);
  if (!project) throw new Error('not-found');
  render(project, await imageSource(project));
  recordEvent('detail_view', project.id);
} catch {
  root.replaceChildren(element('p', 'catalog-status', lang === 'en' ? 'Project not found. Return to the directory.' : '找不到这个项目，请返回项目目录。'));
}
