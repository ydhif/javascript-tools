(function () {
  const $ = (id) => document.getElementById(id);

  const STORAGE = {
    CONFIG: "kc-app:config",
    PKCE: "kc-app:pkce",
    TOKENS: "kc-app:tokens",
  };

  // ---------- helpers ----------
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function randB64Url(byteLen) {
    const bytes = new Uint8Array(byteLen);
    crypto.getRandomValues(bytes);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

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

  function b64urlToJson(s) {
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    return JSON.parse(decodeURIComponent(
      atob(s).split("").map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join("")
    ));
  }

  function decodeJwt(token) {
    if (!token || typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    try {
      return {
        header: b64urlToJson(parts[0]),
        payload: b64urlToJson(parts[1]),
      };
    } catch (_) { return null; }
  }

  function fmtDate(epochSec) {
    if (!epochSec) return "—";
    try { return new Date(epochSec * 1000).toLocaleString(); } catch (_) { return "—"; }
  }

  function relTime(epochSec) {
    if (!epochSec) return "";
    const delta = epochSec - Math.floor(Date.now() / 1000);
    const abs = Math.abs(delta);
    const unit = abs >= 3600 ? [3600, "h"] : abs >= 60 ? [60, "min"] : [1, "s"];
    const n = Math.round(abs / unit[0]);
    return delta >= 0 ? "dans " + n + " " + unit[1] : "il y a " + n + " " + unit[1];
  }

  // ---------- logging ----------
  function log(kind, msg) {
    const box = $("kc-log");
    const row = document.createElement("div");
    row.className = "kc-log-row kc-log-" + (kind || "info");
    const t = new Date().toLocaleTimeString();
    row.innerHTML = '<span class="kc-log-time">' + t + "</span>" + escapeHtml(msg);
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
  }

  // ---------- config & endpoints ----------
  function endpoints(cfg) {
    const base = (cfg.base || "").replace(/\/+$/, "");
    const realm = (cfg.realm || "").trim();
    if (!base || !realm) return {};
    const root = base + "/realms/" + realm + "/protocol/openid-connect";
    return {
      authorization: root + "/auth",
      token: root + "/token",
      userinfo: root + "/userinfo",
      logout: root + "/logout",
      jwks: root + "/certs",
      issuer: base + "/realms/" + realm,
    };
  }

  function renderEndpoints(cfg) {
    const ep = endpoints(cfg);
    const tbl = $("kc-endpoints-table");
    tbl.innerHTML = "";
    if (!ep.authorization) {
      tbl.innerHTML = '<tr><td class="kc-claim-desc text-xs text-slate-500">Renseigne base URL + realm pour voir les endpoints.</td></tr>';
      return;
    }
    const thead = document.createElement("thead");
    thead.innerHTML = "<tr><th>Endpoint</th><th>URL</th></tr>";
    tbl.appendChild(thead);
    const tbody = document.createElement("tbody");
    [
      ["issuer", ep.issuer],
      ["authorization_endpoint", ep.authorization],
      ["token_endpoint", ep.token],
      ["userinfo_endpoint", ep.userinfo],
      ["end_session_endpoint", ep.logout],
      ["jwks_uri", ep.jwks],
    ].forEach(([k, v]) => {
      const tr = document.createElement("tr");
      const tdK = document.createElement("td");
      tdK.className = "kc-claim-key"; tdK.textContent = k;
      const tdV = document.createElement("td");
      tdV.className = "kc-claim-val"; tdV.textContent = v;
      tr.appendChild(tdK); tr.appendChild(tdV);
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
  }

  function readConfig() {
    return {
      base: $("kc-base").value.trim(),
      realm: $("kc-realm").value.trim(),
      clientId: $("kc-client").value.trim(),
      redirectUri: $("kc-redirect").value.trim() || window.location.href.split("?")[0].split("#")[0],
      scope: $("kc-scope").value.trim() || "openid",
      idpHint: $("kc-idp-hint").value.trim(),
    };
  }

  function saveConfigInputs() {
    sessionStorage.setItem(STORAGE.CONFIG, JSON.stringify(readConfig()));
  }

  function loadConfigInputs() {
    const raw = sessionStorage.getItem(STORAGE.CONFIG);
    if (!raw) return;
    try {
      const c = JSON.parse(raw);
      if (c.base) $("kc-base").value = c.base;
      if (c.realm) $("kc-realm").value = c.realm;
      if (c.clientId) $("kc-client").value = c.clientId;
      if (c.redirectUri) $("kc-redirect").value = c.redirectUri;
      if (c.scope) $("kc-scope").value = c.scope;
      if (c.idpHint) $("kc-idp-hint").value = c.idpHint;
    } catch (_) {}
  }

  // ---------- error display ----------
  function showError(msg) {
    $("kc-error-msg").textContent = msg;
    $("kc-error").classList.remove("hidden");
    log("err", msg);
  }
  function clearError() { $("kc-error").classList.add("hidden"); }

  // ---------- sign in (redirect) ----------
  async function signIn() {
    clearError();
    const cfg = readConfig();
    if (!cfg.base || !cfg.realm || !cfg.clientId) {
      showError("Base URL, Realm et Client ID sont obligatoires.");
      return;
    }
    saveConfigInputs();

    const verifier = randomVerifier(64);
    const challenge = await sha256Base64Url(verifier);
    const state = randB64Url(16);
    const nonce = randB64Url(16);

    sessionStorage.setItem(STORAGE.PKCE, JSON.stringify({
      verifier, state, nonce, cfg, ts: Date.now(),
    }));

    const ep = endpoints(cfg);
    const url = new URL(ep.authorization);
    const p = url.searchParams;
    p.set("client_id", cfg.clientId);
    p.set("redirect_uri", cfg.redirectUri);
    p.set("response_type", "code");
    p.set("scope", cfg.scope);
    p.set("state", state);
    p.set("nonce", nonce);
    p.set("code_challenge", challenge);
    p.set("code_challenge_method", "S256");
    if (cfg.idpHint) p.set("kc_idp_hint", cfg.idpHint);

    log("info", "Redirection vers " + ep.authorization);
    window.location.href = url.toString();
  }

  // ---------- callback (exchange code → tokens) ----------
  async function handleCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const error = params.get("error");
    const errorDesc = params.get("error_description");

    if (error) {
      cleanUrl();
      showError("Erreur IdP : " + error + (errorDesc ? " — " + errorDesc : ""));
      sessionStorage.removeItem(STORAGE.PKCE);
      return;
    }
    if (!code) return;

    const raw = sessionStorage.getItem(STORAGE.PKCE);
    if (!raw) {
      cleanUrl();
      showError("Callback reçu mais aucun état PKCE en session — refais Sign in.");
      return;
    }
    const pkce = JSON.parse(raw);
    if (state !== pkce.state) {
      cleanUrl();
      showError("state ne matche pas (CSRF protection) — abandon.");
      sessionStorage.removeItem(STORAGE.PKCE);
      return;
    }

    log("ok", "Code reçu (state vérifié). Échange contre token...");
    cleanUrl();

    const cfg = pkce.cfg;
    const ep = endpoints(cfg);
    const body = new URLSearchParams();
    body.set("grant_type", "authorization_code");
    body.set("client_id", cfg.clientId);
    body.set("code", code);
    body.set("redirect_uri", cfg.redirectUri);
    body.set("code_verifier", pkce.verifier);

    let resp, data;
    try {
      resp = await fetch(ep.token, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
    } catch (e) {
      showError("Fetch /token a échoué (probablement CORS). Vérifie 'Web Origins' dans la config du client Keycloak. — " + e.message);
      sessionStorage.removeItem(STORAGE.PKCE);
      return;
    }
    try { data = await resp.json(); } catch (_) { data = null; }
    if (!resp.ok || !data || !data.access_token) {
      showError("Échec /token : " + resp.status + " — " + (data && (data.error_description || data.error) || "réponse invalide"));
      sessionStorage.removeItem(STORAGE.PKCE);
      return;
    }

    // optional : verify nonce in id_token
    if (data.id_token) {
      const dec = decodeJwt(data.id_token);
      if (dec && dec.payload.nonce && dec.payload.nonce !== pkce.nonce) {
        showError("id_token.nonce ne matche pas la valeur envoyée — token rejeté.");
        sessionStorage.removeItem(STORAGE.PKCE);
        return;
      }
    }

    sessionStorage.setItem(STORAGE.TOKENS, JSON.stringify({
      tokens: data,
      cfg,
      receivedAt: Date.now(),
    }));
    sessionStorage.removeItem(STORAGE.PKCE);
    log("ok", "Tokens reçus (access_token, " + (data.id_token ? "id_token, " : "") + (data.refresh_token ? "refresh_token" : "") + ")");
    renderAuthenticated();
  }

  function cleanUrl() {
    const u = new URL(window.location.href);
    ["code", "state", "session_state", "iss", "error", "error_description"].forEach((k) => u.searchParams.delete(k));
    history.replaceState({}, "", u.pathname + (u.search ? "?" + u.searchParams.toString() : ""));
  }

  // ---------- render authenticated state ----------
  function getSession() {
    const raw = sessionStorage.getItem(STORAGE.TOKENS);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (_) { return null; }
  }

  function renderAuthenticated() {
    const s = getSession();
    if (!s) {
      setUnauthenticated();
      return;
    }
    const { tokens, cfg } = s;
    setAuthenticated();

    // restore config inputs to the session config (in case the user came back via redirect)
    if (cfg) {
      if (cfg.base) $("kc-base").value = cfg.base;
      if (cfg.realm) $("kc-realm").value = cfg.realm;
      if (cfg.clientId) $("kc-client").value = cfg.clientId;
      if (cfg.redirectUri) $("kc-redirect").value = cfg.redirectUri;
      if (cfg.scope) $("kc-scope").value = cfg.scope;
      if (cfg.idpHint) $("kc-idp-hint").value = cfg.idpHint;
      renderEndpoints(cfg);
    }

    // profile from id_token claims
    const idDec = tokens.id_token ? decodeJwt(tokens.id_token) : null;
    const claims = idDec ? idDec.payload : (decodeJwt(tokens.access_token) || { payload: {} }).payload;
    renderProfile(claims);

    // access token pane
    $("kc-access-raw").textContent = tokens.access_token || "(absent)";
    const acc = tokens.access_token ? decodeJwt(tokens.access_token) : null;
    if (acc) {
      $("kc-access-header").textContent = JSON.stringify(acc.header, null, 2);
      $("kc-access-payload").textContent = JSON.stringify(acc.payload, null, 2);
      $("kc-access-exp").innerHTML = "exp : <b>" + escapeHtml(fmtDate(acc.payload.exp)) + "</b> (" + escapeHtml(relTime(acc.payload.exp)) + ")";
    } else {
      $("kc-access-header").textContent = "(token opaque — pas un JWT)";
      $("kc-access-payload").textContent = "";
      $("kc-access-exp").textContent = tokens.expires_in ? "expires_in : " + tokens.expires_in + "s" : "";
    }

    // id token pane
    if (tokens.id_token && idDec) {
      $("kc-id-raw").textContent = tokens.id_token;
      $("kc-id-header").textContent = JSON.stringify(idDec.header, null, 2);
      $("kc-id-payload").textContent = JSON.stringify(idDec.payload, null, 2);
      $("kc-id-exp").innerHTML = "exp : <b>" + escapeHtml(fmtDate(idDec.payload.exp)) + "</b> (" + escapeHtml(relTime(idDec.payload.exp)) + ")";
    } else {
      $("kc-id-raw").textContent = "(absent — scope 'openid' demandé ?)";
      $("kc-id-header").textContent = "";
      $("kc-id-payload").textContent = "";
      $("kc-id-exp").textContent = "";
    }

    // refresh token pane
    if (tokens.refresh_token) {
      $("kc-refresh-raw").textContent = tokens.refresh_token;
      const r = decodeJwt(tokens.refresh_token);
      if (r) {
        $("kc-refresh-decoded").classList.remove("hidden");
        $("kc-refresh-payload").textContent = JSON.stringify(r.payload, null, 2);
      } else {
        $("kc-refresh-decoded").classList.add("hidden");
      }
    } else {
      $("kc-refresh-raw").textContent = "(absent)";
      $("kc-refresh-decoded").classList.add("hidden");
    }

    // raw
    $("kc-raw").textContent = JSON.stringify(tokens, null, 2);
  }

  function renderProfile(claims) {
    const tbl = $("kc-profile-table");
    tbl.innerHTML = "";
    const thead = document.createElement("thead");
    thead.innerHTML = "<tr><th>Claim</th><th>Valeur</th></tr>";
    tbl.appendChild(thead);
    const tbody = document.createElement("tbody");

    const labels = {
      sub: "Subject",
      preferred_username: "Username",
      name: "Nom complet",
      given_name: "Prénom",
      family_name: "Nom",
      email: "Email",
      email_verified: "Email vérifié",
      iss: "Issuer",
      aud: "Audience",
      azp: "Authorized party",
      sid: "Session ID",
      acr: "ACR",
      auth_time: "Authentifié à",
      iat: "Émis à",
      exp: "Expire à",
      nonce: "Nonce",
      realm_access: "Roles (realm)",
      resource_access: "Roles (resources)",
      scope: "Scope",
    };
    const order = Object.keys(labels);
    const seen = new Set();

    order.forEach((k) => {
      if (claims[k] === undefined) return;
      seen.add(k);
      addRow(tbody, k, labels[k], claims[k]);
    });
    Object.entries(claims).forEach(([k, v]) => {
      if (seen.has(k)) return;
      addRow(tbody, k, k, v);
    });
    tbl.appendChild(tbody);
  }

  function addRow(tbody, key, label, value) {
    const tr = document.createElement("tr");
    const tdK = document.createElement("td");
    tdK.className = "kc-claim-key";
    tdK.textContent = label + (label !== key ? " (" + key + ")" : "");
    const tdV = document.createElement("td");
    tdV.className = "kc-claim-val";
    if (key === "iat" || key === "exp" || key === "auth_time" || key === "nbf") {
      tdV.textContent = value + "  →  " + fmtDate(value);
    } else if (typeof value === "object") {
      tdV.textContent = JSON.stringify(value);
    } else {
      tdV.textContent = String(value);
    }
    tr.appendChild(tdK); tr.appendChild(tdV);
    tbody.appendChild(tr);
  }

  function setAuthenticated() {
    $("kc-status").classList.remove("kc-status-off");
    $("kc-status").classList.add("kc-status-on");
    $("kc-status-label").textContent = "Connecté";
    $("btn-signin").textContent = "Re-sign in";
    $("btn-refresh").disabled = false;
    $("btn-userinfo").disabled = false;
    $("btn-signout").disabled = false;
    $("kc-auth").classList.remove("hidden");
  }

  function setUnauthenticated() {
    $("kc-status").classList.remove("kc-status-on");
    $("kc-status").classList.add("kc-status-off");
    $("kc-status-label").textContent = "Déconnecté";
    $("btn-signin").textContent = "Sign in";
    $("btn-refresh").disabled = true;
    $("btn-userinfo").disabled = true;
    $("btn-signout").disabled = true;
    $("kc-auth").classList.add("hidden");
    $("kc-userinfo-block").classList.add("hidden");
  }

  // ---------- refresh ----------
  async function refreshToken() {
    clearError();
    const s = getSession();
    if (!s || !s.tokens.refresh_token) {
      showError("Pas de refresh_token disponible.");
      return;
    }
    const ep = endpoints(s.cfg);
    const body = new URLSearchParams();
    body.set("grant_type", "refresh_token");
    body.set("client_id", s.cfg.clientId);
    body.set("refresh_token", s.tokens.refresh_token);

    log("info", "POST " + ep.token + " (grant_type=refresh_token)");
    let resp, data;
    try {
      resp = await fetch(ep.token, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      data = await resp.json();
    } catch (e) {
      showError("Refresh a échoué (CORS ?) — " + e.message);
      return;
    }
    if (!resp.ok || !data.access_token) {
      showError("Refresh refusé : " + resp.status + " — " + (data.error_description || data.error || "réponse invalide"));
      return;
    }
    s.tokens = data;
    s.receivedAt = Date.now();
    sessionStorage.setItem(STORAGE.TOKENS, JSON.stringify(s));
    log("ok", "Nouveaux tokens reçus via refresh.");
    renderAuthenticated();
  }

  // ---------- userinfo ----------
  async function fetchUserInfo() {
    clearError();
    const s = getSession();
    if (!s) return;
    const ep = endpoints(s.cfg);
    log("info", "GET " + ep.userinfo);
    let resp, data;
    try {
      resp = await fetch(ep.userinfo, {
        headers: { "Authorization": "Bearer " + s.tokens.access_token },
      });
      data = await resp.json();
    } catch (e) {
      showError("Fetch /userinfo a échoué (CORS ?) — " + e.message);
      return;
    }
    if (!resp.ok) {
      showError("/userinfo a renvoyé " + resp.status);
      return;
    }
    $("kc-userinfo").textContent = JSON.stringify(data, null, 2);
    $("kc-userinfo-block").classList.remove("hidden");
    activateTab("profile");
    log("ok", "/userinfo OK");
  }

  // ---------- sign out ----------
  function signOut() {
    clearError();
    const s = getSession();
    if (!s) return;
    const ep = endpoints(s.cfg);
    const url = new URL(ep.logout);
    if (s.tokens.id_token) url.searchParams.set("id_token_hint", s.tokens.id_token);
    url.searchParams.set("client_id", s.cfg.clientId);
    url.searchParams.set("post_logout_redirect_uri", s.cfg.redirectUri);
    sessionStorage.removeItem(STORAGE.TOKENS);
    log("info", "Redirection logout : " + url.toString());
    window.location.href = url.toString();
  }

  function resetSession() {
    sessionStorage.removeItem(STORAGE.TOKENS);
    sessionStorage.removeItem(STORAGE.PKCE);
    log("info", "Session locale effacée.");
    setUnauthenticated();
  }

  // ---------- tabs ----------
  function activateTab(name) {
    document.querySelectorAll(".kc-tab").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === name);
    });
    document.querySelectorAll("[data-pane]").forEach((p) => {
      p.classList.toggle("hidden", p.dataset.pane !== name);
    });
  }

  // ---------- init ----------
  document.addEventListener("DOMContentLoaded", () => {
    // default redirect_uri = this page
    $("kc-redirect").value = window.location.href.split("?")[0].split("#")[0];
    loadConfigInputs();

    // refresh endpoints view on input
    ["kc-base", "kc-realm"].forEach((id) => {
      $(id).addEventListener("input", () => renderEndpoints(readConfig()));
    });
    renderEndpoints(readConfig());

    // wire buttons
    $("btn-signin").addEventListener("click", signIn);
    $("btn-refresh").addEventListener("click", refreshToken);
    $("btn-userinfo").addEventListener("click", fetchUserInfo);
    $("btn-signout").addEventListener("click", signOut);
    $("btn-clear").addEventListener("click", resetSession);

    document.querySelectorAll(".kc-tab").forEach((b) => {
      b.addEventListener("click", () => activateTab(b.dataset.tab));
    });

    document.querySelectorAll("[data-copy]").forEach((b) => {
      b.addEventListener("click", () => {
        const s = getSession();
        if (!s) return;
        const which = b.dataset.copy;
        const val = which === "raw" ? JSON.stringify(s.tokens, null, 2)
                  : which === "access" ? s.tokens.access_token
                  : which === "id" ? (s.tokens.id_token || "")
                  : which === "refresh" ? (s.tokens.refresh_token || "")
                  : "";
        if (!val) return;
        navigator.clipboard.writeText(val);
        const orig = b.textContent;
        b.textContent = "Copié ✓"; setTimeout(() => b.textContent = orig, 1200);
      });
    });

    $("download-html").addEventListener("click", () => {
      ToolExport.downloadStandalone({
        filename: "keycloak-app.html",
        title: "Keycloak App",
        inlineScripts: ["./keycloak-app.js"],
      });
    });

    ToolExport.attachActions($("kc-auth"), () => {
      const s = getSession();
      if (!s) return null;
      const acc = decodeJwt(s.tokens.access_token);
      const id = decodeJwt(s.tokens.id_token);
      return {
        title: "Keycloak App — session",
        sections: [
          {
            heading: "Configuration",
            rows: [
              ["base", s.cfg.base],
              ["realm", s.cfg.realm],
              ["client_id", s.cfg.clientId],
              ["redirect_uri", s.cfg.redirectUri],
              ["scope", s.cfg.scope],
            ],
          },
          {
            heading: "Tokens",
            rows: [
              ["access_token", s.tokens.access_token || ""],
              ["id_token", s.tokens.id_token || ""],
              ["refresh_token", s.tokens.refresh_token || ""],
              ["expires_in", String(s.tokens.expires_in || "")],
              ["token_type", s.tokens.token_type || ""],
            ],
          },
          acc ? {
            heading: "Access token (payload)",
            rows: Object.entries(acc.payload).map(([k, v]) => [k, typeof v === "object" ? JSON.stringify(v) : String(v)]),
          } : null,
          id ? {
            heading: "ID token (payload)",
            rows: Object.entries(id.payload).map(([k, v]) => [k, typeof v === "object" ? JSON.stringify(v) : String(v)]),
          } : null,
        ].filter(Boolean),
      };
    });

    // process callback if present, else render existing session if any
    if (window.location.search.includes("code=") || window.location.search.includes("error=")) {
      handleCallback();
    } else {
      renderAuthenticated();
    }
  });
})();
