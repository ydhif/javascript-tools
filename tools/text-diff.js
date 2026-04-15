(function () {
  const $ = (id) => document.getElementById(id);

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Découpe les parts jsdiff en lignes pour construire une vue alignée.
  // Retourne une liste de "rows" avec { type, leftNo, leftText, rightNo, rightText }
  function buildRows(parts) {
    const rows = [];
    let lineA = 0, lineB = 0;
    let i = 0;

    // On accumule d'abord par blocs : context / removed / added.
    while (i < parts.length) {
      const p = parts[i];
      const linesOf = (text) => {
        const arr = text.split("\n");
        if (arr.length && arr[arr.length - 1] === "") arr.pop();
        return arr;
      };

      if (!p.added && !p.removed) {
        linesOf(p.value).forEach((l) => {
          lineA++; lineB++;
          rows.push({ type: "ctx", leftNo: lineA, leftText: l, rightNo: lineB, rightText: l });
        });
        i++;
      } else {
        // Paire removed + added consécutive => modification ligne à ligne
        const rem = p.removed ? p : null;
        const add = (rem && parts[i + 1] && parts[i + 1].added) ? parts[i + 1]
                  : (!rem && p.added) ? p : null;
        if (rem && add) {
          const L = linesOf(rem.value);
          const R = linesOf(add.value);
          const n = Math.max(L.length, R.length);
          for (let k = 0; k < n; k++) {
            const lTxt = L[k]; const rTxt = R[k];
            if (lTxt != null && rTxt != null) {
              lineA++; lineB++;
              rows.push({ type: "mod", leftNo: lineA, leftText: lTxt, rightNo: lineB, rightText: rTxt });
            } else if (lTxt != null) {
              lineA++;
              rows.push({ type: "del", leftNo: lineA, leftText: lTxt, rightNo: null, rightText: null });
            } else {
              lineB++;
              rows.push({ type: "add", leftNo: null, leftText: null, rightNo: lineB, rightText: rTxt });
            }
          }
          i += 2;
        } else if (rem) {
          linesOf(rem.value).forEach((l) => {
            lineA++;
            rows.push({ type: "del", leftNo: lineA, leftText: l, rightNo: null, rightText: null });
          });
          i++;
        } else {
          linesOf(p.value).forEach((l) => {
            lineB++;
            rows.push({ type: "add", leftNo: null, leftText: null, rightNo: lineB, rightText: l });
          });
          i++;
        }
      }
    }
    return rows;
  }

  // Diff intra-ligne au niveau mot, renvoie HTML gauche et droite
  function diffWords(a, b) {
    const parts = Diff.diffWordsWithSpace(a, b);
    let left = "", right = "";
    parts.forEach((p) => {
      const h = escapeHtml(p.value);
      if (p.added) right += '<span class="td-word-add">' + h + "</span>";
      else if (p.removed) left += '<span class="td-word-del">' + h + "</span>";
      else { left += h; right += h; }
    });
    return { left, right };
  }

  function render(rows, unified) {
    const view = $("diff-view");
    view.classList.toggle("td-unified", unified);
    const table = document.createElement("table");
    table.className = "td-table";

    const addCell = (tr, cls, content) => {
      const td = document.createElement("td");
      td.className = cls;
      if (content != null) td.innerHTML = content;
      tr.appendChild(td);
    };

    if (unified) {
      rows.forEach((r) => {
        if (r.type === "mod") {
          const trD = document.createElement("tr");
          trD.className = "td-row-del";
          addCell(trD, "td-gutter", r.leftNo != null ? String(r.leftNo) : "");
          addCell(trD, "td-gutter", "");
          addCell(trD, "", "- " + escapeHtml(r.leftText));
          table.appendChild(trD);
          const trA = document.createElement("tr");
          trA.className = "td-row-add";
          addCell(trA, "td-gutter", "");
          addCell(trA, "td-gutter", r.rightNo != null ? String(r.rightNo) : "");
          addCell(trA, "", "+ " + escapeHtml(r.rightText));
          table.appendChild(trA);
        } else {
          const tr = document.createElement("tr");
          let cls = "", prefix = "  ", text = "";
          if (r.type === "ctx") { text = r.leftText; }
          else if (r.type === "add") { cls = "td-row-add"; prefix = "+ "; text = r.rightText; }
          else if (r.type === "del") { cls = "td-row-del"; prefix = "- "; text = r.leftText; }
          tr.className = cls;
          addCell(tr, "td-gutter", r.leftNo != null ? String(r.leftNo) : "");
          addCell(tr, "td-gutter", r.rightNo != null ? String(r.rightNo) : "");
          addCell(tr, "", prefix + escapeHtml(text));
          table.appendChild(tr);
        }
      });
    } else {
      rows.forEach((r) => {
        const tr = document.createElement("tr");
        let leftHtml = r.leftText != null ? escapeHtml(r.leftText) : "";
        let rightHtml = r.rightText != null ? escapeHtml(r.rightText) : "";
        if (r.type === "mod") {
          tr.className = "";
          const w = diffWords(r.leftText, r.rightText);
          leftHtml = w.left; rightHtml = w.right;
          addCell(tr, "td-gutter", String(r.leftNo));
          const tdL = document.createElement("td");
          tdL.className = "td-side td-row-mod-l";
          tdL.innerHTML = leftHtml;
          tr.appendChild(tdL);
          addCell(tr, "td-gutter", String(r.rightNo));
          const tdR = document.createElement("td");
          tdR.className = "td-side td-row-mod-r";
          tdR.innerHTML = rightHtml;
          tr.appendChild(tdR);
        } else if (r.type === "ctx") {
          addCell(tr, "td-gutter", String(r.leftNo));
          addCell(tr, "td-side", leftHtml);
          addCell(tr, "td-gutter", String(r.rightNo));
          addCell(tr, "td-side", rightHtml);
        } else if (r.type === "del") {
          addCell(tr, "td-gutter", String(r.leftNo));
          const tdL = document.createElement("td");
          tdL.className = "td-side td-row-del"; tdL.innerHTML = leftHtml;
          tr.appendChild(tdL);
          addCell(tr, "td-gutter", "");
          const tdR = document.createElement("td");
          tdR.className = "td-side td-row-empty";
          tr.appendChild(tdR);
        } else if (r.type === "add") {
          addCell(tr, "td-gutter", "");
          const tdL = document.createElement("td");
          tdL.className = "td-side td-row-empty";
          tr.appendChild(tdL);
          addCell(tr, "td-gutter", String(r.rightNo));
          const tdR = document.createElement("td");
          tdR.className = "td-side td-row-add"; tdR.innerHTML = rightHtml;
          tr.appendChild(tdR);
        }
        table.appendChild(tr);
      });
    }

    view.innerHTML = "";
    view.appendChild(table);
  }

  function runDiff() {
    const a = $("text-a").value;
    const b = $("text-b").value;
    if (!a && !b) return;
    const opts = {
      ignoreWhitespace: $("ign-ws").checked,
      ignoreCase: $("ign-case").checked,
    };
    const parts = Diff.diffLines(a, b, opts);
    const rows = buildRows(parts);
    const add = rows.filter(r => r.type === "add").length;
    const del = rows.filter(r => r.type === "del").length;
    const mod = rows.filter(r => r.type === "mod").length;
    $("diff-stats").textContent =
      `+${add} ajoutées · -${del} supprimées · ~${mod} modifiées · ${rows.length} lignes au total`;
    $("result-section").classList.remove("hidden");
    render(rows, $("mode-unified").checked);
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("diff-btn").addEventListener("click", runDiff);
    $("example-btn").addEventListener("click", () => {
      $("text-a").value = [
        "function greet(name) {",
        "  const msg = 'Hello, ' + name;",
        "  console.log(msg);",
        "  return msg;",
        "}",
        "",
        "greet('World');",
      ].join("\n");
      $("text-b").value = [
        "function greet(name, lang = 'en') {",
        "  const greetings = { en: 'Hello', fr: 'Bonjour' };",
        "  const msg = `${greetings[lang]}, ${name}!`;",
        "  console.log(msg);",
        "  return msg;",
        "}",
        "",
        "greet('World', 'fr');",
      ].join("\n");
      runDiff();
    });
    $("swap-btn").addEventListener("click", () => {
      const a = $("text-a").value;
      $("text-a").value = $("text-b").value;
      $("text-b").value = a;
      runDiff();
    });
    ["mode-unified", "ign-ws", "ign-case"].forEach((id) => {
      $(id).addEventListener("change", () => {
        if (!$("result-section").classList.contains("hidden")) runDiff();
      });
    });

    $("download-html").addEventListener("click", () => {
      ToolExport.downloadStandalone({
        filename: "text-diff.html",
        title: "TextDiff",
        inlineScripts: ["./text-diff.js"],
      });
    });

    ToolExport.attachActions($("result-section"), () => {
      const a = $("text-a").value;
      const b = $("text-b").value;
      if (!a && !b) return null;
      return Diff.createTwoFilesPatch("a.txt", "b.txt", a, b, "", "");
    });
  });
})();
