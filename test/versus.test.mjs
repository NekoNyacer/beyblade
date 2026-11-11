import test from 'node:test';
import assert from 'node:assert/strict';
import {versusMarkup,renderVersus} from '../public/assets/versus.js';
const players=[{id:'one',name:'小凱',parts:{blade:2,ratchet:1,bit:0}},{id:'two',name:'小藍'}];
test('shared stage and host markup keeps authoritative names and part combinations',()=>{
 const html=versusMarkup(players);
 assert.match(html,/小凱/);assert.match(html,/圓環持久/);assert.match(html,/高六凸/);assert.match(html,/寬平底/);
 assert.match(html,/預設組合/);assert.match(html,/top-210.png/);assert.match(html,/versus-blue/);
 assert.match(versusMarkup(players,'host-vs'),/id="host-vs-name-1"/);
});
test('player names are escaped and long names get bounded typography',()=>{
 const html=versusMarkup([{id:'one',name:'<script>alert(1)</script>'},players[1]]);
 assert.ok(!html.includes('<script>'));assert.match(html,/&lt;script&gt;/);assert.match(html,/long-name/);
});
test('repeated clock updates do not recreate intro or restart its entrance',()=>{
 let writes=0,html='';const panel={dataset:{},set innerHTML(value){html=value;writes++},get innerHTML(){return html}};
 renderVersus(panel,players);renderVersus(panel,players);assert.equal(writes,1);
 renderVersus(panel,[{...players[0],parts:{blade:0,ratchet:0,bit:1}},players[1]]);assert.equal(writes,2);assert.match(panel.innerHTML,/圓球底/);
});

test('blue opponent uses blue material assets without tinting neutral metal',()=>{const html=versusMarkup([{id:'r',name:'R',parts:{blade:0,ratchet:0,bit:0}},{id:'b',name:'B',parts:{blade:2,ratchet:1,bit:1}}]);assert.match(html,/top-blue-211.png/);assert.match(html,/part-blue-blade-2.png/);});
