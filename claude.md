Dans ce projet, j'aimerais mettre en place plusieurs outils exclusivement en html javascript.
Lorsque l'on ajoute un nouveau tool, il faudra bien l'ajouter dans le menu.

Il faudra déployer le projet dans github page, merci de mettre en place les pipelines.

Pour le design CSS, on pourra utiliser tailwindcss et ces composants.

Dans chacun des outils, il sera possible de copier la réponse, l'exporter ou bien la copier dans le format wiki confluence.
Ajoute la possibilité de pouvoir télécharger au format html chaque tool en particulier, outil indépendant au téléchargement.

Tu pourras te servir de ce fichier pour connaitre le suivi et le reste à faire.

# Positionnement

Le projet s'est spécialisé progressivement sur **OIDC / OAuth2** comme créneau principal. Le positionnement affiché est désormais **"La suite OIDC & OAuth2, 100% navigateur"** (badge hero + sous-titre sur l'index). L'angle éditorial : 10-15 outils profonds orientés métier (dev backend + sécu + API) plutôt que 79 outils superficiels comme it-tools. Hypothèse Keycloak-broker : les outils OIDC (Discovery, PKCE, ID Token Validator, Logout) ont tous un encart **"Setup rapide Keycloak"** (base URL + realm → endpoints auto-générés) et le paramètre `kc_idp_hint` dans l'authz builder permet de rediriger directement vers un IdP broker configuré dans Keycloak.

## Suite OIDC (cycle complet)
1. **OIDC Discovery Explorer** — point d'entrée, audit d'un provider
2. **PKCE & Authz URL Builder** — déclenche un login (authz code + PKCE)
3. **OIDC ID Token Validator** — valide l'id_token reçu (§3.1.3.7)
4. **OIDC Logout URL Builder** — logout propre (RP-initiated)
5. **JWT Inspector** (décode + vérif + **signer**) — transversal, utile pour client_assertion
6. **HAR Analyzer** — rejoue / debug un flow OIDC depuis un HAR capturé
7. **Curl Helper** — génère le script bash pour l'échange code ↔ token (client_credentials et plus)

# Cerficate Analyzer

En copiant/collant le contenu d'un certificat au format pem, crt, il faudra retourner l'ensemble des informations du certificat, et mettre en évidence chaque élement du certificat, surtout la partie EKU => si elle contient la partie serveur, client/serveur ou si elle n'est pas présente.

# SwaggerGuard

Une application qui permet d'uploader un swagger/openapi d'une api et qui permet de saisir une réponse de l'api pour vérifier qu'elle est conforme au swagger.
Mets un exemple des champs attendues, si il y a un champ additionnel, mets le en évidence.

# JSON Viewer

Un explorateur JSON local pour coller un gros payload et l'inspecter sans l'envoyer sur un site tiers. Vue arbre avec :
- Compteurs (`[12] items` / `{4} keys`) et aperçu inline sur les nœuds repliés.
- Clic sur une clé → copie du JSONPath (`$.users[0].name`).
- Filtrage (pas surlignage) : masque les branches non concernées, garde le chemin jusqu'aux matches, auto-ouverture.
- Lazy rendering des enfants (construction au premier dépliage) pour tenir les gros JSON.
- Détection automatique : timestamps Unix/ISO (→ date lisible), URLs (→ cliquable), base64 (→ décodage), JSON imbriqué dans une string (→ bouton "parser").
- Pretty / Minify / Tout déplier / Tout replier / barre de chemin survolée.

# OIDC Logout URL Builder

Construit l'URL de **RP-Initiated Logout** (OIDC Session Management 1.0) avec tous les paramètres : `end_session_endpoint`, `id_token_hint`, `post_logout_redirect_uri`, `state` (auto-généré), `client_id` (fallback si `id_token_hint` manquant, exigé par Keycloak ≥ 18), `ui_locales`, `logout_hint` (Keycloak). **Décodage automatique** de l'`id_token_hint` collé : affiche `sub` / `iss` / `aud` / état d'expiration en live, détecte si l'issuer est un Keycloak et auto-remplit le `end_session_endpoint` (`<base>/realms/<realm>/protocol/openid-connect/logout`) + le `client_id` depuis l'`aud`. Setup rapide Keycloak (base + realm). Sortie : URL finale + tableau décomposé + ouverture dans un nouvel onglet. Bandeau qui rappelle la subtilité Keycloak ≥ 18 : `id_token_hint` ou `client_id` obligatoire pour sauter la page de confirmation.

