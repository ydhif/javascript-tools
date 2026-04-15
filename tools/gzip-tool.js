(function () {
  const $ = (id) => document.getElementById(id);
  let lastCompressedBytes = null;
  let lastDecompressedText = "";

  function showErr(msg) {
    const el = $("err");
    el.textContent = "✗ " + msg;
    el.classList.remove("hidden");
  }
  function hideErr() { $("err").classList.add("hidden"); }

  function bytesToBase64(bytes) {
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function base64ToBytes(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  function bytesToHex(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0");
    return s;
  }
  function hexToBytes(hex) {
    hex = hex.replace(/\s+/g, "");
    if (hex.length % 2) throw new Error("Longueur hex impaire");
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    return bytes;
  }

  function encodeBytes(bytes, fmt) {
    if (fmt === "base64") return bytesToBase64(bytes);
    if (fmt === "base64url") return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    if (fmt === "hex") return bytesToHex(bytes);
    return bytesToBase64(bytes);
  }
  function decodeBytes(str, fmt) {
    const s = str.trim();
    if (fmt === "hex") return hexToBytes(s);
    // base64 ou base64url : normalise
    let b = s.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
    while (b.length % 4) b += "=";
    return base64ToBytes(b);
  }

  async function compressBytes(bytes, algo) {
    const cs = new CompressionStream(algo);
    const stream = new Blob([bytes]).stream().pipeThrough(cs);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function decompressBytes(bytes, algo) {
    const ds = new DecompressionStream(algo);
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  function fmtBytes(n) {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / 1024 / 1024).toFixed(2) + " MB";
  }

  async function doCompress(rawBytes, label) {
    hideErr();
    const algo = $("algo").value;
    const fmt = $("fmt").value;
    try {
      const compressed = await compressBytes(rawBytes, algo);
      lastCompressedBytes = compressed;
      $("compressed-out").textContent = encodeBytes(compressed, fmt);

      $("stats").classList.remove("hidden");
      $("stats").classList.add("grid");
      $("s-orig").textContent = fmtBytes(rawBytes.length);
      $("s-comp").textContent = fmtBytes(compressed.length);
      const ratio = rawBytes.length > 0
        ? ((1 - compressed.length / rawBytes.length) * 100).toFixed(1) + " %"
        : "-";
      $("s-ratio").textContent = ratio;
    } catch (e) {
      showErr((label ? label + " : " : "") + e.message);
    }
  }

  async function doCompressText() {
    const text = $("plain-in").value;
    if (!text) return;
    const bytes = new TextEncoder().encode(text);
    await doCompress(bytes, "Compression");
  }

  async function doDecompress() {
    hideErr();
    const raw = $("compressed-in").value.trim();
    if (!raw) return;
    const algo = $("algo").value;
    const fmt = $("fmt").value;
    try {
      const bytes = decodeBytes(raw, fmt);
      const out = await decompressBytes(bytes, algo);
      const text = new TextDecoder().decode(out);
      lastDecompressedText = text;
      $("decompressed-out").textContent = text;
    } catch (e) {
      showErr("Décompression : " + e.message);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (typeof CompressionStream === "undefined") {
      showErr("Votre navigateur ne supporte pas CompressionStream (Chrome 80+, Firefox 113+, Safari 16.4+).");
      return;
    }

    $("compress-btn").addEventListener("click", doCompressText);
    $("decompress-btn").addEventListener("click", doDecompress);

    $("example-c").addEventListener("click", () => {
      $("plain-in").value = JSON.stringify({
        users: Array.from({ length: 20 }, (_, i) => ({
          id: i + 1,
          name: "User " + (i + 1),
          email: "user" + (i + 1) + "@example.com",
          role: i % 3 === 0 ? "admin" : "member",
          active: true,
        })),
      }, null, 2);
      doCompressText();
    });

    $("file-in").addEventListener("change", async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const bytes = new Uint8Array(await f.arrayBuffer());
      $("plain-in").value = "(fichier binaire : " + f.name + " — " + fmtBytes(f.size) + ")";
      await doCompress(bytes, "Compression fichier");
    });

    $("file-gz").addEventListener("change", async (e) => {
      hideErr();
      const f = e.target.files[0];
      if (!f) return;
      const algo = $("algo").value;
      try {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const out = await decompressBytes(bytes, algo);
        const text = new TextDecoder().decode(out);
        lastDecompressedText = text;
        $("decompressed-out").textContent = text;
      } catch (err) {
        showErr("Décompression fichier : " + err.message);
      }
    });

    $("copy-c").addEventListener("click", () => {
      navigator.clipboard.writeText($("compressed-out").textContent || "");
    });
    $("copy-d").addEventListener("click", () => {
      navigator.clipboard.writeText($("decompressed-out").textContent || "");
    });

    $("dl-c").addEventListener("click", () => {
      if (!lastCompressedBytes) return;
      const algo = $("algo").value;
      const ext = algo === "gzip" ? "gz" : "bin";
      ToolExport.downloadFile("compressed." + ext, lastCompressedBytes, "application/gzip");
    });
    $("dl-d").addEventListener("click", () => {
      if (!lastDecompressedText) return;
      ToolExport.downloadFile("decompressed.txt", lastDecompressedText);
    });

    $("download-html").addEventListener("click", () => {
      ToolExport.downloadStandalone({
        filename: "gzip-tool.html",
        title: "Gzip Tool",
        inlineScripts: ["./gzip-tool.js"],
      });
    });

    ToolExport.attachActions($("global-actions"), () => {
      return "--- Original ---\n" + ($("plain-in").value || "") +
             "\n\n--- Compressé (" + $("fmt").value + ") ---\n" + ($("compressed-out").textContent || "");
    });
  });
})();
