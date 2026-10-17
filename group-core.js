/* Pure scheduling calculations, shared by browser and tests. */
(function(root){
 const clock=m=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
 function candidates(p,votes,members){
  const out=[];
  for(const d of p.dates) for(let m=p.start_min;m+p.duration_min<=p.end_min;m+=30){
   const available=members.filter(member=>votes.some(v=>v.user_id===member.user_id&&!v.unavailable&&Array.from({length:p.duration_min/30},(_,i)=>`${d}|${m+i*30}`).every(s=>v.slots.includes(s))));
   out.push({slot:`${d}|${m}`,date:d,minute:m,count:available.length,available:available.map(x=>x.user_id),total:members.length});
  }
  return out.sort((a,b)=>b.count-a.count||a.slot.localeCompare(b.slot,undefined,{numeric:true}));
 }
 function activities(p,votes){return p.activities.map(name=>({name,count:votes.filter(v=>!v.unavailable&&v.activities.includes(name)).length})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'ko'));}
 const api={clock,candidates,activities};if(typeof module!=='undefined')module.exports=api;root.MoyeobomCore=api;
})(typeof window!=='undefined'?window:globalThis);
