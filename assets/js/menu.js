(function () {
  const tools = window.TOOLS || [];
  const categories = window.TOOL_CATEGORIES || [];

  // ---------- Inject search bar into header (toutes les pages) ----------
  injectHeaderSearch();

  // ---------- Top nav ----------
  const topMenu = document.getElementById("top-menu");
  if (topMenu) {
    topMenu.classList.add("nav-root");

    const homeLink = document.createElement("a");
    homeLink.href = resolveBase() + "index.html";
    homeLink.textContent = "Accueil";
    homeLink.className = "nav-link";
    topMenu.appendChild(homeLink);

    categories.forEach((cat) => {
      const toolsInCat = tools.filter((t) => t.category === cat);
      if (!toolsInCat.length) return;

      const wrap = document.createElement("div");
      wrap.className = "nav-dropdown";

      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "nav-link nav-trigger";
      trigger.innerHTML = escapeHtml(cat) + ' <span class="nav-caret">▾</span>';
      wrap.appendChild(trigger);

      const panel = document.createElement("div");
      panel.className = "nav-panel";
      toolsInCat.forEach((t) => {
        const a = document.createElement("a");
        a.href = resolveBase() + t.href.replace(/^\.\//, "");
        a.className = "nav-item";
        a.innerHTML =
          '<span class="nav-item-name">' + escapeHtml(t.name) + "</span>" +
          '<span class="nav-item-desc">' + escapeHtml(shorten(t.description, 85)) + "</span>";
        panel.appendChild(a);
      });
      wrap.appendChild(panel);

      trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        const wasOpen = wrap.classList.contains("open");
        document.querySelectorAll(".nav-dropdown.open").forEach((d) => d.classList.remove("open"));
        if (!wasOpen) wrap.classList.add("open");
      });

      topMenu.appendChild(wrap);
    });

    document.addEventListener("click", () => {
      document.querySelectorAll(".nav-dropdown.open").forEach((d) => d.classList.remove("open"));
    });
  }

  // ---------- Homepage grid ----------
  const grid = document.getElementById("tools-grid");
  const emptyMsg = document.getElementById("tools-empty");
  const searchInput = document.getElementById("tools-search");

  function renderGrid(query) {
    if (!grid) return;
    const q = (query || "").trim().toLowerCase();
    grid.innerHTML = "";
    let shown = 0;

    categories.forEach((cat) => {
      const toolsInCat = tools
        .filter((t) => t.category === cat)
        .filter((t) => {
          if (!q) return true;
          return (
            t.name.toLowerCase().includes(q) ||
            t.description.toLowerCase().includes(q) ||
            (t.category || "").toLowerCase().includes(q)
          );
        });
      if (!toolsInCat.length) return;

      const header = document.createElement("h3");
      header.className = "tools-cat-title";
      header.textContent = cat;
      grid.appendChild(header);

      const row = document.createElement("div");
      row.className = "tools-cat-row";
      toolsInCat.forEach((t) => {
        const card = document.createElement("a");
        card.href = t.href;
        card.className = "tool-card";
        card.innerHTML =
          "<h3>" + highlight(t.name, q) + "</h3>" +
          "<p>" + highlight(t.description, q) + "</p>" +
          '<span class="arrow">Ouvrir l\'outil →</span>';
        row.appendChild(card);
        shown++;
      });
      grid.appendChild(row);
    });

    if (emptyMsg) emptyMsg.classList.toggle("hidden", shown > 0);
  }

  if (grid) renderGrid("");

  const resultsEl = document.getElementById("tools-search-results");

  function renderResultsDropdown(query) {
    if (!resultsEl) return;
    const q = (query || "").trim().toLowerCase();
    if (!q) { resultsEl.classList.add("hidden"); resultsEl.innerHTML = ""; return; }
    const matches = tools.filter((t) =>
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      (t.category || "").toLowerCase().includes(q)
    ).slice(0, 8);
    if (!matches.length) {
      resultsEl.innerHTML = '<div class="tools-search-empty">Aucun résultat</div>';
      resultsEl.classList.remove("hidden");
      return;
    }
    resultsEl.innerHTML = matches.map((t) =>
      '<a class="tools-search-item" href="' + resolveBase() + t.href.replace(/^\.\//, "") + '">' +
        '<span class="tools-search-cat">' + escapeHtml(t.category || "") + '</span>' +
        '<span class="tools-search-name">' + highlight(t.name, q) + '</span>' +
        '<span class="tools-search-desc">' + highlight(shorten(t.description, 110), q) + '</span>' +
      '</a>'
    ).join("");
    resultsEl.classList.remove("hidden");
  }

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const v = e.target.value;
      if (grid) renderGrid(v);
      else renderResultsDropdown(v);
    });
    searchInput.addEventListener("focus", () => {
      if (!grid && searchInput.value) renderResultsDropdown(searchInput.value);
    });
    document.addEventListener("click", (e) => {
      if (resultsEl && !resultsEl.parentElement.contains(e.target)) {
        resultsEl.classList.add("hidden");
      }
    });

    // Raccourci clavier : "/" focus la barre, Escape nettoie
    document.addEventListener("keydown", (e) => {
      if (e.key === "/" && document.activeElement !== searchInput) {
        const tag = (document.activeElement && document.activeElement.tagName) || "";
        if (tag !== "INPUT" && tag !== "TEXTAREA") {
          e.preventDefault();
          searchInput.focus();
        }
      }
      if (e.key === "Escape" && document.activeElement === searchInput) {
        searchInput.value = "";
        if (grid) renderGrid("");
        if (resultsEl) { resultsEl.classList.add("hidden"); resultsEl.innerHTML = ""; }
        searchInput.blur();
      }
    });
  }

  function resolveBase() {
    return window.location.pathname.includes("/tools/") ? "../" : "./";
  }

  function injectHeaderSearch() {
    const headerRow = document.querySelector(".app-header > div");
    if (!headerRow) return;
    if (headerRow.querySelector("#tools-search")) return;

    // Assure un layout flex avec gap qui tolère l'ajout au milieu
    headerRow.classList.remove("justify-between");
    headerRow.classList.add("gap-5");

    const brand = headerRow.querySelector(".brand");
    const nav = headerRow.querySelector("#top-menu");
    if (brand) brand.classList.add("flex-shrink-0");
    if (nav) nav.classList.add("flex-shrink-0");

    const wrap = document.createElement("div");
    wrap.className = "tools-search-wrap tools-search-header flex-1";
    wrap.innerHTML =
      '<svg class="tools-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
        '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>' +
      '</svg>' +
      '<input id="tools-search" type="search" class="tools-search" placeholder="Rechercher un outil…" autocomplete="off" />' +
      '<kbd class="tools-search-kbd">/</kbd>' +
      '<div id="tools-search-results" class="tools-search-results hidden"></div>';

    if (nav) headerRow.insertBefore(wrap, nav);
    else headerRow.appendChild(wrap);
  }

  function shorten(s, n) {
    if (!s) return "";
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }

  function highlight(text, q) {
    const esc = escapeHtml(text);
    if (!q) return esc;
    const qEsc = escapeHtml(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return esc.replace(new RegExp(qEsc, "gi"), (m) => '<span class="tools-match">' + m + "</span>");
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));
  }
})();
