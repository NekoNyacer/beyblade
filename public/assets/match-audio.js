import { createBattleAudio } from './battle-audio.js';
import { createLaunchAudio, launchCue as cueForPhase } from './launch-cue.js';
export function launchCue(state, now) {
  return cueForPhase(state?.phase, state?.round?.shootAt, now);
}
export function createMatchAudio() {
  const sound = createBattleAudio();
  const launchAudio = createLaunchAudio(sound);
  let lastResultRound, lastCrowdResultRound, lastCrowdLaunchRound, witnessedRound, currentRound;
  function updateClock(state, now, deferResult = false) {
    if (!state) return '';
    const round = state.round;
    if (document.hidden) {
      sound.cancelCrowd();
      sound.cancelCall();
      if (['result', 'finished'].includes(state.phase)) lastCrowdResultRound = round?.id;
      return '';
    }
    if (currentRound !== round?.id || ['lobby', 'ready'].includes(state.phase)) sound.cancelCrowd();
    currentRound = round?.id;
    launchAudio(state, now);
    if (round && ['countdown', 'shoot', 'running'].includes(state.phase)) witnessedRound = round.id;
    if (round && state.phase === 'running' && lastCrowdLaunchRound !== round.id) {
      lastCrowdLaunchRound = round.id;
      if (!round.launchResumed && now >= round.startsAt && now - round.startsAt <= 350) {
        sound.play('crowd-cheer-short', { delay: .12 });
      }
    }
    if (!deferResult && ['result', 'finished'].includes(state.phase) && round) {
      if (lastResultRound !== round.id && sound.play(state.championId ? 'victory' : 'finish')) lastResultRound = round.id;
      if (lastCrowdResultRound !== round.id) {
        lastCrowdResultRound = round.id;
        const winner = state.championId || round.winnerId;
        const validWinner = winner && (!state.players || state.players.some(player => player.id === winner));
        // Reconnects and enabling audio on an old result must not replay a celebration.
        if (witnessedRound === round.id && validWinner) {
          sound.play(state.championId ? 'crowd-cheer-medium' : 'crowd-applause', { delay: .65, interrupt: true });
        }
      }
    }
    return launchCue(state, now);
  }
  return { enable: sound.enable, play: sound.play, impact: sound.impact, updateClock };
}
