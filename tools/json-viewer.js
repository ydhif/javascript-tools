(function () {
  const $ = (id) => document.getElementById(id);
  let currentData = null;
  let currentFilter = "";
  let currentFilterMode = "both";

  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 1200);
  }

  function typeOf(v) {
    if (v === null) return "null";
    if (Array.isArray(v)) return "array";
    return typeof v;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Format path: $.a.b[0].c (ou ["x"] si clé non-identifier)
  function joinPath(base, key, isArrayIndex) {
    if (isArrayIndex) return base + "[" + key + "]";
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)) return base + "." + key;
    return base + '["' + String(key).replace(/"/g, '\\"') + '"]';
  }

  // Détection hints
  function detectHint(v) {
    if (typeof v === "number" && v > 1e9 && v < 1e13) {
      // timestamp unix (s ou ms)
      const ms = v < 1e12 ? v * 1000 : v;
      const d = new Date(ms);
      if (!isNaN(d)) return { label: "📅 " + d.toISOString(), value: d.toISOString() };
    }
    if (typeof v === "string") {
      // ISO date
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) {
        const d = new Date(v);
        if (!isNaN(d)) return { label: "📅 " + d.toLocaleString(), value: d.toLocaleString() };
      }
      // URL
      if (/^https?:\/\//.test(v)) return { label: "🔗 ouvrir", value: v, url: true };
      // JSON imbriqué
      const t = v.trim();
      if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
        try { JSON.parse(t); return { label: "{} parser", value: t, parseJson: true }; } catch (_) {}
      }
      // Base64 (heuristique : longueur > 12, charset, padding)
      if (v.length >= 12 && v.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(v)) {
        try {
          const decoded = atob(v);
          if (/^[\x20-\x7E\s]*$/.test(decoded) && decoded.length > 2) {
            return { label: "🔓 b64: " + decoded.slice(0, 30), value: decoded };
          }
        } catch (_) {}
      }
    }
    return null;
  }

  // Aperçu inline pour nœuds repliés
  function preview(v) {
    const t = typeOf(v);
    if (t === "array") {
      if (v.length === 0) return "[]";
      const items = v.slice(0, 3).map(previewValue).join(", ");
      return "[ " + items + (v.length > 3 ? ", …" : "") + " ]";
    }
    if (t === "object") {
      const keys = Object.keys(v);
      if (keys.length === 0) return "{}";
      const items = keys.slice(0, 3).map(k => k + ": " + previewValue(v[k])).join(", ");
      return "{ " + items + (keys.length > 3 ? ", …" : "") + " }";
    }
    return "";
  }
  function previewValue(v) {
    const t = typeOf(v);
    if (t === "string") return '"' + (v.length > 20 ? v.slice(0, 20) + "…" : v) + '"';
    if (t === "null") return "null";
    if (t === "array") return "[" + v.length + "]";
    if (t === "object") return "{" + Object.keys(v).length + "}";
    return String(v);
  }

  // Test filtre : le nœud matche ou descendance matche
  function nodeMatches(value, key) {
    if (!currentFilter) return { self: false, descendant: false };
    const needle = currentFilter.toLowerCase();
    const mode = currentFilterMode;
    let self = false;
    if ((mode === "key" || mode === "both") && key != null) {
      if (String(key).toLowerCase().includes(needle)) self = true;
    }
    if (!self && (mode === "value" || mode === "both")) {
      const t = typeOf(value);
      if (t !== "object" && t !== "array") {
        if (String(value).toLowerCase().includes(needle)) self = true;
      }
    }
    let descendant = false;
    const t = typeOf(value);
    if (t === "object") {
      for (const k of Object.keys(value)) {
        const r = nodeMatches(value[k], k);
        if (r.self || r.descendant) { descendant = true; break; }
      }
    } else if (t === "array") {
      for (let i = 0; i < value.length; i++) {
        const r = nodeMatches(value[i], i);
        if (r.self || r.descendant) { descendant = true; break; }
      }
    }
    return { self, descendant };
  }

  function highlightMatch(text) {
    if (!currentFilter) return escapeHtml(text);
    const esc = escapeHtml(text);
    const needle = escapeHtml(currentFilter);
    const re = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    return esc.replace(re, m => '<span class="jv-match">' + m + "</span>");
  }

  // Rendu récursif
  function renderNode(value, key, path, isArrayIndex, depth) {
    const t = typeOf(value);
    const isContainer = t === "object" || t === "array";
    const wrap = document.createElement("div");
    wrap.className = "jv-node";

    const row = document.createElement("div");
    row.className = "jv-row";

    const toggle = document.createElement("span");
    toggle.className = "jv-toggle" + (isContainer ? "" : " leaf");
    toggle.textContent = isContainer ? "▸" : "•";
    row.appendChild(toggle);

    if (key !== null) {
      const keyEl = document.createElement("span");
      keyEl.className = "jv-key";
      keyEl.innerHTML = isArrayIndex ? key : '"' + highlightMatch(String(key)) + '"';
      keyEl.title = "Cliquer pour copier le chemin : " + path;
      keyEl.addEventListener("click", (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(path);
        toast("Path copié : " + path);
      });
      row.appendChild(keyEl);
      const colon = document.createElement("span");
      colon.className = "jv-colon";
      colon.textContent = ":";
      row.appendChild(colon);
    }

    if (isContainer) {
      const open = document.createElement("span");
      open.className = "jv-bracket";
      open.textContent = t === "array" ? "[" : "{";
      row.appendChild(open);

      const count = document.createElement("span");
      count.className = "jv-count";
      const n = t === "array" ? value.length : Object.keys(value).length;
      count.textContent = n + (t === "array" ? " items" : " keys");
      row.appendChild(count);

      const prev = document.createElement("span");
      prev.className = "jv-preview";
      prev.textContent = preview(value);
      row.appendChild(prev);

      row.addEventListener("mouseenter", () => { $("path-bar").textContent = path; });

      wrap.appendChild(row);

      const childrenContainer = document.createElement("div");
      childrenContainer.style.display = "none";
      wrap.appendChild(childrenContainer);

      const closeRow = document.createElement("div");
      closeRow.className = "jv-close";
      closeRow.textContent = t === "array" ? "]" : "}";
      closeRow.style.display = "none";
      wrap.appendChild(closeRow);

      let built = false;
      const buildChildren = () => {
        if (built) return;
        built = true;
        if (t === "array") {
          value.forEach((v, i) => {
            const childPath = joinPath(path, i, true);
            const m = nodeMatches(v, i);
            if (currentFilter && !m.self && !m.descendant) return;
            childrenContainer.appendChild(renderNode(v, i, childPath, true, depth + 1));
          });
        } else {
          Object.keys(value).forEach((k) => {
            const childPath = joinPath(path, k, false);
            const m = nodeMatches(value[k], k);
            if (currentFilter && !m.self && !m.descendant) return;
            childrenContainer.appendChild(renderNode(value[k], k, childPath, false, depth + 1));
          });
        }
      };

      const setOpen = (isOpen) => {
        if (isOpen) {
          buildChildren();
          childrenContainer.style.display = "";
          closeRow.style.display = "";
          toggle.textContent = "▾";
          open.textContent = t === "array" ? "[" : "{";
          prev.style.display = "none";
          count.style.display = "none";
        } else {
          childrenContainer.style.display = "none";
          closeRow.style.display = "none";
          toggle.textContent = "▸";
          prev.style.display = "";
          count.style.display = "";
        }
      };

      const clickToggle = (e) => {
        e.stopPropagation();
        const nowOpen = childrenContainer.style.display === "none";
        setOpen(nowOpen);
      };
      toggle.addEventListener("click", clickToggle);
      open.addEventListener("click", clickToggle);

      // Auto-ouvrir si filtre actif et match en descendance, ou peu profond
      const shouldAutoOpen = (currentFilter && nodeMatches(value, key).descendant) || depth < 1;
      if (shouldAutoOpen) setOpen(true);

      wrap._setOpen = setOpen;
    } else {
      const val = document.createElement("span");
      if (t === "string") {
        val.className = "jv-string";
        val.innerHTML = '"' + highlightMatch(value) + '"';
      } else if (t === "number") {
        val.className = "jv-number";
        val.innerHTML = highlightMatch(String(value));
      } else if (t === "boolean") {
        val.className = "jv-boolean";
        val.textContent = String(value);
      } else if (t === "null") {
        val.className = "jv-null";
        val.textContent = "null";
      }
      row.appendChild(val);

      const hint = detectHint(value);
      if (hint) {
        const h = document.createElement("span");
        h.className = "jv-hint";
        h.textContent = hint.label;
        h.title = "Cliquer pour copier / ouvrir";
        h.addEventListener("click", (e) => {
          e.stopPropagation();
          if (hint.url) { window.open(hint.value, "_blank", "noopener"); return; }
          if (hint.parseJson) {
            try {
              currentData = JSON.parse(hint.value);
              renderTree();
              toast("JSON imbriqué chargé");
              return;
            } catch (_) {}
          }
          navigator.clipboard.writeText(hint.value);
          toast("Copié : " + hint.value.slice(0, 40));
        });
        row.appendChild(h);
      }

      row.addEventListener("mouseenter", () => { $("path-bar").textContent = path; });
      wrap.appendChild(row);
    }

    return wrap;
  }

  function countNodes(v) {
    const t = typeOf(v);
    if (t === "array") return 1 + v.reduce((a, x) => a + countNodes(x), 0);
    if (t === "object") return 1 + Object.values(v).reduce((a, x) => a + countNodes(x), 0);
    return 1;
  }

  function renderTree() {
    const tree = $("tree");
    tree.innerHTML = "";
    if (currentData === null || currentData === undefined) return;
    tree.appendChild(renderNode(currentData, null, "$", false, 0));
    $("stats").textContent =
      countNodes(currentData) + " nœuds · " +
      JSON.stringify(currentData).length + " caractères";
  }

  function setAllOpen(open) {
    const walk = (el) => {
      if (el._setOpen) el._setOpen(open);
      Array.from(el.children).forEach(walk);
    };
    Array.from($("tree").children).forEach(walk);
  }

  function parse() {
    const raw = $("json-input").value.trim();
    const status = $("parse-status");
    if (!raw) {
      status.textContent = "Entrée vide.";
      status.className = "text-sm text-slate-500";
      return;
    }
    try {
      currentData = JSON.parse(raw);
      status.textContent = "✓ JSON valide";
      status.className = "text-sm text-emerald-700 font-medium";
      renderTree();
    } catch (e) {
      status.textContent = "✗ " + e.message;
      status.className = "text-sm text-red-700 font-medium";
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("parse-btn").addEventListener("click", parse);
    $("example-btn").addEventListener("click", () => {
      const example = {
        id: "7f9e3b2a-1234-4567-89ab-cdef01234567",
        createdAt: 1704067200,
        user: {
          name: "Alice Martin",
          email: "alice@example.com",
          profileUrl: "https://example.com/users/alice",
          token: btoa("secret-session-token-value"),
          settings: {
            theme: "dark",
            notifications: true,
            language: "fr"
          }
        },
        roles: ["admin", "editor", "viewer"],
        stats: { logins: 142, lastIp: "10.0.0.1", active: true },
        nested: '{"hidden":"this is JSON inside a string","n":42}',
        metadata: null
      };
      $("json-input").value = JSON.stringify(example, null, 2);
      parse();
    });
    $("pretty-btn").addEventListener("click", () => {
      try {
        const obj = JSON.parse($("json-input").value);
        $("json-input").value = JSON.stringify(obj, null, 2);
      } catch (_) {}
    });
    $("minify-btn").addEventListener("click", () => {
      try {
        const obj = JSON.parse($("json-input").value);
        $("json-input").value = JSON.stringify(obj);
      } catch (_) {}
    });
    $("expand-all").addEventListener("click", () => setAllOpen(true));
    $("collapse-all").addEventListener("click", () => setAllOpen(false));

    let filterTimer;
    const onFilter = () => {
      clearTimeout(filterTimer);
      filterTimer = setTimeout(() => {
        currentFilter = $("filter-input").value.trim();
        currentFilterMode = $("filter-mode").value;
        renderTree();
      }, 150);
    };
    $("filter-input").addEventListener("input", onFilter);
    $("filter-mode").addEventListener("change", onFilter);

    $("download-html").addEventListener("click", () => {
      ToolExport.downloadStandalone({
        filename: "json-viewer.html",
        title: "JSON Viewer",
        inlineScripts: ["./json-viewer.js"],
      });
    });

    // Actions copier / exporter / wiki sur le JSON courant
    ToolExport.attachActions($("tree").parentElement, () => {
      if (currentData === null) return null;
      return JSON.stringify(currentData, null, 2);
    });
  });
})();
