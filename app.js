const GIST_ID     = '19f651ea4521a63cebb47ff00b24afe1';
const GIST_TOKEN  = '';
const GIST_FILE   = 'clonal_review_data.json';
const DEFAULT_PWD = 'clonal2024';
const ADMIN_PWD   = 'admin2024';
const API_URLS    = {
  deepseek: 'https://api.deepseek.com/v1/chat/completions',
  openai:   'https://api.openai.com/v1/chat/completions'
};

const S = {
  user: {email:'', name:'', isAdmin:false},
  papers: [], allDecisions: {}, reviewers: [],
  criteria: {inclusion:'', exclusion:''},
  aiCfg: {provider:'deepseek', apiKey:'', baseURL:'', model:'deepseek-chat'},
  gistCfg: {id:'', token:''},
  filter:'all', search:'', page:1, totalPages:1, confType:'high',
  selected: new Set(), did: null,
  totalStats: {total:0, high:0, medium:0}
};

const getPwd  = () => localStorage.getItem('cr_pwd')  || DEFAULT_PWD;
const getAdminPwd = () => localStorage.getItem('cr_apwd') || ADMIN_PWD;

/* ── GIST SYNC ── */
async function gistRead() {
  const id = S.gistCfg.id || GIST_ID;
  if (!id) return null;
  setSS('yellow','同步中…');
  let isTimeout = false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => { isTimeout=true; controller.abort(); }, 15000);
    const r = await fetch('https://api.github.com/gists/'+id, {
      headers: {'Cache-Control':'no-cache'},
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!r.ok) throw new Error('HTTP '+r.status);
    const d = await r.json(), f = d.files[GIST_FILE];
    if (!f) return {};
    setSS('green','已同步 '+new Date().toLocaleTimeString());
    return JSON.parse(f.content||'{}');
  } catch(e) {
    if (isTimeout || e.name==='AbortError') setSS('yellow','⚠️ 网络超时（离线模式）');
    else if (e.message.includes('404'))     setSS('red','❌ Gist不存在');
    else                                    setSS('yellow','⚠️ GitHub不可达（离线模式）');
    return null;
  }
}

async function gistWrite(data) {
  const id  = S.gistCfg.id    || GIST_ID;
  const tok = S.gistCfg.token || GIST_TOKEN;
  if (!id)  { setSS('yellow','数据已本地保存（未配置Gist ID）'); return false; }
  if (!tok) { setSS('yellow','数据已本地保存（请在设置中配置 GitHub Token）'); return false; }
  setSS('yellow','云端保存中…');
  let isTimeout = false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => { isTimeout=true; controller.abort(); }, 12000);
    const r = await fetch('https://api.github.com/gists/'+id, {
      method: 'PATCH',
      headers: {'Authorization':'token '+tok, 'Content-Type':'application/json'},
      body:    JSON.stringify({files:{[GIST_FILE]:{content:JSON.stringify(data,null,2)}}}),
      signal:  controller.signal
    });
    clearTimeout(timer);
    if (!r.ok) throw new Error('HTTP '+r.status);
    setSS('green','✅ 已同步至云端 '+new Date().toLocaleTimeString());
    return true;
  } catch(e) {
    if (isTimeout || e.name==='AbortError') setSS('yellow','⚠️ 网络超时，数据已本地保存');
    else if (e.message.includes('401'))     setSS('red','❌ Token无效，请在设置中更新');
    else                                    setSS('yellow','⚠️ 云端保存失败，数据已本地保存');
    return false;
  }
}

function setSS(c,t) {
  document.getElementById('sdot').className='sdot '+c;
  document.getElementById('slabel').textContent=t;
}

function mergeD(local, remote) {
  const m = {...remote};
  for (const [pid, rd] of Object.entries(local)) {
    if (!m[pid]) m[pid]={};
    for (const [rev, dec] of Object.entries(rd)) {
      if (!m[pid][rev] || dec.time>(m[pid][rev].time||0)) m[pid][rev]=dec;
    }
  }
  return m;
}

function mergeR(local, remote) {
  const map={};
  [...(remote||[]),...(local||[])].forEach(r=>{map[r.email]=r;});
  return Object.values(map);
}

async function syncPull() {
  const rem = await gistRead();
  if (!rem) return;
  if (rem.decisions)   S.allDecisions = mergeD(S.allDecisions, rem.decisions);
  if (rem.reviewers)   S.reviewers    = mergeR(S.reviewers, rem.reviewers);
  if (rem.criteria)    S.criteria     = rem.criteria;
  if (rem.adminConfig) applyAdminConfig(rem.adminConfig);
  saveLocal(); renderPapers(); refreshNC(); updateStatsIfActive();
}

function applyAdminConfig(cfg) {
  if (!cfg) return;
  if (cfg.aiCfg && cfg.aiCfg.apiKey) {
    S.aiCfg = { ...S.aiCfg, ...cfg.aiCfg };
    localStorage.setItem('cr_ai', JSON.stringify(S.aiCfg));
  }
}

async function syncPush() {
  const data = {decisions:S.allDecisions, reviewers:S.reviewers, criteria:S.criteria, updatedBy:S.user.email, updatedAt:new Date().toISOString()};
  if (S.user.isAdmin && S.aiCfg.apiKey) {
    data.adminConfig = { aiCfg: S.aiCfg };
  }
  return gistWrite(data);
}

