import { categories, language, opennessLabels, projectUrl, readinessLabels, setLanguageLinks, translated } from '../platform/catalog.js';
import { getClient, isPlatformConfigured } from '../platform/client.js';

const lang = language();
setLanguageLinks(lang);
const message = document.querySelector('#service-status');
const form = document.querySelector('#project-form');
const workspace = document.querySelector('#creator-workspace');
const editor = document.querySelector('#project-editor');
const resourcesNode = document.querySelector('#resource-fields');
const field = name => form.elements.namedItem(name);
let client;
let user;
let currentSubmission;
let editingProjectId = null;
let retainedImagePath = '';

function say(zh, en = zh) { message.textContent = lang === 'en' ? en : zh; }
function optionList(select, values) {
  Object.entries(values).forEach(([value, label]) => select.add(new Option(label[lang], value)));
}
optionList(field('category'), categories);
optionList(field('openness'), opennessLabels);
optionList(field('readiness'), readinessLabels);

function makeResource(type = 'code', url = '') {
  if (resourcesNode.children.length >= 8) return;
  const row = document.createElement('div');
  row.className = 'resource-field';
  const select = document.createElement('select');
  select.setAttribute('aria-label', lang === 'en' ? 'Resource type' : '资料类型');
  const labels = { code: ['代码', 'Code'], hardware: ['硬件文件', 'Hardware files'], cad: ['CAD', 'CAD'], model: ['模型或数据', 'Model or data'], bom: ['材料清单', 'Parts list'], guide: ['制作指南', 'Build guide'], demo: ['演示', 'Demo'] };
  Object.entries(labels).forEach(([value, text]) => select.add(new Option(text[lang === 'en' ? 1 : 0], value)));
  select.value = type;
  const input = document.createElement('input');
  input.type = 'url';
  input.placeholder = 'https://';
  input.value = url;
  input.setAttribute('aria-label', lang === 'en' ? 'Resource URL' : '资料链接');
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'resource-remove';
  remove.title = lang === 'en' ? 'Remove link' : '删除链接';
  remove.setAttribute('aria-label', remove.title);
  remove.textContent = '×';
  remove.addEventListener('click', () => row.remove());
  row.append(select, input, remove);
  resourcesNode.append(row);
}

document.querySelector('#add-resource').addEventListener('click', () => makeResource());
function collectData(strict) {
  const resources = [...resourcesNode.children].map(row => ({ type: row.querySelector('select').value, url: row.querySelector('input').value.trim() })).filter(item => item.url);
  for (const resource of strict ? resources : []) {
    try { if (new URL(resource.url).protocol !== 'https:') throw new Error(); }
    catch { throw new Error(lang === 'en' ? 'Resource links must use HTTPS.' : '资料链接必须以 HTTPS 开头。'); }
  }
  const description = { zh: field('descriptionZh').value.trim(), en: field('descriptionEn').value.trim() };
  if (strict && Math.max(description.zh.length, description.en.length) < 20) throw new Error(lang === 'en' ? 'Write at least 20 characters in one description.' : '请至少用一种语言填写 20 字以上的项目简介。');
  const openness = field('openness').value;
  const licenseUrl = field('licenseUrl').value.trim();
  if (strict && ['open', 'restricted'].includes(openness) && !licenseUrl) throw new Error(lang === 'en' ? 'Add a license link for this openness label.' : '选择此开放程度时，请填写许可链接。');
  if (strict && licenseUrl) {
    try { if (new URL(licenseUrl).protocol !== 'https:') throw new Error(); }
    catch { throw new Error(lang === 'en' ? 'The license link must use HTTPS.' : '许可链接必须以 HTTPS 开头。'); }
  }
  const materials = field('materials').value.split(/\r?\n/).map(item => item.trim()).filter(Boolean).slice(0, 60);
  const readiness = field('readiness').value;
  if (strict && readiness === 'documented' && (!materials.length || !resources.some(item => ['guide', 'bom'].includes(item.type)))) {
    throw new Error(lang === 'en' ? 'Build docs require parts and a guide or BOM link.' : '标注“有制作资料”时，需要材料条目及制作指南或 BOM 链接。');
  }
  if (strict && !field('rightsConfirmed').checked) throw new Error(lang === 'en' ? 'Confirm permission to share this project.' : '请确认你有权分享这些内容。');
  if (strict && !retainedImagePath && !field('image').files.length) throw new Error(lang === 'en' ? 'Add a project image.' : '请上传一张项目图片。');
  return {
    title: field('title').value.trim(), author: field('author').value.trim(),
    category: field('category').value, openness, readiness, licenseUrl,
    description, buildNotes: { zh: field('buildNotesZh').value.trim(), en: field('buildNotesEn').value.trim() },
    materials, resources, imagePath: retainedImagePath, rightsConfirmed: field('rightsConfirmed').checked
  };
}

