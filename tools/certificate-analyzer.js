(function () {
  // OID -> nom lisible pour les Extended Key Usage.
  const EKU_NAMES = {
    "1.3.6.1.5.5.7.3.1": "serverAuth",
    "1.3.6.1.5.5.7.3.2": "clientAuth",
    "1.3.6.1.5.5.7.3.3": "codeSigning",
    "1.3.6.1.5.5.7.3.4": "emailProtection",
    "1.3.6.1.5.5.7.3.8": "timeStamping",
    "1.3.6.1.5.5.7.3.9": "OCSPSigning",
  };

  let lastReport = null;

  // Les exemples couvrent les quatre cas EKU. Chaque clic sur "Charger un
  // exemple" fait tourner entre ces variantes.
  const EXAMPLE_VARIANTS = [
    { label: "serveur + client", eku: { serverAuth: true, clientAuth: true }, cn: "demo.example.com" },
    { label: "serveur uniquement", eku: { serverAuth: true }, cn: "server.example.com" },
    { label: "client uniquement", eku: { clientAuth: true }, cn: "client.example.com" },
    { label: "EKU absent",       eku: null,                                    cn: "no-eku.example.com" },
  ];
  let exampleIndex = 0;

  // Cache : on ne regénère chaque variante qu'une seule fois.
  const examplePemCache = new Map();

  function buildExamplePem(variant) {
    if (examplePemCache.has(variant.label)) return examplePemCache.get(variant.label);
    // Génération d'un certificat self-signed RSA 2048 avec node-forge.
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = "0" + Math.floor(Math.random() * 1e15).toString(16);
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
    const attrs = [
      { name: "commonName", value: variant.cn },
      { name: "countryName", value: "FR" },
      { shortName: "ST", value: "Île-de-France" },
      { name: "localityName", value: "Paris" },
      { name: "organizationName", value: "JavaScript Tools Demo" },
      { shortName: "OU", value: "SwaggerGuard" },
    ];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    const extensions = [
      { name: "basicConstraints", cA: false },
      {
        name: "keyUsage",
        keyCertSign: false, digitalSignature: true, nonRepudiation: false,
        keyEncipherment: true, dataEncipherment: false,
      },
      {
        name: "subjectAltName",
        altNames: [
          { type: 2, value: variant.cn },
          { type: 2, value: "www." + variant.cn },
        ],
      },
    ];
    if (variant.eku) extensions.push({ name: "extKeyUsage", ...variant.eku });
    cert.setExtensions(extensions);
    cert.sign(keys.privateKey, forge.md.sha256.create());
    const pem = forge.pki.certificateToPem(cert);
    examplePemCache.set(variant.label, pem);
    return pem;
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("analyze-btn").addEventListener("click", analyze);
    document.getElementById("example-btn").addEventListener("click", (e) => {
      const btn = e.currentTarget;
      const original = btn.textContent;
      btn.textContent = "Génération…";
      btn.disabled = true;
      // Laisse le DOM peindre le label avant la génération (coûteuse).
      setTimeout(() => {
        try {
          const variant = EXAMPLE_VARIANTS[exampleIndex % EXAMPLE_VARIANTS.length];
          exampleIndex++;
          const pem = buildExamplePem(variant);
          document.getElementById("cert-input").value = pem;
          analyze();
        } finally {
          btn.textContent = original;
          btn.disabled = false;
        }
      }, 10);
    });
    document.getElementById("download-html").addEventListener("click", () => {
      ToolExport.downloadStandalone({
        filename: "certificate-analyzer.html",
        title: "Certificate Analyzer",
        inlineScripts: ["../assets/js/export.js", "./certificate-analyzer.js"],
      });
    });
    document.getElementById("clear-btn").addEventListener("click", () => {
      document.getElementById("cert-input").value = "";
      document.getElementById("result").classList.add("hidden");
      document.getElementById("error").classList.add("hidden");
      lastReport = null;
    });
  });

  function analyze() {
    const input = document.getElementById("cert-input").value.trim();
    const errorEl = document.getElementById("error");
    const resultEl = document.getElementById("result");
    errorEl.classList.add("hidden");
    resultEl.classList.add("hidden");

    if (!input) {
      showError("Veuillez coller un certificat PEM.");
      return;
    }

    let cert;
    try {
      const pem = ensurePem(input);
      cert = forge.pki.certificateFromPem(pem);
    } catch (e) {
      showError("Impossible de parser le certificat : " + e.message);
      return;
    }

    const report = buildReport(cert);
    lastReport = report;
    renderReport(report);
  }

  function ensurePem(text) {
    if (text.includes("BEGIN CERTIFICATE")) return text;
    // Suppose une base64 brute.
    const cleaned = text.replace(/\s+/g, "");
    return (
      "-----BEGIN CERTIFICATE-----\n" +
      cleaned.match(/.{1,64}/g).join("\n") +
      "\n-----END CERTIFICATE-----\n"
    );
  }

  function buildReport(cert) {
    const subject = formatDN(cert.subject);
    const issuer = formatDN(cert.issuer);
    const sans = extractSAN(cert);
    const eku = extractEKU(cert);
    const ku = extractKU(cert);
    const bc = extractBasicConstraints(cert);
    const sigAlg = cert.siginfo && cert.siginfo.algorithmOid
      ? oidName(cert.siginfo.algorithmOid)
      : "?";
    const pubKey = cert.publicKey;
    const pubKeyInfo = pubKey && pubKey.n
      ? "RSA " + pubKey.n.bitLength() + " bits"
      : "Clé publique présente";

    return {
      serialNumber: cert.serialNumber,
      version: cert.version + 1,
      subject,
      issuer,
      validFrom: cert.validity.notBefore.toISOString(),
      validTo: cert.validity.notAfter.toISOString(),
      signatureAlgorithm: sigAlg,
      publicKey: pubKeyInfo,
      sans,
      keyUsage: ku,
      eku,
      basicConstraints: bc,
      ekuClassification: classifyEKU(eku),
    };
  }

  function classifyEKU(eku) {
    if (!eku || eku.length === 0) {
      return { kind: "absent", label: "EKU absent", color: "amber" };
    }
    const hasServer = eku.includes("serverAuth");
    const hasClient = eku.includes("clientAuth");
    if (hasServer && hasClient) {
      return { kind: "client-server", label: "Client + Serveur", color: "indigo" };
    }
    if (hasServer) {
      return { kind: "server", label: "Serveur uniquement", color: "blue" };
    }
    if (hasClient) {
      return { kind: "client", label: "Client uniquement", color: "purple" };
    }
    return { kind: "other", label: "Autre usage", color: "slate" };
  }

  function formatDN(dn) {
    return dn.attributes
      .map((a) => (a.shortName || a.name) + "=" + a.value)
      .join(", ");
  }

  function extractSAN(cert) {
    const ext = cert.getExtension("subjectAltName");
    if (!ext || !ext.altNames) return [];
    return ext.altNames.map((n) => {
      // type 2 = DNS, 7 = IP, 1 = email, 6 = URI
      const types = { 1: "email", 2: "DNS", 6: "URI", 7: "IP" };
      return (types[n.type] || "type" + n.type) + ":" + (n.value || n.ip || "");
    });
  }

  function extractEKU(cert) {
    const ext = cert.getExtension("extKeyUsage");
    if (!ext) return [];
    const out = [];
    Object.keys(ext).forEach((k) => {
      if (k === "id" || k === "name" || k === "critical" || k === "value") return;
      if (ext[k] === true) out.push(k);
    });
    // node-forge expose certains OIDs bruts; on tente la map aussi.
    if (ext.serverAuth) out.push("serverAuth");
    if (ext.clientAuth) out.push("clientAuth");
    return Array.from(new Set(out));
  }

  function extractKU(cert) {
    const ext = cert.getExtension("keyUsage");
    if (!ext) return [];
    const flags = [
      "digitalSignature", "nonRepudiation", "keyEncipherment",
      "dataEncipherment", "keyAgreement", "keyCertSign",
      "cRLSign", "encipherOnly", "decipherOnly",
    ];
    return flags.filter((f) => ext[f]);
  }

  function extractBasicConstraints(cert) {
    const ext = cert.getExtension("basicConstraints");
    if (!ext) return null;
    return { cA: !!ext.cA, pathLenConstraint: ext.pathLenConstraint };
  }

  function oidName(oid) {
    const map = {
      "1.2.840.113549.1.1.11": "sha256WithRSAEncryption",
      "1.2.840.113549.1.1.5": "sha1WithRSAEncryption",
      "1.2.840.113549.1.1.13": "sha512WithRSAEncryption",
      "1.2.840.10045.4.3.2": "ecdsa-with-SHA256",
      "1.2.840.10045.4.3.3": "ecdsa-with-SHA384",
    };
    return map[oid] || oid;
  }

  function showError(msg) {
    const el = document.getElementById("error");
    el.textContent = msg;
    el.classList.remove("hidden");
  }

  function renderReport(r) {
    const el = document.getElementById("result");
    el.classList.remove("hidden");
    el.innerHTML = "";

    const alertClass = {
      blue: "alert alert-info",
      indigo: "alert alert-info",
      purple: "alert alert-info",
      amber: "alert alert-warn",
      slate: "alert alert-info",
    }[r.ekuClassification.color] || "alert alert-info";

    const ekuBadge = `
      <div class="${alertClass}">
        <div class="text-xs uppercase tracking-wide font-semibold">Extended Key Usage</div>
        <div class="text-lg font-bold">${escapeHtml(r.ekuClassification.label)}</div>
        <div class="text-sm mt-1">${
          r.eku.length ? r.eku.map(escapeHtml).join(", ") : "Aucun EKU déclaré dans le certificat"
        }</div>
      </div>`;

    const rows = [
      ["Numéro de série", r.serialNumber],
      ["Version", "v" + r.version],
      ["Sujet", r.subject],
      ["Émetteur", r.issuer],
      ["Valide depuis", r.validFrom],
      ["Valide jusqu'à", r.validTo],
      ["Algorithme de signature", r.signatureAlgorithm],
      ["Clé publique", r.publicKey],
      ["Subject Alt Names", r.sans.length ? r.sans.join(", ") : "—"],
      ["Key Usage", r.keyUsage.length ? r.keyUsage.join(", ") : "—"],
      ["Extended Key Usage", r.eku.length ? r.eku.join(", ") : "(absent)"],
      ["Basic Constraints", r.basicConstraints
        ? "CA=" + r.basicConstraints.cA + (r.basicConstraints.pathLenConstraint != null
            ? ", pathLen=" + r.basicConstraints.pathLenConstraint : "")
        : "—"],
    ];

    const table = `
      <h3 class="text-lg font-bold mb-4 mt-2">Détails du certificat</h3>
      <table class="kv-table">
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${escapeHtml(row[0])}</td>
              <td>${escapeHtml(String(row[1]))}</td>
            </tr>`).join("")}
        </tbody>
      </table>`;

    el.innerHTML = ekuBadge + table;

    ToolExport.attachActions(el, () => ({
      title: "Analyse de certificat",
      sections: [
        {
          heading: "Classification EKU",
          text: r.ekuClassification.label,
        },
        {
          heading: "Détails",
          rows,
        },
      ],
    }));
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
})();