function saveLocal() {
  localStorage.setItem('cr_d', JSON.stringify(S.allDecisions));
  localStorage.setItem('cr_r', JSON.stringify(S.reviewers));
  localStorage.setItem('cr_c', JSON.stringify(S.criteria));
}

function loadLocal() {
  try {
    const d=localStorage.getItem('cr_d'); if(d) S.allDecisions=JSON.parse(d);
    const r=localStorage.getItem('cr_r'); if(r) S.reviewers=JSON.parse(r);
    const c=localStorage.getItem('cr_c'); if(c) S.criteria=JSON.parse(c);
    const ai=localStorage.getItem('cr_ai'); if(ai) S.aiCfg=JSON.parse(ai);
    const g=localStorage.getItem('cr_g'); if(g) S.gistCfg=JSON.parse(g);
  } catch(e) {}
}

/* ── LOGIN ── */
document.getElementById('login-btn').onclick = async () => {
  const email = document.getElementById('l-email').value.trim().toLowerCase();
  const name  = document.getElementById('l-name').value.trim();
  const pwd   = document.getElementById('l-pwd').value;
  const errEl = document.getElementById('lerr');
  errEl.style.display='none';
  if (!email||!email.includes('@')) { errEl.textContent='请输入有效邮箱'; errEl.style.display='block'; return; }
  if (!name)  { errEl.textContent='请输入姓名'; errEl.style.display='block'; return; }
  const isAdmin = pwd === getAdminPwd();
  if (pwd !== getPwd() && !isAdmin) { errEl.textContent='密码错误'; errEl.style.display='block'; return; }
  const btn=document.getElementById('login-btn');
  btn.disabled=true; btn.textContent='连接中…';
  document.getElementById('lsync').textContent='正在加载共享数据…';
  S.user={email, name, isAdmin};
  loadLocal();
  const rem=await gistRead();
  if (rem) {
    if (rem.decisions)   S.allDecisions=mergeD(S.allDecisions,rem.decisions);
    if (rem.reviewers)   S.reviewers=mergeR(S.reviewers,rem.reviewers);
    if (rem.criteria)    S.criteria=rem.criteria;
    if (rem.adminConfig) applyAdminConfig(rem.adminConfig);
    saveLocal();
  }
  if (!S.reviewers.find(r=>r.email===email)) {
    S.reviewers.push({email,name,joinedAt:new Date().toISOString()});
    saveLocal(); syncPush();
  }
  document.getElementById('sb-name').textContent=name;
  document.getElementById('sb-email').textContent=email;
  document.getElementById('login-screen').style.display='none';
  document.getElementById('app').style.display='block';
  btn.disabled=false; btn.textContent='进入评审系统';
  await loadStats();
  await loadPapers(1,'high');
  refreshNC(); renderSettingsUI();
  setInterval(syncPull,30000);
};
document.getElementById('l-pwd').onkeydown=e=>{if(e.key==='Enter')document.getElementById('login-btn').click();};
document.getElementById('logout-btn').onclick=()=>{
  document.getElementById('app').style.display='none';
  document.getElementById('login-screen').style.display='flex';
  document.getElementById('l-pwd').value='';
};
document.getElementById('sync-btn').onclick=async()=>{await syncPull();toast('同步完成','success');};

/* ── DATA LOADING ── */
async function loadStats() {
  try { const r=await fetch('data/stats.json'); S.totalStats=await r.json(); } catch(e) {}
}

async function loadPapers(pg, type) {
  if (type) S.confType=type;
  document.getElementById('plist').innerHTML='<div class="empty"><div class="ei"><span class="spin"></span></div><p style="margin-top:8px;font-size:12px">加载文献中…</p></div>';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const r = await fetch('data/'+S.confType+'_'+pg+'.json', {signal:controller.signal});
    clearTimeout(timer);
    if (!r.ok) throw new Error('HTTP '+r.status);
    const d=await r.json();
    S.page=pg; S.totalPages=d.total_pages; S.papers=d.papers;
    renderPapers(); updatePager();
  } catch(e) {
    const msg = e.name==='AbortError' ? '加载超时，请检查网络连接' : ('加载失败: '+e.message);
    document.getElementById('plist').innerHTML='<div class="empty"><div class="ei">⚠️</div><p>'+msg+'</p><p style="margin-top:8px;font-size:11px;color:#9ca3af">请刷新页面重试</p></div>';
  }
}

/* ── DECISIONS ── */
function myDec(pid) { return (S.allDecisions[pid]||{})[S.user.email]||null; }

function decide(pid, decision) {
  if (!pid) return;
  if (!S.allDecisions[pid]) S.allDecisions[pid]={};
  const prev=S.allDecisions[pid][S.user.email];
  if (prev && prev.decision===decision) delete S.allDecisions[pid][S.user.email];
  else S.allDecisions[pid][S.user.email]={decision, note:prev?.note||'', aiResult:prev?.aiResult||'', time:Date.now(), name:S.user.name};
  saveLocal(); renderPapers(); refreshNC(); updateStatsIfActive(); syncPush();
  toast({included:'✅ 已纳入',excluded:'❌ 已排除',maybe:'❓ 已标记待定'}[decision]||'决策已撤销','success');
}