function resetEditor() {
  form.reset();
  resourcesNode.replaceChildren();
  makeResource();
  currentSubmission = null;
  editingProjectId = null;
  retainedImagePath = '';
  document.querySelector('#current-image').textContent = '';
  editor.hidden = false;
  editor.scrollIntoView({ behavior: 'smooth' });
}

function fillEditor(data, submission = null, projectId = null) {
  resetEditor();
  currentSubmission = submission;
  editingProjectId = projectId;
  retainedImagePath = data.imagePath || '';
  field('title').value = data.title || '';
  field('author').value = data.author || '';
  field('category').value = data.category || 'other';
  field('openness').value = data.openness || 'showcase';
  field('readiness').value = data.readiness || 'showcase';
  field('licenseUrl').value = data.licenseUrl || '';
  field('descriptionZh').value = data.description?.zh || '';
  field('descriptionEn').value = data.description?.en || '';
  field('buildNotesZh').value = data.buildNotes?.zh || '';
  field('buildNotesEn').value = data.buildNotes?.en || '';
  field('materials').value = (data.materials || []).join('\n');
  field('rightsConfirmed').checked = Boolean(data.rightsConfirmed);
  resourcesNode.replaceChildren();
  (data.resources || []).forEach(item => makeResource(item.type, item.url));
  if (!resourcesNode.children.length) makeResource();
  document.querySelector('#current-image').textContent = retainedImagePath ? (lang === 'en' ? 'Current image retained unless replaced.' : '现有图片将保留，除非上传新图片。') : '';
}

async function refreshWorkspace() {
  const [draftsResponse, publishedResponse, statsResponse] = await Promise.all([
    client.from('project_submissions').select('*').eq('owner_id', user.id).order('updated_at', { ascending: false }),
    client.from('published_projects').select('id,data,published_at').eq('owner_id', user.id).order('published_at', { ascending: false }),
    client.rpc('my_project_stats')
  ]);
  if (draftsResponse.error || publishedResponse.error) throw draftsResponse.error || publishedResponse.error;
  const list = document.querySelector('#my-projects');
  list.replaceChildren();
  const activeDrafts = draftsResponse.data.filter(item => item.status !== 'approved');
  const stats = new Map((statsResponse.data || []).map(item => [item.project_id, item]));
  for (const draft of activeDrafts) {
    const row = document.createElement('div');
    row.className = 'workspace-item';
    const text = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = draft.data.title || (lang === 'en' ? 'Untitled draft' : '未命名草稿');
    const state = document.createElement('p');
    state.textContent = ({ draft: lang === 'en' ? 'Draft' : '草稿', pending: lang === 'en' ? 'In review' : '审核中', rejected: lang === 'en' ? 'Changes requested' : '需要修改' })[draft.status];
    if (draft.review_note) state.textContent += ` · ${draft.review_note}`;
    text.append(title, state);
    row.append(text);
    if (draft.status !== 'pending') {
      const button = document.createElement('button');
      button.className = 'text-button';
      button.type = 'button';
      button.textContent = lang === 'en' ? 'Edit' : '编辑';
      button.addEventListener('click', () => fillEditor(draft.data, draft, draft.project_id));
      row.append(button);
    }
    list.append(row);
  }
  for (const project of publishedResponse.data) {
    const row = document.createElement('div');
    row.className = 'workspace-item';
    const text = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = project.data.title;
    const state = document.createElement('p');
    const projectStats = stats.get(project.id);
    state.textContent = lang === 'en'
      ? `Published · ${projectStats?.detail_views || 0} views · ${projectStats?.resource_clicks || 0} resource clicks`
      : `已发布 · ${projectStats?.detail_views || 0} 次浏览 · ${projectStats?.resource_clicks || 0} 次资料点击`;
    text.append(title, state);
    const actions = document.createElement('div');
    const view = document.createElement('a');
    view.className = 'text-button';
    view.href = projectUrl(project.id, lang);
    view.textContent = lang === 'en' ? 'View' : '查看';
    const edit = document.createElement('button');
    edit.className = 'text-button';
    edit.type = 'button';
    const revision = activeDrafts.find(item => item.project_id === project.id);
    edit.textContent = revision
      ? (revision.status === 'pending' ? (lang === 'en' ? 'In review' : '审核中') : (lang === 'en' ? 'Continue update' : '继续更新'))
      : (lang === 'en' ? 'Update' : '更新');
    edit.disabled = revision?.status === 'pending';
    edit.addEventListener('click', () => fillEditor(revision?.data || project.data, revision || null, project.id));
    actions.append(view, edit);
    row.append(text, actions);
    list.append(row);
  }
  if (!list.children.length) list.textContent = lang === 'en' ? 'Your projects will appear here.' : '你的项目会显示在这里。';
}

