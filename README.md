# Webflix Companion v0.4 (expérimental)

Addon Stremio avec catalogues Cinemeta/TMDB et fournisseur de sources Webflix Fastflux.

## Déploiement Render

Remplacer les fichiers du dossier `webflix-stremio` dans le dépôt GitHub. Conserver Root Directory = `webflix-stremio`, Build Command = `npm install`, Start Command = `npm start`. Déployer le dernier commit.

Installer dans Stremio avec `https://webflix-stremio.onrender.com/manifest.json` après déploiement.

## Sources

Le HAR fourni le 12 novembre 2026 montre `/api/fastflux?type=episode&tmdb_id=303044&season=1&episode=1`, retournant `success=true`, `available=true` et un lien MP4. L'addon n'accepte comme sources vidéo que les URL http(s) se terminant en `.mp4` ou `.m3u8`. Les lecteurs intégrés Heiwa et Fluxora ne sont pas convertis automatiquement en vidéo.

**Limites :** test HAR d'un seul épisode, source susceptible d'expirer, géoblocage/CORS/referer possibles. Le navigateur peut lire une vidéo que Stremio ne peut pas lire. Les catalogues Cinemeta utilisent des identifiants IMDb ; pour la conversion IMDb→TMDB, il est recommandé d'ajouter une clé gratuite `TMDB_API_KEY` dans Render → Environment. Les IDs `tmdb:tv:303044:1:1` sont pris en charge sans clé. Certains serveurs n'acceptent pas la lecture externe. N'utiliser que des contenus que vous êtes autorisé à consulter.

## Test des routes

- `/health` : état serveur
- `/stream/series/tmdb:tv:303044:1:1.json` : source du premier épisode (si encore disponible)
- `/stream/movie/tmdb:movie:1368337.json` : tente une source film, peut revenir avec un lien externe
- `npm test` : tests locaux sans requête réseau

**Important :** ne jamais publier le HAR complet : il peut contenir des cookies, URL signées et des données personnelles.
