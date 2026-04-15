(function () {
  const $ = (id) => document.getElementById(id);
  let lastCsrPem = "";
  let lastKeyPem = "";

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function parseSans(raw) {
    const out = [];
    raw.split(/\r?\n/).forEach((line) => {
      const s = line.trim();
      if (!s) return;
      const m = /^(dns|ip|email|uri):(.+)$/i.exec(s);
      if (m) {
        const kind = m[1].toLowerCase();
        const val = m[2].trim();
        if (kind === "dns")   out.push({ type: 2, value: val });
        if (kind === "ip")    out.push({ type: 7, ip: val });
        if (kind === "email") out.push({ type: 1, value: val });
        if (kind === "uri")   out.push({ type: 6, value: val });
      } else {
        out.push({ type: 2, value: s });
      }
    });
    return out;
  }

  function buildSubject() {
    const attrs = [];
    const push = (name, v) => { if (v && v.trim()) attrs.push({ name, value: v.trim() }); };
    push("commonName", $("cn").value);
    push("organizationName", $("o").value);
    push("organizationalUnitName", $("ou").value);
    push("countryName", $("c").value);
    push("stateOrProvinceName", $("st").value);
    push("localityName", $("l").value);
    push("emailAddress", $("email").value);
    return attrs;
  }

  function generate() {
    const status = $("gen-status");
    const cn = $("cn").value.trim();
    if (!cn) {
      status.textContent = "✗ Le Common Name est obligatoire.";
      status.className = "text-sm text-red-700 font-medium";
      return;
    }
    status.textContent = "… génération de la clé (peut prendre quelques secondes)";
    status.className = "text-sm text-slate-600";

    setTimeout(() => {
      try {
        const bits = parseInt($("keysize").value, 10);
        const sigalg = $("sigalg").value;
        const keys = forge.pki.rsa.generateKeyPair({ bits, e: 0x10001 });
        const csr = forge.pki.createCertificationRequest();
        csr.publicKey = keys.publicKey;
        csr.setSubject(buildSubject());

        const sans = parseSans($("sans").value);
        if (sans.length) {
          csr.setAttributes([{
            name: "extensionRequest",
            extensions: [{ name: "subjectAltName", altNames: sans }],
          }]);
        }

        const md = sigalg === "sha512" ? forge.md.sha512.create()
                 : sigalg === "sha384" ? forge.md.sha384.create()
                 : forge.md.sha256.create();
        csr.sign(keys.privateKey, md);

        lastCsrPem = forge.pki.certificationRequestToPem(csr);
        lastKeyPem = forge.pki.privateKeyToPem(keys.privateKey);

        $("csr-pem").textContent = lastCsrPem;
        $("key-pem").textContent = lastKeyPem;
        $("out-section").classList.remove("hidden");
        renderReadback(csr);
        status.textContent = "✓ CSR généré (" + bits + " bits, " + sigalg.toUpperCase() + ")";
        status.className = "text-sm text-emerald-700 font-medium";
      } catch (e) {
        status.textContent = "✗ " + e.message;
        status.className = "text-sm text-red-700 font-medium";
      }
    }, 30);
  }

  function renderReadback(csr) {
    const rows = [];
    const subj = csr.subject.attributes
      .map(a => (a.shortName || a.name) + "=" + a.value)
      .join(", ");
    rows.push(["Subject", subj]);

    // SAN
    const extReq = (csr.attributes || []).find(a => a.name === "extensionRequest");
    if (extReq && extReq.extensions) {
      const san = extReq.extensions.find(e => e.name === "subjectAltName");
      if (san) {
        const parts = san.altNames.map((a) => {
          if (a.type === 2) return "DNS:" + a.value;
          if (a.type === 7) return "IP:" + a.ip;
          if (a.type === 1) return "email:" + a.value;
          if (a.type === 6) return "URI:" + a.value;
          return "type" + a.type + ":" + (a.value || "?");
        });
        rows.push(["SAN", parts.join(", ")]);
      }
    }

    const pk = csr.publicKey;
    if (pk && pk.n) rows.push(["Clé publique", "RSA " + pk.n.bitLength() + " bits"]);
    rows.push(["Signature", (csr.signatureOid ? forge.pki.oids[csr.signatureOid] || csr.signatureOid : "?")]);

    const table = document.createElement("table");
    table.className = "kv-table";
    rows.forEach(([k, v]) => {
      const tr = document.createElement("tr");
      tr.innerHTML = "<td>" + escapeHtml(k) + "</td><td>" + escapeHtml(v) + "</td>";
      table.appendChild(tr);
    });
    const box = $("csr-readback");
    box.innerHTML = "";
    box.appendChild(table);
  }

  function decode() {
    const raw = $("decode-input").value.trim();
    const out = $("decode-out");
    out.innerHTML = "";
    if (!raw) return;
    try {
      const csr = forge.pki.certificationRequestFromPem(raw);
      const valid = csr.verify();
      const wrap = document.createElement("div");
      wrap.className = "alert " + (valid ? "alert-success" : "alert-warn");
      wrap.innerHTML = valid
        ? "✓ Signature du CSR valide (la clé publique correspond à la clé privée qui a signé)"
        : "⚠ Signature du CSR invalide";
      out.appendChild(wrap);
      const container = document.createElement("div");
      out.appendChild(container);
      const tmp = $("csr-readback");
      const saved = tmp.innerHTML;
      renderReadback(csr);
      container.innerHTML = tmp.innerHTML;
      tmp.innerHTML = saved;
    } catch (e) {
      const err = document.createElement("div");
      err.className = "alert alert-error";
      err.textContent = "✗ " + e.message;
      out.appendChild(err);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("gen-btn").addEventListener("click", generate);
    $("decode-btn").addEventListener("click", decode);

    $("example-btn").addEventListener("click", () => {
      $("cn").value = "api.example.com";
      $("o").value = "Example Corp";
      $("ou").value = "IT Security";
      $("c").value = "FR";
      $("st").value = "Île-de-France";
      $("l").value = "Paris";
      $("email").value = "ops@example.com";
      $("sans").value = "api.example.com\nwww.example.com\ndns:admin.example.com\nip:10.0.0.1";
    });

    $("copy-csr").addEventListener("click", () => navigator.clipboard.writeText(lastCsrPem));
    $("copy-key").addEventListener("click", () => navigator.clipboard.writeText(lastKeyPem));
    $("dl-csr").addEventListener("click", () => {
      const cn = ($("cn").value.trim() || "request").replace(/[^A-Za-z0-9._-]/g, "_");
      ToolExport.downloadFile(cn + ".csr", lastCsrPem);
    });
    $("dl-key").addEventListener("click", () => {
      const cn = ($("cn").value.trim() || "request").replace(/[^A-Za-z0-9._-]/g, "_");
      ToolExport.downloadFile(cn + ".key", lastKeyPem);
    });

    $("download-html").addEventListener("click", () => {
      ToolExport.downloadStandalone({
        filename: "csr-generator.html",
        title: "CSR Generator",
        inlineScripts: ["./csr-generator.js"],
      });
    });

    ToolExport.attachActions($("out-section"), () => lastCsrPem + "\n\n" + lastKeyPem);
  });
})();