# OIDC ID Token Validator

Applique la procédure complète de **validation d'id_token OIDC Core 1.0 §3.1.3.7** sur un token collé. Input : le token + les valeurs attendues (issuer, client_id, nonce, access_token pour `at_hash`, code pour `c_hash`, max_age). Fetch automatique du JWKS via `<issuer>/.well-known/openid-configuration` → `jwks_uri`, ou collage manuel en fallback CORS. Setup rapide Keycloak (base URL + realm → issuer attendu). Checks exécutés :
- **Claims obligatoires** présents (iss, sub, aud, exp, iat)
- **`iss`** match exact avec l'issuer attendu
- **`aud`** contient le client_id (+ **`azp`** obligatoire si `aud` est multi-valeurs)
- **`exp`** dans le futur, **`iat`** raisonnable, **`nbf`** passé
- **`nonce`** match la valeur envoyée dans l'authz request
- **`auth_time`** dans la fenêtre `max_age` (obligatoire si `max_age` fourni)
- **`at_hash`** = `base64url(SHA-<N>(access_token)).slice(0, half)` via WebCrypto, où `<N>` est dérivé de `header.alg` (RS256/PS256/ES256 → SHA-256, 384 → SHA-384, 512 → SHA-512, conforme OIDC Core §3.1.3.6)
- **`c_hash`** = idem pour le code d'autorisation (hybrid flow)
- **`alg`** refuse `none`, warn sur HS* (clients publics)
- **Signature** via JWKS avec résolution par `kid`, support RS/PS/ES 256/384/512

Rendu : check-list colorée (OK / FAIL / WARN / SKIP) + pastilles de résumé + header/payload affichés en pre. Export copiable texte plain.

# PKCE & Authz URL Builder

Génère un couple `code_verifier` / `code_challenge` (S256) via **WebCrypto** (`crypto.subtle.digest("SHA-256", ...)`) et construit une **URL d'autorisation OIDC complète**, prête à ouvrir pour déclencher un flow `response_type=code`. Le verifier respecte la RFC 7636 §4.1 (43–128 chars, charset `[A-Z][a-z][0-9]-._~`). **State** et **nonce** sont générés avec `crypto.getRandomValues` (16 bytes base64url). Paramètres supportés : `client_id`, `redirect_uri`, `scope`, `response_type` (code / id_token / hybrid), `response_mode`, `prompt`, `max_age`, `login_hint`, `ui_locales`, `acr_values`, `audience` (Auth0), **`kc_idp_hint`** (Keycloak — saute la page de login et redirige directement vers un IdP broker configuré). Le PKCE est automatiquement retiré si `response_type` n'inclut pas `code`. **Setup rapide Keycloak** : encart dédié où tu entres `base URL` + `realm` → l'`authorization_endpoint` est calculé (`<base>/realms/<realm>/protocol/openid-connect/auth`). Sortie : URL finale + tableau décomposé avec description de chaque paramètre + boutons copier / ouvrir dans un nouvel onglet. Exemples : Keycloak, Keycloak → broker Google (via `kc_idp_hint=google`), Auth0. Bandeau "prochaine étape" qui redirige vers Curl Helper pour l'échange code ↔ token.

# OIDC Discovery Explorer

