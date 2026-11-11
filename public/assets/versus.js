import { esc } from './net.js';
import { partDefinition } from './part-catalog.js';
export const assemblyArtPath=(parts={},tone='red')=>'/assets/art/top-'+(tone==='blue'?'blue-':'')+(parts.blade??0)+(parts.ratchet??0)+(parts.bit??0)+'.png';

export function versusMarkup(players, prefix = 'vs') {
 return '<div class="versus-brand">SPINNING-TOP BATTLE<span>戰鬥陀螺對決</span></div>' + players.slice(0,2).map((player,i)=>{
  const parts=player.parts||{blade:0,ratchet:0,bit:0};
  const tone=i?'blue':'red';
  const tiles=[['blade','Blade','攻擊環'],['ratchet','Ratchet','棘輪'],['bit','Bit','軸心']].map(([key,label,zh])=>'<div class="versus-part"><img src="/assets/art/part-'+(tone==='blue'?'blue-':'')+key+'-'+parts[key]+'.png" alt=""><div><span>'+zh+'</span><strong>'+partDefinition(key,parts[key]).name+'</strong></div></div>').join('');
  return '<div class="versus-side versus-'+tone+'"><div class="versus-name"><span>P'+(i+1)+'</span><strong id="'+prefix+'-name-'+(i+1)+'" class="'+(player.name.length>8?'long-name':'')+'">'+esc(player.name)+'</strong></div><div class="versus-top"><img src="'+assemblyArtPath(parts,tone)+'" alt="" width="1024" height="1024"></div><div class="versus-parts" id="'+prefix+'-parts-'+(i+1)+'"><div class="versus-parts-heading">'+(player.parts?'零件組合':'預設組合')+'<span>PART COMBINATION</span></div><div class="versus-part-grid">'+tiles+'</div></div></div>';
 }).join('')+'<div class="versus-mark" aria-hidden="true">VS</div><small class="versus-art-note">實際零件組合 · 紅藍為對戰識別色</small>';
}

export function renderVersus(panel, players, prefix = 'vs') {
 const key=JSON.stringify(players.map(p=>[p.id,p.name,p.parts]));
 if(panel.dataset.matchKey!==key){panel.innerHTML=versusMarkup(players,prefix);panel.dataset.matchKey=key;}
}