function bulk(decision) {
  S.selected.forEach(pid=>{
    if (!S.allDecisions[pid]) S.allDecisions[pid]={};
    const prev=S.allDecisions[pid][S.user.email];
    S.allDecisions[pid][S.user.email]={decision, note:prev?.note||'', aiResult:prev?.aiResult||'', time:Date.now(), name:S.user.name};
  });
  const n=S.selected.size; S.selected.clear();
  document.getElementById('brow').style.display='none';
  saveLocal(); renderPapers(); refreshNC(); syncPush();
  toast('已对 '+n+' 篇执行批量操作','success');
}

function hasConflict(pid) {
  const d=S.allDecisions[pid]; if(!d) return false;
  const v=Object.values(d).map(x=>x.decision);
  return v.length>=2 && new Set(v).size>1;
}

/* ── FILTER + RENDER ── */
function getFiltered() {
  return S.papers.filter(p=>{
    const dec=myDec(p.id);
    const s=S.search.toLowerCase();
    if (s && !((p.title||'')+' '+(p.authors||'')+' '+(p.journal||'')+' '+(p.wos_id||'')).toLowerCase().includes(s)) return false;
    const f=S.filter;
    if (f==='all')      return true;
    if (f==='high'||f==='medium') return S.confType===f;
    if (f==='included') return dec?.decision==='included';
    if (f==='excluded') return dec?.decision==='excluded';
    if (f==='maybe')    return dec?.decision==='maybe';
    if (f==='pending')  return !dec;
    if (f==='conflict') return hasConflict(p.id);
    if (f==='ai')       return !!dec?.aiResult;
    return true;
  });
}

function renderPapers() {
  const ps=getFiltered();
  document.getElementById('linfo').textContent=ps.length+' 篇';
  document.getElementById('fcnt').textContent=ps.length+' 篇';
  if (!ps.length) {
    document.getElementById('plist').innerHTML='<div class="empty"><div class="ei">🔍</div><p>没有符合条件的文献</p></div>';
    return;
  }
  document.getElementById('plist').innerHTML=ps.map(renderCard).join('');
  bindEv();
}

function renderCard(p) {
  const dec=myDec(p.id), d=dec?.decision||'pending', sel=S.selected.has(p.id);
  const others=Object.entries(S.allDecisions[p.id]||{}).filter(([e])=>e!==S.user.email);
  const dm={included:'✅ 纳入',excluded:'❌ 排除',maybe:'❓ 待定',pending:'— 待决策'};
  const otags=others.map(([e,od])=>{const i=od.decision==='included'?'✅':od.decision==='excluded'?'❌':'❓'; return '<span class="mr">'+i+' '+(od.name||e.split('@')[0])+'</span>';}).join('');
  const cfTag=hasConflict(p.id)?'<span class="mcf">⚡冲突</span>':'';
  const aiTag=dec?.aiResult?'<span class="mai">🤖AI</span>':'';
  const wosTag=p.wos_id?'<span class="mwos">'+p.wos_id+'</span>':'';
  const doiTag=p.doi?'<a class="mdoi" href="https://doi.org/'+p.doi+'" target="_blank" onclick="event.stopPropagation()">↗ '+p.doi+'</a>':'';
  const noteH=dec?.note?'<div class="cnote">📝 '+dec.note+'</div>':'';
  const aiH=dec?.aiResult?'<div class="cai">'+dec.aiResult+'</div>':'';
  const absId='abs-'+p.id;
  const hasLong=(p.abstract||'').length>200;
  const absHtml='<div class="cabstract-wrap"><div class="cabstract collapsed" id="'+absId+'">'+(p.abstract||'无摘要')+'</div>'+(hasLong?'<span class="toggle-abs" onclick="toggleAbs(event,\''+absId+'\')">展开 ▼</span>':'')+'</div>';
  return '<div class="card'+(sel?' sel':'')+'">'
    +'<div class="ccb"><input type="checkbox"'+(sel?' checked':'')+' class="ccbx" data-id="'+p.id+'" onclick="toggleSel(event,\''+p.id+'\')"></div>'
    +'<div class="cbody">'
      +'<div class="ctr"><div class="ctitle" onclick="openDp(\''+p.id+'\')">'+(p.title||'(无标题)')+'</div>'
      +'<span class="dbadge '+d+'">'+dm[d]+'</span></div>'
      +'<div class="cmeta"><span class="mj">'+(p.journal||'未知期刊')+'</span><span class="my">'+(p.year||'—')+'</span>'
      +'<span class="ms">'+(p.score||0)+'分</span>'+otags+cfTag+aiTag+wosTag+doiTag+'</div>'
      +absHtml+noteH+aiH
      +'<div class="cact">'
        +'<button class="db dbi'+(d==='included'?' active':'')+'" data-act="included" data-id="'+p.id+'">✅ 纳入</button>'
        +'<button class="db dbm'+(d==='maybe'?' active':'')+'" data-act="maybe" data-id="'+p.id+'">❓ 待定</button>'
        +'<button class="db dbx'+(d==='excluded'?' active':'')+'" data-act="excluded" data-id="'+p.id+'">❌ 排除</button>'
        +'<button class="db dba" data-ai="'+p.id+'">🤖 AI</button>'
      +'</div>'
    +'</div></div>';
}

