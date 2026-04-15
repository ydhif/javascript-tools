// Utilitaires partagés : copier, exporter, copier au format Confluence Wiki.
window.ToolExport = (function () {
  function copyText(text) {
    return navigator.clipboard.writeText(text);
  }

  function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Convertit une structure { title, sections: [{heading, rows: [[k,v],...]}] }
  // au format markup wiki Confluence (legacy).
  function toConfluenceWiki(data) {
    let out = "";
    if (data.title) out += "h1. " + data.title + "\n\n";
    (data.sections || []).forEach((s) => {
      if (s.heading) out += "h2. " + s.heading + "\n";
      if (s.text) out += s.text + "\n\n";
      if (s.rows && s.rows.length) {
        out += "|| Champ || Valeur ||\n";
        s.rows.forEach((r) => {
          const k = String(r[0]).replace(/\|/g, "\\|");
          const v = String(r[1] == null ? "" : r[1]).replace(/\|/g, "\\|").replace(/\n/g, " ");
          out += "| " + k + " | " + v + " |\n";
        });
        out += "\n";
      }
    });
    return out.trim();
  }

  function toPlainText(data) {
    let out = "";
    if (data.title) out += data.title + "\n" + "=".repeat(data.title.length) + "\n\n";
    (data.sections || []).forEach((s) => {
      if (s.heading) out += s.heading + "\n" + "-".repeat(s.heading.length) + "\n";
      if (s.text) out += s.text + "\n";
      (s.rows || []).forEach((r) => {
        out += "  " + r[0] + ": " + (r[1] == null ? "" : r[1]) + "\n";
      });
      out += "\n";
    });
    return out.trim();
  }

  function flash(button, message) {
    const original = button.textContent;
    button.textContent = message;
    button.disabled = true;
    setTimeout(() => {
      button.textContent = original;
      button.disabled = false;
    }, 1500);
  }

  // Attache les boutons standards (copier / exporter / wiki) à un container.
  // getData() doit retourner soit une string, soit la structure {title, sections}.
  function attachActions(container, getData) {
    const actions = document.createElement("div");
    actions.className = "flex flex-wrap gap-2 mb-3";

    const mkBtn = (label, cls) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.className =
        "px-3 py-1.5 text-sm rounded font-medium " + cls + " disabled:opacity-50";
      return b;
    };

    const copyBtn = mkBtn("Copier", "bg-blue-600 hover:bg-blue-700 text-white");
    const exportBtn = mkBtn("Exporter (.txt)", "bg-slate-700 hover:bg-slate-800 text-white");
    const wikiBtn = mkBtn("Copier (Confluence Wiki)", "bg-emerald-600 hover:bg-emerald-700 text-white");

    copyBtn.addEventListener("click", async () => {
      const data = getData();
      if (!data) return;
      const text = typeof data === "string" ? data : toPlainText(data);
      await copyText(text);
      flash(copyBtn, "Copié !");
    });

    exportBtn.addEventListener("click", () => {
      const data = getData();
      if (!data) return;
      const text = typeof data === "string" ? data : toPlainText(data);
      downloadFile("export.txt", text);
    });

    wikiBtn.addEventListener("click", async () => {
      const data = getData();
      if (!data) return;
      const text =
        typeof data === "string"
          ? data
          : toConfluenceWiki(data);
      await copyText(text);
      flash(wikiBtn, "Copié (wiki) !");
    });

    actions.appendChild(copyBtn);
    actions.appendChild(exportBtn);
    actions.appendChild(wikiBtn);
    container.prepend(actions);
  }

  // Construit une version autonome (single-file HTML) de la page courante.
  // - Inline automatiquement TOUS les scripts locaux (relatifs) — export.js, menu.js
  //   (pour la barre de recherche) et le script de l'outil.
  // - Conserve les scripts et stylesheets CDN en <script src> / <link>.
  // - Inline toutes les feuilles de style locales.
  // - Retire le registre tools.js et le header inter-outils pour rendre le fichier
  //   autonome (pas de dropdown catégories qui pointerait sur d'autres fichiers).
  async function downloadStandalone({ filename, title }) {
    const htmlText = await (await fetch(window.location.href)).text();
    const doc = new DOMParser().parseFromString(htmlText, "text/html");

    if (title) {
      const t = doc.querySelector("title");
      if (t) t.textContent = title;
    }

    // Supprimer le header (contient la barre de recherche et le menu inter-outils).
    const header = doc.querySelector("header");
    if (header) header.remove();

    // Retirer tools.js et menu.js : ils n'ont plus de sens hors du projet (menu inter-outils).
    doc.querySelectorAll("script[src]").forEach((s) => {
      const src = s.getAttribute("src") || "";
      if (/\/(tools|menu)\.js(\?|$)/.test(src)) s.remove();
    });

    // Inliner TOUTES les feuilles de style locales (chemins relatifs).
    const styleLinks = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'));
    for (const link of styleLinks) {
      const href = link.getAttribute("href") || "";
      if (/^https?:\/\//i.test(href) || /^\/\//.test(href)) continue; // CDN
      try {
        const res = await fetch(href);
        if (!res.ok) continue;
        const css = await res.text();
        const style = doc.createElement("style");
        style.textContent = css;
        link.replaceWith(style);
      } catch (_) {}
    }

    // Inliner TOUS les scripts locaux restants automatiquement.
    // On les déplace à la fin du <body>. Problème : les tools font tous
    // `document.addEventListener("DOMContentLoaded", ...)` pour câbler leurs
    // handlers. Dans le standalone, DCL a déjà été émis au moment où nos
    // scripts inlinés s'exécutent → les listeners ne se déclenchent jamais.
    // Solution : patcher `document.addEventListener` via un shim injecté avant
    // les scripts, pour que tout listener DOMContentLoaded soit exécuté
    // immédiatement si DCL est déjà passé.
    const shim = doc.createElement("script");
    shim.textContent =
      "(function(){if(document.readyState!=='loading'){" +
      "var _origAddEL=document.addEventListener.bind(document);" +
      "document.addEventListener=function(type,listener,opts){" +
      "if(type==='DOMContentLoaded'){try{listener();}catch(e){console.error('[standalone] DCL handler error:',e);}}" +
      "else{_origAddEL(type,listener,opts);}};" +
      "}})();";
    doc.body.appendChild(shim);

    const localScripts = Array.from(doc.querySelectorAll("script[src]")).filter((s) => {
      const src = s.getAttribute("src") || "";
      return !/^https?:\/\//i.test(src) && !/^\/\//.test(src);
    });
    for (const tag of localScripts) {
      const src = tag.getAttribute("src");
      try {
        const res = await fetch(src);
        if (!res.ok) { tag.remove(); continue; }
        const code = await res.text();
        const inline = doc.createElement("script");
        inline.textContent = code;
        tag.remove();
        doc.body.appendChild(inline);
      } catch (_) { tag.remove(); }
    }

    // Injecter une bannière de titre à la place du header retiré.
    const banner = doc.createElement("header");
    banner.className = "bg-slate-900 text-white shadow";
    banner.innerHTML =
      '<div class="max-w-6xl mx-auto px-6 py-5"><h1 class="text-2xl font-bold">' +
      escapeHtml(title || doc.title) +
      " <span class='text-xs font-normal text-slate-400'>(autonome)</span></h1></div>";
    doc.body.insertBefore(banner, doc.body.firstChild);

    const out = "<!DOCTYPE html>\n" + doc.documentElement.outerHTML;
    downloadFile(filename || "tool.html", out, "text/html;charset=utf-8");
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  return {
    copyText,
    downloadFile,
    toConfluenceWiki,
    toPlainText,
    attachActions,
    downloadStandalone,
  };
})();
