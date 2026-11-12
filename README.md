# Webflix Direct v0.6 — Stremio addon expérimental

Catalogues Cinemeta (8 catégories), correspondance TMDB et flux vidéo **uniquement si une URL MP4/M3U8 est réellement accessible via HTTP**. Aucun contournement de publicités, aucune simulation de session, aucun proxy vidéo.

## Installation sur le dépôt GitHub actuel

1. Placer `index.js`, `package.json`, `index.test.js` et `README.md` **à la racine du dépôt** `amine20sdf/webflix-stremio`.
2. Sur Render, régler **Root Directory** sur vide, **Build Command** `npm install`, **Start Command** `npm start`.
3. Mettre la variable **`TMDB_API_KEY`** (optionnelle, mais recommandée pour faire correspondre les titres Cinemeta / IMDb aux identifiants TMDB ; clé API obtenue chez TMDB).
4. Faire *Deploy latest commit*.
5. Dans Stremio, actualiser ou réinstaller l'extension `https://webflix-stremio.onrender.com/manifest.json`.

## Tests

- `https://webflix-stremio.onrender.com/health` : doit indiquer `0.6.0`.
- `https://webflix-stremio.onrender.com/catalog/movie/popular-movies.json` : catalogue.
- `https://webflix-stremio.onrender.com/diagnostic/series/tmdb:tv:303044:1:1.json` : diagnostic (`reachable`, `no_mp4_or_hls`, `http_403`, `network_failure`, etc.).
- `https://webflix-stremio.onrender.com/stream/series/tmdb:tv:303044:1:1.json` : liste `streams` si flux accessible.

## Limites

- Le probe effectue une requête HEAD ou une requête GET avec `Range: bytes=0-0`, sans télécharger le film ni relayer le fichier.
- Certaines URL nécessitent une session publicitaire ou un cookie du navigateur. Dans ce cas, le plugin ne peut pas les rendre directement lisibles et retourne `streams: []`.
- Le succès du contrôle HTTP ne garantit pas à 100% la compatibilité du lecteur Stremio (codec, restrictions CDN, CORS, expiration).
- Les vérifications suivent jusqu'à quatre redirections HTTPS et ne transmettent pas de cookies de navigateur.
- Ne pas publier de fichiers HAR complets (cookies, sessions, URL signées éventuelles).

## Local

```bash
npm test
npm start
```
