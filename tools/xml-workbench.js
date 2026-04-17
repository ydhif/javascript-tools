(function () {
  const $ = (id) => document.getElementById(id);
  let currentDoc = null;
  let nodeToEl = new WeakMap();
  let elToNode = new WeakMap();
  let selectedXmlNode = null;
  let searchMatches = [];
  let searchIndex = -1;
  let cmView = null; // CodeMirror instance

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ==================== Parse ====================

  function parseXml(text) {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    const err = doc.querySelector("parsererror");
    if (err) throw new Error(err.textContent.replace(/\s+/g, " ").trim());
    return doc;
  }

  function getXmlInput() {
    if (cmView) return cmView.state.doc.toString();
    return $("xml-input").value;
  }

  function setXmlInput(text) {
    if (cmView) {
      cmView.dispatch({ changes: { from: 0, to: cmView.state.doc.length, insert: text } });
    } else {
      $("xml-input").value = text;
    }
  }

  // Pretty-print
  function prettyPrint(xml) {
    const doc = parseXml(xml);
    const INDENT = "  ";
    const out = [];
    const hasDecl = /^\s*<\?xml/.test(xml);
    if (hasDecl) out.push('<?xml version="1.0" encoding="UTF-8"?>');
    function write(node, depth) {
      const pad = INDENT.repeat(depth);
      if (node.nodeType === 1) {
        const attrs = Array.from(node.attributes)
          .map(a => ` ${a.name}="${escapeHtml(a.value)}"`).join("");
        const children = Array.from(node.childNodes).filter(
          c => !(c.nodeType === 3 && !c.nodeValue.trim())
        );
        if (children.length === 0) {
          out.push(`${pad}<${node.nodeName}${attrs}/>`);
        } else if (children.length === 1 && children[0].nodeType === 3) {
          out.push(`${pad}<${node.nodeName}${attrs}>${escapeHtml(children[0].nodeValue.trim())}</${node.nodeName}>`);
        } else {
          out.push(`${pad}<${node.nodeName}${attrs}>`);
          children.forEach(c => write(c, depth + 1));
          out.push(`${pad}</${node.nodeName}>`);
        }
      } else if (node.nodeType === 3) {
        const t = node.nodeValue.trim();
        if (t) out.push(pad + escapeHtml(t));
      } else if (node.nodeType === 8) {
        out.push(`${pad}<!-- ${node.nodeValue} -->`);
      } else if (node.nodeType === 7) {
        out.push(`${pad}<?${node.target} ${node.data}?>`);
      }
    }
    write(doc.documentElement, 0);
    return out.join("\n");
  }

  function minify(xml) {
    const doc = parseXml(xml);
    return new XMLSerializer().serializeToString(doc);
  }

  // ==================== Tree ====================

  function renderTree() {
    const tree = $("tree");
    tree.innerHTML = "";
    nodeToEl = new WeakMap();
    elToNode = new WeakMap();
    if (!currentDoc) return;
    tree.appendChild(renderNode(currentDoc.documentElement, 0));
  }

  function renderNode(node, depth) {
    const wrap = document.createElement("div");
    wrap.className = "xw-node";
    const row = document.createElement("div");
    row.className = "xw-row";

    const children = Array.from(node.childNodes).filter(
      c => !(c.nodeType === 3 && !c.nodeValue.trim())
    );
    const elementChildren = children.filter(c => c.nodeType === 1);
    const isLeafWithText = children.length === 1 && children[0].nodeType === 3;
    const isContainer = elementChildren.length > 0;

    const toggle = document.createElement("span");
    toggle.className = "xw-toggle" + (isContainer ? "" : " leaf");
    toggle.textContent = isContainer ? "▸" : "•";
    row.appendChild(toggle);

    const open = document.createElement("span");
    open.className = "xw-tag";
    open.textContent = "<" + node.nodeName;
    row.appendChild(open);

    Array.from(node.attributes).forEach((a) => {
      const sp = document.createElement("span");
      sp.innerHTML = ' <span class="xw-attr-name">' + escapeHtml(a.name) +
                     '</span>=<span class="xw-attr-val">"' + escapeHtml(a.value) + '"</span>';
      row.appendChild(sp);
    });

    // Click to select node
    row.addEventListener("click", (e) => {
      if (e.target.classList.contains("xw-toggle") && isContainer) return;
      selectNode(node, wrap);
    });

    if (isLeafWithText) {
      const close1 = document.createElement("span");
      close1.className = "xw-tag";
      close1.textContent = ">";
      row.appendChild(close1);
      const txt = document.createElement("span");
      txt.className = "xw-text";
      txt.textContent = children[0].nodeValue.trim();
      row.appendChild(txt);
      const close2 = document.createElement("span");
      close2.className = "xw-tag";
      close2.textContent = "</" + node.nodeName + ">";
      row.appendChild(close2);
      wrap.appendChild(row);
    } else if (!isContainer) {
      const selfClose = document.createElement("span");
      selfClose.className = "xw-tag";
      selfClose.textContent = "/>";
      row.appendChild(selfClose);
      wrap.appendChild(row);
    } else {
      const close1 = document.createElement("span");
      close1.className = "xw-tag";
      close1.textContent = ">";
      row.appendChild(close1);

      const count = document.createElement("span");
      count.className = "xw-count";
      count.textContent = elementChildren.length + " children";
      row.appendChild(count);

      const preview = document.createElement("span");
      preview.className = "xw-preview";
      preview.textContent = "… </" + node.nodeName + ">";
      row.appendChild(preview);

      wrap.appendChild(row);

      const childrenBox = document.createElement("div");
      childrenBox.style.display = "none";
      wrap.appendChild(childrenBox);

      const closeRow = document.createElement("div");
      closeRow.className = "xw-row";
      closeRow.style.display = "none";
      closeRow.innerHTML = '<span class="xw-toggle leaf">•</span><span class="xw-tag">&lt;/' + escapeHtml(node.nodeName) + '&gt;</span>';
      wrap.appendChild(closeRow);

      let built = false;
      const build = () => {
        if (built) return;
        built = true;
        children.forEach((c) => {
          if (c.nodeType === 1) childrenBox.appendChild(renderNode(c, depth + 1));
          else if (c.nodeType === 8) {
            const d = document.createElement("div");
            d.className = "xw-node";
            d.innerHTML = '<div class="xw-row"><span class="xw-toggle leaf">•</span><span class="xw-comment">&lt;!-- ' + escapeHtml(c.nodeValue) + ' --&gt;</span></div>';
            childrenBox.appendChild(d);
          } else if (c.nodeType === 3) {
            const d = document.createElement("div");
            d.className = "xw-node";
            d.innerHTML = '<div class="xw-row"><span class="xw-toggle leaf">•</span><span class="xw-text">' + escapeHtml(c.nodeValue.trim()) + '</span></div>';
            childrenBox.appendChild(d);
          }
        });
      };

      const setOpen = (o) => {
        if (o) {
          build();
          childrenBox.style.display = "";
          closeRow.style.display = "";
          preview.style.display = "none";
          count.style.display = "none";
          toggle.textContent = "▾";
        } else {
          childrenBox.style.display = "none";
          closeRow.style.display = "none";
          preview.style.display = "";
          count.style.display = "";
          toggle.textContent = "▸";
        }
      };
      const onToggle = (e) => {
        e.stopPropagation();
        setOpen(childrenBox.style.display === "none");
      };
      toggle.addEventListener("click", onToggle);
      if (depth < 1) setOpen(true);
      wrap._setOpen = setOpen;
      wrap._build = build;
    }

    nodeToEl.set(node, wrap);
    elToNode.set(wrap, node);
    return wrap;
  }

  // ==================== Node selection ====================

  function computeXPath(node) {
    if (!node || node.nodeType !== 1) return "";
    const parts = [];
    let cur = node;
    while (cur && cur.nodeType === 1) {
      let idx = 1;
      let sib = cur.previousSibling;
      while (sib) {
        if (sib.nodeType === 1 && sib.nodeName === cur.nodeName) idx++;
        sib = sib.previousSibling;
      }
      let count = 0;
      let s = cur.parentNode ? cur.parentNode.firstChild : null;
      while (s) {
        if (s.nodeType === 1 && s.nodeName === cur.nodeName) count++;
        s = s.nextSibling;
      }
      parts.unshift(count > 1 ? cur.nodeName + "[" + idx + "]" : cur.nodeName);
      cur = cur.parentNode;
    }
    return "/" + parts.join("/");
  }

  function xmlToJson(node) {
    if (node.nodeType === 3) return node.nodeValue.trim();
    if (node.nodeType !== 1) return null;
    const obj = {};
    // Attributes
    Array.from(node.attributes).forEach(a => { obj["@" + a.name] = a.value; });
    // Children
    const children = Array.from(node.childNodes).filter(c => !(c.nodeType === 3 && !c.nodeValue.trim()));
    if (children.length === 1 && children[0].nodeType === 3) {
      obj["#text"] = children[0].nodeValue.trim();
    } else {
      const childMap = {};
      children.forEach(c => {
        if (c.nodeType !== 1) return;
        const key = c.nodeName;
        const val = xmlToJson(c);
        if (childMap[key]) {
          if (!Array.isArray(obj[key])) obj[key] = [obj[key]];
          obj[key].push(val);
        } else {
          childMap[key] = true;
          obj[key] = val;
        }
      });
    }
    return obj;
  }

  function selectNode(xmlNode, wrapEl) {
    // Deselect previous
    document.querySelectorAll(".xw-selected").forEach(el => el.classList.remove("xw-selected"));
    selectedXmlNode = xmlNode;
    const row = wrapEl.querySelector(".xw-row");
    if (row) row.classList.add("xw-selected");

    const xpath = computeXPath(xmlNode);
    $("node-xpath").textContent = xpath;
    $("tree-context").classList.remove("hidden");
  }

  // ==================== Search in tree ====================

  function expandToNode(xmlNode) {
    // Walk up to root, collect ancestors, then expand each
    const path = [];
    let cur = xmlNode.parentNode;
    while (cur && cur.nodeType === 1) {
      path.unshift(cur);
      cur = cur.parentNode;
    }
    path.forEach(ancestor => {
      const el = nodeToEl.get(ancestor);
      if (el) {
        if (el._build) el._build();
        if (el._setOpen) el._setOpen(true);
      }
    });
  }

  function searchTree(query) {
    // Clear previous
    document.querySelectorAll(".xw-search-hit").forEach(el => el.classList.remove("xw-search-hit"));
    searchMatches = [];
    searchIndex = -1;
    if (!query || !currentDoc) {
      $("tree-search-stats").textContent = "";
      return;
    }

    const q = query.toLowerCase();
    function walk(node) {
      if (node.nodeType !== 1) return;
      let match = false;
      // Element name
      if (node.nodeName.toLowerCase().includes(q)) match = true;
      // Attributes
      Array.from(node.attributes).forEach(a => {
        if (a.name.toLowerCase().includes(q) || a.value.toLowerCase().includes(q)) match = true;
      });
      // Text content (direct)
      Array.from(node.childNodes).forEach(c => {
        if (c.nodeType === 3 && c.nodeValue.toLowerCase().includes(q)) match = true;
      });
      if (match) searchMatches.push(node);
      Array.from(node.childNodes).forEach(c => walk(c));
    }
    walk(currentDoc.documentElement);

    searchMatches.forEach(node => {
      expandToNode(node);
      const el = nodeToEl.get(node);
      if (el) el.classList.add("xw-search-hit");
    });

    $("tree-search-stats").textContent = searchMatches.length + " résultat(s)";
    if (searchMatches.length > 0) {
      searchIndex = 0;
      scrollToMatch(0);
    }
  }

  function scrollToMatch(idx) {
    if (idx < 0 || idx >= searchMatches.length) return;
    const node = searchMatches[idx];
    const el = nodeToEl.get(node);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // ==================== Parse / status ====================

  function setParseStatus(msg, ok) {
    const el = $("parse-status");
    el.textContent = msg;
    el.className = "text-sm mt-2 " + (ok ? "text-emerald-700 font-medium" : "text-red-700 font-medium");
  }

  function runParse() {
    const raw = getXmlInput().trim();
    if (!raw) { setParseStatus("Entrée vide.", false); return; }
    try {
      currentDoc = parseXml(raw);
      setParseStatus("XML bien formé", true);
      renderTree();
      runInfo();
    } catch (e) {
      currentDoc = null;
      setParseStatus(e.message, false);
      $("tree").innerHTML = "";
    }
  }

  // ==================== XPath ====================

  function runXPath() {
    if (!currentDoc) { $("xpath-stats").textContent = "Analyser d'abord un XML."; return; }
    const expr = $("xpath-input").value.trim();
    const out = $("xpath-results");
    out.innerHTML = "";
    if (!expr) return;
    try {
      const res = currentDoc.evaluate(expr, currentDoc, null, XPathResult.ANY_TYPE, null);
      const type = res.resultType;
      if (type === XPathResult.NUMBER_TYPE) {
        $("xpath-stats").textContent = "Type : number";
        out.textContent = String(res.numberValue);
      } else if (type === XPathResult.STRING_TYPE) {
        $("xpath-stats").textContent = "Type : string";
        out.textContent = res.stringValue;
      } else if (type === XPathResult.BOOLEAN_TYPE) {
        $("xpath-stats").textContent = "Type : boolean";
        out.textContent = String(res.booleanValue);
      } else {
        const nodes = [];
        let n;
        while ((n = res.iterateNext())) nodes.push(n);
        $("xpath-stats").textContent = nodes.length + " noeud(s)";
        nodes.forEach((node, i) => {
          const serialized = node.nodeType === 2
            ? node.name + '="' + node.value + '"'
            : new XMLSerializer().serializeToString(node);
          const div = document.createElement("div");
          div.style.borderBottom = "1px dashed rgba(148,163,184,0.3)";
          div.style.padding = "0.35rem 0";
          div.innerHTML = '<span class="text-slate-400">[' + i + ']</span> '
                          + '<code>' + escapeHtml(serialized.length > 300 ? serialized.slice(0, 300) + "…" : serialized) + '</code>';
          out.appendChild(div);
        });
      }
    } catch (e) {
      $("xpath-stats").textContent = "Erreur : " + e.message;
    }
  }

  // ==================== XSLT ====================

  function runXslt() {
    if (!currentDoc) { $("xslt-output").textContent = "Analyser d'abord un XML."; return; }
    const xslText = $("xslt-input").value.trim();
    if (!xslText) { $("xslt-output").textContent = "Colle une feuille XSLT."; return; }
    try {
      const xslDoc = parseXml(xslText);
      const proc = new XSLTProcessor();
      proc.importStylesheet(xslDoc);
      const out = proc.transformToFragment(currentDoc, document);
      const serializer = new XMLSerializer();
      let text = "";
      Array.from(out.childNodes).forEach((n) => {
        text += n.nodeType === 3 ? n.nodeValue : serializer.serializeToString(n);
      });
      $("xslt-output").textContent = text || "(résultat vide)";
    } catch (e) {
      $("xslt-output").textContent = "Erreur : " + e.message;
    }
  }

  // ==================== Info tab ====================

  function runInfo() {
    const content = $("info-content");
    if (!currentDoc) {
      content.innerHTML = '<p class="text-slate-400 italic">Analyser un XML pour voir les statistiques.</p>';
      return;
    }

    const raw = getXmlInput();
    let elemCount = 0, attrCount = 0, textCount = 0, commentCount = 0, piCount = 0, maxDepth = 0;
    const nsMap = new Map();

    function walk(node, depth) {
      if (depth > maxDepth) maxDepth = depth;
      if (node.nodeType === 1) {
        elemCount++;
        attrCount += node.attributes.length;
        // Collect namespaces
        Array.from(node.attributes).forEach(a => {
          if (a.name === "xmlns") {
            nsMap.set("(default)", a.value);
          } else if (a.name.startsWith("xmlns:")) {
            nsMap.set(a.name.slice(6), a.value);
          }
        });
        if (node.namespaceURI && !Array.from(nsMap.values()).includes(node.namespaceURI)) {
          const prefix = node.prefix || "(default)";
          nsMap.set(prefix, node.namespaceURI);
        }
      } else if (node.nodeType === 3 && node.nodeValue.trim()) {
        textCount++;
      } else if (node.nodeType === 8) {
        commentCount++;
      } else if (node.nodeType === 7) {
        piCount++;
      }
      Array.from(node.childNodes).forEach(c => walk(c, depth + 1));
    }
    walk(currentDoc.documentElement, 0);

    // Encoding
    const encMatch = raw.match(/encoding\s*=\s*["']([^"']+)["']/);
    const encoding = encMatch ? encMatch[1] : "(non déclaré)";
    const versionMatch = raw.match(/<\?xml[^?]*version\s*=\s*["']([^"']+)["']/);
    const version = versionMatch ? versionMatch[1] : "?";
    const rootName = currentDoc.documentElement.nodeName;

    let html = '<h4 class="font-bold text-slate-700 mb-2">Statistiques</h4>';
    html += '<div class="xw-info-grid">';
    html += '<span class="xw-info-label">Élément racine</span><span class="xw-info-val">&lt;' + escapeHtml(rootName) + '&gt;</span>';
    html += '<span class="xw-info-label">Version XML</span><span class="xw-info-val">' + escapeHtml(version) + '</span>';
    html += '<span class="xw-info-label">Encoding</span><span class="xw-info-val">' + escapeHtml(encoding) + '</span>';
    html += '<span class="xw-info-label">Éléments</span><span class="xw-info-val">' + elemCount + '</span>';
    html += '<span class="xw-info-label">Attributs</span><span class="xw-info-val">' + attrCount + '</span>';
    html += '<span class="xw-info-label">Nœuds texte</span><span class="xw-info-val">' + textCount + '</span>';
    html += '<span class="xw-info-label">Commentaires</span><span class="xw-info-val">' + commentCount + '</span>';
    html += '<span class="xw-info-label">Instructions</span><span class="xw-info-val">' + piCount + '</span>';
    html += '<span class="xw-info-label">Profondeur max</span><span class="xw-info-val">' + maxDepth + '</span>';
    html += '<span class="xw-info-label">Taille source</span><span class="xw-info-val">' + raw.length + ' car.</span>';
    html += '</div>';

    if (nsMap.size > 0) {
      html += '<h4 class="font-bold text-slate-700 mt-4 mb-2">Namespaces</h4>';
      html += '<table class="xw-ns-table"><tr><th>Préfixe</th><th>URI</th></tr>';
      nsMap.forEach((uri, prefix) => {
        html += '<tr><td>' + escapeHtml(prefix) + '</td><td>' + escapeHtml(uri) + '</td></tr>';
      });
      html += '</table>';
    } else {
      html += '<p class="text-slate-400 italic mt-3">Aucun namespace déclaré.</p>';
    }

    content.innerHTML = html;
  }

  // ==================== Schema view ====================

  const XSD_NS = "http://www.w3.org/2001/XMLSchema";
  let schemaIndex = null;

  const xsdChildren = (node, localName) =>
    Array.from(node.children).filter(
      (c) => c.namespaceURI === XSD_NS && c.localName === localName
    );
  const xsdAnyChildren = (node) =>
    Array.from(node.children).filter((c) => c.namespaceURI === XSD_NS);

  function stripPrefix(qname) {
    if (!qname) return "";
    const i = qname.indexOf(":");
    return i >= 0 ? qname.slice(i + 1) : qname;
  }

  function indexSchema(doc) {
    const root = doc.documentElement;
    if (!root || root.namespaceURI !== XSD_NS || root.localName !== "schema") {
      throw new Error("Ce n'est pas un XSD (racine attendue : xs:schema)");
    }
    const idx = {
      elements: new Map(),
      complexTypes: new Map(),
      simpleTypes: new Map(),
      attrGroups: new Map(),
      groups: new Map(),
    };
    xsdAnyChildren(root).forEach((n) => {
      const name = n.getAttribute("name");
      if (!name) return;
      if (n.localName === "element") idx.elements.set(name, n);
      else if (n.localName === "complexType") idx.complexTypes.set(name, n);
      else if (n.localName === "simpleType") idx.simpleTypes.set(name, n);
      else if (n.localName === "attributeGroup") idx.attrGroups.set(name, n);
      else if (n.localName === "group") idx.groups.set(name, n);
    });
    return idx;
  }

  function cardinality(node) {
    const min = node.getAttribute("minOccurs");
    const max = node.getAttribute("maxOccurs");
    const lo = min == null ? 1 : parseInt(min, 10);
    const hi = max == null ? 1 : (max === "unbounded" ? "∞" : parseInt(max, 10));
    return `[${lo}..${hi}]`;
  }

  function renderSchemaBox(elemNode, depthLeft, visited) {
    const box = document.createElement("div");
    box.className = "xs-box";
    const head = document.createElement("div");
    head.className = "xs-head";
    box.appendChild(head);

    const ref = elemNode.getAttribute("ref");
    if (ref) {
      const localRef = stripPrefix(ref);
      const target = schemaIndex.elements.get(localRef);
      const nameSpan = document.createElement("span");
      nameSpan.className = "xs-name";
      nameSpan.textContent = localRef;
      head.appendChild(nameSpan);
      const hint = document.createElement("span");
      hint.className = "xs-ref-hint";
      hint.textContent = "(ref)";
      head.appendChild(hint);
      const card = document.createElement("span");
      card.className = "xs-card";
      card.textContent = cardinality(elemNode);
      head.appendChild(card);
      if (target && depthLeft > 0 && !visited.has(localRef)) {
        const sub = renderSchemaBox(target, depthLeft - 1, new Set([...visited, localRef]));
        sub.querySelector(".xs-head").prepend(card);
        return sub;
      }
      return box;
    }

    const name = elemNode.getAttribute("name") || "(anonyme)";
    const nameSpan = document.createElement("span");
    nameSpan.className = "xs-name";
    nameSpan.textContent = name;
    head.appendChild(nameSpan);

    const card = document.createElement("span");
    card.className = "xs-card";
    card.textContent = cardinality(elemNode);
    head.appendChild(card);

    const typeAttr = elemNode.getAttribute("type");
    let typeDef = null;
    if (typeAttr) {
      const localType = stripPrefix(typeAttr);
      const t = document.createElement("span");
      t.className = "xs-type";
      t.textContent = ": " + typeAttr;
      head.appendChild(t);
      typeDef = schemaIndex.complexTypes.get(localType) || schemaIndex.simpleTypes.get(localType);
      if (typeDef) {
        t.style.cursor = "pointer";
        t.title = "Cliquer pour déplier le type";
        t.addEventListener("click", (e) => {
          e.stopPropagation();
          if (box.dataset.expanded === "1") return;
          box.dataset.expanded = "1";
          expandTypeInto(box, typeDef, depthLeft - 1, new Set([...visited, localType]));
        });
      }
    } else {
      const inlineCT = xsdChildren(elemNode, "complexType")[0];
      const inlineST = xsdChildren(elemNode, "simpleType")[0];
      typeDef = inlineCT || inlineST;
    }

    if (typeDef && depthLeft > 0) {
      const visitKey = typeDef.getAttribute("name") || "__inline__" + Math.random();
      if (!visited.has(visitKey)) {
        expandTypeInto(box, typeDef, depthLeft - 1, new Set([...visited, visitKey]));
        box.dataset.expanded = "1";
      }
    }

    return box;
  }

  function expandTypeInto(box, typeDef, depthLeft, visited) {
    if (typeDef.localName === "simpleType") {
      const restriction = xsdChildren(typeDef, "restriction")[0];
      if (restriction) {
        const base = restriction.getAttribute("base") || "?";
        const info = document.createElement("div");
        info.style.fontSize = "0.7rem";
        info.style.color = "#475569";
        info.style.marginTop = "0.3rem";
        const enums = xsdChildren(restriction, "enumeration").map(e => e.getAttribute("value"));
        let html = "base: <b>" + escapeHtml(base) + "</b>";
        if (enums.length) html += " — enum: " + enums.map(v => '"' + escapeHtml(v) + '"').join(", ");
        info.innerHTML = html;
        box.appendChild(info);
      }
      return;
    }

    const body = xsdChildren(typeDef, "sequence")[0]
              || xsdChildren(typeDef, "choice")[0]
              || xsdChildren(typeDef, "all")[0];
    if (body) {
      const label = document.createElement("div");
      label.style.marginTop = "0.4rem";
      const badge = document.createElement("span");
      badge.className = "xs-compositor " +
        (body.localName === "sequence" ? "xs-seq" : body.localName === "choice" ? "xs-cho" : "xs-all");
      badge.textContent = body.localName;
      label.appendChild(badge);
      box.appendChild(label);

      xsdChildren(body, "element").forEach((child) => {
        box.appendChild(renderSchemaBox(child, depthLeft, visited));
      });
    }

    const attrs = xsdChildren(typeDef, "attribute");
    if (attrs.length) {
      const wrap = document.createElement("div");
      wrap.className = "xs-attrs";
      attrs.forEach((a) => {
        const n = a.getAttribute("name") || a.getAttribute("ref") || "?";
        const tp = a.getAttribute("type") || "?";
        const use = a.getAttribute("use") || "optional";
        const span = document.createElement("span");
        span.innerHTML =
          '<span class="xs-attr-name">@' + escapeHtml(n) + '</span>' +
          ' <span class="xs-type">: ' + escapeHtml(tp) + '</span>' +
          (use === "required" ? ' <span class="xs-attr-req">*</span>' : '');
        wrap.appendChild(span);
      });
      box.appendChild(wrap);
    }
  }

  function runSchemaView(xsdText) {
    const status = $("schema-status");
    const view = $("schema-view");
    view.innerHTML = "";
    if (!xsdText) { status.textContent = "XSD vide."; return; }
    try {
      const doc = parseXml(xsdText);
      schemaIndex = indexSchema(doc);
      status.textContent =
        schemaIndex.elements.size + " elements · " +
        schemaIndex.complexTypes.size + " complexTypes · " +
        schemaIndex.simpleTypes.size + " simpleTypes";

      const title = document.createElement("div");
      title.className = "xs-root-title";
      title.textContent = "Éléments globaux";
      view.appendChild(title);

      if (schemaIndex.elements.size === 0) {
        const info = document.createElement("div");
        info.className = "text-xs text-slate-500 italic";
        info.textContent = "Aucun élément global défini.";
        view.appendChild(info);
      } else {
        schemaIndex.elements.forEach((el) => {
          view.appendChild(renderSchemaBox(el, 4, new Set()));
        });
      }

      if (schemaIndex.complexTypes.size) {
        const t2 = document.createElement("div");
        t2.className = "xs-root-title";
        t2.textContent = "complexTypes";
        view.appendChild(t2);
        schemaIndex.complexTypes.forEach((ct, name) => {
          const box = document.createElement("div");
          box.className = "xs-box";
          const head = document.createElement("div");
          head.className = "xs-head";
          head.innerHTML = '<span class="xs-name">' + escapeHtml(name) + '</span> <span class="xs-type">(complexType)</span>';
          box.appendChild(head);
          expandTypeInto(box, ct, 2, new Set([name]));
          view.appendChild(box);
        });
      }
    } catch (e) {
      status.textContent = "Erreur : " + e.message;
    }
  }

  // ==================== Model Browser ====================

  let modelIndex = null; // same shape as schemaIndex but for model tab
  let modelHistory = []; // navigation stack: [{kind, name}]
  let modelUsedBy = null; // Map<name, [{kind, name, context}]>

  function buildModelIndex(xsdText) {
    const doc = parseXml(xsdText);
    const idx = indexSchema(doc);

    // Build "used by" reverse index
    const usedBy = new Map();
    function addUsage(targetName, userKind, userName, context) {
      if (!usedBy.has(targetName)) usedBy.set(targetName, []);
      usedBy.get(targetName).push({ kind: userKind, name: userName, context });
    }

    function scanCompositor(comp, ownerKind, ownerName) {
      if (!comp) return;
      xsdChildren(comp, "element").forEach(el => {
        const ref = el.getAttribute("ref");
        if (ref) addUsage(stripPrefix(ref), ownerKind, ownerName, "element ref");
        const type = el.getAttribute("type");
        if (type) {
          const local = stripPrefix(type);
          if (idx.complexTypes.has(local) || idx.simpleTypes.has(local)) {
            addUsage(local, ownerKind, ownerName, "element type");
          }
        }
        // Inline types
        const inlineCT = xsdChildren(el, "complexType")[0];
        if (inlineCT) scanType(inlineCT, ownerKind, ownerName);
      });
    }

    function scanType(typeDef, ownerKind, ownerName) {
      const seq = xsdChildren(typeDef, "sequence")[0];
      const cho = xsdChildren(typeDef, "choice")[0];
      const all = xsdChildren(typeDef, "all")[0];
      scanCompositor(seq || cho || all, ownerKind, ownerName);
      // Extension / restriction base
      ["complexContent", "simpleContent"].forEach(wrapper => {
        const w = xsdChildren(typeDef, wrapper)[0];
        if (w) {
          ["extension", "restriction"].forEach(derive => {
            const d = xsdChildren(w, derive)[0];
            if (d) {
              const base = d.getAttribute("base");
              if (base) addUsage(stripPrefix(base), ownerKind, ownerName, derive);
              scanCompositor(xsdChildren(d, "sequence")[0] || xsdChildren(d, "choice")[0] || xsdChildren(d, "all")[0], ownerKind, ownerName);
            }
          });
        }
      });
    }

    // Scan global elements
    idx.elements.forEach((el, name) => {
      const type = el.getAttribute("type");
      if (type) {
        const local = stripPrefix(type);
        if (idx.complexTypes.has(local) || idx.simpleTypes.has(local)) {
          addUsage(local, "element", name, "type");
        }
      }
      const inlineCT = xsdChildren(el, "complexType")[0];
      if (inlineCT) scanType(inlineCT, "element", name);
    });

    // Scan complexTypes
    idx.complexTypes.forEach((ct, name) => {
      scanType(ct, "complexType", name);
    });

    return { idx, usedBy };
  }

  function renderModelToc() {
    const toc = $("model-toc");
    toc.innerHTML = "";

    function addSection(title, map, kind, cssClass) {
      if (map.size === 0) return;
      const h = document.createElement("div");
      h.className = "xm-toc-section";
      h.textContent = title + " (" + map.size + ")";
      toc.appendChild(h);
      map.forEach((_, name) => {
        const item = document.createElement("div");
        item.className = "xm-toc-item";
        item.textContent = name;
        item.title = kind + ": " + name;
        item.addEventListener("click", () => navigateModel(kind, name));
        toc.appendChild(item);
      });
    }

    addSection("Éléments", modelIndex.elements, "element", "xm-kind-elem");
    addSection("complexType", modelIndex.complexTypes, "complexType", "xm-kind-ct");
    addSection("simpleType", modelIndex.simpleTypes, "simpleType", "xm-kind-st");
    addSection("attributeGroup", modelIndex.attrGroups, "attributeGroup", "xm-kind-ag");
    addSection("group", modelIndex.groups, "group", "xm-kind-grp");
  }

  function navigateModel(kind, name) {
    modelHistory.push({ kind, name });
    renderModelDetail(kind, name);
    updateModelBreadcrumb();
    // Highlight TOC
    document.querySelectorAll(".xm-toc-item").forEach(el => {
      el.classList.toggle("active", el.textContent === name);
    });
  }

  function navigateModelTo(histIdx) {
    modelHistory = modelHistory.slice(0, histIdx + 1);
    const { kind, name } = modelHistory[histIdx];
    renderModelDetail(kind, name);
    updateModelBreadcrumb();
    document.querySelectorAll(".xm-toc-item").forEach(el => {
      el.classList.toggle("active", el.textContent === name);
    });
  }

  function updateModelBreadcrumb() {
    const detail = $("model-detail");
    let bc = detail.querySelector(".xm-breadcrumb");
    if (!bc) {
      bc = document.createElement("div");
      bc.className = "xm-breadcrumb";
      detail.insertBefore(bc, detail.firstChild);
    }
    bc.innerHTML = "";
    modelHistory.forEach((entry, i) => {
      if (i > 0) {
        const sep = document.createElement("span");
        sep.className = "xm-crumb-sep";
        sep.textContent = " › ";
        bc.appendChild(sep);
      }
      const crumb = document.createElement("span");
      crumb.className = "xm-crumb" + (i === modelHistory.length - 1 ? " current" : "");
      crumb.textContent = entry.name;
      if (i < modelHistory.length - 1) {
        crumb.addEventListener("click", () => navigateModelTo(i));
      }
      bc.appendChild(crumb);
    });
  }

  function renderModelDetail(kind, name) {
    const detail = $("model-detail");
    detail.innerHTML = "";

    const bc = document.createElement("div");
    bc.className = "xm-breadcrumb";
    detail.appendChild(bc);

    const card = document.createElement("div");
    card.className = "xm-card";
    detail.appendChild(card);

    const head = document.createElement("div");
    head.className = "xm-card-head";
    card.appendChild(head);

    // Kind badge
    const kindBadge = document.createElement("span");
    const kindMap = {
      element: "xm-kind-elem", complexType: "xm-kind-ct", simpleType: "xm-kind-st",
      attributeGroup: "xm-kind-ag", group: "xm-kind-grp"
    };
    kindBadge.className = "xm-card-kind " + (kindMap[kind] || "");
    kindBadge.textContent = kind;
    head.appendChild(kindBadge);

    const nameSpan = document.createElement("span");
    nameSpan.style.cssText = "font-weight:700; font-size:1rem; color:#1e293b;";
    nameSpan.textContent = name;
    head.appendChild(nameSpan);

    // Get the definition
    const defMap = {
      element: modelIndex.elements,
      complexType: modelIndex.complexTypes,
      simpleType: modelIndex.simpleTypes,
      attributeGroup: modelIndex.attrGroups,
      group: modelIndex.groups,
    };
    const def = (defMap[kind] || new Map()).get(name);
    if (!def) {
      const notFound = document.createElement("p");
      notFound.className = "text-slate-400 italic";
      notFound.textContent = "Définition non trouvée.";
      card.appendChild(notFound);
      return;
    }

    if (kind === "element") {
      renderModelElement(card, def, name);
    } else if (kind === "complexType") {
      renderModelComplexType(card, def, name);
    } else if (kind === "simpleType") {
      renderModelSimpleType(card, def, name);
    }

    // "Used by" section
    const usages = modelUsedBy.get(name);
    if (usages && usages.length > 0) {
      const title = document.createElement("div");
      title.className = "xm-section-title";
      title.textContent = "Utilisé par";
      detail.appendChild(title);
      usages.forEach(u => {
        const row = document.createElement("div");
        row.className = "xm-used-by";
        row.innerHTML = '<span class="xm-card-kind ' + (kindMap[u.kind] || "") + '">' + escapeHtml(u.kind) + '</span> ';
        const link = document.createElement("span");
        link.className = "xm-link";
        link.textContent = u.name;
        link.addEventListener("click", () => navigateModel(u.kind, u.name));
        row.appendChild(link);
        const ctx = document.createElement("span");
        ctx.style.cssText = "color:#94a3b8; font-size:0.68rem; margin-left:0.3rem;";
        ctx.textContent = "(" + u.context + ")";
        row.appendChild(ctx);
        detail.appendChild(row);
      });
    }
  }

  function renderModelElement(card, def, name) {
    const typeAttr = def.getAttribute("type");
    if (typeAttr) {
      const info = document.createElement("div");
      info.style.cssText = "font-size:0.78rem; margin-top:0.3rem;";
      info.innerHTML = 'Type : ';
      const local = stripPrefix(typeAttr);
      if (modelIndex.complexTypes.has(local) || modelIndex.simpleTypes.has(local)) {
        const link = document.createElement("span");
        link.className = "xm-link";
        link.textContent = typeAttr;
        link.addEventListener("click", () => {
          const k = modelIndex.complexTypes.has(local) ? "complexType" : "simpleType";
          navigateModel(k, local);
        });
        info.appendChild(link);
      } else {
        const span = document.createElement("span");
        span.className = "xs-type";
        span.textContent = typeAttr;
        info.appendChild(span);
      }
      card.appendChild(info);
    }

    // Inline complexType
    const inlineCT = xsdChildren(def, "complexType")[0];
    if (inlineCT) {
      renderModelComplexType(card, inlineCT, name + " (inline)");
    }

    // Attributes from type
    renderModelAttributes(card, def);
  }

  function renderModelComplexType(card, def, name) {
    // Extension / restriction
    ["complexContent", "simpleContent"].forEach(wrapper => {
      const w = xsdChildren(def, wrapper)[0];
      if (w) {
        ["extension", "restriction"].forEach(derive => {
          const d = xsdChildren(w, derive)[0];
          if (d) {
            const base = d.getAttribute("base");
            if (base) {
              const info = document.createElement("div");
              info.style.cssText = "font-size:0.75rem; margin-top:0.3rem; color:#475569;";
              info.textContent = derive + " de : ";
              const local = stripPrefix(base);
              if (modelIndex.complexTypes.has(local) || modelIndex.simpleTypes.has(local)) {
                const link = document.createElement("span");
                link.className = "xm-link";
                link.textContent = base;
                link.addEventListener("click", () => {
                  const k = modelIndex.complexTypes.has(local) ? "complexType" : "simpleType";
                  navigateModel(k, local);
                });
                info.appendChild(link);
              } else {
                info.textContent += base;
              }
              card.appendChild(info);
            }
            // Children of extension/restriction
            renderModelCompositor(card, d);
          }
        });
      }
    });

    // Direct compositor
    renderModelCompositor(card, def);

    // Attributes
    const attrs = xsdChildren(def, "attribute");
    if (attrs.length > 0) {
      const title = document.createElement("div");
      title.className = "xm-section-title";
      title.textContent = "Attributs";
      card.appendChild(title);
      attrs.forEach(a => {
        const row = document.createElement("div");
        row.className = "xm-child-row";
        const aName = a.getAttribute("name") || a.getAttribute("ref") || "?";
        const aType = a.getAttribute("type") || "?";
        const use = a.getAttribute("use") || "optional";
        row.innerHTML =
          '<span class="xm-connector"></span>' +
          '<span class="xs-attr-name">@' + escapeHtml(aName) + '</span> ' +
          '<span class="xs-type">' + escapeHtml(aType) + '</span> ' +
          (use === "required" ? '<span class="xs-attr-req">requis</span>' : '<span style="color:#94a3b8;font-size:0.7rem;">optionnel</span>');
        card.appendChild(row);
      });
    }
  }

  function renderModelCompositor(card, parent) {
    const seq = xsdChildren(parent, "sequence")[0];
    const cho = xsdChildren(parent, "choice")[0];
    const all = xsdChildren(parent, "all")[0];
    const comp = seq || cho || all;
    if (!comp) return;

    const compName = comp.localName;
    const title = document.createElement("div");
    title.className = "xm-section-title";
    title.style.display = "flex";
    title.style.alignItems = "center";
    title.style.gap = "0.4rem";
    const badge = document.createElement("span");
    badge.className = "xs-compositor " +
      (compName === "sequence" ? "xs-seq" : compName === "choice" ? "xs-cho" : "xs-all");
    badge.textContent = compName;
    title.appendChild(badge);
    const label = document.createElement("span");
    label.textContent = "Enfants";
    title.appendChild(label);
    card.appendChild(title);

    xsdChildren(comp, "element").forEach(el => {
      const row = document.createElement("div");
      row.className = "xm-child-row";
      const connector = document.createElement("span");
      connector.className = "xm-connector";
      row.appendChild(connector);

      const ref = el.getAttribute("ref");
      const elName = el.getAttribute("name") || stripPrefix(ref || "");
      const cardText = cardinality(el);

      const link = document.createElement("span");
      link.className = "xm-link";
      link.textContent = elName;

      if (ref) {
        const localRef = stripPrefix(ref);
        link.addEventListener("click", () => {
          if (modelIndex.elements.has(localRef)) navigateModel("element", localRef);
        });
      } else if (modelIndex.elements.has(elName)) {
        link.addEventListener("click", () => navigateModel("element", elName));
      }
      row.appendChild(link);

      const cardSpan = document.createElement("span");
      cardSpan.className = "xs-card";
      cardSpan.textContent = cardText;
      row.appendChild(cardSpan);

      // Type info
      const type = el.getAttribute("type");
      if (type) {
        const local = stripPrefix(type);
        const typeSpan = document.createElement("span");
        typeSpan.style.cssText = "font-size:0.72rem;";
        if (modelIndex.complexTypes.has(local) || modelIndex.simpleTypes.has(local)) {
          typeSpan.className = "xm-link";
          typeSpan.textContent = type;
          typeSpan.addEventListener("click", () => {
            const k = modelIndex.complexTypes.has(local) ? "complexType" : "simpleType";
            navigateModel(k, local);
          });
        } else {
          typeSpan.className = "xs-type";
          typeSpan.textContent = type;
        }
        row.appendChild(typeSpan);
      }

      card.appendChild(row);
    });
  }

  function renderModelSimpleType(card, def, name) {
    const restriction = xsdChildren(def, "restriction")[0];
    if (!restriction) return;
    const base = restriction.getAttribute("base") || "?";
    const info = document.createElement("div");
    info.style.cssText = "font-size:0.78rem; margin-top:0.3rem;";
    info.innerHTML = 'Base : ';
    const local = stripPrefix(base);
    if (modelIndex.simpleTypes.has(local) || modelIndex.complexTypes.has(local)) {
      const link = document.createElement("span");
      link.className = "xm-link";
      link.textContent = base;
      link.addEventListener("click", () => navigateModel("simpleType", local));
      info.appendChild(link);
    } else {
      const span = document.createElement("span");
      span.className = "xs-type";
      span.textContent = base;
      info.appendChild(span);
    }
    card.appendChild(info);

    const enums = xsdChildren(restriction, "enumeration").map(e => e.getAttribute("value"));
    if (enums.length > 0) {
      const title = document.createElement("div");
      title.className = "xm-section-title";
      title.textContent = "Valeurs autorisées";
      card.appendChild(title);
      const list = document.createElement("div");
      list.style.cssText = "display:flex; flex-wrap:wrap; gap:0.3rem;";
      enums.forEach(v => {
        const tag = document.createElement("span");
        tag.style.cssText = "background:#f1f5f9; padding:0.15rem 0.45rem; border-radius:4px; font-size:0.75rem; font-family:'JetBrains Mono',monospace;";
        tag.textContent = '"' + v + '"';
        list.appendChild(tag);
      });
      card.appendChild(list);
    }

    const patterns = xsdChildren(restriction, "pattern");
    if (patterns.length > 0) {
      const title = document.createElement("div");
      title.className = "xm-section-title";
      title.textContent = "Pattern";
      card.appendChild(title);
      patterns.forEach(p => {
        const code = document.createElement("code");
        code.style.cssText = "font-size:0.75rem; background:#f8fafc; padding:0.15rem 0.4rem; border-radius:3px;";
        code.textContent = p.getAttribute("value");
        card.appendChild(code);
      });
    }
  }

  function renderModelAttributes(card, elemDef) {
    // Resolve type's attributes
    const typeAttr = elemDef.getAttribute("type");
    let typeDef = null;
    if (typeAttr) {
      const local = stripPrefix(typeAttr);
      typeDef = modelIndex.complexTypes.get(local);
    }
    if (!typeDef) typeDef = xsdChildren(elemDef, "complexType")[0];
    if (!typeDef) return;
    const attrs = xsdChildren(typeDef, "attribute");
    if (attrs.length === 0) return;
    const title = document.createElement("div");
    title.className = "xm-section-title";
    title.textContent = "Attributs";
    card.appendChild(title);
    attrs.forEach(a => {
      const row = document.createElement("div");
      row.className = "xm-child-row";
      const aName = a.getAttribute("name") || a.getAttribute("ref") || "?";
      const aType = a.getAttribute("type") || "?";
      const use = a.getAttribute("use") || "optional";
      row.innerHTML =
        '<span class="xm-connector"></span>' +
        '<span class="xs-attr-name">@' + escapeHtml(aName) + '</span> ' +
        '<span class="xs-type">' + escapeHtml(aType) + '</span> ' +
        (use === "required" ? '<span class="xs-attr-req">requis</span>' : '<span style="color:#94a3b8;font-size:0.7rem;">optionnel</span>');
      card.appendChild(row);
    });
  }

  function loadModel(xsdText) {
    const status = $("model-status");
    if (!xsdText.trim()) { status.textContent = "XSD vide."; return; }
    try {
      const result = buildModelIndex(xsdText);
      modelIndex = result.idx;
      modelUsedBy = result.usedBy;
      modelHistory = [];
      renderModelToc();
      $("model-detail").innerHTML = '<p class="text-slate-400 italic text-xs">Sélectionner un élément ou type.</p>';
      status.textContent = modelIndex.elements.size + " elements · " +
        modelIndex.complexTypes.size + " complexTypes · " +
        modelIndex.simpleTypes.size + " simpleTypes";
      // Auto-navigate to first global element
      if (modelIndex.elements.size > 0) {
        const firstName = modelIndex.elements.keys().next().value;
        navigateModel("element", firstName);
      }
    } catch (e) {
      status.textContent = "Erreur : " + e.message;
    }
  }

  // ==================== XSD Validation ====================

  const XSD_BUILTIN_VALIDATORS = {
    string:       () => true,
    normalizedString: (v) => !/[\r\n\t]/.test(v),
    token:        (v) => !/[\r\n\t]/.test(v) && !/  /.test(v) && v === v.trim(),
    boolean:      (v) => /^(true|false|1|0)$/.test(v),
    integer:      (v) => /^[+-]?\d+$/.test(v),
    int:          (v) => /^[+-]?\d+$/.test(v) && +v >= -2147483648 && +v <= 2147483647,
    long:         (v) => /^[+-]?\d+$/.test(v),
    short:        (v) => /^[+-]?\d+$/.test(v) && +v >= -32768 && +v <= 32767,
    byte:         (v) => /^[+-]?\d+$/.test(v) && +v >= -128 && +v <= 127,
    decimal:      (v) => /^[+-]?\d+(\.\d+)?$/.test(v),
    float:        (v) => !isNaN(parseFloat(v)),
    double:       (v) => !isNaN(parseFloat(v)),
    positiveInteger: (v) => /^\d+$/.test(v) && +v > 0,
    nonNegativeInteger: (v) => /^\d+$/.test(v) && +v >= 0,
    negativeInteger: (v) => /^-\d+$/.test(v) && +v < 0,
    unsignedInt:  (v) => /^\d+$/.test(v) && +v <= 4294967295,
    unsignedShort:(v) => /^\d+$/.test(v) && +v <= 65535,
    unsignedByte: (v) => /^\d+$/.test(v) && +v <= 255,
    date:         (v) => /^\d{4}-\d{2}-\d{2}$/.test(v),
    dateTime:     (v) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v),
    time:         (v) => /^\d{2}:\d{2}:\d{2}/.test(v),
    gYear:        (v) => /^-?\d{4,}$/.test(v),
    gYearMonth:   (v) => /^-?\d{4,}-\d{2}$/.test(v),
    gMonth:       (v) => /^--\d{2}$/.test(v),
    gMonthDay:    (v) => /^--\d{2}-\d{2}$/.test(v),
    gDay:         (v) => /^---\d{2}$/.test(v),
    duration:     (v) => /^-?P/.test(v),
    anyURI:       () => true,
    QName:        (v) => /^[a-zA-Z_][\w.-]*(:[a-zA-Z_][\w.-]*)?$/.test(v),
    NCName:       (v) => /^[a-zA-Z_][\w.-]*$/.test(v),
    ID:           (v) => /^[a-zA-Z_][\w.-]*$/.test(v),
    IDREF:        (v) => /^[a-zA-Z_][\w.-]*$/.test(v),
    NMTOKEN:      (v) => /^[\w:.-]+$/.test(v),
    language:     (v) => /^[a-zA-Z]{1,8}(-[a-zA-Z0-9]{1,8})*$/.test(v),
    base64Binary: (v) => /^[A-Za-z0-9+/\s]*(={0,2})$/.test(v),
    hexBinary:    (v) => /^[0-9a-fA-F]*$/.test(v) && v.length % 2 === 0,
  };

  function validateXsd(xmlDoc, xsdDoc) {
    const errors = [];
    let idx;
    try {
      idx = indexSchema(xsdDoc);
    } catch (e) {
      return [{ xpath: "/", message: "XSD invalide : " + e.message }];
    }

    function resolveType(typeName) {
      if (!typeName) return null;
      const local = stripPrefix(typeName);
      return idx.complexTypes.get(local) || idx.simpleTypes.get(local) || null;
    }

    function getBuiltinValidator(typeName) {
      if (!typeName) return null;
      const local = stripPrefix(typeName);
      return XSD_BUILTIN_VALIDATORS[local] || null;
    }

    function validateElement(xmlEl, xsdEl, xpath) {
      // Resolve type
      const typeAttr = xsdEl.getAttribute("type");
      const inlineCT = xsdChildren(xsdEl, "complexType")[0];
      const inlineST = xsdChildren(xsdEl, "simpleType")[0];

      if (typeAttr) {
        const builtinVal = getBuiltinValidator(typeAttr);
        if (builtinVal) {
          // Simple built-in type
          const text = xmlEl.textContent;
          if (!builtinVal(text)) {
            errors.push({ xpath, message: "Valeur \"" + text.slice(0, 50) + "\" invalide pour le type " + typeAttr });
          }
          return;
        }
        const typeDef = resolveType(typeAttr);
        if (typeDef) {
          validateType(xmlEl, typeDef, xpath);
        }
        // Unknown type — skip
      } else if (inlineCT) {
        validateType(xmlEl, inlineCT, xpath);
      } else if (inlineST) {
        validateSimpleType(xmlEl.textContent, inlineST, xpath);
      }

      // Validate attributes defined by the type
      validateAttributes(xmlEl, xsdEl, xpath);
    }

    function validateAttributes(xmlEl, xsdEl, xpath) {
      const typeAttr = xsdEl.getAttribute("type");
      let typeDef = null;
      if (typeAttr) typeDef = resolveType(typeAttr);
      if (!typeDef) typeDef = xsdChildren(xsdEl, "complexType")[0];
      if (!typeDef) return;

      const xsdAttrs = xsdChildren(typeDef, "attribute");
      xsdAttrs.forEach(a => {
        const name = a.getAttribute("name");
        const use = a.getAttribute("use") || "optional";
        if (use === "required" && name && !xmlEl.hasAttribute(name)) {
          errors.push({ xpath, message: "Attribut requis manquant : @" + name });
        }
        if (name && xmlEl.hasAttribute(name)) {
          const atType = a.getAttribute("type");
          const val = xmlEl.getAttribute(name);
          const validator = getBuiltinValidator(atType);
          if (validator && !validator(val)) {
            errors.push({ xpath, message: "Attribut @" + name + " : valeur \"" + val.slice(0, 50) + "\" invalide pour " + atType });
          }
        }
      });
    }

    function validateSimpleType(value, stDef, xpath) {
      const restriction = xsdChildren(stDef, "restriction")[0];
      if (!restriction) return;
      const base = restriction.getAttribute("base");
      const builtinVal = getBuiltinValidator(base);
      if (builtinVal && !builtinVal(value)) {
        errors.push({ xpath, message: "Valeur \"" + value.slice(0, 50) + "\" invalide pour le type de base " + base });
      }
      // Enumerations
      const enums = xsdChildren(restriction, "enumeration").map(e => e.getAttribute("value"));
      if (enums.length > 0 && !enums.includes(value)) {
        errors.push({ xpath, message: "Valeur \"" + value.slice(0, 50) + "\" non autorisée. Valeurs possibles : " + enums.join(", ") });
      }
      // Pattern
      const patterns = xsdChildren(restriction, "pattern");
      patterns.forEach(p => {
        const pat = p.getAttribute("value");
        if (pat) {
          try {
            if (!new RegExp("^" + pat + "$").test(value)) {
              errors.push({ xpath, message: "Valeur ne correspond pas au pattern : " + pat });
            }
          } catch (_) {}
        }
      });
      // minLength, maxLength
      const minLen = xsdChildren(restriction, "minLength")[0];
      const maxLen = xsdChildren(restriction, "maxLength")[0];
      if (minLen && value.length < parseInt(minLen.getAttribute("value"), 10)) {
        errors.push({ xpath, message: "Valeur trop courte (min " + minLen.getAttribute("value") + ")" });
      }
      if (maxLen && value.length > parseInt(maxLen.getAttribute("value"), 10)) {
        errors.push({ xpath, message: "Valeur trop longue (max " + maxLen.getAttribute("value") + ")" });
      }
    }

    function validateType(xmlEl, typeDef, xpath) {
      if (typeDef.localName === "simpleType") {
        validateSimpleType(xmlEl.textContent, typeDef, xpath);
        return;
      }

      // complexType — check compositor
      const seq = xsdChildren(typeDef, "sequence")[0];
      const choice = xsdChildren(typeDef, "choice")[0];
      const all = xsdChildren(typeDef, "all")[0];
      const compositor = seq || choice || all;

      if (!compositor) return; // empty or mixed content — skip

      const xmlChildren = Array.from(xmlEl.children);

      if (seq) {
        validateSequence(xmlChildren, seq, xpath);
      } else if (choice) {
        validateChoice(xmlChildren, choice, xpath);
      } else if (all) {
        validateAll(xmlChildren, all, xpath);
      }

      // Check required attributes
      const xsdAttrs = xsdChildren(typeDef, "attribute");
      xsdAttrs.forEach(a => {
        const name = a.getAttribute("name");
        const use = a.getAttribute("use") || "optional";
        if (use === "required" && name && !xmlEl.hasAttribute(name)) {
          errors.push({ xpath, message: "Attribut requis manquant : @" + name });
        }
        if (name && xmlEl.hasAttribute(name)) {
          const atType = a.getAttribute("type");
          const val = xmlEl.getAttribute(name);
          const validator = getBuiltinValidator(atType);
          if (validator && !validator(val)) {
            errors.push({ xpath, message: "Attribut @" + name + " : valeur invalide pour " + atType });
          }
        }
      });
    }

    function validateSequence(xmlChildren, seqNode, parentXpath) {
      const expectedElems = xsdChildren(seqNode, "element");
      let xmlIdx = 0;

      expectedElems.forEach(xsdEl => {
        const name = xsdEl.getAttribute("name") || stripPrefix(xsdEl.getAttribute("ref") || "");
        const resolvedXsd = xsdEl.getAttribute("ref") ? (idx.elements.get(stripPrefix(xsdEl.getAttribute("ref"))) || xsdEl) : xsdEl;
        const minOcc = parseInt(xsdEl.getAttribute("minOccurs") || "1", 10);
        const maxOcc = xsdEl.getAttribute("maxOccurs") === "unbounded" ? Infinity : parseInt(xsdEl.getAttribute("maxOccurs") || "1", 10);

        let count = 0;
        while (xmlIdx < xmlChildren.length && xmlChildren[xmlIdx].localName === name && count < maxOcc) {
          const childXpath = parentXpath + "/" + name + (maxOcc > 1 ? "[" + (count + 1) + "]" : "");
          validateElement(xmlChildren[xmlIdx], resolvedXsd, childXpath);
          count++;
          xmlIdx++;
        }

        if (count < minOcc) {
          errors.push({ xpath: parentXpath, message: "Élément <" + name + "> attendu (min " + minOcc + ", trouvé " + count + ")" });
        }
      });

      // Remaining unexpected children
      while (xmlIdx < xmlChildren.length) {
        errors.push({ xpath: parentXpath, message: "Élément inattendu : <" + xmlChildren[xmlIdx].localName + ">" });
        xmlIdx++;
      }
    }

    function validateChoice(xmlChildren, choiceNode, parentXpath) {
      const options = xsdChildren(choiceNode, "element");
      const names = options.map(e => e.getAttribute("name") || stripPrefix(e.getAttribute("ref") || ""));

      if (xmlChildren.length === 0) {
        const minOcc = parseInt(choiceNode.getAttribute("minOccurs") || "1", 10);
        if (minOcc > 0) {
          errors.push({ xpath: parentXpath, message: "Choix requis parmi : " + names.join(", ") });
        }
        return;
      }

      xmlChildren.forEach(child => {
        const idx2 = names.indexOf(child.localName);
        if (idx2 < 0) {
          errors.push({ xpath: parentXpath, message: "Élément <" + child.localName + "> non autorisé dans ce choix. Options : " + names.join(", ") });
        } else {
          const resolvedXsd = options[idx2].getAttribute("ref") ? (idx.elements.get(stripPrefix(options[idx2].getAttribute("ref"))) || options[idx2]) : options[idx2];
          validateElement(child, resolvedXsd, parentXpath + "/" + child.localName);
        }
      });
    }

    function validateAll(xmlChildren, allNode, parentXpath) {
      const expectedElems = xsdChildren(allNode, "element");
      const found = new Set();

      xmlChildren.forEach(child => {
        const matchIdx = expectedElems.findIndex(e =>
          (e.getAttribute("name") || stripPrefix(e.getAttribute("ref") || "")) === child.localName
        );
        if (matchIdx < 0) {
          errors.push({ xpath: parentXpath, message: "Élément inattendu : <" + child.localName + ">" });
        } else {
          found.add(matchIdx);
          const xsdEl = expectedElems[matchIdx];
          const resolvedXsd = xsdEl.getAttribute("ref") ? (idx.elements.get(stripPrefix(xsdEl.getAttribute("ref"))) || xsdEl) : xsdEl;
          validateElement(child, resolvedXsd, parentXpath + "/" + child.localName);
        }
      });

      expectedElems.forEach((e, i) => {
        const minOcc = parseInt(e.getAttribute("minOccurs") || "1", 10);
        if (minOcc > 0 && !found.has(i)) {
          const name = e.getAttribute("name") || stripPrefix(e.getAttribute("ref") || "");
          errors.push({ xpath: parentXpath, message: "Élément requis manquant : <" + name + ">" });
        }
      });
    }

    // Start validation from root
    const rootEl = xmlDoc.documentElement;
    const rootName = rootEl.localName;
    const xsdRoot = idx.elements.get(rootName);
    if (!xsdRoot) {
      errors.push({ xpath: "/" + rootName, message: "Élément racine <" + rootName + "> non défini dans le XSD" });
      return errors;
    }

    validateElement(rootEl, xsdRoot, "/" + rootName);
    return errors;
  }

  function runValidation() {
    const resultsEl = $("validation-results");
    resultsEl.innerHTML = "";
    const status = $("schema-status");

    if (!currentDoc) {
      status.textContent = "Analyser d'abord un XML.";
      return;
    }

    const xsdText = $("xsd-input").value.trim();
    if (!xsdText) {
      status.textContent = "Colle un XSD dans le champ ci-dessus.";
      return;
    }

    let xsdDoc;
    try {
      xsdDoc = parseXml(xsdText);
    } catch (e) {
      status.textContent = "XSD invalide : " + e.message;
      return;
    }

    const errors = validateXsd(currentDoc, xsdDoc);

    if (errors.length === 0) {
      status.textContent = "Validation OK";
      const ok = document.createElement("div");
      ok.className = "xw-warn-item";
      ok.style.borderLeftColor = "#10b981";
      ok.style.background = "#ecfdf5";
      ok.textContent = "XML valide selon le XSD.";
      resultsEl.appendChild(ok);
    } else {
      status.textContent = errors.length + " erreur(s)";
      errors.forEach(err => {
        const div = document.createElement("div");
        div.className = "xw-err-item";
        div.innerHTML = '<b>' + escapeHtml(err.xpath) + '</b> — ' + escapeHtml(err.message);
        resultsEl.appendChild(div);
      });
    }

    // Also show schema view
    runSchemaView(xsdText);
  }

  // ==================== CodeMirror ====================

  function initCodeMirror() {
    if (!window.CM || cmView) return;
    const { EditorView, basicSetup, xml } = window.CM;
    const content = $("xml-input").value;
    $("xml-input").style.display = "none";
    $("cm-wrap").style.display = "";
    cmView = new EditorView({
      doc: content,
      extensions: [basicSetup, xml()],
      parent: $("cm-wrap"),
    });
  }

  // ==================== Init ====================

  document.addEventListener("DOMContentLoaded", () => {
    $("parse-btn").addEventListener("click", runParse);
    $("pretty-btn").addEventListener("click", () => {
      try { setXmlInput(prettyPrint(getXmlInput())); runParse(); } catch (_) {}
    });
    $("minify-btn").addEventListener("click", () => {
      try { setXmlInput(minify(getXmlInput())); runParse(); } catch (_) {}
    });

    // Example
    $("example-btn").addEventListener("click", () => {
      setXmlInput(
`<?xml version="1.0" encoding="UTF-8"?>
<library>
  <book id="b1" category="fiction">
    <title lang="en">The Hobbit</title>
    <author>J.R.R. Tolkien</author>
    <year>1937</year>
    <price currency="EUR">12.50</price>
  </book>
  <book id="b2" category="tech">
    <title lang="en">Clean Code</title>
    <author>Robert C. Martin</author>
    <year>2008</year>
    <price currency="EUR">34.90</price>
  </book>
  <book id="b3" category="fiction">
    <title lang="fr">Le Petit Prince</title>
    <author>Antoine de Saint-Exupéry</author>
    <year>1943</year>
    <price currency="EUR">7.90</price>
  </book>
</library>`);
      runParse();
      $("xpath-input").value = "//book[@category='fiction']/title";
    });

    // Tabs
    document.querySelectorAll(".xw-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".xw-tab").forEach(t => t.classList.remove("active"));
        document.querySelectorAll(".xw-panel").forEach(p => p.classList.remove("active"));
        tab.classList.add("active");
        document.querySelector('.xw-panel[data-panel="' + tab.dataset.tab + '"]').classList.add("active");
      });
    });

    // XPath
    $("xpath-run").addEventListener("click", runXPath);
    $("xpath-input").addEventListener("keydown", (e) => { if (e.key === "Enter") runXPath(); });

    // XSLT
    $("xslt-run").addEventListener("click", runXslt);
    $("xslt-example").addEventListener("click", () => {
      $("xslt-input").value =
`<?xml version="1.0"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="html" indent="yes"/>
  <xsl:template match="/library">
    <ul>
      <xsl:for-each select="book">
        <li><b><xsl:value-of select="title"/></b> — <xsl:value-of select="author"/> (<xsl:value-of select="year"/>)</li>
      </xsl:for-each>
    </ul>
  </xsl:template>
</xsl:stylesheet>`;
      runXslt();
    });

    // Schema + Validation
    $("schema-load").addEventListener("click", () => {
      const raw = getXmlInput().trim();
      $("xsd-input").value = raw;
      runSchemaView(raw);
    });
    $("validate-btn").addEventListener("click", runValidation);
    $("schema-example").addEventListener("click", () => {
      const xsd =
`<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">

  <xs:element name="library" type="LibraryType"/>

  <xs:complexType name="LibraryType">
    <xs:sequence>
      <xs:element name="book" type="BookType" minOccurs="0" maxOccurs="unbounded"/>
    </xs:sequence>
    <xs:attribute name="name" type="xs:string" use="required"/>
  </xs:complexType>

  <xs:complexType name="BookType">
    <xs:sequence>
      <xs:element name="title" type="xs:string"/>
      <xs:element name="author" type="xs:string" maxOccurs="unbounded"/>
      <xs:element name="year" type="xs:gYear"/>
      <xs:element name="price" type="PriceType"/>
    </xs:sequence>
    <xs:attribute name="id" type="xs:ID" use="required"/>
    <xs:attribute name="category" type="CategoryType"/>
  </xs:complexType>

  <xs:complexType name="PriceType">
    <xs:attribute name="currency" type="xs:string" use="required"/>
  </xs:complexType>

  <xs:simpleType name="CategoryType">
    <xs:restriction base="xs:string">
      <xs:enumeration value="fiction"/>
      <xs:enumeration value="tech"/>
      <xs:enumeration value="history"/>
    </xs:restriction>
  </xs:simpleType>

</xs:schema>`;
      $("xsd-input").value = xsd;
      runSchemaView(xsd);
    });

    // Model browser
    $("model-load").addEventListener("click", () => {
      loadModel(getXmlInput().trim());
    });
    $("model-from-schema").addEventListener("click", () => {
      const xsd = $("xsd-input").value.trim();
      if (xsd) loadModel(xsd);
      else $("model-status").textContent = "Le champ XSD de l'onglet Schema est vide.";
    });

    // Tree search
    $("tree-search-btn").addEventListener("click", () => searchTree($("tree-search").value.trim()));
    $("tree-search").addEventListener("keydown", (e) => {
      if (e.key === "Enter") searchTree($("tree-search").value.trim());
    });

    // Copy XPath
    $("copy-xpath-btn").addEventListener("click", async () => {
      const xpath = $("node-xpath").textContent;
      if (xpath) {
        await ToolExport.copyText(xpath);
        $("copy-xpath-btn").textContent = "Copié !";
        setTimeout(() => { $("copy-xpath-btn").textContent = "Copier XPath"; }, 1500);
      }
    });

    // Export JSON
    $("copy-json-btn").addEventListener("click", async () => {
      if (!selectedXmlNode) return;
      const json = JSON.stringify(xmlToJson(selectedXmlNode), null, 2);
      await ToolExport.copyText(json);
      $("copy-json-btn").textContent = "Copié !";
      setTimeout(() => { $("copy-json-btn").textContent = "Export JSON"; }, 1500);
    });

    // Download standalone
    $("download-html").addEventListener("click", () => {
      ToolExport.downloadStandalone({
        filename: "xml-workbench.html",
        title: "XML Workbench",
      });
    });

    ToolExport.attachActions($("tree").parentElement.parentElement, () => {
      if (!currentDoc) return null;
      try { return prettyPrint(getXmlInput()); }
      catch (_) { return getXmlInput(); }
    });

    // CodeMirror
    if (window.CM) {
      initCodeMirror();
    } else {
      window.addEventListener("cm-ready", initCodeMirror);
    }
  });
})();