function toggleAbs(e, id) {
  e.stopPropagation();
  const el=document.getElementById(id), btn=e.target;
  if (el.classList.contains('collapsed')) {
    el.classList.remove('collapsed'); btn.textContent='收起 ▲';
  } else {
    el.classList.add('collapsed'); btn.textContent='展开 ▼';
  }
}

function bindEv() {
  document.querySelectorAll('[data-act]').forEach(b=>b.onclick=e=>{e.stopPropagation();decide(b.dataset.id,b.dataset.act);});
  document.querySelectorAll('[data-ai]').forEach(b=>b.onclick=e=>{e.stopPropagation();aiOne(b.dataset.ai,'card');});
  document.querySelectorAll('.ccbx').forEach(c=>c.onclick=e=>e.stopPropagation());
}

function toggleSel(e,id) {
  if (S.selected.has(id)) S.selected.delete(id); else S.selected.add(id);
  document.getElementById('brow').style.display=S.selected.size>0?'flex':'none';
}

document.getElementById('sel-all').onchange=function(){
  getFiltered().forEach(p=>this.checked?S.selected.add(p.id):S.selected.delete(p.id));
  document.getElementById('brow').style.display=S.selected.size>0?'flex':'none';
  renderPapers();
};

/* ── PAGER ── */
function updatePager() {
  document.getElementById('pgri').textContent='第 '+S.page+' / '+S.totalPages+' 页';
  document.getElementById('prev-btn').disabled=S.page<=1;
  document.getElementById('next-btn').disabled=S.page>=S.totalPages;
}
document.getElementById('prev-btn').onclick=()=>loadPapers(S.page-1);
document.getElementById('next-btn').onclick=()=>loadPapers(S.page+1);

/* ── NAV ── */
document.querySelectorAll('.ni[data-pg]').forEach(item=>{
  item.onclick=()=>{
    document.querySelectorAll('.ni').forEach(i=>i.classList.remove('active'));
    item.classList.add('active');
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    document.getElementById('page-'+item.dataset.pg).classList.add('active');
    document.getElementById('tb-title').textContent=item.textContent.trim().replace(/\d+$/,'').trim();
    closeMob();
    const pg=item.dataset.pg;
    if (pg==='stats')     renderStats();
    if (pg==='included')  renderDL('inc-list','included');
    if (pg==='excluded')  renderDL('exc-list','excluded');
    if (pg==='maybe')     renderDL('mb-list','maybe');
    if (pg==='conflicts') renderCF();
  };
});

function renderDL(cid, dec) {
  const entries=[];
  for (const [pid,rd] of Object.entries(S.allDecisions)) {
    const md=rd[S.user.email];
    if (md?.decision===dec) {
      const p=S.papers.find(x=>x.id===pid)||{id:pid,title:'文献 #'+pid,journal:'',year:'',score:0,abstract:'',wos_id:'',doi:''};
      entries.push(p);
    }
  }
  const icons={included:'📭',excluded:'🗑️',maybe:'❓'}, labels={included:'纳入',excluded:'排除',maybe:'待定'};
  if (!entries.length) {
    document.getElementById(cid).innerHTML='<div class="empty"><div class="ei">'+icons[dec]+'</div><p>暂无'+labels[dec]+'文献</p></div>';
    return;
  }
  document.getElementById(cid).innerHTML='<p style="font-size:12px;color:#9ca3af;padding:10px 0">'+entries.length+' 篇</p>'+entries.map(renderCard).join('');
  bindEv();
}

function refreshNC() {
  let inc=0,exc=0,mb=0,cf=0;
  const tot=S.totalStats.total||0;
  for (const [pid,rd] of Object.entries(S.allDecisions)) {
    const md=rd[S.user.email]; if(!md) continue;
    if (md.decision==='included') inc++; else if (md.decision==='excluded') exc++; else if (md.decision==='maybe') mb++;
    if (hasConflict(pid)) cf++;
  }
  document.getElementById('nb-total').textContent=tot;
  document.getElementById('nb-inc').textContent=inc;
  document.getElementById('nb-exc').textContent=exc;
  document.getElementById('nb-mb').textContent=mb;
  document.getElementById('nb-cf').textContent=cf;
}

/* ── FILTER BAR ── */
document.querySelectorAll('.fc').forEach(c=>{
  c.onclick=()=>{
    document.querySelectorAll('.fc').forEach(x=>x.classList.remove('active'));
    c.classList.add('active'); S.filter=c.dataset.f;
    if (S.filter==='medium'&&S.confType!=='medium')      loadPapers(1,'medium');
    else if (S.filter==='high'&&S.confType!=='high')     loadPapers(1,'high');
    else if (S.filter==='all'&&S.confType!=='all')       loadPapers(1,'all');
    else renderPapers();
  };
});
document.getElementById('srch').oninput=function(){S.search=this.value;renderPapers();};

