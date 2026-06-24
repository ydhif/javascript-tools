(function () {
  const $ = (id) => document.getElementById(id);

  let lastModel = null; // { type, items }

  function setStatus(msg, kind) {
    const el = $("status");
    el.textContent = msg;
    el.className = "text-sm " +
      (kind === "err" ? "text-red-700 font-medium" :
       kind === "ok"  ? "text-emerald-700 font-medium" :
                        "text-slate-600");
  }

  // Quote pour shell POSIX : enveloppe en simple quotes, échappe les ' internes.
  function shq(s) {
    return "'" + String(s == null ? "" : s).replace(/'/g, "'\\''") + "'";
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // ---------------------------------------------------------------------------
  // Détection du format
  // ---------------------------------------------------------------------------
  function detect(parsed) {
    if (!parsed || typeof parsed !== "object") return { type: "none" };
    const data = Array.isArray(parsed.data) ? parsed.data
               : Array.isArray(parsed) ? parsed
               : [parsed];

    // Format "configuration d'exception" : data[].rules[]
    const excConfigs = data.filter((d) => d && Array.isArray(d.rules));
    if (excConfigs.length) {
      const items = [];
      excConfigs.forEach((cfg) => {
        cfg.rules.forEach((rule) => items.push({ rule, exceptionName: cfg.name }));
      });
      return { type: "exception", items };
    }

    // Format "log de sécurité" : data[].request
    const logs = data.filter((d) => d && d.request);
    if (logs.length) return { type: "log", items: logs };

    // Objet "request" collé directement.
    if (parsed.request) return { type: "log", items: [parsed] };
    if (parsed.method && parsed.path) return { type: "log", items: [{ request: parsed, events: [] }] };

    return { type: "none" };
  }

  // ===========================================================================
  // MODE LOG : rejeu fidèle d'une requête capturée
  // ===========================================================================
  function cookiePair(c) {
    const key = c.key || "";
    const val = c.value || "";
    if (key && val.startsWith(key + "=")) return val;
    if (!key) return val;
    return key + "=" + val;
  }

  function collectTriggers(events) {
    const cookies = new Set();
    const headers = new Set();
    let needBody = false;
    (events || []).forEach((ev) => {
      const parts = (ev.tokens && ev.tokens.matchingParts) || [];
      parts.forEach((mp) => {
        const part = String(mp.part || "").toLowerCase();
        if (part === "cookie" && mp.partKey) cookies.add(mp.partKey);
        else if (part === "header" && mp.partKey) headers.add(String(mp.partKey).toLowerCase());
        else if (["body", "parameter", "parameters", "post", "var_post"].includes(part)) needBody = true;
        // query/url/path : déjà reproduits via l'URL.
      });
    });
    return { cookies, headers, needBody };
  }

  function originFrom(req, baseUrl) {
    const override = (baseUrl || "").trim().replace(/\/+$/, "");
    if (override) return /^https?:\/\//i.test(override) ? override : "https://" + override;
    const port = req.portDst;
    const scheme = port === 80 ? "http" : "https";
    let host = req.hostname || "host.invalid";
    if (port && port !== 80 && port !== 443) host += ":" + port;
    return scheme + "://" + host;
  }

  function buildFromLog(entry, opts) {
    const req = entry.request || {};
    const method = (req.method || "GET").toUpperCase();
    const path = req.path || "/";
    const query = req.query ? (req.query.startsWith("?") ? req.query : "?" + req.query) : "";
    const url = originFrom(req, opts.baseUrl) + path + query;

    let resolveArg = null;
    if (opts.resolve && req.ipDst) {
      try {
        const u = new URL(url);
        const p = u.port || (u.protocol === "http:" ? "80" : "443");
        resolveArg = u.hostname + ":" + p + ":" + req.ipDst;
      } catch (_) {}
    }

    const trig = collectTriggers(entry.events);
    let minimalUsed = opts.minimal;
    let headers = Array.isArray(req.headers) ? req.headers.slice() : [];
    let cookies = Array.isArray(req.cookies) ? req.cookies.slice() : [];

    if (opts.minimal) {
      const fCookies = cookies.filter((c) => trig.cookies.has(c.key));
      const fHeaders = headers.filter((h) => trig.headers.has(String(h.key).toLowerCase()));
      if (fCookies.length || fHeaders.length || trig.needBody) {
        cookies = fCookies;
        headers = fHeaders;
      } else {
        minimalUsed = false;
      }
    }

    const SKIP = new Set(["host", "content-length", "cookie"]);
    const keptHeaders = headers.filter((h) => h && h.key && !SKIP.has(String(h.key).toLowerCase()));

    let body = req.body || "";
    if (minimalUsed && !trig.needBody) body = "";
    const hasBody = body.length > 0;

    if (minimalUsed && hasBody && !keptHeaders.some((h) => String(h.key).toLowerCase() === "content-type")) {
      const ct = (Array.isArray(req.headers) ? req.headers : []).find(
        (h) => String(h.key).toLowerCase() === "content-type"
      );
      keptHeaders.push(ct || { key: "Content-Type", value: "application/x-www-form-urlencoded" });
    }

    const cookieHeader = cookies.length ? cookies.map(cookiePair).join("; ") : "";

    let head = "curl";
    if (opts.showResp) head += " -i";
    if (opts.insecure) head += " -k";
    head += " -X " + method + " " + shq(url);

    const segs = [head];
    if (resolveArg) segs.push("--resolve " + shq(resolveArg));
    keptHeaders.forEach((h) => segs.push("-H " + shq(h.key + ": " + (h.value == null ? "" : h.value))));
    if (cookieHeader) segs.push("-H " + shq("Cookie: " + cookieHeader));
    if (hasBody) segs.push("--data-raw " + shq(body));

    return {
      curl: segs.join(" \\\n  "),
      method, url, minimalUsed,
      counts: { headers: keptHeaders.length, cookies: cookies.length, body: hasBody },
      title: (req.method || "GET") + " " + path,
      tag: (entry.request && entry.request.requestUid) || entry.uid || "",
      summary: logEventSummary(entry.events),
    };
  }

  function logEventSummary(events) {
    return (events || []).map((ev) => {
      const t = ev.tokens || {};
      return {
        family: t.attackFamily || "Règle",
        cwe: t.cwe || "",
        rule: t.icxRuleName || "",
        reason: t.reason || "",
        locations: (t.matchingParts || []).map((mp) =>
          [mp.part, mp.partKey].filter(Boolean).join(" / ") +
          (mp.partValueMatch ? " → match « " + mp.partValueMatch + " »" : "")),
      };
    });
  }

  // ===========================================================================
  // MODE EXCEPTION : synthèse d'une requête de test à partir d'une règle
  // ===========================================================================
  const KNOWN_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS", "TRACE"];

  function methodFromRegex(re) {
    if (!re) return null;
    const m = String(re).toUpperCase().match(/GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|TRACE/g);
    return m && m.length ? m[0] : null;
  }

  // Payload représentatif d'une famille d'attaque, incluant un littéral imposé
  // par l'exception le cas échéant (ex. « # », « /home/ »).
  function payloadFor(patternName, literal) {
    const n = (patternName || "").toLowerCase();
    let p;
    if (n.includes("sql")) p = literal === "#" ? "' OR 1=1#" : "' OR 1=1-- -";
    else if (n.includes("path trans") || n.includes("path traversal")) p = "../../../../../../etc/passwd";
    else if (n.includes("remote file include") || n.includes("rfi")) p = "http://attacker.example.com/shell.txt";
    else if (n.includes("php injection")) p = "<?php system('id');?>";
    else if (n.includes("php uri")) p = "/evil.php";
    else if (n.includes("parser evasion")) p = "%2e%2e%2f%2e%2e%2fetc%2fpasswd";
    else if (literal) p = literal; // pattern inconnu mais littéral connu
    else p = "../../etc/passwd";   // défaut générique
    if (literal && literal !== "#" && !p.includes(literal)) p = literal + p;
    return p;
  }

  function buildFromException(item, opts) {
    const rule = item.rule || {};
    const conds = rule.conditions || [];

    let host = null, uri = "/", uriOp = "is", methodRe = null;
    conds.forEach((c) => {
      const part = String(c.part || "").toLowerCase();
      if (part === "hostname") host = c.value;
      else if (part === "uri") { uri = c.value || "/"; uriOp = c.valueOperator || "is"; }
      else if (part === "method") methodRe = c.value;
    });

    // Regroupe les matchingParts par emplacement ; fusionne nom de pattern + littéral.
    const groups = {};
    (rule.matchingParts || []).forEach((mp) => {
      const gk = (mp.part || "") + "|" + (mp.key || "");
      const g = groups[gk] || (groups[gk] = { part: mp.part || "", key: mp.key || "", name: null, literal: null });
      if (mp.valueType === "partValuePatternName") g.name = mp.value;
      else if (mp.valueType === "partValueMatch") g.literal = mp.value;
    });

    const query = {}, form = {}, cookies = {}, headers = {};
    let pathPayload = null;
    let methodHint = null;
    const injections = [];

    Object.values(groups).forEach((g) => {
      const partL = g.part.toLowerCase();
      if (partL === "method") return; // règle « Only-GET-POST-HEAD » : pas de payload, c'est la méthode qui compte
      if (!g.name && !g.literal) return;
      const payload = payloadFor(g.name, g.literal);
      const fam = g.name || "match « " + g.literal + " »";
      if (partL === "var_get") { query[g.key] = payload; injections.push("Var_GET " + g.key + " ← " + fam); }
      else if (partL === "var_post") { form[g.key] = payload; methodHint = "POST"; injections.push("Var_POST " + g.key + " ← " + fam); }
      else if (partL === "cookie") { cookies[g.key] = payload; injections.push("Cookie " + g.key + " ← " + fam); }
      else if (partL === "header") { headers[g.key] = payload; injections.push("Header " + g.key + " ← " + fam); }
      else if (partL === "path") { pathPayload = payload; injections.push("Path ← " + fam); }
      else { query[g.key || "q"] = payload; injections.push((g.part || "param") + " " + g.key + " ← " + fam); }
    });

    const method = methodFromRegex(methodRe) || methodHint || (Object.keys(form).length ? "POST" : "GET");

    // Path : on respecte la condition uri. begin_with → on peut suffixer le payload de path.
    let path = uri || "/";
    let pathNote = "";
    if (pathPayload) {
      if (uriOp === "is") pathNote = "Le pattern « Php URI » porte sur le Path mais la condition uri est « is » : payload de path non inséré (ajuste manuellement).";
      else path = path.replace(/\/+$/, "") + pathPayload;
    }

    // Query string
    const qs = Object.keys(query)
      .map((k) => encodeURIComponent(k) + "=" + encodeURIComponent(query[k]))
      .join("&");

    // Origin
    let origin;
    const override = (opts.baseUrl || "").trim().replace(/\/+$/, "");
    if (override) origin = /^https?:\/\//i.test(override) ? override : "https://" + override;
    else origin = "https://" + (host || "host.invalid");

    const url = origin + path + (qs ? "?" + qs : "");

    // Cookies / headers / body
    const cookieHeader = Object.keys(cookies)
      .map((k) => k + "=" + encodeURIComponent(cookies[k])).join("; ");
    const bodyStr = Object.keys(form)
      .map((k) => encodeURIComponent(k) + "=" + encodeURIComponent(form[k])).join("&");
    const hasBody = bodyStr.length > 0;

    let head = "curl";
    if (opts.showResp) head += " -i";
    if (opts.insecure) head += " -k";
    head += " -X " + method + " " + shq(url);

    const segs = [head];
    Object.keys(headers).forEach((k) => segs.push("-H " + shq(k + ": " + headers[k])));
    if (hasBody) segs.push("-H " + shq("Content-Type: application/x-www-form-urlencoded"));
    if (cookieHeader) segs.push("-H " + shq("Cookie: " + cookieHeader));
    if (hasBody) segs.push("--data-raw " + shq(bodyStr));

    const noPayload = injections.length === 0;

    return {
      curl: segs.join(" \\\n  "),
      method, url,
      title: rule.name || "(règle sans nom)",
      tag: rule.uid || "",
      enabled: rule.enabled !== false,
      description: rule.description || "",
      injections,
      pathNote,
      noPayload,
      conditions: conds.map((c) =>
        (c.part || "") + " " + (c.valueOperator || "") + " « " + (c.value != null ? c.value : c.key) + " »"),
    };
  }

  // ===========================================================================
  // Rendu
  // ===========================================================================
  function copyBtn(curlText) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Copier le curl";
    btn.className = "btn btn-primary mb-2";
    btn.addEventListener("click", async () => {
      await ToolExport.copyText(curlText);
      btn.textContent = "Copié !";
      btn.disabled = true;
      setTimeout(() => { btn.textContent = "Copier le curl"; btn.disabled = false; }, 1500);
    });
    return btn;
  }

  function renderLog(items, opts) {
    const container = $("results");
    items.forEach((entry) => {
      const r = buildFromLog(entry, opts);
      const wrap = document.createElement("div");
      wrap.className = "req-item card animate-in";

      let html =
        '<div class="flex items-center justify-between gap-2 mb-3 flex-wrap">' +
        '<div class="flex items-center gap-2">' +
        '<span class="badge" style="background:#ecfdf5;color:#047857;">' + escapeHtml(r.method) + "</span>" +
        '<h3 class="font-bold text-base break-all">' + escapeHtml(r.url) + "</h3></div>" +
        (r.tag ? '<span class="cf-stat">' + escapeHtml(r.tag) + "</span>" : "") +
        "</div>";

      html += '<div class="flex flex-wrap gap-2 mb-3">';
      html += '<span class="cf-stat">Headers : ' + r.counts.headers + "</span>";
      html += '<span class="cf-stat">Cookies : ' + r.counts.cookies + "</span>";
      html += '<span class="cf-stat">Body : ' + (r.counts.body ? "oui" : "non") + "</span>";
      if (r.minimalUsed) html += '<span class="cf-stat" style="background:#fef9c3;color:#854d0e;">mode minimal</span>';
      html += "</div>";

      r.summary.forEach((s) => {
        html += '<div class="evt-card">' +
          '<span class="fam">' + escapeHtml(s.family) + "</span>" +
          (s.cwe ? ' <span class="text-xs text-red-700">(' + escapeHtml(s.cwe) + ")</span>" : "") +
          (s.rule ? ' · règle <code>' + escapeHtml(s.rule) + "</code>" : "") +
          (s.reason ? '<div class="text-xs text-slate-700 mt-1">' + escapeHtml(s.reason) + "</div>" : "") +
          (s.locations.length ? '<ul class="text-xs text-slate-700 mt-1 list-disc ml-4">' +
            s.locations.map((l) => "<li>" + escapeHtml(l) + "</li>").join("") + "</ul>" : "") +
          "</div>";
      });

      wrap.innerHTML = html;
      wrap.appendChild(copyBtn(r.curl));
      const pre = document.createElement("pre");
      pre.className = "cf-out";
      pre.textContent = r.curl;
      wrap.appendChild(pre);
      container.appendChild(wrap);
    });
  }

  function renderException(items, opts) {
    const container = $("results");

    const note = document.createElement("div");
    note.className = "evt-card animate-in";
    note.style.borderColor = "#fcd34d";
    note.style.background = "#fffbeb";
    note.innerHTML =
      '<b>Requêtes synthétisées.</b> Ce fichier décrit des <i>exceptions</i>, pas des requêtes réelles. ' +
      "Chaque curl ci-dessous reproduit l'URI / l'hôte / la méthode de la règle et injecte un payload " +
      "représentatif de la famille d'attaque whitelistée, à l'emplacement attendu. " +
      "Attendu : <b>passe le WAF</b> (l'exception s'applique) — la réponse backend peut être une erreur " +
      "fonctionnelle, c'est normal. Test de contrôle : le même payload sur une autre URI/hôte doit rester bloqué.";
    container.appendChild(note);

    items.forEach((item) => {
      const r = buildFromException(item, opts);
      const wrap = document.createElement("div");
      wrap.className = "req-item card animate-in";

      let html =
        '<div class="flex items-center justify-between gap-2 mb-2 flex-wrap">' +
        '<div class="flex items-center gap-2">' +
        '<span class="badge" style="background:#ecfdf5;color:#047857;">' + escapeHtml(r.method) + "</span>" +
        '<h3 class="font-bold text-sm break-all">' + escapeHtml(r.title) + "</h3></div>" +
        (r.enabled ? "" : '<span class="cf-stat" style="background:#fee2e2;color:#b91c1c;">désactivée</span>') +
        "</div>";

      html += '<div class="text-xs text-slate-600 mb-2 break-all">' + escapeHtml(r.url) + "</div>";

      // Conditions
      if (r.conditions.length) {
        html += '<div class="text-xs text-slate-700 mb-2"><b>Conditions :</b><ul class="list-disc ml-4">' +
          r.conditions.map((c) => "<li>" + escapeHtml(c) + "</li>").join("") + "</ul></div>";
      }
      // Injections
      if (r.injections.length) {
        html += '<div class="evt-card mb-2"><span class="fam">Payload injecté</span><ul class="text-xs text-slate-700 mt-1 list-disc ml-4">' +
          r.injections.map((i) => "<li>" + escapeHtml(i) + "</li>").join("") + "</ul></div>";
      } else {
        html += '<div class="text-xs text-amber-700 mb-2">Aucun payload injecté (règle basée sur la méthode ou matchingParts vide) — ' +
          "le curl teste la requête telle quelle.</div>";
      }
      if (r.pathNote) html += '<div class="text-xs text-amber-700 mb-2">⚠ ' + escapeHtml(r.pathNote) + "</div>";

      wrap.innerHTML = html;
      wrap.appendChild(copyBtn(r.curl));
      const pre = document.createElement("pre");
      pre.className = "cf-out";
      pre.textContent = r.curl;
      wrap.appendChild(pre);
      container.appendChild(wrap);
    });
  }

  function readOpts() {
    return {
      baseUrl: $("base-url").value,
      minimal: $("opt-minimal").checked,
      resolve: $("opt-resolve").checked,
      insecure: $("opt-insecure").checked,
      showResp: $("opt-resp").checked,
    };
  }

  function render() {
    const container = $("results");
    container.innerHTML = "";
    if (!lastModel) return;
    if (lastModel.type === "log") renderLog(lastModel.items, readOpts());
    else if (lastModel.type === "exception") renderException(lastModel.items, readOpts());
  }

  function doGenerate() {
    const raw = $("json-input").value.trim();
    if (!raw) { setStatus("Colle un JSON.", "err"); return; }

    let parsed;
    try { parsed = JSON.parse(raw); }
    catch (e) { setStatus("JSON invalide : " + e.message, "err"); return; }

    const model = detect(parsed);
    if (model.type === "none" || !model.items.length) {
      setStatus("Format non reconnu (ni 'request', ni 'rules').", "err");
      return;
    }

    lastModel = model;
    $("output-section").classList.remove("hidden");
    render();

    const ip = model.type === "log" && model.items[0].request && model.items[0].request.ipDst;
    $("ipdst-hint").textContent = ip ? "ipDst " + ip : "ipDst";

    const label = model.type === "log" ? "log → " : "exception → ";
    setStatus(label + model.items.length + " requête(s) générée(s)", "ok");
  }

  // --- Exemples ---
  const EXAMPLE_LOG = {
    data: [{
      request: {
        method: "POST", hostname: "app.example.com",
        path: "/api/v1/token", query: "",
        portDst: 443, ipDst: "203.0.113.10", requestUid: "req-0001",
        headers: [
          { key: "Host", value: "app.example.com" },
          { key: "Content-Type", value: "application/x-www-form-urlencoded" },
          { key: "Content-Length", value: "42" },
        ],
        cookies: [
          { key: "SESSION_ID", value: "SESSION_ID=abc123.def456.ghi789" },
          { key: "PREF", value: "PREF=-100200300" },
        ],
        body: "grant_type=client_credentials&client_id=demo-client",
      },
      events: [{
        tokens: {
          attackFamily: "Path Traversal", cwe: "CWE-22", icxRuleName: "Path traversal",
          reason: "Path Traversal in Cookie 'SESSION_ID'",
          matchingParts: [{ part: "Cookie", partKey: "SESSION_ID", partValueMatch: "abc123.def456" }],
        },
      }],
    }],
  };

  const EXAMPLE_EXC = {
    data: [{
      uid: "cfg-0001",
      name: "exception_app.example.com",
      rules: [
        {
          uid: "rule-0001",
          name: "SQL Injection in Var_POST 'password'",
          enabled: true,
          description: "Faux positif sur le formulaire de login",
          conditions: [
            { part: "uri", valueOperator: "is", value: "/login/authenticate" },
            { part: "hostname", valueOperator: "is", value: "app.example.com" },
          ],
          matchingParts: [
            { part: "Var_POST", key: "password", valueType: "partValuePatternName", value: "SQL Injection" },
            { part: "Var_POST", key: "password", valueType: "partValueMatch", valueOperator: "contain", value: "#" },
          ],
        },
        {
          uid: "rule-0002",
          name: "Path traversal on parameters in Var_GET 'redirect_uri'",
          enabled: true,
          description: "redirect_uri légitime contenant /home/",
          conditions: [
            { part: "uri", valueOperator: "begin_with", value: "/oauth/authorize" },
            { part: "hostname", valueOperator: "is", value: "app.example.com" },
          ],
          matchingParts: [
            { part: "Var_GET", key: "redirect_uri", valueType: "partValuePatternName", value: "Path transversal on parameters" },
            { part: "Var_GET", key: "redirect_uri", valueType: "partValueMatch", valueOperator: "is", value: "/home/" },
          ],
        },
        {
          uid: "rule-0003",
          name: "Only-GET-POST-HEAD",
          enabled: true,
          description: "Autorise DELETE/PUT sur l'API d'admin",
          conditions: [
            { part: "uri", valueOperator: "begin_with", value: "/admin/api/" },
            { part: "hostname", valueOperator: "is", value: "app.example.com" },
            { part: "method", valueOperator: "regexp", value: "(?i)^(DELETE|PUT)$" },
          ],
          matchingParts: [{ part: "Method", valueType: "partValue", valueOperator: "regexp", value: ".*" }],
        },
        {
          uid: "rule-0004",
          name: "SQL Injection in Cookie 'SESSION_ID'",
          enabled: true,
          description: "Cookie de session déclenchant un faux positif",
          conditions: [
            { part: "uri", valueOperator: "begin_with", value: "/api/" },
            { part: "hostname", valueOperator: "is", value: "app.example.com" },
          ],
          matchingParts: [
            { part: "Cookie", key: "SESSION_ID", valueType: "partValuePatternName", value: "SQL Injection" },
          ],
        },
      ],
    }],
  };

  document.addEventListener("DOMContentLoaded", () => {
    $("gen-btn").addEventListener("click", doGenerate);

    $("example-log-btn").addEventListener("click", () => {
      $("json-input").value = JSON.stringify(EXAMPLE_LOG, null, 2);
      doGenerate();
    });
    $("example-exc-btn").addEventListener("click", () => {
      $("json-input").value = JSON.stringify(EXAMPLE_EXC, null, 2);
      doGenerate();
    });

    ["opt-minimal", "opt-resolve", "opt-insecure", "opt-resp"].forEach((id) => {
      $(id).addEventListener("change", () => { if (lastModel) render(); });
    });
    $("base-url").addEventListener("input", () => { if (lastModel) render(); });

    $("download-html").addEventListener("click", () => {
      ToolExport.downloadStandalone({ filename: "waf-curl.html", title: "WAF Log → curl" });
    });
  });
})();
