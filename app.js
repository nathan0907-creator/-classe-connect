const firebaseConfig = {
  apiKey: "AIzaSyCoVkY_hrqYWLU0PoXLqFNPwH7K681x4LA",
  authDomain: "e-pacifique.firebaseapp.com",
  databaseURL: "https://e-pacifique-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "e-pacifique",
  storageBucket: "e-pacifique.firebasestorage.app",
  messagingSenderId: "682036589077",
  appId: "1:682036589077:web:bced4529f9785a26eb141c"
};
const backendAvailable = typeof firebase !== 'undefined' && typeof firebase.auth === 'function' && typeof firebase.database === 'function';
if (backendAvailable) firebase.initializeApp(firebaseConfig);
const auth = backendAvailable ? firebase.auth() : null;
const db = backendAvailable ? firebase.database() : null;

const AVATAR_COLORS = ['#9280bd','#ba8ba1','#a99365','#719c90','#a183b9','#7e94b0','#b187ab'];
function hashStr(s){ let h=0; for(let i=0;i<s.length;i++){h=(h*31+s.charCodeAt(i))|0;} return Math.abs(h); }
function colorFor(name){ return AVATAR_COLORS[hashStr(name||'?') % AVATAR_COLORS.length]; }
function initials(name){ return (name||'?').trim().slice(0,2).toUpperCase(); }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmtTime(ts){ return ts ? new Date(ts).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}) : '...'; }
function fmtDate(ts){ return ts ? new Date(ts).toLocaleDateString('fr-FR') : '...'; }
function showToast(text){
  const container = document.getElementById('toast-container');
  const el = document.createElement('div'); el.className='toast'; el.textContent=text;
  container.appendChild(el);
  setTimeout(()=>{ el.classList.add('leaving'); setTimeout(()=>el.remove(),250); }, 2600);
}
function withLoading(btn, fn){
  return async (...args) => {
    if(btn.disabled)return;
    btn.classList.add('loading');btn.disabled=true;
    try{
      if(demoMode){showToast('Crée un compte pour publier dans ta classe.');return;}
      if(!backendAvailable){showToast('Le service de connexion est indisponible. Recharge la page.');return;}
      if(currentUser&&!connected){showToast('Tu es hors ligne. Ton texte reste ici.');return;}
      await fn(...args);
    }catch(e){showToast('Action non enregistrée. Vérifie ta connexion et réessaie.');}
    finally{btn.classList.remove('loading');btn.disabled=false;}
  };
}
function friendlyAuthError(code){
  const map = {
    'auth/invalid-email':"Adresse e-mail invalide.",
    'auth/user-not-found':"Aucun compte avec cet e-mail.",
    'auth/wrong-password':"Mot de passe incorrect.",
    'auth/invalid-credential':"E-mail ou mot de passe incorrect.",
    'auth/email-already-in-use':"Un compte existe déjà avec cet e-mail.",
    'auth/weak-password':"Mot de passe trop court (6 caractères min).",
    'auth/too-many-requests':"Trop de tentatives, réessaie plus tard.",
    'auth/network-request-failed':"Connexion interrompue. Réessaie dans un instant.",
    'auth/operation-not-allowed':"Cette méthode de connexion doit être activée par le responsable de la classe.",
    'PERMISSION_DENIED':"Ton profil n’a pas pu être enregistré. Le responsable doit vérifier les accès."
  };
  return map[code] || "Une erreur est survenue.";
}

let currentUser = null; // {uid, displayName, isAdmin}
let listenersAttached = false;
let registrationPromise = null;
let demoMode = false;
let connected = false;
let sendPending = false;
let sessionVersion = 0;
const subscriptions = [];
function listen(query, callback) {
  const version=sessionVersion;
  query.on('value', snap=>{if(currentUser && version===sessionVersion)callback(snap);}, () => {if(version===sessionVersion)showToast('Impossible de charger les données. Le responsable doit vérifier les accès.');});
  subscriptions.push(query);
}
function detachListeners(){
  resetPrivate();
  resetEngagement();
  analyticsRecorded=false;analyticsPending=false;document.getElementById('stats-content').replaceChildren();document.querySelector('[data-panel="stats"]').hidden=true;
  sessionVersion++;
  sendPending=false;
  document.getElementById('chat-send').disabled=false;
  subscriptions.splice(0).forEach(query => query.off());
  listenersAttached = false;
  ['chat-messages','news-list','council-list','requests-list','members-grid','council-form-slot','requests-form-slot'].forEach(id=>document.getElementById(id).replaceChildren());
  document.getElementById('requests-badge').style.display='none';
  document.getElementById('chat-input').value='';
  document.getElementById('char-count').textContent='0 / 4 000';
  document.getElementById('message-search').value='';
  document.querySelectorAll('.form-card input,.form-card textarea').forEach(input=>input.value='');
  [knownMessageIds,knownNewsIds,knownCouncilIds,knownRequestIds,knownMemberKeys].forEach(set=>set.clear());
}

// ---------- AUTH VIEW SWITCHING ----------
function showAuthView(view){
  document.getElementById('guest-form').style.display=view==='guest'?'block':'none';
  document.getElementById('show-guest').style.display=view==='guest'?'none':'flex';
  document.getElementById('login-form').style.display = view==='login' ? 'block' : 'none';
  document.getElementById('signup-form').style.display = view==='signup' ? 'block' : 'none';
  document.getElementById('forgot-form').style.display = view==='forgot' ? 'block' : 'none';
  const subs = {
    guest:"Un pseudo suffit pour participer aux échanges.",
    login:"Connecte-toi pour rejoindre la discussion de la classe.",
    signup:"Choisis un pseudo, un e-mail et un mot de passe.",
    forgot:"On t'envoie un lien par e-mail pour choisir un nouveau mot de passe."
  };
  document.getElementById('auth-sub').textContent = subs[view];
  ['login-error','signup-error','forgot-error','forgot-ok','guest-error'].forEach(id => document.getElementById(id).textContent = '');
}
document.getElementById('show-guest').onclick=()=>showAuthView('guest');
document.getElementById('guest-to-email').onclick=()=>showAuthView('login');
document.getElementById('guest-btn').onclick=withLoading(document.getElementById('guest-btn'),async()=>{
  const displayName=document.getElementById('guest-name').value.trim();
  const error=document.getElementById('guest-error');error.textContent='';
  if(!displayName || displayName.length>40){error.textContent='Choisis un pseudo de 1 à 40 caractères.';return;}
  if(registrationPromise){error.textContent='Une connexion est déjà en cours.';return;}
  try{
    registrationPromise=(async()=>{
      const cred=await auth.signInAnonymously();
      const existing=await db.ref('users/'+cred.user.uid).once('value');
      // A retry must keep an existing profile rather than overwrite it.
      if(!existing.exists()){
        await cred.user.updateProfile({displayName});
        await db.ref('users/'+cred.user.uid).set({displayName,joinedAt:firebase.database.ServerValue.TIMESTAMP,isAdmin:false});
      }
    })();
    await registrationPromise;
    registrationPromise=null;
    if(currentUser?.uid!==auth.currentUser?.uid)await handleAuthState(auth.currentUser);
    showToast('Bienvenue ! Ton accès sans e-mail est lié à ce navigateur.');
  }catch(e){error.textContent=friendlyAuthError(e.code);}
  finally{registrationPromise=null;}
});
document.getElementById('show-signup').onclick = () => showAuthView('signup');
document.getElementById('show-login').onclick = () => showAuthView('login');
document.getElementById('show-forgot').onclick = () => showAuthView('forgot');
document.getElementById('show-login-from-forgot').onclick = () => showAuthView('login');

