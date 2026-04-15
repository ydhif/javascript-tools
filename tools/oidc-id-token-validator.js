(function () {
  const $ = (id) => document.getElementById(id);

  // ========== utils ==========
  function b64urlToBytes(s) {
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    const bin = atob(s);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }
  function b64urlToJson(s) {
    return JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));
  }
  function bytesToB64Url(bytes) {
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function setStatus(msg, kind) {
    const el = $("status");
    el.textContent = msg;
    el.className = "text-sm " + (
      kind === "err" ? "text-red-700 font-medium" :
      kind === "ok"  ? "text-emerald-700 font-medium" :
                       "text-slate-600"
    );
  }

  // ========== checks collector ==========
  let checks = [];
  function addCheck(kind, name, desc) {
    checks.push({ kind, name, desc });
  }
  function resetChecks() { checks = []; }
  function renderChecks() {
    const box = $("checks");
    box.innerHTML = "";
    checks.forEach((c) => {
      const icons = { ok: "✓", fail: "✗", warn: "!", skip: "—" };
      const div = document.createElement("div");
      div.className = "iv-check iv-" + c.kind;
      div.innerHTML =
        '<span class="iv-icon">' + icons[c.kind] + "</span>" +
        "<div>" +
          '<div class="iv-name">' + escapeHtml(c.name) + "</div>" +
          (c.desc ? '<div class="iv-desc">' + c.desc + "</div>" : "") +
        "</div>";
      box.appendChild(div);
    });
    // summary
    const counts = { ok: 0, fail: 0, warn: 0, skip: 0 };
    checks.forEach((c) => counts[c.kind]++);
    const sum = $("summary");
    sum.innerHTML =
      '<span class="iv-summary-pill iv-ok">' + counts.ok + " OK</span>" +
      (counts.fail ? '<span class="iv-summary-pill iv-fail">' + counts.fail + " ÉCHEC</span>" : "") +
      (counts.warn ? '<span class="iv-summary-pill iv-warn">' + counts.warn + " WARN</span>" : "") +
      (counts.skip ? '<span class="iv-summary-pill iv-skip">' + counts.skip + " IGNORÉ</span>" : "");
  }

  // ========== JWKS / crypto ==========
  // Issuers déjà acceptés dans la session (mémoïsation du consentement par origin).
  const VERIFY_CONSENT = {};

  async function fetchJwks(issuer) {
    if (!/^https:\/\//i.test(issuer)) throw new Error("issuer non HTTPS");
    let origin;
    try { origin = new URL(issuer).origin; }
    catch (_) { throw new Error("issuer invalide : " + issuer); }

    if (!VERIFY_CONSENT[origin]) {
      const ok = window.confirm(
        "Vérification de signature — confirmation requise\n\n" +
        "Pour fetcher le JWKS, le navigateur va contacter l'issuer :\n" +
        origin + "\n\n" +
        "⚠ Ce serveur verra votre IP et saura que vous validez un token qui le concerne.\n" +
        "Un serveur malveillant peut aussi servir un JWKS falsifié pour faire passer\n" +
        "une signature pour valide.\n\n" +
        "Continuer ?"
      );
      if (!ok) throw new Error("Fetch JWKS annulé par l'utilisateur");
      VERIFY_CONSENT[origin] = true;
    }

    const cfgUrl = issuer.replace(/\/+$/, "") + "/.well-known/openid-configuration";
    const cfgRes = await fetch(cfgUrl);
    if (!cfgRes.ok) throw new Error("Config OIDC HTTP " + cfgRes.status);
    const cfg = await cfgRes.json();
    if (!cfg.jwks_uri) throw new Error("jwks_uri absent");
    const jwksRes = await fetch(cfg.jwks_uri);
    if (!jwksRes.ok) throw new Error("JWKS HTTP " + jwksRes.status);
    return await jwksRes.json();
  }

  function algoParams(alg) {
    const len = alg.slice(2);
    if (alg.startsWith("HS")) return { name: "HMAC" };
    if (alg.startsWith("RS")) return { name: "RSASSA-PKCS1-v1_5" };
    if (alg.startsWith("PS")) return { name: "RSA-PSS", saltLength: parseInt(len, 10) / 8 };
    if (alg.startsWith("ES")) return { name: "ECDSA", hash: "SHA-" + len };
    throw new Error("Algo non supporté : " + alg);
  }
  async function importJwk(jwk, alg) {
    let params;
    if (alg.startsWith("RS")) params = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-" + alg.slice(2) };
    else if (alg.startsWith("PS")) params = { name: "RSA-PSS", hash: "SHA-" + alg.slice(2) };
    else if (alg.startsWith("ES")) params = { name: "ECDSA", namedCurve: jwk.crv || "P-256" };
    else throw new Error("Algo non supporté : " + alg);
    return crypto.subtle.importKey("jwk", jwk, params, false, ["verify"]);
  }

  // OIDC Core 1.0 §3.1.3.6 : l'algo de hash de at_hash/c_hash est celui de `alg`
  // du header de l'id_token (RS256/PS256/ES256/HS256 → SHA-256, 384 → SHA-384, 512 → SHA-512).
  // Le résultat est la demi-moitié gauche encodée en base64url.
  async function computeHash(input, alg) {
    const len = (alg || "").slice(2);
    let hashName;
    if (len === "256") hashName = "SHA-256";
    else if (len === "384") hashName = "SHA-384";
    else if (len === "512") hashName = "SHA-512";
    else hashName = "SHA-256"; // fallback sûr
    const bytes = new TextEncoder().encode(input);
    const buf = await crypto.subtle.digest(hashName, bytes);
    const hash = new Uint8Array(buf);
    return bytesToB64Url(hash.slice(0, hash.length / 2));
  }

  // ========== validation principale ==========
  async function validate() {
    resetChecks();
    $("results").classList.add("hidden");
    setStatus("… validation en cours", "");

    const raw = $("token-input").value.trim();
    if (!raw) { setStatus("✗ Token manquant", "err"); return; }

    let header, payload, parts;
    try {
      parts = raw.split(".");
      if (parts.length !== 3) throw new Error("Format JWT invalide");
      header = b64urlToJson(parts[0]);
      payload = b64urlToJson(parts[1]);
    } catch (e) {
      setStatus("✗ Parse : " + e.message, "err");
      return;
    }

    $("header-out").textContent = JSON.stringify(header, null, 2);
    $("payload-out").textContent = JSON.stringify(payload, null, 2);
    $("results").classList.remove("hidden");

    // ---- Claim sanity ----
    ["iss", "aud", "exp", "iat", "sub"].forEach((c) => {
      if (payload[c] == null) {
        addCheck("fail", "Claim obligatoire manquant : " + c,
          "La spec OIDC §2 requiert <code>iss, sub, aud, exp, iat</code>.");
      } else {
        addCheck("ok", "Claim présent : " + c);
      }
    });

    // ---- iss ----
    const expIssuer = $("exp-issuer").value.trim();
    if (expIssuer) {
      if (payload.iss === expIssuer) {
        addCheck("ok", "`iss` correspond à l'issuer attendu", "<code>" + escapeHtml(payload.iss || "") + "</code>");
      } else {
        addCheck("fail", "`iss` ne correspond pas",
          "Attendu : <code>" + escapeHtml(expIssuer) + "</code><br>Trouvé : <code>" + escapeHtml(payload.iss || "") + "</code>");
      }
    } else {
      addCheck("skip", "`iss` non vérifié (issuer attendu non fourni)");
    }

    // ---- aud ----
    const expClientId = $("exp-client-id").value.trim();
    if (expClientId) {
      const aud = Array.isArray(payload.aud) ? payload.aud : (payload.aud != null ? [payload.aud] : []);
      if (aud.includes(expClientId)) {
        addCheck("ok", "`aud` contient le client_id",
          "<code>aud = " + escapeHtml(JSON.stringify(payload.aud)) + "</code>");
      } else {
        addCheck("fail", "`aud` ne contient pas le client_id",
          "Attendu dans : <code>" + escapeHtml(expClientId) + "</code><br>" +
          "Trouvé : <code>" + escapeHtml(JSON.stringify(payload.aud)) + "</code>");
      }
      // ---- azp ----
      if (Array.isArray(payload.aud) && payload.aud.length > 1) {
        if (!payload.azp) {
          addCheck("fail", "`azp` manquant alors que `aud` est un tableau multi-valeurs",
            "OIDC §3.1.3.7 §4 : <code>azp</code> doit être présent si <code>aud</code> contient plusieurs audiences.");
        } else if (payload.azp !== expClientId) {
          addCheck("fail", "`azp` ne correspond pas au client_id",
            "Trouvé : <code>" + escapeHtml(payload.azp) + "</code>");
        } else {
          addCheck("ok", "`azp` correspond au client_id");
        }
      } else if (payload.azp) {
        if (payload.azp === expClientId) {
          addCheck("ok", "`azp` présent et correspond au client_id");
        } else {
          addCheck("warn", "`azp` présent mais ne correspond pas au client_id",
            "<code>azp = " + escapeHtml(payload.azp) + "</code>");
        }
      }
    } else {
      addCheck("skip", "`aud`/`azp` non vérifiés (client_id attendu non fourni)");
    }

    // ---- exp / iat / nbf ----
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === "number") {
      if (payload.exp > now) {
        addCheck("ok", "`exp` valide",
          "expire dans " + Math.round((payload.exp - now) / 60) + " min (" +
          new Date(payload.exp * 1000).toISOString() + ")");
      } else {
        addCheck("fail", "Token expiré",
          "<code>exp</code> = " + new Date(payload.exp * 1000).toISOString() +
          " (il y a " + Math.round((now - payload.exp) / 60) + " min)");
      }
    }
    if (typeof payload.iat === "number") {
      const ageSec = now - payload.iat;
      if (ageSec < -60) {
        addCheck("warn", "`iat` dans le futur",
          "<code>iat</code> = " + new Date(payload.iat * 1000).toISOString());
      } else if (ageSec > 86400) {
        addCheck("warn", "`iat` ancien (> 24h)",
          "Émis il y a " + Math.round(ageSec / 3600) + " h");
      } else {
        addCheck("ok", "`iat` raisonnable",
          "émis il y a " + Math.round(ageSec / 60) + " min");
      }
    }
    if (typeof payload.nbf === "number" && payload.nbf > now) {
      addCheck("fail", "Token pas encore valide",
        "<code>nbf</code> = " + new Date(payload.nbf * 1000).toISOString());
    }

    // ---- nonce ----
    const expNonce = $("exp-nonce").value.trim();
    if (expNonce) {
      if (payload.nonce === expNonce) {
        addCheck("ok", "`nonce` correspond à la valeur attendue");
      } else {
        addCheck("fail", "`nonce` ne correspond pas",
          "Attendu : <code>" + escapeHtml(expNonce) + "</code><br>Trouvé : <code>" + escapeHtml(payload.nonce || "(absent)") + "</code>");
      }
    } else if (payload.nonce) {
      addCheck("skip", "`nonce` présent dans le token mais aucune valeur attendue fournie");
    }

    // ---- max_age / auth_time ----
    const expMaxAge = parseInt($("exp-max-age").value, 10);
    if (!isNaN(expMaxAge)) {
      if (typeof payload.auth_time !== "number") {
        addCheck("fail", "`auth_time` manquant alors que `max_age` est fourni",
          "OIDC §3.1.2.1 : quand <code>max_age</code> est envoyé, <code>auth_time</code> est obligatoire dans l'id_token.");
      } else {
        const elapsed = now - payload.auth_time;
        if (elapsed > expMaxAge) {
          addCheck("fail", "Authentification trop ancienne",
            "Dernière auth il y a " + elapsed + " s, max_age = " + expMaxAge + " s");
        } else {
          addCheck("ok", "`auth_time` dans la fenêtre `max_age`",
            "authentifié il y a " + elapsed + " s");
        }
      }
    }

    // ---- at_hash ----
    const accessToken = $("exp-at").value.trim();
    if (accessToken && payload.at_hash) {
      const expected = await computeHash(accessToken, header.alg);
      if (expected === payload.at_hash) {
        addCheck("ok", "`at_hash` correspond à l'access_token fourni",
          "hash SHA-256 half = <code>" + escapeHtml(expected) + "</code>");
      } else {
        addCheck("fail", "`at_hash` ne correspond pas",
          "Attendu : <code>" + escapeHtml(expected) + "</code><br>Trouvé : <code>" + escapeHtml(payload.at_hash) + "</code>");
      }
    } else if (accessToken && !payload.at_hash) {
      addCheck("warn", "access_token fourni mais pas de `at_hash` dans le token",
        "Normal en flow pur <code>code</code>. Obligatoire en flow <code>code id_token token</code> ou <code>id_token token</code>.");
    } else if (!accessToken && payload.at_hash) {
      addCheck("skip", "`at_hash` présent mais aucun access_token fourni pour vérification");
    }

    // ---- c_hash ----
    const code = $("exp-code").value.trim();
    if (code && payload.c_hash) {
      const expected = await computeHash(code, header.alg);
      if (expected === payload.c_hash) {
        addCheck("ok", "`c_hash` correspond au code fourni",
          "hash SHA-256 half = <code>" + escapeHtml(expected) + "</code>");
      } else {
        addCheck("fail", "`c_hash` ne correspond pas",
          "Attendu : <code>" + escapeHtml(expected) + "</code><br>Trouvé : <code>" + escapeHtml(payload.c_hash) + "</code>");
      }
    } else if (code && !payload.c_hash) {
      addCheck("warn", "code fourni mais pas de `c_hash` dans le token",
        "`c_hash` est obligatoire uniquement en hybrid flow (<code>code id_token</code>).");
    } else if (!code && payload.c_hash) {
      addCheck("skip", "`c_hash` présent mais aucun code fourni pour vérification");
    }

    // ---- alg ----
    const alg = header.alg;
    if (!alg || alg.toLowerCase() === "none") {
      addCheck("fail", "alg=none refusé",
        "Un id_token sans signature ne doit jamais être accepté.");
      renderChecks();
      setStatus("✗ Token non sécurisé", "err");
      return;
    }
    if (/^HS/.test(alg)) {
      addCheck("warn", "algo HMAC (" + alg + ") détecté",
        "Les algos symétriques nécessitent de partager le <code>client_secret</code> et ne sont pas recommandés pour les clients publics.");
    }

    // ---- signature ----
    let jwks = null;
    const jwksManual = $("jwks-input").value.trim();
    if (jwksManual) {
      try { jwks = JSON.parse(jwksManual); }
      catch (e) { addCheck("fail", "JWKS manuel invalide", escapeHtml(e.message)); }
    } else if (payload.iss) {
      try {
        jwks = await fetchJwks(payload.iss);
        addCheck("ok", "JWKS récupéré depuis l'issuer",
          "via <code>" + escapeHtml(payload.iss) + "/.well-known/openid-configuration</code>");
      } catch (e) {
        addCheck("fail", "Impossible de récupérer le JWKS",
          escapeHtml(e.message) + " — colle-le manuellement si CORS bloque.");
      }
    }

    if (jwks && jwks.keys && !/^HS/.test(alg)) {
      const kid = header.kid;
      const key = kid ? jwks.keys.find((k) => k.kid === kid)
                      : jwks.keys.find((k) => k.use === "sig" || !k.use) || jwks.keys[0];
      if (!key) {
        addCheck("fail", "Clé introuvable dans le JWKS",
          kid ? "Aucune clé avec kid=<code>" + escapeHtml(kid) + "</code>" : "JWKS vide");
      } else {
        try {
          const cryptoKey = await importJwk(key, alg);
          const sigBytes = b64urlToBytes(parts[2]);
          const data = new TextEncoder().encode(parts[0] + "." + parts[1]);
          const ok = await crypto.subtle.verify(algoParams(alg), cryptoKey, sigBytes, data);
          if (ok) {
            addCheck("ok", "Signature `" + alg + "` valide",
              kid ? "kid = <code>" + escapeHtml(kid) + "</code>" : "");
          } else {
            addCheck("fail", "Signature invalide",
              "La signature ne correspond pas à la clé du JWKS.");
          }
        } catch (e) {
          addCheck("fail", "Erreur de vérification de signature", escapeHtml(e.message));
        }
      }
    } else if (/^HS/.test(alg)) {
      addCheck("skip", "Signature HS* non vérifiée",
        "Les algos HMAC nécessitent le <code>client_secret</code> (non demandé ici). Utilise JWT Inspector pour vérifier.");
    }

    renderChecks();
    const hasFail = checks.some((c) => c.kind === "fail");
    setStatus(hasFail ? "✗ Validation échouée" : "✓ Validation réussie", hasFail ? "err" : "ok");
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("validate-btn").addEventListener("click", validate);

    $("kc-apply").addEventListener("click", () => {
      const base = $("kc-base").value.trim().replace(/\/+$/, "");
      const realm = $("kc-realm").value.trim();
      if (!base || !realm) return;
      $("exp-issuer").value = base + "/realms/" + realm;
    });
    $("kc-realm").addEventListener("keydown", (e) => {
      if (e.key === "Enter") $("kc-apply").click();
    });

    $("example-btn").addEventListener("click", () => {
      // Exemple RS256 public (jwt.io) - pas un vrai id_token OIDC mais montre le flux de validation
      $("token-input").value =
        "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9." +
        "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiYWRtaW4iOnRydWUsImlhdCI6MTUxNjIzOTAyMn0." +
        "POstGetfAytaZS82wHcjoTyoqhMyxXiWdR7Nn7A29DNSl0EiXLdwJ6xC6AfgZWF1bOsS_TuYI3OG85AmiExREkrS6tDfTQ2B3WXlrr-wp5AokiRbz3_oB4OxG-W9KcEEbDRcZc0nH3L7LzYptiy1PtAylQGxHTWZXtGz4ht0bAecBgmpc-UTNw37zGuRJ6L0POK4dlh7L8aX6UEwrWv-ZoRp6A0PTDdK0JGM8d30SUABxHxGDtmKXrvmr4kSRkR7kEZM7wJg3qQdmE5bDQQjaZT0Q8mTVHG8mrphrlP_0kGtHqrXpuqABs3xdHTvqu9aM3g";
      // JWK publique correspondante
      $("jwks-input").value = JSON.stringify({
        keys: [{
          kty: "RSA",
          n: "nzyis1ZjfNB0bBgKFMSvvkTtwlvBsaJq7S5wA-kzeVOVpVWwkWdVha4s38XM_pa_yr47av7-z3VTmvDRyAHcaT92whREFpLv9cj5lTeJSibyr_Mrm_YtjCZVWgaOYIhwrXwKLqPr_11inWsAkfIytvHWTxZYEcXLgAXFuUuaS3uF9gEiNQwzGTU1v0FqkqTBr4B8nW3HCN47XUu0t8Y0e-lf4s4OxQawWD79J9_5d3Ry0vbV3Am1FtGJiJvOwRsIfVChDpYStTcHTCMqtvWbV6L11BWkpzGXSW4Hv43qa-GSYOD2QU68Mb59oSk2OB-BtOLpJofmbGEGgvmwyCI9Mw",
          e: "AQAB",
          alg: "RS256",
          use: "sig"
        }]
      }, null, 2);
      // On force une validation de signature uniquement (l'exemple n'a pas de vrais claims OIDC)
      $("exp-issuer").value = "";
      $("exp-client-id").value = "";
      validate();
    });

    $("download-html").addEventListener("click", () => {
      ToolExport.downloadStandalone({
        filename: "oidc-id-token-validator.html",
        title: "OIDC ID Token Validator",
        inlineScripts: ["./oidc-id-token-validator.js"],
      });
    });

    ToolExport.attachActions($("results"), () => {
      if (!checks.length) return null;
      return checks.map((c) =>
        "[" + c.kind.toUpperCase() + "] " + c.name + (c.desc ? "\n    " + c.desc.replace(/<[^>]+>/g, "") : "")
      ).join("\n");
    });
  });
})();