/* ── DETAIL PANEL ── */
function openDp(pid) {
  const p=S.papers.find(x=>x.id===pid); if(!p) return;
  S.did=pid;
  document.getElementById('dp-title').textContent=p.title;
  const dec=myDec(pid);
  document.getElementById('dp-note').value=dec?.note||'';
  const air=document.getElementById('dp-air');
  air.textContent=dec?.aiResult||'点击下方按钮让 AI 分析此文献';
  air.style.color=dec?.aiResult?'#4338ca':'#9ca3af';
  air.style.fontStyle=dec?.aiResult?'normal':'italic';
  const others=Object.entries(S.allDecisions[pid]||{}).filter(([e])=>e!==S.user.email);
  const oth=others.length
    ? others.map(([e,od])=>{const i=od.decision==='included'?'✅':od.decision==='excluded'?'❌':'❓'; return '<span class="mr" style="margin-right:5px">'+i+' '+(od.name||e)+': '+od.decision+(od.note?' — '+od.note:'')+'</span>';}).join('')
    : '<span style="color:#9ca3af">暂无其他评审员意见</span>';
  document.getElementById('dp-fields').innerHTML=
    '<div class="dpf"><div class="dpl">作者</div><div class="dpv">'+(p.authors||'未知')+'</div></div>'+
    '<div class="dpf"><div class="dpl">期刊</div><div class="dpv">'+(p.journal||'未知')+'</div></div>'+
    '<div class="dpf"><div class="dpl">年份</div><div class="dpv">'+(p.year||'未知')+'</div></div>'+
    '<div class="dpf"><div class="dpl">DOI</div><div class="dpv">'+(p.doi?'<a href="https://doi.org/'+p.doi+'" target="_blank">'+p.doi+'</a>':'无')+'</div></div>'+
    '<div class="dpf"><div class="dpl">WOS ID</div><div class="dpv" style="font-family:monospace;font-size:12px">'+(p.wos_id||'—')+'</div></div>'+
    '<div class="dpf"><div class="dpl">关键词评分</div><div class="dpv">'+(p.score||0)+'</div></div>'+
    '<div class="dpf"><div class="dpl">摘要（全文）</div><div class="dp-abs">'+(p.abstract||'无')+'</div></div>'+
    (p.keywords?'<div class="dpf"><div class="dpl">关键词</div><div class="dp-kw">'+p.keywords+'</div></div>':'')+
    '<div class="dpf"><div class="dpl">其他评审员意见</div><div class="dpv">'+oth+'</div></div>';
  document.getElementById('ovl').classList.add('show');
  document.getElementById('dp').classList.add('show');
}

function saveDpNote() {
  const id=S.did; if(!id) return;
  if (!S.allDecisions[id]) S.allDecisions[id]={};
  if (!S.allDecisions[id][S.user.email]) S.allDecisions[id][S.user.email]={decision:'pending',note:'',aiResult:'',time:Date.now(),name:S.user.name};
  S.allDecisions[id][S.user.email].note=document.getElementById('dp-note').value;
  saveLocal(); renderPapers(); syncPush(); toast('备注已保存并同步','success');
}

document.getElementById('dp-close').onclick=closeDp;
document.getElementById('ovl').onclick=closeDp;
function closeDp() {
  document.getElementById('ovl').classList.remove('show');
  document.getElementById('dp').classList.remove('show');
}

/* ── AI ── */
async function callAI(p) {
  if (!S.aiCfg.apiKey) throw new Error('请先在设置中配置 API Key');
  const url = S.aiCfg.provider==='custom' ? S.aiCfg.baseURL : (S.aiCfg.baseURL||API_URLS[S.aiCfg.provider]);
  const sys = '你是克隆植物生态学系统综述专家，负责文献筛选。\n纳入标准：'+(S.criteria.inclusion||'克隆植物自然生态学研究，2000年后发表')+'\n排除标准：'+(S.criteria.exclusion||'组织培养、细胞克隆、计算机克隆、会议摘要')+'\n返回JSON：{"decision":"included/excluded/maybe","confidence":"high/medium/low","reason":"50字内理由","keywords_found":"检测到的关键词"}';
  const r=await fetch(url,{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+S.aiCfg.apiKey},
    body:JSON.stringify({model:S.aiCfg.model,messages:[{role:'system',content:sys},{role:'user',content:'标题：'+p.title+'\n作者：'+(p.authors||'')+'\n期刊：'+(p.journal||'')+'\n摘要：'+(p.abstract||'')}],temperature:0.2,max_tokens:400})
  });
  if (!r.ok) { const e=await r.json().catch(()=>({})); throw new Error(e?.error?.message||'API '+r.status); }
  return (await r.json()).choices[0].message.content;
}

