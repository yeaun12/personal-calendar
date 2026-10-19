/* Personal calendars: the API, not this UI, redacts private titles. */
(function(){
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const kdate=t=>new Date(t).toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'});
const local=t=>{const d=new Date(new Date(t).getTime()+9*3600000);return d.toISOString().slice(0,16);};
const time=t=>local(t).slice(11);
const monthShift=(m,n)=>{const [y,mo]=m.split('-').map(Number);return new Date(Date.UTC(y,mo-1+n,1)).toISOString().slice(0,7);};
let generation=0;
function reset(){generation++;}
function mount(root,ctx){
 const gen=++generation;let month=kdate(Date.now()).slice(0,7),day=kdate(Date.now()),target=(ctx.members?.some(p=>p.user_id===ctx.initialUser)?ctx.initialUser:ctx.user.id),events=[],loading=false,saving=false,request=0;
 const alive=()=>gen===generation&&root.isConnected;
 const people=ctx.members||[{user_id:ctx.user.id,nickname:ctx.user.user_metadata?.nickname||'나'}];
 const own=()=>target===ctx.user.id;
 const sortedPeople=[...people].sort((a,b)=>a.user_id.localeCompare(b.user_id));
 const personColor=id=>`hsl(${Math.round(sortedPeople.findIndex(p=>p.user_id===id)*137.508)%360} 48% 36%)`;
 const ownerNames=e=>(e.owners||[]).map(id=>people.find(p=>p.user_id===id)?.nickname||'모임원').join(', ');
 const eventStyle=e=>target==='all'?`style="--member-color:${personColor(e.owners[0])}"`:'';
 const eventLabel=e=>target==='all'?`${ownerNames(e)} · ${title(e)}`:title(e);

 const btn=(label,action,value='',cls='')=>`<button type="button" class="${cls}" data-cal="${action}" data-value="${esc(value)}">${label}</button>`;
 const title=e=>e.title===null?'일정 있음':e.title;
 // Compare instants, since server timestamps may be UTC and users enter KST.
 const dayEvents=d=>events.filter(e=>new Date(e.starts_at)<new Date(`${d}T00:00:00+09:00`).getTime()+86400000&&new Date(e.ends_at)>new Date(`${d}T00:00:00+09:00`));
 function draw(){
  if(!alive())return;
  const [y,m]=month.split('-').map(Number),offset=new Date(Date.UTC(y,m-1,1)).getUTCDay(),days=new Date(Date.UTC(y,m,0)).getUTCDate();
  root.innerHTML=`<section class="card cal-card"><div class="row between"><div><div class="eyebrow">나의 하루, 우리의 약속</div><h2>${ctx.members?'모임원 캘린더':'내 캘린더'}</h2></div>${btn('새로고침','refresh')}</div>
  ${ctx.members?`<div class="field"><label for="cal-person">누구의 캘린더를 볼까요?</label><select id="cal-person"><option value="all" ${target==='all'?'selected':''}>모든 모임원 일정 보기</option>${people.map(p=>`<option value="${esc(p.user_id)}" ${target===p.user_id?'selected':''}>${esc(p.nickname)}${p.user_id===ctx.user.id?' (나)':''}</option>`).join('')}</select></div>`:''}
  <p class="muted">공개 일정은 같은 모임원에게 이름이 보여요. 비공개 일정은 다른 사람에게 회색 ‘일정 있음’으로만 보여요.</p>
  <div class="row between cal-toolbar">${btn('←','prev')}<strong aria-live="polite">${y}년 ${m}월</strong>${btn('→','next')} ${btn('오늘','today')}</div>
  <div class="cal-legend">${target==='all'?people.map(p=>`<span class="cal-person-key" style="--member-color:${personColor(p.user_id)}"><i></i>${esc(p.nickname)}${p.user_id===ctx.user.id?' (나)':''}</span>`).join(''):''}</div><div class="cal-legend">${target==='all'?'<span>색상 · 모임원 구분</span><span>회색 배경 · 비공개</span>':'<span>🟣 공개</span><span>⚪ 비공개</span><span>🟢 확정된 모임 약속</span>'}</div>
  <div class="cal-grid" aria-label="월별 캘린더">${['일','월','화','수','목','금','토'].map(x=>`<div class="cal-weekday">${x}</div>`).join('')}${'<div class="cal-blank"></div>'.repeat(offset)}${Array.from({length:days},(_,i)=>{const d=`${month}-${String(i+1).padStart(2,'0')}`,es=dayEvents(d);return `<button type="button" data-cal="day" data-value="${d}" class="cal-day ${d===day?'selected':''}" aria-pressed="${d===day}" aria-label="${d}, 일정 ${es.length}개"><span class="cal-date ${d===kdate(Date.now())?'today':''}">${i+1}</span>${es.slice(0,2).map(e=>`<span class="cal-chip ${target==='all'?'by-member':''} ${e.visibility==='private'?'private':e.kind==='group'?'group':''}" ${eventStyle(e)}>${esc(eventLabel(e))}</span>`).join('')}${es.length>2?`<small>+${es.length-2}</small>`:''}</button>`;}).join('')}</div>
  <p class="muted" role="status">${loading?'일정을 불러오는 중…':'날짜를 누르면 아래에서 시간과 일정을 확인할 수 있어요.'}</p>
  <div class="row between"><h3>${day.replaceAll('-','.')} 일정</h3>${own()?btn('＋ 일정 추가','add','','primary'):''}</div>
  <div id="cal-day-list">${loading?'<p>불러오는 중…</p>':dayEvents(day).map(e=>`<article class="cal-event ${target==='all'?'by-member':''} ${e.visibility==='private'?'private':e.kind==='group'?'group':''}" ${eventStyle(e)}><div>${target==='all'?`<div class="cal-owner-label">${esc(ownerNames(e))}</div>`:''}<strong>${esc(title(e))}</strong><p>${kdate(e.starts_at)===day?time(e.starts_at):kdate(e.starts_at)+' '+time(e.starts_at)} – ${kdate(e.ends_at)===day?time(e.ends_at):kdate(e.ends_at)+' '+time(e.ends_at)}</p><small>${e.visibility==='private'?(e.editable?'비공개 · 나만 이름을 볼 수 있어요':'비공개'):e.kind==='group'?'확정된 모임 약속':'공개 · 같은 모임원에게 표시'}</small></div>${own()&&e.editable?`<div class="row">${btn('수정','edit',e.id)}${btn('삭제','delete',e.id,'danger')}</div>`:''}</article>`).join('')||'<div class="empty">등록된 일정이 없어요.</div>'}</div><div id="cal-editor"></div></section>`;
 }
 async function rpc(action,payload){const r=await ctx.db.rpc('moyeobom_calendar',{action,payload});if(r.error)throw r.error;return r.data;}
 async function load(){
  const seq=++request,selected=target,range={from:month+'-01T00:00:00+09:00',to:monthShift(month,1)+'-01T00:00:00+09:00'};
  events=[];loading=true;draw();
  try{
   const ids=selected==='all'?people.map(p=>p.user_id):[selected],batches=[];
   // Bound parallel requests for larger groups; each existing RPC checks membership and redacts titles.
   for(let i=0;i<ids.length;i+=5){
    if(!alive()||seq!==request)return;
    const chunk=await Promise.all(ids.slice(i,i+5).map(async id=>({id,rows:await rpc('list',{...range,user_id:id})})));
    batches.push(...chunk);
   }
   if(!alive()||seq!==request)return;
   const unique=new Map();
   for(const batch of batches)for(const row of batch.rows){
    const key=row.kind+':'+row.id;
    if(unique.has(key)){unique.get(key).owners.push(batch.id);}
    else unique.set(key,{...row,owners:[batch.id]});
   }
   events=[...unique.values()].sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at)||a.id.localeCompare(b.id));loading=false;draw();
  }catch(e){if(!alive()||seq!==request)return;events=[];loading=false;draw();ctx.notice(e.message||'일정을 불러오지 못했어요.',true);}
 }

 function editor(e){if(!own()||loading)return;const slot=root.querySelector('#cal-editor');slot.innerHTML=`<form id="calendar-event-form" class="cal-editor" data-id="${esc(e?.id||'')}"><h3>${e?'일정 수정':'새 일정'}</h3><div class="field"><label for="cal-title">일정 이름</label><input id="cal-title" name="title" maxlength="100" required value="${esc(e?.title||'')}" placeholder="예: 운동, 공부, 친구 만나기"></div><div class="form-grid"><div class="field"><label for="cal-start">시작 (한국 시간)</label><input id="cal-start" name="starts_at" type="datetime-local" required value="${e?local(e.starts_at):day+'T09:00'}"></div><div class="field"><label for="cal-end">종료 (한국 시간)</label><input id="cal-end" name="ends_at" type="datetime-local" required value="${e?local(e.ends_at):day+'T10:00'}"></div></div><div class="field"><label for="cal-visibility">공개 범위</label><select id="cal-visibility" name="visibility"><option value="private" ${e?.visibility!=='public'?'selected':''}>비공개 · 다른 사람에게 일정 있음으로 표시</option><option value="public" ${e?.visibility==='public'?'selected':''}>공개 · 같은 모임원에게 이름 표시</option></select></div><div class="row"><button type="submit" class="primary">일정 저장</button>${btn('취소','cancel')}</div></form>`;slot.querySelector('input').focus();}
 root.onclick=async ev=>{const b=ev.target.closest('[data-cal]');if(!b||saving)return;const a=b.dataset.cal,v=b.dataset.value;
  if(a==='add')return editor();if(a==='edit')return editor(events.find(e=>e.id===v&&e.editable));if(a==='cancel'){root.querySelector('#cal-editor').innerHTML='';return;}
  if(a==='delete'){if(!own()||!events.some(e=>e.id===v&&e.editable)||!confirm('이 일정을 삭제할까요?'))return;saving=true;b.disabled=true;try{await rpc('delete',{id:v});if(alive()){ctx.notice('일정을 삭제했어요.');await load();}}catch(e){if(alive()){ctx.notice(e.message,true);b.disabled=false;}}finally{saving=false;}return;}
  if(a==='day'){day=v;draw();return;}
  if(a==='prev'||a==='next'){month=monthShift(month,a==='prev'?-1:1);day=month+'-01';}
  if(a==='today'){day=kdate(Date.now());month=day.slice(0,7);}await load();
 };
 root.onchange=e=>{if(e.target.id==='cal-person'&&!saving){target=e.target.value;load();}};
 root.onsubmit=async ev=>{if(ev.target.id!=='calendar-event-form')return;ev.preventDefault();ev.stopPropagation();if(saving||!own())return;const f=ev.target,fd=new FormData(f),start=fd.get('starts_at'),end=fd.get('ends_at');if(!f.reportValidity())return;if(new Date(end+'+09:00')<=new Date(start+'+09:00')){ctx.notice('종료 시간을 시작 시간 이후로 정해주세요.',true);return;}saving=true;f.querySelector('[type=submit]').disabled=true;try{await rpc('save',{id:f.dataset.id||null,title:fd.get('title'),starts_at:start+'+09:00',ends_at:end+'+09:00',visibility:fd.get('visibility')});if(alive()){day=start.slice(0,10);month=day.slice(0,7);ctx.notice('일정을 저장했어요.');await load();}}catch(e){if(alive()){ctx.notice(e.message||'저장하지 못했어요. 입력 내용은 유지돼요.',true);f.querySelector('[type=submit]').disabled=false;}}finally{saving=false;}};
 load();
}
window.MoyeobomCalendar={mount,reset};
})();
