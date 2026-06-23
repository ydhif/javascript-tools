(function () {
  const $ = (id) => document.getElementById(id);

  let lastRows = null; // { headers: [...]|null, body: [[...], ...] }

  function setStatus(msg, kind) {
    const el = $("status");
    el.textContent = msg;
    el.className = "text-sm " +
      (kind === "err" ? "text-red-700 font-medium" :
       kind === "ok"  ? "text-emerald-700 font-medium" :
                        "text-slate-600");
  }

  // Détecte le séparateur le plus probable sur la première ligne non vide.
  function detectDelimiter(lines) {
    const candidates = ["\t", ";", ",", "|"];
    const sample = lines.find((l) => l.trim().length) || "";
    let best = "\t", bestCount = -1;
    candidates.forEach((d) => {
      const count = sample.split(d).length - 1;
      if (count > bestCount) { bestCount = count; best = d; }
    });
    return bestCount > 0 ? best : "\t";
  }

  function parse(raw, delimOpt, trim) {
    // Normalise les fins de ligne, retire une éventuelle ligne vide finale.
    const lines = raw.replace(/\r\n?/g, "\n").split("\n");
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    if (!lines.length) return null;

    let delim;
    if (delimOpt === "auto") delim = detectDelimiter(lines);
    else if (delimOpt === "\\t") delim = "\t";
    else delim = delimOpt;

    const rows = lines.map((line) => {
      const cells = line.split(delim);
      return trim ? cells.map((c) => c.trim()) : cells;
    });

    // Largeur = nombre max de colonnes ; on complète les lignes plus courtes.
    const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
    rows.forEach((r) => { while (r.length < width) r.push(""); });

    return { rows, width, delim };
  }

  function escapeWiki(s) {
    return String(s == null ? "" : s)
      .replace(/\|/g, "\\|")
      .replace(/\n/g, " ");
  }

  function buildWiki(headers, body) {
    let out = "";
    if (headers) {
      out += "|| " + headers.map(escapeWiki).join(" || ") + " ||\n";
    }
    body.forEach((r) => {
      out += "| " + r.map((c) => {
        const v = escapeWiki(c);
        return v === "" ? " " : v;
      }).join(" | ") + " |\n";
    });
    return out.replace(/\n$/, "");
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function buildHtmlTable(headers, body) {
    let out = "<table><tbody>";
    if (headers) {
      out += "<tr>" + headers.map((h) => "<th>" + escapeHtml(h) + "</th>").join("") + "</tr>";
    }
    body.forEach((r) => {
      out += "<tr>" + r.map((c) => "<td>" + escapeHtml(c) + "</td>").join("") + "</tr>";
    });
    out += "</tbody></table>";
    return out;
  }

  function renderPreview(headers, body) {
    const table = $("preview-table");
    table.innerHTML = "";
    if (headers) {
      const thead = document.createElement("thead");
      const tr = document.createElement("tr");
      headers.forEach((h) => {
        const th = document.createElement("th");
        th.textContent = h;
        tr.appendChild(th);
      });
      thead.appendChild(tr);
      table.appendChild(thead);
    }
    const tbody = document.createElement("tbody");
    body.forEach((r) => {
      const tr = document.createElement("tr");
      r.forEach((c) => {
        const td = document.createElement("td");
        td.textContent = c;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
  }

  function doConvert() {
    const raw = $("sql-input").value;
    if (!raw.trim()) {
      setStatus("Rien à convertir.", "err");
      return;
    }

    const parsed = parse(raw, $("delimiter").value, $("trim-cells").checked);
    if (!parsed || !parsed.rows.length) {
      setStatus("Aucune ligne détectée.", "err");
      return;
    }

    let headers = null;
    let body = parsed.rows;
    if ($("has-header").checked) {
      headers = parsed.rows[0];
      body = parsed.rows.slice(1);
    }

    lastRows = { headers, body };

    $("output-section").classList.remove("hidden");
    $("wiki-out").textContent = buildWiki(headers, body);
    renderPreview(headers, body);

    const statsEl = $("stats");
    statsEl.innerHTML = "";
    [
      ["Colonnes", parsed.width],
      ["Lignes de données", body.length],
      ["En-têtes", headers ? "oui" : "non"],
      ["Séparateur", parsed.delim === "\t" ? "tabulation" : "« " + parsed.delim + " »"],
    ].forEach(([label, value]) => {
      const span = document.createElement("span");
      span.className = "cf-stat";
      span.textContent = label + " : " + value;
      statsEl.appendChild(span);
    });

    setStatus("Converti", "ok");
  }

  function flash(btn, msg) {
    const original = btn.textContent;
    btn.textContent = msg;
    btn.disabled = true;
    setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 1500);
  }

  async function copyHtmlTable(btn) {
    if (!lastRows) return;
    const html = buildHtmlTable(lastRows.headers, lastRows.body);
    // Texte de repli = markup wiki (utile si l'éditeur ne gère pas le HTML).
    const plain = buildWiki(lastRows.headers, lastRows.body);
    try {
      if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([plain], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(plain);
      }
      flash(btn, "Copié !");
    } catch (e) {
      setStatus("Copie HTML impossible : " + e.message, "err");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("convert-btn").addEventListener("click", doConvert);

    $("example-btn").addEventListener("click", () => {
      $("sql-input").value =
        "ID\tNAME\tEMAIL\tCREATED_AT\n" +
        "1\tAlice Martin\talice@example.com\t2026-01-12\n" +
        "2\tBob Durand\tbob@example.com\t2026-02-03\n" +
        "3\tChloé N'Guyen\tchloe@example.com\t2026-03-21";
      $("delimiter").value = "\\t";
      $("has-header").checked = true;
      doConvert();
    });

    $("copy-wiki").addEventListener("click", async (e) => {
      const text = $("wiki-out").textContent;
      if (!text) return;
      await ToolExport.copyText(text);
      flash(e.currentTarget, "Copié !");
    });

    $("copy-html").addEventListener("click", (e) => copyHtmlTable(e.currentTarget));

    $("download-html").addEventListener("click", () => {
      ToolExport.downloadStandalone({
        filename: "sql-confluence.html",
        title: "SQL → Confluence",
      });
    });
  });
})();
