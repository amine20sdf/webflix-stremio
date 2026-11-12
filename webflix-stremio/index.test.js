const test = require('node:test');
const assert = require('node:assert/strict');
const { classify, allowedMedia, unpack, mediaId, collectLinks } = require('./index');
test('URLs remain on Webflix origin', () => {
  const u = new URL('https://webflix.bio/film/test');
  assert.equal(unpack(mediaId(u)).href, u.href);
  assert.equal(classify('/film/test'), 'movie');
  assert.equal(classify('/series/test'), 'series');
});
test('video URLs require direct files', () => {
  assert.equal(allowedMedia('https://cdn.example.com/a.m3u8?token=abc'), true);
  assert.equal(allowedMedia('https://example.com/embed/1'), false);
});
test('extract movie link from server-rendered document', () => {
  const html = '<a href="/film/abc" title="Exemple">Voir</a>';
  assert.equal(collectLinks(html, 'movie', '').length, 1);
});
