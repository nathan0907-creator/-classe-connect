const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
const script=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
function setup(t,{offline=false,backend=true}={}){
 const dom=new JSDOM(html,{runScripts:'outside-only',url:'http://localhost',pretendToBeVisual:true});t.after(()=>dom.window.close());
 const win=dom.window,doc=win.document;
 win.HTMLDialogElement.prototype.showModal=function(){this.open=true;};win.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const state={authCallback:null,refs:[],writes:[],data:{users:{alice:{displayName:'Alice',joinedAt:1,isAdmin:false},admin:{displayName:'Délégué',joinedAt:1,isAdmin:true}}},fail:false,pending:null};
 const snapshot=value=>({val:()=>value,exists:()=>value!==undefined&&value!==null});
 const get=p=>p.split('/').reduce((v,k)=>v?.[k],state.data);
 const sdkAuth={currentUser:null,onAuthStateChanged(cb){state.authCallback=cb;},async signInAnonymously(){const user=sdkAuth.currentUser||{uid:'guest',isAnonymous:true,async updateProfile(v){Object.assign(this,v);}};sdkAuth.currentUser=user;Promise.resolve().then(()=>state.authCallback(user));return {user};},async signOut(){sdkAuth.currentUser=null;await state.authCallback(null);}};
 const db={ref(p=''){const ref={path:p,callback:null,offCalled:false,limitToLast(){return this;},on(event,cb){this.callback=cb;cb(snapshot(p==='.info/connected'?!offline:get(p)));},off(){this.offCalled=true;},async once(){return snapshot(get(p));},async set(value){state.writes.push({path:p,value});if(state.fail)throw Object.assign(Error('permission denied'),{code:'PERMISSION_DENIED'});const keys=p.split('/');let parent=state.data;for(const k of keys.slice(0,-1))parent=parent[k]??={};parent[keys.at(-1)]=value;},push(value){if(value===undefined)return {key:'new'};return (async()=>{state.writes.push({path:p,value});if(state.fail)throw Error('permission denied');if(state.pending)await state.pending;return {key:'new'};})();},async update(values){for(const [path,value] of Object.entries(values))if(!path.startsWith('rateLimits/'))state.writes.push({path:path.split('/').slice(0,-1).join('/'),value});if(state.fail)throw Error('permission denied');if(state.pending)await state.pending;}};state.refs.push(ref);return ref;}};
 if(backend)win.firebase={initializeApp(){},auth:()=>sdkAuth,database:Object.assign(()=>db,{ServerValue:{TIMESTAMP:123}})};
 win.eval(script);
 async function login(uid){sdkAuth.currentUser={uid,displayName:state.data.users[uid]?.displayName};await state.authCallback(sdkAuth.currentUser);}
 return {win,doc,state,login,snapshot};
}
test('preview works without Firebase and clearly stays local',async t=>{
 const {doc,state}=setup(t,{backend:false});doc.getElementById('preview-btn').click();
 assert.match(doc.getElementById('preview-banner').textContent,/Données fictives/);
 doc.getElementById('chat-input').value='Mon message local';doc.getElementById('chat-send').click();
 assert.match(doc.getElementById('chat-messages').textContent,/Mon message local/);assert.equal(state.writes.length,0);
 doc.querySelector('[data-panel="news"]').click();doc.getElementById('news-publish').click();assert.equal(state.writes.length,0);
});
test('failed send retains text and releases button',async t=>{
 const {win,doc,state,login}=setup(t);await login('alice');state.fail=true;
 doc.getElementById('chat-input').value='À conserver';await win.sendMessage();
 assert.equal(doc.getElementById('chat-input').value,'À conserver');assert.equal(doc.getElementById('chat-send').disabled,false);
 assert.match(doc.getElementById('toast-container').textContent,/non envoyé/);
});
test('offline sends do not queue or erase drafts',async t=>{
 const {win,doc,state,login}=setup(t,{offline:true});await login('alice');
 doc.getElementById('chat-input').value='Brouillon';await win.sendMessage();
 assert.equal(doc.getElementById('chat-input').value,'Brouillon');assert.equal(state.writes.length,0);
});
test('double submit produces one write and preserves later edits',async t=>{
 const {win,doc,state,login}=setup(t);await login('alice');let resolve;state.pending=new Promise(r=>resolve=r);
 doc.getElementById('chat-input').value='Premier';const first=win.sendMessage();await win.sendMessage();
 doc.getElementById('chat-input').value='Nouveau brouillon';resolve();await first;
 assert.equal(state.writes.length,1);assert.equal(doc.getElementById('chat-input').value,'Nouveau brouillon');assert.equal(state.writes[0].value.from,'alice');
});
test('HTML in names and messages is rendered as text',async t=>{
 const {doc,state,login}=setup(t);state.data.messages={m:{from:'other',displayName:'<img src=x onerror=alert(1)>',text:'<script>alert(1)</script>',ts:1}};await login('alice');
 assert.equal(doc.querySelectorAll('#chat-messages img,#chat-messages script').length,0);assert.match(doc.getElementById('chat-messages').textContent,/<script>/);
});
test('switching from admin clears private content and stale callbacks',async t=>{
 const {doc,state,login,snapshot}=setup(t);state.data.conversations={bob:{messages:{private:{from:'bob',displayName:'Bob',text:'Question privée',ts:1,kind:'message'}}}};await login('admin');
 assert.match(doc.getElementById('requests-list').textContent,/Question privée/);
 const old=state.refs.find(r=>r.path==='conversations');await login('alice');
 assert.equal(old.offCalled,true);old.callback(snapshot(state.data.conversations));
 assert.doesNotMatch(doc.getElementById('requests-list').textContent,/Question privée/);assert.equal(doc.getElementById('council-publish'),null);
});
test('logout removes private content and drafts',async t=>{
 const {doc,state,login}=setup(t);await login('alice');doc.getElementById('chat-input').value='Secret';await doc.getElementById('logout-btn').onclick();
 assert.equal(doc.getElementById('chat-input').value,'');assert.equal(doc.getElementById('chat-messages').textContent,'');assert.equal(doc.getElementById('app').classList.contains('active'),false);
});
test('search supports no matches and recovery',async t=>{
 const {doc,win}=setup(t,{backend:false});doc.getElementById('preview-btn').click();const search=doc.getElementById('message-search');search.value='zzzzzz';search.dispatchEvent(new win.Event('input'));
 assert.match(doc.getElementById('search-empty').textContent,/Aucun message/);search.value='';search.dispatchEvent(new win.Event('input'));assert.equal(doc.getElementById('search-empty'),null);assert.equal(doc.querySelectorAll('.msg-row[hidden]').length,0);
});
test('student private send is isolated and failure keeps the draft',async t=>{
 const {doc,state,login,win}=setup(t);await login('alice');
 assert.ok(state.refs.some(r=>r.path==='conversations/alice'));assert.ok(!state.refs.some(r=>r.path==='conversations'));
 state.fail=true;doc.getElementById('private-input').value='Question confidentielle';
 await doc.getElementById('private-form').onsubmit({preventDefault(){}});
 assert.equal(doc.getElementById('private-input').value,'Question confidentielle');
 assert.equal(state.writes[0].path,'conversations/alice/messages');
 assert.equal(doc.getElementById('private-send').disabled,false);
 state.fail=false;await doc.getElementById('private-form').onsubmit({preventDefault(){}});
 assert.equal(doc.getElementById('private-input').value,'');
});
test('timetable proposal opens own private conversation without changing schedule',async t=>{
 const {doc,state,login,win}=setup(t);await login('alice');
 const count=doc.querySelectorAll('#schedule-grid [data-lesson]').length;
 doc.querySelector('[data-lesson="0"]').click();
 doc.getElementById('proposal-action').value='Demander une annulation';
 doc.getElementById('proposal-date').value='2026-09-21';
 doc.getElementById('proposal-reason').value='Demande à examiner';
 await doc.getElementById('proposal-form').onsubmit({preventDefault(){},currentTarget:doc.getElementById('proposal-form')});
 assert.equal(state.writes.length,1);assert.equal(state.writes[0].path,'conversations/alice/messages');
 assert.equal(state.writes[0].value.kind,'proposal');assert.match(state.writes[0].value.text,/planning reste inchangé/);
 assert.equal(doc.querySelectorAll('#schedule-grid [data-lesson]').length,count);assert.equal(doc.getElementById('panel-requests').classList.contains('active'),true);
 doc.getElementById('schedule-period').value='Q2';doc.getElementById('schedule-period').dispatchEvent(new win.Event('change'));
 assert.equal(doc.querySelector('[data-lesson="6"]'),null);assert.ok(doc.querySelector('[data-lesson="7"]'));
});
test('delegate replies to the selected student and stale pending replies cannot clear another session',async t=>{
 const {doc,state,login}=setup(t);state.data.conversations={alice:{messages:{m:{from:'alice',displayName:'Alice',text:'Privé',ts:1,kind:'message'}}}};await login('admin');
 let resolve;state.pending=new Promise(r=>resolve=r);doc.getElementById('private-input').value='Réponse';const send=doc.getElementById('private-form').onsubmit({preventDefault(){}});
 await login('alice');doc.getElementById('private-input').value='Nouveau texte';resolve();await send;
 assert.equal(state.writes[0].path,'conversations/alice/messages');assert.equal(state.writes[0].value.from,'admin');assert.equal(doc.getElementById('private-input').value,'Nouveau texte');
});
test('pseudo-only registration creates an ordinary profile without an email',async t=>{
 const {doc,state}=setup(t);doc.getElementById('show-guest').click();doc.getElementById('guest-name').value='Camille';doc.getElementById('guest-terms').checked=true;
 await doc.getElementById('guest-btn').onclick();await new Promise(r=>setTimeout(r,0));
 assert.equal(state.data.users.guest.displayName,'Camille');assert.equal(state.data.users.guest.isAdmin,false);
 assert.equal(doc.getElementById('app').classList.contains('active'),true);
 assert.ok(state.refs.some(r=>r.path==='conversations/guest'));
});
test('new messages notify once, opening their panel clears unread badges',async t=>{
 const {doc,state,login,snapshot}=setup(t);await login('alice');doc.querySelector('[data-panel="schedule"]').click();
 const channel=state.refs.find(r=>r.path==='messages');const data={m:{from:'bob',displayName:'Bob',text:'Nouveau',ts:10}};channel.callback(snapshot(data));
 assert.equal(doc.getElementById('chat-badge').textContent,'1');channel.callback(snapshot(data));assert.equal(doc.getElementById('chat-badge').textContent,'1');
 assert.equal([...doc.querySelectorAll('.toast')].filter(x=>x.textContent==='Nouveau message dans la classe').length,1);
 doc.querySelector('[data-panel="chat"]').click();assert.equal(doc.getElementById('chat-badge').style.display,'none');
 await doc.getElementById('logout-btn').onclick();assert.equal(doc.title,'ClasseConnect — La classe, ensemble.');
});
test('private notifications count only authorized threads and reveal no message content',async t=>{
 const {doc,state,login,snapshot}=setup(t);await login('alice');const channel=state.refs.find(r=>r.path==='conversations/alice');
 channel.callback(snapshot({messages:{m:{from:'admin',displayName:'Délégué',text:'Secret personnel',ts:20}}}));
 assert.equal(doc.getElementById('requests-badge').textContent,'1');assert.doesNotMatch(doc.getElementById('toast-container').textContent,/Secret personnel/);
 doc.querySelector('[data-panel="requests"]').click();assert.equal(doc.getElementById('requests-badge').style.display,'none');
});
test('delegate can create a poll while ordinary members can vote only as themselves',async t=>{
 const {doc,state,login}=setup(t);await login('admin');doc.getElementById('poll-question').value='Quel projet ?';doc.getElementById('poll-options').value='Sport\nMusique';
 await doc.getElementById('poll-create').onsubmit({preventDefault(){}});assert.equal(state.writes.at(-1).path,'polls');assert.equal(state.writes.at(-1).value.options.o1,'Musique');
 state.data.polls={p:{question:'Quel projet ?',options:{o0:'Sport',o1:'Musique'},from:'admin',displayName:'Délégué',ts:1,status:'open'}};
 await login('alice');assert.equal(doc.getElementById('poll-create'),null);await doc.querySelector('.poll-choice').onclick();
 assert.equal(state.writes.at(-1).path,'polls/p/votes/alice');assert.equal(state.writes.at(-1).value,'o0');
});

