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
  let exampleChainCache = null;

  // Construit une chaîne d'exemple : Root CA (self-signed) → Intermediate CA → Leaf.
  // Le leaf est signé par l'intermédiaire, qui est lui-même signé par la racine.
  function buildExampleChain() {
    if (exampleChainCache) return exampleChainCache;

    function makeCert(opts) {
      const keys = forge.pki.rsa.generateKeyPair(2048);
      const cert = forge.pki.createCertificate();
      cert.publicKey = keys.publicKey;
      cert.serialNumber = "0" + Math.floor(Math.random() * 1e15).toString(16);
      cert.validity.notBefore = new Date();
      cert.validity.notAfter = new Date();
      cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + (opts.years || 1));
      cert.setSubject(opts.subject);
      cert.setIssuer(opts.issuer || opts.subject);
      cert.setExtensions(opts.extensions || []);
      return { cert, keys };
    }

    // Racine auto-signée
    const rootSubject = [
      { name: "commonName", value: "Demo Root CA" },
      { name: "countryName", value: "FR" },
      { name: "organizationName", value: "JavaScript Tools Demo" },
    ];
    const root = makeCert({
      subject: rootSubject,
      years: 10,
      extensions: [
        { name: "basicConstraints", cA: true, pathLenConstraint: 2, critical: true },
        { name: "keyUsage", keyCertSign: true, cRLSign: true, critical: true },
      ],
    });
    root.cert.sign(root.keys.privateKey, forge.md.sha256.create());

    // Intermédiaire signé par la racine
    const interSubject = [
      { name: "commonName", value: "Demo Intermediate CA" },
      { name: "countryName", value: "FR" },
      { name: "organizationName", value: "JavaScript Tools Demo" },
    ];
    const inter = makeCert({
      subject: interSubject,
      issuer: rootSubject,
      years: 5,
      extensions: [
        { name: "basicConstraints", cA: true, pathLenConstraint: 0, critical: true },
        { name: "keyUsage", keyCertSign: true, cRLSign: true, critical: true },
      ],
    });
    inter.cert.sign(root.keys.privateKey, forge.md.sha256.create());

    // Leaf (serveur + client) signé par l'intermédiaire
    const leafSubject = [
      { name: "commonName", value: "api.demo.example.com" },
      { name: "countryName", value: "FR" },
      { name: "organizationName", value: "JavaScript Tools Demo" },
      { shortName: "OU", value: "Platform" },
    ];
    const leaf = makeCert({
      subject: leafSubject,
      issuer: interSubject,
      years: 1,
      extensions: [
        { name: "basicConstraints", cA: false },
        { name: "keyUsage", digitalSignature: true, keyEncipherment: true, critical: true },
        { name: "extKeyUsage", serverAuth: true, clientAuth: true },
        { name: "subjectAltName", altNames: [
          { type: 2, value: "api.demo.example.com" },
          { type: 2, value: "www.demo.example.com" },
        ] },
      ],
    });
    leaf.cert.sign(inter.keys.privateKey, forge.md.sha256.create());

    // Ordre conventionnel : leaf → intermédiaire → racine
    exampleChainCache =
      forge.pki.certificateToPem(leaf.cert) +
      forge.pki.certificateToPem(inter.cert) +
      forge.pki.certificateToPem(root.cert);
    return exampleChainCache;
  }

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
    document.getElementById("example-chain-btn").addEventListener("click", (e) => {
      const btn = e.currentTarget;
      const original = btn.textContent;
      btn.textContent = "Génération…";
      btn.disabled = true;
      setTimeout(() => {
        try {
          document.getElementById("cert-input").value = buildExampleChain();
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

    let pems;
    try {
      pems = splitPems(input);
    } catch (e) {
      showError("Impossible de parser l'entrée : " + e.message);
      return;
    }
    if (!pems.length) {
      showError("Aucun certificat trouvé dans l'entrée.");
      return;
    }

    const reports = [];
    for (let i = 0; i < pems.length; i++) {
      try {
        const cert = forge.pki.certificateFromPem(pems[i]);
        reports.push(buildReport(cert));
      } catch (e) {
        showError("Certificat #" + (i + 1) + " invalide : " + e.message);
        return;
      }
    }

    // Classification de la position de chaque cert dans la chaîne.
    annotateChain(reports);
    lastReport = reports;
    renderChain(reports);
  }

  // Découpe l'entrée en blocs PEM. Accepte aussi une base64 brute (un seul cert).
  function splitPems(text) {
    const re = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;
    const matches = text.match(re);
    if (matches && matches.length) return matches;
    // Fallback : base64 brut d'un seul certificat
    const cleaned = text.replace(/\s+/g, "");
    if (!cleaned) return [];
    const wrapped =
      "-----BEGIN CERTIFICATE-----\n" +
      cleaned.match(/.{1,64}/g).join("\n") +
      "\n-----END CERTIFICATE-----\n";
    return [wrapped];
  }

  // Détermine pour chaque cert son rôle dans la chaîne (leaf / intermediate / root)
  // et si la liaison avec le cert suivant est cohérente (issuer du cert N = subject du cert N+1).
  function annotateChain(reports) {
    const n = reports.length;
    reports.forEach((r, i) => {
      const isSelfSigned = r.subject === r.issuer;
      if (n === 1) {
        r.chainRole = isSelfSigned ? "self-signed" : "single";
      } else if (i === 0) {
        r.chainRole = "leaf";
      } else if (i === n - 1) {
        r.chainRole = isSelfSigned ? "root" : "top";
      } else {
        r.chainRole = "intermediate";
      }
      if (i < n - 1) {
        r.chainLinkOk = reports[i + 1].subject === r.issuer;
      }
    });
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

  const ROLE_LABEL = {
    "single":     { label: "Certificat unique",       color: "#4338ca", bg: "#eef2ff" },
    "self-signed":{ label: "Certificat self-signed",  color: "#c2410c", bg: "#fff7ed" },
    "leaf":       { label: "Feuille (leaf)",          color: "#4338ca", bg: "#eef2ff" },
    "intermediate":{ label: "Intermédiaire",          color: "#6d28d9", bg: "#f3e8ff" },
    "root":       { label: "Racine (self-signed)",    color: "#047857", bg: "#ecfdf5" },
    "top":        { label: "Dernier de la chaîne",    color: "#c2410c", bg: "#fff7ed" },
  };

  function renderChain(reports) {
    const el = document.getElementById("result");
    el.classList.remove("hidden");
    el.innerHTML = "";

    // Résumé de chaîne si plus d'un certificat
    if (reports.length > 1) {
      const banner = document.createElement("div");
      banner.className = "alert alert-info";
      const brokenLinks = reports.slice(0, -1).filter((r) => r.chainLinkOk === false).length;
      banner.innerHTML =
        '<div class="text-xs uppercase tracking-wide font-semibold">Chaîne de certificats</div>' +
        '<div class="text-lg font-bold">' + reports.length + " certificats détectés</div>" +
        '<div class="text-sm mt-1">Ordre attendu : feuille → intermédiaires → racine. ' +
        (brokenLinks === 0
          ? "Tous les liens issuer ↔ subject sont cohérents."
          : '<span class="text-red-700 font-semibold">' + brokenLinks + " lien(s) incohérent(s) détecté(s)</span>") +
        "</div>";
      el.appendChild(banner);
    }

    reports.forEach((r, i) => el.appendChild(renderReportCard(r, i, reports.length)));

    ToolExport.attachActions(el, () => ({
      title: "Analyse de certificat" + (reports.length > 1 ? " (chaîne)" : ""),
      sections: reports.flatMap((r, i) => ([
        { heading: (reports.length > 1 ? "Certificat #" + (i + 1) + " — " : "") + (ROLE_LABEL[r.chainRole]||{}).label,
          text: r.ekuClassification.label },
        { heading: "Détails", rows: reportRows(r) },
      ])),
    }));
  }

  function reportRows(r) {
    return [
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
  }

  function renderReportCard(r, index, total) {
    const card = document.createElement("div");
    card.style.cssText = "margin-bottom: 1.25rem; border: 1px solid rgba(148,163,184,0.3); border-radius: 0.75rem; padding: 1.1rem 1.25rem; background: rgba(255,255,255,0.85);";

    const alertClass = {
      blue: "alert alert-info",
      indigo: "alert alert-info",
      purple: "alert alert-info",
      amber: "alert alert-warn",
      slate: "alert alert-info",
    }[r.ekuClassification.color] || "alert alert-info";

    const role = ROLE_LABEL[r.chainRole] || ROLE_LABEL.single;
    const header = document.createElement("div");
    header.className = "flex items-center justify-between flex-wrap gap-2 mb-3";
    header.innerHTML =
      '<div class="flex items-center gap-2">' +
        '<span class="badge" style="background:' + role.bg + ';color:' + role.color + ';">' +
          (total > 1 ? "#" + (index + 1) + " · " : "") + escapeHtml(role.label) +
        '</span>' +
        '<span class="text-xs text-slate-500">' + escapeHtml(r.subject) + '</span>' +
      '</div>' +
      (r.chainLinkOk === false
        ? '<span class="badge" style="background:#fef2f2;color:#b91c1c;">⚠ lien rompu avec le cert suivant</span>'
        : '');
    card.appendChild(header);

    const ekuBadge = document.createElement("div");
    ekuBadge.className = alertClass;
    ekuBadge.innerHTML =
      '<div class="text-xs uppercase tracking-wide font-semibold">Extended Key Usage</div>' +
      '<div class="text-lg font-bold">' + escapeHtml(r.ekuClassification.label) + '</div>' +
      '<div class="text-sm mt-1">' +
        (r.eku.length ? r.eku.map(escapeHtml).join(", ") : "Aucun EKU déclaré dans le certificat") +
      '</div>';
    card.appendChild(ekuBadge);

    const rows = reportRows(r);
    const table = document.createElement("table");
    table.className = "kv-table";
    table.style.marginTop = "1rem";
    const tbody = document.createElement("tbody");
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      const tdK = document.createElement("td");
      const tdV = document.createElement("td");
      tdK.textContent = row[0];
      tdV.textContent = String(row[1]);
      tr.appendChild(tdK);
      tr.appendChild(tdV);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    card.appendChild(table);

    return card;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
})();