// ---------- SIGNUP ----------
document.getElementById('signup-btn').onclick = withLoading(document.getElementById('signup-btn'), async () => {
  const displayName = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const errEl = document.getElementById('signup-error');
  errEl.textContent = '';
  if (displayName.length>40){errEl.textContent='Ton prénom doit faire 40 caractères maximum.';return;}
  if (!displayName || !email || !password){ errEl.textContent = 'Remplis tous les champs.'; return; }
  if(registrationPromise){errEl.textContent='Une connexion est déjà en cours.';return;}
  try{
    
    registrationPromise = (async () => {
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      await cred.user.updateProfile({ displayName });
      await db.ref('users/'+cred.user.uid).set({displayName, joinedAt: firebase.database.ServerValue.TIMESTAMP, isAdmin:false});
    })();
    try { await registrationPromise; showToast('Bienvenue dans la classe !'); }
    finally { registrationPromise = null; }
  }catch(e){ errEl.textContent = friendlyAuthError(e.code); }
});

// ---------- LOGIN ----------
document.getElementById('login-btn').onclick = withLoading(document.getElementById('login-btn'), async () => {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  if (!email || !password){ errEl.textContent = 'Remplis tous les champs.'; return; }
  try{ await auth.signInWithEmailAndPassword(email, password); }
  catch(e){ errEl.textContent = friendlyAuthError(e.code); }
});

// ---------- FORGOT PASSWORD ----------
document.getElementById('forgot-btn').onclick = withLoading(document.getElementById('forgot-btn'), async () => {
  const email = document.getElementById('forgot-email').value.trim();
  const errEl = document.getElementById('forgot-error');
  const okEl = document.getElementById('forgot-ok');
  errEl.textContent = ''; okEl.textContent = '';
  if (!email){ errEl.textContent = 'Indique ton e-mail.'; return; }
  try{
    await auth.sendPasswordResetEmail(email);
    okEl.textContent = 'E-mail envoyé ! Vérifie ta boîte de réception (et les spams).';
  }catch(e){ errEl.textContent = friendlyAuthError(e.code); }
});

// ---------- LOGOUT ----------
document.getElementById('logout-btn').onclick = async () => {
  if(demoMode){demoMode=false;currentUser=null;detachListeners();appEl.classList.remove('active');authScreen.style.display='flex';document.getElementById('preview-banner')?.remove();return;}
  if(auth.currentUser?.isAnonymous && !window.confirm('Ton compte est sans e-mail. En te déconnectant, tu perdras l’accès à cette identité : ton pseudo seul ne permet pas de la retrouver. Veux-tu te déconnecter ?'))return;
  try{await auth.signOut();}catch{showToast('Déconnexion impossible. Réessaie.');}
};

// ---------- AUTH STATE ----------
const authScreen = document.getElementById('auth-screen');
const appEl = document.getElementById('app');

async function handleAuthState(user) {
  if(demoMode && !user) return;
  detachListeners();
  const version=sessionVersion;
  try{
  if(registrationPromise) await registrationPromise;
  if(user && auth.currentUser?.uid !== user.uid) return;
  if (user){
    const snap = await db.ref('users/'+user.uid).once('value');
    if(version!==sessionVersion || auth.currentUser?.uid!==user.uid)return;
    let record = snap.val();
    if(!record){record={displayName:user.displayName || 'Élève',isAdmin:false,joinedAt:firebase.database.ServerValue.TIMESTAMP};await db.ref('users/'+user.uid).set(record);}
    if(version!==sessionVersion || auth.currentUser?.uid!==user.uid)return;
    currentUser = { uid:user.uid, displayName: record.displayName, isAdmin: !!record.isAdmin };
    authScreen.style.display = 'none';
    appEl.classList.add('active');
    document.getElementById('my-name').innerHTML = escapeHtml(currentUser.displayName) + (currentUser.isAdmin ? ' <span class="crown">👑</span>' : '');
    const av = document.getElementById('my-avatar');
    av.textContent = initials(currentUser.displayName);
    av.style.background = colorFor(currentUser.displayName);
    renderCouncilForm();
    renderRequestsForm();
    renderPollForm();
    attachListeners();
    document.querySelector('[data-panel="chat"]').click();
    document.querySelectorAll('input[autocomplete="current-password"],input[autocomplete="new-password"]').forEach(input=>input.value='');
    requestAnimationFrame(() => positionNavIndicator(document.querySelector('.nav-item.active')));
  } else {
    currentUser = null;
    appEl.classList.remove('active');
    authScreen.style.display = 'flex';
  }
  }catch(e){if(version!==sessionVersion)return;currentUser=null;appEl.classList.remove('active');authScreen.style.display='flex';document.getElementById('login-error').textContent='Impossible de charger ton profil. Vérifie la connexion ou contacte le responsable de la classe, puis reconnecte-toi.';}
}
if(auth) auth.onAuthStateChanged(handleAuthState);

// ---------- NAV ----------
function positionNavIndicator(btn){
  if (!btn) return;
  const indicator = document.getElementById('nav-indicator');
  const wrap = document.getElementById('nav-wrap');
  const wrapRect = wrap.getBoundingClientRect();
  const btnRect = btn.getBoundingClientRect();
  indicator.style.transform = `translateY(${btnRect.top - wrapRect.top}px)`;
  indicator.style.height = btnRect.height + 'px';
}
window.addEventListener('resize', () => positionNavIndicator(document.querySelector('.nav-item.active')));
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    positionNavIndicator(btn);
    document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
    document.getElementById('panel-'+btn.dataset.panel).classList.add('active');
    const titles = {
      chat: ['Discussion de classe', 'Un seul fil, ouvert à tout le monde.'],
      news: ['Actualités', "Annonces et infos importantes pour la classe."],
      council: ['Conseils de classe', "Comptes-rendus et décisions officielles."],
      requests: ['Demande au délégué', currentUser && currentUser.isAdmin ? "Messages reçus des élèves." : "Envoie un message privé au/à la délégué·e."],
      stats: ['Statistiques', 'Fréquentation avec consentement, réservée au délégué.'],
      polls: ['Votes de la classe', 'Donne ton avis et découvre les résultats en direct.'],
      schedule: ['Emploi du temps', 'Ta semaine, et tes propositions au délégué.'],
      members: ['Membres', 'Tous les élèves inscrits sur ClasseConnect.']
    };
    document.getElementById('panel-title').textContent = titles[btn.dataset.panel][0];
    document.getElementById('panel-sub').textContent = titles[btn.dataset.panel][1];
  };
});

