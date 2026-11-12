# Webflix — addon Stremio expérimental

**État : serveur compatible Stremio développé, connecteur Webflix NON VALIDÉ.**

Le 12 novembre 2026, les outils publics ont seulement permis de consulter une page HTML affichant « Chargement… » sur https://webflix.bio. Le site semble rendre son catalogue en JavaScript ; ni une API publique ni une URL de flux direct n'ont été vérifiées. Cet addon **ne garantit donc ni catalogue rempli ni lecture**. Il n'invente pas de flux et ne contourne ni authentification, ni DRM, ni protection anti-bot.

## Installation sur un serveur Node.js

1. Créer un dépôt GitHub contenant `index.js`, `package.json`, `index.test.js` et `README.md`.
2. Sur un hébergeur Node.js compatible, configurer la commande d'installation `npm install` et celle de démarrage `npm start`. L'hébergeur doit attribuer `PORT` et une URL HTTPS publique.
3. Visiter `https://VOTRE-HEBERGEMENT/manifest.json` : le navigateur doit afficher du JSON.
4. Installer l'URL `https://VOTRE-HEBERGEMENT/manifest.json` dans la section Addons de Stremio.

Pour tester localement (facultatif) : `npm install && npm test && npm start`.

## Fonctions

- Manifeste Stremio standard ; catégories Films et Séries.
- Lecture des liens des pages HTML publiques **si** des liens `/film/...` ou `/series/...` existent dans le HTML retourné au serveur.
- Métadonnées OpenGraph et JSON-LD sur les pages publiques.
- Streams HTTP directs déclarés dans `<video>`, `<source>`, OpenGraph ou JSON-LD, si présents. Ni iframe ni lien de page ne sont supposés lisibles par Stremio.

## Limites connues

- La page d'accueil de Webflix charge son contenu par JavaScript : les catalogues risquent d'être vides.
- Le routage réel des fiches n'a pas été déterminé ; les chemins `/film/...` et `/series/...` sont des conventions **hypothétiques**, pas des faits observés.
- Pas de déchiffrement, de contournement de connexion ou d'extraction de vidéos protégées.
- Aucun hébergement n'a été déployé depuis cet environnement. Il faut publier sur un serveur HTTPS avant l'installation à distance.

## Pour obtenir un connecteur vraiment opérationnel

Ouvrir Webflix dans un navigateur, aller sur une fiche film et fournir **l'URL exacte de cette fiche** ainsi que, si autorisé, un exemple de réponse réseau du catalogue et du lecteur, en supprimant les cookies, jetons et données privées. Adapter ensuite les chemins et les appels JSON accessibles publiquement.

Références : https://stremio.github.io/stremio-addon-sdk/ , https://github.com/Stremio/stremio-addon-sdk .
