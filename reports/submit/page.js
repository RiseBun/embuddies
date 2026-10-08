import { language, loadProjects, projectUrl, setLanguageLinks } from '../../platform/catalog.js';
import { getClient, isPlatformConfigured } from '../../platform/client.js';

const lang = language();
setLanguageLinks(lang);
const projectId = new URLSearchParams(location.search).get('id');
const status = document.querySelector('#report-status');
let client;
let user;
let project;

try {
  project = (await loadProjects()).find(item => item.id === projectId);
  if (!project) throw new Error();
  document.querySelector('#project-name').textContent = project.title;
  document.querySelector('#project-back').href = projectUrl(project.id, lang);
} catch { status.textContent = lang === 'en' ? 'Project not found.' : '找不到这个项目。'; }

async function updateAuth() {
  const { data: { user: currentUser } } = await client.auth.getUser();
  user = currentUser;
  document.querySelector('#report-auth-section').hidden = Boolean(user);
  document.querySelector('#report-editor').hidden = !user;
  if (user) await showMyReports();
  else if (document.querySelector('#my-reports')) document.querySelector('#my-reports').hidden = true;
}

async function showMyReports() {
  let section = document.querySelector('#my-reports');
  if (!section) {
    section = document.createElement('section');
    section.id = 'my-reports';
    section.className = 'section';
    const heading = document.createElement('h2');
    heading.textContent = lang === 'en' ? 'My reports' : '我的记录';
    section.append(heading);
    document.querySelector('#report-editor').after(section);
  }
  section.hidden = false;
  const reference = project.userProject ? ['project_id', project.id] : ['catalog_id', project.id];
  const { data, error } = await client.from('project_reports').select('status,review_note,content,created_at').eq('owner_id', user.id).eq(reference[0], reference[1]).order('created_at', { ascending: false });
  section.querySelectorAll('.workspace-item').forEach(item => item.remove());
  if (error) { status.textContent = error.message; return; }
  for (const report of data) {
    const item = document.createElement('div');
    item.className = 'workspace-item';
    const content = document.createElement('div');
    const heading = document.createElement('strong');
    heading.textContent = ({ pending: lang === 'en' ? 'In review' : '审核中', approved: lang === 'en' ? 'Published' : '已发布', rejected: lang === 'en' ? 'Changes requested' : '需要修改' })[report.status];
    const preview = document.createElement('p');
    preview.textContent = report.review_note || report.content.slice(0, 100);
    content.append(heading, preview);
    item.append(content);
    section.append(item);
  }
}

document.querySelector('#report-auth').addEventListener('submit', async event => {
  event.preventDefault();
  const email = event.currentTarget.elements.email.value.trim();
  const url = `${location.origin}${lang === 'en' ? '/en' : ''}/reports/submit/?id=${encodeURIComponent(projectId)}`;
  const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: url } });
  status.textContent = error ? error.message : lang === 'en' ? 'Check your email for a sign-in link.' : '登录链接已发送，请检查邮箱。';
});

document.querySelector('#report-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!project || !user) return;
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  const reference = project.userProject ? { project_id: project.id } : { catalog_id: project.id };
  const { error } = await client.from('project_reports').insert({
    owner_id: user.id, ...reference,
    display_name: form.elements.displayName.value.trim(),
    hardware_revision: form.elements.revision.value.trim(),
    outcome: form.elements.outcome.value,
    content: form.elements.content.value.trim()
  });
  status.textContent = error ? error.message : lang === 'en' ? 'Build report sent for review.' : '复现记录已提交审核。';
  if (!error) { form.reset(); await showMyReports(); }
  button.disabled = false;
});

if (project && !isPlatformConfigured()) {
  const section = document.createElement('section');
  section.className = 'section planning-layout';
  const heading = document.createElement('h2');
  heading.textContent = lang === 'en' ? 'Share a report' : '提交记录';
  const content = document.createElement('div');
  const description = document.createElement('p');
  description.textContent = lang === 'en' ? 'Account publishing is not open yet. Share your build report through GitHub.' : '账号投稿尚未开放。现在可以通过 GitHub 提交复现记录。';
  const link = document.createElement('a');
  link.className = 'button';
  link.textContent = lang === 'en' ? 'Share on GitHub ↗' : '通过 GitHub 分享 ↗';
  const url = new URL('https://github.com/RiseBun/embuddies/issues/new');
  url.searchParams.set('title', `[Build] ${project.title}`);
  url.searchParams.set('body', `${lang === 'en' ? 'Project' : '项目'}: https://embuddies.com${projectUrl(project.id, lang)}\n\n`);
  link.href = url.href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  content.append(description, link);
  section.append(heading, content);
  status.after(section);
}
else if (project) {
  try {
    client = await getClient();
    await updateAuth();
    client.auth.onAuthStateChange(() => setTimeout(() => updateAuth().catch(error => { status.textContent = error.message; }), 0));
  } catch (error) { status.textContent = error.message; }
}
