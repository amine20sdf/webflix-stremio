'use strict';
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const cheerio = require('cheerio');
const ORIGIN = 'https://webflix.bio';
const PORT = Number(process.env.PORT || 7000);
const TIMEOUT = 9000;
const manifest = {
  id: 'community.webflix.bio.experimental',
  version: '0.1.0',
  name: 'Webflix (expérimental)',
  description: 'Explore uniquement les pages et flux publics accessibles de Webflix. Ne contourne aucune protection.',
  resources: ['catalog', 'meta', 'stream'],
  types: ['movie', 'series'],
  idPrefixes: ['webflix:'],
  catalogs: [
    { type: 'movie', id: 'webflix-movies', name: 'Webflix - Films', extra: [{ name: 'search', isRequired: false }] },
    { type: 'series', id: 'webflix-series', name: 'Webflix - Séries', extra: [{ name: 'search', isRequired: false }] }
  ],
  behaviorHints: { configurable: false }
};
const builder = new addonBuilder(manifest);
const cache = new Map();
function sameSiteUrl(path) {
  try {
    const u = new URL(path, ORIGIN);
    if (u.origin !== ORIGIN || !['https:'].includes(u.protocol)) return null;
    return u;
  } catch { return null; }
}
function allowedMedia(url) {
  try {
    const u = new URL(url);
    return ['https:', 'http:'].includes(u.protocol) && /\.(m3u8|mp4|webm)(?:$|[?#])/i.test(u.href);
  } catch { return false; }
}
async function getPage(path) {
  const u = sameSiteUrl(path);
  if (!u) throw new Error('URL hors domaine Webflix');
  const key = u.href;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 120000) return hit.html;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(key, { signal: ctrl.signal, headers: { 'user-agent': 'Mozilla/5.0 (compatible; WebflixStremio/0.1)', accept: 'text/html,application/xhtml+xml' }, redirect: 'error' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (!(res.headers.get('content-type') || '').includes('html')) throw new Error('Réponse non HTML');
    const html = (await res.text()).slice(0, 3000000);
    cache.set(key, { at: Date.now(), html });
    return html;
  } finally { clearTimeout(timer); }
}
function mediaId(u) { return 'webflix:' + Buffer.from(u.pathname + u.search).toString('base64url'); }
function unpack(id) {
  if (!id.startsWith('webflix:')) return null;
  try {
    const suffix = Buffer.from(id.slice(8), 'base64url').toString('utf8');
    if (!suffix.startsWith('/') || suffix.length > 1000) return null;
    return sameSiteUrl(suffix);
  } catch { return null; }
}
function classify(path) {
  if (/\/(film|movie|films|movies)\//i.test(path)) return 'movie';
  if (/\/(serie|series|s[eé]ries|tv)\//i.test(path)) return 'series';
  return null;
}
function metadata(html, url, type) {
  const $ = cheerio.load(html);
  let ld = {};
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const obj = JSON.parse($(el).text());
      const entries = Array.isArray(obj) ? obj : obj['@graph'] || [obj];
      const found = entries.find(x => /Movie|TVSeries/i.test(String(x['@type'] || '')));
      if (found) ld = found;
    } catch { /* invalid JSON-LD */ }
  });
  const title = ld.name || $('meta[property="og:title"]').attr('content') || $('title').text().trim();
  const description = ld.description || $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content');
  const poster = ld.image?.url || ld.image || $('meta[property="og:image"]').attr('content');
  const image = poster ? new URL(String(poster), url).href : undefined;
  return { id: mediaId(url), type, name: String(title || url.pathname.split('/').filter(Boolean).pop() || 'Sans titre').slice(0, 200), description: String(description || '').slice(0, 1500), ...(image ? { poster: image } : {}) };
}
function collectLinks(html, type, search) {
  const $ = cheerio.load(html);
  const result = [];
  const seen = new Set();
  $('a[href]').each((_, el) => {
    const u = sameSiteUrl($(el).attr('href'));
    if (!u || classify(u.pathname) !== type || seen.has(u.href)) return;
    const title = ($(el).attr('title') || $(el).find('img').attr('alt') || $(el).text()).replace(/\s+/g, ' ').trim();
    if (!title || search && !title.toLowerCase().includes(search.toLowerCase())) return;
    seen.add(u.href);
    const pic = $(el).find('img').attr('data-src') || $(el).find('img').attr('src');
    result.push({ id: mediaId(u), type, name: title.slice(0, 200), ...(pic ? { poster: new URL(pic, u).href } : {}) });
  });
  return result.slice(0, 60);
}
builder.defineCatalogHandler(async args => {
  try {
    // SPA pages containing only "Chargement…" cannot be scraped server-side.
    const html = await getPage('/');
    return { metas: collectLinks(html, args.type, args.extra?.search || '') };
  } catch (err) { console.warn('[catalog]', err.message); return { metas: [] }; }
});
builder.defineMetaHandler(async args => {
  const u = unpack(args.id);
  if (!u || classify(u.pathname) !== args.type) return { meta: null };
  try { return { meta: metadata(await getPage(u.pathname + u.search), u, args.type) }; }
  catch (err) { console.warn('[meta]', err.message); return { meta: null }; }
});
builder.defineStreamHandler(async args => {
  const u = unpack(args.id);
  if (!u || classify(u.pathname) !== args.type) return { streams: [] };
  try {
    const html = await getPage(u.pathname + u.search);
    const $ = cheerio.load(html);
    const candidates = new Set();
    $('video[src], source[src]').each((_, el) => candidates.add(new URL($(el).attr('src'), u).href));
    $('meta[property="og:video:url"], meta[property="og:video:secure_url"]').each((_, el) => {
      if ($(el).attr('content')) candidates.add(new URL($(el).attr('content'), u).href);
    });
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).text());
        const entries = Array.isArray(data) ? data : data['@graph'] || [data];
        for (const entry of entries) if (entry.contentUrl) candidates.add(new URL(entry.contentUrl, u).href);
      } catch { /* ignore */ }
    });
    return { streams: [...candidates].filter(allowedMedia).slice(0, 10).map(url => ({ title: 'Webflix — flux HTTP public', url })) };
  } catch (err) { console.warn('[stream]', err.message); return { streams: [] }; }
});
if (require.main === module) {
  serveHTTP(builder.getInterface(), { port: PORT, cacheMaxAge: 120 });
  console.log(`Webflix addon: http://127.0.0.1:${PORT}/manifest.json`);
}
module.exports = { manifest, collectLinks, classify, allowedMedia, unpack, mediaId };
