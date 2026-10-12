'use strict';
const english=document.documentElement.lang==='en';
const copy=(en,zh)=>english?en:zh;
const languageSwitch=document.querySelector('.language-switch');
function syncLanguageLink(){if(languageSwitch){const target=new URL(languageSwitch.href);target.search=location.search;target.hash=location.hash;languageSwitch.href=target.pathname+target.search+target.hash;}}
syncLanguageLink();window.addEventListener('hashchange',syncLanguageLink);

const menu = document.querySelector('.menu-button');
const nav = document.querySelector('#navigation');
const motionPreference=matchMedia('(prefers-reduced-motion:reduce)');
const feedbackAnimations=new Map();
function revealFeedback(element,duration,travel=0,keyboard=false){
 feedbackAnimations.get(element)?.cancel();
 if(keyboard||!element.animate)return;
 const reduced=motionPreference.matches;
 const frames=reduced||!travel?[{opacity:0},{opacity:1}]:[{opacity:0,transform:`translateY(${travel}px)`},{opacity:1,transform:'translateY(0)'}];
 const animation=element.animate(frames,{duration:reduced?100:duration,easing:'cubic-bezier(.23,1,.32,1)'});
 feedbackAnimations.set(element,animation);
 animation.finished.catch(()=>{}).finally(()=>{if(feedbackAnimations.get(element)===animation)feedbackAnimations.delete(element);});
}
motionPreference.addEventListener('change',()=>{for(const animation of feedbackAnimations.values())animation.cancel();feedbackAnimations.clear();});
function syncMenuAccess(){if(nav)nav.inert=matchMedia('(max-width:760px)').matches&&!nav.classList.contains('open');}

function closeMenu(restoreFocus=false){
 if(!menu||!nav)return;
 const wasOpen=menu.getAttribute('aria-expanded')==='true';
 menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label',copy("Open navigation","打开导航"));
 menu.querySelector('span').textContent='＋';nav.classList.remove('open');syncMenuAccess();
 if(wasOpen&&restoreFocus)menu.focus({preventScroll:true});
}
if(menu&&nav){
 menu.addEventListener('click',()=>{
  const opened=menu.getAttribute('aria-expanded')!=='true';
  menu.setAttribute('aria-expanded',String(opened));menu.setAttribute('aria-label',opened?copy("Close navigation","关闭导航"):copy("Open navigation","打开导航"));
  menu.querySelector('span').textContent=opened?'−':'＋';nav.classList.toggle('open',opened);syncMenuAccess();
 });
 nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>closeMenu()));
 document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu(true);});
 document.addEventListener('pointerdown',e=>{if(!e.target.closest('.site-header'))closeMenu();});
 document.addEventListener('focusin',e=>{if(!e.target.closest('.site-header'))closeMenu();});
 matchMedia('(min-width:761px)').addEventListener('change',()=>closeMenu());
}
syncMenuAccess();
// Track input modality so keyboard actions never inherit decorative motion.
document.addEventListener('keydown',()=>document.documentElement.classList.add('keyboard-input'),{capture:true});
document.addEventListener('pointerdown',()=>document.documentElement.classList.remove('keyboard-input'),{capture:true});
const form=document.querySelector('.intake-form');
if(form){
 const kind=form.dataset.formKind;
 let requestId=crypto.randomUUID();
 const feedback=form.querySelector('.form-feedback');
 const teamSize=form.querySelector('[name="team_size"]');
 if(teamSize){teamSize.min='1';teamSize.max='100';teamSize.step='1';}
 const scope=form.querySelector('[name="scope"]');
 if(scope&&new URLSearchParams(location.search).get('scope')==='season')scope.value='上海首季合作';
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!form.reportValidity())return;
  const keyboardSubmission=document.documentElement.classList.contains('keyboard-input');
  const button=form.querySelector('[type="submit"]');
  if(button.disabled)return;
  const data=Object.fromEntries(new FormData(form));
  data.kind=kind;data.consent=form.querySelector('[name="consent"]').checked;data.request_id=requestId;
  feedback.textContent=copy("Sending…","正在保存，请稍候…");feedback.dataset.state='pending';button.disabled=true;form.setAttribute('aria-busy','true');button.classList.add('is-pending');revealFeedback(feedback,140,0,keyboardSubmission);
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),15000);
  try{
   const response=await fetch('/api/submissions',{method:'POST',headers:{'Content-Type':'application/json','X-AIDOL-Request':'intake'},body:JSON.stringify(data),signal:controller.signal});
   const result=await response.json().catch(()=>({error:copy("The service is unavailable right now. Please try again.","服务暂时无法使用，请稍后重试。")}));
   if(!response.ok)throw new Error((english?englishServerError(result.error):result.error)||copy("We couldn’t send this. Please try again.","提交失败，请稍后重试。"));
   form.hidden=true;document.querySelector('.form-heading').hidden=true;
   const success=document.querySelector('.success-panel');success.hidden=false;success.querySelector('.submission-reference').textContent=copy("Reference: ","提交编号：")+result.reference;success.focus();revealFeedback(success,220,8,keyboardSubmission);
  }catch(error){feedback.dataset.state='error';feedback.textContent=error.name==='AbortError'?copy("We haven’t received confirmation yet. Keep this page open and try again; your submission won’t be duplicated.","暂未收到保存结果。请保留当前页面并重试，同一次提交不会重复保存。"):(error instanceof TypeError?copy("We can’t connect right now. Keep your details here and try again shortly.","暂时无法连接服务，请保留填写内容，稍后重试。"):error.message);revealFeedback(feedback,140,0,keyboardSubmission);}
  finally{clearTimeout(timeout);button.disabled=false;form.removeAttribute('aria-busy');button.classList.remove('is-pending');}
 });
}