// ---------- FORMS THAT DEPEND ON ROLE ----------
function renderCouncilForm(){
  const slot = document.getElementById('council-form-slot');
  if (currentUser.isAdmin){
    slot.innerHTML = `<div class="form-card"><input id="council-title" maxlength="120" aria-label="Titre du conseil de classe" type="text" placeholder="Titre du conseil de classe"><textarea id="council-content" maxlength="10000" aria-label="Compte-rendu" placeholder="Compte-rendu, décisions, informations..."></textarea><button id="council-publish">Publier</button></div>`;
    const btn = document.getElementById('council-publish');
    btn.onclick = withLoading(btn, async () => {
      const t = document.getElementById('council-title'), c = document.getElementById('council-content');
      if (!t.value.trim() || !c.value.trim()){showToast('Ajoute un titre et un compte-rendu.');return;}
      if(t.value.length>120 || c.value.length>10000){showToast('Le titre ou le compte-rendu est trop long.');return;}
      await publishContent('council',{ from:currentUser.uid, title:t.value.trim(), content:c.value.trim(), displayName: currentUser.displayName, ts: firebase.database.ServerValue.TIMESTAMP });
      t.value=''; c.value='';
      showToast('Publié dans les conseils de classe');
    });
  } else {
    slot.innerHTML = `<div class="info-banner">🔒 Seul·e le/la délégué·e de classe peut publier ici. Tu peux consulter les informations ci-dessous.</div>`;
  }
}
// ---------- REALTIME LISTENERS ----------
const chatMessagesEl = document.getElementById('chat-messages');
let knownMessageIds = new Set(), knownNewsIds = new Set(), knownCouncilIds = new Set(), knownRequestIds = new Set(), knownMemberKeys = new Set();

function attachListeners(){
  if (listenersAttached) return;
  listenersAttached = true;

  listen(db.ref('messages').limitToLast(300), snap => {
    const val = snap.val() || {};
    const messages = Object.entries(val).map(([id,m]) => ({id, ...m})).sort((a,b)=>(a.ts||0)-(b.ts||0));
    const wasAtBottom = chatMessagesEl.scrollTop + chatMessagesEl.clientHeight >= chatMessagesEl.scrollHeight - 40;
    if (messages.length === 0){
      chatMessagesEl.innerHTML = '<div class="empty-state"><span class="ee-icon">👋</span>Aucun message pour le moment — sois le premier à écrire</div>';
    } else {
      chatMessagesEl.innerHTML = messages.map(m => {
        const mine = m.from === currentUser.uid || m.uid === currentUser.uid;
        const isNew = !knownMessageIds.has(m.id);
        return `<div class="msg-row ${mine?'me':''} ${isNew?'enter':''}">
          <div class="avatar" style="background:${colorFor(m.displayName)}">${escapeHtml(initials(m.displayName))}</div>
          <div class="msg-body"><div class="meta">${mine?'Toi':escapeHtml(m.displayName)} à ${fmtTime(m.ts)}</div><div class="msg-bubble">${escapeHtml(m.text)}</div></div>
        </div>`;
      }).join('');
    }
    updateMessageNotices('chat',val);
    knownMessageIds = new Set(messages.map(m=>m.id));
    filterMessages();
    if (wasAtBottom) chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  });

  listen(db.ref('news'), snap => {
    const val = snap.val() || {};
    const items = Object.entries(val).map(([id,n])=>({id,...n})).sort((a,b)=>(b.ts||0)-(a.ts||0));
    const listEl = document.getElementById('news-list');
    listEl.innerHTML = items.length===0
      ? '<div class="empty-state"><span class="ee-icon">📣</span>Aucune actualité publiée pour le moment.</div>'
      : items.map((n,i) => `<div class="news-card ${!knownNewsIds.has(n.id)?'enter':''}" style="animation-delay:${i*35}ms"><h3>${escapeHtml(n.title)}</h3><p>${escapeHtml(n.content)}</p><div class="meta">Publié par ${escapeHtml(n.displayName)} à ${fmtTime(n.ts)}, le ${fmtDate(n.ts)}</div></div>`).join('');
    knownNewsIds = new Set(items.map(n=>n.id));
  });

  listen(db.ref('council'), snap => {
    const val = snap.val() || {};
    const items = Object.entries(val).map(([id,n])=>({id,...n})).sort((a,b)=>(b.ts||0)-(a.ts||0));
    const listEl = document.getElementById('council-list');
    listEl.innerHTML = items.length===0
      ? '<div class="empty-state"><span class="ee-icon">🏛️</span>Aucune information de conseil de classe pour le moment.</div>'
      : items.map((n,i) => `<div class="council-card ${!knownCouncilIds.has(n.id)?'enter':''}" style="animation-delay:${i*35}ms"><h3>${escapeHtml(n.title)}</h3><p>${escapeHtml(n.content)}</p><div class="meta">Par ${escapeHtml(n.displayName)}, le ${fmtDate(n.ts)}</div></div>`).join('');
    knownCouncilIds = new Set(items.map(n=>n.id));
  });

  attachPrivate();
  attachPolls();
  attachStats();recordConsentedVisit();

  listen(db.ref('users'), snap => {
    const val = snap.val() || {};
    const list = Object.entries(val).map(([uid,u])=>({...u,uid})).sort((a,b)=>(a.joinedAt||0)-(b.joinedAt||0));
    const grid = document.getElementById('members-grid');
    grid.innerHTML = list.length===0
      ? '<div class="empty-state"><span class="ee-icon">👥</span>Personne inscrit pour le moment.</div>'
      : list.map((u,i) => `<div class="member-card ${!knownMemberKeys.has(u.uid)?'enter':''}" style="animation-delay:${i*35}ms">
          <div class="avatar" style="background:${colorFor(u.displayName)}">${escapeHtml(initials(u.displayName))}</div>
          <div class="mname">${escapeHtml(u.displayName)} ${u.isAdmin?'<span class="crown">👑</span>':''}</div>
          <div class="mdate">Inscrit·e le ${fmtDate(u.joinedAt)}</div>
        </div>`).join('');
    knownMemberKeys = new Set(list.map(u=>u.uid));
  });
}

