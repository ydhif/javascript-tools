(function () {
  const $ = (id) => document.getElementById(id);
  let currentDoc = null;
  let currentJwks = null;

  // Les endpoints standards de la spec OIDC Discovery 1.0 + extensions courantes.
  const KNOWN_ENDPOINTS = [
    ["authorization_endpoint", "Autorisation (flow utilisateur)"],
    ["token_endpoint", "Échange de tokens"],
    ["userinfo_endpoint", "Userinfo (GET/POST avec access_token)"],
    ["end_session_endpoint", "Logout RP-initiated (RFC OIDC Session)"],
    ["revocation_endpoint", "Révocation (RFC 7009)"],
    ["introspection_endpoint", "Introspection (RFC 7662)"],
    ["device_authorization_endpoint", "Device Authorization Grant (RFC 8628)"],
    ["registration_endpoint", "Dynamic Client Registration (RFC 7591)"],
    ["backchannel_authentication_endpoint", "CIBA (OIDC Backchannel)"],
    ["pushed_authorization_request_endpoint", "PAR (RFC 9126)"],
    ["jwks_uri", "JWKS (clés publiques)"],
  ];

  const CAPABILITY_FIELDS = [
    ["response_types_supported", "Response types"],
    ["response_modes_supported", "Response modes"],
    ["grant_types_supported", "Grant types"],
    ["subject_types_supported", "Subject types"],
    ["scopes_supported", "Scopes"],
    ["claims_supported", "Claims"],
    ["id_token_signing_alg_values_supported", "ID token signing algs"],
    ["id_token_encryption_alg_values_supported", "ID token encryption algs"],
    ["userinfo_signing_alg_values_supported", "Userinfo signing algs"],
    ["request_object_signing_alg_values_supported", "Request object signing algs"],
    ["token_endpoint_auth_methods_supported", "Token endpoint auth methods"],
    ["token_endpoint_auth_signing_alg_values_supported", "Token endpoint auth signing algs"],
    ["code_challenge_methods_supported", "PKCE methods"],
    ["acr_values_supported", "ACR values"],
    ["claim_types_supported", "Claim types"],
    ["ui_locales_supported", "UI locales"],
  ];

  function setStatus(msg, kind) {
    const el = $("fetch-status");
    el.textContent = msg;
    el.className = "text-sm " +
      (kind === "err" ? "text-red-700 font-medium" :
       kind === "ok"  ? "text-emerald-700 font-medium" :
                        "text-slate-600");
  }

  async function fetchDiscovery() {
    const raw = $("issuer-input").value.trim();
    if (!raw) { setStatus("✗ URL d'issuer manquante", "err"); return; }
    if (!/^https:\/\//i.test(raw)) {
      setStatus("✗ L'URL doit être en HTTPS", "err");
      return;
    }
    const issuer = raw.replace(/\/+$/, "");
    const configUrl = issuer + "/.well-known/openid-configuration";
    setStatus("… fetch " + configUrl, "");

    try {
      const res = await fetch(configUrl);
      if (!res.ok) throw new Error("HTTP " + res.status + " " + res.statusText);
      const doc = await res.json();
      currentDoc = doc;
      setStatus("✓ Configuration chargée", "ok");
      render(doc);
      // Fetch JWKS en parallèle
      if (doc.jwks_uri) {
        await fetchJwks(doc.jwks_uri);
      } else {
        $("jwks-status").textContent = "Aucun jwks_uri déclaré dans la configuration.";
      }
    } catch (e) {
      setStatus("✗ " + e.message + " (CORS bloqué ?)", "err");
    }
  }

  async function fetchJwks(url) {
    $("jwks-status").textContent = "… fetch " + url;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const jwks = await res.json();
      currentJwks = jwks;
      renderJwks(jwks);
      $("jwks-status").textContent = "✓ " + ((jwks.keys || []).length) + " clé(s) récupérée(s) depuis " + url;
    } catch (e) {
      $("jwks-status").textContent = "✗ JWKS : " + e.message + " (CORS ?)";
    }
  }

  function render(doc) {
    $("results").classList.remove("hidden");
    renderEndpoints(doc);
    renderCapabilities(doc);
    renderGrade(doc);
    renderKeycloakExtras(doc);
    $("raw-json").textContent = JSON.stringify(doc, null, 2);
  }

  // Détection Keycloak : l'issuer contient /realms/<nom> et les endpoints pointent vers /protocol/openid-connect
  function detectKeycloak(doc) {
    const issuer = doc.issuer || "";
    const m = issuer.match(/^(https?:\/\/[^/]+)(\/auth)?\/realms\/([^/]+)\/?$/);
    if (!m) return null;
    const base = m[1] + (m[2] || ""); // Keycloak < 17 avait /auth/, >=17 sans
    const realm = m[3];
    return { base, realm };
  }

  function renderKeycloakExtras(doc) {
    const kc = detectKeycloak(doc);
    const section = $("keycloak-extras");
    if (!kc) { section.classList.add("hidden"); return; }
    section.classList.remove("hidden");
    const list = $("kc-extras-list");
    list.innerHTML = "";

    const extras = [
      ["Account Console",    kc.base + "/realms/" + kc.realm + "/account",           "Console utilisateur (profil, credentials, sessions actives)"],
      ["Admin Console",      kc.base + "/admin/" + kc.realm + "/console/",           "Console d'administration du realm (nécessite un compte admin)"],
      ["Well-known URL",     kc.base + "/realms/" + kc.realm + "/.well-known/openid-configuration", "Document de discovery (déjà chargé ici)"],
      ["Realm info (public)", kc.base + "/realms/" + kc.realm,                       "Endpoint public qui retourne le nom du realm et sa clé publique"],
    ];

    extras.forEach(([name, url, desc]) => {
      const row = document.createElement("div");
      row.className = "od-endpoint";
      row.innerHTML =
        '<span class="od-endpoint-name" title="' + escapeAttr(desc) + '">' + escapeHtml(name) + '</span>' +
        '<span class="od-endpoint-url" title="' + escapeAttr(url) + '">' + escapeHtml(url) + '</span>' +
        btnCopy(url);
      list.appendChild(row);
    });

    // Info brokering
    const info = document.createElement("div");
    info.className = "mt-3 text-xs text-slate-600";
    info.innerHTML =
      "<b>Brokering :</b> pour rediriger directement vers un IdP broker configuré dans ce realm, " +
      "ajoute <code>&amp;kc_idp_hint=&lt;alias&gt;</code> à l'URL <code>/authorize</code>. " +
      "L'alias est celui défini dans Keycloak Admin → Identity Providers. " +
      "Utilise <b>PKCE &amp; Authz URL Builder</b> pour construire l'URL complète.";
    list.appendChild(info);

    list.querySelectorAll("[data-copy]").forEach((b) => {
      b.addEventListener("click", () => {
        navigator.clipboard.writeText(b.dataset.copy);
        const orig = b.textContent; b.textContent = "Copié"; setTimeout(() => b.textContent = orig, 1000);
      });
    });
  }

  function renderEndpoints(doc) {
    const container = $("endpoints-list");
    container.innerHTML = "";

    // issuer d'abord
    const issuerRow = document.createElement("div");
    issuerRow.className = "od-endpoint";
    issuerRow.innerHTML =
      '<span class="od-endpoint-name">issuer</span>' +
      '<span class="od-endpoint-url" title="' + escapeAttr(doc.issuer || "") + '">' +
        (doc.issuer ? escapeHtml(doc.issuer) : '<span class="od-endpoint-missing">absent</span>') +
      '</span>' +
      (doc.issuer ? btnCopy(doc.issuer) : '<span></span>');
    container.appendChild(issuerRow);

    KNOWN_ENDPOINTS.forEach(([field, label]) => {
      const row = document.createElement("div");
      row.className = "od-endpoint";
      const val = doc[field];
      row.innerHTML =
        '<span class="od-endpoint-name" title="' + escapeAttr(label) + '">' + field + '</span>' +
        (val
          ? '<span class="od-endpoint-url" title="' + escapeAttr(val) + '">' + escapeHtml(val) + '</span>'
          : '<span class="od-endpoint-missing">non déclaré</span>') +
        (val ? btnCopy(val) : '<span></span>');
      container.appendChild(row);
    });

    // Gestion des clics sur "Copier"
    container.querySelectorAll("[data-copy]").forEach((b) => {
      b.addEventListener("click", () => {
        navigator.clipboard.writeText(b.dataset.copy);
        const orig = b.textContent; b.textContent = "Copié"; setTimeout(() => b.textContent = orig, 1000);
      });
    });
  }

  function btnCopy(val) {
    return '<button class="od-copy" data-copy="' + escapeAttr(val) + '">Copier</button>';
  }

  function renderCapabilities(doc) {
    const container = $("capabilities");
    container.innerHTML = "";
    CAPABILITY_FIELDS.forEach(([field, label]) => {
      const val = doc[field];
      if (!val) return;
      const card = document.createElement("div");
      card.className = "od-cap-card";
      const items = Array.isArray(val) ? val : [val];
      const html = items.map((v) => {
        let cls = "od-chip";
        if (isBadAlg(field, v)) cls += " od-chip-bad";
        else if (isWarnValue(field, v)) cls += " od-chip-warn";
        else if (isGoodValue(field, v)) cls += " od-chip-good";
        return '<span class="' + cls + '">' + escapeHtml(String(v)) + '</span>';
      }).join("");
      card.innerHTML =
        '<div class="od-cap-title">' + escapeHtml(label) + '</div>' +
        '<div>' + html + '</div>';
      container.appendChild(card);
    });
  }

  function isBadAlg(field, value) {
    if (/signing_alg_values/.test(field)) {
      if (value === "none") return true;
      if (value === "HS256" || value === "HS384" || value === "HS512") return true; // secret symétrique → client shared secret
      if (value === "RS1" || /sha1/i.test(value)) return true;
    }
    if (field === "response_types_supported") {
      if (value === "token") return true; // implicit
      if (/token/.test(value) && !/code/.test(value)) return true;
    }
    return false;
  }

  function isWarnValue(field, value) {
    if (field === "response_types_supported" && /token/.test(value) && /code/.test(value)) return true; // hybrid
    if (field === "grant_types_supported" && value === "implicit") return true;
    if (field === "grant_types_supported" && value === "password") return true; // ROPC deprecated
    if (field === "token_endpoint_auth_methods_supported" && value === "client_secret_basic") return false;
    if (field === "token_endpoint_auth_methods_supported" && value === "none") return true; // public client sans PKCE
    return false;
  }

  function isGoodValue(field, value) {
    if (field === "code_challenge_methods_supported" && value === "S256") return true;
    if (field === "token_endpoint_auth_methods_supported" && value === "private_key_jwt") return true;
    if (field === "token_endpoint_auth_methods_supported" && value === "tls_client_auth") return true;
    if (/signing_alg_values/.test(field) && /^(RS|PS|ES)(256|384|512)$/.test(value) && value !== "RS256") return true;
    return false;
  }

  function renderGrade(doc) {
    const grade = $("grade");
    grade.innerHTML = "";
    const items = [];

    const pushItem = (kind, icon, msg) => items.push({ kind, icon, msg });

    // 1. Issuer cohérent
    const expectedIssuer = $("issuer-input").value.trim().replace(/\/+$/, "");
    if (doc.issuer && expectedIssuer && doc.issuer.replace(/\/+$/, "") !== expectedIssuer) {
      pushItem("warn", "!", "Le champ `issuer` du document (" + doc.issuer + ") ne correspond pas à l'URL interrogée. Certains clients exigent l'égalité stricte.");
    } else if (doc.issuer) {
      pushItem("ok", "✓", "`issuer` présent et cohérent avec l'URL interrogée.");
    } else {
      pushItem("bad", "✗", "`issuer` absent du document — non conforme à OIDC Discovery 1.0.");
    }

    // 2. HTTPS partout
    const insecureEndpoints = [];
    KNOWN_ENDPOINTS.forEach(([f]) => {
      if (doc[f] && !/^https:\/\//i.test(doc[f])) insecureEndpoints.push(f);
    });
    if (insecureEndpoints.length) {
      pushItem("bad", "✗", "Endpoints non-HTTPS détectés : " + insecureEndpoints.join(", "));
    } else {
      pushItem("ok", "✓", "Tous les endpoints déclarés sont en HTTPS.");
    }

    // 3. PKCE
    const pkce = doc.code_challenge_methods_supported || [];
    if (pkce.includes("S256")) {
      pushItem("ok", "✓", "PKCE S256 supporté (recommandé pour tous les clients publics).");
    } else if (pkce.length) {
      pushItem("warn", "!", "PKCE supporté mais S256 manquant — seules les méthodes " + pkce.join(", ") + " sont disponibles.");
    } else {
      pushItem("bad", "✗", "PKCE (`code_challenge_methods_supported`) non déclaré — les clients publics n'auront pas de protection contre l'interception du code d'autorisation.");
    }

    // 4. Flows legacy
    const grants = doc.grant_types_supported || [];
    const responseTypes = doc.response_types_supported || [];
    if (responseTypes.includes("token") || responseTypes.includes("id_token token")) {
      pushItem("warn", "!", "Flow **implicit** activé (`response_type=token`) — déprécié par OAuth 2.1, à désactiver si possible.");
    }
    if (grants.includes("password")) {
      pushItem("warn", "!", "Grant `password` (ROPC) activé — déprécié par OAuth 2.1.");
    }
    if (grants.includes("implicit")) {
      pushItem("warn", "!", "Grant `implicit` activé — déprécié par OAuth 2.1.");
    }

    // 5. Algos de signature des id_tokens
    const idAlgs = doc.id_token_signing_alg_values_supported || [];
    const hasHS = idAlgs.some((a) => /^HS/.test(a));
    const hasNone = idAlgs.includes("none");
    const hasAsym = idAlgs.some((a) => /^(RS|PS|ES)/.test(a));
    if (hasNone) {
      pushItem("bad", "✗", "`id_token_signing_alg_values_supported` contient `none` — les tokens peuvent être acceptés sans signature.");
    }
    if (hasHS && !hasAsym) {
      pushItem("warn", "!", "Seuls des algos HMAC (HS*) sont proposés pour les id_tokens. Cela nécessite de partager le `client_secret` et empêche la vérification par des clients publics.");
    } else if (hasHS) {
      pushItem("info", "i", "HMAC (HS*) présent en plus des algos asymétriques. Vérifier que les clients n'utilisent pas HS* par défaut.");
    }
    if (hasAsym) {
      pushItem("ok", "✓", "Algos asymétriques disponibles pour la signature des id_tokens (" +
        idAlgs.filter((a) => /^(RS|PS|ES)/.test(a)).join(", ") + ").");
    }

    // 6. Auth methods au token endpoint
    const authMethods = doc.token_endpoint_auth_methods_supported || [];
    if (authMethods.includes("private_key_jwt") || authMethods.includes("tls_client_auth")) {
      pushItem("ok", "✓", "Authentification forte au token endpoint disponible (`private_key_jwt` ou `tls_client_auth`).");
    }
    if (authMethods.includes("none") && !pkce.includes("S256")) {
      pushItem("bad", "✗", "Le token endpoint accepte des clients publics (`none`) sans obligation de PKCE S256 — combinaison à risque.");
    }

    // 7. Request parameter / request URI — vecteur SSRF si mal implémenté
    if (doc.request_parameter_supported === true) {
      pushItem("info", "i", "`request_parameter_supported=true` : accepte JAR (JWT Secured Authorization Request). Vérifier que les JWT sont signés et que l'`aud` est validé.");
    }
    if (doc.request_uri_parameter_supported === true && doc.require_request_uri_registration !== true) {
      pushItem("warn", "!", "`request_uri_parameter_supported=true` sans `require_request_uri_registration=true` — risque de SSRF via `request_uri`.");
    }

    // 8. Subject types
    const subjectTypes = doc.subject_types_supported || [];
    if (subjectTypes.includes("pairwise")) {
      pushItem("ok", "✓", "Subject type `pairwise` supporté (protection de la vie privée, `sub` différent par client).");
    }

    // 9. Logout
    if (doc.end_session_endpoint) {
      pushItem("ok", "✓", "`end_session_endpoint` déclaré (logout RP-initiated possible).");
    } else {
      pushItem("info", "i", "Aucun `end_session_endpoint` — le logout RP-initiated OIDC n'est pas disponible.");
    }

    // Rendu
    items.forEach(({ kind, icon, msg }) => {
      const div = document.createElement("div");
      div.className = "od-grade-item od-grade-" + kind;
      div.innerHTML =
        '<span class="od-grade-icon">' + escapeHtml(icon) + "</span>" +
        "<span>" + escapeHtml(msg) + "</span>";
      grade.appendChild(div);
    });
  }

  function renderJwks(jwks) {
    const list = $("jwks-list");
    list.innerHTML = "";
    const keys = (jwks && jwks.keys) || [];
    if (!keys.length) {
      list.innerHTML = '<div class="text-xs text-slate-500 italic">Aucune clé dans le JWKS.</div>';
      return;
    }
    keys.forEach((k) => {
      const div = document.createElement("div");
      div.className = "od-jwk";
      const head = document.createElement("div");
      head.className = "od-jwk-head";
      head.innerHTML =
        (k.kid ? '<span class="badge" style="background:#eef2ff;color:#4338ca;">kid: ' + escapeHtml(k.kid) + '</span>' : '') +
        (k.kty ? '<span class="badge" style="background:#ecfdf5;color:#047857;">kty: ' + escapeHtml(k.kty) + '</span>' : '') +
        (k.alg ? '<span class="badge" style="background:#f3e8ff;color:#6d28d9;">alg: ' + escapeHtml(k.alg) + '</span>' : '') +
        (k.use ? '<span class="badge" style="background:#fef3c7;color:#92400e;">use: ' + escapeHtml(k.use) + '</span>' : '');
      div.appendChild(head);

      // Champs clé : n/e pour RSA, x/y/crv pour EC, k pour oct
      const fields = ["n", "e", "x", "y", "crv", "k", "x5t", "x5t#S256"];
      fields.forEach((f) => {
        if (k[f] !== undefined) {
          const row = document.createElement("div");
          row.className = "od-jwk-field";
          const val = String(k[f]);
          const trunc = val.length > 80 ? val.slice(0, 80) + "…" : val;
          row.innerHTML =
            "<span>" + escapeHtml(f) + "</span>" +
            "<span>" + escapeHtml(trunc) + "</span>";
          div.appendChild(row);
        }
      });
      list.appendChild(div);
    });
  }

  function parsePasted() {
    try {
      const docText = $("paste-input").value.trim();
      if (!docText) throw new Error("JSON de configuration manquant");
      const doc = JSON.parse(docText);
      currentDoc = doc;
      setStatus("✓ JSON parsé", "ok");
      render(doc);

      const jwksText = $("paste-jwks").value.trim();
      if (jwksText) {
        const jwks = JSON.parse(jwksText);
        currentJwks = jwks;
        renderJwks(jwks);
        $("jwks-status").textContent = "✓ " + ((jwks.keys || []).length) + " clé(s) (collées manuellement)";
      } else if (doc.jwks_uri) {
        fetchJwks(doc.jwks_uri);
      }
    } catch (e) {
      setStatus("✗ " + e.message, "err");
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

  function pemToBytes(pem) {
    const b64 = pem.replace(/-----(BEGIN|END)[^-]+-----/g, "").replace(/\s+/g, "");
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("fetch-btn").addEventListener("click", fetchDiscovery);
    $("paste-btn").addEventListener("click", () => {
      $("paste-wrap").classList.toggle("hidden");
    });
    $("parse-paste-btn").addEventListener("click", parsePasted);

    // Setup rapide Keycloak
    $("kc-apply").addEventListener("click", () => {
      const base = $("kc-base").value.trim().replace(/\/+$/, "");
      const realm = $("kc-realm").value.trim();
      if (!base || !realm) return;
      $("issuer-input").value = base + "/realms/" + realm;
      fetchDiscovery();
    });
    $("kc-realm").addEventListener("keydown", (e) => {
      if (e.key === "Enter") $("kc-apply").click();
    });

    $("preset-select").addEventListener("change", (e) => {
      if (e.target.value) {
        $("issuer-input").value = e.target.value;
        e.target.selectedIndex = 0;
      }
    });

    $("issuer-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") fetchDiscovery();
    });

    $("download-html").addEventListener("click", () => {
      ToolExport.downloadStandalone({
        filename: "oidc-discovery.html",
        title: "OIDC Discovery Explorer",
        inlineScripts: ["./oidc-discovery.js"],
      });
    });

    ToolExport.attachActions($("results"), () => {
      if (!currentDoc) return null;
      return JSON.stringify(currentDoc, null, 2);
    });
  });
})();
