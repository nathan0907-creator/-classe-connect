const {test,before,after,beforeEach}=require('node:test');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {ref,set,get,update,remove,serverTimestamp}=require('firebase/database');
const fs=require('node:fs'),path=require('node:path');
let env;
const profile=(name,isAdmin=false)=>({displayName:name,isAdmin,joinedAt:1});
const message=(from='alice')=>({from,displayName:from==='alice'?'Alice':'Délégué',text:'Bonjour',ts:1});
async function publish(uid,path,value){const parts=path.split('/'),bucket=parts[0]==='conversations'?'private':parts[0];return update(ref(db(uid)),{[path]:value,['rateLimits/'+uid+'/'+bucket]:{id:parts.at(-1),ts:serverTimestamp()}});}
const db=uid=>uid?env.authenticatedContext(uid).database():env.unauthenticatedContext().database();
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-classe-connect',database:{host:'127.0.0.1',port:9000,rules:fs.readFileSync(path.join(__dirname,'../database.rules.json'),'utf8')}});});
beforeEach(async()=>{await env.clearDatabase();await env.withSecurityRulesDisabled(async ctx=>set(ref(ctx.database()),{users:{alice:profile('Alice'),bob:profile('Bob'),admin:profile('Délégué',true)}}));});
after(async()=>{await env?.cleanup();});
test('publication tickets prevent direct writes, rapid repeats and multi-message batches',async()=>{
 await assertFails(set(ref(db('alice'),'messages/direct'),message()));
 await assertSucceeds(publish('alice','messages/one',message()));
 await assertFails(publish('alice','messages/two',message()));
 await env.withSecurityRulesDisabled(async ctx=>remove(ref(ctx.database(),'rateLimits/alice')));
 await assertFails(update(ref(db('alice')),{ 'messages/a':message(),'messages/b':message(),'rateLimits/alice/messages':{id:'a',ts:serverTimestamp()}}));
});
test('analytics requires own account and consent and is readable only by owner and delegate',async()=>{
 const visit={count:1,lastAt:serverTimestamp(),consent:true};
 await assertFails(set(ref(db('alice'),'analytics/alice/2026-09-19'),{...visit,consent:false}));
 await assertSucceeds(set(ref(db('alice'),'analytics/alice/2026-09-19'),visit));
 await assertFails(get(ref(db('bob'),'analytics/alice')));await assertFails(get(ref(db('alice'),'analytics')));
 await assertSucceeds(get(ref(db('admin'),'analytics')));await assertSucceeds(get(ref(db('alice'),'analytics/alice')));
 await assertFails(set(ref(db('bob'),'analytics/alice/2026-09-20'),visit));
});
test('polls enforce delegate creation, one ballot per account, and closure',async()=>{
 const poll={question:'Quel projet ?',options:{o0:'Sport',o1:'Musique'},from:'admin',displayName:'Délégué',ts:1,status:'open'};
 await assertFails(set(ref(db('alice'),'polls/p'),{...poll,from:'alice',displayName:'Alice'}));
 await assertFails(set(ref(db('admin'),'polls/seed'),{...poll,votes:{alice:'o0'}}));
 await assertSucceeds(publish('admin','polls/p',poll));
 await assertFails(get(ref(db(),'polls')));
 await assertSucceeds(set(ref(db('alice'),'polls/p/votes/alice'),'o0'));
 await assertSucceeds(set(ref(db('alice'),'polls/p/votes/alice'),'o1'));
 await assertFails(set(ref(db('bob'),'polls/p/votes/alice'),'o0'));
 await assertFails(set(ref(db('admin'),'polls/p/votes/alice'),'o0'));
 await assertFails(set(ref(db('alice'),'polls/p/votes/alice'),'missing'));
 await assertFails(set(ref(db('admin'),'polls/p/options/o0'),'Changed'));
 await assertFails(set(ref(db('alice'),'polls/p/status'),'closed'));
 await assertSucceeds(set(ref(db('admin'),'polls/p/status'),'closed'));
 await assertFails(set(ref(db('alice'),'polls/p/votes/alice'),'o0'));
 await assertFails(set(ref(db('admin'),'polls/p/status'),'open'));
 await assertSucceeds(get(ref(db('alice'),'polls/p')));
});
test('private conversations allow only their student and delegate, in both directions',async()=>{
 const first={...message(),kind:'proposal'};
 await assertSucceeds(publish('alice','conversations/alice/messages/first',first));
 await assertSucceeds(get(ref(db('alice'),'conversations/alice')));
 await assertSucceeds(publish('admin','conversations/alice/messages/reply',{...message('admin'),kind:'message'}));
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
 await assertSucceeds(publish('guest','conversations/guest/messages/m',{from:'guest',displayName:'Sans e-mail',text:'Bonjour',ts:1,kind:'message'}));
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
 await assertSucceeds(publish('alice','messages/first',message()));
 await assertSucceeds(get(ref(db('bob'),'messages')));
 await assertFails(set(ref(db('bob'),'messages/fake'),message()));
 await assertFails(set(ref(db('alice'),'messages/name'),{...message(),displayName:'Délégué'}));
});
test('messages are immutable and validated',async()=>{
 await assertSucceeds(publish('alice','messages/m',message()));
 await assertFails(remove(ref(db('alice'),'messages/m')));
 await assertFails(update(ref(db('alice'),'messages/m'),{text:'Modifié'}));
 await assertFails(set(ref(db('alice'),'messages/empty'),{...message(),text:''}));
 await assertFails(set(ref(db('alice'),'messages/long'),{...message(),text:'a'.repeat(4001)}));
 await assertFails(set(ref(db('alice'),'messages/extra'),{...message(),isAdmin:true}));
});
test('news accepts members while council publishing requires delegate',async()=>{
 const news={from:'alice',displayName:'Alice',title:'Annonce',content:'Contenu',ts:1};
 await assertSucceeds(publish('alice','news/a',news));
 await assertFails(set(ref(db('alice'),'council/a'),news));
 await assertSucceeds(publish('admin','council/a',{...news,from:'admin',displayName:'Délégué'}));
});
test('private requests are readable only by the delegate',async()=>{
 await assertFails(set(ref(db('alice'),'requests/r'),{...message(),status:'nouveau'}));
 await env.withSecurityRulesDisabled(async ctx=>set(ref(ctx.database(),'requests/r'),{...message(),status:'nouveau'}));
 await assertFails(get(ref(db('bob'),'requests/r')));await assertFails(get(ref(db('alice'),'requests/r')));
 await assertSucceeds(get(ref(db('admin'),'requests')));
 await assertFails(set(ref(db('alice'),'requests/r/status'),'lu'));
 await assertSucceeds(set(ref(db('admin'),'requests/r/status'),'lu'));
 await assertFails(set(ref(db('admin'),'requests/r/text'),'Modifié'));
});