// A single compositor-animated lens; no animated layout dimensions.
if(nav){
 const desktop=matchMedia('(min-width:761px)');
 const finePointer=matchMedia('(hover:hover) and (pointer:fine)');
 const reduced=matchMedia('(prefers-reduced-motion:reduce)');
 const links=[...nav.querySelectorAll('a')];
 const lens=document.createElement('span');lens.className='nav-glass';lens.setAttribute('aria-hidden','true');nav.prepend(lens);
 let hovered=null;
 function activeLink(){return links.find(a=>a.hasAttribute('aria-current'));}
 function place(link,instant=false){
  if(!desktop.matches||!link){lens.classList.remove('is-visible');return;}
  const box=link.getBoundingClientRect(),base=nav.getBoundingClientRect();
  lens.classList.toggle('is-instant',instant||reduced.matches);
  lens.style.transform=`translate3d(${box.left-base.left-nav.clientLeft}px,${box.top-base.top-nav.clientTop}px,0) scale(${box.width/100},${box.height/44})`;
  lens.classList.add('is-visible');
 }
 function restore(instant=false){place(links.find(a=>a===document.activeElement)||hovered||activeLink(),instant);}
 function syncCurrent(){
  const pathname=location.pathname.replace(/^\/zh(?=\/)/,'').replace(/^\/$/,'/index.html');
  const hash=location.hash;
  links.forEach(a=>{
   const url=new URL(a.href);url.pathname=url.pathname.replace(/^\/zh(?=\/)/,'');let current=false;
   if(pathname==='/index.html')current=url.pathname===pathname&&url.hash===(['#idols','#community'].includes(hash)?hash:'#about');
   else current=url.pathname===pathname;
   if(current)a.setAttribute('aria-current',url.hash?'location':'page');else a.removeAttribute('aria-current');
  });
  restore(true);
 }
 links.forEach(link=>{
  link.addEventListener('pointerenter',e=>{if(e.pointerType==='touch'||!finePointer.matches)return;hovered=link;place(link);});
  link.addEventListener('focus',()=>place(link,true));
 });
 nav.addEventListener('pointerleave',()=>{hovered=null;restore();});
 nav.addEventListener('focusout',()=>requestAnimationFrame(()=>restore(true)));
 window.addEventListener('hashchange',syncCurrent);
 window.addEventListener('resize',()=>{hovered=null;restore(true);});
 reduced.addEventListener('change',()=>restore(true));
 document.fonts.ready.then(syncCurrent);syncCurrent();
}

