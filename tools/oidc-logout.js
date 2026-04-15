(function () {
  const $ = (id) => document.getElementById(id);

  const PARAM_DESC = {
    id_token_hint: "id_token reçu au login, preuve que le client sait qui se déconnecte. Évite la page de confirmation Keycloak.",
    post_logout_redirect_uri: "URL vers laquelle l'IdP redirige après le logout. Doit être enregistrée côté IdP (liste blanche).",
    state: "Valeur aléatoire retournée telle quelle avec la redirection — permet au client de restaurer son contexte.",
    client_id: "Keycloak et certains IdPs l'acceptent en alternative à id_token_hint pour identifier le client qui demande le logout.",
    ui_locales: "Langues préférées pour l'UI (pages de confirmation, erreurs).",
    logout_hint: "Keycloak : information affichée sur la page de logout (ex : email de l'utilisateur concerné).",
  };

  function randB64Url(byteLen) {
    const bytes = new Uint8Array(byteLen);
    crypto.getRandomValues(bytes);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function b64urlToJson(s) {
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    return JSON.parse(atob(s));
  }

  function decodeIdToken(token) {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return null;
      return {
        header: b64urlToJson(parts[0]),
        payload: b64urlToJson(parts[1]),
      };
    } catch (_) { return null; }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function inspectIdToken() {
    const el = $("id-token-info");
    const token = $("id-token-hint").value.trim();
    if (!token) { el.textContent = ""; el.className = "text-xs mt-1"; return; }
    const decoded = decodeIdToken(token);
    if (!decoded) {
      el.textContent = "✗ Format JWT invalide";
      el.className = "text-xs mt-1 text-red-700 font-medium";
      return;
    }
    const p = decoded.payload;
    const now = Math.floor(Date.now() / 1000);
    const bits = [];
    // Toutes les valeurs issues du payload sont échappées avant insertion HTML.
    if (p.sub) bits.push("sub=" + escapeHtml(String(p.sub)));
    if (p.iss) {
      try { bits.push("iss=" + escapeHtml(new URL(p.iss).host)); }
      catch (_) { bits.push("iss=" + escapeHtml(String(p.iss))); }
    }
    if (p.aud) {
      const audStr = Array.isArray(p.aud) ? p.aud.map(String).join(",") : String(p.aud);
      bits.push("aud=" + escapeHtml(audStr));
    }
    if (p.exp) {
      if (p.exp < now) {
        bits.push("EXPIRÉ il y a " + Math.round((now - p.exp) / 60) + " min");
      } else {
        bits.push("exp dans " + Math.round((p.exp - now) / 60) + " min");
      }
    }
    el.innerHTML = "✓ " + bits.join(" · ");
    el.className = "text-xs mt-1 " + (p.exp && p.exp < now ? "text-amber-700" : "text-emerald-700") + " font-medium";

    // Auto-remplir l'issuer si pas déjà renseigné → aide à deviner end_session_endpoint
    if (p.iss && !$("end-session").value) {
      // Heuristique Keycloak : iss = .../realms/<realm> → logout = .../realms/<realm>/protocol/openid-connect/logout
      const m = p.iss.match(/^(https?:\/\/[^/]+)(\/auth)?\/realms\/([^/]+)\/?$/);
      if (m) {
        $("end-session").value = m[1] + (m[2] || "") + "/realms/" + m[3] + "/protocol/openid-connect/logout";
      }
    }
    // Auto-remplir client_id depuis l'aud
    if (!$("client-id").value && p.aud) {
      $("client-id").value = Array.isArray(p.aud) ? p.aud[0] : p.aud;
    }
  }

  function buildUrl() {
    const endpoint = $("end-session").value.trim();
    if (!endpoint) { alert("end_session_endpoint obligatoire"); return; }
    let url;
    try { url = new URL(endpoint); }
    catch (_) { alert("URL d'endpoint invalide"); return; }

    const existing = new URLSearchParams(url.search);

    const fields = {
      id_token_hint: $("id-token-hint").value.trim(),
      post_logout_redirect_uri: $("post-redirect").value.trim(),
      state: $("state").value.trim(),
      client_id: $("client-id").value.trim(),
      ui_locales: $("ui-locales").value.trim(),
      logout_hint: $("logout-hint").value.trim(),
    };
    Object.entries(fields).forEach(([k, v]) => {
      if (v) existing.set(k, v);
    });

    url.search = existing.toString();
    $("final-url").textContent = url.toString();
    renderParams(existing);
    $("output").classList.remove("hidden");
  }

  function renderParams(params) {
    const table = $("params-table");
    table.innerHTML = "";
    const thead = document.createElement("thead");
    thead.innerHTML = "<tr><th>Paramètre</th><th>Valeur</th><th>Description</th></tr>";
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    const order = ["id_token_hint","post_logout_redirect_uri","state","client_id","ui_locales","logout_hint"];
    const entries = [];
    params.forEach((v, k) => entries.push([k, v]));
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
      tdK.className = "lo-param-key";
      tdK.textContent = k;
      const tdV = document.createElement("td");
      tdV.className = "lo-param-val";
      tdV.textContent = k === "id_token_hint" && v.length > 60
        ? v.slice(0, 30) + "…" + v.slice(-20)
        : v;
      const tdD = document.createElement("td");
      tdD.className = "lo-param-desc";
      tdD.textContent = PARAM_DESC[k] || "";
      tr.appendChild(tdK); tr.appendChild(tdV); tr.appendChild(tdD);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("state").value = randB64Url(16);

    $("build-btn").addEventListener("click", buildUrl);
    $("regen-state").addEventListener("click", () => { $("state").value = randB64Url(16); });
    $("id-token-hint").addEventListener("input", inspectIdToken);

    $("kc-apply").addEventListener("click", () => {
      const base = $("kc-base").value.trim().replace(/\/+$/, "");
      const realm = $("kc-realm").value.trim();
      if (!base || !realm) return;
      $("end-session").value = base + "/realms/" + realm + "/protocol/openid-connect/logout";
    });
    $("kc-realm").addEventListener("keydown", (e) => {
      if (e.key === "Enter") $("kc-apply").click();
    });

    $("example-btn").addEventListener("click", () => {
      $("kc-base").value = "https://login.example.com";
      $("kc-realm").value = "master";
      $("end-session").value = "https://login.example.com/realms/master/protocol/openid-connect/logout";
      $("post-redirect").value = "http://localhost:4200/";
      $("client-id").value = "my-angular-app";
      $("ui-locales").value = "fr-FR fr";
      $("logout-hint").value = "alice@example.com";
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
        filename: "oidc-logout.html",
        title: "OIDC Logout URL Builder",
      });
    });

    ToolExport.attachActions($("output"), () => {
      const url = $("final-url").textContent;
      if (!url) return null;
      return "URL de logout :\n" + url;
    });
  });
})();