// ---------- SEND MESSAGE ----------
async function sendMessage(){
  const input=document.getElementById('chat-input'), text=input.value.trim();
  if(!text || !currentUser || sendPending) return;
  if(text.length>4000){showToast('Ton message est trop long (4 000 caractères maximum).');return;}
  if(demoMode){demoMessages.push({displayName:'Toi',text,from:'demo',ts:Date.now()});renderDemoMessages();input.value='';input.dispatchEvent(new Event('input'));return;}
  if(!connected){showToast('Tu es hors ligne. Ton brouillon reste ici.');return;}
  const version=sessionVersion;
  sendPending=true;const btn=document.getElementById('chat-send');btn.disabled=true;
  try{
    await publishContent('messages',{from:currentUser.uid,displayName:currentUser.displayName,text,ts:firebase.database.ServerValue.TIMESTAMP});
    if(version!==sessionVersion)return;
    if(input.value.trim()===text) input.value='';
    input.dispatchEvent(new Event('input'));
    chatMessagesEl.scrollTop=chatMessagesEl.scrollHeight;
  }catch(e){if(version===sessionVersion)showToast('Message non envoyé. Ton texte est conservé : réessaie.');}
  finally{if(version===sessionVersion){sendPending=false;btn.disabled=false;input.focus();}}
}
document.getElementById('chat-send').onclick = sendMessage;
document.getElementById('chat-input').addEventListener('keydown', e => { if (e.key==='Enter' && !e.shiftKey && !e.isComposing){e.preventDefault();sendMessage();} });

// ---------- PUBLISH NEWS ----------
document.getElementById('news-publish').onclick = withLoading(document.getElementById('news-publish'), async () => {
  const titleEl = document.getElementById('news-title'), contentEl = document.getElementById('news-content');
  const title = titleEl.value.trim(), content = contentEl.value.trim();
  if (!title || !content){showToast('Ajoute un titre et le contenu de ton annonce.');return;}
  if(title.length>120 || content.length>10000){showToast('Le titre ou le contenu est trop long.');return;}
  await publishContent('news',{ from:currentUser.uid, title, content, displayName: currentUser.displayName, ts: firebase.database.ServerValue.TIMESTAMP });
  titleEl.value=''; contentEl.value='';
  showToast('Actualité publiée');
});

// Interface enhancements shared by the real workspace and the isolated preview.
const demoMessages = [
  {displayName:'Léa Martin',from:'lea',text:'Hello la classe ! Quelqu’un a noté les exercices de maths pour jeudi ? 📚',ts:Date.now()-720000},
  {displayName:'Adam Bernard',from:'adam',text:'Oui ! Les exercices 12 et 14, page 86. Je peux vous expliquer le dernier si vous voulez.',ts:Date.now()-620000},
  {displayName:'Toi',from:'demo',text:'Trop bien, merci Adam ! On peut les revoir ensemble demain ✨',ts:Date.now()-500000},
  {displayName:'Emma Dubois',from:'emma',text:'Partante aussi ! On se retrouve à la bibliothèque à la pause ?',ts:Date.now()-400000}
];
function filterMessages(){
  const value=document.getElementById('message-search').value.toLocaleLowerCase('fr').trim();
  let count=0;
  chatMessagesEl.querySelectorAll('.msg-row').forEach(row=>{row.hidden=!!value&&!row.textContent.toLocaleLowerCase('fr').includes(value);if(!row.hidden)count++;});
  document.getElementById('search-empty')?.remove();
  if(value&&!count){const empty=document.createElement('div');empty.id='search-empty';empty.className='empty-state';empty.textContent='Aucun message ne correspond à ta recherche.';chatMessagesEl.append(empty);}
}
function renderDemoMessages(){
  chatMessagesEl.innerHTML='<div class="day-divider"><span>EXEMPLE DE DISCUSSION · AUJOURD’HUI</span></div>'+demoMessages.map(m=>`<div class="msg-row ${m.from==='demo'?'me':''} enter"><div class="avatar" style="background:${colorFor(m.displayName)}">${escapeHtml(initials(m.displayName))}</div><div class="msg-body"><div class="meta">${escapeHtml(m.displayName)} <span>${fmtTime(m.ts)}</span></div><div class="msg-bubble">${escapeHtml(m.text)}</div></div></div>`).join('');
  filterMessages();chatMessagesEl.scrollTop=chatMessagesEl.scrollHeight;
}
document.getElementById('preview-btn').onclick=()=>{
  detachListeners();demoMode=true;currentUser={uid:'demo',displayName:'Camille',isAdmin:false};
  authScreen.style.display='none';appEl.classList.add('active');
  document.getElementById('my-avatar').textContent='CA';document.getElementById('my-avatar').style.background='#7866df';document.getElementById('my-name').textContent='Camille';
  document.getElementById('connection-status').textContent='Aperçu interactif';
  document.getElementById('connection-status').classList.remove('online');
  const banner=document.createElement('div');banner.id='preview-banner';banner.innerHTML='<span><b>Mode découverte</b> · Données fictives. Tes essais restent dans cette page.</span><button id="leave-preview">Rejoindre ma classe →</button>';document.querySelector('.main').prepend(banner);
  document.getElementById('leave-preview').onclick=()=>document.getElementById('logout-btn').click();
  renderCouncilForm();renderRequestsForm();renderPollForm();renderPolls();renderDemoMessages();
  document.getElementById('news-list').innerHTML='<article class="news-card enter"><div class="card-category">VIE DE CLASSE · EXEMPLE</div><h3>Un espace pour rester connectés.</h3><p>Partagez ici les informations utiles, les projets et les bonnes nouvelles de la classe.</p><div class="meta">Exemple d’annonce</div></article>';
  document.getElementById('council-list').innerHTML='<article class="council-card enter"><div class="card-category">CONSEIL DE CLASSE · EXEMPLE</div><h3>Vos idées ont leur place ici.</h3><p>Retrouvez les comptes-rendus et les décisions partagés par votre délégué.</p></article>';
  document.getElementById('members-grid').innerHTML=['Léa Martin','Adam Bernard','Emma Dubois','Camille'].map(name=>`<div class="member-card enter"><div class="avatar" style="background:${colorFor(name)}">${initials(name)}</div><div class="mname">${name}</div><div class="mdate">Membre fictif · aperçu</div></div>`).join('');
  document.querySelector('[data-panel="chat"]').click();
};
document.getElementById('message-search').addEventListener('input',filterMessages);
document.getElementById('chat-input').addEventListener('input',e=>{
  document.getElementById('char-count').textContent=e.target.value.length+' / 4 000';
  e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,144)+'px';
});
document.getElementById('emoji-btn').onclick=()=>{
  const input=document.getElementById('chat-input');
  if(input.value.length<3998){input.setRangeText('😊',input.selectionStart,input.selectionEnd,'end');input.dispatchEvent(new Event('input'));input.focus();}
};
document.querySelectorAll('.auth-form').forEach(form=>form.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&e.target.tagName==='INPUT'){e.preventDefault();form.querySelector('.btn-primary').click();}
}));
document.querySelectorAll('.auth-form input[type="password"]').forEach(input=>{
  const wrap=document.createElement('div');wrap.className='password-wrap';input.before(wrap);wrap.append(input);
  const button=document.createElement('button');button.type='button';button.className='password-toggle';button.textContent='Voir';button.setAttribute('aria-label','Afficher le mot de passe');
  button.onclick=()=>{const show=input.type==='password';input.type=show?'text':'password';button.textContent=show?'Masquer':'Voir';button.setAttribute('aria-label',show?'Masquer le mot de passe':'Afficher le mot de passe');button.setAttribute('aria-pressed',String(show));};wrap.append(button);
});
const authTitles={login:'Heureux de te revoir.',signup:'Ta place est ici.',forgot:'On retrouve ton accès.',guest:'Un pseudo. Et te voilà.'};
const originalShowAuthView=showAuthView;
showAuthView=function(view){originalShowAuthView(view);document.getElementById('auth-heading').textContent=authTitles[view];};
document.querySelectorAll('.nav-item').forEach(btn=>{btn.setAttribute('aria-label',btn.querySelector('.label').textContent);btn.addEventListener('click',()=>document.querySelectorAll('.nav-item').forEach(item=>item.setAttribute('aria-current',item===btn?'page':'false')));});
document.querySelector('.nav-item.active').setAttribute('aria-current','page');
const statusEl=document.getElementById('connection-status');
if(db){db.ref('.info/connected').on('value',snap=>{connected=snap.val()===true;if(connected)queueMicrotask(recordConsentedVisit);if(!demoMode){statusEl.textContent=connected?'Connecté au service':'Hors ligne · brouillons conservés';statusEl.classList.toggle('online',connected);}});}
else {statusEl.textContent='Service indisponible';document.getElementById('login-error').textContent='Connexion au service impossible. Vérifie ton réseau puis recharge la page.';}
// Preserve paragraphs and safe limits in every publishing form.
document.querySelectorAll('input[id$="title"]').forEach(input=>input.maxLength=120);
document.querySelectorAll('.form-card textarea').forEach(input=>{input.maxLength=10000;input.setAttribute('aria-label',input.placeholder);});
document.querySelectorAll('.form-card input').forEach(input=>input.setAttribute('aria-label',input.placeholder));

