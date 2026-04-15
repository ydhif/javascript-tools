(function () {
  const $ = (id) => document.getElementById(id);

  function shQuote(s) {
    if (s == null || s === "") return "''";
    return "'" + String(s).replace(/'/g, "'\\''") + "'";
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

  function generateScript() {
    const tokenUrl = $("token-url").value.trim();
    const clientId = $("client-id").value.trim();
    const clientSecret = $("client-secret").value;
    const scope = $("scope").value.trim();
    const audience = $("audience").value.trim();
    const curlRaw = $("curl-input").value;
    const useBasic = $("opt-basic").checked;
    const useEnv = $("opt-env").checked;

    if (!tokenUrl || !clientId || !clientSecret) {
      setStatus("✗ Token URL, client_id et client_secret obligatoires.", "err");
      return;
    }
    if (!curlRaw.trim()) {
      setStatus("✗ Commande curl cible manquante.", "err");
      return;
    }
    if (!/\{\{token\}\}/.test(curlRaw)) {
      setStatus("⚠ Le placeholder {{token}} est absent de la commande curl.", "err");
      return;
    }

    const lines = [];
    lines.push("#!/usr/bin/env bash");
    lines.push("set -euo pipefail");
    lines.push("");
    lines.push("# Prérequis : curl, jq");
    lines.push("command -v jq >/dev/null 2>&1 || { echo 'jq requis' >&2; exit 1; }");
    lines.push("");

    // Vars
    lines.push("TOKEN_URL=" + shQuote(tokenUrl));
    if (useEnv) {
      lines.push('CLIENT_ID="${CLIENT_ID:-' + clientId.replace(/"/g, '\\"') + '}"');
      lines.push('CLIENT_SECRET="${CLIENT_SECRET:-' + clientSecret.replace(/"/g, '\\"') + '}"');
    } else {
      lines.push("CLIENT_ID=" + shQuote(clientId));
      lines.push("CLIENT_SECRET=" + shQuote(clientSecret));
    }
    if (scope)    lines.push("SCOPE="    + shQuote(scope));
    if (audience) lines.push("AUDIENCE=" + shQuote(audience));
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
    if (useBasic) {
      curlTokenArgs.push("--user", '"$CLIENT_ID:$CLIENT_SECRET"');
    }
    lines.push(curlTokenArgs.join(" ") + " \\");

    // Data fields
    const dataParts = ["grant_type=client_credentials"];
    if (!useBasic) {
      dataParts.push('client_id=$CLIENT_ID');
      dataParts.push('client_secret=$CLIENT_SECRET');
    }
    if (scope)    dataParts.push('scope=$SCOPE');
    if (audience) dataParts.push('audience=$AUDIENCE');

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

    // Requête cible — on substitue {{token}} par $ACCESS_TOKEN
    const targetCurl = indentCurl(curlRaw).replace(/\{\{token\}\}/g, "$ACCESS_TOKEN");
    lines.push("echo '>>> Appel de la requête cible...' >&2");
    lines.push(targetCurl);
    lines.push("");

    $("output-section").classList.remove("hidden");
    $("script-out").textContent = lines.join("\n");
    setStatus("✓ Script généré", "ok");
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("go-btn").addEventListener("click", generateScript);

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

    ToolExport.attachActions($("output-section"), () => $("script-out").textContent || null);
  });
})();
