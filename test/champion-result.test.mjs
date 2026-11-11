import test from 'node:test';
import assert from 'node:assert/strict';
import { resultMarkup } from '../public/assets/champion-result.js';
const players = [{id:'a',name:'甲 <測試> & 01'},{id:'b',name:'乙'},{id:'c',name:'丙'}];
const result = {mode:'brawl',players,championId:'a',round:{winnerId:'a',rankings:['a','b','c']}};
test('champion has one title, escaped identity and authoritative places',()=>{
 const html=resultMarkup(result);
 assert.match(html,/champion-trophy/);assert.match(html,/甲 &lt;測試&gt; &amp; 01/);
 assert.equal((html.match(/冠軍/g)||[]).length,1);assert.match(html,/第 2 名/);assert.match(html,/第 3 名/);
 assert.doesNotMatch(html,/晉級下一輪|把掌聲/);
});
test('round and practice winners never claim an event championship',()=>{
 for(const html of [resultMarkup({...result,championId:null,mode:'tournament'}),resultMarkup(result,true)]){
  assert.match(html,/本場勝者/);assert.doesNotMatch(html,/champion-trophy|冠軍|第 2 名/);
 }
});
test('missing and unknown winners are explicit, not a fabricated champion',()=>{
 for(const state of [{players,round:null},{...result,championId:null,round:{}},{...result,championId:'missing'}]){
  const html=resultMarkup(state);assert.match(html,/本場未有勝者/);assert.doesNotMatch(html,/champion-trophy|冠軍|待定/);
 }
});
test('ranking duplicates and unknown IDs do not create spurious podium places',()=>{
 const html=resultMarkup({...result,round:{rankings:['a','a','b','b','missing','c']}});
 assert.equal((html.match(/第 2 名/g)||[]).length,1);assert.equal((html.match(/第 3 名/g)||[]).length,1);
 assert.doesNotMatch(html,/待定|missing/);
});
test('long winner names use a wrap-friendly compact treatment',()=>{
 assert.match(resultMarkup({...result,players:[{id:'a',name:'這是一位名字很長很長的二十字冠軍選手'}]}),/is-long/);
});
