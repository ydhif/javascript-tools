(function () {
  const $ = (id) => document.getElementById(id);

  // Descriptions des paramètres pour le tableau décomposé
  const PARAM_DESC = {
    client_id: "Identifiant du client enregistré côté IdP.",
    redirect_uri: "URL de retour après l'authentification. Doit être strictement enregistrée côté IdP.",
    response_type: "Type de réponse attendue. `code` = authorization code flow (recommandé).",
    response_mode: "Comment l'IdP retourne les paramètres (query / fragment / form_post).",
    scope: "Scopes demandés. `openid` est obligatoire pour obtenir un id_token OIDC.",
    state: "Valeur aléatoire retournée telle quelle par l'IdP — protection CSRF à vérifier au callback.",
    nonce: "Valeur aléatoire incluse dans l'id_token — empêche les attaques par rejeu.",
    code_challenge: "Challenge PKCE = base64url(SHA-256(code_verifier)). L'IdP le stocke côté serveur.",
    code_challenge_method: "Méthode de dérivation du challenge. S256 est la seule valeur sûre (plain est déprécié).",
    prompt: "Directives UX : none (silencieux), login (reauth), consent, select_account.",
    max_age: "Si la session IdP est plus ancienne que max_age (secondes), force une réauthentification.",
    login_hint: "Pré-remplit l'email ou username sur la page de login.",
    ui_locales: "Langues préférées pour l'UI de l'IdP (BCP 47, espace-séparées).",
    acr_values: "Niveaux d'assurance d'authentification (ACR) demandés — ex: MFA, niveau silver/gold.",
    audience: "Extension Auth0/propriétaire : la ressource API ciblée par l'access_token.",
    kc_idp_hint: "Spécifique Keycloak : saute la page de login et redirige directement vers l'IdP broker dont l'alias est donné (Google, AD, SAML…).",
  };

  function randB64Url(byteLen) {
    const bytes = new Uint8Array(byteLen);
    crypto.getRandomValues(bytes);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  // code_verifier = 43-128 chars parmi [A-Z][a-z][0-9]-._~ (RFC 7636 §4.1)
  function randomVerifier(len) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    const rand = new Uint8Array(len);
    crypto.getRandomValues(rand);
    let s = "";
    for (let i = 0; i < len; i++) s += chars[rand[i] % chars.length];
    return s;
  }

  async function sha256Base64Url(input) {
    const bytes = new TextEncoder().encode(input);
    const buf = await crypto.subtle.digest("SHA-256", bytes);
    const arr = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  async function regenerate() {
    const len = parseInt($("pkce-len").value, 10);
    const verifier = randomVerifier(len);
    const challenge = await sha256Base64Url(verifier);
    $("pkce-verifier").textContent = verifier;
    $("pkce-challenge").textContent = challenge;
    $("state").value = randB64Url(16);
    $("nonce").value = randB64Url(16);
  }

  function buildUrl() {
    const endpoint = $("authz-endpoint").value.trim();
    if (!endpoint) {
      alert("authorization_endpoint obligatoire");
      return;
    }
    let url;
    try { url = new URL(endpoint); }
    catch (_) { alert("URL d'endpoint invalide"); return; }

    const params = new URLSearchParams();
    // Champs obligatoires
    params.set("client_id", $("client-id").value.trim());
    params.set("redirect_uri", $("redirect-uri").value.trim());
    params.set("response_type", $("response-type").value);
    params.set("scope", $("scope").value.trim());
    params.set("state", $("state").value.trim());
    params.set("nonce", $("nonce").value.trim());

    // PKCE (sauf si response_type n'inclut pas code)
    if ($("response-type").value.includes("code")) {
      params.set("code_challenge", $("pkce-challenge").textContent);
      params.set("code_challenge_method", "S256");
    }

    // Optionnels
    const optional = {
      response_mode: $("response-mode").value,
      prompt: $("prompt").value,
      max_age: $("max-age").value,
      login_hint: $("login-hint").value,
      ui_locales: $("ui-locales").value,
      acr_values: $("acr-values").value,
      audience: $("audience").value,
      kc_idp_hint: $("kc-idp-hint").value,
    };
    Object.entries(optional).forEach(([k, v]) => {
      if (v && String(v).trim()) params.set(k, String(v).trim());
    });

    // Merge avec les éventuels params déjà présents dans l'URL
    const existingParams = new URLSearchParams(url.search);
    params.forEach((v, k) => existingParams.set(k, v));
    url.search = existingParams.toString();

    $("final-url").textContent = url.toString();
    renderParams(existingParams);
    $("output").classList.remove("hidden");
  }

  function renderParams(params) {
    const table = $("params-table");
    table.innerHTML = "";
    const thead = document.createElement("thead");
    thead.innerHTML = "<tr><th>Paramètre</th><th>Valeur</th><th>Description</th></tr>";
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    const entries = [];
    params.forEach((v, k) => entries.push([k, v]));
    // Tri : obligatoires d'abord, puis PKCE, puis optionnels
    const order = ["client_id","redirect_uri","response_type","scope","state","nonce",
                   "code_challenge","code_challenge_method","response_mode","prompt",
                   "max_age","login_hint","ui_locales","acr_values","audience","kc_idp_hint"];
    entries.sort((a, b) => {
      const ia = order.indexOf(a[0]); const ib = order.indexOf(b[0]);
      if (ia === -1 && ib === -1) return a[0].localeCompare(b[0]);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    entries.forEach(([k, v]) => {
      const tr = document.createElement("tr");
      const tdK = document.createElement("td");
      tdK.className = "pk-param-key";
      tdK.textContent = k;
      const tdV = document.createElement("td");
      tdV.className = "pk-param-val";
      tdV.textContent = v;
      const tdD = document.createElement("td");
      tdD.className = "pk-param-desc";
      tdD.textContent = PARAM_DESC[k] || "";
      tr.appendChild(tdK); tr.appendChild(tdV); tr.appendChild(tdD);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
  }

  document.addEventListener("DOMContentLoaded", async () => {
    await regenerate();

    $("pkce-regen").addEventListener("click", regenerate);
    $("pkce-len").addEventListener("change", regenerate);

    // Keycloak quick setup : base URL + realm → construit tous les endpoints
    function applyKeycloak() {
      const base = $("kc-base").value.trim().replace(/\/+$/, "");
      const realm = $("kc-realm").value.trim();
      if (!base || !realm) return;
      $("authz-endpoint").value = base + "/realms/" + realm + "/protocol/openid-connect/auth";
    }
    $("kc-apply").addEventListener("click", applyKeycloak);
    $("kc-realm").addEventListener("keydown", (e) => { if (e.key === "Enter") applyKeycloak(); });

    $("build-btn").addEventListener("click", buildUrl);

    $("example-btn").addEventListener("click", () => {
      $("kc-base").value = "https://login.example.com";
      $("kc-realm").value = "master";
      $("kc-idp-hint").value = "";
      applyKeycloak();
      $("client-id").value = "my-angular-app";
      $("redirect-uri").value = "http://localhost:4200/callback";
      $("scope").value = "openid profile email offline_access";
      $("prompt").value = "login";
      buildUrl();
    });
    // Exemple spécifique : Keycloak → broker Google via kc_idp_hint
    const kcBrokerBtn = document.createElement("button");
    kcBrokerBtn.type = "button";
    kcBrokerBtn.className = "btn btn-ghost";
    kcBrokerBtn.textContent = "Exemple Keycloak → broker Google";
    $("example-btn").parentElement.insertBefore(kcBrokerBtn, $("example-auth0-btn"));
    kcBrokerBtn.addEventListener("click", () => {
      $("kc-base").value = "https://login.example.com";
      $("kc-realm").value = "master";
      $("kc-idp-hint").value = "google";
      applyKeycloak();
      $("client-id").value = "my-angular-app";
      $("redirect-uri").value = "http://localhost:4200/callback";
      $("scope").value = "openid profile email";
      $("prompt").value = "";
      buildUrl();
    });
    $("example-auth0-btn").addEventListener("click", () => {
      $("authz-endpoint").value = "https://dev-xxxxxx.us.auth0.com/authorize";
      $("client-id").value = "YOUR_AUTH0_CLIENT_ID";
      $("redirect-uri").value = "http://localhost:3000/callback";
      $("scope").value = "openid profile email";
      $("audience").value = "https://api.example.com";
      $("prompt").value = "";
      buildUrl();
    });

    $("copy-url").addEventListener("click", () => {
      const url = $("final-url").textContent;
      if (url) {
        navigator.clipboard.writeText(url);
        const b = $("copy-url"); const o = b.textContent;
        b.textContent = "Copié ✓"; setTimeout(() => b.textContent = o, 1200);
      }
    });
    $("open-url").addEventListener("click", () => {
      const url = $("final-url").textContent;
      if (url) window.open(url, "_blank", "noopener");
    });

    $("download-html").addEventListener("click", () => {
      ToolExport.downloadStandalone({
        filename: "pkce-authz.html",
        title: "PKCE & Authz URL Builder",
        inlineScripts: ["./pkce-authz.js"],
      });
    });

    ToolExport.attachActions($("output"), () => {
      const url = $("final-url").textContent;
      if (!url) return null;
      return "URL d'autorisation :\n" + url +
             "\n\ncode_verifier (à garder pour l'échange token) :\n" +
             $("pkce-verifier").textContent;
    });
  });
})();
