# Webflix Direct v0.5.0 — correction des redirections

## Problème corrigé

La v0.4 renvoyait `externalUrl` vers la page Webflix lorsqu’aucun lien vidéo direct n’était disponible. Stremio ouvrait alors le navigateur au lieu de lancer le lecteur. La v0.5 **ne renvoie plus de `externalUrl`**. Les sources ne sont visibles que si l’API Fastflux renvoie une URL HTTPS MP4/M3U8.

## Installation sur ton Render actuel

1. Dans `https://github.com/amine20sdf/webflix-stremio`, dépose **directement à la racine du dépôt** les fichiers `index.js`, `package.json`, `index.test.js` et `README.md` de ce ZIP, en remplaçant les anciens.
2. Sur Render, règle **Root Directory vide**, si les fichiers sont à la racine du dépôt, puis `npm install`, `npm start`.
3. Déploie le dernier commit puis ouvre `https://webflix-stremio.onrender.com/health` et vérifie `version: "0.5.0"`.
4. Dans Stremio, désinstalle l’ancienne extension et réinstalle `https://webflix-stremio.onrender.com/manifest.json`.

## Tester une source identifiée dans le HAR

Ouvre `https://webflix-stremio.onrender.com/stream/series/tmdb:tv:303044:1:1.json`.

- Si la réponse contient `{"streams":[{"url":"https://...mp4"}]}`, l’API renvoie un lien compatible avec le format Stremio. **La lecture effective reste à tester** : le CDN peut refuser les clients externes (403, Referer, CORS, géoblocage, expiration).
- Si la réponse est `{"streams":[]}`, aucun lien direct n’est disponible pour ce titre à ce moment-là. Aucun renvoi vers Webflix ne se produira.

**Attention aux identifiants IMDb** : les titres des catalogues Cinemeta ont souvent un ID `tt...`, tandis que l’API Webflix demande un ID TMDB. Ajoute la variable `TMDB_API_KEY` dans **Render → Environment** (clé gratuite TMDB) pour améliorer cette conversion. Tu peux vérifier la présence de cette variable avec `/health` → `tmdbConfigured`.

## Limitations

- La capture HAR ne prouve la présence d’un MP4 que pour un épisode (TMDB 303044 S01E01). Rien ne garantit la présence de sources pour les autres films/séries.
- La version ne contourne pas les protections des hébergeurs vidéo et ne prétend pas convertir les lecteurs embarqués en flux natifs.
- Ne partage pas le HAR original : il peut contenir des cookies ou des liens temporaires.
- La modification corrige la redirection, pas nécessairement la lecture vidéo (qui dépend du serveur externe).
