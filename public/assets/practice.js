import { launchBattle, stepBattle } from './battle-physics.js';
import { battleFrame } from './battle-frame.js';
import { applyLaunchPull } from './ripcord.js';

const players = [
  { id: 'player', name: '你的陀螺', color: '#ff486a', parts: {blade: 0, ratchet: 0, bit: 0} },
  { id: 'opponent', name: '練習對手', color: '#37d9ff', parts: {blade: 1, ratchet: 0, bit: 1} },
];

export function practiceMatch(receive) {
  let battle, round, roundNumber = 0;

  function showPhase(phase) {
    receive({type: 'state', state: {
      phase, mode: 'brawl', players, matches: [], serverTime: Date.now(),
      championId: battle?.winnerId, round,
    }});
  }
  function sendFrame() {
    receive({type: 'frame', frame: battleFrame(battle, round.id)});
  }
  function launch(power, angle) {
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    battle = launchBattle(players, seed, {player: .5});
    applyLaunchPull(battle.tops[0], power, angle);
    round = {id: String(++roundNumber), playerIds: players.map(p => p.id),
      pulledIds: [players[0].id], startsAt: Date.now()};
    showPhase('running');
    sendFrame();
  }

  round = {id: 'ready', playerIds: players.map(p => p.id), pulledIds: []};
  showPhase('ready');
  return {
    launch,
    step() {
      if (!battle || battle.done) return;
      stepBattle(battle);
      sendFrame();
      if (battle.done) {
        round.winnerId = battle.winnerId;
        round.rankings = [battle.winnerId, ...battle.eliminated.slice().reverse()];
        showPhase('result');
      }
    },
  };
}
