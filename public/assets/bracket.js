import { esc } from './net.js';

// Future even rounds have fixed feeds. An odd round stays a draw pool until
// all its entrants are known, so no placeholder promises an undrawn seed.
export function bracketRounds(state) {
 const matches=state.matches||[],rounds=[];
 if(!matches.length)return rounds;
 const maxStage=Math.max(...matches.map(m=>m.stage));
 for(let stage=1;stage<=maxStage;stage++){
  const previous=matches.filter(m=>m.stage===stage-1);
  const nodes=matches.filter(m=>m.stage===stage).map((m,i)=>({
   key:m.id,match:m,index:i+1,winnerId:m.winnerId,
   sources:m.sourceMatchIds??m.playerIds.map(p=>previous.find(x=>x.winnerId===p)?.id).filter(Boolean),
   slots:m.playerIds.map(p=>({playerId:p,label:''})),bye:m.playerIds.length===1
  }));
  rounds.push({stage,nodes,entrants:nodes.reduce((n,m)=>n+m.slots.length,0)});
 }
 let previous=rounds.at(-1),count=previous.nodes.length;
 while(count>1){
  const stage=previous.stage+1,nodes=[],pool=count%2===1;
  if(pool){
   nodes.push({key:'draw-'+stage,pool:true,sources:previous.nodes.map(m=>m.key),slots:previous.nodes.length===count?previous.nodes.map(m=>({playerId:m.winnerId||null,label:'第 '+previous.stage+' 輪第 '+m.index+' 場勝者'})):Array.from({length:count},()=>({playerId:null,label:'前輪晉級選手'}))});
  }else{
   for(let i=0;i<count;i+=2){
    const feeds=previous.nodes.length===count?previous.nodes.slice(i,i+2):previous.nodes;
    nodes.push({key:'pending-'+stage+'-'+i,index:i/2+1,sources:feeds.map(m=>m.key),slots:[0,1].map(k=>({playerId:feeds[k]?.winnerId||null,label:feeds[k]?.index?'第 '+previous.stage+' 輪第 '+feeds[k].index+' 場勝者':'前輪晉級選手'}))});
   }
  }
  previous={stage,nodes,entrants:count,pending:true};rounds.push(previous);count=Math.ceil(count/2);
 }
 const final=rounds.at(-1).nodes[0];
 rounds.push({stage:rounds.length+1,champion:true,nodes:[{key:'champion',sources:[final.key],slots:[{playerId:state.championId||null,label:'冠軍待定'}],champion:true}]});
 return rounds;
}

