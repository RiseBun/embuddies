'use strict';
function robotArt(kind) {
 const color = kind === 'humanoid' ? '#b5d9e2' : kind === 'desk' ? '#d9e8f4' : '#bddbf1';
 const eyes = kind === 'desk' ? '<path d="M145 104q10-16 20 0m25 0q10-16 20 0" stroke="#9be8e3" stroke-width="4" fill="none"/>' : '<circle cx="154" cy="99" r="7" fill="#9be8e3"/><circle cx="201" cy="99" r="7" fill="#9be8e3"/>';
 return `<svg viewBox="0 0 360 300" role="img" aria-label="机器人概念插画，非项目实物"><ellipse cx="180" cy="272" rx="96" ry="12" fill="#000" opacity=".08"/><g stroke="#303e4c" stroke-width="1.6" stroke-linejoin="round"><path d="M148 190v48l-24 20h51v-58M206 190v48l25 20h-51v-58" fill="${color}"/><rect x="130" y="130" width="96" height="80" rx="7" fill="${color}"/><path d="M130 157l-29 27 10 14 27-23M226 157l28 26-10 15-28-24" fill="${color}"/><rect x="120" y="61" width="116" height="85" rx="9" fill="#eef8fc"/><rect x="132" y="76" width="92" height="48" rx="5" fill="#303e4c"/>${eyes}<circle cx="178" cy="170" r="10" fill="#1167e8"/>${kind === 'duck' ? '<path d="M164 128h29l-6 15h-16z" fill="#36cbd0"/>' : ''}</g></svg>`;
}
document.querySelectorAll('[data-robot]').forEach(element => { element.innerHTML = robotArt(element.dataset.robot); });
const projects = {
 microduck: {title:'Microduck', description:'从 Pollen Robotics 的官方软件仓库开始，探索小型双足机器人的控制与开发资料。', author:'Pollen Robotics', url:'https://github.com/pollen-robotics/microduck', steps:['阅读官方说明，确认项目状态与硬件要求。','分别核对软件、硬件设计与训练资料的开放范围。','采购前核对材料清单，规划调试与安全测试。']},
 microban: {title:'Microban', description:'Rhoban 的小型开源人形机器人项目。从原作者资料出发，理解结构、执行器与控制之间的关系。', author:'Rhoban', url:'https://github.com/Rhoban/microban', steps:['查看官方装配与开发资料。','核对打印件、执行器与电子元件要求。','先进行关节测试，再探索复杂动作。']},
 tiny: {title:'Tiny Engineer', description:'让 AI 编程助手的工作状态通过桌面机器人的动作表达出来。从官方指南了解硬件、固件与接入方式。', author:'jamro', url:'https://github.com/jamro/tiny-engineer', steps:['阅读官方构建指南与材料清单。','按文档完成组装、固件配置与连接。','接入编程助手，探索机器人的动作表达。']}
};
const dialog = document.querySelector('#detail-dialog');
const content = document.querySelector('#dialog-content');
document.querySelectorAll('[data-project]').forEach(button => button.addEventListener('click', () => {
 const project = projects[button.dataset.project];
 content.innerHTML = `<div class="eyebrow">PROJECT NOTES / 精选介绍</div><h2 id="dialog-title">${project.title}</h2><p>${project.description}</p><h3>从哪里开始</h3><ol>${project.steps.map(step => `<li>${step}</li>`).join('')}</ol><p>原作者：${project.author}。本站尚未标记为团队已复现，也未提供对应在售套件。资料、许可与兼容要求请以原项目最新文档为准。</p><a class="button orange" href="${project.url}" target="_blank" rel="noopener noreferrer">查看原项目仓库 ↗</a>`;
 dialog.showModal();
}));
document.querySelectorAll('.filter').forEach(button => button.addEventListener('click', () => {
 document.querySelectorAll('.filter').forEach(filter => filter.setAttribute('aria-pressed', String(filter === button)));
 let count = 0;
 document.querySelectorAll('[data-category]').forEach(card => { card.hidden = button.dataset.filter !== 'all' && card.dataset.category !== button.dataset.filter; if (!card.hidden) count += 1; });
 document.querySelector('#filter-status').textContent = `显示 ${count} 个项目`;
}));
document.querySelector('[data-kit-info]').addEventListener('click', () => {
 content.innerHTML = '<div class="eyebrow">KIT / 筹备中</div><h2 id="dialog-title">让动手，少一些准备工作。</h2><p>我们正在筹备配套套件。具体项目、材料清单、价格与发货时间尚未公布，目前不接受付款或预订。</p><h3>上架前，我们会明确</h3><ul><li>适配项目与版本，以及原项目许可。</li><li>包含与不包含的部件、额外需要的工具。</li><li>组装教程、测试范围与支持方式。</li><li>真实价格、库存与交付时间。</li></ul><p>现在可以先通过项目详情查看原作者资料。</p>';
 dialog.showModal();
});
document.querySelector('.close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target !== dialog) return; const bounds = dialog.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close(); });