async function aiOne(pid, src) {
  const p=S.papers.find(x=>x.id===pid); if(!p) return;
  if (!S.aiCfg.apiKey) { toast('请先在⚙️设置中配置 API Key','error'); return; }
  if (src==='dp') { const e=document.getElementById('dp-air'); e.textContent='🤖 分析中…'; e.style.color='#667eea'; e.style.fontStyle='normal'; }
  else toast('AI 分析中…','info');
  try {
    const res=await callAI(p);
    if (!S.allDecisions[pid]) S.allDecisions[pid]={};
    if (!S.allDecisions[pid][S.user.email]) S.allDecisions[pid][S.user.email]={decision:'pending',note:'',aiResult:'',time:Date.now(),name:S.user.name};
    S.allDecisions[pid][S.user.email].aiResult=res;
    try {
      const parsed=JSON.parse(res.match(/\{[\s\S]*\}/)[0]);
      if (parsed.confidence==='high'&&parsed.decision) { S.allDecisions[pid][S.user.email].decision=parsed.decision; refreshNC(); }
    } catch(e) {}
    saveLocal(); syncPush(); renderPapers();
    if (src==='dp') { const e=document.getElementById('dp-air'); e.textContent=res; e.style.color='#4338ca'; e.style.fontStyle='normal'; }
    toast('AI 分析完成','success');
  } catch(e) {
    if (src==='dp') { const el=document.getElementById('dp-air'); el.textContent='分析失败: '+e.message; el.style.color='#ef4444'; }
    toast('AI 失败: '+e.message,'error');
  }
}

document.getElementById('ai-batch').onclick=async()=>{
  if (!S.aiCfg.apiKey) { toast('请先配置 API Key','error'); return; }
  const pend=getFiltered().filter(p=>!myDec(p.id)).slice(0,5);
  if (!pend.length) { toast('没有未决策文献','info'); return; }
  toast('批量分析 '+pend.length+' 篇…','info');
  let done=0;
  for (const p of pend) { try { await aiOne(p.id,'batch'); done++; } catch(e) {} }
  toast('完成 '+done+'/'+pend.length+' 篇','success');
};

/* ── STATS ── */
function updateStatsIfActive() {
  if (document.getElementById('page-stats').classList.contains('active')) renderStats();
}

function renderStats() {
  let inc=0,exc=0,mb=0;
  for (const [,rd] of Object.entries(S.allDecisions)) {
    const md=rd[S.user.email]; if(!md) continue;
    if (md.decision==='included') inc++; else if (md.decision==='excluded') exc++; else if (md.decision==='maybe') mb++;
  }
  const tot=S.totalStats.total||0, rev=inc+exc+mb;
  document.getElementById('st-tot').textContent=tot;
  document.getElementById('st-inc').textContent=inc;
  document.getElementById('st-exc').textContent=exc;
  document.getElementById('st-mb').textContent=mb;
  document.getElementById('st-pd').textContent=Math.max(0,tot-rev);
  document.getElementById('st-pg').textContent=tot?Math.round(rev/tot*100)+'%':'0%';
  document.getElementById('st-ip').textContent=rev?Math.round(inc/rev*100)+'% 纳入率':'';
  document.getElementById('rev-tb').innerHTML=S.reviewers.map(rv=>{
    let ri=0,re=0,rm=0;
    for (const [,rd] of Object.entries(S.allDecisions)) {
      const dd=rd[rv.email]; if(!dd) continue;
      if (dd.decision==='included') ri++; else if (dd.decision==='excluded') re++; else if (dd.decision==='maybe') rm++;
    }
    const rr=ri+re+rm, pct=tot?Math.round(rr/tot*100):0;
    const me=rv.email===S.user.email?' <span style="background:#f0f4ff;color:#667eea;font-size:10px;padding:1px 5px;border-radius:3px">我</span>':'';
    return '<tr><td><strong>'+(rv.name||'—')+'</strong>'+me+'</td>'
      +'<td style="color:#9ca3af;font-size:11px">'+rv.email+'</td>'
      +'<td style="color:#10b981">'+ri+'</td><td style="color:#ef4444">'+re+'</td><td style="color:#f59e0b">'+rm+'</td>'
      +'<td><div style="min-width:70px">'+pct+'%<div class="pb"><div class="pbf" style="width:'+pct+'%"></div></div></div></td></tr>';
  }).join('')||'<tr><td colspan="6" style="text-align:center;color:#9ca3af;padding:16px">暂无数据</td></tr>';
}

/* ── CONFLICTS ── */
function renderCF() {
  const cfs=[];
  for (const [pid,rd] of Object.entries(S.allDecisions)) {
    if (!hasConflict(pid)) continue;
    const p=S.papers.find(x=>x.id===pid)||{id:pid,title:'文献 #'+pid};
    cfs.push({p,rd});
  }
  const c=document.getElementById('cf-list');
  if (!cfs.length) { c.innerHTML='<div class="empty"><div class="ei">✨</div><p>暂无冲突</p></div>'; return; }
  c.innerHTML=cfs.map(({p,rd})=>{
    const tags=Object.entries(rd).map(([e,d])=>{
      const i=d.decision==='included'?'✅':d.decision==='excluded'?'❌':'❓';
      const bg=d.decision==='included'?'#d1fae5':d.decision==='excluded'?'#fee2e2':'#fef3c7';
      const co=d.decision==='included'?'#065f46':d.decision==='excluded'?'#991b1b':'#92400e';
      return '<span class="cfd" style="background:'+bg+';color:'+co+'">'+i+' '+(d.name||e.split('@')[0])+'</span>';
    }).join('');
    return '<div class="cfc"><div class="cft">'+p.title+'</div><div class="cfds">'+tags+'</div>'
      +'<div class="cfr"><span>解决：</span>'
      +'<button class="db dbi" onclick="decide(\''+p.id+'\',\'included\')">✅ 纳入</button>'
      +'<button class="db dbm" onclick="decide(\''+p.id+'\',\'maybe\')">❓ 待定</button>'
      +'<button class="db dbx" onclick="decide(\''+p.id+'\',\'excluded\')">❌ 排除</button>'
      +'</div></div>';
  }).join('');
}

