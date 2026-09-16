const {test,before,after,beforeEach}=require('node:test');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {ref,set,get,update,remove}=require('firebase/database');
const fs=require('node:fs'),path=require('node:path');
let env;
const profile=(name,isAdmin=false)=>({displayName:name,isAdmin,joinedAt:1});
const message=(from='alice')=>({from,displayName:from==='alice'?'Alice':'Délégué',text:'Bonjour',ts:1});
const db=uid=>uid?env.authenticatedContext(uid).database():env.unauthenticatedContext().database();
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-classe-connect',database:{host:'127.0.0.1',port:9000,rules:fs.readFileSync(path.join(__dirname,'../database.rules.json'),'utf8')}});});
beforeEach(async()=>{await env.clearDatabase();await env.withSecurityRulesDisabled(async ctx=>set(ref(ctx.database()),{users:{alice:profile('Alice'),bob:profile('Bob'),admin:profile('Délégué',true)}}));});
after(async()=>{await env?.cleanup();});
test('private conversations allow only their student and delegate, in both directions',async()=>{
 const first={...message(),kind:'proposal'};
 await assertSucceeds(set(ref(db('alice'),'conversations/alice/messages/first'),first));
 await assertSucceeds(get(ref(db('alice'),'conversations/alice')));
 await assertSucceeds(set(ref(db('admin'),'conversations/alice/messages/reply'),{...message('admin'),kind:'message'}));
 await assertSucceeds(get(ref(db('admin'),'conversations')));
 for(const target of ['conversations','conversations/alice','conversations/alice/messages/first'])await assertFails(get(ref(db('bob'),target)));
 await assertFails(get(ref(db('alice'),'conversations')));
 await assertFails(get(ref(db(),'conversations/alice')));
 await assertFails(set(ref(db('bob'),'conversations/alice/messages/intrusion'),{from:'bob',displayName:'Bob',text:'Non',ts:1,kind:'message'}));
 await assertFails(update(ref(db('alice'),'conversations/alice/messages/first'),{text:'Modification'}));
 await assertFails(set(ref(db('alice'),'conversations/alice/messages/fake'),{...first,from:'admin'}));
 await assertFails(set(ref(db('alice'),'conversations/alice/messages/status'),{...first,kind:'approved'}));
});
test('anonymous authenticated pupils have the same isolated private access',async()=>{
 const guest=env.authenticatedContext('guest',{firebase:{sign_in_provider:'anonymous'}}).database();
 await assertSucceeds(set(ref(guest,'users/guest'),profile('Sans e-mail')));
 await assertSucceeds(set(ref(guest,'conversations/guest/messages/m'),{from:'guest',displayName:'Sans e-mail',text:'Bonjour',ts:1,kind:'message'}));
 await assertSucceeds(get(ref(guest,'conversations/guest')));
 await assertFails(get(ref(db('alice'),'conversations/guest')));
 await assertFails(get(ref(guest,'conversations/alice')));
});
test('anonymous users cannot read class data',async()=>{for(const p of ['users','messages','news','council','requests'])await assertFails(get(ref(db(),p)));});
test('profile creation accepts ordinary members and rejects self promotion',async()=>{
 await assertSucceeds(set(ref(db('new'),'users/new'),profile('Nouvel élève')));
 await assertFails(set(ref(db('intruder'),'users/intruder'),profile('Intrus',true)));
 await assertFails(update(ref(db('alice'),'users/alice'),{isAdmin:true}));
 await assertFails(set(ref(db('alice'),'users/bob'),profile('Usurpé')));
});
test('members send and read messages but cannot impersonate another member',async()=>{
 await assertSucceeds(set(ref(db('alice'),'messages/first'),message()));
 await assertSucceeds(get(ref(db('bob'),'messages')));
 await assertFails(set(ref(db('bob'),'messages/fake'),message()));
 await assertFails(set(ref(db('alice'),'messages/name'),{...message(),displayName:'Délégué'}));
});
test('messages are immutable and validated',async()=>{
 await assertSucceeds(set(ref(db('alice'),'messages/m'),message()));
 await assertFails(remove(ref(db('alice'),'messages/m')));
 await assertFails(update(ref(db('alice'),'messages/m'),{text:'Modifié'}));
 await assertFails(set(ref(db('alice'),'messages/empty'),{...message(),text:''}));
 await assertFails(set(ref(db('alice'),'messages/long'),{...message(),text:'a'.repeat(4001)}));
 await assertFails(set(ref(db('alice'),'messages/extra'),{...message(),isAdmin:true}));
});
test('news accepts members while council publishing requires delegate',async()=>{
 const news={from:'alice',displayName:'Alice',title:'Annonce',content:'Contenu',ts:1};
 await assertSucceeds(set(ref(db('alice'),'news/a'),news));
 await assertFails(set(ref(db('alice'),'council/a'),news));
 await assertSucceeds(set(ref(db('admin'),'council/a'),{...news,from:'admin',displayName:'Délégué'}));
});
test('private requests are readable only by the delegate',async()=>{
 await assertSucceeds(set(ref(db('alice'),'requests/r'),{...message(),status:'nouveau'}));
 await assertFails(get(ref(db('bob'),'requests/r')));await assertFails(get(ref(db('alice'),'requests/r')));
 await assertSucceeds(get(ref(db('admin'),'requests')));
 await assertFails(set(ref(db('alice'),'requests/r/status'),'lu'));
 await assertSucceeds(set(ref(db('admin'),'requests/r/status'),'lu'));
 await assertFails(set(ref(db('admin'),'requests/r/text'),'Modifié'));
});
