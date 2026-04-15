(function () {
  let spec = null;
  let lastResult = null;

  // Exemple OpenAPI 3 minimal : API users avec GET /users/{id} -> 200 User, 404.
  // La réponse d'exemple ci-dessous inclut volontairement un champ additionnel
  // (`nickname`) pour illustrer la détection des champs non déclarés.
  const EXAMPLE_SPEC = {
    openapi: "3.0.0",
    info: { title: "Demo Users API", version: "1.0.0" },
    paths: {
      "/users/{id}": {
        get: {
          summary: "Récupère un utilisateur par ID",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
          ],
          responses: {
            "200": {
              description: "Utilisateur trouvé",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/User" } },
              },
            },
            "404": {
              description: "Utilisateur introuvable",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/Error" } },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        User: {
          type: "object",
          required: ["id", "email", "createdAt"],
          properties: {
            id: { type: "integer", minimum: 1, example: 42 },
            email: { type: "string", format: "email", maxLength: 120, example: "alice@example.com" },
            firstName: { type: "string", minLength: 1, maxLength: 50, example: "Alice" },
            lastName:  { type: "string", minLength: 1, maxLength: 50, example: "Martin" },
            // countryCode : code ISO 3166-1 alpha-2, exactement 2 caractères
            countryCode: { type: "string", minLength: 2, maxLength: 2, example: "FR" },
            role: { type: "string", enum: ["admin", "user", "guest"], example: "user" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Error: {
          type: "object",
          required: ["code", "message"],
          properties: {
            code: { type: "string", pattern: "^[A-Z_]+$", maxLength: 32, example: "NOT_FOUND" },
            message: { type: "string", maxLength: 500, example: "User not found" },
          },
        },
      },
    },
  };
  // Réponse d'exemple : respecte TOUTES les contraintes du schéma (type, format,
  // minLength/maxLength, pattern, enum) pour que la validation passe. Seule
  // violation volontaire : un champ additionnel `nickname` non déclaré → démontre
  // la détection des champs additionnels.
  const EXAMPLE_RESPONSE = {
    id: 42,
    email: "alice@example.com",
    firstName: "Alice",
    lastName: "Martin",
    countryCode: "FR",
    role: "user",
    createdAt: "2026-04-15T10:00:00Z",
    nickname: "Ali",
  };

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("download-html").addEventListener("click", () => {
      ToolExport.downloadStandalone({
        filename: "swagger-guard.html",
        title: "SwaggerGuard",
        inlineScripts: ["../assets/js/export.js", "./swagger-guard.js"],
      });
    });
    document.getElementById("load-spec").addEventListener("click", loadSpec);
    document.getElementById("example-btn").addEventListener("click", () => {
      document.getElementById("spec-input").value = JSON.stringify(EXAMPLE_SPEC, null, 2);
      loadSpec();
      document.getElementById("resp-input").value = JSON.stringify(EXAMPLE_RESPONSE, null, 2);
    });
    document.getElementById("spec-file").addEventListener("change", onFile);
    document.getElementById("op-select").addEventListener("change", onOpChange);
    document.getElementById("status-select").addEventListener("change", renderSample);
    document.getElementById("validate-btn").addEventListener("click", validate);
    document.getElementById("use-sample").addEventListener("click", () => {
      const sample = document.getElementById("sample").textContent;
      if (sample) document.getElementById("resp-input").value = sample;
    });
  });

  function onFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      document.getElementById("spec-input").value = reader.result;
    };
    reader.readAsText(file);
  }

  function loadSpec() {
    const raw = document.getElementById("spec-input").value.trim();
    const status = document.getElementById("spec-status");
    status.textContent = "";
    if (!raw) {
      status.innerHTML = '<span class="text-red-700">Aucun contenu.</span>';
      return;
    }
    try {
      spec = raw.startsWith("{") ? JSON.parse(raw) : jsyaml.load(raw);
    } catch (e) {
      status.innerHTML =
        '<span class="text-red-700">Erreur de parsing : ' + escapeHtml(e.message) + "</span>";
      return;
    }
    if (!spec || (!spec.openapi && !spec.swagger)) {
      status.innerHTML =
        '<span class="text-red-700">Ce document ne ressemble pas à un OpenAPI/Swagger valide.</span>';
      return;
    }
    const version = spec.openapi || "swagger " + spec.swagger;
    status.innerHTML =
      '<span class="text-emerald-700">Spec chargée (' +
      escapeHtml(version) +
      '). Opérations : ' +
      countOps(spec) +
      "</span>";
    populateOperations();
    document.getElementById("op-section").classList.remove("hidden");
    document.getElementById("resp-section").classList.remove("hidden");
  }

  function countOps(spec) {
    let n = 0;
    Object.values(spec.paths || {}).forEach((p) => {
      ["get", "post", "put", "patch", "delete", "head", "options"].forEach((m) => {
        if (p[m]) n++;
      });
    });
    return n;
  }

  function populateOperations() {
    const sel = document.getElementById("op-select");
    sel.innerHTML = "";
    const methods = ["get", "post", "put", "patch", "delete", "head", "options"];
    Object.keys(spec.paths || {}).forEach((path) => {
      methods.forEach((m) => {
        if (spec.paths[path][m]) {
          const opt = document.createElement("option");
          opt.value = m + " " + path;
          opt.textContent = m.toUpperCase() + " " + path;
          sel.appendChild(opt);
        }
      });
    });
    onOpChange();
  }

  function onOpChange() {
    const val = document.getElementById("op-select").value;
    if (!val) return;
    const [method, path] = val.split(" ");
    const op = spec.paths[path][method];
    const statusSel = document.getElementById("status-select");
    statusSel.innerHTML = "";
    const responses = op.responses || {};
    Object.keys(responses).forEach((code) => {
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = code + (responses[code].description ? " — " + responses[code].description : "");
      statusSel.appendChild(opt);
    });
    document.getElementById("op-info").textContent = op.summary || op.description || "";
    renderSample();
  }

  function renderSample() {
    const wrap = document.getElementById("sample-wrap");
    const pre = document.getElementById("sample");
    const val = document.getElementById("op-select").value;
    const code = document.getElementById("status-select").value;
    if (!val || !code) {
      wrap.classList.add("hidden");
      return;
    }
    const [method, path] = val.split(" ");
    const schema = getResponseSchema(method, path, code);
    if (!schema) {
      wrap.classList.add("hidden");
      return;
    }
    try {
      const example = generateExample(schema, new Set());
      pre.textContent = JSON.stringify(example, null, 2);
      wrap.classList.remove("hidden");
    } catch (_) {
      wrap.classList.add("hidden");
    }
  }

  // Résout un $ref relatif au document spec.
  function resolveRef(ref) {
    if (!ref.startsWith("#/")) return null;
    const parts = ref.slice(2).split("/");
    let cur = spec;
    for (const p of parts) {
      cur = cur && cur[p.replace(/~1/g, "/").replace(/~0/g, "~")];
    }
    return cur || null;
  }

  // Génère un exemple à partir d'un schéma JSON Schema / OpenAPI.
  function generateExample(schema, seen) {
    if (!schema) return null;
    if (schema.$ref) {
      if (seen.has(schema.$ref)) return null;
      seen.add(schema.$ref);
      const resolved = resolveRef(schema.$ref);
      const out = generateExample(resolved, seen);
      seen.delete(schema.$ref);
      return out;
    }
    if (schema.example !== undefined) return schema.example;
    if (schema.default !== undefined) return schema.default;
    if (schema.enum && schema.enum.length) return schema.enum[0];

    if (schema.allOf) {
      return schema.allOf.reduce((acc, s) => {
        const part = generateExample(s, seen);
        return part && typeof part === "object" ? Object.assign(acc, part) : acc;
      }, {});
    }
    if (schema.oneOf) return generateExample(schema.oneOf[0], seen);
    if (schema.anyOf) return generateExample(schema.anyOf[0], seen);

    const type = schema.type || (schema.properties ? "object" : null);
    switch (type) {
      case "object": {
        const out = {};
        const props = schema.properties || {};
        Object.keys(props).forEach((k) => {
          out[k] = generateExample(props[k], seen);
        });
        return out;
      }
      case "array":
        return [generateExample(schema.items || {}, seen)];
      case "string":
        if (schema.format === "date-time") return new Date().toISOString();
        if (schema.format === "date") return new Date().toISOString().slice(0, 10);
        if (schema.format === "uuid") return "00000000-0000-0000-0000-000000000000";
        if (schema.format === "email") return "user@example.com";
        return "string";
      case "integer":
        return schema.minimum != null ? schema.minimum : 0;
      case "number":
        return schema.minimum != null ? schema.minimum : 0;
      case "boolean":
        return false;
      default:
        return null;
    }
  }

  // Parcourt schéma + payload pour trouver les champs non déclarés.
  // Retourne une liste de paths JSON, ex: ["/user/age", "/items/0/unknown"].
  function findExtraFields(schema, data, path, seen) {
    const extras = [];
    if (!schema || data == null) return extras;

    let resolved = schema;
    if (resolved.$ref) {
      if (seen.has(resolved.$ref)) return extras;
      seen.add(resolved.$ref);
      resolved = resolveRef(resolved.$ref) || {};
    }

    // Combinateurs : fusionner les propriétés connues.
    const merged = mergeProperties(resolved, seen);

    if (Array.isArray(data)) {
      const itemsSchema = resolved.items || (merged && merged.items) || {};
      data.forEach((v, i) => {
        extras.push(...findExtraFields(itemsSchema, v, path + "/" + i, new Set(seen)));
      });
      return extras;
    }

    if (typeof data === "object" && data !== null) {
      const props = merged.properties || {};
      const allowAdditional =
        resolved.additionalProperties !== false &&
        merged.additionalProperties !== false;
      Object.keys(data).forEach((key) => {
        if (props[key]) {
          extras.push(...findExtraFields(props[key], data[key], path + "/" + key, new Set(seen)));
        } else if (!allowAdditional || Object.keys(props).length > 0) {
          // On remonte un champ additionnel si le schéma a des propriétés définies.
          if (Object.keys(props).length > 0) {
            extras.push(path + "/" + key);
          }
        }
      });
    }
    return extras;
  }

  function mergeProperties(schema, seen) {
    const out = { properties: {}, items: schema.items };
    if (schema.properties) Object.assign(out.properties, schema.properties);
    if (schema.additionalProperties === false) out.additionalProperties = false;
    (schema.allOf || []).forEach((s) => {
      let sub = s;
      if (sub.$ref && !seen.has(sub.$ref)) {
        seen.add(sub.$ref);
        sub = resolveRef(sub.$ref) || {};
      }
      const subMerged = mergeProperties(sub, seen);
      Object.assign(out.properties, subMerged.properties);
      if (subMerged.additionalProperties === false) out.additionalProperties = false;
    });
    return out;
  }

  function getResponseSchema(method, path, statusCode) {
    const op = spec.paths[path][method];
    const resp = (op.responses || {})[statusCode];
    if (!resp) return null;
    // OpenAPI 3
    if (resp.content) {
      const mt =
        resp.content["application/json"] ||
        Object.values(resp.content)[0];
      return mt ? mt.schema : null;
    }
    // Swagger 2
    return resp.schema || null;
  }

  function validate() {
    const resultEl = document.getElementById("result");
    resultEl.classList.remove("hidden");
    resultEl.innerHTML = "";
    if (typeof window.Ajv !== "function") {
      resultEl.innerHTML =
        '<div class="alert alert-warn">Chargement de la bibliothèque Ajv en cours, réessayez dans un instant…</div>';
      window.addEventListener("ajv-ready", () => validate(), { once: true });
      return;
    }
    const respText = document.getElementById("resp-input").value.trim();
    if (!respText) {
      resultEl.innerHTML = '<div class="text-red-700">Veuillez coller une réponse JSON.</div>';
      return;
    }
    let payload;
    try {
      payload = JSON.parse(respText);
    } catch (e) {
      resultEl.innerHTML =
        '<div class="text-red-700">JSON invalide : ' + escapeHtml(e.message) + "</div>";
      return;
    }
    const val = document.getElementById("op-select").value;
    const [method, path] = val.split(" ");
    const code = document.getElementById("status-select").value;
    const schema = getResponseSchema(method, path, code);
    if (!schema) {
      resultEl.innerHTML =
        '<div class="text-amber-700">Aucun schéma défini pour cette réponse : impossible de valider.</div>';
      return;
    }

    const ajv = new Ajv({ allErrors: true, strict: false });
    if (window.ajvFormats) window.ajvFormats(ajv);
    // Ajoute les composants pour résoudre les $ref.
    registerRefs(ajv);

    let validateFn;
    try {
      validateFn = ajv.compile(schema);
    } catch (e) {
      resultEl.innerHTML =
        '<div class="text-red-700">Erreur de compilation du schéma : ' + escapeHtml(e.message) + "</div>";
      return;
    }
    const ok = validateFn(payload);
    const extras = findExtraFields(schema, payload, "", new Set());
    renderResult(resultEl, ok, validateFn.errors || [], method, path, code, extras);
  }

  function registerRefs(ajv) {
    // OpenAPI 3 : components/schemas
    if (spec.components && spec.components.schemas) {
      Object.entries(spec.components.schemas).forEach(([name, sch]) => {
        const id = "#/components/schemas/" + name;
        try {
          ajv.addSchema(sch, id);
        } catch (_) {}
      });
    }
    // Swagger 2 : definitions
    if (spec.definitions) {
      Object.entries(spec.definitions).forEach(([name, sch]) => {
        const id = "#/definitions/" + name;
        try {
          ajv.addSchema(sch, id);
        } catch (_) {}
      });
    }
  }

  function renderResult(el, ok, errors, method, path, code, extras) {
    const title = method.toUpperCase() + " " + path + " (" + code + ")";
    const extrasBlock = (extras && extras.length)
      ? '<div class="alert alert-warn">' +
        '<div class="font-bold">Champs additionnels détectés — ' + extras.length + "</div>" +
        '<div class="text-xs mb-2">Ces champs ne sont pas déclarés dans le schéma.</div>' +
        '<ul class="list-disc pl-6 space-y-1 text-sm">' +
        extras.map((p) => "<li><code style=\"background:rgba(255,255,255,0.6);padding:0 .25rem;border-radius:.25rem;\">" + escapeHtml(p || "/") + "</code></li>").join("") +
        "</ul></div>"
      : "";
    if (ok) {
      el.innerHTML =
        '<div class="alert alert-success">' +
        '<div class="font-bold">Conforme</div>' +
        '<div class="text-sm">La réponse respecte le schéma de ' +
        escapeHtml(title) + ".</div></div>" +
        extrasBlock;
    } else {
      el.innerHTML =
        '<div class="alert alert-error">' +
        '<div class="font-bold">Non conforme — ' + errors.length + " erreur(s)</div>" +
        '<div class="text-sm">' + escapeHtml(title) + "</div></div>" +
        '<ul class="list-disc pl-6 space-y-1 text-sm mb-3">' +
        errors
          .map(
            (e) =>
              "<li><code style=\"background:#f1f5f9;padding:0 .25rem;border-radius:.25rem;\">" +
              escapeHtml(e.instancePath || "/") +
              "</code> — " +
              escapeHtml(e.message || "") +
              (e.params ? " <span class='text-slate-500'>(" + escapeHtml(JSON.stringify(e.params)) + ")</span>" : "") +
              "</li>"
          )
          .join("") +
        "</ul>" +
        extrasBlock;
    }

    lastResult = {
      title: "Validation SwaggerGuard — " + title,
      sections: [
        {
          heading: "Résultat",
          text: ok ? "Conforme" : "Non conforme (" + errors.length + " erreur(s))",
        },
        {
          heading: "Erreurs",
          rows: errors.map((e) => [
            e.instancePath || "/",
            (e.message || "") + (e.params ? " " + JSON.stringify(e.params) : ""),
          ]),
        },
        {
          heading: "Champs additionnels",
          rows: (extras || []).map((p) => [p || "/", "non déclaré dans le schéma"]),
        },
      ],
    };
    ToolExport.attachActions(el, () => lastResult);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
})();