/* ── EXPORT ── */
function exportData(type) {
  const esc=s=>s?'"'+String(s).replace(/"/g,'""')+'"':'';
  if (type==='prisma') {
    let inc=0,exc=0,mb=0;
    for (const [,rd] of Object.entries(S.allDecisions)) {
      const md=rd[S.user.email]; if(!md) continue;
      if (md.decision==='included') inc++; else if (md.decision==='excluded') exc++; else if (md.decision==='maybe') mb++;
    }
    const txt='PRISMA 流程数据 — ClonalReview\n生成时间: '+new Date().toLocaleString()
      +'\n评审员: '+S.user.name+' <'+S.user.email+'>'
      +'\n\n数据库检索总量: '+S.totalStats.total
      +'\nHIGH置信度: '+S.totalStats.high+'\nMEDIUM置信度: '+S.totalStats.medium
      +'\n\n本人评审结果:\n  纳入: '+inc+'\n  排除: '+exc+'\n  待定: '+mb
      +'\n  未决策: '+(S.totalStats.total-inc-exc-mb)
      +'\n\n全体评审员:\n'+S.reviewers.map(r=>' - '+r.name+' <'+r.email+'>').join('\n');
    dlf('prisma_data.txt',txt,'text/plain'); return;
  }
  const rows=[];
  for (const [pid,rd] of Object.entries(S.allDecisions)) {
    const md=rd[S.user.email]; if(!md) continue;
    if (type==='included'&&md.decision!=='included') continue;
    if (type==='excluded'&&md.decision!=='excluded') continue;
    const p=S.papers.find(x=>x.id===pid)||{id:pid,title:'#'+pid,authors:'',journal:'',year:'',doi:'',wos_id:'',score:0};
    const allr=Object.entries(rd).map(([e,d])=>(d.name||e)+':'+d.decision).join('; ');
    rows.push([p.id,esc(p.wos_id||''),esc(p.title),esc(p.authors),esc(p.journal),p.year||'',esc(p.doi||''),p.score||0,md.decision,esc(md.note||''),esc(allr)].join(','));
  }
  const hdr='ID,WOS_ID,标题,作者,期刊,年份,DOI,评分,我的决策,备注,所有评审员决策\n';
  dlf('clonal_'+type+'_'+new Date().toISOString().slice(0,10)+'.csv','\uFEFF'+hdr+rows.join('\n'),'text/csv;charset=utf-8');
  toast('已导出 '+rows.length+' 篇','success');
}
document.getElementById('exp-btn').onclick=()=>exportData('included');

function dlf(name,content,type) {
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([content],{type}));
  a.download=name; document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

/* ── SETTINGS ── */
function renderSettingsUI() {
  const gid=S.gistCfg.id||GIST_ID;
  document.getElementById('set-gid').value=gid;
  document.getElementById('set-gtk').value=S.gistCfg.token||GIST_TOKEN;
  document.getElementById('cur-gist-id').textContent=gid||'未配置';
  document.getElementById('set-prov').value=S.aiCfg.provider;
  document.getElementById('set-akey').value=S.aiCfg.apiKey;
  document.getElementById('set-abase').value=S.aiCfg.baseURL;
  document.getElementById('set-mdl').value=S.aiCfg.model;
  document.getElementById('set-inc').value=S.criteria.inclusion;
  document.getElementById('set-exc').value=S.criteria.exclusion;
  document.getElementById('cust-url').style.display=S.aiCfg.provider==='custom'?'block':'none';

  const isAdmin = S.user.isAdmin;
  document.getElementById('admin-only-gist').style.display = isAdmin ? 'block' : 'none';
  document.getElementById('admin-only-ai').style.display   = isAdmin ? 'block' : 'none';
  document.getElementById('admin-only-pwd').style.display  = isAdmin ? 'block' : 'none';
  document.getElementById('member-ai-status').style.display = isAdmin ? 'none' : 'block';
  if (!isAdmin && S.aiCfg.apiKey) {
    document.getElementById('member-ai-status').textContent = '✅ AI 已由管理员配置，可直接使用';
    document.getElementById('member-ai-status').style.color = '#10b981';
  } else if (!isAdmin) {
    document.getElementById('member-ai-status').textContent = '⏳ AI 待管理员配置，配置后自动生效';
    document.getElementById('member-ai-status').style.color = '#f59e0b';
  }
  updGistDot(); updAiDot(); renderRVM();
}

document.getElementById('set-prov').onchange=function(){
  document.getElementById('cust-url').style.display=this.value==='custom'?'block':'none';
};

document.getElementById('save-gist').onclick=async()=>{
  S.gistCfg.id=document.getElementById('set-gid').value.trim();
  S.gistCfg.token=document.getElementById('set-gtk').value.trim();
  localStorage.setItem('cr_g',JSON.stringify(S.gistCfg));
  updGistDot(); toast('配置已保存，正在测试连接（最长15秒）…','info');
  const r=await gistRead();
  if (r!==null) {
    toast('✅ 连接成功！数据已同步','success');
  } else {
    const sdotClass = document.getElementById('sdot').className;
    if (sdotClass.includes('yellow')) {
      toast('⚠️ 网络超时。配置已保存，同步将在网络恢复后自动重试','info');
    } else {
      toast('❌ 连接失败：Token或ID有误，请检查后重试','error');
    }
  }
};

document.getElementById('force-sync').onclick=async()=>{await syncPull();toast('数据已从云端同步','success');};

document.getElementById('save-ai').onclick=async ()=>{
  S.aiCfg.provider=document.getElementById('set-prov').value;
  S.aiCfg.apiKey=document.getElementById('set-akey').value.trim();
  S.aiCfg.baseURL=document.getElementById('set-abase').value.trim();
  S.aiCfg.model=document.getElementById('set-mdl').value;
  localStorage.setItem('cr_ai',JSON.stringify(S.aiCfg));
  updAiDot();
  if (S.user.isAdmin) {
    toast('AI 设置已保存，正在同步给所有成员…','info');
    await syncPush();
    toast('✅ AI 设置已同步至所有成员','success');
  } else {
    toast('AI 设置已保存','success');
  }
};

document.getElementById('save-pwd').onclick=()=>{
  const cur=document.getElementById('cur-pwd').value, nw=document.getElementById('new-pwd').value;
  const pwdType = document.getElementById('pwd-type').value;
  if (pwdType==='member') {
    if (cur!==getPwd()) { toast('当前成员密码错误','error'); return; }
    if (nw.length<6) { toast('新密码至少6位','error'); return; }
    localStorage.setItem('cr_pwd',nw); toast('成员密码已修改','success');
  } else {
    if (cur!==getAdminPwd()) { toast('当前管理员密码错误','error'); return; }
    if (nw.length<6) { toast('新密码至少6位','error'); return; }
    localStorage.setItem('cr_apwd',nw); toast('管理员密码已修改','success');
  }
  document.getElementById('cur-pwd').value=''; document.getElementById('new-pwd').value='';
};

document.getElementById('save-crit').onclick=()=>{
  S.criteria.inclusion=document.getElementById('set-inc').value;
  S.criteria.exclusion=document.getElementById('set-exc').value;
  saveLocal(); syncPush(); toast('标准已保存并同步','success');
};

function updGistDot() {
  const ok=!!(S.gistCfg.id||GIST_ID), tok=!!(S.gistCfg.token||GIST_TOKEN);
  document.getElementById('gdot').className='sdot '+(ok&&tok?'green':ok?'yellow':'');
  document.getElementById('gst-txt').textContent=ok&&tok?'已配置（读写）':ok?'已配置（只读）':'未配置';
}

function updAiDot() {
  const ok=!!S.aiCfg.apiKey;
  document.getElementById('ai-dot').className='sdot '+(ok?'green':'');
  document.getElementById('ai-st').textContent=ok?'已配置：'+S.aiCfg.provider+' / '+S.aiCfg.model:'未配置 API Key';
}

function addRev() {
  const e=document.getElementById('nre').value.trim().toLowerCase();
  const n=document.getElementById('nrn').value.trim();
  if (!e||!e.includes('@')) { toast('请输入有效邮箱','error'); return; }
  if (S.reviewers.find(r=>r.email===e)) { toast('该评审员已存在','error'); return; }
  S.reviewers.push({email:e,name:n,joinedAt:new Date().toISOString()});
  saveLocal(); syncPush(); renderRVM();
  document.getElementById('nre').value=''; document.getElementById('nrn').value='';
  toast('已添加 '+(n||e),'success');
}

function removeRev(i) {
  if (S.reviewers[i].email===S.user.email) { toast('不能移除自己','error'); return; }
  S.reviewers.splice(i,1); saveLocal(); syncPush(); renderRVM();
}

function renderRVM() {
  document.getElementById('rvm').innerHTML=S.reviewers.map((r,i)=>
    '<div class="rvi"><div class="rn">'+(r.name||'—')+'</div><div class="re">'+r.email+'</div>'
    +(r.email===S.user.email?'<span style="font-size:10px;color:#667eea">当前用户</span>':'<button class="rd" onclick="removeRev('+i+')">✕</button>')
    +'</div>'
  ).join('')||'<div style="color:#9ca3af;font-size:12px;padding:8px">暂无评审员</div>';
}

/* ── MOBILE SIDEBAR ── */
document.getElementById('mob-btn').onclick=()=>{
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('mob-ovl').classList.add('show');
};
document.getElementById('mob-ovl').onclick=closeMob;
function closeMob() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('mob-ovl').classList.remove('show');
}

/* ── TOAST ── */
function toast(msg, type='info') {
  const w=document.getElementById('twrap'), t=document.createElement('div');
  t.className='toast '+type; t.textContent=msg; w.appendChild(t);
  setTimeout(()=>{ t.style.opacity='0'; setTimeout(()=>t.remove(),300); },2500);
}

/* ── INIT ── */
loadLocal();
if (!S.gistCfg.id) {
  S.gistCfg.id = GIST_ID;
  localStorage.setItem('cr_g', JSON.stringify(S.gistCfg));
}
renderSettingsUI();
