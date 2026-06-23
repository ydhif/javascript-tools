// Registre central des outils.
// Pour ajouter un outil : ajouter une entrée ici en précisant sa catégorie.
// Catégories disponibles : "OIDC & OAuth2", "Auth & PKI", "Données", "Réseau", "XML".
window.TOOL_CATEGORIES = ["OIDC & OAuth2", "Auth & PKI", "Données", "XML"];

window.TOOLS = [
  {
    id: "certificate-analyzer",
    name: "Certificate Analyzer",
    category: "Auth & PKI",
    description:
      "Analyse un certificat PEM/CRT et met en évidence chaque champ, en particulier l'EKU (serveur, client/serveur, ou absent).",
    href: "./tools/certificate-analyzer.html",
  },
  {
    id: "csr-generator",
    name: "CSR Generator",
    category: "Auth & PKI",
    description:
      "Génère une paire RSA et une demande de signature de certificat (PKCS#10) localement. La clé privée ne quitte jamais le navigateur. Décodeur de CSR inclus.",
    href: "./tools/csr-generator.html",
  },
  {
    id: "jwt-inspector",
    name: "JWT Inspector",
    category: "OIDC & OAuth2",
    description:
      "Décode, vérifie et signe un JWT (HS/RS/ES/PS *). Générateur de clés intégré, exemple client_assertion (private_key_jwt).",
    href: "./tools/jwt-inspector.html",
  },
  {
    id: "oidc-logout",
    name: "OIDC Logout URL Builder",
    category: "OIDC & OAuth2",
    description:
      "Construit l'URL de RP-Initiated Logout (end_session_endpoint, id_token_hint, post_logout_redirect_uri). Décode automatiquement l'id_token pour détecter l'expiration et pré-remplir l'endpoint Keycloak.",
    href: "./tools/oidc-logout.html",
  },
  {
    id: "oidc-id-token-validator",
    name: "OIDC ID Token Validator",
    category: "OIDC & OAuth2",
    description:
      "Valide un id_token selon OIDC Core 1.0 §3.1.3.7 : signature via JWKS, iss, aud, azp, exp/iat/nbf, nonce, at_hash, c_hash, auth_time.",
    href: "./tools/oidc-id-token-validator.html",
  },
  {
    id: "pkce-authz",
    name: "PKCE & Authz URL Builder",
    category: "OIDC & OAuth2",
    description:
      "Génère code_verifier / code_challenge S256 via WebCrypto et construit une URL d'autorisation OIDC complète (state, nonce, prompt, max_age, acr_values...). Prêt à ouvrir.",
    href: "./tools/pkce-authz.html",
  },
  {
    id: "oidc-discovery",
    name: "OIDC Discovery Explorer",
    category: "OIDC & OAuth2",
    description:
      "Fetch la configuration /.well-known/openid-configuration d'un issuer, audite la sécurité (PKCE, algos, flows legacy), affiche les endpoints et le JWKS.",
    href: "./tools/oidc-discovery.html",
  },
  {
    id: "curl-helper",
    name: "Curl Helper",
    category: "OIDC & OAuth2",
    description:
      "Génère un script bash (curl + jq) qui récupère un access_token via client_credentials puis exécute une requête curl cible en injectant le token dans le header Authorization.",
    href: "./tools/curl-helper.html",
  },
  {
    id: "json-viewer",
    name: "JSON Viewer",
    category: "Données",
    description:
      "Explore un JSON volumineux en arbre : compteurs, aperçu inline, copie de JSONPath, filtrage et détection (timestamps, base64, JSON imbriqué).",
    href: "./tools/json-viewer.html",
  },
  {
    id: "swagger-guard",
    name: "SwaggerGuard",
    category: "Données",
    description:
      "Upload d'un Swagger/OpenAPI et validation d'une réponse d'API contre la spécification.",
    href: "./tools/swagger-guard.html",
  },
  {
    id: "regex-tester",
    name: "Regex Tester",
    category: "Données",
    description:
      "Teste une regex JavaScript en live : surlignage des matches, groupes nommés et numérotés, substitution, bibliothèque de patterns courants, export vers JS/Python/Java/Go/PHP.",
    href: "./tools/regex-tester.html",
  },
  {
    id: "text-diff",
    name: "TextDiff",
    category: "Données",
    description:
      "Compare deux textes côte à côte, avec surlignage ligne et mot par mot. Options ignore espaces / casse, vue unifiée, export patch.",
    href: "./tools/text-diff.html",
  },
  {
    id: "gzip-tool",
    name: "Gzip Tool",
    category: "Données",
    description:
      "Compresse / décompresse via gzip, deflate ou deflate-raw dans le navigateur (Compression Streams API). Sortie Base64 / Base64url / Hex ou fichier .gz.",
    href: "./tools/gzip-tool.html",
  },
  {
    id: "har-viewer",
    name: "HAR Analyzer",
    category: "OIDC & OAuth2",
    description:
      "Analyzer HAR dédié aux flux OIDC (App / Keycloak / IdP) : séquence, phases, requêtes, tokens JWT avec vérification de signature via JWKS.",
    href: "./tools/har-viewer.html",
  },
  {
    id: "keycloak-app",
    name: "Keycloak App",
    category: "OIDC & OAuth2",
    description:
      "Client OIDC complet (équivalent local de keycloak.org/app) : sign in via authorization code + PKCE, affichage des tokens, userinfo, refresh, sign out.",
    href: "./tools/keycloak-app.html",
  },
  {
    id: "cmd-formatter",
    name: "Text Splitter",
    category: "Données",
    description:
      "Découpe un texte en lignes d'une longueur max donnée. Utile pour splitter un token, une clé, du base64, ou n'importe quelle chaîne longue.",
    href: "./tools/cmd-formatter.html",
  },
  {
    id: "sql-confluence",
    name: "SQL → Confluence",
    category: "Données",
    description:
      "Colle le résultat copié depuis SQL Developer (champs séparés par des tabulations) et génère un tableau Confluence : markup wiki prêt à coller ou tableau HTML pour le nouvel éditeur. Aperçu live.",
    href: "./tools/sql-confluence.html",
  },
  {
    id: "iframe-simulator",
    name: "Iframe Simulator",
    category: "Données",
    description:
      "Teste l'embedding d'une URL : X-Frame-Options, CSP frame-ancestors, sandbox, allow, referrerpolicy. Prévisualisation live, sonde des headers et console postMessage.",
    href: "./tools/iframe-simulator.html",
  },
  {
    id: "xml-workbench",
    name: "XML Workbench",
    category: "XML",
    description:
      "Équivalent de XMLSpy : parse / pretty-print, arbre interactif avec recherche, copie XPath, export JSON, XPath 1.0, XSLT 1.0, validation XSD, vue Schema, statistiques, namespaces, syntax highlighting (CodeMirror).",
    href: "./tools/xml-workbench.html",
  },
];