// Private threads: the student's uid is the stable conversation identifier.
let privateThreads={}, activePrivateUid=null, privatePending=false;
function resetPrivate(){privateThreads={};activePrivateUid=null;privatePending=false;document.getElementById('proposal-dialog')?.close();document.getElementById('proposal-form')?.reset();}
function renderRequestsForm(){
  activePrivateUid=currentUser.isAdmin?null:currentUser.uid;
  document.getElementById('requests-form-slot').innerHTML='<div class="info-banner">🔒 Un échange privé entre l’élève concerné et le délégué. Les autres élèves n’y ont pas accès.</div>';
  document.getElementById('requests-list').innerHTML='<div class="private-layout"><aside id="private-inbox" aria-label="Conversations privées"></aside><section class="private-thread"><h3 id="private-title">Ton échange avec le délégué</h3><div id="private-messages" aria-live="polite"></div><form id="private-form"><label for="private-input">Ton message privé</label><textarea id="private-input" maxlength="4000" placeholder="Une question, une idée, une proposition…" required></textarea><button class="btn-primary" id="private-send">Envoyer au délégué</button></form></section></div>';
  document.getElementById('private-inbox').hidden=!currentUser.isAdmin;
  document.getElementById('private-form').onsubmit=async e=>{e.preventDefault();const input=document.getElementById('private-input'),text=input.value.trim(),uid=activePrivateUid,version=sessionVersion;if(await sendPrivate(uid,text,'message')&&version===sessionVersion&&uid===activePrivateUid&&input.value.trim()===text)input.value='';};
  renderPrivate();renderTimetable();
}
function attachPrivate(){
  const path=currentUser.isAdmin?'conversations':'conversations/'+currentUser.uid;
  listen(db.ref(path),snap=>{privateThreads=currentUser.isAdmin?(snap.val()||{}):{[currentUser.uid]:snap.val()||{}};renderPrivate();for(const [uid,thread] of Object.entries(privateThreads))updateMessageNotices('private:'+uid,thread.messages||{});});
}
function renderPrivate(){
  const box=document.getElementById('private-messages');if(!box||!currentUser)return;
  if(currentUser.isAdmin){
    const entries=Object.entries(privateThreads).filter(([,t])=>t.messages).sort((a,b)=>Math.max(...Object.values(b[1].messages).map(m=>m.ts||0))-Math.max(...Object.values(a[1].messages).map(m=>m.ts||0)));
    if(!activePrivateUid&&entries.length)activePrivateUid=entries[0][0];
    const inbox=document.getElementById('private-inbox');inbox.replaceChildren();
    entries.forEach(([uid,t])=>{const messages=Object.values(t.messages),name=messages.find(m=>m.from===uid)?.displayName||'Élève';const button=document.createElement('button');button.className='thread-choice'+(uid===activePrivateUid?' selected':'');button.textContent=name+' · '+messages.length+' message(s)';button.onclick=()=>{if(privatePending)return;activePrivateUid=uid;document.getElementById('private-input').value='';renderPrivate();markVisibleRead();};inbox.append(button);});
    if(!entries.length)inbox.textContent='Aucune conversation reçue.';
  }
  const messages=Object.values(privateThreads[activePrivateUid]?.messages||{}).sort((a,b)=>(a.ts||0)-(b.ts||0));
  const name=messages.find(m=>m.from===activePrivateUid)?.displayName||'Élève';
  document.getElementById('private-title').textContent=currentUser.isAdmin?(activePrivateUid?'Conversation avec '+name:'Choisis une conversation'):'Ton échange avec le délégué';
  box.innerHTML=messages.length?messages.map(m=>'<article class="private-message '+(m.from===currentUser.uid?'mine':'')+'"><div class="meta">'+escapeHtml(m.displayName)+' · '+fmtDate(m.ts)+' '+fmtTime(m.ts)+'</div>'+(m.kind==='proposal'?'<span class="proposal-tag">Proposition · à examiner</span>':'')+'<p>'+escapeHtml(m.text)+'</p></article>').join(''):'<div class="empty-state">'+(currentUser.isAdmin?'Les conversations apparaîtront ici dès qu’un élève t’écrira. Sélectionne un élève pour lire ses messages et lui répondre.':'Ton premier message commencera une conversation privée. Tu retrouveras ici les réponses du délégué.')+'</div>';
  document.getElementById('private-form').hidden=!activePrivateUid;
  document.getElementById('private-send').textContent=currentUser.isAdmin?'Répondre à cet élève':'Envoyer au délégué';
  box.scrollTop=box.scrollHeight;
}
async function sendPrivate(uid,text,kind){
  if(!currentUser||!uid||privatePending||!text||text.length>4000)return false;
  if(!demoMode&&!connected){showToast('Tu es hors ligne. Ton brouillon est conservé.');return false;}
  const version=sessionVersion;privatePending=true;const btn=document.getElementById('private-send');if(btn)btn.disabled=true;
  const message={from:currentUser.uid,displayName:currentUser.displayName,text,kind,ts:demoMode?Date.now():firebase.database.ServerValue.TIMESTAMP};
  try{
    if(demoMode){privateThreads[uid]??={messages:{}};privateThreads[uid].messages['demo'+Date.now()]=message;renderPrivate();}
    else await publishContent('conversations/'+uid+'/messages',message);
    return version===sessionVersion;
  }catch{if(version===sessionVersion)showToast('Message privé non envoyé. Ton texte est conservé.');return false;}
  finally{if(version===sessionVersion){privatePending=false;if(btn)btn.disabled=false;}}
}
// Q1/Q2 are the alternating periods printed on the supplied timetable.
const schoolDays=['Lundi','Mardi','Mercredi','Jeudi','Vendredi'];
const subjects={math:['Mathématiques','TKACZYK C.','B 14'],fr:['Français','VENANT I.','C 30'],eps:['EPS','LEBRUN D.',''],pc:['Physique-chimie','DIVE F.','BS 17'],en:['Anglais LV1','IDRI S.','A 05'],es:['Espagnol LV2','MAKHLOUF S.','A 07'],latin:['LCA Latin','VERITE I.','C 23'],tech:['Technologie','FRIKHA A.','TECHNO 1'],hg:['Histoire-géographie','GOHIER T.','A 06'],emc:['Enseignement moral et civique','GOHIER T.','A 06'],svt:['Sciences de la vie et de la Terre','HISBERGUE J.','BS 18'],art:['Arts plastiques','FROMENT I.','C 25'],mus:['Éducation musicale','CATTEVILLE P.','MUSIQUE'],vie:['Vie de classe','CATTEVILLE P.',''],aide:['Accompagnement aux devoirs','Selon le groupe et les semaines','Salle à confirmer']};
const lessons=[
 [0,'08:00','10:00','eps'],[0,'10:00','11:00','math'],[0,'11:00','12:00','pc'],[0,'12:30','13:30','aide'],[0,'13:30','14:30','fr'],[0,'14:30','15:30','fr'],[0,'15:30','16:30','vie','Q1'],[0,'15:30','16:30','en','Q2'],
 [1,'08:00','09:00','math','Q1'],[1,'08:00','09:00','latin','Q2'],[1,'09:00','10:00','latin','Q1'],[1,'09:00','10:00','tech','Q2'],[1,'10:00','11:00','es','Q1'],[1,'10:00','11:00','fr','Q2'],[1,'11:00','12:00','en'],[1,'12:30','13:30','aide'],[1,'13:30','14:30','emc','Q1'],[1,'13:30','14:30','svt','Q2'],[1,'14:30','15:30','fr','Q1'],[1,'14:30','15:30','en','Q2'],[1,'15:30','16:30','hg'],
 [2,'08:00','09:00','es'],[2,'09:00','10:00','tech','Q1'],[2,'09:00','10:00','fr','Q2'],[2,'10:00','11:00','math'],[2,'11:00','12:00','latin'],
 [3,'08:00','10:00','eps','Q1'],[3,'08:00','09:00','math','Q2'],[3,'09:00','10:00','hg','Q2'],[3,'10:00','11:00','mus'],[3,'11:00','12:00','en'],[3,'12:30','13:30','aide'],[3,'16:30','17:30','aide'],
 [4,'08:00','09:00','fr'],[4,'09:00','10:00','es'],[4,'10:00','11:00','hg'],[4,'11:00','12:00','art','Q1'],[4,'11:00','12:00','pc','Q2'],[4,'12:30','13:30','aide'],[4,'13:30','14:30','math'],[4,'14:30','15:30','tech','Q1'],[4,'14:30','15:30','art','Q2'],[4,'15:30','16:30','svt']
].map(([day,start,end,subject,period],id)=>({id,day,start,end,subject,period:period||'Q1 + Q2'}));
function lessonLabel(l){return schoolDays[l.day]+' '+l.start+'–'+l.end+' · '+subjects[l.subject][0]+' · '+l.period;}
function renderTimetable(){
  const period=document.getElementById('schedule-period').value;
  document.getElementById('schedule-grid').innerHTML=schoolDays.map((day,i)=>'<section class="schedule-day"><h3>'+day+'</h3>'+lessons.filter(l=>l.day===i&&l.period.includes(period)).map(l=>'<button class="lesson lesson-'+l.subject+'" data-lesson="'+l.id+'"><span class="lesson-time">'+l.start+' — '+l.end+'<em>'+l.period+'</em></span><strong>'+subjects[l.subject][0]+'</strong><span>'+subjects[l.subject][1]+'</span><small>'+subjects[l.subject][2]+(l.subject==='aide'?' · selon semaines':'')+'</small></button>').join('')+'</section>').join('');
  document.querySelectorAll('#schedule-grid [data-lesson]').forEach(b=>b.onclick=()=>openProposal(Number(b.dataset.lesson)));
}
function openProposal(id){
  if(currentUser?.isAdmin){showToast('Les élèves t’envoient leurs propositions dans les conversations privées.');return;}
  const form=document.getElementById('proposal-form');form.reset();form.dataset.lesson=id;
  document.getElementById('proposal-course').textContent=lessonLabel(lessons[id]);
  document.getElementById('proposal-other').innerHTML='<option value="">Choisir le second cours</option>'+lessons.filter(l=>l.id!==id).map(l=>'<option value="'+l.id+'">'+lessonLabel(l)+'</option>').join('');
  document.getElementById('swap-field').hidden=true;document.getElementById('proposal-other').required=false;
  document.getElementById('proposal-dialog').showModal();
}
document.getElementById('schedule-period').onchange=renderTimetable;
document.getElementById('proposal-close').onclick=()=>document.getElementById('proposal-dialog').close();
document.getElementById('proposal-action').onchange=e=>{const swap=e.target.value==='Inverser deux cours';document.getElementById('swap-field').hidden=!swap;document.getElementById('proposal-other').required=swap;};
document.getElementById('proposal-form').onsubmit=async e=>{
  e.preventDefault();const form=e.currentTarget,button=document.getElementById('proposal-send');if(button.disabled||!currentUser||currentUser.isAdmin)return;
  const lesson=lessons[Number(form.dataset.lesson)],action=document.getElementById('proposal-action').value,other=lessons[Number(document.getElementById('proposal-other').value)],reason=document.getElementById('proposal-reason').value.trim(),date=document.getElementById('proposal-date').value;
  if(!reason||!date||(action==='Inverser deux cours'&&(!document.getElementById('proposal-other').value||other.id===lesson.id)))return;
  if(new Date(date+'T12:00:00').getDay()!==lesson.day+1){showToast('La date doit correspondre au jour du cours sélectionné.');return;}
  const text='Proposition : '+action+'\nCours : '+lessonLabel(lesson)+'\nDate concernée : '+date.split('-').reverse().join('/')+(action==='Inverser deux cours'?'\nAvec : '+lessonLabel(other):'')+'\nMotif / créneau souhaité : '+reason+'\n\nÀ examiner par le délégué. Le planning reste inchangé.';
  button.disabled=true;const version=sessionVersion;
  try{if(await sendPrivate(currentUser.uid,text,'proposal')&&version===sessionVersion){document.getElementById('proposal-dialog').close();document.querySelector('[data-panel="requests"]').click();showToast(demoMode?'Proposition de démonstration, non envoyée.':'Proposition envoyée dans ta conversation privée.');}}finally{button.disabled=false;}
};

