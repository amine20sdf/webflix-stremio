'use strict';
// Webflix Companion: Stremio metadata catalogues via Cinemeta or TMDB.
// Never represents a film as watchable on Webflix without verified evidence.
const http = require('node:http');
const { URL } = require('node:url');
const PORT = Number(process.env.PORT || 7000);
const TMDB_KEY = process.env.TMDB_API_KEY || '';
const CINEMETA = 'https://v3-cinemeta.strem.io';
const WEBFLIX = 'https://webflix.bio';
const VERSION = '0.3.0';
const catalogs = [
  { type: 'movie', id: 'popular-movies', name: 'Films populaires', source: 'top' },
  { type: 'series', id: 'popular-series', name: 'Séries populaires', source: 'top' },
  { type: 'movie', id: 'rated-movies', name: 'Films bien notés', source: 'imdbRating' },
  { type: 'series', id: 'rated-series', name: 'Séries bien notées', source: 'imdbRating' },
  { type: 'movie', id: 'action-movies', name: 'Films d’action', source: 'top', genre: 'Action' },
  { type: 'movie', id: 'animation-movies', name: 'Films d’animation', source: 'top', genre: 'Animation' },
  { type: 'series', id: 'animation-series', name: 'Séries d’animation', source: 'top', genre: 'Animation' },
  { type: 'movie', id: 'comedy-movies', name: 'Comédies', source: 'top', genre: 'Comedy' }
];
const manifest = {
  id: 'community.webflix.companion', version: VERSION,
  name: 'Webflix Companion — Catalogues',
  description: 'Catalogues et recherche de films/séries via Cinemeta (ou TMDB). Liens vers les pages Webflix quand un identifiant TMDB est disponible. La disponibilité des vidéos sur Webflix n’est pas vérifiée.',
  resources: ['catalog', 'meta', 'stream'],
  types: ['movie', 'series'],
  idPrefixes: ['tt', 'tmdb:'],
  catalogs: catalogs.map(({type,id,name}) => ({type,id,name,extra:[{name:'search'},{name:'skip'}]})),
  behaviorHints: { configurable: false }
};
const cache = new Map();
function send(res,status,obj,ttl=300){
  res.writeHead(status, {
    'Content-Type':'application/json; charset=utf-8',
    'Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Methods':'GET, OPTIONS',
    'Cache-Control':`public, max-age=${ttl}`,
    'X-Content-Type-Options':'nosniff'
  });
  res.end(JSON.stringify(obj));
}
function useCache(key, fn, ttl=300000){
  const old=cache.get(key);if(old && old.exp>Date.now()) return old.value;
  const value=Promise.resolve().then(fn);
  cache.set(key,{value,exp:Date.now()+ttl});
  value.catch(()=>cache.delete(key));
  if(cache.size>500){cache.delete(cache.keys().next().value);}
  return value;
}
async function jsonFetch(url){
  const response=await fetch(url, {headers:{Accept:'application/json','User-Agent':'WebflixCompanion/0.3'},signal:AbortSignal.timeout(12000)});
  if(!response.ok) throw new Error(`Upstream HTTP ${response.status}`);
  return response.json();
}
async function cinemeta(path){
  const uri=`${CINEMETA}${path}`;
  return useCache(uri,()=>jsonFetch(uri),180000);
}
async function tmdb(path,params={}){
  if(!TMDB_KEY) throw new Error('TMDB_API_KEY absente');
  const uri=new URL('https://api.themoviedb.org/3'+path);
  uri.searchParams.set('api_key',TMDB_KEY);
  uri.searchParams.set('language','fr-FR');
  Object.entries(params).forEach(([k,v])=>uri.searchParams.set(k,String(v)));
  return useCache(uri.toString(),()=>jsonFetch(uri.toString()),300000);
}
function cleanId(str){return /^(tt\d{5,12}|tmdb:(?:movie|tv):\d+)$/.test(str)}
function safeExtra(part){
  const obj={}; if(!part)return obj;
  for(const chunk of part.split('&')){
    const at=chunk.indexOf('=');if(at<0)continue;
    try {obj[decodeURIComponent(chunk.slice(0,at))]=decodeURIComponent(chunk.slice(at+1));}catch{}
  }
  return obj;
}
function tmdbType(type){return type==='series'?'tv':'movie'}
function directPage(type,id){return `${WEBFLIX}/tmdb/${tmdbType(type)}/${id}`}
function preview(item,type){
  return {id:item.id,type,name:item.name||item.title||'Sans titre',poster:item.poster,background:item.background,
    description:item.description||'',releaseInfo:item.releaseInfo||item.year,genres:item.genres};
}
function tmdbPreview(item,type){
  return {id:`tmdb:${tmdbType(type)}:${item.id}`,type,name:item.title||item.name||'Sans titre',
    poster:item.poster_path?`https://image.tmdb.org/t/p/w500${item.poster_path}`:undefined,
    background:item.backdrop_path?`https://image.tmdb.org/t/p/w1280${item.backdrop_path}`:undefined,
    description:item.overview||'',releaseInfo:(item.release_date||item.first_air_date||'').slice(0,4)};
}
async function getCatalog(type,id,extra){
  const def=catalogs.find(c=>c.type===type && c.id===id);if(!def) return {metas:[]};
  const skip=Math.min(5000,Math.max(0,parseInt(extra.skip||'0',10)||0));
  const search=(extra.search||'').trim().slice(0,120);
  if(TMDB_KEY){
    const kind=tmdbType(type);
    const route=search?`/search/${kind}`:`/discover/${kind}`;
    const params={page:Math.floor(skip/20)+1,include_adult:false};
    if(search)params.query=search;
    else {params.sort_by=def.source==='imdbRating'?'vote_average.desc':'popularity.desc';
      if(def.source==='imdbRating')params['vote_count.gte']=300;
      if(def.genre)params.with_genres={Action:28,Animation:16,Comedy:35}[def.genre];}
    const data=await tmdb(route,params);
    return {metas:(data.results||[]).map(item=>tmdbPreview(item,type))};
  }
  // Cinemeta works without API keys and supplies *real* searchable catalogs.
  // Reuse its existing genres, pagination, posters and IMDb IDs.
  const bits=[];
  if(search)bits.push(`search=${encodeURIComponent(search)}`);
  else if(def.genre)bits.push(`genre=${encodeURIComponent(def.genre)}`);
  if(skip)bits.push(`skip=${skip}`);
  const path=`/catalog/${type}/${def.source}${bits.length?'/'+bits.join('&'):''}.json`;
  const result=await cinemeta(path);
  return {metas:(result.metas||[]).map(item=>preview(item,type))};
}
async function lookupTmdb(id,type){
  const match=/^tmdb:(movie|tv):(\d+)$/.exec(id);
  if(match && match[1]===tmdbType(type))return match[2];
  const imdb=/^(tt\d{5,12})/.exec(id);
  if(imdb && TMDB_KEY){
    const data=await tmdb(`/find/${imdb[1]}`,{external_source:'imdb_id'});
    return data[`${tmdbType(type)}_results`]?.[0]?.id?.toString()||null;
  }
  return null;
}
async function getMeta(type,id){
  if(!cleanId(id))return {meta:null};
  if(id.startsWith('tt')){
    const base=await cinemeta(`/meta/${type}/${id}.json`);
    if(!base.meta)return {meta:null};
    const meta={...base.meta};
    const tid=await lookupTmdb(id,type).catch(()=>null);
    if(tid)meta.links=[...(meta.links||[]),{name:'Consulter la page Webflix (disponibilité non vérifiée)',category:'Lien externe',url:directPage(type,tid)}];
    return {meta};
  }
  if(!TMDB_KEY) return {meta:null};
  const tid=await lookupTmdb(id,type);if(!tid)return {meta:null};
  const item=await tmdb(`/${tmdbType(type)}/${tid}`);
  const meta={...tmdbPreview(item,type),links:[{name:'Consulter la page Webflix (disponibilité non vérifiée)',category:'Lien externe',url:directPage(type,tid)}]};
  if(type==='series'){
    const seasons=(item.seasons||[]).filter(s=>s.season_number>0).slice(0,30);
    const data=await Promise.all(seasons.map(s=>tmdb(`/tv/${tid}/season/${s.season_number}`).catch(()=>({episodes:[]}))));
    meta.videos=data.flatMap((season,i)=>(season.episodes||[]).map(ep=>({id:`${id}:${seasons[i].season_number}:${ep.episode_number}`,title:ep.name||`Episode ${ep.episode_number}`,season:seasons[i].season_number,episode:ep.episode_number,released:ep.air_date?`${ep.air_date}T00:00:00.000Z`:undefined})));
  }
  return {meta};
}
async function getStream(type,id){
  const base=id.split(':').slice(0,3).join(':');
  const canonical=/^tt\d+/.exec(id)?.[0]||base;
  const tid=await lookupTmdb(canonical,type).catch(()=>null);
  if(!tid)return {streams:[]};
  // An external link is NOT a video stream. Users open the page in their browser.
  return {streams:[{name:'Webflix — page externe',title:'Ouvrir dans le navigateur (lecture Stremio non garantie)',externalUrl:directPage(type,tid)}]};
}
const server=http.createServer(async(req,res)=>{
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, OPTIONS'});return res.end();}
  if(req.method!=='GET')return send(res,405,{error:'Method not allowed'});
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/manifest.json')return send(res,200,manifest,3600);
  if(u.pathname==='/'||u.pathname==='/health')return send(res,200,{status:'ok',version:VERSION,source:TMDB_KEY?'TMDB':'Cinemeta',videoStreams:false,catalogs:catalogs.length});
  const m=/^\/(catalog|meta|stream)\/(movie|series)\/([^/]+?)(?:\/([^/]+))?\.json$/.exec(u.pathname);
  if(!m)return send(res,404,{error:'Not found'});
  const [,resource,type,idRaw,extraRaw]=m;
  try{
    const id=decodeURIComponent(idRaw);
    let result;
    if(resource==='catalog'){
      const extra={...safeExtra(extraRaw||''),...Object.fromEntries(u.searchParams)};
      result=await getCatalog(type,id,extra);
    }else if(resource==='meta')result=await getMeta(type,id);
    else result=await getStream(type,id);
    return send(res,200,result);
  }catch(err){
    console.error('Request failed:',resource,type,String(err.message||err));
    return send(res,200,resource==='catalog'?{metas:[]}:resource==='meta'?{meta:null}:{streams:[]},30);
  }
});
if(require.main===module)server.listen(PORT,'0.0.0.0',()=>console.log(`Webflix Companion ${VERSION} listening on port ${PORT}`));
module.exports={server,manifest,getCatalog,getMeta,getStream};
