(function () {
  const $ = (id) => document.getElementById(id);
  let parsed = null; // { header, payload, parts, signingInput, sigBytes }

  const STANDARD_CLAIMS = {
    iss: "Issuer",
    sub: "Subject",
    aud: "Audience",
    exp: "Expiration",
    nbf: "Not before",
    iat: "Issued at",
    jti: "JWT ID",
    scope: "Scope",
    scp: "Scope",
    azp: "Authorized party",
    typ: "Type",
    kid: "Key ID",
  };

  function b64urlToBytes(s) {
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    s += "=".repeat((4 - s.length % 4) % 4);
    const bin = atob(s);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  function b64urlToJson(s) {
    const bytes = b64urlToBytes(s);
    const text = new TextDecoder().decode(bytes);
    return JSON.parse(text);
  }

  function renderColoredToken(raw) {
    const parts = raw.trim().split(".");
    if (parts.length !== 3) return;
    const el = $("token-colored");
    el.innerHTML =
      '<span class="jwt-header">' + parts[0] + '</span>' +
      '<span class="text-slate-400">.</span>' +
      '<span class="jwt-payload">' + parts[1] + '</span>' +
      '<span class="text-slate-400">.</span>' +
      '<span class="jwt-sig">' + parts[2] + '</span>';
    el.classList.remove("hidden");
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function renderClaims(payload) {
    // rows est désormais { key: string, valueHtml: string (safe HTML) }
    // Toute donnée issue du payload est échappée avant injection.
    const rows = [];
    const now = Math.floor(Date.now() / 1000);
    const alerts = [];
    const tsKeys = ["exp", "nbf", "iat"];
    Object.keys(payload).forEach((k) => {
      const v = payload[k];
      const labelKey = escapeHtml(k + (STANDARD_CLAIMS[k] ? " (" + STANDARD_CLAIMS[k] + ")" : ""));
      if (tsKeys.includes(k) && typeof v === "number") {
        const date = new Date(v * 1000).toLocaleString();
        let extra = "";
        if (k === "exp") {
          if (v < now) { extra = " — <b class='text-red-700'>expiré</b>"; alerts.push({ kind: "err", msg: "Token expiré : exp = " + date }); }
          else extra = " — expire dans " + Math.round((v - now) / 60) + " min";
        }
        if (k === "nbf" && v > now) {
          extra = " — <b class='text-amber-700'>pas encore valide</b>";
          alerts.push({ kind: "warn", msg: "Token pas encore valide : nbf = " + date });
        }
        rows.push({ key: labelKey, valueHtml: escapeHtml(date) + extra });
      } else if (STANDARD_CLAIMS[k]) {
        const raw = Array.isArray(v) ? v.join(", ") : String(v);
        rows.push({ key: labelKey, valueHtml: escapeHtml(raw) });
      }
    });

    const box = $("claims-info");
    box.innerHTML = "";
    if (rows.length) {
      const t = document.createElement("table");
      t.className = "kv-table";
      rows.forEach(({ key, valueHtml }) => {
        const tr = document.createElement("tr");
        const tdK = document.createElement("td");
        const tdV = document.createElement("td");
        tdK.innerHTML = key;      // déjà échappé
        tdV.innerHTML = valueHtml; // valeur échappée + éventuel <b> de statut
        tr.appendChild(tdK);
        tr.appendChild(tdV);
        t.appendChild(tr);
      });
      box.appendChild(t);
    }
    return alerts;
  }

  function renderAlerts(list) {
    const box = $("alerts");
    box.innerHTML = "";
    list.forEach((a) => {
      const div = document.createElement("div");
      div.className = "alert " + (a.kind === "err" ? "alert-error" : a.kind === "warn" ? "alert-warn" : "alert-info");
      div.textContent = a.msg;
      box.appendChild(div);
    });
  }

  function decode() {
    const raw = $("token-input").value.trim();
    const status = $("decode-status");
    if (!raw) return;
    try {
      const parts = raw.split(".");
      if (parts.length !== 3) throw new Error("Format JWT invalide (attendu : 3 segments séparés par '.')");
      const header = b64urlToJson(parts[0]);
      const payload = b64urlToJson(parts[1]);
      const sigBytes = b64urlToBytes(parts[2]);
      const signingInput = parts[0] + "." + parts[1];
      parsed = { header, payload, parts, signingInput, sigBytes };

      renderColoredToken(raw);
      $("header-json").textContent = JSON.stringify(header, null, 2);
      $("payload-json").textContent = JSON.stringify(payload, null, 2);
      $("decoded-section").classList.remove("hidden");
      $("verify-section").classList.remove("hidden");

      const alerts = [];
      if (!header.alg || header.alg.toLowerCase() === "none") {
        alerts.push({ kind: "err", msg: "⚠ alg=none : ce token n'est pas signé, ne jamais l'accepter en production." });
      }
      if (header.alg && /^HS/.test(header.alg)) {
        $("verify-hs").classList.remove("hidden");
        $("verify-asym").classList.add("hidden");
      } else {
        $("verify-hs").classList.add("hidden");
        $("verify-asym").classList.remove("hidden");
      }

      alerts.push(...renderClaims(payload));
      renderAlerts(alerts);

      status.textContent = "✓ Décodé (alg=" + (header.alg || "?") + ")";
      status.className = "text-sm text-emerald-700 font-medium";
    } catch (e) {
      status.textContent = "✗ " + e.message;
      status.className = "text-sm text-red-700 font-medium";
    }
  }

  function pemToBytes(pem) {
    const b64 = pem.replace(/-----(BEGIN|END)[^-]+-----/g, "").replace(/\s+/g, "");
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  async function importKeyForVerify(alg, keyText) {
    const isJwk = keyText.trim().startsWith("{");
    if (alg.startsWith("HS")) {
      const len = alg.slice(2);
      return crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(keyText),
        { name: "HMAC", hash: "SHA-" + len },
        false, ["verify"]
      );
    }
    if (alg.startsWith("RS") || alg.startsWith("PS")) {
      const len = alg.slice(2);
      const algoName = alg.startsWith("PS") ? "RSA-PSS" : "RSASSA-PKCS1-v1_5";
      if (isJwk) {
        return crypto.subtle.importKey(
          "jwk", JSON.parse(keyText),
          { name: algoName, hash: "SHA-" + len },
          false, ["verify"]
        );
      }
      return crypto.subtle.importKey(
        "spki", pemToBytes(keyText),
        { name: algoName, hash: "SHA-" + len },
        false, ["verify"]
      );
    }
    if (alg.startsWith("ES")) {
      const len = alg.slice(2);
      const curve = len === "256" ? "P-256" : len === "384" ? "P-384" : "P-521";
      if (isJwk) {
        return crypto.subtle.importKey(
          "jwk", JSON.parse(keyText),
          { name: "ECDSA", namedCurve: curve },
          false, ["verify"]
        );
      }
      return crypto.subtle.importKey(
        "spki", pemToBytes(keyText),
        { name: "ECDSA", namedCurve: curve },
        false, ["verify"]
      );
    }
    throw new Error("Algo non supporté : " + alg);
  }

  function algoParams(alg) {
    const len = alg.slice(2);
    if (alg.startsWith("HS")) return { name: "HMAC" };
    if (alg.startsWith("RS")) return { name: "RSASSA-PKCS1-v1_5" };
    if (alg.startsWith("PS")) return { name: "RSA-PSS", saltLength: parseInt(len, 10) / 8 };
    if (alg.startsWith("ES")) return { name: "ECDSA", hash: "SHA-" + len };
    throw new Error("Algo non supporté");
  }

  async function verify() {
    const status = $("verify-status");
    if (!parsed) { status.textContent = "Décode un token d'abord."; return; }
    const alg = parsed.header.alg;
    if (!alg || alg.toLowerCase() === "none") {
      status.textContent = "✗ alg=none ne peut pas être vérifié.";
      status.className = "text-sm text-red-700 font-medium";
      return;
    }
    try {
      const keyText = alg.startsWith("HS") ? $("hs-secret").value : $("asym-key").value;
      if (!keyText.trim()) { status.textContent = "✗ Clé / secret manquant."; return; }

      const key = await importKeyForVerify(alg, keyText);
      const data = new TextEncoder().encode(parsed.signingInput);
      const ok = await crypto.subtle.verify(algoParams(alg), key, parsed.sigBytes, data);

      if (ok) {
        status.textContent = "✓ Signature valide";
        status.className = "text-sm text-emerald-700 font-bold";
      } else {
        status.textContent = "✗ Signature invalide";
        status.className = "text-sm text-red-700 font-bold";
      }
    } catch (e) {
      status.textContent = "✗ " + e.message;
      status.className = "text-sm text-red-700 font-medium";
    }
  }

  // Exemple HS256 : header {alg:HS256,typ:JWT} payload {sub:1234567890,name:"John Doe",iat:1516239022} secret "your-256-bit-secret"
  const EXAMPLE_HS =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
    "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ." +
    "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

  // ====================== Signing ======================

  function bytesToB64Url(bytes) {
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function strToB64Url(s) {
    const bytes = new TextEncoder().encode(s);
    return bytesToB64Url(bytes);
  }
  function bytesToPem(bytes, label) {
    let b64 = "";
    for (let i = 0; i < bytes.length; i++) b64 += String.fromCharCode(bytes[i]);
    b64 = btoa(b64);
    const lines = b64.match(/.{1,64}/g) || [b64];
    return "-----BEGIN " + label + "-----\n" + lines.join("\n") + "\n-----END " + label + "-----";
  }

  async function importSignKey(alg, keyText) {
    const txt = keyText.trim();
    const isJwk = txt.startsWith("{");
    if (alg.startsWith("HS")) {
      const len = alg.slice(2);
      return crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(txt),
        { name: "HMAC", hash: "SHA-" + len },
        false, ["sign"]
      );
    }
    if (alg.startsWith("RS") || alg.startsWith("PS")) {
      const len = alg.slice(2);
      const algoName = alg.startsWith("PS") ? "RSA-PSS" : "RSASSA-PKCS1-v1_5";
      if (isJwk) {
        return crypto.subtle.importKey(
          "jwk", JSON.parse(txt),
          { name: algoName, hash: "SHA-" + len },
          false, ["sign"]
        );
      }
      return crypto.subtle.importKey(
        "pkcs8", pemToBytes(txt),
        { name: algoName, hash: "SHA-" + len },
        false, ["sign"]
      );
    }
    if (alg.startsWith("ES")) {
      const len = alg.slice(2);
      const curve = len === "256" ? "P-256" : len === "384" ? "P-384" : "P-521";
      if (isJwk) {
        return crypto.subtle.importKey(
          "jwk", JSON.parse(txt),
          { name: "ECDSA", namedCurve: curve },
          false, ["sign"]
        );
      }
      return crypto.subtle.importKey(
        "pkcs8", pemToBytes(txt),
        { name: "ECDSA", namedCurve: curve },
        false, ["sign"]
      );
    }
    throw new Error("Algo non supporté pour la signature : " + alg);
  }

  function signAlgoParams(alg) {
    const len = alg.slice(2);
    if (alg.startsWith("HS")) return { name: "HMAC" };
    if (alg.startsWith("RS")) return { name: "RSASSA-PKCS1-v1_5" };
    if (alg.startsWith("PS")) return { name: "RSA-PSS", saltLength: parseInt(len, 10) / 8 };
    if (alg.startsWith("ES")) return { name: "ECDSA", hash: "SHA-" + len };
    throw new Error("Algo non supporté");
  }

  async function signJwt() {
    const status = $("sign-status");
    try {
      const header = JSON.parse($("gen-header").value);
      const payload = JSON.parse($("gen-payload").value);
      const alg = header.alg;
      if (!alg || alg.toLowerCase() === "none") throw new Error("alg manquant ou 'none'");
      const keyText = $("gen-key").value;
      if (!keyText.trim()) throw new Error("Clé / secret manquant");

      const key = await importSignKey(alg, keyText);
      const signingInput = strToB64Url(JSON.stringify(header)) + "." + strToB64Url(JSON.stringify(payload));
      const sigBuf = await crypto.subtle.sign(
        signAlgoParams(alg), key, new TextEncoder().encode(signingInput)
      );
      const sig = bytesToB64Url(new Uint8Array(sigBuf));
      const token = signingInput + "." + sig;
      $("gen-out").textContent = token;
      $("gen-out-wrap").classList.remove("hidden");
      status.textContent = "✓ Signé (alg=" + alg + ")";
      status.className = "text-sm text-emerald-700 font-medium";
    } catch (e) {
      status.textContent = "✗ " + e.message;
      status.className = "text-sm text-red-700 font-medium";
    }
  }

  async function generateKey() {
    const status = $("sign-status");
    try {
      let header;
      try { header = JSON.parse($("gen-header").value); }
      catch (_) { header = { alg: "HS256", typ: "JWT" }; }
      const alg = header.alg || "HS256";

      if (alg.startsWith("HS")) {
        // Secret aléatoire de la taille du digest (256/384/512 bits)
        const bits = parseInt(alg.slice(2), 10);
        const bytes = new Uint8Array(bits / 8);
        crypto.getRandomValues(bytes);
        $("gen-key").value = bytesToB64Url(bytes);
        status.textContent = "✓ Secret aléatoire généré (" + (bits / 8) + " octets, base64url)";
        status.className = "text-sm text-emerald-700 font-medium";
        return;
      }

      if (alg.startsWith("RS") || alg.startsWith("PS")) {
        const len = alg.slice(2);
        const algoName = alg.startsWith("PS") ? "RSA-PSS" : "RSASSA-PKCS1-v1_5";
        const pair = await crypto.subtle.generateKey(
          { name: algoName, modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: "SHA-" + len },
          true, ["sign", "verify"]
        );
        const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
        const spki  = new Uint8Array(await crypto.subtle.exportKey("spki",  pair.publicKey));
        $("gen-key").value = bytesToPem(pkcs8, "PRIVATE KEY");
        // Remplit automatiquement la clé publique dans la section de vérification
        if ($("asym-key")) $("asym-key").value = bytesToPem(spki, "PUBLIC KEY");
        status.textContent = "✓ Paire RSA 2048 générée (privée ici, publique dans Vérification)";
        status.className = "text-sm text-emerald-700 font-medium";
        return;
      }

      if (alg.startsWith("ES")) {
        const len = alg.slice(2);
        const curve = len === "256" ? "P-256" : len === "384" ? "P-384" : "P-521";
        const pair = await crypto.subtle.generateKey(
          { name: "ECDSA", namedCurve: curve }, true, ["sign", "verify"]
        );
        const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
        const spki  = new Uint8Array(await crypto.subtle.exportKey("spki",  pair.publicKey));
        $("gen-key").value = bytesToPem(pkcs8, "PRIVATE KEY");
        if ($("asym-key")) $("asym-key").value = bytesToPem(spki, "PUBLIC KEY");
        status.textContent = "✓ Paire EC " + curve + " générée";
        status.className = "text-sm text-emerald-700 font-medium";
        return;
      }

      throw new Error("Algo non supporté : " + alg);
    } catch (e) {
      status.textContent = "✗ " + e.message;
      status.className = "text-sm text-red-700 font-medium";
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("decode-btn").addEventListener("click", decode);
    $("verify-btn").addEventListener("click", verify);
    $("example-btn").addEventListener("click", () => {
      $("token-input").value = EXAMPLE_HS;
      $("hs-secret").value = "your-256-bit-secret";
      decode();
    });
    $("example-rs-btn").addEventListener("click", () => {
      // Exemple RS256 public (clé de démo jwt.io, vérifie correctement).
      $("token-input").value =
        "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9." +
        "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiYWRtaW4iOnRydWUsImlhdCI6MTUxNjIzOTAyMn0." +
        "POstGetfAytaZS82wHcjoTyoqhMyxXiWdR7Nn7A29DNSl0EiXLdwJ6xC6AfgZWF1bOsS_TuYI3OG85AmiExREkrS6tDfTQ2B3WXlrr-wp5AokiRbz3_oB4OxG-W9KcEEbDRcZc0nH3L7LzYptiy1PtAylQGxHTWZXtGz4ht0bAecBgmpc-UTNw37zGuRJ6L0POK4dlh7L8aX6UEwrWv-ZoRp6A0PTDdK0JGM8d30SUABxHxGDtmKXrvmr4kSRkR7kEZM7wJg3qQdmE5bDQQjaZT0Q8mTVHG8mrphrlP_0kGtHqrXpuqABs3xdHTvqu9aM3g";
      $("asym-key").value =
        "-----BEGIN PUBLIC KEY-----\n" +
        "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAnzyis1ZjfNB0bBgKFMSv\n" +
        "vkTtwlvBsaJq7S5wA+kzeVOVpVWwkWdVha4s38XM/pa/yr47av7+z3VTmvDRyAHc\n" +
        "aT92whREFpLv9cj5lTeJSibyr/Mrm/YtjCZVWgaOYIhwrXwKLqPr/11inWsAkfIy\n" +
        "tvHWTxZYEcXLgAXFuUuaS3uF9gEiNQwzGTU1v0FqkqTBr4B8nW3HCN47XUu0t8Y0\n" +
        "e+lf4s4OxQawWD79J9/5d3Ry0vbV3Am1FtGJiJvOwRsIfVChDpYStTcHTCMqtvWb\n" +
        "V6L11BWkpzGXSW4Hv43qa+GSYOD2QU68Mb59oSk2OB+BtOLpJofmbGEGgvmwyCI9\n" +
        "MwIDAQAB\n" +
        "-----END PUBLIC KEY-----";
      decode();
    });

    // ====================== Sign wiring ======================
    $("sign-btn").addEventListener("click", signJwt);
    $("genkey-btn").addEventListener("click", generateKey);
    $("gen-example-btn").addEventListener("click", () => {
      $("gen-header").value = JSON.stringify({ alg: "HS256", typ: "JWT" }, null, 2);
      $("gen-payload").value = JSON.stringify({
        sub: "1234567890",
        name: "John Doe",
        iat: 1516239022
      }, null, 2);
      $("gen-key").value = "your-256-bit-secret";
      signJwt();
    });
    $("gen-client-assertion-btn").addEventListener("click", () => {
      // Exemple de client_assertion pour `private_key_jwt` (OIDC / RFC 7523)
      const now = Math.floor(Date.now() / 1000);
      $("gen-header").value = JSON.stringify({ alg: "RS256", typ: "JWT", kid: "my-signing-key-1" }, null, 2);
      $("gen-payload").value = JSON.stringify({
        iss: "my-client-id",
        sub: "my-client-id",
        aud: "https://idp.example.com/oauth2/token",
        jti: crypto.randomUUID ? crypto.randomUUID() : String(now),
        iat: now,
        exp: now + 300
      }, null, 2);
      $("sign-status").textContent = "⚠ Colle une clé privée RS256 (ou clique 'Générer une clé').";
      $("sign-status").className = "text-sm text-amber-700";
    });
    $("use-as-token").addEventListener("click", () => {
      const token = $("gen-out").textContent;
      if (!token) return;
      $("token-input").value = token;
      decode();
      $("token-input").scrollIntoView({ behavior: "smooth", block: "center" });
    });

    $("download-html").addEventListener("click", () => {
      ToolExport.downloadStandalone({
        filename: "jwt-inspector.html",
        title: "JWT Inspector",
        inlineScripts: ["./jwt-inspector.js"],
      });
    });

    ToolExport.attachActions($("decoded-section"), () => {
      if (!parsed) return null;
      return "Header:\n" + JSON.stringify(parsed.header, null, 2) +
             "\n\nPayload:\n" + JSON.stringify(parsed.payload, null, 2);
    });
  });
})();
