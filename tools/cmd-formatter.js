(function () {
  const $ = (id) => document.getElementById(id);

  // Tokenise une commande shell en respectant les quotes (simple, double) et les escapes.
  function tokenize(cmd) {
    const tokens = [];
    let i = 0;
    const len = cmd.length;

    while (i < len) {
      // Skip whitespace
      if (/\s/.test(cmd[i])) { i++; continue; }

      let tok = "";
      while (i < len && !/\s/.test(cmd[i])) {
        const ch = cmd[i];
        if (ch === "\\") {
          // Escaped char — take both
          tok += cmd[i] + (cmd[i + 1] || "");
          i += 2;
        } else if (ch === "'" || ch === '"') {
          // Quoted string — consume until matching close
          const quote = ch;
          tok += ch;
          i++;
          while (i < len && cmd[i] !== quote) {
            if (cmd[i] === "\\" && quote === '"') {
              tok += cmd[i] + (cmd[i + 1] || "");
              i += 2;
            } else {
              tok += cmd[i];
              i++;
            }
          }
          if (i < len) { tok += cmd[i]; i++; } // closing quote
        } else {
          tok += ch;
          i++;
        }
      }
      if (tok) tokens.push(tok);
    }
    return tokens;
  }

  // Normalise une commande multi-lignes (backslash continuation) en une seule ligne.
  function normalize(raw) {
    return raw.replace(/\\\r?\n\s*/g, " ").replace(/\s+/g, " ").trim();
  }

  function formatCommand(raw, maxWidth, indent) {
    const oneliner = normalize(raw);
    if (!oneliner) return null;

    // Si déjà sous la limite, pas besoin de split
    if (oneliner.length <= maxWidth) {
      return { formatted: oneliner, lines: 1, maxLine: oneliner.length, original: oneliner.length };
    }

    const tokens = tokenize(oneliner);
    if (!tokens.length) return null;

    const lines = [];
    let current = tokens[0]; // La commande elle-même (premier token)

    for (let t = 1; t < tokens.length; t++) {
      const tok = tokens[t];
      // +3 pour " \" en fin de ligne si on continue
      const projected = current + " " + tok;
      if (projected.length + 2 <= maxWidth) {
        // +2 pour le " \" de continuation
        current = projected;
      } else {
        lines.push(current);
        current = indent + tok;
      }
    }
    lines.push(current); // Dernière ligne, pas de backslash

    const formatted = lines.join(" \\\n");
    const maxLine = Math.max(...lines.map((l, i) => i < lines.length - 1 ? l.length + 2 : l.length));

    return { formatted, lines: lines.length, maxLine, original: oneliner.length };
  }

  function setStatus(msg, kind) {
    const el = $("status");
    el.textContent = msg;
    el.className = "text-sm " +
      (kind === "err" ? "text-red-700 font-medium" :
       kind === "ok"  ? "text-emerald-700 font-medium" :
                        "text-slate-600");
  }

  function addCopyButton(preId) {
    const pre = $(preId);
    const wrapper = pre.parentElement;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Copier";
    btn.className = "ch-copy-btn px-3 py-1 text-xs rounded font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 mb-2";
    btn.addEventListener("click", async () => {
      const text = pre.textContent;
      if (!text) return;
      await ToolExport.copyText(text);
      btn.textContent = "Copié !";
      btn.disabled = true;
      setTimeout(() => { btn.textContent = "Copier"; btn.disabled = false; }, 1500);
    });
    wrapper.insertBefore(btn, pre);
  }

  function doFormat() {
    const raw = $("cmd-input").value;
    if (!raw.trim()) {
      setStatus("Commande vide.", "err");
      return;
    }

    const maxWidth = Math.max(40, parseInt($("max-width").value, 10) || 200);
    const indentVal = $("indent-style").value;
    const indent = indentVal === "tab" ? "\t" : " ".repeat(parseInt(indentVal, 10));

    const result = formatCommand(raw, maxWidth, indent);
    if (!result) {
      setStatus("Impossible de parser la commande.", "err");
      return;
    }

    $("output-section").classList.remove("hidden");
    $("formatted-out").textContent = result.formatted;

    // Stats
    const statsEl = $("stats");
    statsEl.innerHTML = "";
    const stats = [
      ["Original", result.original + " car."],
      ["Lignes", result.lines],
      ["Ligne max", result.maxLine + " car."],
      ["Limite", maxWidth + " car."],
    ];
    stats.forEach(([label, value]) => {
      const span = document.createElement("span");
      span.className = "cf-stat";
      span.textContent = label + " : " + value;
      statsEl.appendChild(span);
    });

    setStatus("Formaté", "ok");
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("format-btn").addEventListener("click", doFormat);

    $("example-btn").addEventListener("click", () => {
      $("cmd-input").value =
        'curl -X POST "https://api.example.com/v1/users" ' +
        '-H "Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature" ' +
        '-H "Content-Type: application/json" ' +
        '-H "Accept: application/json" ' +
        '-H "X-Request-ID: 550e8400-e29b-41d4-a716-446655440000" ' +
        "--connect-timeout 30 --max-time 60 --retry 3 --retry-delay 5 " +
        "-d \'{"name":"John Doe","email":"john@example.com","role":"admin","org_id":"org-42"}\'";
      doFormat();
    });

    $("download-html").addEventListener("click", () => {
      ToolExport.downloadStandalone({
        filename: "cmd-formatter.html",
        title: "Command Formatter",
      });
    });

    addCopyButton("formatted-out");
  });
})();
