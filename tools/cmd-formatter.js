(function () {
  const $ = (id) => document.getElementById(id);

  function setStatus(msg, kind) {
    const el = $("status");
    el.textContent = msg;
    el.className = "text-sm " +
      (kind === "err" ? "text-red-700 font-medium" :
       kind === "ok"  ? "text-emerald-700 font-medium" :
                        "text-slate-600");
  }

  // Découpe un texte en mots en préservant les chaînes quotées (simple et double).
  function splitWords(text) {
    const words = [];
    let i = 0;
    const len = text.length;

    while (i < len) {
      // Sauter les espaces
      if (/\s/.test(text[i])) { i++; continue; }

      let word = "";
      while (i < len && !/\s/.test(text[i])) {
        const ch = text[i];
        if (ch === "'" || ch === '"') {
          const quote = ch;
          word += ch; i++;
          while (i < len && text[i] !== quote) {
            if (text[i] === "\\" && quote === '"') {
              word += text[i] + (text[i + 1] || "");
              i += 2;
            } else {
              word += text[i]; i++;
            }
          }
          if (i < len) { word += text[i]; i++; }
        } else if (ch === "\\") {
          word += ch + (text[i + 1] || "");
          i += 2;
        } else {
          word += ch; i++;
        }
      }
      if (word) words.push(word);
    }
    return words;
  }

  // Normalise les backslash-continuations existantes en une seule ligne.
  function normalize(raw) {
    return raw.replace(/\\\r?\n\s*/g, " ").replace(/[ \t]+/g, " ").trim();
  }

  function wrapText(raw, maxWidth, indent, shellMode) {
    const oneliner = normalize(raw);
    if (!oneliner) return null;

    if (oneliner.length <= maxWidth) {
      return { formatted: oneliner, lines: 1, maxLine: oneliner.length, original: oneliner.length };
    }

    const words = splitWords(oneliner);
    if (!words.length) return null;

    const continuation = shellMode ? " \\" : "";
    const contLen = continuation.length;
    const lines = [];
    let current = words[0];

    for (let w = 1; w < words.length; w++) {
      const candidate = current + " " + words[w];
      if (candidate.length + contLen <= maxWidth) {
        current = candidate;
      } else {
        lines.push(current);
        current = indent + words[w];
      }
    }
    lines.push(current);

    const joiner = shellMode ? " \\\n" : "\n";
    const formatted = lines.join(joiner);
    const maxLine = Math.max(...lines.map((l, idx) =>
      idx < lines.length - 1 ? l.length + contLen : l.length
    ));

    return { formatted, lines: lines.length, maxLine, original: oneliner.length };
  }

  function addCopyButton(preId) {
    const pre = $(preId);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Copier";
    btn.className = "px-3 py-1 text-xs rounded font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 mb-2";
    btn.addEventListener("click", async () => {
      const text = pre.textContent;
      if (!text) return;
      await ToolExport.copyText(text);
      btn.textContent = "Copié !";
      btn.disabled = true;
      setTimeout(() => { btn.textContent = "Copier"; btn.disabled = false; }, 1500);
    });
    pre.parentElement.insertBefore(btn, pre);
  }

  function doFormat() {
    const raw = $("cmd-input").value;
    if (!raw.trim()) {
      setStatus("Texte vide.", "err");
      return;
    }

    const maxWidth = Math.max(20, parseInt($("max-width").value, 10) || 200);
    const indentVal = $("indent-style").value;
    const indent = indentVal === "tab" ? "\t" : " ".repeat(parseInt(indentVal, 10));
    const shellMode = $("shell-mode").checked;

    const result = wrapText(raw, maxWidth, indent, shellMode);
    if (!result) {
      setStatus("Impossible de formater.", "err");
      return;
    }

    $("output-section").classList.remove("hidden");
    $("formatted-out").textContent = result.formatted;

    // Stats
    const statsEl = $("stats");
    statsEl.innerHTML = "";
    [
      ["Original", result.original + " car."],
      ["Lignes", result.lines],
      ["Ligne max", result.maxLine + " car."],
      ["Limite", maxWidth + " car."],
    ].forEach(([label, value]) => {
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
        'curl -X POST "https://api.example.com/v1/users"' +
        ' -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature"' +
        ' -H "Content-Type: application/json"' +
        ' -H "Accept: application/json"' +
        ' -H "X-Request-ID: 550e8400-e29b-41d4-a716-446655440000"' +
        " --connect-timeout 30 --max-time 60 --retry 3 --retry-delay 5" +
        " -d '{\"name\":\"John Doe\",\"email\":\"john@example.com\",\"role\":\"admin\"}'";
      $("shell-mode").checked = true;
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
