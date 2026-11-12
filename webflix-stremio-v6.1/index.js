'use strict';
// Webflix Companion: Stremio metadata catalogues via Cinemeta or TMDB.
// Never represents a film as watchable on Webflix without verified evidence.
const http = require('node:http');
const { URL } = require('node:url');
const PORT = Number(process.env.PORT || 7000);
const TMDB_KEY = process.env.TMDB_API_KEY || '';
const CINEMETA = 'https://v3-cinemeta.strem.io';
const WEBFLIX = 'https://webflix.bio';
const VERSION = '0.6.1';
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
  name: 'Webflix Direct — Sources vérifiées',
  description: 'Catalogues Cinemeta/TMDB et liens vidéo directs lorsqu’ils sont disponibles via Fastflux. Aucune redirection vers un site externe.',
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
  // Some Cinemeta meta payloads carry a TMDB mapping. This is best-effort;
  // IMDb-only titles may still require TMDB_API_KEY to resolve.
  if(imdb){
    const data=await cinemeta(`/meta/${type}/${imdb[1]}.json`).catch(()=>null);
    const candidate=data?.meta?.moviedb_id ?? data?.meta?.tmdb_id;
    if(/^\d+$/.test(String(candidate||'')))return String(candidate);
  }
  return null;
}
async function getMeta(type,id){
  if(!cleanId(id))return {meta:null};
  if(id.startsWith('tt')){
    const base=await cinemeta(`/meta/${type}/${id}.json`);
    if(!base.meta)return {meta:null};
    // Do not advertise Webflix webpage links as if they were video streams.
    const meta={...base.meta};
    return {meta};
  }
  if(!TMDB_KEY) return {meta:null};
  const tid=await lookupTmdb(id,type);if(!tid)return {meta:null};
  const item=await tmdb(`/${tmdbType(type)}/${tid}`);
  const meta={...tmdbPreview(item,type)};
  if(type==='series'){
    const seasons=(item.seasons||[]).filter(s=>s.season_number>0).slice(0,30);
    const data=await Promise.all(seasons.map(s=>tmdb(`/tv/${tid}/season/${s.season_number}`).catch(()=>({episodes:[]}))));
    meta.videos=data.flatMap((season,i)=>(season.episodes||[]).map(ep=>({id:`${id}:${seasons[i].season_number}:${ep.episode_number}`,title:ep.name||`Episode ${ep.episode_number}`,season:seasons[i].season_number,episode:ep.episode_number,released:ep.air_date?`${ep.air_date}T00:00:00.000Z`:undefined})));
  }
  return {meta};
}
function episodeInfo(type,id){
  if(type==='movie')return {base:id,season:null,episode:null};
  const match=/^(tt\d{5,12}|tmdb:tv:\d+):(\d+):(\d+)$/.exec(id);
  if(!match)return null;
  const season=Number(match[2]),episode=Number(match[3]);
  if(!Number.isInteger(season)||!Number.isInteger(episode)||season<0||episode<1||season>100||episode>2000)return null;
  return {base:match[1],season,episode};
}
function playableUrl(raw){
  if(typeof raw!=='string')return null;
  try{
    const url=new URL(raw);
    if(!['http:','https:'].includes(url.protocol)||!url.hostname)return null;
    if(!/\.(mp4|m3u8)(?:$)/i.test(url.pathname))return null;
    if(url.username||url.password)return null;
    return url.href;
  }catch{return null;}
}
async function queryFastflux(type,tmdbId,season,episode){
  const api=new URL(`${WEBFLIX}/api/fastflux`);
  api.searchParams.set('type',type==='series'?'episode':'movie');
  api.searchParams.set('tmdb_id',tmdbId);
  if(type==='series'){
    api.searchParams.set('season',String(season));
    api.searchParams.set('episode',String(episode));
  }
  return useCache(api.toString(),()=>jsonFetch(api.toString()),120000);
}
function streamFromFastflux(payload){
  if(payload?.success!==true||payload?.available!==true)return [];
  const data=payload.data;
  if(!data||typeof data!=='object')return [];
  const url=playableUrl(data.url);
  if(!url)return [];
  const language=typeof data.language==='string'?data.language.slice(0,24):'Non précisée';
  const quality=typeof data.quality==='string'?data.quality.slice(0,24):'Non précisée';
  return [{name:`Webflix Fastflux · ${language}`,title:`Flux direct ${quality} · disponibilité non garantie`,url}];
}
// No proxy, no ad skipping and no browser cookies are sent to third-party media hosts.
// Requests use HEAD first, then GET Range: bytes=0-0 when needed.
function safeMediaHost(raw){
 try {
  const u=new URL(raw);const host=u.hostname.toLowerCase();
  if(u.protocol!=='https:'||u.username||u.password||u.port)return false;
  if(host==='localhost'||host.endsWith('.local')||host.endsWith('.internal'))return false;
  if(/^\d+\.\d+\.\d+\.\d+$/.test(host))return false;
  if(host.includes(':'))return false;
  return host.includes('.');
 }catch{return false;}
}
async function checkMediaUrl(url, method){
 let current=url;
 for(let i=0;i<5;i++){
  if(!safeMediaHost(current))return {ok:false,status:'unsafe_target'};
  let response;
  try{response=await fetch(current,{method,redirect:'manual',signal:AbortSignal.timeout(4500),
    headers:method==='GET'?{Range:'bytes=0-0'}:{}});}
  catch{return {ok:false,status:'network_failure'};}
  const status=response.status;
  const location=response.headers.get('location');
  const mime=response.headers.get('content-type')||'';
  if(response.body)await response.body.cancel().catch(()=>{});
  if([301,302,303,307,308].includes(status)){
    if(!location)return {ok:false,status:'redirect_without_location'};
    current=new URL(location,current).href;continue;
  }
  if(method==='HEAD'&&[400,403,405,501].includes(status))return {ok:false,status:'head_not_supported'};
  if(![200,206].includes(status))return {ok:false,status:`http_${status}`};
  if(/text\/html|application\/json/i.test(mime))return {ok:false,status:'not_video'};
  // Redirect targets may use extensionless signed CDN paths. Check MIME type.
  const isMediaMime = /^(video\/|audio\/|application\/(?:vnd\.apple\.mpegurl|x-mpegurl|octet-stream))/i.test(mime);
  if(!playableUrl(current) && !isMediaMime)return {ok:false,status:'not_media_url'};
  return {ok:true,status:`http_${status}`,url:current};
 }
 return {ok:false,status:'too_many_redirects'};
}
async function verifyMedia(url){
 if(!playableUrl(url)||!safeMediaHost(url))return {ok:false,status:'invalid_url'};
 // A range GET is closer to how a player fetches video than HEAD.
 const get=await checkMediaUrl(url,'GET');
 if(get.ok)return get;
 // HEAD provides extra diagnostics but cannot prove a player can read bytes.
 return get;
}
async function resolveStreams(type,id){
 const parsed=episodeInfo(type,id);
 if(!parsed||!cleanId(parsed.base))return {streams:[],diagnostic:'invalid_id'};
 const tid=await lookupTmdb(parsed.base,type).catch(()=>null);
 if(!tid)return {streams:[],diagnostic:'tmdb_id_unavailable'};
 let payload;
 try {payload=await queryFastflux(type,tid,parsed.season,parsed.episode);}
 catch{return {streams:[],diagnostic:'fastflux_unavailable'};}
 const candidates=streamFromFastflux(payload);
 if(!candidates.length)return {streams:[],diagnostic:'no_mp4_or_hls'};
 let last='unreachable';const streams=[];
 for(const candidate of candidates){
  const check=await verifyMedia(candidate.url);
  last=check.status;
  if(check.ok)streams.push({...candidate,url:check.url,title:'HTTP accessible · lecture Stremio à confirmer'});
 }
 return {streams,diagnostic:streams.length?'reachable':last};
}
async function getStream(type,id){
 const result=await useCache(`verified:${type}:${id}`,()=>resolveStreams(type,id),45000);
 return {streams:result.streams};
}

