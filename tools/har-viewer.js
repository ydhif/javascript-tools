document.addEventListener("DOMContentLoaded", function () {

// Bouton de téléchargement HTML autonome (shell du projet)
var dlBtn = document.getElementById("download-html");
if (dlBtn) {
  dlBtn.addEventListener("click", function () {
    ToolExport.downloadStandalone({
      filename: "har-analyzer.html",
      title: "HAR Analyzer",
      inlineScripts: ["./har-viewer.js"],
    });
  });
}

/* ================= Widget HAR Analyzer ================= */
(function(){
var ENT=[],HOSTS=[],ANA=[],LAST=null,FILT='all',TOKENS=[];
// Palette alignée sur la charte Tailwind du site (indigo / emerald / orange / violet / slate).
var C={
  app:    {b:'#4338ca',bg:'#eef2ff',t:'#4338ca'},  // indigo
  kc:     {b:'#047857',bg:'#ecfdf5',t:'#047857'},  // emerald
  idp:    {b:'#c2410c',bg:'#fff7ed',t:'#c2410c'},  // orange
  cb:     {b:'#6d28d9',bg:'#f3e8ff',t:'#6d28d9'},  // violet
  other:  {b:'#94a3b8',bg:'#f1f5f9',t:'#64748b'},  // slate
  browser:{b:'#4338ca',bg:'#eef2ff',t:'#4338ca'}
};
var HH=64,AH=40,RH=48,FP=10,FH=40,FB=8;
var CH_W=6.2;

function xe(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function fmt(ms){return ms>=1000?(ms/1000).toFixed(2)+'s':Math.round(ms)+'ms';}
function g(id){return document.getElementById(id);}
function pathOf(url){try{var u=new URL(url);return u.pathname+(u.search||'');}catch(e){return url;}}
function pathOnly(url){try{return new URL(url).pathname;}catch(e){try{return url.split('?')[0];}catch(x){return url;}}}

function fitText(ctx,text,maxPx,font){
  if(ctx){ctx.save();ctx.font=font||'500 10px monospace';}
  function w(s){return ctx?ctx.measureText(s).width:s.length*CH_W;}
  if(w(text)<=maxPx){if(ctx)ctx.restore();return text;}
  var ellW=w('…'),lo=0,hi=text.length;
  while(lo<hi){var mid=Math.floor((lo+hi+1)/2);if(w(text.substring(0,mid))+ellW<=maxPx)lo=mid;else hi=mid-1;}
  if(ctx)ctx.restore();
  return lo>0?text.substring(0,lo)+'…':'…';
}
function availableWidth(){
  var root=g('ha');if(root&&root.clientWidth>0)return root.clientWidth-48;
  var el=g('hcv');while(el){if(el.clientWidth>0)return el.clientWidth;el=el.parentElement;}return 760;
}

/* ===== JWT helpers ===== */
function b64url(s){s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';return s;}
function decodeJwtPart(part){try{return JSON.parse(atob(b64url(part)));}catch(e){return null;}}
function parseJwt(token){
  var parts=token.split('.');if(parts.length!==3)return null;
  var header=decodeJwtPart(parts[0]),payload=decodeJwtPart(parts[1]);
  if(!header||!payload)return null;
  return{raw:token,header:header,payload:payload,sig:parts[2],parts:parts};
}
function isJwt(s){return typeof s==='string'&&/^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]*$/.test(s.trim());}

function extractTokensFromHar(entries){
  var seen=new Set(),list=[];
  function add(token,source,url){
    var parsed=parseJwt(token.trim());if(!parsed)return;
    var key=parsed.parts[0]+'.'+parsed.parts[1];if(seen.has(key))return;seen.add(key);
    var kind='JWT';
    if(parsed.payload.typ)kind=parsed.payload.typ;
    else if(source.includes('id_token'))kind='ID Token';
    else if(source.includes('access_token'))kind='Access Token';
    else if(source.includes('refresh_token'))kind='Refresh Token';
    else if(source.toLowerCase().includes('authorization'))kind='Bearer Token';
    list.push({token:token.trim(),parsed:parsed,source:source,url:url,kind:kind,sigStatus:'pending'});
  }
  entries.forEach(function(e){
    var url=e.request.url;
    (e.request.headers||[]).forEach(function(h){if(/authorization/i.test(h.name)){var m=(h.value||'').match(/Bearer\s+(\S+)/i);if(m&&isJwt(m[1]))add(m[1],'Authorization header',url);}});
    var body=(e.request.postData||{}).text||'';
    if(body){
      try{var obj=JSON.parse(body);['access_token','id_token','refresh_token','token','assertion'].forEach(function(k){if(obj[k]&&isJwt(obj[k]))add(obj[k],k,url);});}catch(x){}
      body.split('&').forEach(function(p){var kv=p.split('=');if(kv.length<2)return;var k,v;try{k=decodeURIComponent(kv[0]);}catch(x){k=kv[0];}try{v=decodeURIComponent(kv.slice(1).join('='));}catch(x){v=kv.slice(1).join('=');}if(['access_token','id_token','refresh_token','token','assertion'].indexOf(k)>=0&&isJwt(v))add(v,k,url);});
    }
    var respBody='';try{var rc=e.response.content;if(rc&&rc.text)respBody=rc.text;}catch(x){}
    if(respBody){
      try{var obj=JSON.parse(respBody);['access_token','id_token','refresh_token','token'].forEach(function(k){if(obj[k]&&isJwt(obj[k]))add(obj[k],k+' (response)',url);});}catch(x){}
      var rx=/eyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]*/g,m;
      while((m=rx.exec(respBody))!==null){if(isJwt(m[0]))add(m[0],'response body',url);}
    }
    (e.response.headers||[]).forEach(function(h){if(/set-cookie/i.test(h.name)){var m2=(h.value||'').match(/=(eyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]*)/);if(m2&&isJwt(m2[1]))add(m2[1],'cookie',url);}});
  });
  return list;
}

/* ===== Signature verification via JWKS =====
 * Sécurité : l'issuer (iss) est une URL arbitraire contrôlée par le contenu du HAR.
 * On refuse tout ce qui n'est pas HTTPS, et on demande confirmation avant de contacter
 * un issuer externe (le serveur cible pourrait logger "telle personne analyse ce HAR").
 */
var VERIFY_CONSENT={}; // { 'origin': true } pour les issuers acceptés dans la session
async function verifyToken(tk){
  var payload=tk.parsed.payload,header=tk.parsed.header,issuer=payload.iss;
  if(!issuer){setTokenSigStatus(tk,'no_iss','Pas d\'issuer (iss) dans le payload');return;}
  if(typeof issuer!=='string'||!/^https:\/\//i.test(issuer)){
    setTokenSigStatus(tk,'error','Issuer non HTTPS ignoré pour raisons de sécurité : '+String(issuer).slice(0,60));
    return;
  }
  var origin;
  try{origin=new URL(issuer).origin;}catch(_){setTokenSigStatus(tk,'error','Issuer invalide : '+issuer);return;}
  if(!VERIFY_CONSENT[origin]){
    var ok=window.confirm(
      "Vérification de signature — confirmation requise\n\n" +
      "Pour vérifier ce JWT, le navigateur va contacter l'issuer :\n" +
      origin + "\n\n" +
      "⚠ Ce serveur verra votre IP et saura que vous analysez un HAR qui contient un de ses tokens.\n" +
      "Il peut aussi retourner un JWKS falsifié pour faire passer le token pour valide.\n\n" +
      "Continuer ?"
    );
    if(!ok){setTokenSigStatus(tk,'error','Vérification annulée par l\'utilisateur');return;}
    VERIFY_CONSENT[origin]=true;
  }
  try{
    var oidcRes=await fetch(issuer.replace(/\/$/,'')+'/.well-known/openid-configuration');
    if(!oidcRes.ok)throw new Error('OIDC config non accessible ('+oidcRes.status+')');
    var oidcJson=await oidcRes.json();
    if(!oidcJson.jwks_uri)throw new Error('jwks_uri absent de la config OIDC');
    var jwksRes=await fetch(oidcJson.jwks_uri);
    if(!jwksRes.ok)throw new Error('JWKS non accessible ('+jwksRes.status+')');
    var keys=(await jwksRes.json()).keys||[],kid=header.kid;
    var key=kid?keys.find(function(k){return k.kid===kid;}):keys.find(function(k){return k.use==='sig'||!k.use;})||keys[0];
    if(!key)throw new Error('Clé introuvable dans le JWKS (kid='+kid+')');
    var alg=header.alg||key.alg||'RS256';
    var cryptoKey=await importJwk(key,alg);
    var sigBytes=base64urlToUint8(tk.parsed.parts[2]);
    var msgBytes=new TextEncoder().encode(tk.parsed.parts[0]+'.'+tk.parsed.parts[1]);
    var valid=await crypto.subtle.verify(algParams(alg),cryptoKey,sigBytes,msgBytes);
    setTokenSigStatus(tk,valid?'valid':'invalid',valid?'Signature valide':'Signature invalide');
  }catch(err){setTokenSigStatus(tk,'error',err.message);}
}
function algParams(alg){
  if(alg.startsWith('RS')||alg.startsWith('PS')){var hash='SHA-'+alg.slice(2);return alg.startsWith('PS')?{name:'RSA-PSS',saltLength:32}:{name:'RSASSA-PKCS1-v1_5',hash:hash};}
  if(alg.startsWith('ES')){return{name:'ECDSA',hash:'SHA-'+alg.slice(2)};}
  return{name:'HMAC'};
}
async function importJwk(jwk,alg){
  var params;
  if(alg.startsWith('RS'))params={name:'RSASSA-PKCS1-v1_5',hash:'SHA-'+alg.slice(2)};
  else if(alg.startsWith('PS'))params={name:'RSA-PSS',hash:'SHA-'+alg.slice(2)};
  else if(alg.startsWith('ES'))params={name:'ECDSA',namedCurve:jwk.crv||'P-256'};
  else params={name:'HMAC',hash:'SHA-256'};
  return await crypto.subtle.importKey('jwk',jwk,params,false,['verify']);
}
function base64urlToUint8(s){s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';var bin=atob(s),arr=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);return arr;}
function setTokenSigStatus(tk,status,msg){
  tk.sigStatus=status;tk.sigMsg=msg;
  var el=g('hsig-'+TOKENS.indexOf(tk));if(!el)return;
  var cfg={
    valid:  {bg:'#ecfdf5',b:'#10b981',t:'#047857',icon:'✓'},
    invalid:{bg:'#fef2f2',b:'#ef4444',t:'#b91c1c',icon:'✗'},
    error:  {bg:'#fff7ed',b:'#f59e0b',t:'#c2410c',icon:'⚠'},
    no_iss: {bg:'#f1f5f9',b:'#cbd5e1',t:'#64748b',icon:'—'},
    pending:{bg:'#f1f5f9',b:'#cbd5e1',t:'#64748b',icon:'…'}
  };
  var s=cfg[status]||cfg.error;
  el.style.background=s.bg;el.style.borderLeft='3px solid '+s.b;el.style.color=s.t;
  el.innerHTML='<b>'+s.icon+' Signature</b> — '+xe(msg);
}

/* ===== Token rendering ===== */
var TOKEN_COLORS={
  exp:'#c2410c',iat:'#047857',nbf:'#047857',auth_time:'#047857',
  sub:'#4338ca',email:'#4338ca',preferred_username:'#4338ca',name:'#4338ca',
  scope:'#6d28d9',roles:'#6d28d9',resource_access:'#6d28d9',realm_access:'#6d28d9',
  iss:'#64748b',aud:'#64748b',jti:'#64748b',azp:'#64748b',typ:'#64748b'
};
var TOKEN_BG={
  exp:'#fff7ed',iat:'#ecfdf5',nbf:'#ecfdf5',auth_time:'#ecfdf5',
  sub:'#eef2ff',email:'#eef2ff',preferred_username:'#eef2ff',name:'#eef2ff',
  scope:'#f3e8ff',roles:'#f3e8ff',resource_access:'#f3e8ff',realm_access:'#f3e8ff'
};

function fmtTs(v){
  if(typeof v!=='number')return String(v);
  var d=new Date(v*1000),now=Date.now()/1000,diff=v-now;
  var rel=diff>0?('expire dans '+fmtDur(diff)):('expiré il y a '+fmtDur(-diff));
  return d.toISOString().replace('T',' ').replace('.000Z',' UTC')+' <span style="font-size:10px;color:'+(diff>0?'#047857':'#b91c1c')+'">'+xe(rel)+'</span>';
}
function fmtDur(s){s=Math.round(s);var h=Math.floor(s/3600),m=Math.floor((s%3600)/60),ss=s%60;return h?h+'h '+m+'m':(m?m+'m '+ss+'s':ss+'s');}
function fmtVal(k,v){
  if((k==='exp'||k==='iat'||k==='nbf'||k==='auth_time')&&typeof v==='number')return fmtTs(v);
  if(typeof v==='object'&&v!==null)return'<pre style="margin:0;font-size:10px;white-space:pre-wrap;word-break:break-all">'+xe(JSON.stringify(v,null,2))+'</pre>';
  return xe(String(v));
}

function renderTokens(){
  var list=g('htk-list');
  if(!TOKENS.length){
    list.innerHTML='<div class="text-sm text-slate-500 italic text-center py-6">Aucun JWT trouvé dans ce fichier HAR.</div>';
    return;
  }
  var badge=g('htb-tokens-badge');badge.textContent=TOKENS.length;badge.style.display='inline';
  var border='1px solid rgba(148,163,184,0.25)';
  var dashBorder='1px dashed rgba(148,163,184,0.25)';
  var html='';
  TOKENS.forEach(function(tk,idx){
    var p=tk.parsed.payload,h=tk.parsed.header;
    var isExp=p.exp&&(p.exp<Date.now()/1000);
    var kindColor=tk.kind.includes('ID')?C.idp:(tk.kind.includes('Access')||tk.kind.includes('Bearer')?C.kc:(tk.kind.includes('Refresh')?C.cb:C.other));
    html+='<div style="background:#fff;border:'+border+';border-radius:0.75rem;margin-bottom:1rem;overflow:hidden">';
    html+='<div style="padding:0.75rem 1rem;border-bottom:'+border+';display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">';
    html+='<span class="badge" style="background:'+kindColor.bg+';color:'+kindColor.t+';">'+xe(tk.kind)+'</span>';
    if(p.sub)html+='<span class="text-xs text-slate-500">sub: <b class="text-slate-700">'+xe(p.sub.substring(0,40))+'</b></span>';
    if(isExp)html+='<span class="badge" style="background:#fef2f2;color:#b91c1c;">EXPIRÉ</span>';
    html+='<span style="flex:1"></span>';
    html+='<span class="text-xs text-slate-500">alg: <b class="text-slate-700">'+xe(h.alg||'?')+'</b></span>';
    if(h.kid)html+='<span class="text-xs text-slate-500 ml-2">kid: <b class="text-slate-700">'+xe(h.kid.substring(0,20))+'</b></span>';
    html+='</div>';
    html+='<div id="hsig-'+idx+'" class="text-xs text-slate-500" style="padding:0.55rem 1rem;background:#f8fafc;border-bottom:'+border+'">… Vérification de la signature en cours</div>';
    html+='<div class="text-[0.65rem] text-slate-400" style="padding:0.4rem 1rem;border-bottom:'+dashBorder+'">Source : '+xe(tk.source)+' — '+xe(tk.url.substring(0,80))+'</div>';
    html+='<div style="padding:0.65rem 1rem;border-bottom:'+border+'">';
    html+='<div class="text-[0.6rem] text-slate-400 uppercase tracking-wider font-semibold mb-1">Token brut</div>';
    html+='<div style="font-family:\'JetBrains Mono\',monospace;font-size:0.65rem;word-break:break-all;line-height:1.7">';
    html+='<span style="color:#b91c1c">'+xe(tk.parsed.parts[0])+'</span>.';
    html+='<span style="color:#047857">'+xe(tk.parsed.parts[1])+'</span>.';
    html+='<span style="color:#4338ca">'+xe(tk.parsed.parts[2].substring(0,20))+'…</span>';
    html+='</div></div>';
    html+='<div style="padding:0.65rem 1rem;border-bottom:'+border+'">';
    html+='<div class="text-[0.6rem] uppercase tracking-wider font-semibold mb-2" style="color:#b91c1c">Header</div>';
    html+=renderClaims(tk.parsed.header);html+='</div>';
    html+='<div style="padding:0.65rem 1rem">';
    html+='<div class="text-[0.6rem] uppercase tracking-wider font-semibold mb-2" style="color:#047857">Payload</div>';
    html+=renderClaims(tk.parsed.payload);html+='</div>';
    html+='</div>';
  });
  list.innerHTML=html;
  TOKENS.forEach(function(tk){verifyToken(tk);});
}
function renderClaims(obj){
  var html='<div style="display:grid;grid-template-columns:auto 1fr;gap:4px 12px;align-items:start">';
  Object.entries(obj).forEach(function(kv){
    var k=kv[0],v=kv[1],c=TOKEN_COLORS[k]||'#0f172a',bg=TOKEN_BG[k]||'transparent';
    html+='<div style="padding:3px 7px;border-radius:3px;font-size:10px;font-weight:600;background:'+bg+';color:'+c+';white-space:nowrap">'+xe(k)+'</div>';
    html+='<div style="padding:3px 0;font-size:11px;color:#0f172a;word-break:break-all">'+fmtVal(k,v)+'</div>';
  });
  return html+'</div>';
}

/* ===== drag / drop / load ===== */
var dz=g('hd');
dz.addEventListener('dragover',function(e){e.preventDefault();dz.style.borderColor='#6366f1';dz.style.background='rgba(238,242,255,0.6)';});
dz.addEventListener('dragleave',function(){dz.style.borderColor='rgba(148,163,184,0.5)';dz.style.background='rgba(248,250,252,0.6)';});
dz.addEventListener('drop',function(e){e.preventDefault();dz.style.borderColor='rgba(148,163,184,0.5)';dz.style.background='rgba(248,250,252,0.6)';var f=e.dataTransfer.files[0];if(f){var dt=new DataTransfer();dt.items.add(f);g('hfi').files=dt.files;loadFile(g('hfi'));}});
g('hfi').addEventListener('change',function(){loadFile(this);});

function loadFile(inp){
  var f=inp.files[0];if(!f)return;
  var r=new FileReader();
  var sizeMb=(f.size/1048576).toFixed(1);
  var showProg=f.size>512000;
  if(showProg){
    g('hprog-wrap').classList.remove('hidden');
    g('hprog-bar').style.width='0%';
    g('hprog-pct').textContent='0%';
    g('hprog-label').textContent='Lecture du fichier…';
    g('hprog-sub').textContent=sizeMb+' Mo';
  }
  r.onprogress=function(ev){
    if(!showProg||!ev.lengthComputable)return;
    var pct=Math.round(ev.loaded/ev.total*100);
    g('hprog-bar').style.width=pct+'%';
    g('hprog-pct').textContent=pct+'%';
    g('hprog-sub').textContent=(ev.loaded/1048576).toFixed(1)+' / '+sizeMb+' Mo';
    if(pct>=100)g('hprog-label').textContent='Analyse JSON…';
  };
  r.onload=function(ev){
    if(showProg){g('hprog-bar').style.width='100%';g('hprog-pct').textContent='100%';g('hprog-label').textContent='Analyse JSON…';}
    setTimeout(function(){
      try{
        var har=JSON.parse(ev.target.result);
        ENT=(har.log||har).entries||[];
        if(!ENT.length){if(showProg)g('hprog-wrap').classList.add('hidden');showErr('Aucune requête trouvée.');return;}
        if(showProg)g('hprog-wrap').classList.add('hidden');
        g('hil').style.display='none';
        g('hld').style.display='flex';
        g('hld').classList.remove('hidden');
        g('hfn').textContent=f.name;g('hrc').textContent=ENT.length+' requêtes';
        extractHosts();
        g('hsh').classList.remove('hidden');
        g('hsb').classList.remove('hidden');
      }catch(er){if(showProg)g('hprog-wrap').classList.add('hidden');showErr('HAR invalide : '+er.message);}
    },30);
  };
  r.onerror=function(){if(showProg)g('hprog-wrap').classList.add('hidden');showErr('Erreur de lecture du fichier.');};
  r.readAsText(f);
}

function extractHosts(){
  var s=new Set();ENT.forEach(function(e){try{s.add(new URL(e.request.url).hostname);}catch(x){}});
  HOSTS=Array.from(s).sort();
  var optHtml='<option value="">— sélectionner —</option>'+HOSTS.map(function(h){return'<option value="'+xe(h)+'">'+xe(h)+'</option>';}).join('');
  ['hha','hhk','hhi'].forEach(function(id){g(id).innerHTML=optHtml;});
  autoDetect();
}

function autoDetect(){
  var sc={kc:{},idp:{},app:{}};
  ENT.forEach(function(e){var h;try{h=new URL(e.request.url).hostname;}catch(x){return;}var u=e.request.url;if(/\/realms\/|\/protocol\/openid-connect|keycloak/i.test(u))sc.kc[h]=(sc.kc[h]||0)+3;if(/\/sso\/|\/oauth2\/authorize|\/adfs\/|\/broker\/|\/idp\//i.test(u))sc.idp[h]=(sc.idp[h]||0)+3;if(/\.(js|css|html|png|svg|woff)(\?|$)/.test(u))sc.app[h]=(sc.app[h]||0)+1;});
  function best(o){var e=Object.entries(o).sort(function(a,b){return b[1]-a[1];})[0];return e?e[0]:'';}
  var kc=best(sc.kc),idp=best(sc.idp),app=best(sc.app)||HOSTS[0]||'';
  function sel(id,val){if(!val)return;var s=g(id);for(var i=0;i<s.options.length;i++){if(s.options[i].value===val){s.selectedIndex=i;return;}}}
  sel('hhk',kc);sel('hhi',idp);sel('hha',app);
}

function classify(e,app,kc,idp){
  if(kc&&idp&&kc===idp)idp='';
  var h;try{h=new URL(e.request.url).hostname;}catch(x){return'other';}
  if(kc&&h===kc)return'kc';if(idp&&h===idp)return'idp';if(app&&h===app)return'app';
  var u=e.request.url;
  if(/\/realms\/|\/protocol\/openid-connect|keycloak/i.test(u))return'kc';
  if(/\/sso\/|\/oauth2\/authorize|\/adfs\/|\/broker\//i.test(u))return'idp';
  if(/\/token(\?|$)|\/userinfo|[?&]code=|\/callback|[?&]state=/i.test(u))return'cb';
  return'other';
}

g('hbtn').addEventListener('click',analyse);
function analyse(){
  var app=g('hha').value,kc=g('hhk').value,idp=g('hhi').value;
  if(!kc){showErr('Sélectionner le host Keycloak.');return;}hideErr();
  if(kc&&idp&&kc===idp)idp='';
  var t0=new Date(ENT[0].startedDateTime).getTime();
  ANA=ENT.map(function(e,i){return{idx:i,url:e.request.url,method:e.request.method,status:e.response.status,duration:Math.round(e.time||0),start:new Date(e.startedDateTime).getTime()-t0,phase:classify(e,app,kc,idp),redir:(e.response.redirectURL||'')};});
  TOKENS=extractTokensFromHar(ENT);
  LAST=[app,kc,idp];FILT='all';g('hpf').value='all';
  renderStats();renderPhases();renderReqs();renderTokens();
  g('hpuml-pre').classList.add('hidden');
  g('hres').classList.remove('hidden');
  requestAnimationFrame(function(){requestAnimationFrame(function(){
    renderSeq(app,kc,idp);
    g('hres').scrollIntoView({behavior:'smooth',block:'nearest'});
  });});
}
window.addEventListener('resize',function(){clearTimeout(window._hrt);window._hrt=setTimeout(function(){if(LAST)renderSeq(LAST[0],LAST[1],LAST[2]);},150);});

/* ===== Stats ===== */
function renderStats(){
  var tot=ANA.length?ANA[ANA.length-1].start+ANA[ANA.length-1].duration:0;
  var ph={app:0,kc:0,idp:0,cb:0};ANA.forEach(function(e){if(ph[e.phase]!==undefined)ph[e.phase]+=e.duration;});
  var rd=ANA.filter(function(e){return e.status>=300&&e.status<400;}).length;
  g('hsr').innerHTML=
    scard(fmt(tot),'Durée totale','#0f172a')+
    scard(ANA.length,'Requêtes','#0f172a')+
    scard(fmt(ph.kc),'Keycloak','#047857')+
    scard(fmt(ph.idp),'IdP externe','#c2410c')+
    scard(rd,'Redirections','#0f172a');
}
function scard(v,l,c){
  return'<div class="ha-stat">'+
    '<div class="ha-stat-val" style="color:'+c+'">'+v+'</div>'+
    '<div class="ha-stat-lbl">'+l+'</div>'+
  '</div>';
}

/* ===== Sequence ===== */
function renderSeq(appH,kcH,idpH){
  var cv=g('hcv'),ctx=cv.getContext('2d'),DPR=window.devicePixelRatio||1;
  var AC=[{label:'Browser',c:C.browser},{label:appH||'App Angular',c:C.app},{label:kcH||'Keycloak',c:C.kc}];
  if(idpH&&idpH!==kcH)AC.push({label:idpH,c:C.idp});
  var evs=buildEvents(ctx,AC,kcH,idpH);
  var ML=10,W=Math.max(availableWidth(),AC.length*140),CW=Math.floor((W-ML*2)/AC.length);
  var H=HH+evs.length*RH+FP+FH+FB;
  cv.width=W*DPR;cv.height=H*DPR;cv.style.width=W+'px';cv.style.height=H+'px';
  ctx.scale(DPR,DPR);ctx.fillStyle='#ffffff';ctx.fillRect(0,0,W,H);
  var cx=function(i){return ML+i*CW+CW/2;};
  var ink='#0f172a',mu='#94a3b8',li='rgba(148,163,184,0.35)';
  var lle=HH+evs.length*RH+FP;
  AC.forEach(function(a,i){ctx.strokeStyle=li;ctx.lineWidth=1;ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(cx(i),HH);ctx.lineTo(cx(i),lle);ctx.stroke();ctx.setLineDash([]);});
  AC.forEach(function(a,i){var x=cx(i),w=CW-16;ctx.fillStyle=a.c.bg;ctx.strokeStyle=a.c.b;ctx.lineWidth=1.5;rr(ctx,x-w/2,12,w,AH,6);ctx.fill();ctx.stroke();ctx.fillStyle=a.c.t;ctx.font='500 11px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(fitText(ctx,a.label,w-16,'500 11px monospace'),x,12+AH/2);});
  evs.forEach(function(ev,ei){
    var y=HH+ei*RH+RH/2,fx=cx(ev.from),tx=cx(ev.to),isr=ev.type==='return';
    if(ev.hi){ctx.fillStyle='rgba(0,0,0,0.02)';ctx.fillRect(0,y-RH/2+2,W,RH-4);}
    var ac=isr?mu:AC[ev.to].c.b;ctx.strokeStyle=ac;ctx.lineWidth=isr?1:1.5;ctx.setLineDash(isr?[4,3]:[]);
    var dr=tx>fx?1:-1;ctx.beginPath();ctx.moveTo(fx+dr*22,y);ctx.lineTo(tx-dr*22,y);ctx.stroke();ah(ctx,tx-dr*22,y,tx-dr*8,y,ac);ctx.setLineDash([]);
    var mid=(fx+tx)/2,span=Math.abs(tx-fx)-44;
    if(ev.label){var font=isr?'400 10px monospace':'500 10px monospace';ctx.font=font;ctx.textAlign='center';ctx.textBaseline='bottom';ctx.fillStyle=isr?mu:ink;ctx.fillText(fitText(ctx,ev.label,span,font),mid,y-4);}
    if(ev.dur>0){var ds=fmt(ev.dur),bw=ctx.measureText(ds).width+10,bx=mid-bw/2,by=y+3;ctx.fillStyle='#f8fafc';ctx.strokeStyle=li;ctx.lineWidth=0.8;rr(ctx,bx,by,bw,14,3);ctx.fill();ctx.stroke();ctx.fillStyle=ev.slow?'#c2410c':mu;ctx.font='400 9px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(ds,mid,by+7);}
  });
  var fy=HH+evs.length*RH+FP;
  AC.forEach(function(a,i){var x=cx(i),w=CW-16;ctx.fillStyle=a.c.bg;ctx.strokeStyle=a.c.b;ctx.lineWidth=1.5;rr(ctx,x-w/2,fy,w,FH,6);ctx.fill();ctx.stroke();ctx.fillStyle=a.c.t;ctx.font='500 11px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(fitText(ctx,a.label,w-16,'500 11px monospace'),x,fy+FH/2);});

  /* tooltip hit areas */
  var HITS=evs.map(function(ev,ei){
    var y=HH+ei*RH+RH/2;
    var fx=cx(ev.from),tx=cx(ev.to);
    var x1=Math.min(fx,tx),x2=Math.max(fx,tx);
    return{y1:y-RH/2,y2:y+RH/2,x1:x1,x2:x2,fullUrl:ev.fullUrl||'',label:ev.label||''};
  });
  var tip=g('hcv-tip');
  cv.onmousemove=function(e){
    var rect=cv.getBoundingClientRect();
    var mx=(e.clientX-rect.left)*(W/rect.width);
    var my=(e.clientY-rect.top)*(H/rect.height);
    var hit=null;
    for(var i=0;i<HITS.length;i++){
      var h=HITS[i];
      if(mx>=h.x1-10&&mx<=h.x2+10&&my>=h.y1&&my<=h.y2){hit=h;break;}
    }
    if(hit&&hit.fullUrl){
      tip.textContent=hit.fullUrl;
      tip.style.display='block';
      tip.style.left=(e.clientX+14)+'px';
      tip.style.top=(e.clientY-8)+'px';
      var tw=tip.offsetWidth;
      if(e.clientX+14+tw>window.innerWidth)tip.style.left=(e.clientX-tw-14)+'px';
    } else {
      tip.style.display='none';
    }
  };
  cv.onmouseleave=function(){tip.style.display='none';};
}

function buildEvents(ctx,AC,kcH,idpH){
  var noBroker=!idpH||(idpH===kcH);
  var ev=[],p2a={app:1,kc:2,idp:noBroker?2:3,cb:2,other:0};
  var oidc=ANA.filter(function(e){
    if(e.status>=300&&e.status<400)return true;
    if(e.phase==='app'&&/\.(js|css|woff2?|png|svg|ico|jpg|gif|map)(\?|$)/i.test(e.url))return false;
    if(e.phase!=='other')return true;
    if(/code=|state=|token|userinfo|callback|openid|realms|saml|sso|adfs|broker/i.test(e.url))return true;
    return false;
  });
  if(!oidc.length)oidc=ANA.filter(function(e){return!/\.(js|css|woff2?|png|svg|ico|jpg|gif|map)(\?|$)/i.test(e.url);}).slice(0,50);
  if(!oidc.length)oidc=ANA.slice(0,50);
  oidc.slice(0,60).forEach(function(e){
    var to=p2a[e.phase]!==undefined?p2a[e.phase]:0,isr=e.status>=300&&e.status<400,path=pathOf(e.url);
    ev.push({from:0,to:to,label:e.method+' '+pathOnly(e.url),fullUrl:e.url,dur:0,type:'req',hi:isr||e.url.indexOf('code=')>=0});
    var rl=isr?('-> '+e.status):(e.status+(e.redir?' -> '+pathOnly(e.redir):''));
    ev.push({from:to,to:0,label:rl,fullUrl:e.redir||e.url,dur:e.duration,type:'return',slow:e.duration>500,hi:false});
  });
  return ev;
}

/* PlantUML */
g('hpuml-btn').addEventListener('click',function(){
  if(!ANA.length)return;
  var app=LAST[0],kc=LAST[1],idp=LAST[2];
  var oidc=ANA.filter(function(e){if(e.phase==='other')return false;if(/\.(js|css|woff2?|png|svg|ico|jpg|gif|map)(\?|$)/i.test(e.url)&&e.phase==='app')return false;return true;});
  if(!oidc.length)oidc=ANA.filter(function(e){return!/\.(js|css|woff|png|svg|ico)(\?|$)/i.test(e.url);}).slice(0,30);
  var p2a={app:'App',kc:'Keycloak',idp:'IdP',cb:'Keycloak',other:'Browser'};
  var ls=['@startuml OIDC_Flow','skinparam sequenceMessageAlign center','skinparam monochrome false','skinparam shadowing false',''];
  ls.push('participant "Browser" as Browser');ls.push('participant "'+(app||'App Angular')+'" as App');ls.push('participant "'+(kc||'Keycloak')+'" as Keycloak');
  if(idp)ls.push('participant "'+(idp||'IdP externe')+'" as IdP');
  ls.push('');
  var lp=null;
  oidc.slice(0,40).forEach(function(e){
    var to=p2a[e.phase]||'Browser',path=pathOf(e.url).replace(/"/g,"'"),isr=e.status>=300&&e.status<400;
    if(e.phase!==lp){if(lp!==null)ls.push('end');ls.push('group '+e.phase.toUpperCase()+' phase');lp=e.phase;}
    ls.push('Browser -> '+to+' : '+e.method+' '+path);
    if(e.duration>500)ls.push('note right : slow '+fmt(e.duration));
    var rl=isr?String(e.status)+(e.redir?' -> '+pathOf(e.redir).replace(/"/g,"'"):''):(String(e.status)+(e.duration>0?' ('+fmt(e.duration)+')':''));
    ls.push(to+' --> Browser : '+rl);
  });
  if(lp!==null)ls.push('end');ls.push('');ls.push('@enduml');
  g('hpuml-code').textContent=ls.join('\n');
  g('hpuml-pre').classList.toggle('hidden');
});
g('hpuml-copy').addEventListener('click',function(){clip(g('hpuml-code').textContent,'hpuml-copy','Copier','Copié !');});

/* ===== Phases ===== */
function renderPhases(){
  var PH=[{id:'app',name:'App Angular',c:C.app},{id:'kc',name:'Keycloak',c:C.kc},{id:'idp',name:'IdP externe',c:C.idp},{id:'cb',name:'Callback/Token',c:C.cb},{id:'other',name:'Autres',c:C.other}];
  var ph={app:{t:0,n:0},kc:{t:0,n:0},idp:{t:0,n:0},cb:{t:0,n:0},other:{t:0,n:0}};
  ANA.forEach(function(e){if(ph[e.phase])ph[e.phase].t+=e.duration,ph[e.phase].n++;});
  var total=Object.values(ph).reduce(function(a,b){return a+b.t;},0)||1;
  var mx=Math.max.apply(null,PH.map(function(p){return ph[p.id].t;}));
  var h='<thead><tr>'+['Phase','Temps cumulé','Requêtes','Moy.','%']
    .map(function(t){return'<th>'+t+'</th>';}).join('')+'</tr></thead><tbody>';
  PH.forEach(function(p){
    var d=ph[p.id];if(!d.t)return;
    var pct=(d.t/total*100).toFixed(1),avg=d.n?Math.round(d.t/d.n):0,bw=Math.round(d.t/mx*60);
    h+='<tr>'+
      '<td><span class="badge" style="background:'+p.c.bg+';color:'+p.c.t+';">'+p.name+'</span></td>'+
      '<td style="font-weight:700;color:#0f172a">'+fmt(d.t)+'</td>'+
      '<td>'+d.n+'</td>'+
      '<td>'+avg+'ms</td>'+
      '<td><span style="display:inline-block;background:#f1f5f9;border-radius:3px;height:6px;width:60px;overflow:hidden;vertical-align:middle;border:1px solid rgba(148,163,184,0.25)">'+
        '<span style="display:block;height:100%;background:'+p.c.b+';width:'+bw+'px;border-radius:3px"></span>'+
      '</span> '+pct+'%</td>'+
    '</tr>';
  });
  h+='</tbody>';g('hpt').innerHTML=h;
}
g('hcopy-ph').addEventListener('click',function(){
  var PH=[{id:'app',name:'App Angular'},{id:'kc',name:'Keycloak'},{id:'idp',name:'IdP externe'},{id:'cb',name:'Callback/Token'},{id:'other',name:'Autres'}];
  var ph={app:{t:0,n:0},kc:{t:0,n:0},idp:{t:0,n:0},cb:{t:0,n:0},other:{t:0,n:0}};
  ANA.forEach(function(e){if(ph[e.phase])ph[e.phase].t+=e.duration,ph[e.phase].n++;});
  var total=Object.values(ph).reduce(function(a,b){return a+b.t;},0)||1;
  var rows=[['Phase','Temps cumulé (ms)','Requêtes','Moy. (ms)','%']];
  PH.forEach(function(p){var d=ph[p.id];if(!d.t)return;rows.push([p.name,d.t,d.n,d.n?Math.round(d.t/d.n):0,(d.t/total*100).toFixed(1)+'%']);});
  clip(rows.map(function(r){return r.join('\t');}).join('\n'),'hcopy-ph','Copier tableau (CSV)','Copié !');
});

/* ===== Reqs ===== */
function renderReqs(){
  var data=FILT==='all'?ANA:ANA.filter(function(e){return e.phase===FILT;});
  var th='<thead><tr>'+['#','Phase','M.','URL','Status','Durée','+t']
    .map(function(t){return'<th>'+t+'</th>';}).join('')+'</tr></thead>';
  var rows=data.slice(0,300).map(function(e){
    var pc=C[e.phase]||C.other;
    var sc2=e.status>=400?'#b91c1c':e.status>=300?'#c2410c':'#047857';
    var sn =e.status>=400?'#fef2f2':e.status>=300?'#fff7ed':'#ecfdf5';
    var mc=e.method==='GET'?'#4338ca':e.method==='POST'?'#047857':'#6d28d9';
    var mn=e.method==='GET'?'#eef2ff':e.method==='POST'?'#ecfdf5':'#f3e8ff';
    var su=pathOf(e.url);
    return'<tr>'+
      '<td style="color:#94a3b8;white-space:nowrap">'+(e.idx+1)+'</td>'+
      '<td style="white-space:nowrap"><span class="badge" style="background:'+pc.bg+';color:'+pc.t+';">'+e.phase+'</span></td>'+
      '<td style="white-space:nowrap"><span class="badge" style="background:'+mn+';color:'+mc+';">'+e.method+'</span></td>'+
      '<td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;color:#64748b;white-space:nowrap" title="'+xe(e.url)+'">'+xe(su)+'</td>'+
      '<td style="white-space:nowrap"><span class="badge" style="background:'+sn+';color:'+sc2+';">'+e.status+'</span></td>'+
      '<td style="white-space:nowrap;'+(e.duration>500?'color:#c2410c;font-weight:700':'color:#0f172a')+'">'+fmt(e.duration)+'</td>'+
      '<td style="white-space:nowrap;color:#94a3b8">+'+fmt(e.start)+'</td>'+
    '</tr>';
  }).join('');
  g('hrt').innerHTML=th+'<tbody>'+rows+'</tbody>';
}
g('hpf').addEventListener('change',function(){FILT=this.value;renderReqs();});
g('hcopy-rq').addEventListener('click',function(){
  var data=FILT==='all'?ANA:ANA.filter(function(e){return e.phase===FILT;});
  var rows=[['#','Phase','Méthode','URL','Status','Durée (ms)','+t (ms)']];
  data.slice(0,300).forEach(function(e){rows.push([e.idx+1,e.phase,e.method,e.url,e.status,e.duration,e.start]);});
  clip(rows.map(function(r){return r.join('\t');}).join('\n'),'hcopy-rq','Copier requêtes filtrées (CSV)','Copié !');
});

/* ===== Tabs ===== */
g('htb-seq').addEventListener('click',function(){tab('seq');});
g('htb-phases').addEventListener('click',function(){tab('phases');});
g('htb-reqs').addEventListener('click',function(){tab('reqs');});
g('htb-tokens').addEventListener('click',function(){tab('tokens');});
function tab(n){
  ['seq','phases','reqs','tokens'].forEach(function(t){
    var panel=g('hp-'+t);
    if(t===n){panel.classList.remove('hidden');}else{panel.classList.add('hidden');}
  });
  ['seq','phases','reqs','tokens'].forEach(function(t){
    var b=g('htb-'+t);
    if(t===n)b.classList.add('active');else b.classList.remove('active');
  });
}

function clip(txt,id,orig,ok){navigator.clipboard.writeText(txt).then(function(){flash(id,ok,orig);}).catch(function(){var ta=document.createElement('textarea');ta.value=txt;ta.style.cssText='position:fixed;opacity:0';document.body.appendChild(ta);ta.focus();ta.select();try{document.execCommand('copy');}catch(x){}document.body.removeChild(ta);flash(id,ok,orig);});}
function flash(id,ok,orig){var b=g(id);if(!b)return;b.textContent=ok;setTimeout(function(){b.textContent=orig;},2000);}
function ah(ctx,fx,fy,tx,ty,c){var a=Math.atan2(ty-fy,tx-fx),sz=6;ctx.fillStyle=c;ctx.beginPath();ctx.moveTo(tx,ty);ctx.lineTo(tx-sz*Math.cos(a-Math.PI/7),ty-sz*Math.sin(a-Math.PI/7));ctx.lineTo(tx-sz*Math.cos(a+Math.PI/7),ty-sz*Math.sin(a+Math.PI/7));ctx.closePath();ctx.fill();}
function rr(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();}
function showErr(m){g('herr').textContent=m;g('herr').classList.remove('hidden');}
function hideErr(){g('herr').classList.add('hidden');}
})();

});