const mounted=new WeakMap();
export function renderBracket(container,state){
 const signature=JSON.stringify([state.matches,state.players.map(p=>[p.id,p.name]),state.round?.matchId,state.phase,state.championId]);
 let instance=mounted.get(container);
 if(instance?.signature===signature)return;
 if(!instance){
  instance={signature:null,raf:0};
  instance.observer=new ResizeObserver(()=>{cancelAnimationFrame(instance.raf);instance.raf=requestAnimationFrame(()=>connectors(container));});
  instance.observer.observe(container);mounted.set(container,instance);
 }
 instance.signature=signature;
 const rounds=bracketRounds(state),players=new Map(state.players.map(p=>[p.id,p]));
 if(!rounds.length){instance.signature=null;container.innerHTML='<p class="empty">選手到齊後按「準備本場」，自動抽出對戰。每輪奇數人時，隨機抽出一位種子選手輪空。</p>';return;}
 const played=state.matches.filter(m=>m.playerIds.length===2&&m.winnerId).length;
 const current=state.matches.find(m=>m.id===state.round?.matchId);
 container.innerHTML=`<p class="bracket-summary" role="status">${esc(state.championId?'賽事已完成':current&&!current.winnerId?'目前：第 '+current.stage+' 輪第 '+(rounds[current.stage-1].nodes.findIndex(n=>n.key===current.id)+1)+' 場':'本場結果已更新，勝者自動晉級')}<span>已完成 ${played} / ${state.players.length-1} 場</span></p><div class="bracket-viewport" tabindex="0" role="region" aria-label="淘汰賽樹狀賽程，可左右捲動"><div class="bracket-tree" style="--bracket-columns:${rounds.length}"><svg class="bracket-links" aria-hidden="true"></svg>${rounds.map(r=>`<section class="bracket-round${r.champion?' champion-round':''}" aria-label="${r.champion?'冠軍':'第 '+r.stage+' 輪'}"><h3>${r.champion?'冠軍':r.entrants===2?'冠軍賽':r.entrants<=4?'準決賽':'第 '+r.stage+' 輪'}</h3><div class="bracket-nodes">${r.nodes.map(n=>{
  if(n.champion){
   const champion=players.get(state.championId);
   return `<article class="bracket-match match is-champion${champion?' has-winner':' is-pending'}" data-bracket-node="champion" data-bracket-sources="${esc(JSON.stringify(n.sources))}"><img class="bracket-trophy" src="/assets/champion-trophy.svg" alt="" width="160" height="176"><div class="bracket-player${champion?' winner':' is-pending'}"><span class="bracket-name">${esc(champion?.name||'等待決賽勝者')}</span></div></article>`;
  }
  const active=n.match?.id===state.round?.matchId&&!n.winnerId;
  const status=n.pool?'前輪結束後抽籤':n.bye?'種子選手 · 輪空晉級':n.match?(n.winnerId?'已完賽':active?(['running','countdown','shoot'].includes(state.phase)?'比賽進行中':'本場準備中'):'待開賽'):'等待晉級';
  return `<article class="bracket-match match${active?' is-current':''}${n.pool?' is-draw':''}" data-bracket-node="${esc(n.key)}" data-bracket-sources="${esc(JSON.stringify(n.sources))}" ${n.match?'data-match-id="'+esc(n.match.id)+'"':''} ${active?'aria-current="step"':''}><div class="bracket-match-heading"><span>${n.pool?r.entrants+' 人 · '+Math.floor(r.entrants/2)+' 場 · 1 人輪空':'第 '+r.stage+' 輪 · '+n.index+' 場'}</span><span>${status}</span></div>${n.slots.map(slot=>{
   const p=players.get(slot.playerId),winner=!!p&&(n.winnerId===p.id);
   return `<div class="bracket-player${winner?' winner':''}${!p?' is-pending':''}"><span class="bracket-name">${esc(p?.name||slot.label||'待定')}</span>${winner?'<span class="bracket-outcome">'+(r.entrants===2?'勝出':'晉級')+'</span>':n.pool&&p?'<span class="bracket-outcome">已晉級</span>':''}</div>`;
  }).join('')}</article>`;
 }).join('')}</div></section>`).join('')}</div></div><p class="bracket-note">勝者依主機比賽結果自動晉級；奇數人時，從輪空次數最少的選手中隨機抽出一位種子選手。</p>`;
 cancelAnimationFrame(instance.raf);instance.raf=requestAnimationFrame(()=>connectors(container));
}

function connectors(container){
 const tree=container.querySelector('.bracket-tree'),svg=container.querySelector('.bracket-links');
 if(!tree||!svg||!tree.getBoundingClientRect().width)return;
 const box=tree.getBoundingClientRect(),nodes=new Map([...tree.querySelectorAll('[data-bracket-node]')].map(el=>[el.dataset.bracketNode,el]));
 svg.replaceChildren();svg.setAttribute('width',String(tree.scrollWidth));svg.setAttribute('height',String(tree.scrollHeight));
 for(const node of nodes.values()){
  const to=node.getBoundingClientRect();
  for(const key of JSON.parse(node.dataset.bracketSources)){
   const source=nodes.get(key);if(!source)continue;
   const from=source.getBoundingClientRect(),x1=from.right-box.left,x2=to.left-box.left,y1=from.top+from.height/2-box.top,y2=to.top+to.height/2-box.top;
   const path=document.createElementNS('http://www.w3.org/2000/svg','path');
   path.setAttribute('d',`M ${x1} ${y1} H ${(x1+x2)/2} V ${y2} H ${x2}`);svg.append(path);
  }
 }
}
