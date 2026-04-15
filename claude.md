Dans ce projet, j'aimerais mettre en place plusieurs outils exclusivement en html javascript.
Lorsque l'on ajoute un nouveau tool, il faudra bien l'ajouter dans le menu.

Il faudra déployer le projet dans github page, merci de mettre en place les pipelines.

Pour le design CSS, on pourra utiliser tailwindcss et ces composants.

Dans chacun des outils, il sera possible de copier la réponse, l'exporter ou bien la copier dans le format wiki confluence.
Ajoute la possibilité de pouvoir télécharger au format html chaque tool en particulier, outil indépendant au téléchargement.

Tu pourras te servir de ce fichier pour connaitre le suivi et le reste à faire.

# Cerficate Analyzer

En copiant/collant le contenu d'un certificat au format pem, crt, il faudra retourner l'ensemble des informations du certificat, et mettre en évidence chaque élement du certificat, surtout la partie EKU => si elle contient la partie serveur, client/serveur ou si elle n'est pas présente.

# SwaggerGuard

Une application qui permet d'uploader un swagger/openapi d'une api et qui permet de saisir une réponse de l'api pour vérifier qu'elle est conforme au swagger.
Mets un exemple des champs attendues, si il y a un champ additionnel, mets le en évidence.

# Suivi

## Structure
- `index.html` — page d'accueil, menu généré dynamiquement depuis `assets/js/tools.js`.
- `assets/js/tools.js` — registre central. **Pour ajouter un outil** : créer `tools/<id>.html` + `tools/<id>.js`, puis ajouter une entrée ici (le menu et l'accueil se mettent à jour automatiquement).
- `assets/js/menu.js` — rend le menu du header et la grille d'accueil.
- `assets/js/export.js` — utilitaires partagés :
  - `ToolExport.attachActions(container, getData)` → boutons Copier / Exporter (.txt) / Copier (Confluence Wiki).
  - `ToolExport.downloadStandalone({filename, title, inlineScripts})` → télécharge le HTML de l'outil en single-file autonome (inline les scripts locaux, retire le menu inter-outils).
- `.github/workflows/deploy.yml` — déploiement GitHub Pages sur push `main`.
- Styling : Tailwind CDN + feuille maison `assets/css/styles.css` (police Inter + JetBrains Mono, header dégradé, cartes, boutons, alertes, tables).

## Outils réalisés
- [x] **Certificate Analyzer** (`tools/certificate-analyzer.{html,js}`) — parse PEM/CRT avec node-forge, met en évidence l'EKU (serveur / client+serveur / client / absent) via badge coloré, expose toutes les extensions (SAN, KU, Basic Constraints). Copie / export / wiki / téléchargement HTML autonome. **Bouton "Charger un exemple"** : génère à la volée un certificat self-signed RSA 2048 via node-forge et fait tourner entre les 4 variantes EKU (serveur+client, serveur, client, absent) à chaque clic pour illustrer tous les cas.
- [x] **SwaggerGuard** (`tools/swagger-guard.{html,js}`) — charge JSON/YAML (js-yaml), liste les opérations et codes de réponse, valide une réponse API via Ajv + ajv-formats, résout les `$ref` OpenAPI 3 (`components/schemas`) et Swagger 2 (`definitions`). Génère un **exemple de réponse attendue** depuis le schéma (avec bouton "Utiliser comme réponse"), et met en **évidence les champs additionnels** non déclarés dans le schéma lors de la validation. Copie / export / wiki / téléchargement HTML autonome. **Bouton "Charger un exemple"** : charge une mini-API `GET /users/{id}` (OpenAPI 3, schéma `User` avec `$ref`) et une réponse contenant volontairement un champ additionnel `nickname` pour démontrer la détection.

## Reste à faire / pistes
- Activer GitHub Pages dans les settings du repo (Source : GitHub Actions).
- Tester le premier déploiement via push sur `main`.
- Optionnel : build Tailwind local (CDN suffit en attendant).
- Optionnel : SwaggerGuard — validation des requêtes (body/params), pas seulement des réponses.
- Optionnel : Certificate Analyzer — support de chaînes multi-certificats.