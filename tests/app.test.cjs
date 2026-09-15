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
 const state={authCallback:null,refs:[],writes:[],data:{users:{alice:{displayName:'Alice',joinedAt:1,isAdmin:false},admin:{displayName:'Délégué',joinedAt:1,isAdmin:true}}},fail:false,pending:null};
 const snapshot=value=>({val:()=>value,exists:()=>value!==undefined&&value!==null});
 const get=p=>p.split('/').reduce((v,k)=>v?.[k],state.data);
 const sdkAuth={currentUser:null,onAuthStateChanged(cb){state.authCallback=cb;},async signOut(){sdkAuth.currentUser=null;await state.authCallback(null);}};
 const db={ref(p){const ref={path:p,callback:null,offCalled:false,limitToLast(){return this;},on(event,cb){this.callback=cb;cb(snapshot(p==='.info/connected'?!offline:get(p)));},off(){this.offCalled=true;},async once(){return snapshot(get(p));},async set(value){state.writes.push({path:p,value});},async push(value){state.writes.push({path:p,value});if(state.fail)throw Error('permission denied');if(state.pending)await state.pending;return {key:'new'};}};state.refs.push(ref);return ref;}};
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
 const {doc,state,login,snapshot}=setup(t);state.data.requests={private:{displayName:'Alice',text:'Question privée',ts:1,status:'nouveau'}};await login('admin');
 assert.match(doc.getElementById('requests-list').textContent,/Question privée/);
 const old=state.refs.find(r=>r.path==='requests');await login('alice');
 assert.equal(old.offCalled,true);old.callback(snapshot(state.data.requests));
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
