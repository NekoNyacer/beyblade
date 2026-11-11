import { esc } from './net.js';

// Winner identity comes only from the authoritative result, never the surviving visual top.
export function resultMarkup(state, practice = false) {
 const players = new Map((state.players || []).map(player => [player.id, player]));
 const winner = players.get(state.championId || state.round?.winnerId);
 const champion = !!winner && !!state.championId && !practice;
 if (!winner) return '<h2>本場未有勝者</h2><p>等待主持人確認下一步</p>';
 const title = champion ? '冠軍' : '本場勝者';
 const podium = champion && state.mode === 'brawl' ? [...new Set(state.round?.rankings || [])].filter(id => id && id !== winner.id && players.has(id)).slice(0, 2) : [];
 return (champion ? '<img class="champion-trophy" src="/assets/champion-trophy.svg" alt="" width="160" height="176">' : '')
  + '<h2>' + title + '</h2><h3 class="result-name' + (Array.from(winner.name).length > 10 ? ' is-long' : '') + '">' + esc(winner.name) + '</h3>'
  + (podium.length ? '<div class="result-places">' + podium.map((id, index) => '<div><span>第 ' + (index + 2) + ' 名</span><strong>' + esc(players.get(id).name) + '</strong></div>').join('') + '</div>' : '');
}