// In-app notifications; only read timestamps are retained on this browser.
let notificationStreams=new Map(), browserAlerts=false, notificationObjects=[];
function readStamp(key,fallback){try{const value=localStorage.getItem('cc-read:'+currentUser.uid+':'+key);return value===null?fallback:Number(value)||0;}catch{return fallback;}}
function storeStamp(key,value){if(demoMode)return;try{localStorage.setItem('cc-read:'+currentUser.uid+':'+key,String(value));}catch{}}
function streamVisible(key){if(document.visibilityState==='hidden')return false;const panel=document.querySelector('.nav-item.active')?.dataset.panel;return key==='chat'?panel==='chat':panel==='requests'&&key==='private:'+activePrivateUid;}
function updateMessageNotices(key,messages){
  if(!currentUser||demoMode)return;
  const entries=Object.entries(messages||{}).filter(([,m])=>m.from!==currentUser.uid&&typeof m.ts==='number');
  const max=Math.max(0,...entries.map(([,m])=>m.ts));
  let state=notificationStreams.get(key);const first=!state;
  if(!state){state={read:readStamp(key,max),seen:new Set(),unread:0,max};notificationStreams.set(key,state);storeStamp(key,state.read);}
  const fresh=entries.filter(([id,m])=>!state.seen.has(id)&&m.ts>state.read);state.max=max;
  state.seen=new Set(entries.map(([id])=>id));
  if(streamVisible(key)){state.read=Math.max(state.read,max);storeStamp(key,state.read);}
  state.unread=entries.filter(([,m])=>m.ts>state.read).length;
  if(!first&&fresh.length&&!streamVisible(key)){
    const label=key==='chat'?'Nouveau message dans la classe':'Nouveau message privé';showToast(label);
    if(browserAlerts&&typeof Notification!=='undefined'&&Notification.permission==='granted'){
      try{const notice=new Notification('ClasseConnect',{body:label,tag:'classeconnect-'+key});notificationObjects.push(notice);notice.onclick=()=>{if(!currentUser)return;window.focus();if(key!=='chat'){activePrivateUid=key.slice(8);renderPrivate();}document.querySelector('[data-panel="'+(key==='chat'?'chat':'requests')+'"]').click();notice.close();};}catch{}
    }
  }
  renderNoticeCounts();
}
function markVisibleRead(){for(const [key,s] of notificationStreams){if(streamVisible(key)){s.read=Math.max(s.read,s.max);s.unread=0;storeStamp(key,s.read);}}renderNoticeCounts();}
function renderNoticeCounts(){
  let privateCount=0;for(const [key,s] of notificationStreams)if(key.startsWith('private:'))privateCount+=s.unread;
  const chatCount=notificationStreams.get('chat')?.unread||0;
  for(const [id,count] of [['chat-badge',chatCount],['requests-badge',privateCount]]){const badge=document.getElementById(id);badge.textContent=count>99?'99+':String(count);badge.style.display=count?'inline-flex':'none';}
  const total=chatCount+privateCount;document.title=(total?'('+total+') ':'')+'ClasseConnect — La classe, ensemble.';
  document.getElementById('notification-count').textContent=total?total+' message(s) non lu(s)':'Aucun nouveau message';
}
function resetEngagement(){notificationStreams.clear();notificationObjects.forEach(n=>n.close());notificationObjects=[];browserAlerts=false;document.getElementById('browser-notifications').textContent='Activer les alertes du navigateur';pollData={};pollPending.clear();document.getElementById('poll-form-slot').replaceChildren();document.getElementById('poll-list').replaceChildren();renderNoticeCounts();}
document.addEventListener('visibilitychange',markVisibleRead);window.addEventListener('focus',markVisibleRead);
document.querySelectorAll('.nav-item').forEach(btn=>btn.addEventListener('click',markVisibleRead));
document.getElementById('notifications-button').onclick=()=>{const box=document.getElementById('notification-settings');box.hidden=!box.hidden;document.getElementById('notifications-button').setAttribute('aria-expanded',String(!box.hidden));};
document.getElementById('browser-notifications').onclick=async()=>{
  if(demoMode){showToast('Les alertes réelles sont disponibles après connexion.');return;}
  if(typeof Notification==='undefined'){showToast('Ce navigateur ne prend pas en charge ces alertes. Les badges restent disponibles.');return;}
  if(browserAlerts){browserAlerts=false;document.getElementById('browser-notifications').textContent='Activer les alertes du navigateur';return;}
  const version=sessionVersion;try{const permission=await Notification.requestPermission();if(version!==sessionVersion)return;browserAlerts=permission==='granted';document.getElementById('browser-notifications').textContent=browserAlerts?'Désactiver les alertes du navigateur':'Activer les alertes du navigateur';showToast(browserAlerts?'Alertes activées tant que le site reste ouvert.':'Les badges restent actifs. Tu peux autoriser les alertes dans les paramètres du navigateur.');}catch{showToast('Les alertes du navigateur sont indisponibles. Les badges restent actifs.');}
};