function englishServerError(message){const messages={"请从本站页面提交。": "Please send this form from the embuddies website.", "提交较频繁，请稍后再试。": "Too many submissions. Please try again later.", "提交未通过校验。": "We couldn’t verify this submission. Please try again.", "请选择登记类型并同意联系授权。": "Please agree to let us save your details and contact you.", "部分字段格式不正确或超出长度，请检查。": "Please check your entries. A field is invalid or too long.", "请填写称呼和联系方式。": "Please add your name and contact details.", "请填写可用于联系的邮箱、手机号或微信号。": "Please enter an email, phone number or WeChat ID we can reach you on.", "请选择参与身份。": "Please choose whether you’re joining solo or as a team.", "团队人数须为 1–100 的整数。": "Team size must be a whole number from 1 to 100.", "请选择项目进度。": "Please choose a project stage.", "请填写机构名称。": "Please add your organization.", "请选择合作类型。": "Please choose a partnership type.", "请选择合作范围。": "Please choose where you’d like to get involved.", "提交格式不正确，请刷新后重试。": "Please refresh the page and try again.", "该次登记内容已保存。如需修改，请在后续联系中提出。": "This introduction has already been saved. You can request changes when we get in touch."};return messages[message]||"We couldn’t save this. Please check your details and try again.";}

