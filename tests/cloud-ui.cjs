const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require(process.env.JSDOM_PATH || 'jsdom');
const html = fs.readFileSync('cloud-polls.html', 'utf8');
const source = fs.readFileSync('cloud-polls.js', 'utf8');
const db = { polls: [], poll_responses: [] };
let failure = false, callback, session = { user: { id: 'test-owner', email: 'test@example.invalid' } };
function client() {
  return { auth: {
    getSession: async () => ({ data: { session }, error: null }),
    onAuthStateChange: fn => { callback = fn; },
    signOut: async () => { session = null; callback('SIGNED_OUT', null); return {}; },
    signInWithOtp: async () => ({})
  }, from: table => {
    let method = 'read', payload, filters = [], one = false;
    const q = {
      select() { return q; }, eq(k,v) { filters.push([k,v]); return q; }, order() { return q; },
      single() { one = true; return q; }, insert(v) {method='insert';payload=v;return q;}, update(v){method='update';payload=v;return q;},
      then(resolve) {
        if(failure && method !== 'read') { failure=false; return Promise.resolve(resolve({error:{message:'Network fetch failed'}})); }
        let rows = db[table].filter(r=>filters.every(([k,v])=>r[k]===v));
        if(method==='insert'){const row={id:`00000000-0000-4000-8000-${String(db[table].length+1).padStart(12,'0')}`,status:'open',...payload};db[table].push(row);rows=[row];}
        if(method==='update') rows.forEach(r=>Object.assign(r,payload));
        return Promise.resolve(resolve({data:JSON.parse(JSON.stringify(one?rows[0]:rows)),error:null}));
      }
    }; return q;
  }};
}
async function boot(url='https://example.test/cloud-polls.html') {
 const dom=new JSDOM(html,{url,runScripts:'outside-only'}); const w=dom.window;
 w.HTMLElement.prototype.scrollIntoView=()=>{};w.confirm=()=>true;
 w.MOYEOBOM_CONFIG={url:'https://example.supabase.co',publishableKey:'test'};w.supabase={createClient:client};
 w.eval(source);await settle();return dom;
}
async function settle(){for(let i=0;i<10;i++)await new Promise(r=>setImmediate(r));}
(async()=>{
 let dom=await boot(),d=dom.window.document;
 assert.equal(d.querySelector('#cloud-content').classList.contains('hidden'),false);
 d.querySelector('[data-date]:not([disabled])').click();d.querySelector('#create-poll').click();await settle();
 assert.equal(db.polls.length,1); assert.match(d.querySelector('#cloud-message').textContent,/새 투표/);console.log('PASS create persisted poll');
 d.querySelector('#participant-name').value='참가자 <img src=x onerror=alert(1)>';
 d.querySelector('[data-slot]').click();d.querySelector('#submit-vote').click();await settle();
 assert.equal(db.poll_responses.length,1);assert.equal(d.querySelector('#participants img'),null);console.log('PASS save response + escape name');
 const url=dom.window.location.href;dom.window.close();dom=await boot(url);d=dom.window.document;
 assert.match(d.querySelector('#participants').textContent,/참가자/);console.log('PASS reload retrieves saved response (mock transport)');
 d.querySelector('#participant-name').value=db.poll_responses[0].participant_name;d.querySelectorAll('[data-slot]')[1].click();d.querySelector('#submit-vote').click();await settle();
 assert.equal(db.poll_responses.length,1);assert.match(db.poll_responses[0].slots[0],/\|630$/);console.log('PASS replace duplicate-name response');
 d.querySelector('#participant-name').value='실패 시험';d.querySelector('[data-slot]').click();failure=true;d.querySelector('#submit-vote').click();await settle();
 assert.equal(db.poll_responses.length,1);assert.equal(d.querySelector('#participant-name').value,'실패 시험');assert.match(d.querySelector('#cloud-message').textContent,/연결/);console.log('PASS failed write preserves input');
 d.querySelector('#toggle-poll').click();await settle();assert.equal(db.polls[0].status,'closed');assert.equal(d.querySelector('#submit-vote').disabled,true);console.log('PASS close blocks UI writes');
 d.querySelector('#toggle-poll').click();await settle();assert.equal(db.polls[0].status,'open');assert.equal(d.querySelector('#submit-vote').disabled,false);console.log('PASS reopen enables response');
 d.querySelector('#sign-out').click();await settle();assert.equal(d.querySelector('#cloud-content').classList.contains('hidden'),true);assert.equal(d.querySelector('#saved-polls').textContent,'');console.log('PASS logout clears rendered private data');
 dom.window.close();
})().catch(e=>{console.error(e);process.exit(1)});