let pollData={},pollPending=new Set();
function renderPollForm(){
 const slot=document.getElementById('poll-form-slot');
 slot.innerHTML=currentUser.isAdmin?'<form class="form-card" id="poll-create"><h2>Organiser un vote</h2><label for="poll-question">Ta question</label><input id="poll-question" maxlength="180" required placeholder="Quel projet pour la classe ?"><label for="poll-options">Les choix · un par ligne, de 2 à 6</label><textarea id="poll-options" rows="4" maxlength="605" required placeholder="Premier choix\nDeuxième choix"></textarea><p class="poll-note">Un choix par compte, modifiable jusqu’à la clôture. Les résultats sont visibles par les membres. Ce vote n’est pas anonyme.</p><button id="poll-publish">Lancer le vote</button></form>':'<div class="info-banner">Le délégué organise les votes. Choisis une réponse ; tu peux changer d’avis jusqu’à la clôture. Un choix par compte. Ce vote n’est pas anonyme.</div>';
 if(!currentUser.isAdmin)return;
 const button=document.getElementById('poll-publish');document.getElementById('poll-create').onsubmit=async e=>{e.preventDefault();await withLoading(button,async()=>{
   const q=document.getElementById('poll-question'),o=document.getElementById('poll-options'),question=q.value.trim(),options=o.value.split('\n').map(x=>x.trim()).filter(Boolean);
   if(!question||question.length>180||options.length<2||options.length>6||options.some(x=>x.length>100)||new Set(options.map(x=>x.toLocaleLowerCase('fr'))).size!==options.length){showToast('Ajoute une question et 2 à 6 choix différents (100 caractères maximum par choix).');return;}
   const version=sessionVersion,oldOptions=o.value;
   await publishContent('polls',{question,options:Object.fromEntries(options.map((x,i)=>['o'+i,x])),from:currentUser.uid,displayName:currentUser.displayName,ts:firebase.database.ServerValue.TIMESTAMP,status:'open'});
   if(version!==sessionVersion)return;if(q.value.trim()===question)q.value='';if(o.value===oldOptions)o.value='';showToast('Le vote est ouvert à la classe.');
 })();};
}
function attachPolls(){listen(db.ref('polls'),snap=>{pollData=snap.val()||{};renderPolls();});}
function renderPolls(){
 const list=document.getElementById('poll-list');list.replaceChildren();
 const entries=Object.entries(pollData).sort((a,b)=>(b[1].ts||0)-(a[1].ts||0));
 if(!entries.length){list.innerHTML='<div class="empty-state">🗳️ Aucun vote pour le moment. Les prochains votes de la classe apparaîtront ici.</div>';return;}
 for(const [id,poll] of entries){
   const votes=Object.values(poll.votes||{}),mine=poll.votes?.[currentUser.uid],card=document.createElement('article');card.className='poll-card';
   card.innerHTML='<div class="poll-heading"><span class="proposal-tag">'+(poll.status==='open'?'VOTE OUVERT':'VOTE CLOS')+'</span><span class="meta">'+votes.length+' participation(s)</span></div><h3>'+escapeHtml(poll.question)+'</h3><p class="meta">Par '+escapeHtml(poll.displayName)+' · '+fmtDate(poll.ts)+'</p><div class="poll-choices"></div>';
   for(const [option,label] of Object.entries(poll.options||{})){
     const count=votes.filter(v=>v===option).length,percent=votes.length?Math.round(count/votes.length*100):0,button=document.createElement('button');button.className='poll-choice'+(mine===option?' chosen':'');button.setAttribute('aria-pressed',String(mine===option));button.disabled=poll.status!=='open'||pollPending.has(id);
     button.innerHTML='<span>'+escapeHtml(label)+(mine===option?' ✓':'')+'</span><b>'+count+' · '+percent+' %</b><span class="poll-progress" style="width:'+percent+'%"></span>';
     button.onclick=()=>actOnPoll(id,()=>db.ref('polls/'+id+'/votes/'+currentUser.uid).set(option));card.querySelector('.poll-choices').append(button);
   }
   if(currentUser.isAdmin&&poll.status==='open'){const close=document.createElement('button');close.className='poll-close';close.textContent='Clôturer le vote';close.disabled=pollPending.has(id);close.onclick=()=>{if(window.confirm('Clôturer ce vote ? Les résultats resteront visibles et les réponses ne pourront plus changer.'))actOnPoll(id,()=>db.ref('polls/'+id+'/status').set('closed'));};card.append(close);}
   list.append(card);
 }
}
async function actOnPoll(id,write){
 if(pollPending.has(id)||!currentUser)return;
 if(demoMode){showToast('Connecte-toi pour participer aux votes de ta classe.');return;}
 if(!connected){showToast('Tu es hors ligne. Réessaie après reconnexion.');return;}
 const version=sessionVersion;pollPending.add(id);renderPolls();try{await write();if(version===sessionVersion)showToast('C’est enregistré.');}catch{if(version===sessionVersion)showToast('Action non enregistrée. Le vote est peut-être clos ; réessaie.');}finally{if(version===sessionVersion){pollPending.delete(id);renderPolls();}}
}

