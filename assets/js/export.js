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
  // - Inline les scripts locaux (relatifs) listés dans `inlineScripts`.
  // - Conserve les scripts CDN en <script src>.
  // - Supprime la navigation inter-outils (header/menu) pour rendre le fichier indépendant.
  async function downloadStandalone({ filename, inlineScripts, title }) {
    const htmlText = await (await fetch(window.location.href)).text();
    const doc = new DOMParser().parseFromString(htmlText, "text/html");

    if (title) {
      const t = doc.querySelector("title");
      if (t) t.textContent = title;
    }

    // Supprimer le header (contient le menu inter-outils).
    const header = doc.querySelector("header");
    if (header) header.remove();

    // Retirer les scripts qui construisent le menu / registre.
    doc.querySelectorAll("script[src]").forEach((s) => {
      const src = s.getAttribute("src") || "";
      if (src.includes("tools.js") || src.includes("menu.js")) {
        s.remove();
      }
    });

    // Inliner les feuilles de style locales (chemins relatifs).
    const styleLinks = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'));
    for (const link of styleLinks) {
      const href = link.getAttribute("href") || "";
      if (/^https?:/.test(href)) continue; // on conserve les CDN
      try {
        const css = await (await fetch(href)).text();
        const style = doc.createElement("style");
        style.textContent = css;
        link.replaceWith(style);
      } catch (_) {}
    }

    // Inliner les scripts locaux demandés.
    for (const path of inlineScripts || []) {
      const res = await fetch(path);
      const code = await res.text();
      const tag = Array.from(doc.querySelectorAll("script[src]")).find((s) =>
        (s.getAttribute("src") || "").endsWith(path.split("/").pop())
      );
      const inline = doc.createElement("script");
      inline.textContent = code;
      if (tag) {
        tag.replaceWith(inline);
      } else {
        doc.body.appendChild(inline);
      }
    }

    // Injecter une bannière de titre à la place du header retiré.
    const banner = doc.createElement("header");
    banner.className = "bg-slate-900 text-white shadow";
    banner.innerHTML =
      '<div class="max-w-6xl mx-auto px-6 py-5"><h1 class="text-2xl font-bold">' +
      (title || doc.title) +
      " <span class='text-xs font-normal text-slate-400'>(autonome)</span></h1></div>";
    doc.body.insertBefore(banner, doc.body.firstChild);

    const out =
      "<!DOCTYPE html>\n" + doc.documentElement.outerHTML;
    downloadFile(filename || "tool.html", out, "text/html;charset=utf-8");
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
