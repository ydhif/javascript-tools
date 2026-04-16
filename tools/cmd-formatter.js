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

  function splitText(text, maxWidth) {
    if (!text) return null;
    if (text.length <= maxWidth) {
      return { formatted: text, lines: 1, original: text.length };
    }

    const lines = [];
    let pos = 0;
    while (pos < text.length) {
      lines.push(text.slice(pos, pos + maxWidth));
      pos += maxWidth;
    }

    return { formatted: lines.join("\n"), lines: lines.length, original: text.length };
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
    if (!raw) {
      setStatus("Texte vide.", "err");
      return;
    }

    const maxWidth = Math.max(1, parseInt($("max-width").value, 10) || 200);
    const result = splitText(raw, maxWidth);
    if (!result) {
      setStatus("Rien à formater.", "err");
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
      ["Limite", maxWidth + " car."],
    ].forEach(([label, value]) => {
      const span = document.createElement("span");
      span.className = "cf-stat";
      span.textContent = label + " : " + value;
      statsEl.appendChild(span);
    });

    setStatus("Splitté", "ok");
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("format-btn").addEventListener("click", doFormat);

    $("example-btn").addEventListener("click", () => {
      $("cmd-input").value = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiYWRtaW4iOnRydWUsImlhdCI6MTUxNjIzOTAyMn0.POstGetfAytaZS82wHcjoTyoqhMyxXiWdR7Nn7A29DNSl0EiXLdwJ6xC6AfgZWF1bOsS";
      $("max-width").value = "80";
      doFormat();
    });

    $("download-html").addEventListener("click", () => {
      ToolExport.downloadStandalone({
        filename: "text-splitter.html",
        title: "Text Splitter",
      });
    });

    addCopyButton("formatted-out");
  });
})();
