(function () {
  const $ = (id) => document.getElementById(id);

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  // Drapeaux supportés.
  const SANDBOX_FLAGS = [
    "allow-scripts",
    "allow-same-origin",
    "allow-forms",
    "allow-popups",
    "allow-popups-to-escape-sandbox",
    "allow-modals",
    "allow-presentation",
    "allow-pointer-lock",
    "allow-orientation-lock",
    "allow-top-navigation",
    "allow-top-navigation-by-user-activation",
    "allow-downloads",
    "allow-storage-access-by-user-activation",
  ];

  // Liste pratique des features Permissions Policy fréquentes.
  const ALLOW_FEATURES = [
    "accelerometer", "ambient-light-sensor", "autoplay", "camera",
    "clipboard-read", "clipboard-write", "display-capture", "encrypted-media",
    "fullscreen", "geolocation", "gyroscope", "magnetometer",
    "microphone", "midi", "payment", "picture-in-picture", "publickey-credentials-get",
    "screen-wake-lock", "usb", "web-share", "xr-spatial-tracking",
  ];

  const EXAMPLES = [
    {
      label: "example.com (autorise l'embedding)",
      url: "https://example.com",
      sandbox: ["allow-scripts", "allow-same-origin"],
      hint: "Pas de X-Frame-Options. Devrait charger sans souci.",
    },
    {
      label: "google.com (X-Frame-Options: SAMEORIGIN)",
      url: "https://www.google.com/",
      sandbox: ["allow-scripts", "allow-same-origin"],
      hint: "Devrait être bloqué par X-Frame-Options. Vérifie la console.",
    },
    {
      label: "youtube.com/embed (conçu pour iframe)",
      url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
      sandbox: ["allow-scripts", "allow-same-origin", "allow-presentation"],
      allow: ["autoplay", "encrypted-media", "fullscreen", "picture-in-picture"],
      hint: "URL d'embed YouTube : pensée pour iframe, headers permissifs.",
    },
    {
      label: "Keycloak login (devrait être bloqué)",
      url: "https://www.keycloak.org/",
      sandbox: ["allow-scripts", "allow-same-origin", "allow-forms"],
      hint: "Une page de login OIDC doit refuser le framing (clickjacking).",
    },
  ];

  let exampleIdx = 0;
  let loadStartedAt = 0;
  let loadTimer = null;

  function buildSandboxFlags() {
    const wrap = $("sandbox-flags");
    wrap.innerHTML = "";
    SANDBOX_FLAGS.forEach((flag) => {
      const lbl = document.createElement("label");
      lbl.className = "ifs-flag";
      lbl.title = flag;
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = flag;
      cb.dataset.kind = "sandbox";
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(flag));
      wrap.appendChild(lbl);
      cb.addEventListener("change", updateGenerated);
    });
  }

  function buildAllowFlags() {
    const wrap = $("allow-flags");
    wrap.innerHTML = "";
    ALLOW_FEATURES.forEach((f) => {
      const lbl = document.createElement("label");
      lbl.className = "ifs-flag";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = f;
      cb.dataset.kind = "allow";
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(f));
      wrap.appendChild(lbl);
      cb.addEventListener("change", updateGenerated);
    });
  }

  function getCheckedValues(kind) {
    return Array.from(
      document.querySelectorAll(`input[data-kind="${kind}"]:checked`)
    ).map((c) => c.value);
  }

  function setCheckedValues(kind, values) {
    const set = new Set(values || []);
    document.querySelectorAll(`input[data-kind="${kind}"]`).forEach((c) => {
      c.checked = set.has(c.value);
    });
  }

  // Construit l'HTML de la balise iframe (sans la rendre).
  function buildIframeMarkup() {
    const url = $("url").value.trim();
    const sandboxVals = getCheckedValues("sandbox");
    const allowVals = getCheckedValues("allow");
    const referrer = $("referrerpolicy").value;
    const loading = $("loading").value;
    const width = $("width").value.trim();
    const height = $("height").value.trim();

    const sandboxAttr = $("sandbox-none").dataset.active === "1"
      ? null  // pas du tout d'attribut sandbox
      : sandboxVals.join(" "); // peut être vide -> sandbox=""

    const attrs = [];
    attrs.push(`src="${escapeHtml(url || "about:blank")}"`);
    if (sandboxAttr !== null) attrs.push(`sandbox="${escapeHtml(sandboxAttr)}"`);
    if (allowVals.length) attrs.push(`allow="${escapeHtml(allowVals.join("; "))}"`);
    if (referrer) attrs.push(`referrerpolicy="${escapeHtml(referrer)}"`);
    if (loading) attrs.push(`loading="${escapeHtml(loading)}"`);
    if (width) attrs.push(`width="${escapeHtml(width)}"`);
    if (height) attrs.push(`height="${escapeHtml(height)}"`);
    attrs.push('title="Iframe preview"');

    return "<iframe\n  " + attrs.join("\n  ") + ">\n</iframe>";
  }

  function updateGenerated() {
    $("generated-html").textContent = buildIframeMarkup();
  }

  function setStatus(kind, text) {
    const el = $("status");
    el.classList.remove("ok", "warn", "err", "idle");
    el.classList.add(kind);
    el.textContent = text;
  }

  // Applique la conf au vrai iframe et déclenche le chargement.
  function loadIframe() {
    const url = $("url").value.trim();
    if (!url) {
      setStatus("warn", "Aucune URL");
      return;
    }
    if (!/^https?:\/\//i.test(url) && url !== "about:blank" && !url.startsWith("data:")) {
      setStatus("err", "URL invalide (http(s):// requis)");
      return;
    }

    const wrap = $("frame-wrap");
    // On recrée l'iframe pour que les changements de sandbox/allow soient pris en compte.
    const old = $("preview");
    if (old) old.remove();

    const f = document.createElement("iframe");
    f.id = "preview";
    f.title = "Iframe preview";

    const sandboxVals = getCheckedValues("sandbox");
    if ($("sandbox-none").dataset.active !== "1") {
      f.setAttribute("sandbox", sandboxVals.join(" "));
    }
    const allowVals = getCheckedValues("allow");
    if (allowVals.length) f.setAttribute("allow", allowVals.join("; "));
    const referrer = $("referrerpolicy").value;
    if (referrer) f.setAttribute("referrerpolicy", referrer);
    const loading = $("loading").value;
    if (loading) f.setAttribute("loading", loading);

    const width = $("width").value.trim();
    const heightPx = parseInt($("height").value, 10) || 480;
    if (width) f.style.width = width;
    f.style.height = heightPx + "px";
    f.style.minHeight = heightPx + "px";
    f.style.background = "#fff";
    f.style.border = "0";

    wrap.appendChild(f);

    setStatus("idle", "Chargement…");
    $("timing").textContent = "";
    loadStartedAt = performance.now();

    if (loadTimer) clearTimeout(loadTimer);
    loadTimer = setTimeout(() => {
      // Si le `load` n'arrive pas dans 8s on signale un timeout.
      if ($("status").textContent.startsWith("Chargement")) {
        setStatus("warn", "Timeout (>8s) — possiblement bloqué");
      }
    }, 8000);

    f.addEventListener("load", () => {
      if (loadTimer) { clearTimeout(loadTimer); loadTimer = null; }
      const dt = Math.round(performance.now() - loadStartedAt);
      $("timing").textContent = "load en " + dt + " ms";

      // Heuristique blocage : si on peut lire location.href sans throw,
      // c'est que le doc est same-origin -> souvent about:blank suite à un blocage.
      try {
        const href = f.contentWindow.location.href;
        if (href === "about:blank" || href === "") {
          setStatus("err", "Bloqué (X-Frame-Options ou frame-ancestors) — voir DevTools");
        } else {
          setStatus("ok", "Chargé (same-origin)");
        }
      } catch (_) {
        // SecurityError = doc cross-origin accessible -> chargement OK.
        setStatus("ok", "Chargé (cross-origin)");
      }
    });

    f.addEventListener("error", () => {
      if (loadTimer) { clearTimeout(loadTimer); loadTimer = null; }
      setStatus("err", "Erreur de chargement");
    });

    f.src = url;
    updateGenerated();
  }

  // postMessage : envoie au contentWindow de l'iframe courante.
  function sendPostMessage() {
    const f = $("preview");
    if (!f || !f.contentWindow) {
      logMessage({ origin: "(local)", data: "Aucun iframe chargé.", err: true });
      return;
    }
    const raw = $("pm-payload").value;
    let payload;
    try { payload = JSON.parse(raw); }
    catch (_) { payload = raw; } // fallback texte
    const target = $("pm-target").value.trim() || "*";
    try {
      f.contentWindow.postMessage(payload, target);
      logMessage({ origin: "(parent → iframe)", data: payload, sent: true, target });
    } catch (e) {
      logMessage({ origin: "(local)", data: "Erreur postMessage : " + e.message, err: true });
    }
  }

  function logMessage({ origin, data, sent, err, target }) {
    const log = $("pm-log");
    if (log.querySelector(".italic")) log.innerHTML = "";
    const line = document.createElement("div");
    line.className = "ifs-msg";
    if (err) line.style.borderLeftColor = "#dc2626";
    else if (sent) line.style.borderLeftColor = "#10b981";
    const meta = document.createElement("div");
    meta.className = "ifs-msg-meta";
    const ts = new Date().toLocaleTimeString();
    meta.textContent = ts + " — " + origin + (target ? " (target: " + target + ")" : "");
    line.appendChild(meta);
    const body = document.createElement("div");
    body.textContent = typeof data === "string" ? data : safeStringify(data);
    line.appendChild(body);
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
  }

  function safeStringify(v) {
    try { return JSON.stringify(v, null, 2); }
    catch (_) { return String(v); }
  }

  // Reçoit les messages provenant de l'iframe (et d'ailleurs).
  window.addEventListener("message", (ev) => {
    const f = $("preview");
    const fromOurFrame = f && ev.source === f.contentWindow;
    if (!fromOurFrame) return; // on n'affiche que les messages de notre iframe
    logMessage({ origin: "iframe → parent (origin: " + ev.origin + ")", data: ev.data });
  });

  // Sonde HEAD pour récupérer les headers anti-framing.
  async function probeUrl() {
    const url = $("url").value.trim();
    const out = $("probe-result");
    if (!url) { out.innerHTML = '<div class="alert alert-warn">Renseigne une URL.</div>'; return; }
    out.innerHTML = '<div class="text-sm text-slate-500">Sondage en cours…</div>';

    const rows = [];
    let xfo = null, csp = null, frameAncestors = null, mode = null;

    try {
      const r = await fetch(url, { method: "GET", mode: "cors", credentials: "omit", redirect: "follow" });
      mode = "cors";
      xfo = r.headers.get("x-frame-options");
      csp = r.headers.get("content-security-policy");
      if (csp) {
        const m = csp.split(";").map((s) => s.trim()).find((d) => /^frame-ancestors\b/i.test(d));
        if (m) frameAncestors = m.replace(/^frame-ancestors\s+/i, "").trim();
      }
      rows.push(["Mode", "GET cors (headers lisibles)"]);
      rows.push(["Status", String(r.status) + " " + r.statusText]);
    } catch (e) {
      // Fallback : juste tester la joignabilité en no-cors.
      try {
        await fetch(url, { method: "GET", mode: "no-cors", credentials: "omit", redirect: "follow" });
        mode = "no-cors";
        rows.push(["Mode", "no-cors (headers non lisibles, ressource joignable)"]);
      } catch (e2) {
        out.innerHTML =
          '<div class="alert alert-error">Échec du fetch : ' +
          escapeHtml(e2.message) +
          ". L'URL peut être hors ligne, ou le navigateur a bloqué la requête (CSP, mixed content, etc.)." +
          '</div>';
        return;
      }
    }

    if (mode === "cors") {
      rows.push([
        "X-Frame-Options",
        xfo
          ? xfo + (/(deny|sameorigin)/i.test(xfo) ? " (bloque le framing cross-origin)" : "")
          : "(absent)"
      ]);
      rows.push([
        "CSP frame-ancestors",
        frameAncestors
          ? frameAncestors + (/('none'|none)/i.test(frameAncestors) ? " (bloque tout framing)" : "")
          : (csp ? "(directive absente — CSP présente sur d'autres directives)" : "(CSP absente)")
      ]);
      rows.push(["Content-Security-Policy (brut)", csp || "(absent)"]);
    } else {
      rows.push([
        "Note",
        "Le serveur n'autorise pas CORS, donc impossible de lire X-Frame-Options ou frame-ancestors. " +
        "Ouvre les DevTools (Network → l'URL → Headers) pour les voir, ou regarde la console quand l'iframe se charge."
      ]);
    }

    const table = document.createElement("table");
    table.className = "ifs-headers w-full";
    rows.forEach(([k, v]) => {
      const tr = document.createElement("tr");
      const isBad =
        (k === "X-Frame-Options" && /(deny|sameorigin)/i.test(v)) ||
        (k === "CSP frame-ancestors" && /('none'|none)/i.test(v));
      const isOk =
        (k === "X-Frame-Options" && /\(absent\)/.test(v)) ||
        (k === "CSP frame-ancestors" && /\(directive absente|CSP absente|allowall|\*/i.test(v));
      if (isBad) tr.className = "ifs-row-bad";
      else if (isOk) tr.className = "ifs-row-ok";
      const th = document.createElement("th");
      th.textContent = k;
      const td = document.createElement("td");
      td.textContent = v;
      tr.appendChild(th); tr.appendChild(td);
      table.appendChild(tr);
    });
    out.innerHTML = "";
    out.appendChild(table);
  }

  // Boutons de presets sandbox.
  function setupSandboxPresets() {
    const noneBtn = $("sandbox-none");
    const strictBtn = $("sandbox-strict");
    const typBtn = $("sandbox-typical");

    function setActive(btn) {
      [noneBtn, strictBtn, typBtn].forEach((b) => {
        b.classList.remove("btn-primary");
        b.classList.add("btn-ghost");
        b.dataset.active = "0";
      });
      btn.classList.remove("btn-ghost");
      btn.classList.add("btn-primary");
      btn.dataset.active = "1";
    }

    noneBtn.addEventListener("click", () => {
      setActive(noneBtn);
      // décoche tout — l'attribut sandbox sera complètement absent.
      setCheckedValues("sandbox", []);
      updateGenerated();
    });
    strictBtn.addEventListener("click", () => {
      setActive(strictBtn);
      setCheckedValues("sandbox", []);
      updateGenerated();
    });
    typBtn.addEventListener("click", () => {
      setActive(typBtn);
      setCheckedValues("sandbox", ["allow-scripts", "allow-same-origin", "allow-forms"]);
      updateGenerated();
    });

    // Defaut : strict
    setActive(strictBtn);
  }

  document.addEventListener("DOMContentLoaded", () => {
    buildSandboxFlags();
    buildAllowFlags();
    setupSandboxPresets();
    $("parent-origin").textContent = window.location.origin;
    updateGenerated();

    $("url").addEventListener("input", updateGenerated);
    $("referrerpolicy").addEventListener("change", updateGenerated);
    $("loading").addEventListener("change", updateGenerated);
    $("width").addEventListener("input", updateGenerated);
    $("height").addEventListener("input", updateGenerated);

    $("load-btn").addEventListener("click", loadIframe);
    $("reload-btn").addEventListener("click", () => {
      const f = $("preview");
      if (!f || !f.src) { loadIframe(); return; }
      // Re-trigger la même URL.
      const src = f.src;
      f.src = "about:blank";
      setTimeout(() => { f.src = src; }, 30);
    });
    $("open-tab").addEventListener("click", () => {
      const url = $("url").value.trim();
      if (!url) return;
      window.open(url, "_blank", "noopener,noreferrer");
    });
    $("example-btn").addEventListener("click", () => {
      const ex = EXAMPLES[exampleIdx % EXAMPLES.length];
      exampleIdx++;
      $("url").value = ex.url;
      // active le preset "typical" puis applique les drapeaux de l'exemple.
      $("sandbox-typical").click();
      setCheckedValues("sandbox", ex.sandbox || []);
      setCheckedValues("allow", ex.allow || []);
      updateGenerated();
      loadIframe();
      if (ex.hint) {
        // affiche un petit hint dans timing
        $("timing").textContent = ex.hint;
      }
    });

    $("probe-btn").addEventListener("click", probeUrl);

    $("pm-send").addEventListener("click", sendPostMessage);
    $("pm-clear").addEventListener("click", () => {
      $("pm-log").innerHTML =
        '<div class="text-xs text-slate-400 italic">Aucun message reçu pour l\'instant.</div>';
    });

    $("download-html").addEventListener("click", () => {
      ToolExport.downloadStandalone({
        filename: "iframe-simulator.html",
        title: "Iframe Simulator",
      });
    });

    ToolExport.attachActions($("result-section"), () => {
      const url = $("url").value.trim();
      if (!url) return null;
      return {
        title: "Iframe Simulator",
        sections: [
          {
            heading: "Configuration",
            rows: [
              ["URL", url],
              ["Sandbox", $("sandbox-none").dataset.active === "1"
                ? "(attribut absent)"
                : (getCheckedValues("sandbox").join(" ") || "(vide — sandbox stricte)")],
              ["Allow", getCheckedValues("allow").join("; ") || "(aucun)"],
              ["Referrer-Policy", $("referrerpolicy").value || "(défaut)"],
              ["Loading", $("loading").value || "(défaut)"],
              ["Largeur", $("width").value],
              ["Hauteur", $("height").value + "px"],
            ],
          },
          {
            heading: "Balise <iframe>",
            text: buildIframeMarkup(),
          },
          {
            heading: "Statut",
            rows: [
              ["État", $("status").textContent],
              ["Timing", $("timing").textContent || "n/a"],
            ],
          },
        ],
      };
    });
  });
})();
