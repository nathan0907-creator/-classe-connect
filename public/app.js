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
    'auth/operation-not-allowed':"La connexion par e-mail doit être activée par le responsable de la classe.",
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
  document.getElementById('login-form').style.display = view==='login' ? 'block' : 'none';
  document.getElementById('signup-form').style.display = view==='signup' ? 'block' : 'none';
  document.getElementById('forgot-form').style.display = view==='forgot' ? 'block' : 'none';
  const subs = {
    login:"Connecte-toi pour rejoindre la discussion de la classe.",
    signup:"Choisis un pseudo, un e-mail et un mot de passe.",
    forgot:"On t'envoie un lien par e-mail pour choisir un nouveau mot de passe."
  };
  document.getElementById('auth-sub').textContent = subs[view];
  ['login-error','signup-error','forgot-error','forgot-ok'].forEach(id => document.getElementById(id).textContent = '');
}
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
  try{await auth.signOut();}catch{showToast('Déconnexion impossible. Réessaie.');}
};

// ---------- AUTH STATE ----------
const authScreen = document.getElementById('auth-screen');
const appEl = document.getElementById('app');

if(auth) auth.onAuthStateChanged(async (user) => {
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
    attachListeners();
    document.querySelector('[data-panel="chat"]').click();
    document.querySelectorAll('input[type="password"]').forEach(input=>input.value='');
    requestAnimationFrame(() => positionNavIndicator(document.querySelector('.nav-item.active')));
  } else {
    currentUser = null;
    appEl.classList.remove('active');
    authScreen.style.display = 'flex';
  }
  }catch(e){if(version!==sessionVersion)return;currentUser=null;appEl.classList.remove('active');authScreen.style.display='flex';document.getElementById('login-error').textContent='Impossible de charger ton profil. Vérifie la connexion ou contacte le responsable de la classe, puis reconnecte-toi.';}
});

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
      await db.ref('council').push({ from:currentUser.uid, title:t.value.trim(), content:c.value.trim(), displayName: currentUser.displayName, ts: firebase.database.ServerValue.TIMESTAMP });
      t.value=''; c.value='';
      showToast('Publié dans les conseils de classe');
    });
  } else {
    slot.innerHTML = `<div class="info-banner">🔒 Seul·e le/la délégué·e de classe peut publier ici. Tu peux consulter les informations ci-dessous.</div>`;
  }
}
function renderRequestsForm(){
  const slot = document.getElementById('requests-form-slot');
  if (currentUser.isAdmin){
    slot.innerHTML = `<div class="info-banner">📬 Ces messages sont envoyés directement par les élèves, seul·e toi peux les voir.</div>`;
  } else {
    slot.innerHTML = `<div class="form-card"><textarea id="request-text" maxlength="4000" aria-label="Ta demande au délégué" placeholder="Écris ta demande ou ta question pour le/la délégué·e..."></textarea><button id="request-send">Envoyer</button></div>`;
    const btn = document.getElementById('request-send');
    btn.onclick = withLoading(btn, async () => {
      const t = document.getElementById('request-text');
      if (!t.value.trim()){showToast('Écris ta demande avant de l’envoyer.');return;}
      if(t.value.length>4000){showToast('Ta demande est trop longue (4 000 caractères maximum).');return;}
      await db.ref('requests').push({ from: currentUser.uid, displayName: currentUser.displayName, text:t.value.trim(), ts: firebase.database.ServerValue.TIMESTAMP, status:'nouveau' });
      t.value='';
      showToast('Demande envoyée au/à la délégué·e 📮');
    });
    document.getElementById('requests-list').innerHTML = '<div class="empty-state"><span class="ee-icon">📮</span>Seul·e le/la délégué·e peut lire les demandes envoyées.</div>';
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

  if (currentUser.isAdmin){
    listen(db.ref('requests'), snap => {
      const val = snap.val() || {};
      const items = Object.entries(val).map(([id,r])=>({id,...r})).sort((a,b)=>(b.ts||0)-(a.ts||0));
      const listEl = document.getElementById('requests-list');
      const badge = document.getElementById('requests-badge');
      const newCount = items.filter(r=>r.status==='nouveau').length;
      badge.style.display = newCount>0 ? 'inline-block' : 'none';
      badge.textContent = newCount;
      listEl.innerHTML = items.length===0
        ? '<div class="empty-state"><span class="ee-icon">📮</span>Aucune demande reçue pour l\u2019instant.</div>'
        : items.map((r,i) => `<div class="request-card ${!knownRequestIds.has(r.id)?'enter':''}" style="animation-delay:${i*35}ms">
            <div class="meta"><span>${escapeHtml(r.displayName)}, le ${fmtDate(r.ts)}</span><span class="status-pill ${r.status==='nouveau'?'new':'read'}">${r.status==='nouveau'?'Nouveau':'Lu'}</span></div>
            <p>${escapeHtml(r.text)}</p>
            ${r.status==='nouveau' ? `<button class="mark-read-btn" data-id="${r.id}">Marquer comme lue</button>` : ''}
          </div>`).join('');
      knownRequestIds = new Set(items.map(r=>r.id));
      listEl.querySelectorAll('.mark-read-btn').forEach(btn => {
        btn.onclick = withLoading(btn, () => db.ref('requests/'+btn.dataset.id+'/status').set('lu'));
      });
    });
  }

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
    await db.ref('messages').push({from:currentUser.uid,displayName:currentUser.displayName,text,ts:firebase.database.ServerValue.TIMESTAMP});
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
  await db.ref('news').push({ from:currentUser.uid, title, content, displayName: currentUser.displayName, ts: firebase.database.ServerValue.TIMESTAMP });
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
  renderCouncilForm();renderRequestsForm();renderDemoMessages();
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
const authTitles={login:'Heureux de te revoir.',signup:'Ta place est ici.',forgot:'On retrouve ton accès.'};
const originalShowAuthView=showAuthView;
showAuthView=function(view){originalShowAuthView(view);document.getElementById('auth-heading').textContent=authTitles[view];};
document.querySelectorAll('.nav-item').forEach(btn=>{btn.setAttribute('aria-label',btn.querySelector('.label').textContent);btn.addEventListener('click',()=>document.querySelectorAll('.nav-item').forEach(item=>item.setAttribute('aria-current',item===btn?'page':'false')));});
document.querySelector('.nav-item.active').setAttribute('aria-current','page');
const statusEl=document.getElementById('connection-status');
if(db){db.ref('.info/connected').on('value',snap=>{connected=snap.val()===true;if(!demoMode){statusEl.textContent=connected?'Connecté au service':'Hors ligne · brouillons conservés';statusEl.classList.toggle('online',connected);}});}
else {statusEl.textContent='Service indisponible';document.getElementById('login-error').textContent='Connexion au service impossible. Vérifie ton réseau puis recharge la page.';}
// Preserve paragraphs and safe limits in every publishing form.
document.querySelectorAll('input[id$="title"]').forEach(input=>input.maxLength=120);
document.querySelectorAll('.form-card textarea').forEach(input=>{input.maxLength=10000;input.setAttribute('aria-label',input.placeholder);});
document.querySelectorAll('.form-card input').forEach(input=>input.setAttribute('aria-label',input.placeholder));
