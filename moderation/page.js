import { getClient, isPlatformConfigured } from '../platform/client.js';

const status = document.querySelector('#moderation-status');
let client;

function node(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}

async function refresh() {
  const [pending, reports, published, metrics] = await Promise.all([
    client.from('project_submissions').select('id,owner_id,data,created_at').eq('status', 'pending').order('created_at'),
    client.from('project_reports').select('id,display_name,hardware_revision,outcome,content,catalog_id,project_id').eq('status', 'pending').order('created_at'),
    client.from('published_projects').select('id,data,hidden,published_at').order('published_at', { ascending: false }),
    client.rpc('platform_metrics')
  ]);
  if (pending.error || reports.error || published.error) throw pending.error || reports.error || published.error;
  if (!metrics.error) {
    const labels = { pending_projects: '待审项目', published_projects: '已发布项目', published_reports: '复现记录', detail_views: '项目浏览', materials_clicks: '材料点击', kit_clicks: '套件点击', confirmed_orders: '合作方确认订单', support_issues: '售后问题', commission_by_currency: '已记录分成（按币种）' };
    const summary = document.querySelector('#platform-metrics');
    summary.replaceChildren(...Object.entries(labels).map(([key, label]) => {
      const item = node('div');
      const value = key === 'commission_by_currency'
        ? Object.entries(metrics.data[key] || {}).map(([currency, amount]) => `${currency} ${amount}`).join(' / ') || '—'
        : metrics.data[key];
      item.append(node('strong', null, value), node('span', null, label));
      return item;
    }));
  }
  const pendingList = document.querySelector('#pending-list');
  pendingList.replaceChildren();
  for (const item of pending.data) {
    const article = node('article', 'moderation-item');
    article.append(node('h3', null, item.data.title || '未命名项目'));
    article.append(node('p', null, `${item.data.author || ''} · ${item.data.category || ''} · ${item.data.openness || ''} · ${item.data.readiness || ''}`));
    article.append(node('p', null, item.data.description?.zh || item.data.description?.en || ''));
    const links = node('div', 'resource-list');
    for (const resource of item.data.resources || []) {
      try {
        if (new URL(resource.url).protocol !== 'https:') continue;
        const link = node('a', null, `${resource.type}: ${resource.url}`);
        link.href = resource.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        links.append(link);
      } catch { /* Invalid links are handled during review. */ }
    }
    article.append(links);
    if (item.data.imagePath) {
      const { data } = await client.storage.from('project-media').createSignedUrl(item.data.imagePath, 3600);
      if (data) {
        const image = node('img', 'moderation-image');
        image.src = data.signedUrl;
        image.alt = item.data.title || '';
        article.append(image);
      }
    }
    const note = node('textarea', null);
    note.placeholder = '审核备注；驳回时请说明要修改什么';
    note.rows = 2;
    const actions = node('div', 'form-actions');
    for (const [approve, label] of [[true, '审核通过'], [false, '驳回并退回作者']]) {
      const button = node('button', approve ? 'button' : 'button ghost', label);
      button.type = 'button';
      button.addEventListener('click', async () => {
        if (!approve && !note.value.trim()) { status.textContent = '驳回时请填写具体原因。'; return; }
        button.disabled = true;
        const { error } = await client.rpc('review_project_submission', { target_id: item.id, approve, note: note.value.trim() });
        status.textContent = error ? error.message : approve ? '项目已发布。' : '投稿已退回作者。';
        button.disabled = false;
        if (!error) await refresh();
      });
      actions.append(button);
    }
    article.append(note, actions);
    pendingList.append(article);
  }
  if (!pending.data.length) pendingList.textContent = '目前没有待审核投稿。';
  const reportList = document.querySelector('#report-list');
  reportList.replaceChildren();
  for (const report of reports.data) {
    const article = node('article', 'moderation-item');
    article.append(node('h3', null, `${report.display_name} · ${report.catalog_id || report.project_id}`));
    article.append(node('p', null, `${report.outcome} · ${report.hardware_revision}`));
    article.append(node('p', null, report.content));
    const note = node('textarea');
    note.rows = 2;
    note.placeholder = '审核备注；驳回时请说明原因';
    const actions = node('div', 'form-actions');
    for (const [approve, label] of [[true, '发布记录'], [false, '驳回记录']]) {
      const button = node('button', approve ? 'button' : 'button ghost', label);
      button.type = 'button';
      button.addEventListener('click', async () => {
        if (!approve && !note.value.trim()) { status.textContent = '驳回时请填写具体原因。'; return; }
        button.disabled = true;
        const { error } = await client.rpc('review_project_report', { target_id: report.id, approve, note: note.value.trim() });
        status.textContent = error ? error.message : approve ? '复现记录已发布。' : '复现记录已驳回。';
        button.disabled = false;
        if (!error) await refresh();
      });
      actions.append(button);
    }
    article.append(note, actions);
    reportList.append(article);
  }
  if (!reports.data.length) reportList.textContent = '目前没有待审核复现记录。';
  const publishedList = document.querySelector('#published-list');
  publishedList.replaceChildren();
  for (const project of published.data) {
    const row = node('div', 'workspace-item');
    row.append(node('strong', null, project.data.title));
    const button = node('button', 'text-button', project.hidden ? '恢复公开' : '下架');
    button.type = 'button';
    button.addEventListener('click', async () => {
      const { error } = await client.rpc('set_project_visibility', { target_id: project.id, make_hidden: !project.hidden });
      status.textContent = error ? error.message : '项目状态已更新。';
      if (!error) await refresh();
    });
    row.append(button);
    publishedList.append(row);
  }
}

async function showWorkspace() {
  const { data: { user } } = await client.auth.getUser();
  document.querySelector('#moderation-login').hidden = Boolean(user);
  document.querySelector('#moderation-workspace').hidden = !user;
  if (!user) return;
  document.querySelector('#admin-email').textContent = user.email;
  const { data, error } = await client.rpc('is_platform_admin');
  if (error || !data) {
    document.querySelector('#moderation-workspace').hidden = true;
    status.textContent = '此账号没有项目审核权限。';
    return;
  }
  await refresh();
}

document.querySelector('#moderation-auth').addEventListener('submit', async event => {
  event.preventDefault();
  const email = event.currentTarget.elements.email.value.trim();
  const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/moderation/` } });
  status.textContent = error ? error.message : '登录链接已发送。';
});
document.querySelector('#admin-logout').addEventListener('click', async () => {
  await client.auth.signOut();
  await showWorkspace();
});

if (!isPlatformConfigured()) status.textContent = '项目审核尚未配置。';
else {
  try {
    client = await getClient();
    await showWorkspace();
    client.auth.onAuthStateChange(() => setTimeout(() => showWorkspace().catch(error => { status.textContent = error.message; }), 0));
  } catch (error) { status.textContent = `无法连接审核服务：${error.message}`; }
}