let analyticsRecorded=false,analyticsPending=false;
async function recordConsentedVisit(){
 if(!window.ccAnalyticsAllowed?.()||!currentUser||demoMode||!connected||analyticsRecorded||analyticsPending)return;
 const version=sessionVersion,uid=currentUser.uid,day=new Date().toISOString().slice(0,10);analyticsPending=true;
 try{await db.ref('analytics/'+uid+'/'+day).transaction(old=>({count:(old?.count||0)+1,lastAt:firebase.database.ServerValue.TIMESTAMP,consent:true}));if(version===sessionVersion)analyticsRecorded=true;}catch{}finally{if(version===sessionVersion)analyticsPending=false;}
}
window.addEventListener('cc-consent-change',()=>{if(window.ccAnalyticsAllowed?.())recordConsentedVisit();});
function attachStats(){
 document.querySelector('[data-panel="stats"]').hidden=!currentUser.isAdmin;
 if(!currentUser.isAdmin)return;
 listen(db.ref('analytics'),snap=>{
   const data=snap.val()||{},cutoff=new Date(Date.now()-30*86400000).toISOString().slice(0,10);let visits=0,accounts=0,old=[];
   for(const [uid,days] of Object.entries(data)){let active=false;for(const [day,value] of Object.entries(days)){if(day>=cutoff){visits+=value.count||0;active=true;}else old.push(uid+'/'+day);}if(active)accounts++;}
   document.getElementById('stats-content').innerHTML='<div class="stats-grid"><article class="stat-card">Visites avec consentement<strong>'+visits+'</strong>30 derniers jours</article><article class="stat-card">Comptes participants<strong>'+accounts+'</strong>30 derniers jours</article></div><p class="stats-note">Mesure interne de ClasseConnect. Seules les visites des membres connectés qui ont accepté sont comptées. Un rechargement peut compter comme une visite ; ce n’est pas une mesure exhaustive du trafic. Aucun contenu de message n’est enregistré ici.</p><p class="stats-note">'+old.length+' enregistrement(s) ont plus de 30 jours.</p><button id="stats-purge" class="poll-close" '+(!old.length?'disabled':'')+'>Supprimer les statistiques de plus de 30 jours</button>';
   document.getElementById('stats-purge').onclick=withLoading(document.getElementById('stats-purge'),async()=>{if(!window.confirm('Supprimer définitivement les statistiques de plus de 30 jours ?'))return;const changes=Object.fromEntries(old.map(p=>[p,null]));await db.ref('analytics').update(changes);showToast('Anciennes statistiques supprimées.');});
 });
}
// Client-side validation is complemented by Firebase server rules.
function validAuthFields(id){const container=document.getElementById(id);for(const input of container.querySelectorAll('input'))if(!input.reportValidity())return false;return true;}
for(const [button,form] of [['login-btn','login-form'],['signup-btn','signup-form'],['guest-btn','guest-form'],['forgot-btn','forgot-form']]){const element=document.getElementById(button),original=element.onclick;element.onclick=(...args)=>validAuthFields(form)?original(...args):undefined;}

// An atomic write binds each publication to one server-validated rate-limit ticket.
async function publishContent(path,payload){
 const bucket=path.startsWith('conversations/')?'private':path,id=db.ref(path).push().key;
 const changes={[path+'/'+id]:payload,['rateLimits/'+currentUser.uid+'/'+bucket]:{id,ts:firebase.database.ServerValue.TIMESTAMP}};
 await db.ref().update(changes);return {key:id};
}

document.querySelector('.skip-link').onclick=e=>{e.preventDefault();const target=document.getElementById(currentUser?'main-content':'auth-heading');target.tabIndex=-1;target.focus();};
