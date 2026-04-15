(function () {
  const $ = (id) => document.getElementById(id);
  let currentDoc = null;
  let nodeToEl = new WeakMap();

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // Parse avec détection d'erreurs (DOMParser met un <parsererror>)
  function parseXml(text) {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    const err = doc.querySelector("parsererror");
    if (err) throw new Error(err.textContent.replace(/\s+/g, " ").trim());
    return doc;
  }

  // Pretty-print simple par parcours récursif
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
      }
    }
    write(doc.documentElement, hasDecl ? 0 : 0);
    return out.join("\n");
  }

  function minify(xml) {
    const doc = parseXml(xml);
    return new XMLSerializer().serializeToString(doc);
  }

  // Vue arbre
  function renderTree() {
    const tree = $("tree");
    tree.innerHTML = "";
    nodeToEl = new WeakMap();
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
      const onClick = (e) => {
        e.stopPropagation();
        setOpen(childrenBox.style.display === "none");
      };
      toggle.addEventListener("click", onClick);
      open.addEventListener("click", onClick);
      if (depth < 1) setOpen(true);
      wrap._setOpen = setOpen;
    }

    nodeToEl.set(node, wrap);
    return wrap;
  }

  function runParse() {
    const raw = $("xml-input").value.trim();
    const status = $("parse-status");
    if (!raw) { status.textContent = "Entrée vide."; return; }
    try {
      currentDoc = parseXml(raw);
      status.textContent = "✓ XML bien formé";
      status.className = "text-sm text-emerald-700 font-medium mt-2";
      renderTree();
    } catch (e) {
      currentDoc = null;
      status.textContent = "✗ " + e.message;
      status.className = "text-sm text-red-700 font-medium mt-2";
      $("tree").innerHTML = "";
    }
  }

  // XPath 1.0 natif
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
        $("xpath-stats").textContent = nodes.length + " nœud(s) trouvé(s)";
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
      $("xpath-stats").textContent = "✗ " + e.message;
    }
  }

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
      $("xslt-output").textContent = "✗ " + e.message;
    }
  }

  // ---------- Schema (XSD) view ----------
  const XSD_NS = "http://www.w3.org/2001/XMLSchema";
  let schemaIndex = null; // { elements: Map, complexTypes: Map, simpleTypes: Map, attrGroups: Map, groups: Map }

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

    // ref="..." → résolution
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
        // On remplace la box extérieure par celle de la cible (avec cardinalité du ref)
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

    // type résolu
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
      // inline complexType / simpleType
      const inlineCT = xsdChildren(elemNode, "complexType")[0];
      const inlineST = xsdChildren(elemNode, "simpleType")[0];
      typeDef = inlineCT || inlineST;
    }

    // Auto-expansion si profondeur restante
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

    // complexType : compositor + attributes
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

  function runSchema() {
    const status = $("schema-status");
    const view = $("schema-view");
    view.innerHTML = "";
    const raw = $("xml-input").value.trim();
    if (!raw) { status.textContent = "Colle un XSD dans la source à gauche."; return; }
    try {
      const doc = parseXml(raw);
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
      status.textContent = "✗ " + e.message;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("parse-btn").addEventListener("click", runParse);
    $("pretty-btn").addEventListener("click", () => {
      try { $("xml-input").value = prettyPrint($("xml-input").value); runParse(); } catch (_) {}
    });
    $("minify-btn").addEventListener("click", () => {
      try { $("xml-input").value = minify($("xml-input").value); runParse(); } catch (_) {}
    });
    $("example-btn").addEventListener("click", () => {
      $("xml-input").value =
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
</library>`;
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

    $("xpath-run").addEventListener("click", runXPath);
    $("xpath-input").addEventListener("keydown", (e) => { if (e.key === "Enter") runXPath(); });

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

    $("schema-load").addEventListener("click", runSchema);
    $("schema-example").addEventListener("click", () => {
      $("xml-input").value =
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
      runSchema();
    });

    $("download-html").addEventListener("click", () => {
      ToolExport.downloadStandalone({
        filename: "xml-workbench.html",
        title: "XML Workbench",
        inlineScripts: ["./xml-workbench.js"],
      });
    });

    ToolExport.attachActions($("tree").parentElement.parentElement, () => {
      if (!currentDoc) return null;
      try { return prettyPrint($("xml-input").value); }
      catch (_) { return $("xml-input").value; }
    });
  });
})();