Entre l'URL d'un issuer OIDC → fetch `/.well-known/openid-configuration` + `jwks_uri`, puis affiche :
- **Tous les endpoints** (authorization, token, userinfo, end_session, revocation, introspection, device_authorization, registration, backchannel_authentication, pushed_authorization_request, jwks_uri) avec bouton copier.
- **Capacités** (response_types, grant_types, scopes, claims, id_token_signing_alg, token_endpoint_auth_methods, code_challenge_methods, subject_types, etc.) sous forme de chips colorés : rouge pour les algos dangereux (`none`, `HS*` sur id_token, `RS1`), orange pour les flows legacy (`implicit`, `password`, `response_type=token`), vert pour les bonnes pratiques (`S256`, `private_key_jwt`, `tls_client_auth`, algos asymétriques non-RS256).
- **Audit de sécurité gradé** : cohérence de l'`issuer`, HTTPS partout, PKCE S256, flows legacy, algos id_token, auth méthodes token endpoint, support JAR / SSRF via `request_uri`, subject types pairwise, end_session endpoint.
- **JWKS** : chaque clé avec kid/kty/alg/use + champs RSA (n, e) ou EC (x, y, crv) tronqués à 80 chars.
- **Document JSON brut** pour inspection complète.
- Préréglages : Google, Microsoft v2.0 common, Apple, GitLab.com, GitHub Actions OIDC.
- **Mode manuel** : colle le JSON de discovery + JWKS si le serveur bloque CORS.
- **Setup rapide Keycloak** : encart dédié avec `base URL` + `realm` → construit l'URL d'issuer et lance le fetch.
- **Détection Keycloak automatique** : si l'issuer matche le pattern `*/realms/<name>`, une section **Keycloak détecté** apparaît avec les URLs non-OIDC spécifiques (Account Console, Admin Console, Well-known, endpoint `realms/<name>` public) et un rappel sur l'utilisation de `kc_idp_hint` pour le brokering.

# JWT Inspector

Décodeur + vérificateur + **signeur** de JWT 100% local. Split header / payload colorés, claims standards (iss, sub, aud, exp, nbf, iat, jti, scope, azp, kid) rendus dans une table avec dates humaines et alertes **expiré / pas encore valide**. Vérification de la signature via **WebCrypto** pour toute la famille : HS256/384/512 (secret texte), RS256/384/512 (PEM spki ou JWK), ES256/384/512 (P-256/P-384/P-521), PS256/384/512. Alerte rouge sur `alg=none`. Section **Signer un JWT** : entrée header + payload + clé, signature WebCrypto, bouton **Générer une clé** qui produit un secret aléatoire (HS*) ou une paire RSA 2048 (RS/PS*) ou une paire EC P-256/384/521 (ES*) exportée en PEM PKCS#8 / SPKI — la clé publique est automatiquement placée dans la section de vérification pour valider le round-trip. Bouton **Exemple client_assertion** qui pré-remplit un payload RFC 7523 (`iss`/`sub` = client_id, `aud` = token endpoint, `jti`, `iat`, `exp`) pour le flow OIDC `private_key_jwt`. Bouton **Utiliser dans le décodeur** pour chaîner directement signer → décoder.

# HAR Analyzer

Analyzer HAR spécialisé **flux OIDC** (App Angular / Keycloak / IdP externe en brokering). Drag & drop fichier `.har` avec progress bar, détection auto des hôtes par pattern (realms, openid-connect, sso, adfs, broker…), classification des requêtes en phases (`app` / `kc` / `idp` / `cb` / `other`). Quatre onglets : **Séquence** (diagramme canvas interactif avec tooltip URL complète, PlantUML export), **Phases** (tableau temps cumulé / moy / %), **Requêtes** (table filtrable + copie CSV), **Tokens** (extraction JWT depuis headers Authorization / body / response / cookies, parsing header + payload, **vérification de signature** via JWKS du `iss` en suivant `/.well-known/openid-configuration` → `jwks_uri`, support RS/PS/ES/HS). Styling repris sur la charte du site (cards, btn-primary gradient, field, badge, kv-table).

# Gzip Tool

Compression / décompression 100% locale via la **Compression Streams API** native (`CompressionStream` / `DecompressionStream`, dispo Chrome 80+, Firefox 113+, Safari 16.4+). Algorithmes **gzip**, **deflate**, **deflate-raw**. Entrée : texte collé ou fichier (compression), Base64 / Base64url / Hex ou fichier `.gz` (décompression). Stats taille originale / compressée / ratio de gain. Téléchargement du résultat en `.gz` ou `.txt`.

# CSR Generator

