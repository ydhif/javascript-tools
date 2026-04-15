(function () {
  const tools = window.TOOLS || [];

  const topMenu = document.getElementById("top-menu");
  if (topMenu) {
    const homeLink = document.createElement("a");
    homeLink.href = resolveBase() + "index.html";
    homeLink.textContent = "Accueil";
    homeLink.className = "hover:text-amber-300";
    topMenu.appendChild(homeLink);

    tools.forEach((t) => {
      const a = document.createElement("a");
      a.href = resolveBase() + t.href.replace(/^\.\//, "");
      a.textContent = t.name;
      a.className = "hover:text-amber-300";
      topMenu.appendChild(a);
    });
  }

  const grid = document.getElementById("tools-grid");
  if (grid) {
    tools.forEach((t) => {
      const card = document.createElement("a");
      card.href = t.href;
      card.className = "tool-card";
      card.innerHTML =
        "<h3>" + escapeHtml(t.name) + "</h3>" +
        "<p>" + escapeHtml(t.description) + "</p>" +
        '<span class="arrow">Ouvrir l\'outil →</span>';
      grid.appendChild(card);
    });
  }

  function resolveBase() {
    const path = window.location.pathname;
    if (path.includes("/tools/")) return "../";
    return "./";
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
