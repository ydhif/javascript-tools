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

  // Normalise les backslash-continuations existantes en une seule ligne.
  function normalize(raw) {
    return raw.replace(/\\\r?\n\s*/g, " ").replace(/[ \t]+/g, " ").trim();
  }

  // Wrap caractère par caractère.
  // Coupe de préférence au dernier espace trouvé dans la fenêtre.
  // Si aucun espace : hard-cut à maxWidth.
  function wrapText(raw, maxWidth, indent, shellMode) {
    const text = normalize(raw);
    if (!text) return null;
    if (text.length <= maxWidth) {
      return { formatted: text, lines: 1, maxLine: text.length, original: text.length };
    }

    const contSuffix = shellMode ? " \\" : "";
    const contLen = contSuffix.length;
    const lines = [];
    let pos = 0;

    while (pos < text.length) {
      const isFirst = lines.length === 0;
      const prefix = isFirst ? "" : indent;
      const remaining = text.length - pos;
      const isLast = remaining <= maxWidth - prefix.length;

      // Largeur utile : sur les lignes non-dernières on réserve la place du " \"
      const usable = isLast
        ? maxWidth - prefix.length
        : maxWidth - prefix.length - contLen;

      if (remaining <= usable) {
        // Tout le reste tient
        lines.push(prefix + text.slice(pos));
        break;
      }

      // Chercher le dernier espace dans la fenêtre [pos, pos+usable]
      let cut = -1;
      for (let i = pos + usable; i > pos; i--) {
        if (text[i] === " ") { cut = i; break; }
      }

      if (cut > pos) {
        // Couper à l'espace (on ne garde pas l'espace en fin de ligne)
        lines.push(prefix + text.slice(pos, cut));
        pos = cut + 1; // sauter l'espace
      } else {
        // Aucun espace trouvé → hard-cut
        lines.push(prefix + text.slice(pos, pos + usable));
        pos += usable;
      }
    }

    const joiner = shellMode ? " \\\n" : "\n";
    const formatted = lines.join(joiner);
    const maxLine = Math.max(...lines.map((l, i) =>
      i < lines.length - 1 ? l.length + contLen : l.length
    ));

    return { formatted, lines: lines.length, maxLine, original: text.length };
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
        ' -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiYWRtaW4iOnRydWUsImlhdCI6MTUxNjIzOTAyMn0.POstGetfAytaZS82wHcjoTyoqhMyxXiWdR7Nn7A29DNSl0EiXLdwJ6xC6AfgZWF1bOsS"' +
        ' -H "Content-Type: application/json"' +
        ' -H "Accept: application/json"' +
        ' -H "X-Request-ID: 550e8400-e29b-41d4-a716-446655440000"' +
        " --connect-timeout 30 --max-time 60 --retry 3 --retry-delay 5" +
        ' -d \'{"name":"John Doe","email":"john@example.com","role":"admin"}\'';
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