const server=http.createServer(async(req,res)=>{
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, OPTIONS'});return res.end();}
  if(req.method!=='GET')return send(res,405,{error:'Method not allowed'});
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/manifest.json')return send(res,200,manifest,3600);
  if(u.pathname==='/'||u.pathname==='/health')return send(res,200,{status:'ok',version:VERSION,source:TMDB_KEY?'TMDB':'Cinemeta',videoStreams:true,tmdbConfigured:!!TMDB_KEY,catalogs:catalogs.length,streamProvider:"Webflix Fastflux (experimental)"});
  const diagnostic=/^\/diagnostic\/(movie|series)\/([^/]+)\.json$/.exec(u.pathname);
  if(diagnostic){
    try{
      const type=diagnostic[1],id=decodeURIComponent(diagnostic[2]);
      const result=await useCache(`verified:${type}:${id}`,()=>resolveStreams(type,id),45000);
      return send(res,200,{version:VERSION,status:result.diagnostic,streamCount:result.streams.length,tmdbConfigured:!!TMDB_KEY,hint:({tmdb_id_unavailable:'Add TMDB_API_KEY in Render when the selected title has only an IMDb ID',fastflux_unavailable:'Fastflux API did not respond successfully',no_mp4_or_hls:'Fastflux returned no supported direct video link',network_failure:'Render could not reach the media host',http_403:'The host denied the media request; a browser session may be required',not_media_url:'The redirect target did not identify as video'})[result.diagnostic]||null},30);
    }catch{return send(res,200,{version:VERSION,status:'internal_error',streamCount:0},30);}
  }
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
module.exports={server,manifest,getCatalog,getMeta,getStream,streamFromFastflux,episodeInfo,playableUrl,verifyMedia,resolveStreams};