async function showWorkspace() {
  const { data: { user: currentUser } } = await client.auth.getUser();
  user = currentUser;
  document.querySelector('#auth-section').hidden = Boolean(user);
  workspace.hidden = !user;
  if (user) {
    document.querySelector('#signed-in-as').textContent = user.email;
    await refreshWorkspace();
  }
}

document.querySelector('#auth-form').addEventListener('submit', async event => {
  event.preventDefault();
  const email = event.currentTarget.elements.email.value.trim();
  const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}${lang === 'en' ? '/en' : ''}/submit/` } });
  say(error ? error.message : '登录链接已发送，请检查邮箱。', error ? error.message : 'Check your email for a sign-in link.');
});

document.querySelector('#sign-out').addEventListener('click', async () => {
  await client.auth.signOut();
  editor.hidden = true;
  await showWorkspace();
});
document.querySelector('#new-project').addEventListener('click', resetEditor);

form.addEventListener('submit', async event => {
  event.preventDefault();
  const action = event.submitter?.dataset.action || 'draft';
  const buttons = form.querySelectorAll('button[type="submit"]');
  buttons.forEach(button => { button.disabled = true; });
  try {
    const data = collectData(action === 'pending');
    let submissionId = currentSubmission?.id;
    if (submissionId) {
      const { error } = await client.from('project_submissions').update({ data, status: 'draft', updated_at: new Date().toISOString() }).eq('id', submissionId);
      if (error) throw error;
    } else {
      submissionId = crypto.randomUUID();
      const { error } = await client.from('project_submissions').insert({ id: submissionId, owner_id: user.id, project_id: editingProjectId, data });
      if (error) throw error;
    }
    const file = field('image').files[0];
    if (file) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error(lang === 'en' ? 'Choose a JPG, PNG or WebP under 5 MB.' : '请选择 5 MB 以下的 JPG、PNG 或 WebP 图片。');
      const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type];
      const imagePath = `${user.id}/${submissionId}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await client.storage.from('project-media').upload(imagePath, file, { contentType: file.type });
      if (uploadError) throw uploadError;
      data.imagePath = imagePath;
      retainedImagePath = imagePath;
      const { error: updateError } = await client.from('project_submissions').update({ data }).eq('id', submissionId);
      if (updateError) throw updateError;
    }
    if (action === 'pending') {
      const { error } = await client.from('project_submissions').update({ status: 'pending' }).eq('id', submissionId);
      if (error) throw error;
    }
    editor.hidden = true;
    await refreshWorkspace();
    say(action === 'pending' ? '项目已提交审核。' : '草稿已保存。', action === 'pending' ? 'Project sent for review.' : 'Draft saved.');
  } catch (error) { say(error.message); }
  finally { buttons.forEach(button => { button.disabled = false; }); }
});

if (!isPlatformConfigured()) {
  document.querySelector('#submission-fallback').hidden = false;
  say('', '');
} else {
  try {
    client = await getClient();
    await showWorkspace();
    client.auth.onAuthStateChange(() => { setTimeout(() => showWorkspace().catch(error => say(error.message)), 0); });
  } catch (error) { say(`投稿服务暂时无法连接：${error.message}`, `Submission service unavailable: ${error.message}`); }
}
