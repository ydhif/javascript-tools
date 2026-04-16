(function () {
  const $ = (id) => document.getElementById(id);

  function shQuote(s) {
    if (s == null || s === "") return "''";
    return "'" + String(s).replace(/'/g, "'\\''") + "'";
  }

  function addCopyButton(preId) {
    const pre = $(preId);
    const wrapper = pre.parentElement;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Copier";
    btn.className = "ch-copy-btn px-3 py-1 text-xs rounded font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50";
    btn.addEventListener("click", async () => {
      const text = pre.textContent;
      if (!text) return;
      await ToolExport.copyText(text);
      btn.textContent = "Copié !";
      btn.disabled = true;
      setTimeout(() => { btn.textContent = "Copier"; btn.disabled = false; }, 1500);
    });
    wrapper.insertBefore(btn, pre);
  }

  function setStatus(msg, kind) {
    const el = $("status");
    el.textContent = msg;
    el.className = "text-sm " +
      (kind === "err" ? "text-red-700 font-medium" :
       kind === "ok"  ? "text-emerald-700 font-medium" :
                        "text-slate-600");
  }

  function indentCurl(raw) {
    // Normalise les backslash continuations en une seule ligne puis ré-indente simplement.
    return raw.replace(/\\\r?\n\s*/g, " ").trim();
  }

  function getFormValues() {
    const tokenUrl = $("token-url").value.trim();
    const clientId = $("client-id").value.trim();
    const clientSecret = $("client-secret").value;
    const scope = $("scope").value.trim();
    const audience = $("audience").value.trim();
    const curlRaw = $("curl-input").value;
    const useBasic = $("opt-basic").checked;
    const useEnv = $("opt-env").checked;
    return { tokenUrl, clientId, clientSecret, scope, audience, curlRaw, useBasic, useEnv };
  }

  function validate(v) {
    if (!v.tokenUrl || !v.clientId || !v.clientSecret) {
      setStatus("✗ Token URL, client_id et client_secret obligatoires.", "err");
      return false;
    }
    if (!v.curlRaw.trim()) {
      setStatus("✗ Commande curl cible manquante.", "err");
      return false;
    }
    if (!/\{\{token\}\}/.test(v.curlRaw)) {
      setStatus("⚠ Le placeholder {{token}} est absent de la commande curl.", "err");
      return false;
    }
    return true;
  }

  function buildOneliner(v) {
    const tokenParts = [
      "curl -s --fail -X POST",
      shQuote(v.tokenUrl),
      "-H 'Content-Type: application/x-www-form-urlencoded'",
      "-H 'Accept: application/json'",
    ];
    if (v.useBasic) {
      tokenParts.push("--user " + shQuote(v.clientId + ":" + v.clientSecret));
    }

    const dataParts = ["grant_type=client_credentials"];
    if (!v.useBasic) {
      dataParts.push("client_id=" + v.clientId);
      dataParts.push("client_secret=" + v.clientSecret);
    }
    if (v.scope)    dataParts.push("scope=" + v.scope);
    if (v.audience) dataParts.push("audience=" + v.audience);

    dataParts.forEach((p) => tokenParts.push("--data-urlencode " + shQuote(p)));

    const targetCurl = indentCurl(v.curlRaw).replace(/\{\{token\}\}/g, "$ACCESS_TOKEN");

    return "ACCESS_TOKEN=$(" + tokenParts.join(" ") + " | jq -r '.access_token') && " + targetCurl;
  }

  function buildScript(v) {
    const lines = [];
    lines.push("#!/usr/bin/env bash");
    lines.push("set -euo pipefail");
    lines.push("");
    lines.push("# Prérequis : curl, jq");
    lines.push("command -v jq >/dev/null 2>&1 || { echo 'jq requis' >&2; exit 1; }");
    lines.push("");

    // Vars
    lines.push("TOKEN_URL=" + shQuote(v.tokenUrl));
    if (v.useEnv) {
      lines.push('CLIENT_ID="${CLIENT_ID:-' + v.clientId.replace(/"/g, '\\"') + '}"');
      lines.push('CLIENT_SECRET="${CLIENT_SECRET:-' + v.clientSecret.replace(/"/g, '\\"') + '}"');
    } else {
      lines.push("CLIENT_ID=" + shQuote(v.clientId));
      lines.push("CLIENT_SECRET=" + shQuote(v.clientSecret));
    }
    if (v.scope)    lines.push("SCOPE="    + shQuote(v.scope));
    if (v.audience) lines.push("AUDIENCE=" + shQuote(v.audience));
    lines.push("");

    // Récupération token
    lines.push("echo '>>> Récupération de l'\\''access_token...' >&2");
    const curlTokenArgs = [
      "curl", "--silent", "--show-error", "--fail",
      "--request", "POST",
      '"$TOKEN_URL"',
      "--header", "'Content-Type: application/x-www-form-urlencoded'",
      "--header", "'Accept: application/json'",
    ];
    if (v.useBasic) {
      curlTokenArgs.push("--user", '"$CLIENT_ID:$CLIENT_SECRET"');
    }
    lines.push(curlTokenArgs.join(" ") + " \\");

    // Data fields
    const dataParts = ["grant_type=client_credentials"];
    if (!v.useBasic) {
      dataParts.push('client_id=$CLIENT_ID');
      dataParts.push('client_secret=$CLIENT_SECRET');
    }
    if (v.scope)    dataParts.push('scope=$SCOPE');
    if (v.audience) dataParts.push('audience=$AUDIENCE');

    const dataLine = dataParts
      .map((p) => '  --data-urlencode "' + p + '"')
      .join(" \\\n");
    lines.push(dataLine + " \\");
    lines.push("  > /tmp/token_response.json");
    lines.push("");
    lines.push("ACCESS_TOKEN=$(jq -r '.access_token' /tmp/token_response.json)");
    lines.push('if [ -z "$ACCESS_TOKEN" ] || [ "$ACCESS_TOKEN" = "null" ]; then');
    lines.push('  echo "✗ access_token introuvable dans la réponse :" >&2');
    lines.push("  cat /tmp/token_response.json >&2");
    lines.push("  exit 1");
    lines.push("fi");
    lines.push('echo ">>> Token obtenu (${#ACCESS_TOKEN} caractères)" >&2');
    lines.push("");

    // Requête cible
    const targetCurl = indentCurl(v.curlRaw).replace(/\{\{token\}\}/g, "$ACCESS_TOKEN");
    lines.push("echo '>>> Appel de la requête cible...' >&2");
    lines.push(targetCurl);
    lines.push("");

    return lines.join("\n");
  }

  function generateBoth() {
    const v = getFormValues();
    if (!validate(v)) return;

    $("output-section").classList.remove("hidden");
    $("script-out").textContent = buildScript(v);
    $("oneliner-out").textContent = buildOneliner(v);
    setStatus("✓ Script + one-liner générés", "ok");
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("go-btn").addEventListener("click", generateBoth);

    $("example-btn").addEventListener("click", () => {
      $("token-url").value = "https://login.example.com/oauth2/token";
      $("client-id").value = "my-client-id";
      $("client-secret").value = "my-client-secret";
      $("scope").value = "api://my-api/.default";
      $("curl-input").value =
        'curl -X GET "https://api.example.com/v1/me" \\\n' +
        '  -H "Authorization: Bearer {{token}}" \\\n' +
        '  -H "Accept: application/json"';
    });

    $("download-html").addEventListener("click", () => {
      ToolExport.downloadStandalone({
        filename: "curl-helper.html",
        title: "Curl Helper",
        inlineScripts: ["./curl-helper.js"],
      });
    });

    addCopyButton("oneliner-out");
    addCopyButton("script-out");
  });
})();
