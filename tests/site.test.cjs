const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.join(__dirname,'../public'),base='https://nathan0907-creator.github.io/-classe-connect/';
test('public pages have titles, valid local links, metadata and no remote font requests',()=>{
 for(const file of ['index.html','confidentialite.html','cgu.html','404.html']){
  const html=fs.readFileSync(path.join(root,file),'utf8'),dom=new JSDOM(html,{url:base+file}),doc=dom.window.document;
  assert.ok(doc.title);assert.equal(doc.documentElement.lang,'fr');assert.ok(doc.querySelector('meta[name="description"]'));assert.ok(!html.includes('fonts.googleapis.com'));assert.ok(!html.includes('ON GARDE LE LIEN'));
  for(const el of doc.querySelectorAll('[href],[src]')){const raw=el.getAttribute('href')||el.getAttribute('src');if(raw.startsWith('#')){assert.ok(doc.getElementById(raw.slice(1)),raw);continue;}const url=new URL(raw,base);if(!url.href.startsWith(base))continue;const local=decodeURIComponent(url.pathname.slice('/-classe-connect/'.length))||'index.html';assert.ok(fs.existsSync(path.join(root,local)),file+' → '+local);}
  for(const img of doc.images)assert.ok(img.hasAttribute('alt'));dom.window.close();
 }
});
test('consent defaults off, refusal works, and consent can be withdrawn',()=>{
 const dom=new JSDOM('<body><button data-cookie-settings>Cookies</button></body>',{url:base,runScripts:'outside-only'}),w=dom.window;
 w.eval(fs.readFileSync(path.join(root,'privacy.js'),'utf8'));assert.equal(w.ccAnalyticsAllowed(),false);
 w.document.querySelector('[data-consent="false"]').click();assert.equal(w.ccAnalyticsAllowed(),false);assert.equal(w.document.getElementById('cookie-banner').hidden,true);
 w.ccOpenConsent();w.document.querySelector('[data-consent="true"]').click();assert.equal(w.ccAnalyticsAllowed(),true);
 w.ccOpenConsent();w.document.querySelector('[data-consent="false"]').click();assert.equal(w.ccAnalyticsAllowed(),false);dom.window.close();
});