/* Luma-inspired source-derived life dot field, 2026-10-12. */
(()=>{'use strict';
const canvas=document.createElement('canvas');canvas.className='embuddies-dot-field';canvas.setAttribute('aria-hidden','true');document.body.prepend(canvas);
const ctx=canvas.getContext('2d');if(!ctx)return;
const patterns=[[[0,1],[1,2],[2,0],[2,1],[2,2]],[[0,1],[0,4],[1,0],[2,0],[2,4],[3,0],[3,1],[3,2],[3,3]],[[0,1],[0,2],[1,0],[1,1],[2,1]],[[0,1],[1,3],[2,0],[2,1],[2,4],[2,5],[2,6]],[[0,6],[1,0],[1,1],[2,1],[2,5],[2,6],[2,7]],[[0,0],[0,1],[0,2],[1,0],[1,2],[2,0],[2,2]],[[0,0],[0,1],[0,2],[2,1],[3,1]],[[0,0],[0,1],[0,2],[0,3],[0,4],[0,5],[0,6],[0,7],[0,8],[0,9]],[[0,0],[1,0],[1,2],[2,0],[2,1],[3,0]],[[0,0],[0,2],[0,3],[1,0],[1,1],[1,2],[2,1]],[[0,2],[0,3],[1,1],[1,4],[2,0],[2,5],[3,0],[3,5],[4,1],[4,4],[5,2],[5,3]],[[0,1],[0,2],[1,0],[1,3],[2,1],[2,3],[3,2]],[[0,0],[0,1],[1,0],[2,3],[3,2],[3,3]],[[0,1],[1,2],[1,3],[2,0],[2,1],[3,2]]];
const palette=['ab46dd','f31a7c','f8712b','eaab26'].map(s=>[0,2,4].map(i=>parseInt(s.slice(i,i+2),16)));
let rows,cols,cells,next,colors,w,h,dpr,frame=0,last=0,steps=0;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const make=n=>({alive:new Uint8Array(n),age:new Uint8Array(n),dying:new Uint8Array(n)});
function seed(count){for(let k=0;k<count;k++){const p=patterns[Math.floor(Math.random()*patterns.length)],r=Math.floor(Math.random()*rows),c=Math.floor(Math.random()*cols);for(const [dr,dc]of p){const i=((r+dr)%rows)*cols+(c+dc)%cols;cells.alive[i]=1;cells.age[i]=0;cells.dying[i]=0;}}}
function step(){for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const i=r*cols+c;let neighbors=0;for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++)if(dr||dc)neighbors+=cells.alive[((r+dr+rows)%rows)*cols+(c+dc+cols)%cols];const alive=(cells.alive[i]&&neighbors===2)||neighbors===3;next.alive[i]=alive?1:0;next.age[i]=alive?(cells.alive[i]?Math.min(cells.age[i]+1,3):0):0;next.dying[i]=alive?0:cells.alive[i]?6:Math.max(0,cells.dying[i]-1);}const tmp=cells;cells=next;next=tmp;steps++;if(steps%60===0)seed(Math.max(2,Math.floor(rows*cols/3000)));}
function draw(){ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);const ox=w%8/2,oy=h%8/2;for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){let i=r*cols+c,radius=1.1,alpha=.05,color='rgb(0,0,0)';if(cells.alive[i]){const bright=cells.age[i]<3;radius+=bright?.6:.2;alpha=bright?.42:.28;color=colors[c];}else if(cells.dying[i]){const f=cells.dying[i]/6;alpha=.1*f;radius*=.8+.2*f;color=colors[c];}ctx.globalAlpha=alpha;ctx.fillStyle=color;ctx.beginPath();ctx.arc(ox+c*8+4,oy+r*8+4,radius,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;}
function resize(){w=innerWidth;h=innerHeight;dpr=Math.min(devicePixelRatio||1,2);canvas.width=w*dpr;canvas.height=h*dpr;canvas.style.width=w+'px';canvas.style.height=h+'px';cols=Math.ceil(w/8)+1;rows=Math.ceil(h/8)+1;cells=make(rows*cols);next=make(rows*cols);seed(Math.max(12,Math.floor(rows*cols/400)));for(let i=0;i<cells.alive.length;i++)if(!cells.alive[i]&&Math.random()<.03)cells.alive[i]=1;colors=Array.from({length:cols},(_,i)=>{let n=i/(cols-1)*3,j=Math.min(Math.floor(n),2),f=n-j;return 'rgb('+palette[j].map((v,k)=>{let x=v+(palette[j+1][k]-v)*f;return Math.round(x+(255-x)*.4)}).join(',')+')'});steps=0;draw();}
function loop(t){if(t-last>=160){last=t;step();draw();}frame=requestAnimationFrame(loop);}
function resume(){cancelAnimationFrame(frame);if(!document.hidden&&!reduced.matches)frame=requestAnimationFrame(loop);}
resize();resume();window.addEventListener('resize',resize,{passive:true});document.addEventListener('visibilitychange',resume);reduced.addEventListener('change',resume);
})();

document.querySelectorAll('.activity-section').forEach(section=>{const track=section.querySelector('.activity-track'),buttons=section.querySelectorAll('[data-activity-step]');const update=()=>buttons.forEach(b=>b.disabled=Number(b.dataset.activityStep)<0?track.scrollLeft<2:track.scrollLeft+track.clientWidth>=track.scrollWidth-2);buttons.forEach(b=>b.addEventListener('click',()=>track.scrollBy({left:Number(b.dataset.activityStep)*(track.querySelector('.activity-card').offsetWidth+26),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})));track.addEventListener('scroll',update,{passive:true});window.addEventListener('resize',update);update();});
/* Compact team list: one revealed portrait, pointer and keyboard support. */
document.querySelectorAll('.team-editorial .team-portraits').forEach(list=>{const rows=[...list.querySelectorAll('figure')];const activate=row=>rows.forEach(r=>r.classList.toggle('is-active',r===row));rows.forEach(row=>{row.tabIndex=0;row.addEventListener('pointerenter',()=>activate(row));row.addEventListener('focus',()=>activate(row));row.addEventListener('click',()=>activate(row));});if(rows.length)activate(rows[0]);});
