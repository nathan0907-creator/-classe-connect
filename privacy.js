(function(){
 const key='cc-consent-v1',duration=180*86400000;let consent=null;
 try{const value=JSON.parse(localStorage.getItem(key));if(value&&Date.now()-value.at<duration)consent=value;}catch{}
 const banner=document.createElement('section');banner.id='cookie-banner';banner.setAttribute('aria-label','Choix des cookies et du stockage local');
 banner.innerHTML='<div><b>Ta confidentialité, ton choix.</b><p>Le stockage nécessaire garde ta connexion et tes préférences. Avec ton accord, nous comptons les visites des membres connectés pour améliorer le site. Aucun suivi publicitaire.</p><a href="confidentialite.html">Confidentialité et détails</a></div><div class="cookie-actions"><button data-consent="false">Refuser la mesure</button><button data-consent="true">Accepter la mesure</button></div>';
 document.body.append(banner);banner.hidden=!!consent;
 window.ccAnalyticsAllowed=()=>consent?.analytics===true;
 window.ccOpenConsent=()=>{banner.hidden=false;banner.querySelector('button').focus();};
 banner.querySelectorAll('[data-consent]').forEach(button=>button.onclick=()=>{consent={analytics:button.dataset.consent==='true',at:Date.now()};try{localStorage.setItem(key,JSON.stringify(consent));}catch{}banner.hidden=true;window.dispatchEvent(new Event('cc-consent-change'));});
 document.querySelectorAll('[data-cookie-settings]').forEach(button=>button.onclick=window.ccOpenConsent);
})();
