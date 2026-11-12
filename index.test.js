const {test}=require('node:test');
const assert=require('node:assert/strict');
const {server,manifest,streamFromFastflux,episodeInfo,playableUrl}=require('./index');
const start=()=>new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const stop=()=>new Promise(resolve=>server.close(resolve));
test('Stremio manifest and routes',async()=>{
  await start();
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    const m=await (await fetch(`${base}/manifest.json`)).json();
    assert.equal(m.version,'0.5.0');
    assert.ok(m.catalogs.length>=8);
    const h=await (await fetch(`${base}/health`)).json();
    assert.equal(h.status,'ok');
    assert.equal(h.videoStreams,true);
    const empty=await (await fetch(`${base}/catalog/movie/unknown.json`)).json();
    assert.deepEqual(empty,{metas:[]});
    const searchResp=await (await fetch(`${base}/catalog/movie/unknown/search=matrix.json`)).json();
    assert.deepEqual(searchResp,{metas:[]});
    const streams=await (await fetch(`${base}/stream/movie/tt0000000.json`)).json();
    assert.deepEqual(streams,{streams:[]});
  } finally {await stop();}
});

test('HAR-proven Fastflux API response yields a playable MP4',()=>{
 const streams=streamFromFastflux({success:true,available:true,data:{url:'https://cdn.example.org/series/VF/test.mp4',language:'VF',quality:'Unknown'}});
 assert.equal(streams.length,1);
 assert.equal(streams[0].url,'https://cdn.example.org/series/VF/test.mp4');
 assert.deepEqual(streamFromFastflux({success:true,available:false,data:{url:'https://cdn.example.org/a.mp4'}}),[]);
 assert.deepEqual(streamFromFastflux({success:true,available:true,data:{url:'https://example.org/embed/player'}}),[]);
 assert.equal(playableUrl('javascript:alert(1)'),null);
 assert.deepEqual(episodeInfo('series','tmdb:tv:303044:1:1'),{base:'tmdb:tv:303044',season:1,episode:1});
});


test('Missing direct source never redirects to Webflix website', async()=>{
 const oldFetch=global.fetch;
 global.fetch=async(url)=>{
   if(String(url).includes('/api/fastflux')) return {ok:true,json:async()=>({success:true,available:false,data:null})};
   throw new Error('Unexpected upstream request');
 };
 try {
   const {getStream}=require('./index');
   const result=await getStream('movie','tmdb:movie:99999999');
   assert.deepEqual(result,{streams:[]});
 } finally {global.fetch=oldFetch;}
});
