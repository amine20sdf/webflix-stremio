const {test}=require('node:test');
const assert=require('node:assert/strict');
const {server,manifest,streamFromFastflux,verifyMedia}=require('./index');
test('manifest and empty catalogs',async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const base=`http://127.0.0.1:${server.address().port}`;
  const res=await (await fetch(`${base}/manifest.json`)).json();
  assert.equal(res.version,'0.6.0');assert.equal(res.catalogs.length,8);
  assert.deepEqual(await (await fetch(`${base}/catalog/movie/notreal.json`)).json(),{metas:[]});
  assert.deepEqual(await (await fetch(`${base}/stream/movie/bad.json`)).json(),{streams:[]});
  const diag=await (await fetch(`${base}/diagnostic/movie/bad.json`)).json();
  assert.equal(diag.status,'invalid_id');
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('only direct media candidate is accepted',()=>{
 assert.equal(streamFromFastflux({success:true,available:true,data:{url:'https://cdn.example.com/video.mp4'}}).length,1);
 assert.deepEqual(streamFromFastflux({success:true,available:true,data:{url:'https://webflix.bio/tmdb/movie/123'}}),[]);
});
test('reject non media and internal URLs',async()=>{
 assert.equal((await verifyMedia('https://127.0.0.1/video.mp4')).ok,false);
 assert.equal((await verifyMedia('https://webflix.bio/watch')).ok,false);
});
