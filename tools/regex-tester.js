(function () {
  const $ = (id) => document.getElementById(id);

  const PRESETS = [
    { name: "Email", desc: "RFC 5322 simplifié", pattern: "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}", flags: "g" },
    { name: "URL http(s)", desc: "protocole + host + path", pattern: "https?://[\\w.-]+(?:\\:\\d+)?(?:/[\\w./?&=%#-]*)?", flags: "g" },
    { name: "UUID v4", desc: "format 8-4-4-4-12", pattern: "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}", flags: "gi" },
    { name: "IPv4", desc: "adresse IP stricte", pattern: "\\b(?:(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.){3}(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\b", flags: "g" },
    { name: "IPv6", desc: "adresse IP v6", pattern: "(?:[A-F0-9]{1,4}:){7}[A-F0-9]{1,4}", flags: "gi" },
    { name: "Date ISO 8601", desc: "YYYY-MM-DDTHH:MM:SS", pattern: "\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})?", flags: "g" },
    { name: "Date FR", desc: "DD/MM/YYYY", pattern: "\\b(0[1-9]|[12]\\d|3[01])/(0[1-9]|1[0-2])/\\d{4}\\b", flags: "g" },
    { name: "Heure HH:MM", desc: "24h", pattern: "\\b(?:[01]\\d|2[0-3]):[0-5]\\d\\b", flags: "g" },
    { name: "Hex color", desc: "#fff ou #ffffff", pattern: "#(?:[0-9a-f]{3}|[0-9a-f]{6})\\b", flags: "gi" },
    { name: "JWT", desc: "header.payload.sig", pattern: "eyJ[A-Za-z0-9_-]+\\.eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]*", flags: "g" },
    { name: "Slug URL", desc: "lowercase + tirets", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$", flags: "" },
    { name: "Mot de passe fort", desc: "8+ maj/min/chiffre/spé", pattern: "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^\\w\\s]).{8,}$", flags: "" },
    { name: "Téléphone FR", desc: "0X XX XX XX XX", pattern: "\\b0[1-9](?:[ .-]?\\d{2}){4}\\b", flags: "g" },
    { name: "Code postal FR", desc: "5 chiffres", pattern: "\\b\\d{5}\\b", flags: "g" },
    { name: "MAC address", desc: "XX:XX:XX:XX:XX:XX", pattern: "\\b[0-9A-F]{2}(?::[0-9A-F]{2}){5}\\b", flags: "gi" },
    { name: "Commentaire //", desc: "ligne JS/C", pattern: "//.*$", flags: "gm" },
    { name: "Commentaire /* */", desc: "bloc multi-ligne", pattern: "/\\*[\\s\\S]*?\\*/", flags: "g" },
    { name: "HTML tag", desc: "balise + attributs", pattern: "<([a-zA-Z][a-zA-Z0-9]*)\\b[^>]*>(.*?)</\\1>", flags: "gs" },
  ];

  const EXAMPLE_TEXT = `Contacts :
- Alice Martin <alice.martin@example.com> 01 23 45 67 89
- Bob Dupont <bob@contoso.fr> +33 6 12 34 56 78
- Charlie Durand <charlie.d@ACME.io> 09.87.65.43.21

Serveurs :
  api.example.com → 192.168.1.10:8080
  auth.example.com → 10.0.0.42:443
  db-primary → 172.16.5.1:5432

Identifiants :
  userId = 7f9e3b2a-1234-4cd7-89ab-cdef01234567
  session = eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhbGljZSJ9.abc123
  created = 2026-04-15T14:30:00Z

Couleurs : #fef08a #4f46e5 #22c55e #0f172a`;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function buildRegex() {
    const pattern = $("pattern").value;
    const flags = $("flags-input").value;
    if (!pattern) return { regex: null, error: null };
    try {
      return { regex: new RegExp(pattern, flags), error: null };
    } catch (e) {
      return { regex: null, error: e.message };
    }
  }

  function syncFlagToggles() {
    const flags = $("flags-input").value;
    document.querySelectorAll(".rx-flag").forEach((el) => {
      el.classList.toggle("active", flags.includes(el.dataset.flag));
    });
  }

  function toggleFlag(flag) {
    const input = $("flags-input");
    let v = input.value;
    if (v.includes(flag)) v = v.replace(flag, "");
    else v = v + flag;
    input.value = v;
    syncFlagToggles();
    run();
  }

  function findMatches(regex, text) {
    if (!regex) return [];
    const matches = [];
    // Forcer un clone global pour matchAll si flag g présent, sinon on ne prend que le premier
    if (regex.global) {
      for (const m of text.matchAll(regex)) {
        matches.push({ index: m.index, match: m[0], groups: m.slice(1), named: m.groups || {} });
        if (m[0].length === 0) break; // évite la boucle infinie sur /()/g
        if (matches.length > 2000) break; // garde-fou
      }
    } else {
      const m = regex.exec(text);
      if (m) matches.push({ index: m.index, match: m[0], groups: m.slice(1), named: m.groups || {} });
    }
    return matches;
  }

  function renderHighlight(text, matches) {
    const el = $("highlight");
    if (!text) { el.textContent = "(vide)"; return; }
    if (!matches.length) { el.textContent = text; return; }
    // Trie les matches par index (matchAll les retourne déjà triés)
    let out = "";
    let pos = 0;
    matches.forEach((m, i) => {
      if (m.index > pos) out += escapeHtml(text.slice(pos, m.index));
      out += '<span class="rx-match" data-match="' + i + '">' + escapeHtml(m.match) + '</span>';
      pos = m.index + m.match.length;
    });
    if (pos < text.length) out += escapeHtml(text.slice(pos));
    el.innerHTML = out;
  }

  function renderMatchList(matches) {
    const box = $("match-list");
    box.innerHTML = "";
    if (!matches.length) return;
    matches.forEach((m, i) => {
      const card = document.createElement("div");
      card.className = "rx-match-card";

      const header = document.createElement("div");
      header.className = "rx-match-header";
      header.innerHTML =
        '<span class="rx-match-idx">#' + i + "</span>" +
        '<span class="rx-match-text">' + escapeHtml(m.match) + "</span>" +
        '<span class="text-slate-400 text-xs">index ' + m.index + " · length " + m.match.length + "</span>";
      card.appendChild(header);

      if (m.groups.length || Object.keys(m.named).length) {
        const grp = document.createElement("div");
        grp.className = "rx-group";
        // Groupes numérotés
        m.groups.forEach((g, idx) => {
          const label = document.createElement("span");
          label.textContent = "$" + (idx + 1);
          const val = document.createElement("span");
          val.textContent = g === undefined ? "(undefined)" : g;
          grp.appendChild(label);
          grp.appendChild(val);
        });
        // Groupes nommés
        Object.entries(m.named).forEach(([name, val]) => {
          const label = document.createElement("span");
          label.className = "rx-group-name";
          label.textContent = "$<" + name + ">";
          const v = document.createElement("span");
          v.textContent = val === undefined ? "(undefined)" : val;
          grp.appendChild(label);
          grp.appendChild(v);
        });
        card.appendChild(grp);
      }
      box.appendChild(card);
    });
  }

  function updateStats(regex, error, matches) {
    const el = $("stats");
    if (error) {
      el.textContent = "✗ " + error;
      el.className = "rx-stats rx-stats-err";
      return;
    }
    if (!regex) {
      el.textContent = "Aucun pattern";
      el.className = "rx-stats rx-stats-none";
      return;
    }
    if (!matches.length) {
      el.textContent = "0 match";
      el.className = "rx-stats rx-stats-none";
      return;
    }
    el.textContent = "✓ " + matches.length + " match" + (matches.length > 1 ? "es" : "");
    el.className = "rx-stats rx-stats-ok";
  }

  function updateReplace(regex, text, error) {
    const out = $("replace-output");
    const replacement = $("replace-input").value;
    if (error || !regex) { out.textContent = text; return; }
    try {
      const result = text.replace(regex, replacement);
      out.textContent = result;
    } catch (e) {
      out.textContent = "Erreur replace : " + e.message;
    }
  }

  function updateExport(pattern, flags) {
    const out = $("export-out");
    if (!pattern) { out.textContent = "Tape un pattern pour voir son export…"; return; }
    const p = pattern;
    const escJs = p.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const escPy = p.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const escGo = p.replace(/\\/g, "\\\\").replace(/`/g, "\\`");
    const lines = [
      "// JavaScript",
      "const re = /" + p + "/" + flags + ";",
      "text.match(re);",
      "",
      "# Python",
      (flags.includes("i") || flags.includes("m") || flags.includes("s"))
        ? "import re\nflags = " + [
            flags.includes("i") ? "re.IGNORECASE" : null,
            flags.includes("m") ? "re.MULTILINE" : null,
            flags.includes("s") ? "re.DOTALL" : null,
          ].filter(Boolean).join(" | ") + "\nre.findall(r'" + escPy + "', text, flags)"
        : "import re\nre.findall(r'" + escPy + "', text)",
      "",
      "// Java",
      'Pattern p = Pattern.compile("' + escJs + '"' +
        (flags.includes("i") || flags.includes("m") || flags.includes("s")
          ? ", " + [
              flags.includes("i") ? "Pattern.CASE_INSENSITIVE" : null,
              flags.includes("m") ? "Pattern.MULTILINE" : null,
              flags.includes("s") ? "Pattern.DOTALL" : null,
            ].filter(Boolean).join(" | ")
          : "") + ");",
      "Matcher m = p.matcher(text);",
      "",
      "// Go",
      "re := regexp.MustCompile(`" + escGo + "`)",
      "re.FindAllString(text, -1)",
      "",
      "# PHP",
      "preg_match_all('/" + p.replace(/\//g, "\\/") + "/" + flags + "', $text, $matches);",
    ];
    out.textContent = lines.join("\n");
  }

  function run() {
    const { regex, error } = buildRegex();
    const text = $("test-input").value;
    const matches = findMatches(regex, text);
    updateStats(regex, error, matches);
    renderHighlight(text, matches);
    renderMatchList(matches);
    updateReplace(regex, text, error);
    updateExport($("pattern").value, $("flags-input").value);
  }

  function renderPresets() {
    const grid = $("preset-grid");
    PRESETS.forEach((p) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "rx-preset";
      btn.innerHTML =
        '<span class="rx-preset-name">' + escapeHtml(p.name) + "</span>" +
        '<span class="rx-preset-desc">' + escapeHtml(p.desc) + "</span>";
      btn.addEventListener("click", () => {
        $("pattern").value = p.pattern;
        $("flags-input").value = p.flags;
        syncFlagToggles();
        if (!$("test-input").value) $("test-input").value = EXAMPLE_TEXT;
        run();
      });
      grid.appendChild(btn);
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    renderPresets();

    $("pattern").addEventListener("input", run);
    $("flags-input").addEventListener("input", () => { syncFlagToggles(); run(); });
    $("test-input").addEventListener("input", run);
    $("replace-input").addEventListener("input", run);

    document.querySelectorAll(".rx-flag").forEach((el) => {
      el.addEventListener("click", () => toggleFlag(el.dataset.flag));
    });

    $("example-btn").addEventListener("click", () => {
      $("pattern").value = "(?<user>[\\w.+-]+)@(?<domain>[\\w.-]+\\.[a-z]{2,})";
      $("flags-input").value = "gi";
      syncFlagToggles();
      $("test-input").value = EXAMPLE_TEXT;
      run();
    });

    $("download-html").addEventListener("click", () => {
      ToolExport.downloadStandalone({
        filename: "regex-tester.html",
        title: "Regex Tester",
        inlineScripts: ["./regex-tester.js"],
      });
    });

    ToolExport.attachActions(document.querySelector("#match-list").parentElement, () => {
      const p = $("pattern").value;
      const f = $("flags-input").value;
      const t = $("test-input").value;
      if (!p) return null;
      return "Pattern: /" + p + "/" + f + "\n\nTexte:\n" + t +
             "\n\nRésultat:\n" + $("replace-output").textContent;
    });

    syncFlagToggles();
    run();
  });
})();
