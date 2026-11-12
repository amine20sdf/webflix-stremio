const {test}=require('node:test');
const assert=require('node:assert/strict');
const {server,manifest}=require('./index');
const start=()=>new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const stop=()=>new Promise(resolve=>server.close(resolve));
test('Stremio manifest and routes',async()=>{
  await start();
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    const m=await (await fetch(`${base}/manifest.json`)).json();
    assert.equal(m.version,'0.3.0');
    assert.ok(m.catalogs.length>=8);
    const h=await (await fetch(`${base}/health`)).json();
    assert.equal(h.status,'ok');
    assert.equal(h.videoStreams,false);
    const empty=await (await fetch(`${base}/catalog/movie/unknown.json`)).json();
    assert.deepEqual(empty,{metas:[]});
    const searchResp=await (await fetch(`${base}/catalog/movie/unknown/search=matrix.json`)).json();
    assert.deepEqual(searchResp,{metas:[]});
    const streams=await (await fetch(`${base}/stream/movie/tt0000000.json`)).json();
    assert.deepEqual(streams,{streams:[]});
  } finally {await stop();}
});