Génère une **paire RSA** (2048 / 3072 / 4096) et une **demande de signature de certificat (PKCS#10)** entièrement dans le navigateur via **node-forge** — la clé privée n'est jamais transmise. Champs subject CN/O/OU/C/ST/L/email, **SAN** multi-types (dns/ip/email/uri, un par ligne), choix de l'algo de signature (SHA-256/384/512). Sortie : CSR PEM + clé privée PEM, copie / téléchargement `.csr` et `.key`, relecture du CSR (subject, SAN, taille de clé, algo). Section **décodeur** : colle un CSR existant pour afficher ses champs et vérifier sa signature (`csr.verify()`).

# Curl Helper

Générateur de **script bash** : à partir d'un endpoint token + client_id/secret + scope/audience + commande curl cible avec placeholder `{{token}}`, produit un script `bash` autonome qui utilise `curl` + `jq` pour récupérer l'`access_token` via grant_type `client_credentials` puis exécute la requête cible avec le token injecté dans le header Authorization. Options : client_secret en body ou en Basic Auth (`--user`), secrets lus depuis les variables d'environnement `CLIENT_ID`/`CLIENT_SECRET` (avec fallback sur les valeurs saisies). Le script contient `set -euo pipefail`, vérifie la présence de `jq`, stocke la réponse token dans `/tmp/token_response.json` et échoue proprement si `access_token` est absent. Aucun appel n'est fait depuis le navigateur — c'est un pur générateur de texte.

# XML Workbench

Équivalent léger de XMLSpy, full navigateur : **parse** avec détection d'erreur, **pretty-print / minify**, **vue arbre** interactive (pliable, compteurs, aperçu inline, fermeture visible), **tester XPath 1.0** via `document.evaluate` (types nodeset / number / string / boolean), **transformation XSLT 1.0** via `XSLTProcessor` natif, **vue Schema** qui indexe un XSD collé dans la source (elements globaux, complexTypes, simpleTypes), résout `ref`/`type`, affiche compositors (sequence/choice/all) avec badges, cardinalité `[min..max]`, attributs (`use="required"`), enums de simpleType. Pas de dépendance externe (tout natif navigateur). Limites : pas de validation XML↔XSD (prévoir xmllint-wasm plus tard), pas de XPath/XSLT 2+, pas de `include`/`import` XSD.

# Regex Tester

Testeur de regex JavaScript 100% local. Saisie du pattern avec slashes visibles (`/.../flags`), toggles pour les flags `g/i/m/s/u/y` cliquables, input libre pour les flags. Exécution via `RegExp` natif + `matchAll`. Rendu : **surlignage** des matches dans le texte + **liste** des matches avec index / length / groupes numérotés (`$1`, `$2`) et groupes nommés (`$<name>`). **Mode substitution** live avec support `$1`, `$<name>`, `$&`. **Bibliothèque de 18 patterns courants** (email, URL, UUID v4, IPv4/v6, date ISO/FR, JWT, slug, mot de passe fort, téléphone FR, HTML tag, etc.). **Export** du pattern vers JavaScript, Python (avec flags), Java, Go, PHP. Cheatsheet complet (classes, quantifiers, ancres, groupes, lookaround). Garde-fou anti-boucle infinie sur `/()/g`.

# TextDiff

Équivalent light de KDiff3 dans le navigateur. Deux textareas A/B, diff ligne via **jsdiff** (`diff@5.2.0` en CDN), vue côte à côte avec surlignage mot par mot sur les lignes modifiées (via `Diff.diffWordsWithSpace`). Options : ignore whitespace / case, vue unifiée (style patch). Export au format patch unifié (`Diff.createTwoFilesPatch`).

# Suivi

## Structure
- `index.html` — page d'accueil avec titre **"La suite OIDC & OAuth2, 100% navigateur"**, grille d'outils regroupée par catégorie générée dynamiquement.
- `assets/js/tools.js` — registre central :
  - `window.TOOL_CATEGORIES` liste les catégories dans l'ordre d'affichage : `"OIDC & OAuth2"`, `"Auth & PKI"`, `"Données"`, `"XML"`.
  - `window.TOOLS` liste chaque outil avec `id`, `name`, `category`, `description`, `href`.
  - **Pour ajouter un outil** : créer `tools/<id>.html` + `tools/<id>.js`, puis ajouter une entrée ici (le menu, la grille d'accueil, le dropdown et la barre de recherche se mettent à jour automatiquement).
- `assets/js/menu.js` — rend :
  - le menu du header (dropdowns par catégorie depuis `TOOL_CATEGORIES`)
  - la grille d'accueil groupée par catégorie
  - **la barre de recherche injectée automatiquement dans le header de toutes les pages** : filtre la grille sur l'accueil, affiche un dropdown flottant de résultats sur les pages d'outil. Raccourci clavier `/` pour focus depuis n'importe où, `Escape` pour vider.
- `assets/js/export.js` — utilitaires partagés :
  - `ToolExport.attachActions(container, getData)` → boutons Copier / Exporter (.txt) / Copier (Confluence Wiki).
  - `ToolExport.downloadStandalone({filename, title})` → télécharge le HTML de l'outil en single-file autonome. **Auto-inline tous les scripts et stylesheets locaux** (chemin relatif, non CDN) sans avoir à les lister ; retire `tools.js` et `menu.js` qui n'ont pas de sens hors du projet ; préserve les CDN pinnés + SRI ; wrapper `DOMContentLoaded`-safe autour de chaque script inliné et déplacement à la fin du `<body>` pour que le DOM soit prêt à l'exécution.
- `.github/workflows/deploy.yml` — déploiement GitHub Pages sur push `main`.
- `assets/css/styles.css` — feuille maison : police Inter + JetBrains Mono, header dégradé, cartes, boutons, alertes, tables, styles du nav dropdown, de la barre de recherche (versions claire + variante header sombre), et de la grille catégorisée d'accueil.
- Styling global : Tailwind CDN JIT (nécessite `unsafe-eval` dans la CSP) + feuille maison.

## Outils réalisés
- [x] **Certificate Analyzer** (`tools/certificate-analyzer.{html,js}`) — parse PEM/CRT avec node-forge, met en évidence l'EKU (serveur / client+serveur / client / absent) via badge coloré, expose toutes les extensions (SAN, KU, Basic Constraints). **Support des chaînes multi-certificats** : `splitPems()` découpe l'entrée en blocs `BEGIN/END CERTIFICATE`, parse chaque cert, classe chaque position (leaf / intermediate / root / self-signed) et vérifie la cohérence issuer ↔ subject entre certificats adjacents (badge "lien rompu" si non cohérent). Rendu en cartes empilées avec pastille de rôle. Copie / export / wiki / téléchargement HTML autonome. **Boutons exemples** : "Charger un exemple" (cycle entre 4 variantes EKU sur un certificat unique) et "Exemple (chaîne)" (génère à la volée une vraie chaîne racine → intermédiaire → leaf, chaque cert signé par le suivant via node-forge).
- [x] **OIDC Logout URL Builder** (`tools/oidc-logout.{html,js}`) — construction de l'URL RP-Initiated Logout avec tous les paramètres (id_token_hint, post_logout_redirect_uri, state, client_id, ui_locales, logout_hint), décodage live de l'id_token collé (sub/iss/aud/exp), heuristique d'auto-détection Keycloak depuis l'iss, tableau décomposé avec descriptions, setup rapide Keycloak.
- [x] **OIDC ID Token Validator** (`tools/oidc-id-token-validator.{html,js}`) — validation OIDC Core 1.0 §3.1.3.7 complète : claims obligatoires, `iss` strict, `aud`/`azp` avec règle multi-valeurs, `exp`/`iat`/`nbf`, `nonce`, `auth_time`/`max_age`, `at_hash`, `c_hash` (SHA-256 half via WebCrypto), refus `alg=none`, warn HS*, vérification signature via JWKS fetch auto ou manuel. Check-list colorée + résumé en pastilles + setup rapide Keycloak.
- [x] **PKCE & Authz URL Builder** (`tools/pkce-authz.{html,js}`) — génération verifier/challenge S256 via WebCrypto conforme RFC 7636, construction URL `/authorize` avec tous les params OIDC (scope, state, nonce, prompt, max_age, login_hint, ui_locales, acr_values, audience), tableau explicatif par paramètre, ouverture dans un onglet, exemples Keycloak / Auth0.
- [x] **OIDC Discovery Explorer** (`tools/oidc-discovery.{html,js}`) — fetch `/.well-known/openid-configuration` + JWKS, liste les endpoints (avec copie), rend les capabilities en chips colorés selon leur niveau de sécurité, audit gradé (PKCE S256, flows legacy, algos id_token, SSRF via request_uri, etc.), préréglages providers courants, mode manuel pour les issuers CORS-bloquants.
- [x] **JWT Inspector** (`tools/jwt-inspector.{html,js}`) — décodage header/payload, vérification WebCrypto HS/RS/ES/PS 256-384-512, **signer un JWT** (WebCrypto avec import PKCS#8 / JWK / secret texte), générateur de clé intégré (secret aléatoire / paire RSA 2048 / paire EC P-256/384/521, clé publique auto-placée dans la section vérification), exemple **client_assertion** (RFC 7523) pré-rempli pour le flow OIDC `private_key_jwt`, bouton de chaînage signer → décoder.
- [x] **HAR Analyzer** (`tools/har-viewer.{html,js}`) — analyzer OIDC dédié (App / Keycloak / IdP brokering) : drop zone avec progress, auto-détection des hôtes, classification en phases, onglets Séquence (canvas + PlantUML), Phases, Requêtes (filtrables + CSV), Tokens (extraction JWT + vérification signature via JWKS du `iss` / `.well-known/openid-configuration`). Styling aligné sur la charte (cards, btn, field, badge).
- [x] **Gzip Tool** (`tools/gzip-tool.{html,js}`) — compression/décompression gzip/deflate/deflate-raw via Compression Streams API, encodage Base64/Base64url/Hex, upload fichier / téléchargement `.gz`, stats original/compressé/ratio.
- [x] **CSR Generator** (`tools/csr-generator.{html,js}`) — génération RSA (2048/3072/4096) + PKCS#10 via node-forge, subject complet, SAN multi-types (dns/ip/email/uri), algo SHA-256/384/512, sortie CSR/clé PEM avec copie + téléchargement `.csr`/`.key`, relecture tabulaire, décodeur de CSR existant avec vérification de signature.
- [x] **Curl Helper** (`tools/curl-helper.{html,js}`) — **générateur de script bash** : à partir d'un token endpoint + client_id/secret + scope/audience + curl cible avec `{{token}}`, produit un script bash qui utilise `curl` + `jq` pour récupérer `access_token` (grant_type client_credentials) et exécute ensuite la requête cible avec le token injecté. Options Basic Auth et secrets via env vars. Téléchargement HTML autonome.
- [x] **XML Workbench** (`tools/xml-workbench.{html,js}`) — parse via DOMParser (erreur lisible), pretty/minify, arbre pliable avec lazy rendering, onglets Arbre / XPath / XSLT, XPath 1.0 natif (`document.evaluate`), transformation XSLT 1.0 native (`XSLTProcessor`), bouton exemple bibliothèque + XSLT associée. Téléchargement HTML autonome.
- [x] **Regex Tester** (`tools/regex-tester.{html,js}`) — pattern + flags toggles, surlignage matches + cards détaillées (groupes numérotés/nommés, index, length), mode substitution live, 18 patterns préférences, export multi-langages (JS/Python/Java/Go/PHP), cheatsheet. Garde-fou anti-loop sur patterns zero-width.
- [x] **TextDiff** (`tools/text-diff.{html,js}`) — diff ligne via jsdiff, vue côte à côte ou unifiée, surlignage mot par mot sur les modifs, options ignore espaces / casse, inversion A↔B, export patch unifié, téléchargement HTML autonome.
- [x] **JSON Viewer** (`tools/json-viewer.{html,js}`) — parse + pretty/minify, arbre pliable avec compteurs et aperçu inline, copie du JSONPath au clic, filtrage (clé/valeur/les deux) avec auto-ouverture des branches matchées, lazy rendering, détection timestamps/URL/base64/JSON imbriqué avec actions contextuelles. Copie / export / wiki / téléchargement HTML autonome. Bouton "Charger un exemple" qui illustre tous les hints (timestamp, URL, base64, JSON-in-string).
- [x] **SwaggerGuard** (`tools/swagger-guard.{html,js}`) — charge JSON/YAML (js-yaml), liste les opérations et codes de réponse, valide une réponse API via Ajv + ajv-formats, résout les `$ref` OpenAPI 3 (`components/schemas`) et Swagger 2 (`definitions`). **Toutes les contraintes JSON Schema sont vérifiées nativement par Ajv** : `type`, `required`, `enum`, `format`, `minLength`/`maxLength`, `minimum`/`maximum`, `pattern`, `minItems`/`maxItems`, etc. — rien à coder de plus. Génère un **exemple de réponse attendue** depuis le schéma (avec bouton "Utiliser comme réponse"), et met en **évidence les champs additionnels** non déclarés dans le schéma. Copie / export / wiki / téléchargement HTML autonome. **Bouton "Charger un exemple"** : mini-API `GET /users/{id}` (OpenAPI 3, schéma `User` avec `$ref`) + réponse qui démontre à la fois la détection d'un champ additionnel (`nickname`) et plusieurs violations de contraintes : `countryCode` de 6 caractères alors que le schéma impose `minLength:2 / maxLength:2`, `firstName`/`lastName` avec `maxLength:50`, `code` d'erreur avec pattern regex `^[A-Z_]+$`.

## Notes techniques
- **Ajv** : la v8 ne publie pas de bundle UMD navigateur (le fichier `dist/ajv.min.js` est du CommonJS → `ReferenceError: exports is not defined`). Elle est donc chargée dans `tools/swagger-guard.html` via un `<script type="module">` qui importe depuis **esm.sh** (`https://esm.sh/ajv@8.12.0` + `https://esm.sh/ajv-formats@2.1.1`) et expose `window.Ajv` / `window.ajvFormats`. Un évènement `ajv-ready` est émis une fois chargé ; si l'utilisateur clique sur "Vérifier" avant, la validation attend l'évènement.

## Déploiement
- [x] **GitHub Pages activé** (Source : GitHub Actions).
- [x] **Premier déploiement réussi** via push sur `main`.
- Toutes les pages retournent 200 en prod et en local (`python3 -m http.server`).

## Audit de sécurité

Deux passes d'audit statique effectuées (1re : 2026-04-15 sur les 11 premiers outils ; 2e : 2026-04-16 sur les 5 nouveaux outils OIDC + refactor `export.js`). Grille vérifiée : XSS via inputs utilisateur, eval/new Function, handlers inline, target=_blank, CDN sans SRI, CSP, fetch() vers des URLs arbitraires, gestion des secrets.

### 1re passe — findings corrigés
- 🔴 **XSS critique dans JWT Inspector** (`jwt-inspector.js` — `renderClaims()`) : les valeurs de claims (`sub`, `aud`, `iss`, etc.) étaient concaténées brutes dans un `tr.innerHTML`. Un JWT crafté avec par exemple `"sub": "<img src=x onerror=...>"` déclenchait un XSS au clic sur "Décoder". **Fix** : helper `escapeHtml()` local appliqué à toutes les clés et valeurs avant injection ; les `<td>` sont construits en `createElement` + `innerHTML` avec contenu pré-échappé ; les tags de décoration hardcodés (`<b class='text-red-700'>expiré</b>`) sont préservés car concaténés *après* l'échappement.
- 🟠 **Subresource Integrity** absente sur les CDN pinnés. Hashs `sha384` calculés localement via `curl | openssl` et ajoutés avec `crossorigin="anonymous"` sur `forge@1.3.1` (certificate-analyzer + csr-generator), `js-yaml@4.1.0` (swagger-guard), `diff@5.2.0` (text-diff). `cdn.tailwindcss.com` et `esm.sh` restent sans SRI (builds JIT non-SRI-compatibles) — risque résiduel documenté.
- 🟠 **Content-Security-Policy** absente. Meta CSP ajoutée dans les 11 HTML via un script Python inséré après la ligne charset :
  ```
  default-src 'self';
  script-src  'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://cdn.jsdelivr.net https://esm.sh;
  style-src   'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net;
  font-src    'self' https://fonts.gstatic.com data:;
  img-src     'self' data:;
  connect-src 'self' https: data:;
  object-src  'none'; base-uri 'self'; form-action 'self'
  ```
  `'unsafe-eval'` est requis par **Tailwind Play CDN** qui compile les classes JIT via `new Function` — sans lui, tout le styling casse silencieusement. `connect-src https:` reste large pour permettre au HAR Analyzer de fetch un JWKS arbitraire (mitigé par le point suivant).
- 🟡 **HAR Analyzer — fetch JWKS vers URL arbitraire** (`har-viewer.js` — `verifyToken()`). L'`iss` d'un JWT trouvé dans un HAR était utilisé tel quel pour fetch `/.well-known/openid-configuration`. Risques : fuite d'IP vers le serveur cible (il saura qui analyse tel HAR) et faux positifs de signature (un issuer malveillant peut servir un JWKS qui fait passer le token pour valide). **Fix** : rejet si l'`iss` n'est pas en `https://`, puis `window.confirm()` avant le premier fetch d'un origin donné, consentement mémorisé par origin pour la session.

### 2e passe — findings corrigés (2026-04-16)
- 🔴 **XSS critique dans OIDC Logout Builder** (`oidc-logout.js` — `inspectIdToken()`) : les claims `sub`, `iss`, `aud` issus du payload id_token étaient concaténés brut dans `el.innerHTML` au moment du décodage live. Un token avec `"sub": "<img src=x onerror=alert(1)>"` déclenchait un XSS dès la saisie dans le champ `id_token_hint`. **Fix** : helper `escapeHtml()` local appliqué sur chaque bit (`sub`, `iss`, `aud`) avant construction de la string HTML ; `new URL(p.iss)` wrapped dans try/catch pour ne pas crasher sur `iss` malformé.
- 🟡 **OIDC ID Token Validator — fetch JWKS arbitraire sans confirmation** (`oidc-id-token-validator.js` — `fetchJwks()`). Contrairement à HAR Analyzer, aucun `confirm()` avant le premier fetch d'un origin. **Fix** : reprise exacte de la logique HAR : rejet si `iss` non-HTTPS, objet `VERIFY_CONSENT` en fermeture qui mémorise le consentement par origin pour la session, `window.confirm()` expliquant les risques (fuite d'IP + JWKS potentiellement falsifié) avant le premier fetch.
- 🟡 **`at_hash` / `c_hash` figés sur SHA-256** (`oidc-id-token-validator.js` — `computeHash()`). Bug de correctness : OIDC Core §3.1.3.6 précise que l'algo de hash doit être celui de `header.alg` (RS384 → SHA-384, RS512 → SHA-512). Un id_token RS384 valide était marqué **FAIL** à tort. **Fix** : `computeHash(input, alg)` dérive maintenant le hashName depuis `alg.slice(2)` (256/384/512) avec fallback sûr SHA-256 ; les deux call sites (`at_hash` et `c_hash`) passent `header.alg`.

### Patterns vérifiés saine
- **0 occurrence** de `eval` / `new Function` / `document.write` / `setTimeout(string)` dans notre code.
- **0 handler inline** (`onclick=`, etc.) — tout passe par `addEventListener`.
- **`window.open`** : 3 emplacements (pkce-authz, oidc-logout, json-viewer), tous avec `"_blank"` + `"noopener"` explicites.
- **`fetch()`** : 6 emplacements, tous couverts par la CSP (`connect-src 'self'` pour `export.js` qui inline les HTML/CSS/JS locaux lors du téléchargement standalone, `connect-src https:` pour `har-viewer.js`, `oidc-discovery.js` et `oidc-id-token-validator.js` qui fetch des JWKS externes — confirmation utilisateur sur HAR et ID Token Validator, URL explicitement saisie par l'utilisateur sur Discovery).
- **WebCrypto** dans JWT Inspector (décode/vérif/signe), HAR Analyzer (vérif signature JWKS), OIDC ID Token Validator (vérif + at_hash/c_hash), PKCE Builder (code_verifier + code_challenge), CSR Generator (via node-forge), Logout Builder (random state). Tous utilisent l'API native sans impact CSP.
- **Échappement HTML systématique** dans les 15 outils : toute valeur utilisateur passant par `innerHTML` est vérifiée passée dans un `escapeHtml()` local (défini au besoin par outil) avant injection. Les `<td>` / `<div>` sont parfois construits via `createElement` + `textContent` pour éviter la question.

### Risques résiduels documentés
- `'unsafe-eval'` + `'unsafe-inline'` dans `script-src` → imposés par Tailwind Play CDN. **Mitigation idéale** : remplacer par un build Tailwind local (`npx tailwindcss -o dist.css --minify`). Ça supprime aussi le risque supply chain sur `cdn.tailwindcss.com`.
- `cdn.tailwindcss.com` et `esm.sh` restent sans SRI — risque supply chain persistant. Un build Tailwind local + remplacement d'Ajv par une version UMD pinnée sur jsdelivr supprimerait cette dépendance.
- Clés privées (CSR Generator) et tokens (JWT/Curl/HAR) transitent par le presse-papier — normal pour un outil local mais à documenter pour les utilisateurs.

## Reste à faire / pistes
- Optionnel : build Tailwind local pour retirer `'unsafe-eval'` et le risque supply chain `cdn.tailwindcss.com`.
- Optionnel : remplacer Ajv via `esm.sh` par un build jsdelivr pinné avec SRI.
- Optionnel : SwaggerGuard — validation des requêtes (body/params), pas seulement des réponses.
- Optionnel : XML Workbench — validation XML ↔ XSD via `xmllint-wasm`.